import { randomBytes } from "node:crypto";
import { createServer } from "node:http";
import { WebSocketServer } from "ws";

const DEFAULT_MAX_FRAME_BYTES = 1024 * 1024;
const DEFAULT_HANDSHAKE_TIMEOUT_MS = 5_000;

export async function createNativeCdpRelay({
  upstreamEndpoint,
  maxFrameBytes = DEFAULT_MAX_FRAME_BYTES,
  handshakeTimeoutMs = DEFAULT_HANDSHAKE_TIMEOUT_MS,
  onLog = () => undefined,
}) {
  assertUpstreamEndpoint(upstreamEndpoint);
  if (!Number.isInteger(maxFrameBytes) || maxFrameBytes < 1 || maxFrameBytes > 16 * 1024 * 1024) {
    throw new RangeError("relay_frame_limit_invalid");
  }
  if (!Number.isInteger(handshakeTimeoutMs) || handshakeTimeoutMs < 100 || handshakeTimeoutMs > 30_000) {
    throw new RangeError("relay_handshake_timeout_invalid");
  }

  const relayPath = `/cdp/${randomBytes(24).toString("hex")}`;
  const server = createServer((_request, response) => {
    response.writeHead(404).end();
  });
  const localServer = new WebSocketServer({ noServer: true, maxPayload: maxFrameBytes });
  let activeClient = null;
  let activeUpstream = null;
  let clientPending = false;
  let closed = false;

  server.on("upgrade", (request, socket, head) => {
    if (closed || request.url !== relayPath) {
      rejectUpgrade(socket, 404);
      return;
    }
    if (activeClient !== null || clientPending) {
      onLog("relay_second_client_rejected");
      rejectUpgrade(socket, 409);
      return;
    }
    clientPending = true;
    localServer.handleUpgrade(request, socket, head, (client) => {
      localServer.emit("connection", client, request);
    });
  });

  localServer.on("connection", (client) => {
    activeClient = client;
    clientPending = false;
    const upstream = new globalThis.WebSocket(upstreamEndpoint);
    activeUpstream = upstream;
    upstream.binaryType = "arraybuffer";
    const pending = [];
    let pendingBytes = 0;
    const timer = setTimeout(() => {
      onLog("relay_upstream_handshake_timeout");
      closePair(client, upstream, 4013, "upstream timeout");
    }, handshakeTimeoutMs);

    client.on("message", (data) => {
      const size = byteLength(data);
      if (size > maxFrameBytes || pendingBytes + size > maxFrameBytes) {
        onLog("relay_frame_too_large");
        closePair(client, upstream, 4009, "frame too large");
        return;
      }
      const payload = data.toString("utf8");
      if (upstream.readyState === globalThis.WebSocket.OPEN) upstream.send(payload);
      else {
        pending.push(payload);
        pendingBytes += size;
      }
    });
    client.on("close", () => {
      onLog("relay_client_closed");
      clearTimeout(timer);
      if (upstream.readyState === globalThis.WebSocket.OPEN
        || upstream.readyState === globalThis.WebSocket.CONNECTING) upstream.close(1000, "client closed");
      activeClient = null;
      activeUpstream = null;
    });
    client.on("error", () => onLog("relay_client_error"));

    upstream.addEventListener("open", () => {
      clearTimeout(timer);
      for (const payload of pending.splice(0)) upstream.send(payload);
      pendingBytes = 0;
      onLog("relay_connected");
    });
    upstream.addEventListener("message", (event) => {
      const size = byteLength(event.data);
      if (size > maxFrameBytes) {
        onLog("relay_frame_too_large");
        closePair(client, upstream, 4009, "frame too large");
        return;
      }
      if (client.readyState === client.OPEN) client.send(asText(event.data));
    });
    upstream.addEventListener("close", (event) => {
      onLog(`relay_upstream_closed_${event.code}`);
      clearTimeout(timer);
      if (client.readyState === client.OPEN || client.readyState === client.CONNECTING) {
        client.close(1011, "upstream closed");
      }
    });
    upstream.addEventListener("error", () => onLog("relay_upstream_error"));
  });

  await new Promise((resolve, reject) => {
    const onError = (error) => reject(error);
    server.once("error", onError);
    server.listen(0, "127.0.0.1", () => {
      server.off("error", onError);
      resolve();
    });
  });
  const address = server.address();
  if (typeof address !== "object" || address === null) throw new Error("relay_bind_failed");

  return Object.freeze({
    endpoint: `ws://127.0.0.1:${address.port}${relayPath}`,
    async close() {
      if (closed) return;
      closed = true;
      const client = activeClient;
      if (client !== null && client.readyState === client.OPEN) client.close(1001, "relay closing");
      if (activeUpstream?.readyState === globalThis.WebSocket.OPEN
        || activeUpstream?.readyState === globalThis.WebSocket.CONNECTING) activeUpstream.close(1000, "relay closing");
      for (const client of localServer.clients) client.terminate();
      await new Promise((resolve) => server.close(() => resolve()));
      localServer.close();
    },
  });
}

function assertUpstreamEndpoint(endpoint) {
  let parsed;
  try {
    parsed = new URL(endpoint);
  } catch {
    throw new RangeError("relay_upstream_rejected");
  }
  if (parsed.protocol !== "ws:" || parsed.hostname !== "127.0.0.1"
    || parsed.port.length === 0 || parsed.username.length > 0 || parsed.password.length > 0
    || !/^\/devtools\/browser\/[A-Za-z0-9-]{16,128}$/u.test(parsed.pathname)
    || parsed.search.length > 0 || parsed.hash.length > 0) {
    throw new RangeError("relay_upstream_rejected");
  }
}

function byteLength(value) {
  if (typeof value === "string") return Buffer.byteLength(value);
  if (value instanceof ArrayBuffer) return value.byteLength;
  if (ArrayBuffer.isView(value)) return value.byteLength;
  if (Buffer.isBuffer(value)) return value.byteLength;
  return Number.POSITIVE_INFINITY;
}

function asText(value) {
  if (typeof value === "string") return value;
  if (value instanceof ArrayBuffer) return Buffer.from(value).toString("utf8");
  if (ArrayBuffer.isView(value)) return Buffer.from(value.buffer, value.byteOffset, value.byteLength).toString("utf8");
  if (Buffer.isBuffer(value)) return value.toString("utf8");
  throw new TypeError("relay_frame_type_rejected");
}

function rejectUpgrade(socket, status) {
  socket.end(`HTTP/1.1 ${status} Rejected\r\nConnection: close\r\n\r\n`);
}

function closePair(client, upstream, code, reason) {
  if (client.readyState === client.OPEN || client.readyState === client.CONNECTING) client.close(code, reason);
  if (upstream.readyState === globalThis.WebSocket.OPEN
    || upstream.readyState === globalThis.WebSocket.CONNECTING) upstream.close(code, reason);
}
