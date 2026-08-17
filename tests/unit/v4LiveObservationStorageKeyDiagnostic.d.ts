declare module "*/scripts/v4-live-observation-diagnostic.mjs" {
  export function classifyRejectedStorageBatch(
    area: string,
    changes: unknown,
    localKeys: readonly unknown[],
    sessionKeys: readonly unknown[],
    ignoredLocalKeys: readonly unknown[],
    ignoredSessionKeys: readonly unknown[],
  ): Readonly<
    | { ok: true; rejected?: Readonly<{ area: string; keys: readonly string[] }> }
    | { ok: false; reason: string }
  >;
  export function storageKeyDiagnosticListener(configuration: Readonly<{
    localKeys: readonly unknown[];
    sessionKeys: readonly unknown[];
    ignoredLocalKeys: readonly unknown[];
    ignoredSessionKeys: readonly unknown[];
  }>): void;
  export function storageKeyDiagnosticListenerSource(): string;
  export function validateDiagnosticOutputPath(candidatePath: string, repoRoot: string): Readonly<{ ok: boolean; reason?: string }>;
  export function writeDiagnosticOutputFile(path: string, payload: Readonly<Record<string, unknown>>): Readonly<{ ok: boolean; reason?: string }>;
  export function buildStageSequenceEntry(seq: number, projection: Readonly<Record<string, unknown>>): Readonly<{
    seq: number;
    stage: string;
    authorizedActions: number;
    exactSubmitCorroboration: number;
    stableResultLifecycles: number;
    e2Confirmed: number;
    e3Finalized: number;
  }> | undefined;
  export function buildStageSequence(history: readonly unknown[], finalProjection?: Readonly<Record<string, unknown>>): Readonly<{
    entries: readonly Readonly<Record<string, unknown>>[];
    capped: boolean;
    reason?: string;
  }>;
}
