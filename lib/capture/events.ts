import { z } from "zod";
import { PlatformSchema } from "@/lib/domain/source";

export const CaptureEventSchema = z.object({
  id: z.string().min(1),
  type: z.enum(["PAGE_DETECTED", "TRAINING_STARTED", "SUBMISSION_DETECTED", "VERDICT_UPDATED", "TRAINING_ENDED"]),
  platform: PlatformSchema,
  problemExternalId: z.string().min(1),
  problemTitle: z.string().min(1),
  canonicalUrl: z.string().url(),
  occurredAt: z.string().datetime(),
  payload: z.record(z.unknown()),
});

export type CaptureEvent = z.infer<typeof CaptureEventSchema>;

export type AttemptDraft = {
  result: "draft";
  platform: CaptureEvent["platform"];
  problemExternalId: string;
  problemTitle: string;
  canonicalUrl: string;
  startedAt: string;
};

export function pageDetectedEventToAttemptDraft(event: CaptureEvent): AttemptDraft {
  const parsed = CaptureEventSchema.parse(event);
  return {
    result: "draft",
    platform: parsed.platform,
    problemExternalId: parsed.problemExternalId,
    problemTitle: parsed.problemTitle,
    canonicalUrl: parsed.canonicalUrl,
    startedAt: parsed.occurredAt,
  };
}

export type AttemptUpdate = {
  result: "passed" | "failed" | "partial" | "stuck";
  verdict: string;
  language?: string;
  endedAt: string;
};

export function submissionEventToAttemptUpdate(event: CaptureEvent): AttemptUpdate {
  const parsed = CaptureEventSchema.parse(event);
  const verdict = String(parsed.payload.verdict ?? "Unknown");
  const language = parsed.payload.language === undefined ? undefined : String(parsed.payload.language);
  const result = explicitAttemptResult(parsed.payload.result) ?? classifyVerdict(verdict);
  const base = {
    result,
    verdict,
    endedAt: parsed.occurredAt,
  };

  if (language === undefined) return base;

  return {
    ...base,
    language,
  };
}

function explicitAttemptResult(value: unknown): AttemptUpdate["result"] | null {
  switch (value) {
    case "passed":
    case "failed":
    case "partial":
    case "stuck":
      return value;
    default:
      return null;
  }
}

function classifyVerdict(verdict: string): AttemptUpdate["result"] {
  const normalized = verdict.toLowerCase();
  if (normalized.includes("partial") || normalized.includes("partially") || normalized.includes("部分")) return "partial";
  if (normalized.includes("accepted") || hasVerdictToken(normalized, "ac") || verdict.includes("答案正确") || verdict.includes("通过")) return "passed";
  if (verdict.includes("运行超时") || verdict.includes("超出时间限制") || verdict.includes("内存超限") || verdict.includes("超出内存限制") || verdict.includes("段错误")) return "partial";
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
