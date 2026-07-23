import type Database from "better-sqlite3";
import {
  CaptureAttemptBundleSchema,
  CaptureAttemptAckSchema,
  buildCaptureAttemptAck,
  type CaptureAttemptAck,
  type CaptureAttemptBundle,
} from "@/lib/capture/attemptBundle";
import {
  ingestCaptureEvent,
  type CaptureIngestResult,
  type CaptureIngestOptions,
} from "@/lib/services/captureMaterializer";

export type CaptureAttemptBundleIngestOptions = CaptureIngestOptions;

/**
 * Ingest one complete attempt bundle atomically.
 *
 * One outer SQLite transaction calls into the existing single-event
 * materializer for every event in the bundle. Replaying the exact bundle
 * is idempotent because each raw event has a stable `id` and the
 * materializer honours its fingerprinted replay path. Any failure
 * (validation, conflict, attestation rejection) rolls the entire bundle
 * back, so a partial attempt never reaches the database.
 */
export function ingestCaptureAttemptBundle(
  db: Database.Database,
  input: CaptureAttemptBundle,
  options: CaptureAttemptBundleIngestOptions = {},
): CaptureAttemptAck {
  const bundle = CaptureAttemptBundleSchema.parse(input);

  return db.transaction((): CaptureAttemptAck => {
    const results = bundle.events.map((event) => ingestCaptureEvent(db, event, options));
    const verdictResult: CaptureIngestResult = results[2] ?? {};
    if (
      verdictResult.attemptId === undefined
      || verdictResult.attemptStatus === undefined
      || verdictResult.captureSessionId === undefined
    ) {
      throw new Error("Verdict event did not materialize a training attempt");
    }
    const replayed = results.length > 0
      && results.every((result) => result.replayed === true);
    const ack = buildCaptureAttemptAck({
      bundleId: bundle.bundleId,
      captureSessionId: verdictResult.captureSessionId,
      attemptId: verdictResult.attemptId,
      attemptStatus: verdictResult.attemptStatus,
      replayed,
    });
    return CaptureAttemptAckSchema.parse(ack);
  })();
}
