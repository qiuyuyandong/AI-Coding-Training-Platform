// Build the canonical checksum_input for a curriculum package directory.
// Usage: node compute-checksum.mjs <package-path>
import { readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { createHash } from "node:crypto";

const packagePath = resolve(process.argv[2] ?? ".");

function canonicalize(value) {
  if (value === null) return "null";
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error("non-finite");
    return JSON.stringify(value);
  }
  if (typeof value === "string" || typeof value === "boolean") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map(canonicalize).join(",")}]`;
  }
  if (typeof value === "object") {
    const obj = value;
    const keys = Object.keys(obj).sort();
    const body = keys
      .map((k) => `${JSON.stringify(k)}:${canonicalize(obj[k])}`)
      .join(",");
    return `{${body}}`;
  }
  throw new Error(`cannot canonicalize ${typeof value}`);
}

const manifest = JSON.parse(
  readFileSync(join(packagePath, "manifest.json"), "utf8"),
);

const entries = [
  [manifest.careers_file, JSON.parse(readFileSync(join(packagePath, manifest.careers_file), "utf8"))],
  ["edges.json", JSON.parse(readFileSync(join(packagePath, "edges.json"), "utf8"))],
  ["nodes.json", JSON.parse(readFileSync(join(packagePath, "nodes.json"), "utf8"))],
  ["practice-mappings.json", JSON.parse(readFileSync(join(packagePath, "practice-mappings.json"), "utf8"))],
  ["resources.json", JSON.parse(readFileSync(join(packagePath, "resources.json"), "utf8"))],
];

const sorted = entries.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
const checksumInput = sorted.map(([, v]) => canonicalize(v)).join("\n");
const checksum = createHash("sha256").update(checksumInput, "utf8").digest("hex");

console.log(JSON.stringify({ checksumInput, checksum }, null, 2));

// Patch the manifest with the computed checksum_input
manifest.checksum_input = checksumInput;
writeFileSync(join(packagePath, "manifest.json"), JSON.stringify(manifest, null, 2));
console.log(`Updated ${join(packagePath, "manifest.json")} with checksum_input.`);
console.log(`checksum: ${checksum}`);