import { z } from "zod";
import { readCaptureEndpoint } from "./transport";

export const PairCaptureInstallationMessageSchema = z.object({
  type: z.literal("PAIR_CAPTURE_INSTALLATION"),
  code: z.string().min(1),
}).strict();
export type PairCaptureInstallationMessage = z.infer<
  typeof PairCaptureInstallationMessageSchema
>;

const PairCaptureApiResponseSchema = z.object({
  ok: z.literal(true),
  credential: z.string().regex(/^capture_[A-Za-z0-9_-]+$/),
  installationId: z.string().min(1),
  credentialVersion: z.number().int().positive(),
}).strict();

export type PairCaptureResult =
  | {
      readonly ok: true;
      readonly installationId: string;
      readonly credentialVersion: number;
    }
  | { readonly ok: false; readonly error: string };

export function isPairCaptureInstallationMessage(
  value: unknown,
): value is PairCaptureInstallationMessage {
  return PairCaptureInstallationMessageSchema.safeParse(value).success;
}

export function pairingEndpointFromCaptureEndpoint(value: unknown): string {
  const endpoint = new URL(readCaptureEndpoint(value));
  endpoint.pathname = "/api/capture/pair";
  endpoint.search = "";
  endpoint.hash = "";
  return endpoint.toString();
}

export function parsePairCaptureApiResponse(
  value: unknown,
  expectedInstallationId: string,
): {
  readonly credential: string;
  readonly installationId: string;
  readonly credentialVersion: number;
} {
  const parsed = PairCaptureApiResponseSchema.parse(value);
  if (parsed.installationId !== expectedInstallationId) {
    throw new Error("Pairing response installation does not match this extension");
  }
  return {
    credential: parsed.credential,
    installationId: parsed.installationId,
    credentialVersion: parsed.credentialVersion,
  };
}
