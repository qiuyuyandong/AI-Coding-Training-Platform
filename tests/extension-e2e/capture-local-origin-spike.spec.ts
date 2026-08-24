import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import {
  copyFileSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { chromium, expect, test, type BrowserContext, type Worker } from "@playwright/test";

import identity from "../../extension/identity.json";
import { isExactCaptureExtensionOrigin } from "../../lib/http/extensionOrigin";

const PROBE_HOST = "127.0.0.1";
const PROBE_PORT = 3000;
const PROBE_BASE_URL = `http://localhost:${PROBE_PORT}`;
const PRODUCTION_DIST = resolve(process.cwd(), "extension", "dist");

interface ProbeObservation {
  readonly method: string;
  readonly path: string;
  readonly origin: string | null;
  readonly accessControlRequestMethod: string | null;
  readonly accessControlRequestHeaders: string | null;
}

interface ProbeFixture {
  readonly server: Server;
  readonly observations: ProbeObservation[];
}

test("fixed manifest key preserves ID and exact Origin across fresh, restart, and reload lifecycles", async () => {
  const tempRoot = mkdtempSync(join(tmpdir(), "capture-local-origin-spike-"));
  const spikeDist = join(tempRoot, "dist");
  const profileOne = join(tempRoot, "profile-one");
  const profileTwo = join(tempRoot, "profile-two");
  copyProductionDist(spikeDist);
  injectManifestKey(spikeDist);

  const probe = await startProbe();
  let firstContext: BrowserContext | undefined;
  let restartedContext: BrowserContext | undefined;
  let secondContext: BrowserContext | undefined;
  try {
    firstContext = await launchWithExtension(profileOne, spikeDist);
    const firstWorker = await resolveWorker(firstContext);
    await expectWorkerIdentityAndProbe(firstWorker, "fresh-profile-one");
    await firstContext.close();
    firstContext = undefined;

    restartedContext = await launchWithExtension(profileOne, spikeDist);
    const restartedWorker = await resolveWorker(restartedContext);
    await expectWorkerIdentityAndProbe(restartedWorker, "profile-one-restart");

    const reloadedWorkerPromise = restartedContext.waitForEvent("serviceworker", { timeout: 15_000 });
    await restartedWorker.evaluate(() => chrome.runtime.reload()).catch((error: unknown) => {
      if (!(error instanceof Error) || !/closed|destroyed|Target page/u.test(error.message)) throw error;
    });
    const reloadedWorker = await reloadedWorkerPromise;
    await expectWorkerIdentityAndProbe(reloadedWorker, "profile-one-reload");
    await restartedContext.close();
    restartedContext = undefined;

    secondContext = await launchWithExtension(profileTwo, spikeDist);
    const secondWorker = await resolveWorker(secondContext);
    await expectWorkerIdentityAndProbe(secondWorker, "fresh-profile-two");

    const lifecyclePaths = new Set(
      probe.observations
        .filter((observation) => observation.method !== "OPTIONS")
        .map((observation) => observation.path),
    );
    for (const lifecycle of [
      "fresh-profile-one",
      "profile-one-restart",
      "profile-one-reload",
      "fresh-profile-two",
    ]) {
      expect(lifecyclePaths.has(`/__origin-spike__/${lifecycle}/get`)).toBe(true);
      expect(lifecyclePaths.has(`/__origin-spike__/${lifecycle}/post`)).toBe(true);
    }

    for (const observation of probe.observations) {
      expect(observation.origin).toBe(identity.origin);
      if (observation.method === "OPTIONS") {
        expect(observation.accessControlRequestMethod).toBe("POST");
        expect(observation.accessControlRequestHeaders?.toLowerCase()).toContain("content-type");
      }
    }

    await expectRejectedOrigins();
  } finally {
    await firstContext?.close();
    await restartedContext?.close();
    await secondContext?.close();
    await closeServer(probe.server);
    rmSync(tempRoot, { recursive: true, force: true });
  }
});

function injectManifestKey(spikeDist: string): void {
  const manifestPath = join(spikeDist, "manifest.json");
  const parsed: unknown = JSON.parse(readFileSync(manifestPath, "utf8"));
  if (!isRecord(parsed)) throw new Error("Production extension manifest must be an object");
  const manifest = { ...parsed, key: identity.manifestKey };
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
}

function copyProductionDist(spikeDist: string): void {
  mkdirSync(spikeDist);
  for (const name of readdirSync(PRODUCTION_DIST)) {
    copyFileSync(join(PRODUCTION_DIST, name), join(spikeDist, name));
  }
}

async function launchWithExtension(profile: string, extensionPath: string): Promise<BrowserContext> {
  mkdirSync(profile, { recursive: true });
  return chromium.launchPersistentContext(profile, {
    channel: "chromium",
    headless: true,
    args: [
      `--disable-extensions-except=${extensionPath}`,
      `--load-extension=${extensionPath}`,
      "--disable-features=ExtensionDisableUnsupportedDeveloper",
      "--no-proxy-server",
      "--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE localhost, EXCLUDE 127.0.0.1",
    ],
  });
}

async function resolveWorker(context: BrowserContext): Promise<Worker> {
  const existing = context.serviceWorkers()[0];
  if (existing !== undefined) return existing;
  return context.waitForEvent("serviceworker", { timeout: 15_000 });
}

async function expectWorkerIdentityAndProbe(worker: Worker, lifecycle: string): Promise<void> {
  expect(new URL(worker.url()).host).toBe(identity.extensionId);
  const result = await worker.evaluate(async ({ baseUrl, lifecycleName }) => {
    const getResponse = await fetch(`${baseUrl}/__origin-spike__/${lifecycleName}/get`);
    const postResponse = await fetch(`${baseUrl}/__origin-spike__/${lifecycleName}/post`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ probe: true }),
    });
    return {
      runtimeId: chrome.runtime.id,
      getStatus: getResponse.status,
      postStatus: postResponse.status,
    };
  }, { baseUrl: PROBE_BASE_URL, lifecycleName: lifecycle });
  expect(result).toEqual({
    runtimeId: identity.extensionId,
    getStatus: 200,
    postStatus: 200,
  });
}

async function startProbe(): Promise<ProbeFixture> {
  const observations: ProbeObservation[] = [];
  const server = createServer((request, response) => {
    handleProbeRequest(request, response, observations);
  });
  await new Promise<void>((resolveListen, rejectListen) => {
    const onError = (error: Error): void => rejectListen(error);
    server.once("error", onError);
    server.listen(PROBE_PORT, PROBE_HOST, () => {
      server.off("error", onError);
      resolveListen();
    });
  });
  return { server, observations };
}

function handleProbeRequest(
  request: IncomingMessage,
  response: ServerResponse,
  observations: ProbeObservation[],
): void {
  const origin = readSingleHeader(request.headers.origin);
  const method = request.method ?? "";
  const path = new URL(request.url ?? "/", `http://${PROBE_HOST}:${PROBE_PORT}`).pathname;
  const isLifecycleProbe = path.startsWith("/__origin-spike__/");
  if (isLifecycleProbe) {
    observations.push({
      method,
      path,
      origin,
      accessControlRequestMethod: readSingleHeader(request.headers["access-control-request-method"]),
      accessControlRequestHeaders: readSingleHeader(request.headers["access-control-request-headers"]),
    });
  }
  if (!isExactCaptureExtensionOrigin(origin)) {
    response.writeHead(403, { "Content-Type": "application/json" });
    response.end('{"error":"extension_identity_rejected"}');
    return;
  }
  if (method === "OPTIONS") {
    response.writeHead(204, {
      "Access-Control-Allow-Origin": identity.origin,
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      Vary: "Origin",
    });
    response.end();
    return;
  }
  response.writeHead(200, {
    "Access-Control-Allow-Origin": identity.origin,
    "Content-Type": "application/json",
    Vary: "Origin",
  });
  response.end('{"ready":true}');
}

async function expectRejectedOrigins(): Promise<void> {
  const rejectedOrigins: ReadonlyArray<string | null> = [
    null,
    "null",
    "https://example.com",
    "http://localhost:3000",
    "chrome-extension://aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    "chrome-extension://oldmkbngfokmhlkjmlichccmbebipmej",
    "not an origin",
  ];
  for (const origin of rejectedOrigins) {
    const headers = origin === null ? undefined : { Origin: origin };
    const response = await fetch(`http://${PROBE_HOST}:${PROBE_PORT}/policy-rejection`, { headers });
    expect(response.status).toBe(403);
    expect(response.headers.get("access-control-allow-origin")).toBeNull();
  }
}

function readSingleHeader(value: string | string[] | undefined): string | null {
  return typeof value === "string" ? value : null;
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function closeServer(server: Server): Promise<void> {
  if (!server.listening) return;
  await new Promise<void>((resolveClose, rejectClose) => {
    server.close((error) => {
      if (error === undefined) resolveClose();
      else rejectClose(error);
    });
  });
}
