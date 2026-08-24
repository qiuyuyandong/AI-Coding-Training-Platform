import { randomBytes, randomUUID, timingSafeEqual } from "node:crypto";

export const CAPTURE_CONNECTION_CHALLENGE_TTL_MS = 60_000;
const MAX_ACTIVE_CHALLENGES = 100;
const STORE_SYMBOL = Symbol.for("ai-coding-training.capture-connection-challenges.v1");

export type CaptureConnectionState = "connected" | "pending" | "expired" | "failed";

export type CaptureConnectionChallenge = Readonly<{
  challengeId: string;
  nonce: string;
  expiresAt: string;
}>;

type MutableChallenge = {
  readonly challengeId: string;
  readonly nonce: string;
  readonly createdAtMs: number;
  readonly expiresAtMs: number;
  state: "pending" | "consuming" | "connected" | "failed";
};

type ChallengeStore = Map<string, MutableChallenge>;

export class CaptureConnectionChallengeError extends Error {
  readonly reason: "not_found" | "expired" | "consumed" | "nonce_mismatch";

  constructor(reason: "not_found" | "expired" | "consumed" | "nonce_mismatch") {
    super(`Capture connection challenge rejected: ${reason}`);
    this.name = "CaptureConnectionChallengeError";
    this.reason = reason;
  }
}

export function createCaptureConnectionChallenge(
  nowMs = Date.now(),
): CaptureConnectionChallenge {
  const store = challengeStore();
  pruneChallenges(store, nowMs);
  while (store.size >= MAX_ACTIVE_CHALLENGES) {
    const oldest = store.keys().next().value;
    if (typeof oldest !== "string") break;
    store.delete(oldest);
  }
  const challenge: MutableChallenge = {
    challengeId: `challenge_${randomUUID()}`,
    nonce: randomBytes(32).toString("base64url"),
    createdAtMs: nowMs,
    expiresAtMs: nowMs + CAPTURE_CONNECTION_CHALLENGE_TTL_MS,
    state: "pending",
  };
  store.set(challenge.challengeId, challenge);
  return {
    challengeId: challenge.challengeId,
    nonce: challenge.nonce,
    expiresAt: new Date(challenge.expiresAtMs).toISOString(),
  };
}

export function readCaptureConnectionState(
  input: { readonly challengeId: string; readonly nonce: string },
  nowMs = Date.now(),
): CaptureConnectionState {
  const challenge = challengeStore().get(input.challengeId);
  if (challenge === undefined || !sameNonce(challenge.nonce, input.nonce)) return "failed";
  if (nowMs >= challenge.expiresAtMs && challenge.state === "pending") return "expired";
  if (challenge.state === "connected") return "connected";
  if (challenge.state === "failed") return "failed";
  return "pending";
}

export function completeCaptureConnectionChallenge<T>(
  input: { readonly challengeId: string; readonly nonce: string },
  completion: () => T,
  nowMs = Date.now(),
): T {
  const challenge = challengeStore().get(input.challengeId);
  if (challenge === undefined) throw new CaptureConnectionChallengeError("not_found");
  if (!sameNonce(challenge.nonce, input.nonce)) {
    throw new CaptureConnectionChallengeError("nonce_mismatch");
  }
  if (nowMs >= challenge.expiresAtMs) {
    throw new CaptureConnectionChallengeError("expired");
  }
  if (challenge.state !== "pending") {
    throw new CaptureConnectionChallengeError("consumed");
  }
  challenge.state = "consuming";
  try {
    const result = completion();
    challenge.state = "connected";
    return result;
  } catch (error) {
    challenge.state = "failed";
    throw error;
  }
}

export function resetCaptureConnectionChallengesForTests(): void {
  challengeStore().clear();
}

function challengeStore(): ChallengeStore {
  const existing: unknown = Reflect.get(globalThis, STORE_SYMBOL);
  if (existing instanceof Map) return existing;
  const created: ChallengeStore = new Map();
  Reflect.set(globalThis, STORE_SYMBOL, created);
  return created;
}

function pruneChallenges(store: ChallengeStore, nowMs: number): void {
  for (const [id, challenge] of store) {
    if (nowMs - challenge.createdAtMs > CAPTURE_CONNECTION_CHALLENGE_TTL_MS * 2) {
      store.delete(id);
    }
  }
}

function sameNonce(left: string, right: string): boolean {
  const leftBytes = Buffer.from(left, "utf8");
  const rightBytes = Buffer.from(right, "utf8");
  return leftBytes.length === rightBytes.length && timingSafeEqual(leftBytes, rightBytes);
}
