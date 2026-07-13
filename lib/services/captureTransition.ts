import { verdictEventToAttemptUpdate } from "@/lib/capture/events";
import type { CaptureEvent } from "@/lib/capture/protocol";
import {
  TrainingAttemptSchema,
  TrainingSessionSchema,
  type TrainingAttempt,
  type TrainingSession,
} from "@/lib/domain/training";

export type CaptureState = {
  readonly session: TrainingSession | null;
  readonly attempt: TrainingAttempt | null;
};

export type CaptureTransition = {
  readonly session: TrainingSession;
  readonly attempt?: TrainingAttempt;
};

export class CaptureConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CaptureConflictError";
  }
}

export function transitionCaptureState(
  state: CaptureState,
  event: CaptureEvent,
  now: string,
): CaptureTransition {
  const session = transitionSession(state.session, event, now);

  if (event.type === "SESSION_STARTED" || event.type === "SESSION_ENDED") {
    return { session };
  }

  if (
    session.endedAt !== undefined &&
    state.attempt === null &&
    event.occurredAt > session.endedAt
  ) {
    throw new CaptureConflictError(
      `Submission ${event.submissionId} occurs after session ${session.id} ended`,
    );
  }

  const attempt = event.type === "SUBMISSION_OBSERVED"
    ? transitionSubmissionAttempt(state.attempt, event, now)
    : transitionVerdictAttempt(state.attempt, event, now);
  return { session, attempt };
}

function transitionSession(
  current: TrainingSession | null,
  event: CaptureEvent,
  now: string,
): TrainingSession {
  if (current === null) {
    const base = {
      id: event.captureSessionId,
      installationId: event.installationId,
      platform: event.platform,
      problemExternalId: event.problemExternalId,
      problemTitle: event.problemTitle,
      canonicalUrl: event.canonicalUrl,
      provenanceLevel: event.provenanceLevel,
      startedAt: event.occurredAt,
      createdAt: now,
      updatedAt: now,
    };
    if (event.type !== "SESSION_ENDED") {
      return TrainingSessionSchema.parse(base);
    }
    return TrainingSessionSchema.parse({
      ...base,
      endedAt: event.occurredAt,
      endReason: event.payload.endReason,
    });
  }

  assertSessionIdentity(current, event);
  if (
    event.type === "SESSION_STARTED" &&
    current.endedAt !== undefined &&
    event.occurredAt > current.endedAt
  ) {
    throw new CaptureConflictError(
      `Session ${current.id} cannot restart after it ended`,
    );
  }

  const startedAt = event.occurredAt < current.startedAt
    ? event.occurredAt
    : current.startedAt;
  if (event.type !== "SESSION_ENDED") {
    return TrainingSessionSchema.parse({
      ...current,
      startedAt,
      updatedAt: now,
    });
  }

  const shouldUseEnd =
    current.endedAt === undefined || event.occurredAt < current.endedAt;
  return TrainingSessionSchema.parse({
    ...current,
    startedAt,
    endedAt: shouldUseEnd ? event.occurredAt : current.endedAt,
    endReason: shouldUseEnd ? event.payload.endReason : current.endReason,
    updatedAt: now,
  });
}

function assertSessionIdentity(
  session: TrainingSession,
  event: CaptureEvent,
): void {
  if (
    session.installationId !== event.installationId ||
    session.platform !== event.platform ||
    session.problemExternalId !== event.problemExternalId
  ) {
    throw new CaptureConflictError(
      `Capture session ${event.captureSessionId} is already linked to another problem`,
    );
  }
}

function transitionSubmissionAttempt(
  current: TrainingAttempt | null,
  event: Extract<CaptureEvent, { readonly type: "SUBMISSION_OBSERVED" }>,
  now: string,
): TrainingAttempt {
  if (current === null) {
    return TrainingAttemptSchema.parse({
      ...attemptIdentity(event),
      startedAt: event.occurredAt,
      result: "draft",
      submissionEventId: event.id,
      createdAt: now,
      updatedAt: now,
    });
  }

  assertAttemptIdentity(current, event);
  const isEarlier = event.occurredAt < current.startedAt;
  return TrainingAttemptSchema.parse({
    ...current,
    startedAt: isEarlier ? event.occurredAt : current.startedAt,
    submissionEventId:
      current.submissionEventId === undefined || isEarlier
        ? event.id
        : current.submissionEventId,
    updatedAt: now,
  });
}

function transitionVerdictAttempt(
  current: TrainingAttempt | null,
  event: Extract<CaptureEvent, { readonly type: "VERDICT_OBSERVED" }>,
  now: string,
): TrainingAttempt {
  const update = verdictEventToAttemptUpdate(event);
  if (current === null) {
    return TrainingAttemptSchema.parse({
      ...attemptIdentity(event),
      startedAt: event.occurredAt,
      endedAt: update.endedAt,
      result: update.result,
      verdict: update.verdict,
      language: update.language,
      verdictEventId: event.id,
      createdAt: now,
      updatedAt: now,
    });
  }

  assertAttemptIdentity(current, event);
  if (!isNewerVerdict(current, event)) return current;

  return TrainingAttemptSchema.parse({
    ...current,
    endedAt: update.endedAt,
    result: update.result,
    verdict: update.verdict,
    language: update.language,
    verdictEventId: event.id,
    updatedAt: now,
  });
}

function attemptIdentity(
  event: Extract<
    CaptureEvent,
    { readonly type: "SUBMISSION_OBSERVED" | "VERDICT_OBSERVED" }
  >,
) {
  return {
    id: `attempt_${event.submissionId}`,
    captureSessionId: event.captureSessionId,
    submissionId: event.submissionId,
    platform: event.platform,
    problemExternalId: event.problemExternalId,
    problemTitle: event.problemTitle,
    canonicalUrl: event.canonicalUrl,
  };
}

function assertAttemptIdentity(
  attempt: TrainingAttempt,
  event: Extract<
    CaptureEvent,
    { readonly type: "SUBMISSION_OBSERVED" | "VERDICT_OBSERVED" }
  >,
): void {
  if (
    attempt.captureSessionId !== event.captureSessionId ||
    attempt.submissionId !== event.submissionId ||
    attempt.platform !== event.platform ||
    attempt.problemExternalId !== event.problemExternalId
  ) {
    throw new CaptureConflictError(
      `Submission ${event.submissionId} is already linked to another session or problem`,
    );
  }
}

function isNewerVerdict(
  current: TrainingAttempt,
  event: Extract<CaptureEvent, { readonly type: "VERDICT_OBSERVED" }>,
): boolean {
  if (current.endedAt === undefined || current.verdictEventId === undefined) {
    return true;
  }
  if (event.occurredAt !== current.endedAt) {
    return event.occurredAt > current.endedAt;
  }
  return event.id > current.verdictEventId;
}
