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
  const normalized = verdict.toLowerCase();
  if (normalized.includes("partial") || normalized.includes("partially")) {
    return "partial";
  }
  if (normalized.includes("accepted") || hasVerdictToken(normalized, "ac")) {
    return "passed";
  }
  if (
    normalized.includes("time limit") ||
    normalized.includes("memory limit") ||
    normalized.includes("runtime") ||
    hasVerdictToken(normalized, "tle") ||
    hasVerdictToken(normalized, "mle") ||
    hasVerdictToken(normalized, "re")
  ) {
    return "partial";
  }
  return "failed";
}

function hasVerdictToken(text: string, token: string): boolean {
  return text.split(/[^a-z]+/u).includes(token);
}
