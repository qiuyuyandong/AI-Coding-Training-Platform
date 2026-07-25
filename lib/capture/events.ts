export {
  CaptureEventSchema,
  SessionEndedEventSchema,
  SessionStartedEventSchema,
  SubmissionObservedEventSchema,
  VerdictObservedEventSchema,
} from "./protocol";
export type {
  CaptureEvent,
  SessionEndedEvent,
  SessionStartedEvent,
  SubmissionObservedEvent,
  VerdictObservedEvent,
} from "./protocol";

import type { VerdictObservedEvent } from "./protocol";
import type { SubmissionObservedAction } from "./protocol";
import { classifyFinalCaptureVerdict } from "./verdictTaxonomy";

export type AttemptUpdate = {
  readonly result: "passed" | "failed" | "partial" | "stuck";
  readonly verdict: string;
  readonly language?: string;
  readonly endedAt: string;
};

/**
 * Re-export the closed submission action enum for downstream consumers.
 * `submit_clicked` is the historical V3 DOM-click inference; `submission_confirmed`
 * is the V4 E2 correlator-driven confirmation. The enum is additive; legacy
 * captures with `submit_clicked` continue to flow through this module.
 */
export type { SubmissionObservedAction } from "./protocol";
export { SUBMISSION_OBSERVED_ACTIONS } from "./protocol";
const _actionShape: SubmissionObservedAction = "submit_clicked";
void _actionShape;

export function verdictEventToAttemptUpdate(
  event: VerdictObservedEvent,
): AttemptUpdate {
  const result = event.payload.result ?? classifyVerdict(event.payload.verdict);
  const base = {
    result,
    verdict: event.payload.verdict,
    endedAt: event.occurredAt,
  };

  if (event.payload.language === undefined) return base;
  return { ...base, language: event.payload.language };
}

function classifyVerdict(verdict: string): AttemptUpdate["result"] {
  return classifyFinalCaptureVerdict(verdict);
}
