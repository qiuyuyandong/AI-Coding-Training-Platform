import { spawn } from "node:child_process";
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

function runCommand(
  command: string,
  args: readonly string[],
  cwd: string,
  env: NodeJS.ProcessEnv = process.env,
): Promise<CommandResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      env,
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => { stdout += chunk; });
    child.stderr.on("data", (chunk: string) => { stderr += chunk; });
    child.on("error", reject);
    child.on("close", (status) => resolve({ status, stdout, stderr }));
  });
}

async function git(cwd: string, args: string[]): Promise<string> {
  const result = await runCommand("git", args, cwd, {
    ...process.env,
    GIT_MASTER: "1",
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

async function createValidTwoCommitFixture(
  extraFinalDocs: ReadonlyArray<readonly [string, string]> = [],
): Promise<{
  root: string;
  implementationSha: string;
  releaseSha: string;
}> {
  const root = mkdtempSync(join(tmpdir(), "v0-validator-"));
  tempRoots.push(root);
  await git(root, ["init"]);
  await git(root, ["config", "user.email", "validator@example.invalid"]);
  await git(root, ["config", "user.name", "V0 Validator"]);

  write(root, "app-marker.txt", "frozen implementation\n");
  await git(root, ["add", "."]);
  await git(root, ["commit", "-m", "test: freeze implementation"]);
  const implementationSha = await git(root, ["rev-parse", "HEAD"]);

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

  await git(root, ["add", "."]);
  await git(root, ["commit", "-m", "docs: accept V0"]);
  const releaseSha = await git(root, ["rev-parse", "HEAD"]);
  return { root, implementationSha, releaseSha };
}

function runFinalValidator(fixture: {
  root: string;
  implementationSha: string;
  releaseSha: string;
}, options: { readonly omitReleaseSha?: boolean } = {}): Promise<CommandResult> {
  const releaseArgs = options.omitReleaseSha
    ? []
    : ["--release-sha", fixture.releaseSha];
  return runCommand(
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
    fixture.root,
  );
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
  test("accepts one frozen implementation commit and one final release commit", async () => {
    const fixture = await createValidTwoCommitFixture();

    const result = await runFinalValidator(fixture);

    expect(result.status, result.stderr).toBe(0);
    const parsed = JSON.parse(result.stdout) as JsonObject;
    expect(parsed.ok).toBe(true);
    expect(parsed.mode).toBe("final");
  });

  test(
    "accepts documentation reconciled by neat-freak in the final commit",
    async () => {
      const fixture = await createValidTwoCommitFixture([
        ["docs/architecture.md", "V0 accepted architecture reconciliation\n"],
        ["COMPLIANCE.md", "V0 accepted compliance reconciliation\n"],
      ]);

      const result = await runFinalValidator(fixture);

      expect(result.status, result.stdout).toBe(0);
    },
    15_000,
  );

  test("requires the final release SHA", async () => {
    const fixture = await createValidTwoCommitFixture();

    const result = await runFinalValidator(fixture, { omitReleaseSha: true });

    expect(result.status).toBe(2);
  });

  test("rejects using the implementation commit as the release commit", async () => {
    const fixture = await createValidTwoCommitFixture();
    fixture.releaseSha = fixture.implementationSha;

    expectRejected(await runFinalValidator(fixture), "git.releaseSha.afterImplementation");
  });

  test("rejects a release commit that is not descended from the implementation", async () => {
    const fixture = await createValidTwoCommitFixture();
    const tree = await git(fixture.root, ["rev-parse", `${fixture.implementationSha}^{tree}`]);
    fixture.releaseSha = await git(fixture.root, [
      "commit-tree",
      tree,
      "-m",
      "test: unrelated release root",
    ]);

    expectRejected(
      await runFinalValidator(fixture),
      "git.releaseSha.descendsFromImplementation",
    );
  });

  test("rejects an arbitrary documentation path after the RC freeze", async () => {
    const fixture = await createValidTwoCommitFixture([
      ["docs/unrelated-history.md", "unbounded documentation mutation\n"],
    ]);

    expectRejected(await runFinalValidator(fixture), "git.releaseDiff.allowlist");
  });

  test("rejects an intermediate commit between the RC and final release", async () => {
    const fixture = await createValidTwoCommitFixture();
    const originalReleaseSha = fixture.releaseSha;
    await git(fixture.root, ["reset", "--hard", fixture.implementationSha]);
    write(fixture.root, "README.md", "intermediate allowed-document change\n");
    await git(fixture.root, ["add", "README.md"]);
    await git(fixture.root, ["commit", "-m", "docs: intermediate evidence"]);
    await git(fixture.root, ["checkout", originalReleaseSha, "--", "."]);
    await git(fixture.root, ["add", "."]);
    await git(fixture.root, ["commit", "-m", "docs: final V0 acceptance"]);
    fixture.releaseSha = await git(fixture.root, ["rev-parse", "HEAD"]);

    expectRejected(await runFinalValidator(fixture), "git.releaseSha.singleFinalCommit");
  });

  test("rejects a HOLD owner observation in final mode", async () => {
    const fixture = await createValidTwoCommitFixture();
    write(
      fixture.root,
      "work/reports/v0-observation-owner.md",
      report(ownerReport(fixture.implementationSha, { status: "HOLD" })),
    );

    expectRejected(await runFinalValidator(fixture), "owner.status.finalPass");
  });

  test("rejects the owner six-day boundary", async () => {
    const fixture = await createValidTwoCommitFixture();
    write(
      fixture.root,
      "work/reports/v0-observation-owner.md",
      report(ownerReport(fixture.implementationSha, { windowEnd: "2026-07-07" })),
    );

    expectRejected(await runFinalValidator(fixture), "owner.datesSpan.days");
  });

  test("rejects an impossible calendar date", async () => {
    const fixture = await createValidTwoCommitFixture();
    write(
      fixture.root,
      "work/reports/v0-observation-owner.md",
      report(ownerReport(fixture.implementationSha, { windowStart: "2026-02-31" })),
    );

    expectRejected(await runFinalValidator(fixture), "owner.windowStart.isoDate");
  });

  test("rejects an owner session outside the declared window", async () => {
    const fixture = await createValidTwoCommitFixture();
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
      await runFinalValidator(fixture),
      "owner.effectiveSessions.withinWindow",
    );
  });

  test("rejects the participant thirteen-day boundary", async () => {
    const fixture = await createValidTwoCommitFixture();
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

    expectRejected(await runFinalValidator(fixture), "participants.datesSpan.allOk");
  });

  test("rejects one participant", async () => {
    const fixture = await createValidTwoCommitFixture();
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

    expectRejected(await runFinalValidator(fixture), "participants.ids");
  });

  test("rejects missing reason-comprehension evidence", async () => {
    const fixture = await createValidTwoCommitFixture();
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
      await runFinalValidator(fixture),
      "participants.reasonComprehensionAnswer.allOk",
    );
  });

  test("rejects missing owner loop evidence", async () => {
    const fixture = await createValidTwoCommitFixture();
    write(
      fixture.root,
      "work/reports/v0-observation-owner.md",
      report(ownerReport(fixture.implementationSha, { loopEvidence: [] })),
    );

    expectRejected(
      await runFinalValidator(fixture),
      "owner.fullLoop.mapPlanTodayCompletionNext",
    );
  });

  test("rejects missing participant choice-friction evidence", async () => {
    const fixture = await createValidTwoCommitFixture();
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
      await runFinalValidator(fixture),
      "participants.choiceFrictionAnswer.allOk",
    );
  });

  test("rejects an observation from another implementation SHA", async () => {
    const fixture = await createValidTwoCommitFixture();
    write(
      fixture.root,
      "work/reports/v0-observation-participants.md",
      report(participantsReport("a".repeat(40))),
    );

    expectRejected(
      await runFinalValidator(fixture),
      "participants.implementationSha",
    );
  });

  test("rejects any non-APPROVE final review", async () => {
    const fixture = await createValidTwoCommitFixture();
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
      await runFinalValidator(fixture),
      "finalVerification.f2CodeQualitySecurity",
    );
  });

  test("rejects premature accepted documents without a V0.5 next action", async () => {
    const fixture = await createValidTwoCommitFixture();
    write(
      fixture.root,
      "README.md",
      `V0 accepted and verified\nimplementationSha ${fixture.implementationSha}\nacceptedDate 2026-07-18\n`,
    );

    expectRejected(await runFinalValidator(fixture), "acceptance.README.md.nextAction");
  });

  test("rejects accepted-document SHA disagreement", async () => {
    const fixture = await createValidTwoCommitFixture();
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
      await runFinalValidator(fixture),
      "acceptance.AGENTS.md.implementationSha",
    );
  });

  test("rejects a runtime source change after the RC freeze", async () => {
    const fixture = await createValidTwoCommitFixture();
    write(fixture.root, "lib/runtime.ts", "export const changed = true;\n");
    await git(fixture.root, ["add", "."]);
    await git(fixture.root, ["commit", "-m", "feat: mutate runtime after observation"]);
    fixture.releaseSha = await git(fixture.root, ["rev-parse", "HEAD"]);

    expectRejected(await runFinalValidator(fixture), "git.releaseDiff.allowlist");
  });
});
