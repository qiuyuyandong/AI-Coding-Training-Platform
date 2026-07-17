import { z } from "zod";

/**
 * V0 learning-resource domain enums and schemas.
 *
 * Every enum here mirrors a SQL CHECK constraint declared in
 * `lib/db/migrations/0006_curriculum_catalog.sql` for the
 * `learning_resources` and `node_resources` tables. The matching Zod
 * types live next to the enums so the importer can validate a package
 * against the exact same vocabulary the database accepts.
 */

export const ResourceLanguageSchema = z.enum(["en", "zh-CN", "multilingual"]);
export type ResourceLanguage = z.infer<typeof ResourceLanguageSchema>;

export const ResourceCostSchema = z.enum(["free", "freemium", "paid"]);
export type ResourceCost = z.infer<typeof ResourceCostSchema>;

export const ResourceAccessSchema = z.enum([
  "open",
  "registration",
  "regional_restricted",
]);
export type ResourceAccess = z.infer<typeof ResourceAccessSchema>;

export const LicenseBoundarySchema = z.enum([
  "official_public_docs",
  "permissive_open",
  "deep_link_only",
]);
export type LicenseBoundary = z.infer<typeof LicenseBoundarySchema>;

export const ReviewStatusSchema = z.enum([
  "draft",
  "reviewed",
  "broken",
  "deprecated",
]);
export type ReviewStatus = z.infer<typeof ReviewStatusSchema>;

export const ResourceRoleSchema = z.enum(["primary"]);
export type ResourceRole = z.infer<typeof ResourceRoleSchema>;

/**
 * A learning resource as it appears inside `resources.json`. The validator
 * also requires `review_status === 'reviewed'` and a non-empty
 * `reviewed_at` for any resource bound to a published node, but those
 * package-level rules live in `validatePackage.ts` because they depend on
 * the surrounding graph state.
 */
export const LearningResourceSchema = z.object({
  stable_id: z.string().min(1),
  title: z.string().min(1),
  url: z.string().url(),
  author: z.string().min(1),
  language: ResourceLanguageSchema,
  cost: ResourceCostSchema,
  access: ResourceAccessSchema,
  license_boundary: LicenseBoundarySchema,
  review_status: ReviewStatusSchema,
  reviewed_at: z.string().datetime(),
  stopping_guidance: z.string().min(1),
  node_stable_id: z.string().min(1),
  role: ResourceRoleSchema,
});
export type LearningResource = z.infer<typeof LearningResourceSchema>;