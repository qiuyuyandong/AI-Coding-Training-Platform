import { existsSync, readFileSync, realpathSync, statSync } from "node:fs";
import { dirname, isAbsolute, relative, resolve } from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "..");

const readinessPath = resolve(repoRoot, "docs/superpowers/specs/v4-adapter-readiness.json");
const registryPath = resolve(repoRoot, "extension/src/adapters/registry.ts");
const contractPath = resolve(repoRoot, "tests/helpers/v4AdapterReadinessContract.cjs");

const requireFromCwd = createRequire(new URL(`file://${repoRoot}/`));

function loadContract() {
  if (!existsSync(contractPath)) {
    throw new Error(`missing readiness contract at ${contractPath}`);
  }
  const moduleRef = requireFromCwd(contractPath);
  if (typeof moduleRef.validateV4AdapterReadinessRecord !== "function") {
    throw new Error("readiness contract missing validateV4AdapterReadinessRecord export");
  }
  return moduleRef;
}

function registryStatuses(text) {
  const lines = text.split(/\r?\n/);
  const statuses = new Map();
  let inRecord = false;
  let currentPlatform = null;
  let depth = 0;
  for (const line of lines) {
    const trimmed = line.replace(/\/\/.*$/, "");
    const openCount = (trimmed.match(/\{/g) ?? []).length;
    const closeCount = (trimmed.match(/\}/g) ?? []).length;
    if (!inRecord && /^\s{2}([a-z]+):\s*\{\s*$/.test(line)) {
      const platformMatch = /^\s{2}([a-z]+):\s*\{\s*$/.exec(line);
      currentPlatform = platformMatch[1];
      inRecord = true;
      depth = 1;
      continue;
    }
    if (inRecord) {
      depth += openCount - closeCount;
      if (depth === 0) {
        inRecord = false;
        currentPlatform = null;
        continue;
      }
      if (currentPlatform !== null) {
        const statusMatch = /v4NetworkStatus:\s*"([a-z]+)"/.exec(trimmed);
        if (statusMatch) {
          statuses.set(currentPlatform, statusMatch[1]);
        }
      }
    }
  }
  return statuses;
}

function evidencePathExists(repoRoot, evidencePath) {
  if (typeof evidencePath !== "string") return false;
  const normalized = evidencePath.replace(/\\/g, "/").trim();
  if (normalized.length === 0) return false;
  if (normalized.startsWith("/")) return false;
  if (/^[a-zA-Z]:\//.test(normalized)) return false;
  if (normalized.split("/").includes("..")) return false;
  try {
    const realRepoRoot = realpathSync(repoRoot);
    const realEvidencePath = realpathSync(resolve(realRepoRoot, normalized));
    const relativePath = relative(realRepoRoot, realEvidencePath);
    if (relativePath === "" || relativePath === ".."
      || relativePath.startsWith(`..${process.platform === "win32" ? "\\" : "/"}`)
      || isAbsolute(relativePath)) {
      return false;
    }
    return statSync(realEvidencePath).isFile();
  } catch {
    return false;
  }
}

export function validateV4AdapterReadiness(document, registryText, repoRoot = process.cwd()) {
  if (typeof document !== "object" || document === null || Array.isArray(document)) {
    return ["readiness document must be an object"];
  }
  const records = document.records;
  if (!Array.isArray(records)) return ["records must be an array"];

  let contract;
  try {
    contract = loadContract();
  } catch (error) {
    return [`contract unavailable: ${error instanceof Error ? error.message : String(error)}`];
  }
  const { validateV4AdapterReadinessRecord } = contract;
  const failures = [];
  const statuses = registryStatuses(registryText);
  const recordedPlatforms = new Set();
  for (const record of records) {
    const recordFailures = validateV4AdapterReadinessRecord(record);
    const platform = typeof record === "object" && record !== null && typeof record.platform === "string"
      ? record.platform
      : "unknown";
    for (const failure of recordFailures) failures.push(`${platform}: ${failure}`);
    if (typeof platform !== "string") continue;
    if (recordedPlatforms.has(platform)) failures.push(`${platform}: duplicate record`);
    recordedPlatforms.add(platform);
    const registryStatus = statuses.get(platform);
    if (registryStatus === undefined) {
      failures.push(`${platform}: absent from registry`);
    } else if (registryStatus !== record.status) {
      failures.push(`${platform}: docs/registry status disagreement`);
    }
    if (typeof record === "object" && record !== null && record.status !== "disabled") {
      if (!evidencePathExists(repoRoot, record.characterization?.source)) {
        failures.push(`${platform}: characterization source must exist as a repository file`);
      }
      if (!evidencePathExists(repoRoot, record.realObservation)) {
        failures.push(`${platform}: real observation must exist as a repository file`);
      }
    }
  }

  for (const [platform, status] of statuses) {
    if (status !== "uncharacterized" && !recordedPlatforms.has(platform)) {
      failures.push(`${platform}: characterized registry status requires a readiness record`);
    }
  }
  return failures;
}

function main() {
  if (process.argv[2] !== "--all") {
    console.error("usage: node scripts/validate-v4-adapter-readiness.mjs --all");
    process.exitCode = 2;
    return;
  }
  const resolvedReadinessPath = resolve(readinessPath);
  const resolvedRegistryPath = resolve(registryPath);
  if (!existsSync(resolvedReadinessPath) || !existsSync(resolvedRegistryPath)) {
    console.error("V4 adapter readiness FAIL: required source is unreadable");
    process.exitCode = 1;
    return;
  }
  let document;
  try {
    document = JSON.parse(readFileSync(resolvedReadinessPath, "utf8"));
  } catch {
    console.error("V4 adapter readiness FAIL: invalid readiness JSON");
    process.exitCode = 1;
    return;
  }
  const failures = validateV4AdapterReadiness(
    document,
    readFileSync(resolvedRegistryPath, "utf8"),
    repoRoot,
  );
  if (failures.length > 0) {
    for (const failure of failures) console.error(`- ${failure}`);
    process.exitCode = 1;
    return;
  }
  console.log("V4 adapter readiness PASS");
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) main();
