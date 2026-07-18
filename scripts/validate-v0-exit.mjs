#!/usr/bin/env node
// V0 two-commit final-release validator.
//
// Successful release flow:
//   1. commit the frozen implementation (`implementationSha`);
//   2. collect real observations and F1-F4 evidence against that SHA;
//   3. after explicit acceptance, commit reports/status docs (`releaseSha`).
//
// Usage:
//   node scripts/validate-v0-exit.mjs --mode final \
//     --engineering <path> --owner <path> --participants <path> \
//     --exit <path> --final-verification <path> \
//     --implementation-sha <sha> [--release-sha <sha>] \
//     --accepted-date <YYYY-MM-DD>

import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { spawnSync } from "node:child_process";

import {
  ISO_DATE_REGEX,
  SHA_REGEX,
  findFirstFencedJsonBlock,
  findForbiddenClaims,
  validateOwnerReport,
  validateParticipantsReport,
} from "./validate-v0-observation.mjs";

export const ENGINEERING_REPORT_TYPE = "v0-engineering-gates";
export const EXIT_REPORT_TYPE = "v0-exit-report";
export const FINAL_VERIFICATION_REPORT_TYPE = "v0-final-verification";

export const FINAL_RELEASE_ALLOWED_PATHS = Object.freeze([
  "work/reports/v0-engineering-gates.md",
  "work/reports/v0-content-audit.json",
  "work/reports/v0-observation-owner.md",
  "work/reports/v0-observation-participants.md",
  "work/reports/v0-exit-report.md",
  "work/reports/v0-final-verification.md",
  "IDEA.md",
  "COMPLIANCE.md",
  "DESIGN.md",
  "docs/architecture.md",
  "docs/runbook.md",
  "docs/decisions/0001-local-pilot-to-cloud-saas.md",
  "docs/decisions/0002-v0-optional-ai-reflection.md",
  "docs/superpowers/plans/2026-07-11-product-development-roadmap.md",
  "docs/superpowers/plans/2026-07-18-v0-closeout-observation-final-verification.md",
  "docs/superpowers/README.md",
  "README.md",
  "AGENTS.md",
  "work/handoff-current.md",
]);

export const ACCEPTANCE_STATUS_PATHS = Object.freeze([
  "IDEA.md",
  "docs/superpowers/plans/2026-07-11-product-development-roadmap.md",
  "docs/superpowers/README.md",
  "README.md",
  "AGENTS.md",
  "work/handoff-current.md",
]);

const ACCEPTED_STATUS_PATTERN = /v0\s+(?:accepted|verified)/i;
const NEXT_ACTION_PATTERN = /v0\.5\s+(?:planning|next)/i;

function isObject(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isString(value) {
  return typeof value === "string" && value.length > 0;
}

function isSha(value) {
  return typeof value === "string" && SHA_REGEX.test(value);
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

function finish(mode, sections, extra = {}) {
  const checks = sections.flatMap((section) => section.checks ?? []);
  const failedChecks = sections.flatMap(
    (section) => section.failedChecks ?? section.failed ?? [],
  );
  return {
    ok: failedChecks.length === 0,
    mode,
    summary: { totalChecks: checks.length, failedChecks: failedChecks.length },
    failedChecks,
    checks,
    ...extra,
  };
}

function git(args, { cwd } = {}) {
  const result = spawnSync("git", args, {
    cwd: cwd ?? process.cwd(),
    encoding: "utf8",
    env: { ...process.env, GIT_MASTER: "1" },
  });
  return {
    ok: result.status === 0,
    status: result.status ?? -1,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? String(result.error ?? ""),
  };
}

function readMarkdown(path) {
  if (!existsSync(path)) return { ok: false, error: `file not found: ${path}` };
  try {
    return { ok: true, content: readFileSync(path, "utf8") };
  } catch (error) {
    return { ok: false, error: String(error) };
  }
}

function parseReport(markdown, label) {
  const parsed = findFirstFencedJsonBlock(markdown);
  if (parsed.ok) return { ok: true, data: parsed.data, checks: [], failedChecks: [] };
  return {
    ok: false,
    data: null,
    checks: [{ name: `${label}.parse`, ok: false, detail: parsed.error }],
    failedChecks: [`${label}.parse`],
  };
}

export function validateEngineeringReport(parsed, implementationSha) {
  const state = checker();
  state.check("engineering.shape", isObject(parsed));
  if (!isObject(parsed)) return state;
  state.check("engineering.type", parsed.type === ENGINEERING_REPORT_TYPE);
  state.check(
    "engineering.implementationSha",
    parsed.implementationSha === implementationSha,
    { actual: parsed.implementationSha, expected: implementationSha },
  );
  state.check("engineering.status", parsed.status === "PASS", {
    actual: parsed.status,
  });
  return state;
}

export function validateExitReport(parsed, { implementationSha, acceptedDate }) {
  const state = checker();
  state.check("exit.shape", isObject(parsed));
  if (!isObject(parsed)) return state;
  state.check("exit.type", parsed.type === EXIT_REPORT_TYPE);
  state.check("exit.implementationSha", parsed.implementationSha === implementationSha, {
    actual: parsed.implementationSha,
    expected: implementationSha,
  });
  state.check("exit.decision", parsed.decision === "ACCEPT_V0", {
    actual: parsed.decision,
  });
  state.check("exit.status", parsed.status === "accepted", { actual: parsed.status });
  state.check("exit.acceptedDate", parsed.acceptedDate === acceptedDate, {
    actual: parsed.acceptedDate,
    expected: acceptedDate,
  });
  state.check("exit.nextAction", isString(parsed.nextAction) && NEXT_ACTION_PATTERN.test(parsed.nextAction));
  state.check("exit.failures", Array.isArray(parsed.failures));
  return state;
}

export function validateFinalVerificationReport(parsed, implementationSha) {
  const state = checker();
  state.check("finalVerification.shape", isObject(parsed));
  if (!isObject(parsed)) return state;
  state.check("finalVerification.type", parsed.type === FINAL_VERIFICATION_REPORT_TYPE);
  state.check(
    "finalVerification.implementationSha",
    parsed.implementationSha === implementationSha,
    { actual: parsed.implementationSha, expected: implementationSha },
  );
  state.check("finalVerification.date", ISO_DATE_REGEX.test(parsed.date ?? ""));
  for (const field of [
    "f1PlanCompliance",
    "f2CodeQualitySecurity",
    "f3HandsOnQa",
    "f4ScopeDocsFidelity",
  ]) {
    state.check(`finalVerification.${field}`, parsed[field] === "APPROVE", {
      actual: parsed[field],
    });
  }
  return state;
}

function validateObservationSha(report, label, implementationSha) {
  const state = checker();
  state.check(`${label}.implementationSha`, report?.implementationSha === implementationSha, {
    actual: report?.implementationSha,
    expected: implementationSha,
  });
  state.check(`${label}.status.finalPass`, report?.status === "PASS", {
    actual: report?.status,
    expected: "PASS",
  });
  return state;
}

function validateGitState({ implementationSha, releaseSha, cwd }) {
  const state = checker();
  const implementationExists = git(["cat-file", "-e", `${implementationSha}^{commit}`], { cwd });
  state.check("git.implementationSha.exists", implementationExists.ok, implementationExists.stderr.trim());
  const releaseExists = git(["cat-file", "-e", `${releaseSha}^{commit}`], { cwd });
  state.check("git.releaseSha.exists", releaseExists.ok, releaseExists.stderr.trim());
  if (!implementationExists.ok || !releaseExists.ok) return state;
  state.check(
    "git.releaseSha.afterImplementation",
    implementationSha !== releaseSha,
    { implementationSha, releaseSha },
  );
  const ancestor = git(
    ["merge-base", "--is-ancestor", implementationSha, releaseSha],
    { cwd },
  );
  state.check("git.releaseSha.descendsFromImplementation", ancestor.ok, {
    implementationSha,
    releaseSha,
    stderr: ancestor.stderr.trim(),
  });
  const releaseParents = git(["rev-list", "--parents", "-n", "1", releaseSha], { cwd });
  const parentTokens = releaseParents.stdout.trim().split(/\s+/).filter(Boolean);
  state.check(
    "git.releaseSha.singleFinalCommit",
    releaseParents.ok && parentTokens.length === 2 && parentTokens[1] === implementationSha,
    {
      implementationSha,
      releaseSha,
      parents: parentTokens.slice(1),
      stderr: releaseParents.stderr.trim(),
    },
  );
  const head = git(["rev-parse", "HEAD"], { cwd });
  state.check("git.releaseSha.isHead", head.ok && head.stdout.trim() === releaseSha, {
    actual: head.stdout.trim(),
    expected: releaseSha,
  });
  const status = git(["status", "--porcelain", "--untracked-files=all"], { cwd });
  state.check("git.releaseWorktree.clean", status.ok && status.stdout.trim().length === 0, {
    status: status.stdout.trim(),
  });
  const diff = git(["diff", "--name-only", implementationSha, releaseSha], { cwd });
  state.check("git.releaseDiff.readable", diff.ok, diff.stderr.trim());
  if (!diff.ok) return state;
  const paths = diff.stdout.split(/\r?\n/).map((path) => path.trim()).filter(Boolean);
  const forbidden = paths.filter((path) => !FINAL_RELEASE_ALLOWED_PATHS.includes(path));
  state.check("git.releaseDiff.allowlist", forbidden.length === 0, {
    paths,
    forbidden,
    allowed: FINAL_RELEASE_ALLOWED_PATHS,
  });
  return state;
}

function validateAcceptanceDocs({ cwd, implementationSha, acceptedDate }) {
  const state = checker();
  for (const relativePath of ACCEPTANCE_STATUS_PATHS) {
    const read = readMarkdown(resolve(cwd, relativePath));
    state.check(`acceptance.${relativePath}.read`, read.ok, read.error);
    if (!read.ok) continue;
    state.check(`acceptance.${relativePath}.status`, ACCEPTED_STATUS_PATTERN.test(read.content));
    state.check(`acceptance.${relativePath}.implementationSha`, read.content.includes(implementationSha));
    state.check(`acceptance.${relativePath}.acceptedDate`, read.content.includes(acceptedDate));
    state.check(`acceptance.${relativePath}.nextAction`, NEXT_ACTION_PATTERN.test(read.content));
  }
  return state;
}

export function runFinalValidation({
  engineeringMarkdown,
  ownerMarkdown,
  participantsMarkdown,
  exitMarkdown,
  finalVerificationMarkdown,
  implementationSha,
  releaseSha,
  acceptedDate,
  cwd = process.cwd(),
}) {
  const parsedEngineering = parseReport(engineeringMarkdown, "engineering");
  const parsedOwner = parseReport(ownerMarkdown, "owner");
  const parsedParticipants = parseReport(participantsMarkdown, "participants");
  const parsedExit = parseReport(exitMarkdown, "exit");
  const parsedFinal = parseReport(finalVerificationMarkdown, "finalVerification");
  const parseSections = [parsedEngineering, parsedOwner, parsedParticipants, parsedExit, parsedFinal];

  const engineering = parsedEngineering.ok ? parsedEngineering.data : null;
  const owner = parsedOwner.ok ? parsedOwner.data : null;
  const participants = parsedParticipants.ok ? parsedParticipants.data : null;
  const exit = parsedExit.ok ? parsedExit.data : null;
  const finalVerification = parsedFinal.ok ? parsedFinal.data : null;

  const forbiddenClaims = {
    engineering: findForbiddenClaims(engineeringMarkdown),
    owner: findForbiddenClaims(ownerMarkdown),
    participants: findForbiddenClaims(participantsMarkdown),
    exit: findForbiddenClaims(exitMarkdown),
    finalVerification: findForbiddenClaims(finalVerificationMarkdown),
  };
  const forbiddenState = checker();
  forbiddenState.check(
    "reports.forbiddenClaims",
    Object.values(forbiddenClaims).every((claims) => claims.length === 0),
    forbiddenClaims,
  );

  return finish(
    "final",
    [
      ...parseSections,
      validateEngineeringReport(engineering, implementationSha),
      validateOwnerReport(owner),
      validateParticipantsReport(participants),
      validateObservationSha(owner, "owner", implementationSha),
      validateObservationSha(participants, "participants", implementationSha),
      validateExitReport(exit, { implementationSha, acceptedDate }),
      validateFinalVerificationReport(finalVerification, implementationSha),
      validateGitState({ implementationSha, releaseSha, cwd }),
      validateAcceptanceDocs({ cwd, implementationSha, acceptedDate }),
      forbiddenState,
    ],
    { forbiddenClaims },
  );
}

function emit(result, usage = false) {
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  process.exitCode = result.ok ? 0 : usage ? 2 : 1;
}

function isMainModule() {
  return Boolean(process.argv[1]) && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
}

if (isMainModule()) {
  const { values } = parseArgs({
    options: {
      mode: { type: "string" },
      engineering: { type: "string" },
      owner: { type: "string" },
      participants: { type: "string" },
      exit: { type: "string" },
      "final-verification": { type: "string" },
      "implementation-sha": { type: "string" },
      "release-sha": { type: "string" },
      "accepted-date": { type: "string" },
    },
  });

  const required = [
    "engineering",
    "owner",
    "participants",
    "exit",
    "final-verification",
    "implementation-sha",
    "release-sha",
    "accepted-date",
  ];
  const missing = required.filter((name) => !isString(values[name]));
  const implementationSha = values["implementation-sha"];
  const releaseSha = values["release-sha"];
  const acceptedDate = values["accepted-date"];
  if (
    values.mode !== "final" ||
    missing.length > 0 ||
    !isSha(implementationSha) ||
    (releaseSha !== undefined && !isSha(releaseSha)) ||
    !ISO_DATE_REGEX.test(acceptedDate ?? "")
  ) {
    emit(
      {
        ok: false,
        mode: values.mode ?? null,
        summary: { totalChecks: 1, failedChecks: 1 },
        failedChecks: ["usage"],
        checks: [
          {
            name: "usage",
            ok: false,
            detail: {
              expectedMode: "final",
              missing,
              implementationSha,
              releaseSha,
              acceptedDate,
            },
          },
        ],
      },
      true,
    );
  } else {
    const paths = {
      engineering: values.engineering,
      owner: values.owner,
      participants: values.participants,
      exit: values.exit,
      finalVerification: values["final-verification"],
    };
    const reads = Object.fromEntries(
      Object.entries(paths).map(([name, path]) => [name, readMarkdown(resolve(process.cwd(), path))]),
    );
    const unreadable = Object.entries(reads).filter(([, read]) => !read.ok);
    if (unreadable.length > 0) {
      emit(
        {
          ok: false,
          mode: "final",
          summary: { totalChecks: unreadable.length, failedChecks: unreadable.length },
          failedChecks: unreadable.map(([name]) => `read.${name}`),
          checks: unreadable.map(([name, read]) => ({
            name: `read.${name}`,
            ok: false,
            detail: read.error,
          })),
        },
        true,
      );
    } else {
      emit(
        runFinalValidation({
          engineeringMarkdown: reads.engineering.content,
          ownerMarkdown: reads.owner.content,
          participantsMarkdown: reads.participants.content,
          exitMarkdown: reads.exit.content,
          finalVerificationMarkdown: reads.finalVerification.content,
          implementationSha,
          releaseSha,
          acceptedDate,
          cwd: process.cwd(),
        }),
      );
    }
  }
}
