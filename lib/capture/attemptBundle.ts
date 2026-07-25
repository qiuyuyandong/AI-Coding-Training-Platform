import { z } from "zod";
import { AttemptResultSchema } from "@/lib/domain/training";
import {
  SessionEndedEventSchema,
  SessionStartedEventSchema,
  SubmissionObservedEventSchema,
  VerdictObservedEventSchema,
} from "./protocol";
import { isFinalCaptureVerdict } from "./verdictTaxonomy";

export { FINAL_CAPTURE_VERDICTS } from "./verdictTaxonomy";

export const SessionStartedBundleEventSchema = SessionStartedEventSchema;
export const SubmissionObservedBundleEventSchema = SubmissionObservedEventSchema;
export const VerdictObservedBundleEventSchema = VerdictObservedEventSchema;
export const SessionEndedBundleEventSchema = SessionEndedEventSchema;

export const CaptureAttemptBundleSchema = z.object({
  schemaVersion: z.literal(1),
  bundleId: z.string().min(1),
  events: z.tuple([
    SessionStartedBundleEventSchema,
    SubmissionObservedBundleEventSchema,
    VerdictObservedBundleEventSchema,
    SessionEndedBundleEventSchema,
  ]),
}).strict().superRefine((bundle, context) => {
  const [started, submitted, verdict, ended] = bundle.events;
  const sameSession = bundle.events.every(
    (event) => event.captureSessionId === started.captureSessionId
      && event.installationId === started.installationId
      && event.adapterVersion === started.adapterVersion
      && event.parserVersion === started.parserVersion
      && event.pageOrigin === started.pageOrigin
      && event.provenanceLevel === started.provenanceLevel
      && event.platform === started.platform
      && event.problemExternalId === started.problemExternalId
      && event.problemTitle === started.problemTitle
      && event.canonicalUrl === started.canonicalUrl,
  );
  const sameSubmission = submitted.submissionId === verdict.submissionId;
  const chronological = submitted.occurredAt <= verdict.occurredAt
    && verdict.occurredAt <= ended.occurredAt
    && started.occurredAt <= submitted.occurredAt;
  const finalVerdict = isFinalCaptureVerdict(verdict.payload.verdict);
  if (!sameSession || !sameSubmission || !chronological || !finalVerdict) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Capture attempt bundle identity or chronology is inconsistent",
    });
  }
  // The `submission_confirmed` action is reserved for V4 E2-driven bundles;
  // V3 historical bundles retain `submit_clicked`. We intentionally do not
  // require any specific action here so legacy bundles keep validating.
  void submitted.payload.action;
});

export type CaptureAttemptBundle = z.infer<typeof CaptureAttemptBundleSchema>;

export const CaptureAttemptAckSchema = z.object({
  ok: z.literal(true),
  bundleId: z.string().min(1),
  captureSessionId: z.string().min(1),
  attemptId: z.string().min(1),
  attemptStatus: AttemptResultSchema,
  replayed: z.boolean(),
}).strict();

export type CaptureAttemptAck = z.infer<typeof CaptureAttemptAckSchema>;

export function buildCaptureAttemptAck(input: {
  readonly bundleId: string;
  readonly captureSessionId: string;
  readonly attemptId: string;
  readonly attemptStatus: z.infer<typeof AttemptResultSchema>;
  readonly replayed: boolean;
}): CaptureAttemptAck {
  return {
    ok: true,
    bundleId: input.bundleId,
    captureSessionId: input.captureSessionId,
    attemptId: input.attemptId,
    attemptStatus: input.attemptStatus,
    replayed: input.replayed,
  };
}
