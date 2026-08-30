import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { CAPTURE_EXTENSION_ORIGIN } from "@/lib/extension/identity";
import {
  CAPTURE_CONNECTION_CHALLENGE_TTL_MS,
  CaptureConnectionChallengeError,
  completeCaptureConnectionChallenge,
  createCaptureConnectionChallenge,
  readCaptureConnectionState,
  resetCaptureConnectionChallengesForTests,
} from "@/lib/services/captureConnectionChallenge";
import {
  CaptureCapabilityAuthenticationError,
  authorizeLocalCaptureCapability,
} from "@/lib/vault/captureInstallation";

const INSTALLATION_ID = "installation_99999999-9999-4999-8999-999999999999";
const CAPABILITY = `capture_${"R".repeat(43)}`;

describe("Route H connection routes", () => {
  let configDirectory = "";

  beforeEach(() => {
    configDirectory = mkdtempSync(join(tmpdir(), "capture-connect-routes-"));
    process.env.TRAINING_VAULT_CONFIG_DIR = configDirectory;
    resetCaptureConnectionChallengesForTests();
  });

  afterEach(() => {
    delete process.env.TRAINING_VAULT_CONFIG_DIR;
    resetCaptureConnectionChallengesForTests();
    rmSync(configDirectory, { recursive: true, force: true });
  });

  it("connects once, exposes no secret, and authenticates fixed health", async () => {
    const challenges = await import("@/app/api/capture/connect/challenges/route");
    const complete = await import("@/app/api/capture/connect/complete/route");
    const connectionStatus = await import("@/app/api/capture/connect/status/route");
    const captureStatus = await import("@/app/api/capture/status/route");

    const challengeResponse = await challenges.POST(sameOriginRequest(
      "/api/capture/connect/challenges",
      {},
    ));
    const challenge: unknown = await challengeResponse.json();
    expect(challengeResponse.status).toBe(200);
    if (!isChallenge(challenge)) throw new Error("Challenge response was invalid");

    const completionBody = {
      schemaVersion: 1,
      challengeId: challenge.challengeId,
      nonce: challenge.nonce,
      installationId: INSTALLATION_ID,
      capability: CAPABILITY,
    };
    const completionResponse = await complete.POST(extensionRequest(
      "/api/capture/connect/complete",
      completionBody,
    ));
    expect(completionResponse.status).toBe(201);
    expect(await completionResponse.json()).toEqual({ ok: true, credentialVersion: 1 });

    const pollResponse = await connectionStatus.POST(sameOriginRequest(
      "/api/capture/connect/status",
      { challengeId: challenge.challengeId, nonce: challenge.nonce },
    ));
    expect(await pollResponse.json()).toEqual({ state: "connected" });

    const healthResponse = await captureStatus.GET(new Request(
      "http://localhost:3000/api/capture/status",
      {
        headers: {
          authorization: `Bearer ${CAPABILITY}`,
          origin: CAPTURE_EXTENSION_ORIGIN,
        },
      },
    ));
    expect(await healthResponse.json()).toEqual({
      schemaVersion: 1,
      connection: "connected",
      service: "ready",
    });

    const configText = readFileSync(join(configDirectory, "capture-installation.json"), "utf8");
    expect(configText).not.toContain(CAPABILITY);
    expect(JSON.stringify(challenge)).not.toContain(CAPABILITY);
  });

  it("accepts authenticated fixed health without an Origin header", async () => {
    const captureStatus = await connectCaptureInstallation();
    const response = await captureStatus.GET(new Request(
      "http://localhost:3000/api/capture/status",
      { headers: { authorization: `Bearer ${CAPABILITY}` } },
    ));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      schemaVersion: 1,
      connection: "connected",
      service: "ready",
    });
  });

  it("rejects authenticated fixed health with an explicit hostile Origin", async () => {
    const captureStatus = await connectCaptureInstallation();
    const response = await captureStatus.GET(new Request(
      "http://localhost:3000/api/capture/status",
      {
        headers: {
          authorization: `Bearer ${CAPABILITY}`,
          origin: "https://example.com",
        },
      },
    ));

    expect(response.status).toBe(403);
  });

  it("rejects wrong origin and replay without rotating the installation", async () => {
    const challenges = await import("@/app/api/capture/connect/challenges/route");
    const complete = await import("@/app/api/capture/connect/complete/route");
    const challengeResponse = await challenges.POST(sameOriginRequest(
      "/api/capture/connect/challenges",
      {},
    ));
    const challenge: unknown = await challengeResponse.json();
    if (!isChallenge(challenge)) throw new Error("Challenge response was invalid");
    const body = {
      schemaVersion: 1,
      challengeId: challenge.challengeId,
      nonce: challenge.nonce,
      installationId: INSTALLATION_ID,
      capability: CAPABILITY,
    };

    const wrongOrigin = await complete.POST(new Request(
      "http://localhost:3000/api/capture/connect/complete",
      {
        method: "POST",
        headers: { "content-type": "application/json", origin: "https://example.com" },
        body: JSON.stringify(body),
      },
    ));
    expect(wrongOrigin.status).toBe(403);
    expect(readCaptureConnectionState(challenge)).toBe("pending");

    expect((await complete.POST(extensionRequest(
      "/api/capture/connect/complete",
      body,
    ))).status).toBe(201);
    expect((await complete.POST(extensionRequest(
      "/api/capture/connect/complete",
      body,
    ))).status).toBe(409);
    expect(authorizeLocalCaptureCapability(CAPABILITY, configDirectory).credentialVersion).toBe(1);
  });

  it("expires at 60 seconds and rejects a competing consumer", () => {
    const created = createCaptureConnectionChallenge(1_000);
    expect(readCaptureConnectionState(created, 1_000 + CAPTURE_CONNECTION_CHALLENGE_TTL_MS))
      .toBe("expired");
    expect(() => completeCaptureConnectionChallenge(
      created,
      () => true,
      1_000 + CAPTURE_CONNECTION_CHALLENGE_TTL_MS,
    )).toThrow(CaptureConnectionChallengeError);

    const competing = createCaptureConnectionChallenge(2_000);
    expect(completeCaptureConnectionChallenge(competing, () => {
      expect(() => completeCaptureConnectionChallenge(competing, () => true, 2_001))
        .toThrow(CaptureConnectionChallengeError);
      return "first";
    }, 2_001)).toBe("first");
  });

  it("invalidates an old bearer after a second successful connection", async () => {
    const challenges = await import("@/app/api/capture/connect/challenges/route");
    const complete = await import("@/app/api/capture/connect/complete/route");
    const first = await createThroughRoute(challenges.POST);
    await complete.POST(extensionRequest("/api/capture/connect/complete", {
      schemaVersion: 1,
      ...first,
      installationId: INSTALLATION_ID,
      capability: CAPABILITY,
    }));
    const nextCapability = `capture_${"S".repeat(43)}`;
    const second = await createThroughRoute(challenges.POST);
    await complete.POST(extensionRequest("/api/capture/connect/complete", {
      schemaVersion: 1,
      ...second,
      installationId: INSTALLATION_ID,
      capability: nextCapability,
    }));

    expect(() => authorizeLocalCaptureCapability(CAPABILITY, configDirectory))
      .toThrow(CaptureCapabilityAuthenticationError);
    expect(authorizeLocalCaptureCapability(nextCapability, configDirectory).credentialVersion)
      .toBe(2);
  });
});

function sameOriginRequest(pathname: string, body: unknown): Request {
  return new Request(`http://localhost:3000${pathname}`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: "http://localhost:3000" },
    body: JSON.stringify(body),
  });
}

function extensionRequest(pathname: string, body: unknown): Request {
  return new Request(`http://localhost:3000${pathname}`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: CAPTURE_EXTENSION_ORIGIN },
    body: JSON.stringify(body),
  });
}

function isChallenge(value: unknown): value is {
  readonly challengeId: string;
  readonly nonce: string;
  readonly expiresAt: string;
} {
  return typeof value === "object" && value !== null
    && typeof Reflect.get(value, "challengeId") === "string"
    && typeof Reflect.get(value, "nonce") === "string"
    && typeof Reflect.get(value, "expiresAt") === "string";
}

async function createThroughRoute(
  post: (request: Request) => Promise<Response>,
): Promise<{ readonly challengeId: string; readonly nonce: string }> {
  const response = await post(sameOriginRequest("/api/capture/connect/challenges", {}));
  const value: unknown = await response.json();
  if (!isChallenge(value)) throw new Error("Challenge response was invalid");
  return { challengeId: value.challengeId, nonce: value.nonce };
}

async function connectCaptureInstallation() {
  const challenges = await import("@/app/api/capture/connect/challenges/route");
  const complete = await import("@/app/api/capture/connect/complete/route");
  const challenge = await createThroughRoute(challenges.POST);
  const response = await complete.POST(extensionRequest("/api/capture/connect/complete", {
    schemaVersion: 1,
    ...challenge,
    installationId: INSTALLATION_ID,
    capability: CAPABILITY,
  }));
  expect(response.status).toBe(201);
  return import("@/app/api/capture/status/route");
}
