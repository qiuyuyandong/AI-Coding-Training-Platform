import { z } from "zod";
import { PlatformSchema } from "@/lib/domain/source";

/**
 * V0 curriculum domain enums and schemas.
 *
 * Every enum in this file mirrors a SQL CHECK constraint declared in
 * `lib/db/migrations/0006_curriculum_catalog.sql`. Adding, removing, or
 * renaming a member without updating the matching CHECK (or vice versa) is
 * a verifier failure: the importer rejects packages whose values cannot be
 * persisted, and the migration tests assert that every CHECK accepts all
 * members here and rejects exactly one known invalid value.
 */

export const CareerStatusSchema = z.enum(["published", "planned"]);
export type CareerStatus = z.infer<typeof CareerStatusSchema>;

export const KnowledgeNodeStatusSchema = z.enum([
  "planned",
  "draft",
  "published",
  "deprecated",
]);
export type KnowledgeNodeStatus = z.infer<typeof KnowledgeNodeStatusSchema>;

export const KnowledgeEdgeTypeSchema = z.enum([
  "required_prerequisite",
  "recommended_prerequisite",
]);
export type KnowledgeEdgeType = z.infer<typeof KnowledgeEdgeTypeSchema>;

export const PracticeKindSchema = z.enum([
  "oj",
  "manual_exercise",
  "implementation",
  "debugging",
  "variant",
  "review",
  "project_milestone",
]);
export type PracticeKind = z.infer<typeof PracticeKindSchema>;

export const DifficultyBandSchema = z.enum([
  "intro",
  "easy",
  "medium",
  "hard",
]);
export type DifficultyBand = z.infer<typeof DifficultyBandSchema>;

export const MappingRoleSchema = z.enum(["primary", "supporting"]);
export type MappingRole = z.infer<typeof MappingRoleSchema>;

/**
 * Career track summary carried inside the `careers.json` file. Every field
 * is required; the importer refuses a career record with any missing
 * string, an empty array, a missing representative project or a
 * non-positive reviewed timestamp. The literal `true` on
 * `unavailable_in_v0` is enforced at the Zod layer so packages that omit
 * or change the deep-route gate cannot slip into production.
 */
export const CareerTrackSummarySchema = z.object({
  purpose: z.string().min(1),
  representative_roles: z.array(z.string().min(1)).min(1),
  common_foundation_dependencies: z.array(z.string().min(1)).min(1),
  direction_specific_module_names: z.array(z.string().min(1)).min(1),
  coarse_order: z.array(z.string().min(1)).min(1),
  representative_project: z.string().min(1),
  provenance: z.string().min(1),
  reviewed_at: z.string().datetime(),
  unavailable_in_v0: z.literal(true),
});
export type CareerTrackSummary = z.infer<typeof CareerTrackSummarySchema>;

export const CareerTrackSchema = z.object({
  slug: z.string().min(1),
  name: z.string().min(1),
  status: CareerStatusSchema,
  summary: CareerTrackSummarySchema,
});
export type CareerTrack = z.infer<typeof CareerTrackSchema>;

export const KnowledgeNodeProvenanceSchema = z.object({
  authority: z.string().min(1),
  url: z.string().url(),
  retrieved_at: z.string().datetime(),
});
export type KnowledgeNodeProvenance = z.infer<
  typeof KnowledgeNodeProvenanceSchema
>;

export const KnowledgeNodeSchema = z.object({
  stable_id: z.string().min(1),
  title: z.string().min(1),
  outcome: z.string().min(1),
  rationale: z.string().min(1),
  order_index: z.number().int(),
  status: KnowledgeNodeStatusSchema,
  provenance: KnowledgeNodeProvenanceSchema,
  stopping_guidance: z.string().min(1),
});
export type KnowledgeNode = z.infer<typeof KnowledgeNodeSchema>;

export const KnowledgeEdgeSchema = z.object({
  from_stable_id: z.string().min(1),
  to_stable_id: z.string().min(1),
  edge_type: KnowledgeEdgeTypeSchema,
});
export type KnowledgeEdge = z.infer<typeof KnowledgeEdgeSchema>;

export const PracticeSourceSchema = z.object({
  platform: PlatformSchema,
  external_id: z.string().min(1),
  url: z.string().url(),
  is_primary: z.boolean(),
});
export type PracticeSource = z.infer<typeof PracticeSourceSchema>;

export const PracticeMappingSchema = z.object({
  node_stable_id: z.string().min(1),
  practice_task_stable_id: z.string().min(1),
  canonical_problem_stable_id: z.string().min(1),
  title: z.string().min(1),
  kind: PracticeKindSchema,
  difficulty_band: DifficultyBandSchema,
  sources: z.array(PracticeSourceSchema).min(1),
});
export type PracticeMapping = z.infer<typeof PracticeMappingSchema>;
