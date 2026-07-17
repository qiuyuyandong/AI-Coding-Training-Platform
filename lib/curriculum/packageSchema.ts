import { z } from "zod";
import {
  CareerTrackSchema,
  KnowledgeEdgeSchema,
  KnowledgeNodeSchema,
  PracticeMappingSchema,
} from "@/lib/domain/curriculum";
import { LearningResourceSchema } from "@/lib/domain/resource";

/**
 * On-disk shape of a V0 curriculum package.
 *
 * A package is a directory containing:
 *   - `manifest.json`
 *   - `nodes.json`
 *   - `edges.json`
 *   - `resources.json`
 *   - `practice-mappings.json`
 *
 * `manifest.careers_file` references one companion careers file
 * (e.g. `careers/career-directions-v1.json`) that is loaded and validated
 * alongside the route content. The checksum in the manifest is computed
 * by `validatePackage.ts` from the concatenation of every other file's
 * canonicalised JSON in stable sorted order; this module only declares
 * the shape, the validator enforces the rules.
 *
 * The arrays below use `z.array(...)` rather than `.length(N)` because
 * the count of nine careers and of any resource/practice record is a
 * package-level invariant enforced by the validator with stable error
 * codes; pinning the length here would force every fixture to match
 * production counts and would make the validator error code redundant.
 */

const SemverSchema = z
  .string()
  .regex(/^[0-9]+\.[0-9]+\.[0-9]+$/, "semantic_version must be MAJOR.MINOR.PATCH");

export const PackageManifestSchema = z.object({
  track_slug: z.string().min(1),
  semantic_version: SemverSchema,
  source_revision: z.string().min(1),
  careers_file: z.string().min(1),
  checksum_input: z.string().min(1),
});
export type PackageManifest = z.infer<typeof PackageManifestSchema>;

export const PackageNodesFileSchema = z.array(KnowledgeNodeSchema);
export type PackageNodesFile = z.infer<typeof PackageNodesFileSchema>;

export const PackageEdgesFileSchema = z.array(KnowledgeEdgeSchema);
export type PackageEdgesFile = z.infer<typeof PackageEdgesFileSchema>;

export const PackageResourcesFileSchema = z.array(LearningResourceSchema);
export type PackageResourcesFile = z.infer<typeof PackageResourcesFileSchema>;

export const PackagePracticeMappingsFileSchema = z.array(PracticeMappingSchema);
export type PackagePracticeMappingsFile = z.infer<
  typeof PackagePracticeMappingsFileSchema
>;

export const PackageCareersFileSchema = z.object({
  careers: z.array(CareerTrackSchema),
});
export type PackageCareersFile = z.infer<typeof PackageCareersFileSchema>;

/**
 * Bundle of every file the validator needs in memory. The importer loads
 * this once from disk and never re-parses JSON inside the transaction.
 */
export const CurriculumPackageSchema = z.object({
  manifest: PackageManifestSchema,
  nodes: PackageNodesFileSchema,
  edges: PackageEdgesFileSchema,
  resources: PackageResourcesFileSchema,
  practiceMappings: PackagePracticeMappingsFileSchema,
  careers: PackageCareersFileSchema,
});
export type CurriculumPackage = z.infer<typeof CurriculumPackageSchema>;