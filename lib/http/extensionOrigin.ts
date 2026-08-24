import { CAPTURE_EXTENSION_ORIGIN } from "@/lib/extension/identity";

export function isExactCaptureExtensionOrigin(origin: string | null): boolean {
  return origin === CAPTURE_EXTENSION_ORIGIN;
}
