import { spawnSync } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";

import { afterEach, describe, expect, test } from "vitest";

type JsonObject = Record<string, unknown>;
type CommandResult = {
  status: number | null;
  stdout: string;
  stderr: string;
};

const validatorPath = resolve(process.cwd(), "scripts/validate-v0-exit.mjs");
const tempRoots: string[] = [];

function git(cwd: string, args: string[]): string {
  const result = spawnSync("git", args, {
    cwd,
    encoding: "utf8",
    env: { ...process.env, GIT_MASTER: "1" },
  });
  if (result.status !== 0) {
    throw new Error(`git ${args.join(" ")} failed: ${result.stderr}`);
  }
  return result.stdout.trim();
}

function write(root: string, relativePath: string, content: string): void {
  const target = join(root, relativePath);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, content, "utf8");
}

function report(data: JsonObject): string {
  return `\`\`\`json\n${JSON.stringify(data, null, 2)}\n\`\`\`\n\n# Report\n`;
}

function ownerReport(
  implementationSha: string,
  overrides: JsonObject = {},
): JsonObject {
  return {
    type: "v0-observation-owner",
    schemaVersion: "v0-observation-owner-1",
    implementationSha,
    status: "PASS",
    windowStart: "2026-07-01",
    windowEnd: "2026-07-08",
    effectiveSessions: ["2026-07-01", "2026-07-04", "2026-07-08"].map(
      (date) => ({
        date,
        effortBoundaryMinutes: 30,
        primaryTaskStableId: "practice-cpp-io-types",
        action: "completed",
        nextDecisionChanged: true,
        reasonUnderstood: true,
        choiceFrictionNote: "yes",
        failureOrBugId: "none",
      }),
    ),
    loopEvidence: [
      {
        date: "2026-07-04",
        mapVisited: true,
        planVisited: true,
        todayVisited: true,
        completionRecorded: true,
        nextDecisionChanged: true,
      },
    ],
    failures: [],
    ...overrides,
  };
}

function participantsReport(
  implementationSha: string,
  overrides: JsonObject = {},
): JsonObject {
  return {
    type: "v0-observation-participants",
    schemaVersion: "v0-observation-participants-1",
    implementationSha,
    status: "PASS",
    participants: ["P1", "P2"].map((id) => ({
      id,
      windowStart: "2026-07-01",
      windowEnd: "2026-07-15",
      fullLoopCompleted: true,
      choiceFrictionAnswer: "yes",
      reasonComprehensionAnswer: "yes",
      failures: [],
    })),
    ...overrides,
  };
}

function createValidTwoCommitFixture(
  extraFinalDocs: ReadonlyArray<readonly [string, string]> = [],
): {
  root: string;
  implementationSha: string;
  releaseSha: string;
} {
  const root = mkdtempSync(join(tmpdir(), "v0-validator-"));
  tempRoots.push(root);
  git(root, ["init"]);
  git(root, ["config", "user.email", "validator@example.invalid"]);
  git(root, ["config", "user.name", "V0 Validator"]);

  write(root, "app-marker.txt", "frozen implementation\n");
  git(root, ["add", "."]);
  git(root, ["commit", "-m", "test: freeze implementation"]);
  const implementationSha = git(root, ["rev-parse", "HEAD"]);

  write(
    root,
    "work/reports/v0-engineering-gates.md",
    report({
      type: "v0-engineering-gates",
      schemaVersion: "v0-engineering-gates-1",
      implementationSha,
      status: "PASS",
    }),
  );
  write(
    root,
    "work/reports/v0-observation-owner.md",
    report(ownerReport(implementationSha)),
  );
  write(
    root,
    "work/reports/v0-observation-participants.md",
    report(participantsReport(implementationSha)),
  );
  write(
    root,
    "work/reports/v0-exit-report.md",
    report({
      type: "v0-exit-report",
      schemaVersion: "v0-exit-report-2",
      implementationSha,
      decision: "ACCEPT_V0",
      status: "accepted",
      acceptedDate: "2026-07-18",
      nextAction: "V0.5 planning next",
      failures: [],
    }),
  );
  write(
    root,
    "work/reports/v0-final-verification.md",
    report({
      type: "v0-final-verification",
      schemaVersion: "v0-final-verification-2",
      implementationSha,
      date: "2026-07-18",
      f1PlanCompliance: "APPROVE",
      f2CodeQualitySecurity: "APPROVE",
      f3HandsOnQa: "APPROVE",
      f4ScopeDocsFidelity: "APPROVE",
    }),
  );

  const acceptedStatus = [
    "V0 accepted and verified",
    `implementationSha ${implementationSha}`,
    "acceptedDate 2026-07-18",
    "V0.5 planning next",
    "",
  ].join("\n");
  for (const path of [
    "IDEA.md",
    "docs/superpowers/plans/2026-07-11-product-development-roadmap.md",
    "docs/superpowers/README.md",
    "README.md",
    "AGENTS.md",
    "work/handoff-current.md",
  ]) {
    write(root, path, acceptedStatus);
  }
  for (const [path, content] of extraFinalDocs) {
    write(root, path, content);
  }

  git(root, ["add", "."]);
  git(root, ["commit", "-m", "docs: accept V0"]);
  const releaseSha = git(root, ["rev-parse", "HEAD"]);
  return { root, implementationSha, releaseSha };
}

function runFinalValidator(fixture: {
  root: string;
  implementationSha: string;
  releaseSha: string;
}, options: { readonly omitReleaseSha?: boolean } = {}): CommandResult {
  const releaseArgs = options.omitReleaseSha
    ? []
    : ["--release-sha", fixture.releaseSha];
  const result = spawnSync(
    process.execPath,
    [
      validatorPath,
      "--mode",
      "final",
      "--engineering",
      "work/reports/v0-engineering-gates.md",
      "--owner",
      "work/reports/v0-observation-owner.md",
      "--participants",
      "work/reports/v0-observation-participants.md",
      "--exit",
      "work/reports/v0-exit-report.md",
      "--final-verification",
      "work/reports/v0-final-verification.md",
      "--implementation-sha",
      fixture.implementationSha,
      ...releaseArgs,
      "--accepted-date",
      "2026-07-18",
    ],
    { cwd: fixture.root, encoding: "utf8" },
  );
  return {
    status: result.status,
    stdout: result.stdout,
    stderr: result.stderr,
  };
}

function expectRejected(
  result: CommandResult,
  failedCheck: string,
): void {
  expect(result.status).toBe(1);
  const parsed = JSON.parse(result.stdout) as JsonObject;
  expect(parsed.ok).toBe(false);
  expect(parsed.failedChecks).toEqual(expect.arrayContaining([failedCheck]));
}

afterEach(() => {
  for (const root of tempRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe("V0 two-commit report validator", { timeout: 15_000 }, () => {
  test("accepts one frozen implementation commit and one final release commit", () => {
    const fixture = createValidTwoCommitFixture();

    const result = runFinalValidator(fixture);

    expect(result.status, result.stderr).toBe(0);
    const parsed = JSON.parse(result.stdout) as JsonObject;
    expect(parsed.ok).toBe(true);
    expect(parsed.mode).toBe("final");
  });

  test(
    "accepts documentation reconciled by neat-freak in the final commit",
    () => {
      const fixture = createValidTwoCommitFixture([
        ["docs/architecture.md", "V0 accepted architecture reconciliation\n"],
        ["COMPLIANCE.md", "V0 accepted compliance reconciliation\n"],
      ]);

      const result = runFinalValidator(fixture);

      expect(result.status, result.stdout).toBe(0);
    },
    15_000,
  );

  test("requires the final release SHA", () => {
    const fixture = createValidTwoCommitFixture();

    const result = runFinalValidator(fixture, { omitReleaseSha: true });

    expect(result.status).toBe(2);
  });

  test("rejects using the implementation commit as the release commit", () => {
    const fixture = createValidTwoCommitFixture();
    fixture.releaseSha = fixture.implementationSha;

    expectRejected(runFinalValidator(fixture), "git.releaseSha.afterImplementation");
  });

  test("rejects a release commit that is not descended from the implementation", () => {
    const fixture = createValidTwoCommitFixture();
    const tree = git(fixture.root, ["rev-parse", `${fixture.implementationSha}^{tree}`]);
    fixture.releaseSha = git(fixture.root, [
      "commit-tree",
      tree,
      "-m",
      "test: unrelated release root",
    ]);

    expectRejected(
      runFinalValidator(fixture),
      "git.releaseSha.descendsFromImplementation",
    );
  });

  test("rejects an arbitrary documentation path after the RC freeze", () => {
    const fixture = createValidTwoCommitFixture([
      ["docs/unrelated-history.md", "unbounded documentation mutation\n"],
    ]);

    expectRejected(runFinalValidator(fixture), "git.releaseDiff.allowlist");
  });

  test("rejects an intermediate commit between the RC and final release", () => {
    const fixture = createValidTwoCommitFixture();
    const originalReleaseSha = fixture.releaseSha;
    git(fixture.root, ["reset", "--hard", fixture.implementationSha]);
    write(fixture.root, "README.md", "intermediate allowed-document change\n");
    git(fixture.root, ["add", "README.md"]);
    git(fixture.root, ["commit", "-m", "docs: intermediate evidence"]);
    git(fixture.root, ["checkout", originalReleaseSha, "--", "."]);
    git(fixture.root, ["add", "."]);
    git(fixture.root, ["commit", "-m", "docs: final V0 acceptance"]);
    fixture.releaseSha = git(fixture.root, ["rev-parse", "HEAD"]);

    expectRejected(runFinalValidator(fixture), "git.releaseSha.singleFinalCommit");
  });

  test("rejects a HOLD owner observation in final mode", () => {
    const fixture = createValidTwoCommitFixture();
    write(
      fixture.root,
      "work/reports/v0-observation-owner.md",
      report(ownerReport(fixture.implementationSha, { status: "HOLD" })),
    );

    expectRejected(runFinalValidator(fixture), "owner.status.finalPass");
  });

  test("rejects the owner six-day boundary", () => {
    const fixture = createValidTwoCommitFixture();
    write(
      fixture.root,
      "work/reports/v0-observation-owner.md",
      report(ownerReport(fixture.implementationSha, { windowEnd: "2026-07-07" })),
    );

    expectRejected(runFinalValidator(fixture), "owner.datesSpan.days");
  });

  test("rejects an impossible calendar date", () => {
    const fixture = createValidTwoCommitFixture();
    write(
      fixture.root,
      "work/reports/v0-observation-owner.md",
      report(ownerReport(fixture.implementationSha, { windowStart: "2026-02-31" })),
    );

    expectRejected(runFinalValidator(fixture), "owner.windowStart.isoDate");
  });

  test("rejects an owner session outside the declared window", () => {
    const fixture = createValidTwoCommitFixture();
    const effectiveSessions = ["2026-06-30", "2026-07-04", "2026-07-08"].map(
      (date) => ({
        date,
        effortBoundaryMinutes: 30,
        primaryTaskStableId: "practice-cpp-io-types",
        action: "completed",
        nextDecisionChanged: true,
        reasonUnderstood: true,
        choiceFrictionNote: "yes",
        failureOrBugId: "none",
      }),
    );
    write(
      fixture.root,
      "work/reports/v0-observation-owner.md",
      report(ownerReport(fixture.implementationSha, { effectiveSessions })),
    );

    expectRejected(
      runFinalValidator(fixture),
      "owner.effectiveSessions.withinWindow",
    );
  });

  test("rejects the participant thirteen-day boundary", () => {
    const fixture = createValidTwoCommitFixture();
    const participants = ["P1", "P2"].map((id) => ({
      id,
      windowStart: "2026-07-01",
      windowEnd: "2026-07-14",
      fullLoopCompleted: true,
      choiceFrictionAnswer: "yes",
      reasonComprehensionAnswer: "yes",
      failures: [],
    }));
    write(
      fixture.root,
      "work/reports/v0-observation-participants.md",
      report(participantsReport(fixture.implementationSha, { participants })),
    );

    expectRejected(runFinalValidator(fixture), "participants.datesSpan.allOk");
  });

  test("rejects one participant", () => {
    const fixture = createValidTwoCommitFixture();
    const participants = [
      {
        id: "P1",
        windowStart: "2026-07-01",
        windowEnd: "2026-07-15",
        fullLoopCompleted: true,
        choiceFrictionAnswer: "yes",
        reasonComprehensionAnswer: "yes",
        failures: [],
      },
    ];
    write(
      fixture.root,
      "work/reports/v0-observation-participants.md",
      report(participantsReport(fixture.implementationSha, { participants })),
    );

    expectRejected(runFinalValidator(fixture), "participants.ids");
  });

  test("rejects missing reason-comprehension evidence", () => {
    const fixture = createValidTwoCommitFixture();
    const participants = ["P1", "P2"].map((id) => ({
      id,
      windowStart: "2026-07-01",
      windowEnd: "2026-07-15",
      fullLoopCompleted: true,
      choiceFrictionAnswer: "yes",
      failures: [],
    }));
    write(
      fixture.root,
      "work/reports/v0-observation-participants.md",
      report(participantsReport(fixture.implementationSha, { participants })),
    );

    expectRejected(
      runFinalValidator(fixture),
      "participants.reasonComprehensionAnswer.allOk",
    );
  });

  test("rejects missing owner loop evidence", () => {
    const fixture = createValidTwoCommitFixture();
    write(
      fixture.root,
      "work/reports/v0-observation-owner.md",
      report(ownerReport(fixture.implementationSha, { loopEvidence: [] })),
    );

    expectRejected(
      runFinalValidator(fixture),
      "owner.fullLoop.mapPlanTodayCompletionNext",
    );
  });

  test("rejects missing participant choice-friction evidence", () => {
    const fixture = createValidTwoCommitFixture();
    const participants = ["P1", "P2"].map((id) => ({
      id,
      windowStart: "2026-07-01",
      windowEnd: "2026-07-15",
      fullLoopCompleted: true,
      reasonComprehensionAnswer: "yes",
      failures: [],
    }));
    write(
      fixture.root,
      "work/reports/v0-observation-participants.md",
      report(participantsReport(fixture.implementationSha, { participants })),
    );

    expectRejected(
      runFinalValidator(fixture),
      "participants.choiceFrictionAnswer.allOk",
    );
  });

  test("rejects an observation from another implementation SHA", () => {
    const fixture = createValidTwoCommitFixture();
    write(
      fixture.root,
      "work/reports/v0-observation-participants.md",
      report(participantsReport("a".repeat(40))),
    );

    expectRejected(
      runFinalValidator(fixture),
      "participants.implementationSha",
    );
  });

  test("rejects any non-APPROVE final review", () => {
    const fixture = createValidTwoCommitFixture();
    write(
      fixture.root,
      "work/reports/v0-final-verification.md",
      report({
        type: "v0-final-verification",
        schemaVersion: "v0-final-verification-2",
        implementationSha: fixture.implementationSha,
        date: "2026-07-18",
        f1PlanCompliance: "APPROVE",
        f2CodeQualitySecurity: "REJECT",
        f3HandsOnQa: "APPROVE",
        f4ScopeDocsFidelity: "APPROVE",
      }),
    );

    expectRejected(
      runFinalValidator(fixture),
      "finalVerification.f2CodeQualitySecurity",
    );
  });

  test("rejects premature accepted documents without a V0.5 next action", () => {
    const fixture = createValidTwoCommitFixture();
    write(
      fixture.root,
      "README.md",
      `V0 accepted and verified\nimplementationSha ${fixture.implementationSha}\nacceptedDate 2026-07-18\n`,
    );

    expectRejected(runFinalValidator(fixture), "acceptance.README.md.nextAction");
  });

  test("rejects accepted-document SHA disagreement", () => {
    const fixture = createValidTwoCommitFixture();
    write(
      fixture.root,
      "AGENTS.md",
      [
        "V0 accepted and verified",
        `implementationSha ${"b".repeat(40)}`,
        "acceptedDate 2026-07-18",
        "V0.5 planning next",
        "",
      ].join("\n"),
    );

    expectRejected(
      runFinalValidator(fixture),
      "acceptance.AGENTS.md.implementationSha",
    );
  });

  test("rejects a runtime source change after the RC freeze", () => {
    const fixture = createValidTwoCommitFixture();
    write(fixture.root, "lib/runtime.ts", "export const changed = true;\n");
    git(fixture.root, ["add", "."]);
    git(fixture.root, ["commit", "-m", "feat: mutate runtime after observation"]);
    fixture.releaseSha = git(fixture.root, ["rev-parse", "HEAD"]);

    expectRejected(runFinalValidator(fixture), "git.releaseDiff.allowlist");
  });
});
