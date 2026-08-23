export type CaptureStorageAreaName = "local" | "session";

export const APPROVED_LOCAL_STORAGE_KEYS: readonly string[] = Object.freeze([
  "installationId",
  "captureCredential",
  "captureCredentialVersion",
  "captureEnabled",
  "captureEndpoint",
  "captureProtocolVersion",
  "confirmedSubmissions",
  "confirmedSubmissionTombstones",
  "captureOutbox",
  "captureQuarantine",
  "lastCaptureError",
  "lastSuccessfulCaptureAt",
  "lastDeliveredAttemptId",
  "lastDeliveredAttemptStatus",
  "pairedAt",
  "v4ClickIntentMigration",
  "discardedPreBundleEventCount",
  "preBundleQueueDiscardedAt",
  "pendingSubmissionIntents",
  "eventQueue",
  "outbox",
  "quarantine",
]);

export const APPROVED_SESSION_STORAGE_KEYS: readonly string[] = Object.freeze([
  "uiHints",
  "transientE1",
  "transientPageContexts",
  "transientUnmatchedE3",
  "transientVerdictCandidates",
  "transientAmbiguityDiagnostics",
  "characterizationSession",
  "b3WitnessState",
  "contentIngressDiagnostics",
  "contentIngressReady",
  "webRequestSpikeMarkers",
  "leetcodeEndpointDiagnostics",
  "captureRecoveryRetryAttempt",
]);

const APPROVED_KEYS: Readonly<Record<CaptureStorageAreaName, ReadonlySet<string>>> = {
  local: new Set(APPROVED_LOCAL_STORAGE_KEYS),
  session: new Set(APPROVED_SESSION_STORAGE_KEYS),
};

export function assertCaptureStorageKeys(
  area: CaptureStorageAreaName,
  keys: readonly string[],
): void {
  for (const key of keys) {
    if (!APPROVED_KEYS[area].has(key)) {
      throw new Error(`capture_storage_${area}_key_rejected`);
    }
  }
}
