// @vitest-environment node

import { createServer, type Server } from "node:http";
import type { Socket } from "node:net";
import { afterEach, describe, expect, it } from "vitest";
import { WebSocket, WebSocketServer } from "ws";
import { createNativeCdpRelay } from "../../scripts/cdp-native-relay.mjs";

const servers: Server[] = [];
const relays: Array<{ readonly close: () => Promise<void> }> = [];
const sockets: WebSocket[] = [];

afterEach(async () => {
  for (const socket of sockets.splice(0)) socket.terminate();
  for (const relay of relays.splice(0)) await relay.close();
  for (const server of servers.splice(0)) await new Promise<void>((resolve) => server.close(() => resolve()));
});

describe("native CDP relay", () => {
  it("rejects non-loopback or non-browser upstream endpoints", async () => {
    await expect(createNativeCdpRelay({
      upstreamEndpoint: "ws://example.test:9222/devtools/browser/1234567890abcdef",
    })).rejects.toThrow("relay_upstream_rejected");
  });

  it("forwards both directions without logging payloads and rejects a second client", async () => {
    const secretPayload = "private-cdp-payload";
    const upstream = await startWebSocketServer((socket) => {
      socket.on("message", (data) => socket.send(`echo:${data.toString("utf8")}`));
    });
    const logs: string[] = [];
    const relay = await createNativeCdpRelay({ upstreamEndpoint: upstream.endpoint, onLog: (code) => logs.push(code) });
    relays.push(relay);
    const first = await connect(relay.endpoint);
    sockets.push(first);
    first.send(secretPayload);
    await expect(nextMessage(first)).resolves.toBe(`echo:${secretPayload}`);

    const second = new WebSocket(relay.endpoint);
    sockets.push(second);
    await expect(new Promise<number>((resolve, reject) => {
      second.once("unexpected-response", (_request, response) => resolve(response.statusCode ?? 0));
      second.once("open", () => reject(new Error("second relay client unexpectedly connected")));
      second.once("error", () => undefined);
    })).resolves.toBe(409);
    expect(logs).toContain("relay_connected");
    expect(logs.join(" ")).not.toContain(secretPayload);
  });

  it("closes oversized input with a bounded error and never forwards it", async () => {
    let upstreamMessages = 0;
    const upstream = await startWebSocketServer((socket) => socket.on("message", () => { upstreamMessages += 1; }));
    const logs: string[] = [];
    const relay = await createNativeCdpRelay({ upstreamEndpoint: upstream.endpoint, maxFrameBytes: 64, onLog: (code) => logs.push(code) });
    relays.push(relay);
    const client = await connect(relay.endpoint);
    sockets.push(client);
    client.send("x".repeat(65));
    await onceClosed(client);
    expect(upstreamMessages).toBe(0);
    expect(logs).toContain("relay_client_error");
  });

  it("times out a stalled upstream handshake", async () => {
    const server = createServer();
    const rawSockets: Socket[] = [];
    servers.push(server);
    server.on("connection", (socket) => rawSockets.push(socket));
    server.on("upgrade", () => undefined);
    await listen(server);
    const address = server.address();
    if (typeof address !== "object" || address === null) throw new Error("test server did not bind");
    const logs: string[] = [];
    const relay = await createNativeCdpRelay({
      upstreamEndpoint: `ws://127.0.0.1:${address.port}/devtools/browser/1234567890abcdef`,
      handshakeTimeoutMs: 100,
      onLog: (code) => logs.push(code),
    });
    relays.push(relay);
    const client = await connect(relay.endpoint);
    sockets.push(client);
    await onceClosed(client);
    expect(logs).toContain("relay_upstream_handshake_timeout");
    for (const socket of rawSockets) socket.destroy();
  });
});

async function startWebSocketServer(onConnection: (socket: WebSocket) => void): Promise<{ readonly endpoint: string }> {
  const server = createServer();
  servers.push(server);
  const wss = new WebSocketServer({ noServer: true });
  server.on("upgrade", (request, socket, head) => wss.handleUpgrade(request, socket, head, (client) => onConnection(client)));
  await listen(server);
  const address = server.address();
  if (typeof address !== "object" || address === null) throw new Error("test server did not bind");
  return { endpoint: `ws://127.0.0.1:${address.port}/devtools/browser/1234567890abcdef` };
}

async function listen(server: Server): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => resolve());
  });
}

async function connect(endpoint: string): Promise<WebSocket> {
  const socket = new WebSocket(endpoint);
  await new Promise<void>((resolve, reject) => {
    socket.once("open", () => resolve());
    socket.once("error", reject);
  });
  return socket;
}

async function nextMessage(socket: WebSocket): Promise<string> {
  return new Promise((resolve, reject) => {
    socket.once("message", (data) => resolve(data.toString("utf8")));
    socket.once("error", reject);
  });
}

async function onceClosed(socket: WebSocket): Promise<void> {
  if (socket.readyState === WebSocket.CLOSED) return;
  await new Promise<void>((resolve) => socket.once("close", () => resolve()));
}
