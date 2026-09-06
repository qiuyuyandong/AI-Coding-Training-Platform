import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import type { PreparedArtifact } from "@/lib/services/artifactIntake";

export function storeFullArtifact(
  storageRoot: string,
  artifact: PreparedArtifact,
  content: string,
): PreparedArtifact {
  if (artifact.captureMode !== "full") return artifact;
  const root = resolve(storageRoot);
  const path = resolve(root, `${artifact.contentHash}.snapshot`);
  if (!path.startsWith(`${root}\\`) && path !== root) throw new RangeError("Snapshot path escaped storage root");
  mkdirSync(root, { recursive: true });
  if (existsSync(path)) {
    if (readFileSync(path, "utf8") !== content) throw new Error("Snapshot hash collision");
  } else {
    writeFileSync(path, content, { encoding: "utf8", flag: "wx" });
  }
  return { ...artifact, reference: path };
}

export function deleteStoredArtifact(storageRoot: string, reference: string): boolean {
  const root = resolve(storageRoot);
  const path = resolve(reference);
  if (!path.startsWith(`${root}\\`) || !path.endsWith(".snapshot")) {
    throw new RangeError("Stored artifact reference is outside the evidence store");
  }
  if (!existsSync(path)) return false;
  unlinkSync(path);
  return true;
}
