import { z } from "zod";

export const PlatformSchema = z.enum([
  "leetcode",
  "nowcoder",
  "luogu",
  "codeforces",
  "atcoder",
  "manual",
]);

export type Platform = z.infer<typeof PlatformSchema>;

export const SourceSchema = z.object({
  id: z.string().min(1),
  platform: PlatformSchema,
  name: z.string().min(1),
  homepage: z.string().url(),
  integrationMode: z.enum(["metadata_api", "deep_link", "extension_capture", "manual"]),
  statementPolicy: z.enum(["never_cache", "licensed_only", "user_local_only", "manual"]),
  supportsSubmissionSync: z.boolean(),
  riskLevel: z.enum(["low", "medium", "high"]),
  enabled: z.boolean(),
});

export type Source = z.infer<typeof SourceSchema>;
