import { z } from "zod";

export const AbilityLevelSchema = z.enum(["unassessed", "L1", "L2", "L3", "L4", "L5"]);
export type AbilityLevel = z.infer<typeof AbilityLevelSchema>;

export const AbilityConfidenceSchema = z.enum(["low", "medium", "high"]);
export type AbilityConfidence = z.infer<typeof AbilityConfidenceSchema>;

export const MappingRoleSchema = z.enum(["primary", "supporting"]);
export type MappingRole = z.infer<typeof MappingRoleSchema>;

export const AttemptNodeMappingRowSchema = z.object({
  id: z.string().min(1),
  attempt_id: z.string().min(1),
  node_id: z.string().min(1),
  role: MappingRoleSchema,
  mapping_reason: z.string().min(1),
  created_at: z.string().datetime(),
});
export type AttemptNodeMappingRow = z.infer<typeof AttemptNodeMappingRowSchema>;

export const AbilitySnapshotRowSchema = z.object({
  learner_id: z.string().min(1),
  node_id: z.string().min(1),
  visible_level: AbilityLevelSchema,
  confidence: AbilityConfidenceSchema,
  evidence_count: z.number().int().nonnegative(),
  stale: z.boolean(),
  input_fingerprint: z.string().min(1),
  projection_version: z.string().min(1),
  as_of_time: z.string().datetime(),
});
export type AbilitySnapshotRow = z.infer<typeof AbilitySnapshotRowSchema>;

export const AbilityTransitionRowSchema = z.object({
  id: z.string().min(1),
  learner_id: z.string().min(1),
  node_id: z.string().min(1),
  previous_level: AbilityLevelSchema,
  new_level: AbilityLevelSchema,
  reason_codes_json: z.string().min(1),
  source_attempt_ids_json: z.string().min(1),
  source_attempt_revisions_json: z.string().min(1),
  input_fingerprint: z.string().min(1),
  projection_version: z.string().min(1),
  created_at: z.string().datetime(),
});
export type AbilityTransitionRow = z.infer<typeof AbilityTransitionRowSchema>;