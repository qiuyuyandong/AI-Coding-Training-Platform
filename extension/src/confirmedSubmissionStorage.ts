import { readConfirmedSubmissions, type ConfirmedSubmission } from "./confirmedSubmission";
import type { Platform } from "./platforms";

export const CONFIRMED_SUBMISSION_SCHEMA_VERSION = 1 as const;
export const DEFAULT_TOMBSTONE_MAX_COUNT = 256;
export const DEFAULT_TOMBSTONE_MAX_AGE_MS = 30 * 24 * 60 * 60_000;

export type ConfirmedSubmissionRecord = ConfirmedSubmission &
  Readonly<{
    storageKey: string;
    lastE3At: string;
    phase?: "queued" | "judging" | "running";
    finalizedAt?: string;
  }>;

export type ConfirmedSubmissionTombstone = Readonly<{
  submissionKey: string;
  finalizedAt: string;
  expiresAt: string;
}>;

export type ConfirmedSubmissionState = Readonly<{
  confirmed: readonly ConfirmedSubmissionRecord[];
  tombstones: readonly ConfirmedSubmissionTombstone[];
}>;

export interface ConfirmedSubmissionStorage {
  get(keys: readonly string[]): Promise<Record<string, unknown>>;
  set(items: Record<string, unknown>): Promise<void>;
}

export type TombstoneOptions = Readonly<{
  maxCount?: number;
  maxAgeMs?: number;
}>;

export type RecordOutcome =
  | "recorded"
  | "already_confirmed"
  | "already_finalized"
  | "identity_conflict";

export type FinalizeOutcome = "finalized" | "already_finalized";

const freeze = <T>(items: readonly T[]): readonly T[] => Object.freeze([...items]);
const obj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null;
const nonempty = (v: unknown): v is string => typeof v === "string" && v.length > 0;
const iso = (v: unknown): v is string => nonempty(v) && Number.isFinite(Date.parse(v));
const platform = (v: unknown): v is Platform =>
  typeof v === "string" &&
  ["leetcode", "nowcoder", "luogu", "codeforces", "atcoder"].includes(v);

const allowedRecordKeys = [
  "schemaVersion",
  "status",
  "platform",
  "problemExternalId",
  "externalSubmissionId",
  "confirmedAt",
  "storageKey",
  "lastE3At",
  "phase",
  "finalizedAt",
] as const;

const allowedTombstoneKeys = ["submissionKey", "finalizedAt", "expiresAt"] as const;

const hasOnly = (v: Record<string, unknown>, keys: readonly string[]): boolean =>
  Object.keys(v).every((k) => keys.includes(k));

const optionsOf = (options?: TombstoneOptions): Required<TombstoneOptions> => ({
  maxCount: options?.maxCount ?? DEFAULT_TOMBSTONE_MAX_COUNT,
  maxAgeMs: options?.maxAgeMs ?? DEFAULT_TOMBSTONE_MAX_AGE_MS,
});

const createTombstone = (
  submissionKey: string,
  finalizedAt: string,
  options?: TombstoneOptions,
): ConfirmedSubmissionTombstone => {
  const { maxAgeMs } = optionsOf(options);
  return Object.freeze({
    submissionKey,
    finalizedAt,
    expiresAt: new Date(Date.parse(finalizedAt) + maxAgeMs).toISOString(),
  });
};

const pruneTombstones = (
  tombstones: readonly ConfirmedSubmissionTombstone[],
  now: string,
  maxCount: number,
  maxAgeMs: number,
): ConfirmedSubmissionTombstone[] => {
  const nowMs = Date.parse(now);
  if (!Number.isFinite(nowMs)) return [];
  const filtered = tombstones.filter((t) => {
    const expiresMs = Date.parse(t.expiresAt);
    if (!Number.isFinite(expiresMs) || expiresMs <= nowMs) return false;
    const finalizedMs = Date.parse(t.finalizedAt);
    if (!Number.isFinite(finalizedMs)) return false;
    return nowMs - finalizedMs <= maxAgeMs;
  });
  if (maxCount <= 0) return [];
  return filtered.slice(-maxCount);
};

function parseRecord(value: unknown): ConfirmedSubmissionRecord | undefined {
  if (
    !obj(value) ||
    !hasOnly(value, allowedRecordKeys) ||
    value.schemaVersion !== 1 ||
    value.status !== "confirmed" ||
    !platform(value.platform) ||
    !nonempty(value.problemExternalId) ||
    !nonempty(value.externalSubmissionId) ||
    !iso(value.confirmedAt) ||
    !nonempty(value.storageKey) ||
    value.storageKey !== `${value.platform}:${value.externalSubmissionId}` ||
    !iso(value.lastE3At)
  ) {
    return undefined;
  }
  if (
    value.phase !== undefined &&
    !["queued", "judging", "running"].includes(String(value.phase))
  ) {
    return undefined;
  }
  if (value.finalizedAt !== undefined && !iso(value.finalizedAt)) return undefined;
  return Object.freeze({
    schemaVersion: 1,
    status: "confirmed",
    platform: value.platform,
    problemExternalId: value.problemExternalId,
    externalSubmissionId: value.externalSubmissionId,
    confirmedAt: value.confirmedAt,
    storageKey: value.storageKey,
    lastE3At: value.lastE3At,
    ...(value.phase === undefined
      ? {}
      : { phase: value.phase as ConfirmedSubmissionRecord["phase"] }),
    ...(value.finalizedAt === undefined ? {} : { finalizedAt: value.finalizedAt }),
  });
}

function parseTombstone(value: unknown): ConfirmedSubmissionTombstone | undefined {
  if (
    !obj(value) ||
    !hasOnly(value, allowedTombstoneKeys) ||
    !nonempty(value.submissionKey) ||
    !iso(value.finalizedAt) ||
    !iso(value.expiresAt)
  ) {
    return undefined;
  }
  return Object.freeze({
    submissionKey: value.submissionKey,
    finalizedAt: value.finalizedAt,
    expiresAt: value.expiresAt,
  });
}

export function readConfirmedSubmissionState(
  stored: Record<string, unknown>,
): ConfirmedSubmissionState {
  const raw = Array.isArray(stored.confirmedSubmissions) ? stored.confirmedSubmissions : [];
  const confirmed = raw.flatMap((v) => {
    const parsed = parseRecord(v);
    if (parsed !== undefined) return [parsed];
    if (
      !obj(v) ||
      !hasOnly(v, [
        "schemaVersion",
        "status",
        "platform",
        "problemExternalId",
        "externalSubmissionId",
        "confirmedAt",
      ])
    ) {
      return [];
    }
    const legacy = readConfirmedSubmissions([v]);
    const item = legacy[0];
    return item === undefined
      ? []
      : [
          Object.freeze({
            ...item,
            storageKey: `${item.platform}:${item.externalSubmissionId}`,
            lastE3At: item.confirmedAt,
          }),
        ];
  });
  const tombstones = Array.isArray(stored.confirmedSubmissionTombstones)
    ? stored.confirmedSubmissionTombstones.flatMap((v) => {
        const p = parseTombstone(v);
        return p === undefined ? [] : [p];
      })
    : [];
  return Object.freeze({ confirmed: freeze(confirmed), tombstones: freeze(tombstones) });
}

export function planConfirmedSubmissionState(state: ConfirmedSubmissionState): {
  readonly items: Record<string, unknown>;
} {
  return Object.freeze({
    items: Object.freeze({
      confirmedSubmissions: state.confirmed,
      confirmedSubmissionTombstones: state.tombstones,
    }),
  });
}

export function pruneConfirmedSubmissionState(
  state: ConfirmedSubmissionState,
  now: string,
  options?: TombstoneOptions,
): ConfirmedSubmissionState & Readonly<{ deletedTombstoneCount: number }> {
  const { maxCount, maxAgeMs } = optionsOf(options);
  const retained = pruneTombstones(state.tombstones, now, maxCount, maxAgeMs);
  return Object.freeze({
    confirmed: freeze(state.confirmed),
    tombstones: freeze(retained),
    deletedTombstoneCount: state.tombstones.length - retained.length,
  });
}

export function planConfirmedSubmissionPrune(
  state: ConfirmedSubmissionState,
  now: string,
  options?: TombstoneOptions,
): { readonly items: Record<string, unknown>; readonly deletedTombstoneCount: number } {
  const pruned = pruneConfirmedSubmissionState(state, now, options);
  return Object.freeze({
    items: planConfirmedSubmissionState(pruned).items,
    deletedTombstoneCount: pruned.deletedTombstoneCount,
  });
}

export function recordConfirmedSubmission(
  state: ConfirmedSubmissionState,
  record: ConfirmedSubmissionRecord,
  now: string,
  options?: TombstoneOptions,
): {
  readonly state: ConfirmedSubmissionState;
  readonly outcome: RecordOutcome;
  readonly tombstone?: ConfirmedSubmissionTombstone;
} {
  const { maxCount, maxAgeMs } = optionsOf(options);
  const key = `${record.platform}:${record.externalSubmissionId}`;
  const tombstones = pruneTombstones(state.tombstones, now, maxCount, maxAgeMs);
  const tombstonesUnchanged = tombstones.length === state.tombstones.length
    && tombstones.every((tombstone, index) => tombstone === state.tombstones[index]);
  const prunedState = tombstonesUnchanged
    ? state
    : Object.freeze({
        confirmed: freeze(state.confirmed),
        tombstones: freeze(tombstones),
      });
  const existingTombstone = tombstones.find((t) => t.submissionKey === key);
  if (existingTombstone !== undefined) {
    return Object.freeze({
      state: prunedState,
      outcome: "already_finalized",
      tombstone: existingTombstone,
    });
  }
  const previous = prunedState.confirmed.find((r) => r.storageKey === key);
  if (previous?.finalizedAt !== undefined) {
    const tombstone = createTombstone(key, previous.finalizedAt, options);
    return Object.freeze({
      state: Object.freeze({
        confirmed: prunedState.confirmed,
        tombstones: freeze(pruneTombstones(
          [...prunedState.tombstones, tombstone],
          now,
          maxCount,
          maxAgeMs,
        )),
      }),
      outcome: "already_finalized",
      tombstone,
    });
  }
  if (previous !== undefined) {
    return Object.freeze({
      state: prunedState,
      outcome: previous.problemExternalId === record.problemExternalId
        ? "already_confirmed"
        : "identity_conflict",
    });
  }
  const normalized = Object.freeze({ ...record, storageKey: key, lastE3At: now });
  const confirmed = [...prunedState.confirmed.filter((r) => r.storageKey !== key), normalized];
  return Object.freeze({
    state: Object.freeze({ confirmed: freeze(confirmed), tombstones: prunedState.tombstones }),
    outcome: "recorded",
  });
}

export function markConfirmedSubmissionFinalized(
  state: ConfirmedSubmissionState,
  record: ConfirmedSubmissionRecord,
  now: string,
  options?: TombstoneOptions,
): {
  readonly state: ConfirmedSubmissionState;
  readonly outcome: FinalizeOutcome;
  readonly tombstone: ConfirmedSubmissionTombstone;
  readonly deletedTombstoneCount: number;
} {
  const { maxCount, maxAgeMs } = optionsOf(options);
  const key = `${record.platform}:${record.externalSubmissionId}`;
  const existing = state.confirmed.find((r) => r.storageKey === key);
  if (existing?.finalizedAt !== undefined) {
    const existingTombstone = state.tombstones.find((t) => t.submissionKey === key);
    if (existingTombstone !== undefined) {
      const tombstones = pruneTombstones(state.tombstones, now, maxCount, maxAgeMs);
      return Object.freeze({
        state: Object.freeze({ confirmed: freeze(state.confirmed), tombstones: freeze(tombstones) }),
        outcome: "already_finalized",
        tombstone: existingTombstone,
        deletedTombstoneCount: countDroppedFromPrior(state.tombstones, tombstones),
      });
    }
    const tombstone = createTombstone(key, existing.finalizedAt, options);
    const tombstones = pruneTombstones([...state.tombstones, tombstone], now, maxCount, maxAgeMs);
    return Object.freeze({
      state: Object.freeze({ confirmed: freeze(state.confirmed), tombstones: freeze(tombstones) }),
      outcome: "already_finalized",
      tombstone,
      deletedTombstoneCount: countDroppedFromPrior(state.tombstones, tombstones),
    });
  }
  const finalized = Object.freeze({ ...record, storageKey: key, lastE3At: now, finalizedAt: now });
  const tombstone = createTombstone(key, now, options);
  const tombstones = pruneTombstones(
    [...state.tombstones.filter((t) => t.submissionKey !== key), tombstone],
    now,
    maxCount,
    maxAgeMs,
  );
  const next = Object.freeze({
    confirmed: freeze([...state.confirmed.filter((r) => r.storageKey !== key), finalized]),
    tombstones: freeze(tombstones),
  });
  return Object.freeze({
    state: next,
    outcome: "finalized",
    tombstone,
    deletedTombstoneCount: countDroppedFromPrior(state.tombstones, tombstones),
  });
}

function countDroppedFromPrior(
  prior: readonly ConfirmedSubmissionTombstone[],
  retained: readonly ConfirmedSubmissionTombstone[],
): number {
  const retainedKeys = new Set(retained.map((t) => t.submissionKey));
  return prior.filter((t) => !retainedKeys.has(t.submissionKey)).length;
}
