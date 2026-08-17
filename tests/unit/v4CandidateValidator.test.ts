// @vitest-environment node

import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  CANDIDATE_ALLOWED_PATHS,
  parseExtensionE2eSummary,
  classifyCandidatePath,
  validateCandidateIdentityState,
  validateCandidatePaths,
  validateCandidateState,
} from "@/scripts/validate-v4-candidate.mjs";

const productionSources = {
  "extension/src/background.ts": "export const current = true;",
  "extension/src/installation.ts": "const migration = stored.pendingSubmissionIntents;",
};

const goodState = {
  productionSources,
  privacyFindings: [],
  readinessFailures: [],
  extensionE2e: { passed: 53, failed: 0, skipped: 1, exitCode: 0 },
  qualityGate: { exitCode: 0 },
  docs: {
    d1: "D1 PHASE COMPLETE",
    d2: "D2 COMPLETE; INDEPENDENT PRIVACY REVIEW APPROVE",
    plan: "D2 is complete. D3 has not started.",
    handoff: "D1 and D2 complete; D3 has not started.",
  },
  database: {
    before: { length: 479232, lastWriteTimeUtc: "2026-07-23T15:56:38.841Z" },
    after: { length: 479232, lastWriteTimeUtc: "2026-07-23T15:56:38.841Z" },
  },
};

describe("V4 candidate validator", () => {
  it("classifies only explicit task paths as candidate-owned", () => {
    expect(classifyCandidatePath(CANDIDATE_ALLOWED_PATHS[0] ?? "").kind).toBe("candidate");
    expect(classifyCandidatePath("vitest.config.ts").kind).toBe("candidate");
    expect(classifyCandidatePath("extension/dist/background.js").kind).toBe("forbidden");
    expect(classifyCandidatePath(".tmp/playwright-extension/profile/Default").kind).toBe("forbidden");
    expect(classifyCandidatePath("unrelated-not-owned.ts").kind).toBe("unknown");
    expect(classifyCandidatePath("training-platform.sqlite").kind).toBe("forbidden");
  });

  it("owns the reviewed Revision 5 exact-submit repair without widening to the live harness", () => {
    for (const path of [
      "extension/src/adapters/leetcode/network.ts",
      "extension/src/background.ts",
      "extension/src/submitEpochControl.ts",
      "tests/unit/extensionLeetCodeNetworkAdapter.test.ts",
      "tests/unit/extensionSubmitEpochControl.test.ts",
      "tests/unit/extensionVerdictCandidateFlow.test.ts",
      "tests/extension-e2e/capture-v4-network.spec.ts",
    ]) {
      expect(CANDIDATE_ALLOWED_PATHS).toContain(path);
      expect(classifyCandidatePath(path)).toEqual({
        kind: "candidate",
        reason: "explicit-task-path",
      });
    }
    expect(classifyCandidatePath("scripts/v4-live-observation.mjs").kind).toBe("unknown");
    expect(classifyCandidatePath("scripts/v4-live-observation-observer.mjs").kind).toBe("unknown");
  });

  it("owns the D4 result-root runtime and focused tests without absorbing acceptance tooling", () => {
    for (const path of [
      "extension/src/submitEpochReplay.ts",
      "extension/src/submissionControl.ts",
      "extension/src/uiHint.ts",
      "extension/src/verdictCandidateCoordinator.ts",
      "tests/unit/extensionUiHint.test.ts",
      "tests/unit/extensionVerdictCandidateCoordinator.test.ts",
      "tests/unit/extensionSubmitEpochReplay.test.ts",
    ]) {
      expect(classifyCandidatePath(path)).toEqual({
        kind: "candidate",
        reason: "explicit-task-path",
      });
    }
    for (const path of [
      "docs/superpowers/specs/v4-d4-acceptance-profiles.json",
      "scripts/v4-live-observation.mjs",
      "scripts/v4-live-observation-observer.mjs",
      "scripts/validate-v4-d4-acceptance-profiles.mjs",
    ]) {
      expect(classifyCandidatePath(path).kind).toBe("unknown");
    }
  });

  it("owns only the reviewed revision-4 plan, runtime, tests, and evidence paths", () => {
    const revisionFourPaths = [
      "docs/superpowers/plans/2026-08-06-v4-phase-d-d4-e3-candidate-coordinator-repair.md",
      "extension/manifest.json",
      "extension/src/contentRuntime.ts",
      "extension/src/platforms.ts",
      "tests/unit/extensionContentRuntime.test.ts",
      "tests/unit/extensionDomesticOjAuth.test.ts",
      "tests/unit/extensionSubmitEpochControl.test.ts",
      "work/reports/v4-phase-d-task16-leetcode-automated-observation-2026-08-10.md",
    ] as const;

    expect(validateCandidatePaths([...revisionFourPaths]).failedChecks).toEqual([]);
    expect(classifyCandidatePath("extension/src/unreviewed-route.ts").kind).toBe("unknown");
    expect(classifyCandidatePath("work/reports/raw-task16-transcript.json").kind).toBe("forbidden");
  });

  it("owns the reviewed NowCoder identity and extension-worker lifecycle repair paths", () => {
    const repairPaths = [
      "docs/superpowers/plans/2026-08-10-v4-phase-d-d4-nowcoder-e3-identity-repair.md",
      "extension/src/platforms.ts",
      "tests/extension-e2e/capture-v4-nowcoder-task5-real-observation.spec.ts",
      "tests/extension-e2e/capture-v4-nowcoder-task6-real-retest.spec.ts",
      "tests/extension-e2e/extensionWorkerLifecycle.ts",
      "tests/extension-e2e/fixtures.ts",
      "tests/unit/extensionDomesticOjAuth.test.ts",
      "tests/unit/extensionNowCoderNetwork.test.ts",
      "tests/unit/extensionPlatforms.test.ts",
      "tests/unit/extensionWorkerLifecycle.test.ts",
      "work/handoff-current.md",
      "work/reports/v4-phase-d-task21-same-sha-automated-observations-2026-08-10.md",
    ] as const;

    expect(validateCandidatePaths([...repairPaths]).failedChecks).toEqual([]);
    expect(classifyCandidatePath("tests/extension-e2e/unreviewed-retry.ts").kind).toBe("unknown");
    expect(classifyCandidatePath("work/reports/raw-nowcoder-transcript.json").kind).toBe("forbidden");
  });

  it("keeps the root quality gate isolated from ignored Git worktrees", () => {
    const source = readFileSync(resolve(process.cwd(), "vitest.config.ts"), "utf8");
    expect(source).toContain('".worktrees/**"');
  });

  it("rejects duplicate, generated, secret, raw-transcript, and unknown paths", () => {
    const result = validateCandidatePaths([
      "extension/src/background.ts",
      "extension/src/background.ts",
      "test-results/run.json",
      "work/reports/raw-network-transcript.json",
      "unrelated.ts",
    ]);
    expect(result.failedChecks).toEqual([
      "paths.no-forbidden",
      "paths.explicit-ownership",
      "paths.unique",
    ]);
  });

  it("accepts the current D1/D2 verification state", () => {
    expect(validateCandidateState(goodState).failedChecks).toEqual([]);
  });

  it("parses the final extension E2E summary from real gate output", () => {
    expect(parseExtensionE2eSummary(
      "2197 passed\n1 skipped\n53 passed\n1 skipped\n",
      0,
    )).toEqual({ passed: 53, failed: 0, skipped: 1, exitCode: 0 });
    expect(parseExtensionE2eSummary("53 passed\n", 1)).toEqual({
      passed: 53,
      failed: 1,
      skipped: 0,
      exitCode: 1,
    });
  });

  it("does not accept operator-reported gate result flags", () => {
    const result = spawnSync(
      process.execPath,
      [
        resolve(process.cwd(), "scripts/validate-v4-candidate.mjs"),
        "--preflight",
        "--db-length", "479232",
        "--db-last-write-time-utc", "2026-07-23T15:56:38.841Z",
        "--quality-gate-exit-code", "0",
      ],
      { cwd: process.cwd(), encoding: "utf8", windowsHide: true },
    );
    expect(result.status).toBe(2);
    expect(`${result.stdout}\n${result.stderr}`).toContain("Unknown option");
  });

  it("candidate mode reruns the gate and validates the resulting evidence", () => {
    const source = readFileSync(resolve(process.cwd(), "scripts/validate-v4-candidate.mjs"), "utf8");
    expect(source).toContain("const gateEvidence = runQualityGate(repoRoot);");
    expect(source).toContain("validateCandidateState(buildCliState(repoRoot, values, gateEvidence))");
    expect(source).toContain("const postGateIdentity = validateCandidateCommit(repoRoot, values.candidate);");
  });

  it.each([
    ["HEAD changed", { head: "different", status: "" }, ["candidate.is-head"]],
    ["worktree changed", { head: "candidate", status: " M tracked.ts" }, ["candidate.worktree-clean"]],
  ])("rejects a candidate identity mutation after the gate: %s", (_label, input, failedChecks) => {
    expect(validateCandidateIdentityState({ sha: "candidate", ...input }).failedChecks).toEqual(failedChecks);
  });

  it.each([
    ["failed extension E2E", { extensionE2e: { passed: 52, failed: 1, skipped: 1, exitCode: 1 } }],
    ["failed privacy audit", { privacyFindings: ["forbidden raw body"] }],
    ["failed readiness", { readinessFailures: ["leetcode: missing status"] }],
    ["documentation disagreement", { docs: { ...goodState.docs, d2: "D2 pending" } }],
    ["database mutation", {
      database: {
        before: goodState.database.before,
        after: { length: 479233, lastWriteTimeUtc: goodState.database.after.lastWriteTimeUtc },
      },
    }],
  ])("rejects %s", (_label, override) => {
    const result = validateCandidateState({ ...goodState, ...override });
    expect(result.failedChecks.length).toBeGreaterThan(0);
  });

  it("rejects stale runtime symbols while allowing migration-only pending state", () => {
    expect(validateCandidateState({
      ...goodState,
      productionSources: {
        ...productionSources,
        "extension/src/background.ts": "const x = 'SUBMISSION_INTENT_OBSERVED';",
      },
    }).failedChecks).toContain("runtime.no-stale-v3-symbols");
    expect(validateCandidateState(goodState).failedChecks).not.toContain("runtime.no-click-pending-write");
  });
});
