import { z } from "zod";
import { AbilityConfidenceSchema, MappingRoleSchema } from "@/lib/domain/ability";

export const EvidenceSourceTypeSchema = z.enum(["attempt", "project"]);
export type EvidenceSourceType = z.infer<typeof EvidenceSourceTypeSchema>;

export const EvidenceEventTypeSchema = z.enum([
  "result",
  "assistance",
  "snapshot",
  "run",
  "test",
  "reflection",
  "correction",
  "milestone",
]);
export type EvidenceEventType = z.infer<typeof EvidenceEventTypeSchema>;

export const EvidenceCoverageSchema = z.enum(["E1", "E2", "E3", "E4"]);
export type EvidenceCoverage = z.infer<typeof EvidenceCoverageSchema>;

export const TrainingOutcomeSchema = z.enum([
  "independent_effective_completion",
  "assisted_effective_completion",
  "productive_struggle",
  "unproductive_trial_and_error",
  "insufficient_evidence",
]);
export type TrainingOutcome = z.infer<typeof TrainingOutcomeSchema>;

export const CaptureModeSchema = z.enum(["full", "basic", "minimal"]);
export type CaptureMode = z.infer<typeof CaptureModeSchema>;

export const SnapshotEventKindSchema = z.enum([
  "run",
  "submit",
  "test",
  "checkpoint",
  "accepted",
]);
export type SnapshotEventKind = z.infer<typeof SnapshotEventKindSchema>;

export const LearningEvidenceEventSchema = z.object({
  id: z.string().min(1),
  learnerId: z.string().min(1),
  sourceType: EvidenceSourceTypeSchema,
  sourceId: z.string().min(1),
  eventType: EvidenceEventTypeSchema,
  occurredAt: z.string().datetime(),
  factsJson: z.string(),
  provenanceJson: z.string(),
  schemaVersion: z.string().min(1),
  parserVersion: z.string().min(1),
  confidence: AbilityConfidenceSchema,
  supersedesEventId: z.string().nullable(),
  idempotencyKey: z.string().min(1),
  createdAt: z.string().datetime(),
});
export type LearningEvidenceEvent = z.infer<typeof LearningEvidenceEventSchema>;

export const EvidenceNodeMappingSchema = z.object({
  evidenceEventId: z.string().min(1),
  nodeId: z.string().min(1),
  role: MappingRoleSchema,
  strength: z.number().int().min(1).max(100),
  mappingReason: z.string().min(1),
});
export type EvidenceNodeMapping = z.infer<typeof EvidenceNodeMappingSchema>;

export const TrainingSessionSummarySchema = z.object({
  id: z.string().min(1),
  learnerId: z.string().min(1),
  sourceType: EvidenceSourceTypeSchema,
  sourceId: z.string().min(1),
  outcome: TrainingOutcomeSchema,
  coverageLevel: EvidenceCoverageSchema,
  confidence: AbilityConfidenceSchema,
  reasonCodes: z.array(z.string().min(1)),
  unresolvedFacts: z.array(z.string().min(1)),
  evidenceEventIds: z.array(z.string().min(1)),
  classifierVersion: z.string().min(1),
  inputFingerprint: z.string().min(1),
  createdAt: z.string().datetime(),
});
export type TrainingSessionSummary = z.infer<typeof TrainingSessionSummarySchema>;

export const CodeSnapshotRefSchema = z.object({
  id: z.string().min(1),
  learnerId: z.string().min(1),
  sourceType: EvidenceSourceTypeSchema,
  sourceId: z.string().min(1),
  eventKind: SnapshotEventKindSchema,
  captureMode: CaptureModeSchema,
  contentHash: z.string().regex(/^[a-f0-9]{64}$/u),
  language: z.string().nullable(),
  byteSize: z.number().int().nonnegative(),
  storagePath: z.string().nullable(),
  diffFeaturesJson: z.string(),
  capturedAt: z.string().datetime(),
  retentionExpiresAt: z.string().datetime().nullable(),
  deletedAt: z.string().datetime().nullable(),
  idempotencyKey: z.string().min(1),
}).superRefine((value, context) => {
  if ((value.captureMode === "full") !== (value.storagePath !== null)) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Full snapshots require storagePath; basic/minimal snapshots must omit it",
      path: ["storagePath"],
    });
  }
});
export type CodeSnapshotRef = z.infer<typeof CodeSnapshotRefSchema>;
