import { createHash } from "node:crypto";
import { stableCaptureEventJson, type CaptureEvent } from "./protocol";

export function captureEventFingerprint(event: CaptureEvent): string {
  return createHash("sha256").update(stableCaptureEventJson(event)).digest("hex");
}
