import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import type { PreparedArtifact } from "@/lib/services/artifactIntake";

export function storeFullArtifact(
  storageRoot: string,
  artifact: PreparedArtifact,
  content: string,
): PreparedArtifact {
  return storeFullArtifactWithReceipt(storageRoot, artifact, content).artifact;
}

export type StoredArtifactReceipt = {
  readonly artifact: PreparedArtifact;
  readonly created: boolean;
};

export function storeFullArtifactWithReceipt(
  storageRoot: string,
  artifact: PreparedArtifact,
  content: string,
): StoredArtifactReceipt {
  if (artifact.captureMode !== "full") return { artifact, created: false };
  const root = resolve(storageRoot);
  const path = resolve(root, `${artifact.contentHash}.snapshot`);
  if (!path.startsWith(`${root}\\`) && path !== root) throw new RangeError("Snapshot path escaped storage root");
  mkdirSync(root, { recursive: true });
  let created = false;
  if (existsSync(path)) {
    if (readFileSync(path, "utf8") !== content) throw new Error("Snapshot hash collision");
  } else {
    writeFileSync(path, content, { encoding: "utf8", flag: "wx" });
    created = true;
  }
  return { artifact: { ...artifact, reference: path }, created };
}

export function deleteStoredArtifact(storageRoot: string, reference: string): boolean {
  const path = resolveStoredArtifactPath(storageRoot, reference);
  if (!existsSync(path)) return false;
  unlinkSync(path);
  return true;
}

export type DeletedArtifactReceipt = {
  readonly reference: string;
  readonly content: string;
};

export function deleteStoredArtifactWithReceipt(
  storageRoot: string,
  reference: string,
): DeletedArtifactReceipt | null {
  const path = resolveStoredArtifactPath(storageRoot, reference);
  if (!existsSync(path)) return null;
  const content = readFileSync(path, "utf8");
  unlinkSync(path);
  return { reference: path, content };
}

export function restoreStoredArtifact(
  storageRoot: string,
  receipt: DeletedArtifactReceipt,
): void {
  const path = resolveStoredArtifactPath(storageRoot, receipt.reference);
  mkdirSync(resolve(storageRoot), { recursive: true });
  if (existsSync(path)) {
    if (readFileSync(path, "utf8") !== receipt.content) throw new Error("Cannot restore snapshot over different content");
    return;
  }
  writeFileSync(path, receipt.content, { encoding: "utf8", flag: "wx" });
}

function resolveStoredArtifactPath(storageRoot: string, reference: string): string {
  const root = resolve(storageRoot);
  const path = resolve(reference);
  if (!path.startsWith(`${root}\\`) || !path.endsWith(".snapshot")) {
    throw new RangeError("Stored artifact reference is outside the evidence store");
  }
  return path;
}
