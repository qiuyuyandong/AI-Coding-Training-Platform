import type Database from "better-sqlite3";
import { captureEventFingerprint } from "@/lib/capture/fingerprint";
import {
  CaptureEventSchema,
  type CaptureEvent,
} from "@/lib/capture/protocol";
import type { AttemptResult } from "@/lib/domain/training";
import {
  findAttemptBySubmissionId,
  saveTrainingAttempt,
} from "@/lib/repositories/attempts";
import {
  findCaptureEventFingerprint,
  insertCaptureEvent,
} from "@/lib/repositories/captureEvents";
import {
  findTrainingSessionById,
  saveTrainingSession,
} from "@/lib/repositories/trainingSessions";
import {
  CaptureConflictError,
  transitionCaptureState,
} from "./captureTransition";

export type CaptureIngestResult = {
  readonly eventId: string;
  readonly captureSessionId: string;
  readonly attemptId?: string;
  readonly attemptStatus?: AttemptResult;
  readonly replayed: boolean;
};

export type CaptureIngestOptions = {
  readonly now?: () => string;
};

export function ingestCaptureEvent(
  db: Database.Database,
  event: CaptureEvent,
  options: CaptureIngestOptions = {},
): CaptureIngestResult {
  const parsed = CaptureEventSchema.parse(event);
  const now = options.now ?? (() => new Date().toISOString());
  const transaction = db.transaction(() => {
    const fingerprint = captureEventFingerprint(parsed);
    const existingFingerprint = findCaptureEventFingerprint(db, parsed.id);
    if (existingFingerprint !== null) {
      if (existingFingerprint !== fingerprint) {
        throw new CaptureConflictError(
          `Capture event ${parsed.id} conflicts with its stored payload`,
        );
      }
      return replayResult(db, parsed);
    }

    const session = findTrainingSessionById(db, parsed.captureSessionId);
    const attempt = "submissionId" in parsed
      ? findAttemptBySubmissionId(db, parsed.submissionId)
      : null;
    const receivedAt = now();
    const transition = transitionCaptureState(
      { session, attempt },
      parsed,
      receivedAt,
    );

    insertCaptureEvent(db, parsed, fingerprint, receivedAt);
    saveTrainingSession(db, transition.session);
    if (transition.attempt !== undefined) {
      saveTrainingAttempt(db, transition.attempt);
    }
    return transitionResult(parsed, transition.attempt, false);
  });
  return transaction();
}

function replayResult(
  db: Database.Database,
  event: CaptureEvent,
): CaptureIngestResult {
  const session = findTrainingSessionById(db, event.captureSessionId);
  if (session === null) {
    throw new Error(`Capture session missing for replayed event ${event.id}`);
  }
  const attempt = "submissionId" in event
    ? findAttemptBySubmissionId(db, event.submissionId)
    : null;
  return transitionResult(event, attempt ?? undefined, true);
}

function transitionResult(
  event: CaptureEvent,
  attempt: ReturnType<typeof findAttemptBySubmissionId> | undefined,
  replayed: boolean,
): CaptureIngestResult {
  const base = {
    eventId: event.id,
    captureSessionId: event.captureSessionId,
    replayed,
  };
  if (attempt === undefined || attempt === null) return base;
  return {
    ...base,
    attemptId: attempt.id,
    attemptStatus: attempt.result,
  };
}
