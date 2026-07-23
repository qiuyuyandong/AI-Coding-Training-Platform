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
import { classifyFinalCaptureVerdict } from "./verdictTaxonomy";

export type AttemptUpdate = {
  readonly result: "passed" | "failed" | "partial" | "stuck";
  readonly verdict: string;
  readonly language?: string;
  readonly endedAt: string;
};

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
