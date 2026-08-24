import { describe, expect, it, vi } from "vitest";

import {
  completeLocalCaptureConnection,
  createExtensionCaptureCapability,
  probeLocalCaptureConnection,
  readCaptureConnectionStatus,
  readExternalCaptureConnectionRequest,
} from "@/extension/src/localConnection";

const request = {
  schemaVersion: 1 as const,
  type: "capture.install.connect" as const,
  challengeId: "challenge_77777777-7777-4777-8777-777777777777",
  nonce: "N".repeat(43),
};

describe("Route H extension-local connection", () => {
  it("admits only the exact settings sender and closed message", () => {
    expect(readExternalCaptureConnectionRequest(
      request,
      "http://localhost:3000/settings",
    )).toEqual(request);
    expect(readExternalCaptureConnectionRequest(
      request,
      "http://localhost:3000/settings/",
    )).toBeUndefined();
    expect(readExternalCaptureConnectionRequest(
      { ...request, extra: true },
      "http://localhost:3000/settings",
    )).toBeUndefined();
  });

  it("generates an exact 256-bit capability without a page-visible return path", () => {
    const capability = createExtensionCaptureCapability((bytes) => {
      bytes.fill(0xff);
      return bytes;
    });
    expect(capability).toMatch(/^capture_[A-Za-z0-9_-]{43}$/u);
    expect(capability).toBe(`capture_${"_".repeat(42)}8`);
  });

  it("posts the capability directly and accepts only the fixed completion response", async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({
      ok: true,
      credentialVersion: 2,
    }), { status: 201, headers: { "content-type": "application/json" } }));
    const capability = `capture_${"C".repeat(43)}`;
    await expect(completeLocalCaptureConnection({
      request,
      installationId: "installation_88888888-8888-4888-8888-888888888888",
      capability,
      fetchImpl,
    })).resolves.toEqual({ credentialVersion: 2 });
    expect(fetchImpl).toHaveBeenCalledWith(
      "http://localhost:3000/api/capture/connect/complete",
      expect.objectContaining({ body: expect.stringContaining(capability) }),
    );
  });

  it("projects status into the four closed connection states", async () => {
    const capability = `capture_${"D".repeat(43)}`;
    const healthy = vi.fn(async () => new Response(JSON.stringify({
      schemaVersion: 1,
      connection: "connected",
      service: "ready",
    }), { status: 200, headers: { "content-type": "application/json" } }));
    const rejected = vi.fn(async () => new Response("", { status: 401 }));
    const offline = vi.fn(async () => { throw new Error("private detail"); });

    await expect(probeLocalCaptureConnection(capability, healthy)).resolves.toBe("connected");
    await expect(probeLocalCaptureConnection(capability, rejected))
      .resolves.toBe("capability_rejected");
    await expect(probeLocalCaptureConnection(capability, offline))
      .resolves.toBe("service_unreachable");
    expect(readCaptureConnectionStatus("connected", false)).toBe("connection_required");
  });
});
