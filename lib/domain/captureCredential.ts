import { z } from "zod";

export const CaptureProvenanceLevelSchema = z.enum([
  "extension_unpaired",
  "extension_paired",
]);
export type CaptureProvenanceLevel = z.infer<
  typeof CaptureProvenanceLevelSchema
>;

export const CaptureInstallationStatusSchema = z.enum(["active", "revoked"]);
export type CaptureInstallationStatus = z.infer<
  typeof CaptureInstallationStatusSchema
>;

export const CaptureInstallationSchema = z.object({
  installationId: z.string().min(1),
  credentialHash: z.string().regex(/^[a-f0-9]{64}$/),
  credentialVersion: z.number().int().positive(),
  status: CaptureInstallationStatusSchema,
  createdAt: z.string().datetime(),
  rotatedAt: z.string().datetime().optional(),
  revokedAt: z.string().datetime().optional(),
  lastSeenAt: z.string().datetime().optional(),
}).superRefine((installation, context) => {
  if ((installation.status === "revoked") !== (installation.revokedAt !== undefined)) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Revoked installations require a revocation time",
    });
  }
});
export type CaptureInstallation = z.infer<typeof CaptureInstallationSchema>;

export const CapturePairingCodeRecordSchema = z.object({
  id: z.string().min(1),
  codeHash: z.string().regex(/^[a-f0-9]{64}$/),
  targetInstallationId: z.string().min(1).optional(),
  expiresAt: z.string().datetime(),
  consumedAt: z.string().datetime().optional(),
  createdAt: z.string().datetime(),
});
export type CapturePairingCodeRecord = z.infer<
  typeof CapturePairingCodeRecordSchema
>;
