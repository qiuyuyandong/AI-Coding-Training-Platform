import { z } from "zod";
import { PlatformSchema } from "@/lib/domain/source";
import { CaptureProvenanceLevelSchema } from "@/lib/domain/captureCredential";

const BaseCaptureEventSchema = z.object({
  schemaVersion: z.literal(2),
  id: z.string().min(1),
  captureSessionId: z.string().min(1),
  installationId: z.string().min(1),
  adapterVersion: z.string().min(1),
  parserVersion: z.string().min(1),
  pageOrigin: z.string().url(),
  provenanceLevel: CaptureProvenanceLevelSchema,
  platform: PlatformSchema,
  problemExternalId: z.string().min(1),
  problemTitle: z.string().min(1),
  canonicalUrl: z.string().url(),
  occurredAt: z.string().datetime(),
});

export const SessionStartedEventSchema = BaseCaptureEventSchema.extend({
  type: z.literal("SESSION_STARTED"),
  payload: z.object({ source: z.literal("content_script") }).strict(),
}).strict();

/**
 * Closed action enum for `SUBMISSION_OBSERVED`. Historical V3 captures used
 * `submit_clicked` (DOM click hint inferred from content script); V4 E2
 * confirmed submissions use `submission_confirmed` (server-issued stable
 * submission id matched by the correlator). The enum is additive: legacy
 * payloads remain accepted; the reducer emits `submission_confirmed` only
 * when the projection is driven by A1 E2 / correlator results.
 */
export const SUBMISSION_OBSERVED_ACTIONS = [
  "submit_clicked",
  "submission_confirmed",
] as const;
export type SubmissionObservedAction = typeof SUBMISSION_OBSERVED_ACTIONS[number];

export const SubmissionObservedEventSchema = BaseCaptureEventSchema.extend({
  type: z.literal("SUBMISSION_OBSERVED"),
  submissionId: z.string().min(1),
  payload: z.object({ action: z.enum(SUBMISSION_OBSERVED_ACTIONS) }).strict(),
}).strict();

export const VerdictObservedEventSchema = BaseCaptureEventSchema.extend({
  type: z.literal("VERDICT_OBSERVED"),
  submissionId: z.string().min(1),
  payload: z
    .object({
      verdict: z.string().min(1),
      language: z.string().min(1).optional(),
      result: z.enum(["passed", "failed", "partial", "stuck"]).optional(),
    })
    .strict(),
}).strict();

export const SessionEndedEventSchema = BaseCaptureEventSchema.extend({
  type: z.literal("SESSION_ENDED"),
  payload: z
    .object({
      endReason: z.enum(["pagehide", "spa_navigation", "capture_disabled"]),
    })
    .strict(),
}).strict();

export const CaptureEventSchema = z.discriminatedUnion("type", [
  SessionStartedEventSchema,
  SubmissionObservedEventSchema,
  VerdictObservedEventSchema,
  SessionEndedEventSchema,
]);

export type SessionStartedEvent = z.infer<typeof SessionStartedEventSchema>;
export type SubmissionObservedEvent = z.infer<typeof SubmissionObservedEventSchema>;
export type VerdictObservedEvent = z.infer<typeof VerdictObservedEventSchema>;
export type SessionEndedEvent = z.infer<typeof SessionEndedEventSchema>;
export type CaptureEvent = z.infer<typeof CaptureEventSchema>;

export function stableCaptureEventJson(event: CaptureEvent): string {
  return JSON.stringify(sortJsonValue(CaptureEventSchema.parse(event)));
}

function sortJsonValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortJsonValue);
  if (value === null || typeof value !== "object") return value;

  const sorted: Record<string, unknown> = {};
  for (const key of Object.keys(value).sort()) {
    sorted[key] = sortJsonValue(Reflect.get(value, key));
  }
  return sorted;
}
