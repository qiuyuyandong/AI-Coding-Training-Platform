#!/usr/bin/env node

import { existsSync, readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { parseArgs } from "node:util";
import {
  auditV4ExtensionPrivacy,
  loadV4ExtensionPrivacyAuditInput,
} from "./audit-v4-extension-privacy.mjs";
import { validateV4AdapterReadiness } from "./validate-v4-adapter-readiness.mjs";

const repoRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));

export const CANDIDATE_ALLOWED_PATHS = Object.freeze([
  "docs/superpowers/plans/2026-08-03-v4-phase-d-upgrade-restart-update-rollback-reliability.md",
  "docs/superpowers/plans/2026-08-06-v4-phase-d-d4-e3-candidate-coordinator-repair.md",
  "docs/superpowers/plans/2026-08-10-v4-phase-d-d4-nowcoder-e3-identity-repair.md",
  "docs/superpowers/plans/2026-08-23-v4-phase-d-cross-project-capture-chain-reliability-repair.md",
  "extension/manifest.json",
  "extension/build.mjs",
  "extension/src/attemptStorage.ts",
  "extension/src/adapters/leetcode/network.ts",
  "extension/src/background.ts",
  "extension/src/backgroundOrchestrator.ts",
  "extension/src/backgroundPersistence.ts",
  "extension/src/captureErrorPrivacy.ts",
  "extension/src/captureIngressReliability.ts",
  "extension/src/captureRecovery.ts",
  "extension/src/captureTransport.ts",
  "extension/src/content.ts",
  "extension/src/contentBootstrap.ts",
  "extension/src/contentIngress.ts",
  "extension/src/initializationController.ts",
  "extension/src/contentRuntime.ts",
  "extension/src/installation.ts",
  "extension/src/outboxDrain.ts",
  "extension/src/pairing.ts",
  "extension/src/platforms.ts",
  "extension/src/popup.html",
  "extension/src/popup.ts",
  "extension/src/serializedWork.ts",
  "extension/src/storagePrivacy.ts",
  "extension/src/submitEpochControl.ts",
  "extension/src/submitEpochReplay.ts",
  "extension/src/submissionControl.ts",
  "extension/src/uiHint.ts",
  "extension/src/verdictCandidateCoordinator.ts",
  "scripts/audit-v4-extension-privacy.mjs",
  "scripts/validate-v4-candidate.mjs",
  "tests/extension-e2e/capture-v4-nowcoder-task5-real-observation.spec.ts",
  "tests/extension-e2e/capture-v4-nowcoder-task6-real-retest.spec.ts",
  "tests/extension-e2e/capture-v4-nowcoder.spec.ts",
  "tests/extension-e2e/capture-v4-network.spec.ts",
  "tests/extension-e2e/capture-v4-upgrade.spec.ts",
  "tests/extension-e2e/extensionWorkerLifecycle.ts",
  "tests/extension-e2e/fakeOj.ts",
  "tests/extension-e2e/fixtures.ts",
  "tests/types/v4CandidateValidator.d.ts",
  "tests/types/v4ExtensionPrivacyAudit.d.ts",
  "tests/unit/extensionAttemptStorage.test.ts",
  "tests/unit/extensionBackgroundOrchestrator.test.ts",
  "tests/unit/extensionCaptureIngressReliability.test.ts",
  "tests/unit/extensionCaptureRecovery.test.ts",
  "tests/unit/extensionContentIngress.test.ts",
  "tests/unit/extensionContentRuntime.test.ts",
  "tests/unit/extensionDomesticOjAuth.test.ts",
  "tests/unit/extensionInstallation.test.ts",
  "tests/unit/extensionInitializationController.test.ts",
  "tests/unit/extensionLeetCodeNetworkAdapter.test.ts",
  "tests/unit/extensionNowCoderNetwork.test.ts",
  "tests/unit/extensionOutboxDrain.test.ts",
  "tests/unit/extensionPairing.test.ts",
  "tests/unit/extensionPlatforms.test.ts",
  "tests/unit/extensionPopup.test.ts",
  "tests/unit/extensionSerializedWork.test.ts",
  "tests/unit/extensionStoragePrivacy.test.ts",
  "tests/unit/extensionSubmitEpochControl.test.ts",
  "tests/unit/extensionSubmitEpochReplay.test.ts",
  "tests/unit/extensionTransport.test.ts",
  "tests/unit/extensionManifestCapabilities.test.ts",
  "tests/unit/extensionUiHint.test.ts",
  "tests/unit/extensionV4UpgradeMatrix.test.ts",
  "tests/unit/extensionVerdictCandidateFlow.test.ts",
  "tests/unit/extensionVerdictCandidateCoordinator.test.ts",
  "tests/unit/extensionWorkerLifecycle.test.ts",
  "tests/unit/v4CandidateValidator.test.ts",
  "tests/unit/v4ExtensionPrivacyAudit.test.ts",
  "vitest.config.ts",
  "work/handoff-current.md",
  "work/reports/v4-phase-d-d1-c-chrome-debug-2026-08-03.md",
  "work/reports/v4-phase-d-d1-c-disposable-observation-2026-08-03.md",
  "work/reports/v4-phase-d-d1-red-provenance-audit-2026-08-03.md",
  "work/reports/v4-phase-d-d1-upgrade-reliability-2026-08-03.md",
  "work/reports/v4-phase-d-d2-privacy-permission-audit-2026-08-03.md",
  "work/reports/v4-phase-d-task16-leetcode-automated-observation-2026-08-10.md",
  "work/reports/v4-phase-d-task21-same-sha-automated-observations-2026-08-10.md",
]);

const GENERATED_OR_SECRET_PATH = /(?:^|\/)(?:\.tmp|test-results|playwright-report)(?:\/|$)|^extension\/dist(?:\/|$)|(?:^|\/)(?:\.env(?:\.|$)|node_modules)(?:\/|$)|(?:^|\/)(?:training-platform\.sqlite|.*\.(?:sqlite|sqlite3|db|key|pem|p12))$/iu;
const RAW_TRANSCRIPT_PATH = /raw.*transcript|transcript.*raw/iu;
const STALE_RUNTIME_SYMBOLS = Object.freeze([
  "v3_submission_intent_recorded",
  "SUBMISSION_INTENT_OBSERVED",
]);

function normalizePath(path) {
  return path.replaceAll("\\", "/");
}

function checker() {
  const checks = [];
  const failedChecks = [];
  return {
    checks,
    failedChecks,
    check(name, ok, detail) {
      checks.push({ name, ok, ...(detail === undefined ? {} : { detail }) });
      if (!ok) failedChecks.push(name);
    },
  };
}

export function classifyCandidatePath(rawPath) {
  const path = normalizePath(rawPath);
  if (path.includes("\0") || path.startsWith("/") || /^[A-Z]:\//iu.test(path)) {
    return { kind: "forbidden", reason: "absolute-or-invalid-path" };
  }
  if (GENERATED_OR_SECRET_PATH.test(path)) {
    return { kind: "forbidden", reason: "generated-secret-or-database-path" };
  }
  if (RAW_TRANSCRIPT_PATH.test(path)) return { kind: "forbidden", reason: "raw-transcript-path" };
  if (CANDIDATE_ALLOWED_PATHS.includes(path)) return { kind: "candidate", reason: "explicit-task-path" };
  return { kind: "unknown", reason: "path-not-explicitly-owned" };
}

export function validateCandidatePaths(paths) {
  const state = checker();
  const normalized = paths.map(normalizePath);
  const classifications = normalized.map((path) => ({ path, ...classifyCandidatePath(path) }));
  const forbidden = classifications.filter((entry) => entry.kind === "forbidden");
  const unknown = classifications.filter((entry) => entry.kind !== "candidate");
  state.check("paths.no-forbidden", forbidden.length === 0, forbidden);
  state.check("paths.explicit-ownership", unknown.length === 0, unknown);
  state.check("paths.unique", new Set(normalized).size === normalized.length, normalized);
  return { ...state, classifications };
}

export function validateCandidateIdentityState(input) {
  const state = checker();
  state.check("candidate.is-head", input.head === input.sha, { head: input.head, sha: input.sha });
  state.check("candidate.worktree-clean", input.status.length === 0, input.status);
  return state;
}

function hasAny(text, values) {
  return values.some((value) => text.includes(value));
}

export function parseExtensionE2eSummary(output, exitCode) {
  const passedMatches = [...output.matchAll(/(\d+)\s+passed\b/giu)];
  const lastPassed = passedMatches.at(-1);
  const passed = lastPassed === undefined ? 0 : Number(lastPassed[1]);
  const summaryTail = lastPassed === undefined
    ? ""
    : output.slice(lastPassed.index ?? 0, (lastPassed.index ?? 0) + 256);
  const skippedMatch = summaryTail.match(/(\d+)\s+skipped\b/iu);
  return {
    passed: Number.isSafeInteger(passed) ? passed : 0,
    failed: exitCode === 0 ? 0 : 1,
    skipped: skippedMatch === null ? 0 : Number(skippedMatch[1]),
    exitCode,
  };
}

export function validateCandidateState(input) {
  const state = checker();
  const productionText = Object.entries(input.productionSources)
    .filter(([path]) => path.startsWith("extension/src/") && path.endsWith(".ts"))
    .map(([, text]) => text)
    .join("\n");
  state.check(
    "runtime.no-stale-v3-symbols",
    !hasAny(productionText, STALE_RUNTIME_SYMBOLS),
    STALE_RUNTIME_SYMBOLS.filter((symbol) => productionText.includes(symbol)),
  );
  state.check(
    "runtime.no-click-pending-write",
    !/\.(?:set|setItem)\s*\([^\n]*pendingSubmissionIntents/iu.test(productionText),
  );
  state.check(
    "runtime.no-production-fake-oj",
    !/(?:fake\s+oj|__capture_v4_fake_oj__)/iu.test(productionText),
  );
  state.check("privacy.zero-findings", input.privacyFindings.length === 0, input.privacyFindings);
  state.check("readiness.pass", input.readinessFailures.length === 0, input.readinessFailures);
  state.check(
    "extension-e2e.pass",
    input.extensionE2e.exitCode === 0
      && input.extensionE2e.failed === 0
      && input.extensionE2e.passed > 0,
    input.extensionE2e,
  );
  state.check("quality-gate.pass", input.qualityGate.exitCode === 0, input.qualityGate);
  state.check(
    "docs.d1-complete",
    input.docs.d1.includes("D1 PHASE COMPLETE"),
  );
  state.check(
    "docs.d2-complete",
    input.docs.d2.includes("D2 COMPLETE"),
  );
  state.check(
    "docs.plan-agrees",
    input.docs.plan.includes("D2 is complete")
      && /D3 (?:has not started|candidate|freeze|complete)/iu.test(input.docs.plan),
  );
  state.check(
    "docs.handoff-agrees",
    input.docs.handoff.includes("D1 and D2 complete")
      && /D3 (?:has not started|candidate|freeze|complete)/iu.test(input.docs.handoff),
  );
  state.check(
    "database.metadata-preserved",
    input.database.before.length === input.database.after.length
      && input.database.before.lastWriteTimeUtc === input.database.after.lastWriteTimeUtc,
    input.database,
  );
  state.check(
    "database.baseline-matches-before",
    input.database.baselineMatchesCurrent !== false,
    input.database,
  );
  return state;
}

function git(args, cwd) {
  const result = spawnSync("git", args, {
    cwd,
    encoding: "utf8",
    env: { ...process.env, GIT_MASTER: "1" },
  });
  return {
    ok: result.status === 0,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? String(result.error ?? ""),
  };
}

function readGitStatusPaths(cwd) {
  const result = git(["status", "--porcelain=v1", "--untracked-files=all"], cwd);
  if (!result.ok) throw new Error(result.stderr.trim() || "git status failed");
  return result.stdout.split(/\r?\n/u).filter(Boolean).map((line) => {
    const payload = line.slice(3);
    const renameSeparator = payload.indexOf(" -> ");
    return renameSeparator >= 0 ? payload.slice(renameSeparator + 4) : payload;
  });
}

function readCommitPaths(cwd, sha) {
  const result = git(["diff-tree", "--root", "--no-commit-id", "--name-only", "-r", sha], cwd);
  if (!result.ok) throw new Error(result.stderr.trim() || "git diff-tree failed");
  return result.stdout.split(/\r?\n/u).map((path) => path.trim()).filter(Boolean);
}

function readDatabaseMetadata(path) {
  const stats = statSync(path);
  return {
    length: stats.size,
    lastWriteTimeUtc: stats.mtime.toISOString(),
  };
}

function metadataEqual(first, second) {
  return first.length === second.length && first.lastWriteTimeUtc === second.lastWriteTimeUtc;
}

const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";

function runQualityGate(cwd) {
  const databasePath = resolve(cwd, "training-platform.sqlite");
  const before = readDatabaseMetadata(databasePath);
  const result = spawnSync(npmCommand, ["run", "quality:gate"], {
    cwd,
    encoding: "utf8",
    env: { ...process.env, GIT_MASTER: "1" },
    shell: process.platform === "win32",
    maxBuffer: 16 * 1024 * 1024,
    windowsHide: true,
  });
  const stdout = result.stdout ?? "";
  const stderr = result.stderr ?? String(result.error ?? "");
  if (stdout.length > 0) process.stdout.write(stdout);
  if (stderr.length > 0) process.stderr.write(stderr);
  const exitCode = result.error === undefined && result.status !== null ? result.status : 1;
  const after = readDatabaseMetadata(databasePath);
  return {
    extensionE2e: parseExtensionE2eSummary(`${stdout}\n${stderr}`, exitCode),
    qualityGate: { exitCode },
    databaseBefore: before,
    databaseAfter: after,
  };
}

function readRequired(repoRoot, relativePath) {
  const path = resolve(repoRoot, relativePath);
  if (!existsSync(path)) throw new Error(`missing required file: ${relativePath}`);
  return readFileSync(path, "utf8");
}

function readReadinessFailures(repoRoot) {
  const readiness = JSON.parse(readRequired(repoRoot, "docs/superpowers/specs/v4-adapter-readiness.json"));
  const registry = readRequired(repoRoot, "extension/src/adapters/registry.ts");
  return validateV4AdapterReadiness(readiness, registry, repoRoot);
}

function buildCliState(repoRoot, values, gateEvidence) {
  const auditInput = loadV4ExtensionPrivacyAuditInput(repoRoot);
  const privacyFindings = auditV4ExtensionPrivacy(auditInput);
  const databasePath = resolve(repoRoot, "training-platform.sqlite");
  const currentDatabase = readDatabaseMetadata(databasePath);
  const suppliedBaseline = values["db-length"] !== undefined || values["db-last-write-time-utc"] !== undefined;
  const baseline = suppliedBaseline
    ? {
        length: Number(values["db-length"]),
        lastWriteTimeUtc: values["db-last-write-time-utc"],
      }
    : gateEvidence.databaseBefore;
  if (!Number.isSafeInteger(baseline.length) || typeof baseline.lastWriteTimeUtc !== "string") {
    throw new Error("--db-length and --db-last-write-time-utc must be supplied together");
  }
  return {
    productionSources: auditInput.productionSources,
    privacyFindings,
    readinessFailures: readReadinessFailures(repoRoot),
    extensionE2e: gateEvidence.extensionE2e,
    qualityGate: gateEvidence.qualityGate,
    docs: {
      d1: readRequired(repoRoot, "work/reports/v4-phase-d-d1-upgrade-reliability-2026-08-03.md"),
      d2: readRequired(repoRoot, "work/reports/v4-phase-d-d2-privacy-permission-audit-2026-08-03.md"),
      plan: readRequired(repoRoot, "docs/superpowers/plans/2026-08-03-v4-phase-d-upgrade-restart-update-rollback-reliability.md"),
      handoff: readRequired(repoRoot, "work/handoff-current.md"),
    },
    database: {
      before: gateEvidence.databaseBefore,
      after: gateEvidence.databaseAfter ?? currentDatabase,
      baselineMatchesCurrent: metadataEqual(baseline, gateEvidence.databaseBefore),
    },
  };
}

export function validateCandidateCommit(cwd, sha) {
  const state = checker();
  const exists = git(["cat-file", "-e", `${sha}^{commit}`], cwd);
  state.check("candidate.commit-exists", exists.ok, exists.stderr.trim());
  if (!exists.ok) return state;
  const parents = git(["rev-list", "--parents", "-n", "1", sha], cwd).stdout.trim().split(/\s+/u);
  state.check("candidate.single-parent", parents.length === 2, parents);
  const identityState = validateCandidateIdentityState({
    head: git(["rev-parse", "HEAD"], cwd).stdout.trim(),
    sha,
    status: git(["status", "--porcelain", "--untracked-files=all"], cwd).stdout.trim(),
  });
  for (const check of identityState.checks) state.check(check.name, check.ok, check.detail);
  const paths = readCommitPaths(cwd, sha);
  const pathState = validateCandidatePaths(paths);
  for (const check of pathState.checks) state.check(`candidate.${check.name}`, check.ok, check.detail);
  return state;
}

function parseCli() {
  return parseArgs({
    options: {
      preflight: { type: "boolean", default: false },
      candidate: { type: "string" },
      "db-length": { type: "string" },
      "db-last-write-time-utc": { type: "string" },
    },
    strict: true,
  }).values;
}

function main() {
  let values;
  try {
    values = parseCli();
    const hasPreflight = values.preflight === true;
    const hasCandidate = typeof values.candidate === "string";
    if (hasPreflight === hasCandidate) {
      throw new Error("use exactly one of --preflight or --candidate");
    }
    if (hasPreflight
      && (typeof values["db-length"] !== "string"
        || typeof values["db-last-write-time-utc"] !== "string")) {
      throw new Error("--db-length and --db-last-write-time-utc are required for --preflight");
    }
    const paths = hasPreflight
      ? readGitStatusPaths(repoRoot)
      : readCommitPaths(repoRoot, values.candidate);
    const pathState = validateCandidatePaths(paths);
    const state = checker();
    for (const check of pathState.checks) state.check(check.name, check.ok, check.detail);
    if (pathState.failedChecks.length === 0 && hasPreflight) {
      const gateEvidence = runQualityGate(repoRoot);
      const candidateState = validateCandidateState(buildCliState(repoRoot, values, gateEvidence));
      for (const check of candidateState.checks) state.check(check.name, check.ok, check.detail);
    }
    if (hasCandidate) {
      const commitState = validateCandidateCommit(repoRoot, values.candidate);
      for (const check of commitState.checks) state.check(check.name, check.ok, check.detail);
      if (commitState.failedChecks.length === 0) {
        const gateEvidence = runQualityGate(repoRoot);
        const candidateState = validateCandidateState(buildCliState(repoRoot, values, gateEvidence));
        for (const check of candidateState.checks) state.check(check.name, check.ok, check.detail);
        const postGateIdentity = validateCandidateCommit(repoRoot, values.candidate);
        for (const check of postGateIdentity.checks) {
          state.check(`candidate.post-gate.${check.name}`, check.ok, check.detail);
        }
      }
    }
    if (state.failedChecks.length > 0) {
      console.error(`V4 candidate validation FAIL (${state.failedChecks.length} checks)`);
      for (const failure of state.failedChecks) console.error(`- ${failure}`);
      process.exitCode = 1;
      return;
    }
    console.log(hasPreflight ? "V4 candidate preflight PASS" : "V4 candidate commit PASS");
  } catch (error) {
    console.error(`V4 candidate validation FAIL: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 2;
  }
}

if (process.argv[1] !== undefined && import.meta.url === new URL(`file://${process.argv[1]}`).href) main();
