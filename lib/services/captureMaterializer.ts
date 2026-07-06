import type Database from "better-sqlite3";
import { pageDetectedEventToAttemptDraft, submissionEventToAttemptUpdate, type CaptureEvent } from "@/lib/capture/events";
import {
  createDraftAttemptFromCapture,
  findAttemptBySourceEventId,
  findOpenAttemptByProblem,
  updateAttemptFromCapture,
} from "@/lib/repositories/attempts";
import type { AttemptResult } from "@/lib/domain/training";

export type MaterializedAttemptResult = {
  readonly attemptId?: string;
  readonly attemptStatus?: AttemptResult;
};

export function materializeCaptureEvent(db: Database.Database, event: CaptureEvent): MaterializedAttemptResult {
  const existing = findAttemptBySourceEventId(db, event.id);
  if (existing !== null) return { attemptId: existing.id, attemptStatus: existing.result };

  if (event.type === "PAGE_DETECTED" || event.type === "TRAINING_STARTED") {
    const draft = pageDetectedEventToAttemptDraft(event);
    const open = findOpenAttemptByProblem(db, draft.platform, draft.problemExternalId);
    if (open !== null) return { attemptId: open.id, attemptStatus: open.result };

    const attempt = createDraftAttemptFromCapture(db, {
      id: `attempt_${event.id}`,
      platform: draft.platform,
      problemExternalId: draft.problemExternalId,
      problemTitle: draft.problemTitle,
      canonicalUrl: draft.canonicalUrl,
      startedAt: draft.startedAt,
      sourceEventId: event.id,
      now: new Date().toISOString(),
    });
    return { attemptId: attempt.id, attemptStatus: attempt.result };
  }

  if (event.type === "SUBMISSION_DETECTED" || event.type === "VERDICT_UPDATED") {
    const update = submissionEventToAttemptUpdate(event);
    const draft = pageDetectedEventToAttemptDraft(event);
    const open = findOpenAttemptByProblem(db, draft.platform, draft.problemExternalId);
    const attempt =
      open ??
      createDraftAttemptFromCapture(db, {
        id: `attempt_${event.id}`,
        platform: draft.platform,
        problemExternalId: draft.problemExternalId,
        problemTitle: draft.problemTitle,
        canonicalUrl: draft.canonicalUrl,
        startedAt: draft.startedAt,
        sourceEventId: `${event.id}:draft`,
        now: new Date().toISOString(),
      });
    const completed = updateAttemptFromCapture(db, {
      attemptId: attempt.id,
      result: update.result,
      verdict: update.verdict,
      language: update.language,
      endedAt: update.endedAt,
      sourceEventId: event.id,
      now: new Date().toISOString(),
    });
    return { attemptId: completed.id, attemptStatus: completed.result };
  }

  if (event.type === "TRAINING_ENDED") {
    const draft = pageDetectedEventToAttemptDraft(event);
    const open = findOpenAttemptByProblem(db, draft.platform, draft.problemExternalId);
    if (open === null) return {};
    const completed = updateAttemptFromCapture(db, {
      attemptId: open.id,
      result: "stuck",
      verdict: "Training ended",
      endedAt: event.occurredAt,
      sourceEventId: event.id,
      now: new Date().toISOString(),
    });
    return { attemptId: completed.id, attemptStatus: completed.result };
  }

  return {};
}
