declare module "*/scripts/v4-live-observation-observer.mjs" {
  export const APPROVED_NOWCODER_PATH: string;
  export const BLOCKED_NOWCODER_PATH: string;
  export const LOCAL_TRIGGER_KEYS: readonly string[];
  export const SESSION_TRIGGER_KEYS: readonly string[];
  export const EXACT_LOCAL_SNAPSHOT_KEYS: readonly string[];
  export const EXACT_SESSION_SNAPSHOT_KEYS: readonly string[];
  export function isCanonicalDescendant(parent: string, child: string): boolean;
  export function validateCandidateReceipt(value: unknown, expected: Readonly<Record<string, unknown>>): Readonly<{ ok: boolean; reason?: string }>;
  export function createObservationTerminalController(input: Readonly<{ closeContext: () => void | Promise<void>; rejectArmed: (error: Error) => void }>): Readonly<{ fail: (reason: string) => boolean; readonly terminal: boolean; readonly reason?: string }>;
  export function isExactObserverPageUrl(actual: string, expected: string): boolean;
  export function projectStageEvidence(state: Readonly<Record<string, unknown>>, database: Readonly<{ captureEvents: number; trainingSessions: number; trainingAttempts: number }>): Readonly<{ ok: boolean; value?: Readonly<Record<string, unknown>>; reason?: string }>;
  export function projectD4AcceptanceEvidence(state: Readonly<Record<string, unknown>>, database: Readonly<{ captureEvents: number; trainingSessions: number; trainingAttempts: number }>): Readonly<{ ok: boolean; value?: Readonly<Record<string, unknown>>; reason?: string }>;
  export function projectFailureReceipt(snapshot: Readonly<Record<string, unknown>>, database: Readonly<{ captureEvents: number; trainingSessions: number; trainingAttempts: number }>, target?: Readonly<{ platform: "leetcode" | "nowcoder"; problemExternalId: string }>): Readonly<
    | { ok: true; value: Readonly<Record<string, unknown>> }
    | { ok: false; reason: string }
  >;
  export function applySafeStorageChange(snapshot: SafeObservationSnapshot, areaName: string, changes: unknown, target?: Readonly<{ platform: "leetcode" | "nowcoder"; problemExternalId: string }>): Readonly<
    | { ok: true; value: SafeObservationSnapshot }
    | { ok: false; reason: string }
  >;

  export type SafeObservationSnapshot = Readonly<{
    confirmed: readonly Readonly<Record<string, unknown>>[];
    tombstones: readonly Readonly<Record<string, unknown>>[];
    outbox: number;
    quarantine: number;
    lastCaptureError?: string;
    lastSuccessfulCaptureAt?: string;
    session: Readonly<Record<string, number>>;
    target?: Readonly<{ e0: number; e1: number; submit: number; status: number; statusConfirmedMatch?: boolean }>;
  }>;

  export function validateObservationTarget(hostname: string, pathname: string): Readonly<
    | { ok: true; platform: "leetcode" | "nowcoder" }
    | { ok: false; reason: string }
  >;

  export function validateStorageChange(areaName: string, changes: unknown): Readonly<
    | { ok: true; keys: readonly string[] }
    | { ok: false; reason: string }
  >;

  export function projectSafeSnapshot(input: unknown, target?: Readonly<{ platform: "leetcode" | "nowcoder"; problemExternalId: string }>): Readonly<
    | { ok: true; value: SafeObservationSnapshot }
    | { ok: false; reason: string }
  >;

  export function reduceObservationSnapshot(
    previous: Readonly<Record<string, unknown>> | undefined,
    snapshot: SafeObservationSnapshot,
    database: Readonly<{ captureEvents: number; trainingSessions: number; trainingAttempts: number }>,
    target?: Readonly<{ platform: "leetcode" | "nowcoder"; problemExternalId: string }>,
  ): Readonly<{
    ok: boolean;
    value?: Readonly<Record<string, unknown>>;
    reason?: string;
  }>;

  export function validateObservationDatabase(input: Readonly<{
    repoRoot: string;
    pointerPath: string;
    explicitPath: string;
    counts: Readonly<{ captureEvents: number; trainingSessions: number; trainingAttempts: number }>;
  }>): Readonly<{ ok: boolean; reason?: string; path?: string }>;

  export function persistentObserverEntrypoint(configuration: Readonly<Record<string, unknown>>): void;
  export function persistentObserverEntrypointSource(): string;

  export function createStorageObserverController(input: Readonly<{
    storage: Readonly<Record<string, unknown>>;
    emit: (event: unknown) => void;
  }>): Readonly<{
    arm: () => Promise<void>;
    close: () => void;
    flush: () => Promise<void>;
    readonly closed: boolean;
    readonly armed: boolean;
  }>;
}
