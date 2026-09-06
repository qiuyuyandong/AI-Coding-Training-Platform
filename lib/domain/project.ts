import { z } from "zod";
import { CaptureModeSchema } from "@/lib/domain/evidence";

export const ProjectTemplateStatusSchema = z.enum(["draft", "published", "deprecated"]);
export const LearnerProjectStatusSchema = z.enum(["active", "completed", "archived"]);
export const ProjectSessionStatusSchema = z.enum(["active", "completed", "cancelled"]);
export const RunResultKindSchema = z.enum(["build", "test", "check"]);
export const RunResultSchema = z.enum(["passed", "failed", "not_run"]);
export const RunResultProvenanceSchema = z.enum(["user_entered", "explicit_import"]);
export const ArtifactKindSchema = z.enum([
  "snapshot",
  "checksum",
  "diff",
  "test_summary",
  "commit_reference",
]);
export const ProjectMilestoneStatusSchema = z.enum([
  "started",
  "working",
  "tested",
  "refined",
  "retrospective",
  "completed",
]);

export const ProjectTemplateSchema = z.object({
  id: z.string().min(1),
  stableId: z.string().min(1),
  version: z.string().min(1),
  title: z.string().min(1),
  summary: z.string().min(1),
  language: z.string().min(1),
  definitionHash: z.string().regex(/^[a-f0-9]{64}$/u),
  status: ProjectTemplateStatusSchema,
  createdAt: z.string().datetime(),
});
export type ProjectTemplate = z.infer<typeof ProjectTemplateSchema>;

export const ProjectTemplateMilestoneSchema = z.object({
  id: z.string().min(1),
  templateId: z.string().min(1),
  stableId: z.string().min(1),
  title: z.string().min(1),
  outcome: z.string().min(1),
  orderIndex: z.number().int().nonnegative(),
  unfamiliarChange: z.boolean(),
  rubricVersion: z.string().min(1),
});
export type ProjectTemplateMilestone = z.infer<typeof ProjectTemplateMilestoneSchema>;

export const ProjectTemplateDefinitionSchema = z.object({
  stableId: z.string().min(1),
  version: z.string().min(1),
  title: z.string().min(1),
  summary: z.string().min(1),
  language: z.string().min(1),
  milestones: z.array(z.object({
    stableId: z.string().min(1),
    title: z.string().min(1),
    outcome: z.string().min(1),
    unfamiliarChange: z.boolean(),
    rubricVersion: z.string().min(1),
    nodes: z.array(z.object({
      stableId: z.string().min(1),
      role: z.enum(["primary", "supporting"]),
    })).min(1),
  })).min(1),
});
export type ProjectTemplateDefinition = z.infer<typeof ProjectTemplateDefinitionSchema>;

export const LearnerProjectSchema = z.object({
  id: z.string().min(1),
  learnerId: z.string().min(1),
  templateId: z.string().min(1),
  title: z.string().min(1),
  captureMode: CaptureModeSchema,
  status: LearnerProjectStatusSchema,
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type LearnerProject = z.infer<typeof LearnerProjectSchema>;

export const ProjectPracticeSessionSchema = z.object({
  id: z.string().min(1),
  learnerProjectId: z.string().min(1),
  learnerId: z.string().min(1),
  templateMilestoneId: z.string().min(1),
  practiceTaskId: z.string().nullable(),
  language: z.string().min(1),
  toolchainLabel: z.string().max(100).nullable(),
  provenanceJson: z.string(),
  status: ProjectSessionStatusSchema,
  startedAt: z.string().datetime(),
  endedAt: z.string().datetime().nullable(),
});
export type ProjectPracticeSession = z.infer<typeof ProjectPracticeSessionSchema>;

export const ExplicitRunResultSchema = z.object({
  id: z.string().min(1),
  projectSessionId: z.string().min(1),
  kind: RunResultKindSchema,
  result: RunResultSchema,
  exitCode: z.number().int().nullable(),
  diagnostics: z.string().max(4000).nullable(),
  provenance: RunResultProvenanceSchema,
  supersedesResultId: z.string().nullable(),
  idempotencyKey: z.string().min(1),
  recordedAt: z.string().datetime(),
});
export type ExplicitRunResult = z.infer<typeof ExplicitRunResultSchema>;

export const ArtifactEvidenceSchema = z.object({
  id: z.string().min(1),
  projectSessionId: z.string().min(1),
  kind: ArtifactKindSchema,
  purpose: z.string().min(1).max(200),
  captureMode: CaptureModeSchema,
  contentHash: z.string().regex(/^[a-f0-9]{64}$/u),
  byteSize: z.number().int().nonnegative(),
  reference: z.string().nullable(),
  previewJson: z.string(),
  idempotencyKey: z.string().min(1),
  recordedAt: z.string().datetime(),
  deletedAt: z.string().datetime().nullable(),
});
export type ArtifactEvidence = z.infer<typeof ArtifactEvidenceSchema>;

export const RubricScoresSchema = z.object({
  function: z.number().int().min(0).max(3),
  design: z.number().int().min(0).max(3),
  testing: z.number().int().min(0).max(3),
  integration: z.number().int().min(0).max(3),
  maintainability: z.number().int().min(0).max(3),
  robustness: z.number().int().min(0).max(3),
  explanation: z.number().int().min(0).max(3),
  transfer: z.number().int().min(0).max(3),
});
export type RubricScores = z.infer<typeof RubricScoresSchema>;

export function rubricPasses(scores: RubricScores): boolean {
  return scores.function >= 2
    && scores.testing >= 2
    && scores.integration >= 2
    && scores.explanation >= 2;
}
