import { z } from "zod";
import { PlatformSchema } from "@/lib/domain/source";

const BaseCaptureEventSchema = z.object({
  schemaVersion: z.literal(2),
  id: z.string().min(1),
  captureSessionId: z.string().min(1),
  installationId: z.string().min(1),
  adapterVersion: z.string().min(1),
  parserVersion: z.string().min(1),
  pageOrigin: z.string().url(),
  provenanceLevel: z.literal("extension_unpaired"),
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

export const SubmissionObservedEventSchema = BaseCaptureEventSchema.extend({
  type: z.literal("SUBMISSION_OBSERVED"),
  submissionId: z.string().min(1),
  payload: z.object({ action: z.literal("submit_clicked") }).strict(),
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
