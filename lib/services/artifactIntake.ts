import { createHash } from "node:crypto";
import { basename, extname, isAbsolute, normalize, sep } from "node:path";
import { ArtifactKindSchema, type ArtifactEvidence } from "@/lib/domain/project";
import { CaptureModeSchema } from "@/lib/domain/evidence";

const MAX_ARTIFACT_BYTES = 64 * 1024;
const ALLOWED_EXTENSIONS = new Set([".c", ".cc", ".cpp", ".cxx", ".h", ".hpp", ".md", ".txt", ".json", ".diff", ".patch"]);
const SECRET_FILE = /^(?:\.env(?:\..*)?|id_(?:rsa|dsa|ecdsa|ed25519)|.*\.(?:pem|key|p12|pfx))$/iu;
const SECRET_CONTENT = /(?:-----BEGIN [A-Z ]*PRIVATE KEY-----|(?:api[_-]?key|secret|token|password)\s*[:=]\s*["'][^"']{8,}["'])/iu;

export type ArtifactIntakeInput = {
  readonly projectSessionId: string;
  readonly kind: ArtifactEvidence["kind"];
  readonly purpose: string;
  readonly captureMode: ArtifactEvidence["captureMode"];
  readonly relativePath?: string;
  readonly content?: string;
  readonly reference?: string;
  readonly idempotencyKey: string;
  readonly recordedAt: string;
};

export type PreparedArtifact = Omit<ArtifactEvidence, "id" | "deletedAt">;

export function prepareArtifactEvidence(input: ArtifactIntakeInput): PreparedArtifact {
  const kind = ArtifactKindSchema.parse(input.kind);
  const captureMode = CaptureModeSchema.parse(input.captureMode);
  const purpose = input.purpose.trim();
  if (purpose.length === 0 || purpose.length > 200) throw new RangeError("purpose must contain 1-200 characters");
  const path = input.relativePath === undefined ? null : validateRelativePath(input.relativePath);
  const content = input.content ?? "";
  const byteSize = Buffer.byteLength(content, "utf8");
  if (byteSize > MAX_ARTIFACT_BYTES) throw new RangeError(`artifact exceeds ${MAX_ARTIFACT_BYTES} bytes`);
  if (content.length > 0 && SECRET_CONTENT.test(content)) throw new RangeError("artifact contains a secret-like value");
  if (captureMode === "minimal" && content.length > 0) throw new RangeError("minimal capture mode cannot include artifact content");
  if (kind === "commit_reference" && !/^[a-f0-9]{7,64}$/u.test(input.reference ?? "")) {
    throw new RangeError("commit reference must be a 7-64 character hexadecimal object id");
  }
  if ((kind === "snapshot" || kind === "diff") && captureMode !== "minimal" && content.length === 0) {
    throw new RangeError(`${kind} content is required outside minimal capture mode`);
  }
  const digestSource = content.length > 0 ? content : `${kind}:${input.reference ?? ""}`;
  return {
    projectSessionId: input.projectSessionId,
    kind,
    purpose,
    captureMode,
    contentHash: createHash("sha256").update(digestSource).digest("hex"),
    byteSize,
    reference: captureMode === "full" ? (path ?? input.reference ?? null) : input.reference ?? null,
    previewJson: JSON.stringify({
      path,
      lines: content.length === 0 ? 0 : content.split(/\r?\n/u).length,
      redacted: captureMode !== "full",
    }),
    idempotencyKey: input.idempotencyKey,
    recordedAt: input.recordedAt,
  };
}

function validateRelativePath(value: string): string {
  const normalized = normalize(value.trim());
  const segments = normalized.split(sep);
  if (
    normalized.length === 0
    || normalized === "."
    || isAbsolute(normalized)
    || /^[A-Za-z]:/u.test(normalized)
    || segments.includes("..")
  ) {
    throw new RangeError("artifact path must stay inside the explicitly selected workspace");
  }
  const fileName = basename(normalized);
  if (SECRET_FILE.test(fileName)) throw new RangeError("secret-like files cannot be attached");
  const extension = extname(fileName).toLowerCase();
  if (!ALLOWED_EXTENSIONS.has(extension)) throw new RangeError(`unsupported artifact extension '${extension}'`);
  return normalized;
}
