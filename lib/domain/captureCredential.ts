import { z } from "zod";

export const CaptureProvenanceLevelSchema = z.enum([
  "extension_unpaired",
  "extension_paired",
  "extension_local",
]);
export type CaptureProvenanceLevel = z.infer<
  typeof CaptureProvenanceLevelSchema
>;
