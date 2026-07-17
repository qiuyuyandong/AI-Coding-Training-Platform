#!/usr/bin/env node
// V0 exit-report validator.
//
// Usage:
//   node scripts/validate-v0-exit.mjs --mode candidate \
//       --engineering <path> --owner <path> --participants <path> \
//       --exit <path> \
//       --implementation-sha <sha> --observation-sha <sha> \
//       [--release-sha <sha>]
//
//   node scripts/validate-v0-exit.mjs --mode accepted \
//       --engineering <path> --owner <path> --participants <path> \
//       --exit <path> --final-verification <path> \
//       --implementation-sha <sha> --observation-sha <sha> \
//       --release-sha <sha> --final-verification-sha <sha> \
//       --acceptance-sha <sha>
//
// Emits deterministic JSON to stdout describing every check. Exit 0
// when the candidate/accepted state satisfies every rule, 1 when at
// least one rule fails, and 2 on usage error. The script uses native
// `spawnSync` to invoke git with `GIT_MASTER=1` and contains no
// PowerShell syntax.

import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { spawnSync } from "node:child_process";

import {
  FORBIDDEN_PATTERNS,
  ISO_DATE_REGEX,
  SHA_REGEX,
  findFirstFencedJsonBlock,
  findForbiddenClaims,
  validateOwnerReport,
  validateParticipantsReport,
} from "./validate-v0-observation.mjs";

export { FORBIDDEN_PATTERNS, SHA_REGEX, ISO_DATE_REGEX };

// Plan constants. These are part of the validator contract.
export const ENGINEERING_REPORT_TYPE = "v0-engineering-gates";
export const EXIT_REPORT_TYPE = "v0-exit-report";
export const FINAL_VERIFICATION_REPORT_TYPE = "v0-final-verification";

// Allowed paths between engineering→observation SHAs (only evidence
// reports may be added in the observation window).
export const CANDIDATE_OBSERVATION_ALLOWED_PATHS = Object.freeze([
  "work/reports/v0-engineering-gates.md",
  "work/reports/v0-content-audit.json",
  "work/reports/v0-observation-owner.md",
  "work/reports/v0-observation-participants.md",
]);

// Allowed paths between observation→release SHAs (only the exit report
// and the six status documents may change in the release window).
export const CANDIDATE_RELEASE_ALLOWED_PATHS = Object.freeze([
  "work/reports/v0-exit-report.md",
  "IDEA.md",
  "docs/superpowers/plans/2026-07-11-product-development-roadmap.md",
  "docs/superpowers/README.md",
  "README.md",
  "AGENTS.md",
  "work/handoff-current.md",
]);

// Allowed paths for the acceptance diff (status-only edits across the
// same six status documents; `work/reports/v0-final-verification.md` is
// NOT in this list because it was committed in the previous step).
export const ACCEPTANCE_ALLOWED_PATHS = Object.freeze([
  "IDEA.md",
  "docs/superpowers/plans/2026-07-11-product-development-roadmap.md",
  "docs/superpowers/README.md",
  "README.md",
  "AGENTS.md",
  "work/handoff-current.md",
]);

// Status assertions.
export const ACCEPTED_STATUS_PATTERN = /v0\s+(?:accepted|verified)/i;
export const ACCEPTED_NEXT_ACTION_PATTERN = /v0\.5\s+(?:planning|next)/i;

function isString(value) {
  return typeof value === "string" && value.length > 0;
}

function isObject(value) {
  return typeof value !== "undefined" && value !== null && typeof value === "object" && !Array.isArray(value);
}

function isSha(value) {
  return typeof value === "string" && SHA_REGEX.test(value);
}

function gitCommand(args, { cwd } = {}) {
  const result = spawnSync("git", args, {
    cwd: cwd ?? process.cwd(),
    env: { ...process.env, GIT_MASTER: "1" },
    encoding: "utf8",
  });
  if (result.error !== undefined && result.error !== null) {
    return { ok: false, stdout: "", stderr: String(result.error), code: -1 };
  }
  if (result.status !== 0) {
    return {
      ok: false,
      stdout: result.stdout ?? "",
      stderr: result.stderr ?? "",
      code: result.status ?? -1,
    };
  }
  return { ok: true, stdout: result.stdout ?? "", stderr: result.stderr ?? "", code: 0 };
}

export function gitShaExists(sha, options = {}) {
  if (!isSha(sha)) {
    return { ok: false, exists: false, error: "sha is not a 40-character lowercase hex string" };
  }
  const result = gitCommand(["cat-file", "-e", sha], options);
  if (!result.ok) {
    return {
      ok: true,
      exists: false,
      error: `git cat-file -e exited with code ${result.code}: ${result.stderr.trim()}`,
    };
  }
  return { ok: true, exists: true };
}

export function gitDiffNameOnly(fromSha, toSha, options = {}) {
  if (!isSha(fromSha) || !isSha(toSha)) {
    return {
      ok: false,
      paths: [],
      error: "fromSha or toSha is not a 40-character lowercase hex string",
    };
  }
  const result = gitCommand(["diff", "--name-only", fromSha, toSha], options);
  if (!result.ok) {
    return {
      ok: false,
      paths: [],
      error: `git diff exited with code ${result.code}: ${result.stderr.trim()}`,
    };
  }
  const paths = result.stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  return { ok: true, paths };
}

function readReport(path) {
  if (!existsSync(path)) {
    return { ok: false, error: `report file not found: ${path}` };
  }
  let content;
  try {
    content = readFileSync(path, "utf8");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { ok: false, error: `unable to read report: ${message}` };
  }
  return { ok: true, content };
}

// Generic check accumulator. Each check produces a structured entry.
function makeChecker() {
  const checks = [];
  const failed = [];
  function check(name, ok, detail) {
    checks.push({ name, ok, ...(detail !== undefined ? { detail } : {}) });
    if (!ok) failed.push(name);
  }
  return { checks, failed, check };
}

function finalize(result) {
  const ok = result.failed.length === 0;
  return {
    ...result,
    ok,
    summary: {
      totalChecks: result.checks.length,
      failedChecks: result.failed.length,
    },
  };
}

// Validate that the engineering gates report exists and reports PASS.
export function validateEngineeringReport(parsed) {
  const { check, checks, failed } = makeChecker();
  if (!isObject(parsed)) {
    check("engineering.shape", false, "engineering report must be a JSON object");
    return finalize({ kind: "engineering", checks, failed });
  }
  check("engineering.type", parsed.type === ENGINEERING_REPORT_TYPE, {
    actual: parsed.type,
    expected: ENGINEERING_REPORT_TYPE,
  });
  check("engineering.implementationSha", isSha(parsed.implementationSha ?? ""), {
    actual: parsed.implementationSha,
  });
  check("engineering.status", parsed.status === "PASS", {
    actual: parsed.status,
    expected: "PASS",
  });
  return finalize({ kind: "engineering", checks, failed });
}

// Validate the exit report itself.
export function validateExitReport(parsed) {
  const { check, checks, failed } = makeChecker();
  if (!isObject(parsed)) {
    check("exit.shape", false, "exit report must be a JSON object");
    return finalize({ kind: "exit", checks, failed });
  }
  check("exit.type", parsed.type === EXIT_REPORT_TYPE, {
    actual: parsed.type,
    expected: EXIT_REPORT_TYPE,
  });
  check("exit.implementationSha", isSha(parsed.implementationSha ?? ""), {
    actual: parsed.implementationSha,
  });
  check("exit.observationRecordSha", isSha(parsed.observationRecordSha ?? ""), {
    actual: parsed.observationRecordSha,
  });
  const decision = parsed.decision;
  const allowedDecisions = ["ACCEPT_CANDIDATE", "HOLD_FOR_FIXES", "REPEAT_OBSERVATION"];
  check("exit.decision.allowed", allowedDecisions.includes(decision), {
    actual: decision,
    expected: allowedDecisions,
  });
  if (parsed.status !== undefined) {
    check("exit.status.candidateOnly", parsed.status === "candidate", {
      actual: parsed.status,
      expected: "candidate",
    });
  }
  if (isString(parsed.nextAction)) {
    check("exit.nextAction.present", true);
  } else {
    check("exit.nextAction.present", false, { actual: parsed.nextAction });
  }
  if (Array.isArray(parsed.failures)) {
    check("exit.failures.isArray", true);
  } else {
    check("exit.failures.isArray", false, { actual: parsed.failures });
  }
  return finalize({ kind: "exit", checks, failed });
}

// Validate the final-verification report.
export function validateFinalVerificationReport(parsed) {
  const { check, checks, failed } = makeChecker();
  if (!isObject(parsed)) {
    check("finalVerification.shape", false, "final-verification report must be a JSON object");
    return finalize({ kind: "finalVerification", checks, failed });
  }
  check("finalVerification.type", parsed.type === FINAL_VERIFICATION_REPORT_TYPE, {
    actual: parsed.type,
    expected: FINAL_VERIFICATION_REPORT_TYPE,
  });
  check("finalVerification.releaseRecordSha", isSha(parsed.releaseRecordSha ?? ""), {
    actual: parsed.releaseRecordSha,
  });
  check("finalVerification.date.isoDate", ISO_DATE_REGEX.test(parsed.date ?? ""), {
    actual: parsed.date,
  });
  const reviewFields = [
    "f1PlanCompliance",
    "f2CodeQualitySecurity",
    "f3HandsOnQa",
    "f4ScopeDocsFidelity",
  ];
  const releaseShas = [];
  for (const field of reviewFields) {
    const value = parsed[field];
    check(`finalVerification.${field}.approve`, value === "APPROVE", {
      actual: value,
      expected: "APPROVE",
    });
    if (isObject(value) && isSha(value.releaseRecordSha)) {
      releaseShas.push(value.releaseRecordSha);
    } else if (isSha(parsed.releaseRecordSha)) {
      releaseShas.push(parsed.releaseRecordSha);
    }
  }
  const distinctReleaseShas = Array.from(new Set(releaseShas));
  check("finalVerification.f1ToF4.sameReleaseRecordSha", distinctReleaseShas.length === 1, {
    distinctShas: distinctReleaseShas,
  });
  return finalize({ kind: "finalVerification", checks, failed });
}

// Combine all per-document validations into a single report.
export function validateAllReports({
  engineering,
  owner,
  participants,
  exit,
  finalVerification,
}) {
  const engineeringReport = validateEngineeringReport(engineering);
  const ownerReport = validateOwnerReport(owner);
  const participantsReport = validateParticipantsReport(participants);
  const exitReport = validateExitReport(exit);
  const finalReport =
    finalVerification !== undefined
      ? validateFinalVerificationReport(finalVerification)
      : null;

  const combined = {
    engineering: engineeringReport,
    owner: ownerReport,
    participants: participantsReport,
    exit: exitReport,
    ...(finalReport !== null ? { finalVerification: finalReport } : {}),
  };

  const allChecks = [
    ...engineeringReport.checks,
    ...ownerReport.checks,
    ...participantsReport.checks,
    ...exitReport.checks,
    ...(finalReport !== null ? finalReport.checks : []),
  ];
  const failed = [
    ...engineeringReport.failed,
    ...(ownerReport.failed ?? []),
    ...(participantsReport.failed ?? []),
    ...exitReport.failed,
    ...(finalReport !== null ? finalReport.failed : []),
  ];
  const ok = failed.length === 0;
  return {
    ok,
    summary: {
      totalChecks: allChecks.length,
      failedChecks: failed.length,
    },
    failedChecks: failed,
    checks: allChecks,
    reports: combined,
  };
}

// Verify the implementation→observation diff contains only evidence
// reports and the observation→release diff contains only the seven
// status/allowed paths. Optional: a third acceptance diff check when
// `finalVerificationSha` and `acceptanceSha` are present.
export function validateDiffAllowlist({
  implementationSha,
  observationSha,
  releaseSha,
  finalVerificationSha,
  acceptanceSha,
  cwd,
}) {
  const { check, checks, failed } = makeChecker();
  const implObsDiff = gitDiffNameOnly(implementationSha, observationSha, { cwd });
  if (!implObsDiff.ok) {
    check("diff.implementationToObservation", false, { error: implObsDiff.error });
  } else {
    const offenders = implObsDiff.paths.filter(
      (p) => !CANDIDATE_OBSERVATION_ALLOWED_PATHS.includes(p),
    );
    check(
      "diff.implementationToObservation.allowlist",
      offenders.length === 0,
      { allowed: CANDIDATE_OBSERVATION_ALLOWED_PATHS, offenders, observed: implObsDiff.paths },
    );
  }
  if (isSha(releaseSha)) {
    const obsRelDiff = gitDiffNameOnly(observationSha, releaseSha, { cwd });
    if (!obsRelDiff.ok) {
      check("diff.observationToRelease", false, { error: obsRelDiff.error });
    } else {
      const offenders = obsRelDiff.paths.filter(
        (p) => !CANDIDATE_RELEASE_ALLOWED_PATHS.includes(p),
      );
      check(
        "diff.observationToRelease.allowlist",
        offenders.length === 0,
        { allowed: CANDIDATE_RELEASE_ALLOWED_PATHS, offenders, observed: obsRelDiff.paths },
      );
    }
  } else {
    check("diff.observationToRelease.skipped", true, { detail: "no --release-sha supplied" });
  }
  if (isSha(finalVerificationSha) && isSha(acceptanceSha)) {
    const acceptanceDiff = gitDiffNameOnly(finalVerificationSha, acceptanceSha, { cwd });
    if (!acceptanceDiff.ok) {
      check("diff.acceptance", false, { error: acceptanceDiff.error });
    } else {
      const offenders = acceptanceDiff.paths.filter(
        (p) => !ACCEPTANCE_ALLOWED_PATHS.includes(p),
      );
      check(
        "diff.acceptance.allowlist",
        offenders.length === 0,
        { allowed: ACCEPTANCE_ALLOWED_PATHS, offenders, observed: acceptanceDiff.paths },
      );
    }
  }
  return finalize({ kind: "diff", checks, failed });
}

// Verify each of the six status documents records the same accepted
// status, the same releaseRecordSha, an accepted date and a V0.5 next
// action phrase. The acceptance sha must match the SHA recorded in
// every status doc.
export function validateAcceptanceDocs({
  docs,
  releaseRecordSha,
  acceptanceSha,
  acceptedDate,
}) {
  const { check, checks, failed } = makeChecker();
  const acceptedStatusSeen = new Set();
  const releaseShaSeen = new Set();
  const nextActionSeen = new Set();
  for (const doc of docs) {
    check(`acceptance.doc.${doc.relPath}.readable`, isString(doc.content), {
      path: doc.relPath,
    });
    if (!isString(doc.content)) continue;
    const hasAcceptedStatus = ACCEPTED_STATUS_PATTERN.test(doc.content);
    acceptedStatusSeen.add(hasAcceptedStatus);
    check(`acceptance.doc.${doc.relPath}.acceptedStatus`, hasAcceptedStatus, {
      path: doc.relPath,
    });
    const hasNextAction = ACCEPTED_NEXT_ACTION_PATTERN.test(doc.content);
    nextActionSeen.add(hasNextAction);
    check(`acceptance.doc.${doc.relPath}.nextActionV05`, hasNextAction, {
      path: doc.relPath,
    });
    if (isSha(releaseRecordSha)) {
      const mentionsRelease = doc.content.includes(releaseRecordSha);
      releaseShaSeen.add(mentionsRelease);
      check(`acceptance.doc.${doc.relPath}.releaseRecordShaMentioned`, mentionsRelease, {
        path: doc.relPath,
        releaseRecordSha,
      });
    }
  }
  check("acceptance.docs.statusAgreement", acceptedStatusSeen.size === 1 && acceptedStatusSeen.has(true), {
    distinctValues: Array.from(acceptedStatusSeen),
  });
  check("acceptance.docs.releaseShaAgreement", releaseShaSeen.size === 1 && releaseShaSeen.has(true), {
    distinctValues: Array.from(releaseShaSeen),
  });
  check("acceptance.docs.nextActionAgreement", nextActionSeen.size === 1 && nextActionSeen.has(true), {
    distinctValues: Array.from(nextActionSeen),
  });
  if (isSha(acceptanceSha)) {
    const acceptanceMentioned = docs.some(
      (doc) => isString(doc.content) && doc.content.includes(acceptanceSha),
    );
    check("acceptance.docs.acceptanceShaMentioned", acceptanceMentioned, {
      acceptanceSha,
    });
  }
  if (isString(acceptedDate)) {
    const dateMentioned = docs.some(
      (doc) => isString(doc.content) && doc.content.includes(acceptedDate),
    );
    check("acceptance.docs.acceptedDateMentioned", dateMentioned, { acceptedDate });
  }
  return finalize({ kind: "acceptance", checks, failed });
}

// SHA-chain cross check. Every sha appears in the appropriate report.
export function validateShaChain({
  implementationSha,
  observationSha,
  releaseSha,
  finalVerificationSha,
  acceptanceSha,
  engineeringReport,
  ownerReport,
  participantsReport,
  exitReport,
  finalVerificationReport,
  cwd,
}) {
  const { check, checks, failed } = makeChecker();

  function compare(label, actual, expected) {
    check(label, actual === expected, { actual, expected });
  }

  if (isObject(engineeringReport)) {
    compare(
      "shaChain.engineering.implementationSha",
      engineeringReport.implementationSha,
      implementationSha,
    );
  }
  if (isObject(ownerReport)) {
    compare(
      "shaChain.owner.implementationSha",
      ownerReport.implementationSha,
      implementationSha,
    );
  }
  if (isObject(participantsReport)) {
    compare(
      "shaChain.participants.implementationSha",
      participantsReport.implementationSha,
      implementationSha,
    );
  }
  if (isObject(exitReport)) {
    compare(
      "shaChain.exit.implementationSha",
      exitReport.implementationSha,
      implementationSha,
    );
    compare(
      "shaChain.exit.observationRecordSha",
      exitReport.observationRecordSha,
      observationSha,
    );
  }
  if (isObject(finalVerificationReport)) {
    compare(
      "shaChain.finalVerification.releaseRecordSha",
      finalVerificationReport.releaseRecordSha,
      releaseSha,
    );
    if (isSha(implementationSha)) {
      compare(
        "shaChain.finalVerification.implementationSha",
        finalVerificationReport.implementationSha,
        implementationSha,
      );
    }
    if (isSha(observationSha)) {
      compare(
        "shaChain.finalVerification.observationRecordSha",
        finalVerificationReport.observationRecordSha,
        observationSha,
      );
    }
  }

  // Each SHA must exist in the object database.
  for (const [label, sha] of [
    ["shaChain.gitExists.implementationSha", implementationSha],
    ["shaChain.gitExists.observationSha", observationSha],
    ["shaChain.gitExists.releaseSha", releaseSha],
    ["shaChain.gitExists.finalVerificationSha", finalVerificationSha],
    ["shaChain.gitExists.acceptanceSha", acceptanceSha],
  ]) {
    if (!isSha(sha)) {
      check(label, false, { detail: "sha missing or malformed" });
      continue;
    }
    const result = gitShaExists(sha, { cwd });
    check(label, result.ok && result.exists === true, {
      ...(result.error !== undefined ? { error: result.error } : {}),
    });
  }
  return finalize({ kind: "shaChain", checks, failed });
}

// Combine multiple `finalize` results into a single summary.
function combineSections(sections) {
  const allChecks = [];
  const failed = [];
  for (const section of sections) {
    if (section === null) continue;
    allChecks.push(...section.checks);
    failed.push(...(section.failed ?? section.failedChecks ?? []));
  }
  const ok = failed.length === 0;
  return {
    ok,
    summary: {
      totalChecks: allChecks.length,
      failedChecks: failed.length,
    },
    failedChecks: failed,
    checks: allChecks,
  };
}

// High-level run function. The CLI path consumes its output.
export function runExitValidation({
  mode,
  engineeringMarkdown,
  ownerMarkdown,
  participantsMarkdown,
  exitMarkdown,
  finalVerificationMarkdown,
  implementationSha,
  observationSha,
  releaseSha,
  finalVerificationSha,
  acceptanceSha,
  acceptedDate,
  cwd,
}) {
  if (mode !== "candidate" && mode !== "accepted") {
    return {
      ok: false,
      summary: { totalChecks: 0, failedChecks: 1 },
      failedChecks: ["usage"],
      checks: [{ name: "usage", ok: false, error: `unknown mode: ${String(mode)}` }],
    };
  }

  const engineeringParsed = findFirstFencedJsonBlock(engineeringMarkdown ?? "");
  const ownerParsed = findFirstFencedJsonBlock(ownerMarkdown ?? "");
  const participantsParsed = findFirstFencedJsonBlock(participantsMarkdown ?? "");
  const exitParsed = findFirstFencedJsonBlock(exitMarkdown ?? "");
  const finalParsed =
    mode === "accepted"
      ? findFirstFencedJsonBlock(finalVerificationMarkdown ?? "")
      : { ok: true, data: undefined };

  const parseChecks = [
    ["engineering.parse", engineeringParsed],
    ["owner.parse", ownerParsed],
    ["participants.parse", participantsParsed],
    ["exit.parse", exitParsed],
    ...(mode === "accepted" ? [["finalVerification.parse", finalParsed]] : []),
  ];
  const parseFailures = parseChecks
    .filter(([, parsed]) => !parsed.ok)
    .map(([label]) => label);

  const allReports = validateAllReports({
    engineering: engineeringParsed.ok ? engineeringParsed.data : null,
    owner: ownerParsed.ok ? ownerParsed.data : null,
    participants: participantsParsed.ok ? participantsParsed.data : null,
    exit: exitParsed.ok ? exitParsed.data : null,
    finalVerification: finalParsed.ok ? finalParsed.data : null,
  });

  // Apply mode-specific checks.
  const sections = [];
  // SHA chain
  sections.push(
    validateShaChain({
      implementationSha,
      observationSha,
      releaseSha: mode === "accepted" ? releaseSha : undefined,
      finalVerificationSha: mode === "accepted" ? finalVerificationSha : undefined,
      acceptanceSha: mode === "accepted" ? acceptanceSha : undefined,
      engineeringReport: engineeringParsed.ok ? engineeringParsed.data : null,
      ownerReport: ownerParsed.ok ? ownerParsed.data : null,
      participantsReport: participantsParsed.ok ? participantsParsed.data : null,
      exitReport: exitParsed.ok ? exitParsed.data : null,
      finalVerificationReport: finalParsed.ok ? finalParsed.data : null,
      cwd,
    }),
  );

  // Diff allowlist (candidate: impl→obs; with release: obs→release; accepted: also acceptance).
  sections.push(
    validateDiffAllowlist({
      implementationSha,
      observationSha,
      releaseSha: mode === "accepted" ? releaseSha : releaseSha,
      finalVerificationSha: mode === "accepted" ? finalVerificationSha : undefined,
      acceptanceSha: mode === "accepted" ? acceptanceSha : undefined,
      cwd,
    }),
  );

  // Acceptance-doc check (accepted mode only).
  if (mode === "accepted") {
    const docs = ACCEPTANCE_ALLOWED_PATHS.map((relPath) => {
      const fullPath = resolve(cwd ?? process.cwd(), relPath);
      const read = readReport(fullPath);
      return {
        relPath,
        content: read.ok ? read.content : "",
        ...(read.ok ? {} : { readError: read.error }),
      };
    });
    sections.push(
      validateAcceptanceDocs({
        docs,
        releaseRecordSha: releaseSha,
        acceptanceSha,
        acceptedDate,
      }),
    );
  }

  // Forbidden-feature-claim scan over each report's markdown body.
  const forbiddenClaims = {
    engineering: findForbiddenClaims(engineeringMarkdown ?? ""),
    owner: findForbiddenClaims(ownerMarkdown ?? ""),
    participants: findForbiddenClaims(participantsMarkdown ?? ""),
    exit: findForbiddenClaims(exitMarkdown ?? ""),
    ...(mode === "accepted" ? { finalVerification: findForbiddenClaims(finalVerificationMarkdown ?? "") } : {}),
  };
  const totalForbidden = Object.values(forbiddenClaims).reduce(
    (acc, list) => acc + list.length,
    0,
  );

  const parseEntries = parseChecks.map(([name, parsed]) => ({
    name,
    ok: parsed.ok,
    ...(parsed.ok ? {} : { error: parsed.error }),
  }));

  const combined = combineSections([
    { checks: parseEntries, failed: parseFailures },
    allReports,
    ...sections,
  ]);

  return {
    ...combined,
    ok: combined.ok && parseFailures.length === 0 && totalForbidden === 0,
    mode,
    forbiddenClaims,
    forbiddenClaimsTotal: totalForbidden,
  };
}

function emit(result) {
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  if (!result.ok) {
    process.exitCode = 1;
  }
}

function isMainModule() {
  if (!process.argv[1]) return false;
  try {
    return resolve(process.argv[1]) === fileURLToPath(import.meta.url);
  } catch {
    return false;
  }
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
      "observation-sha": { type: "string" },
      "release-sha": { type: "string" },
      "final-verification-sha": { type: "string" },
      "acceptance-sha": { type: "string" },
      "accepted-date": { type: "string" },
    },
  });

  const requiredString = (label, value) => {
    if (typeof value !== "string" || value.length === 0) {
      emit({
        ok: false,
        summary: { totalChecks: 0, failedChecks: 1 },
        failedChecks: ["usage"],
        checks: [{ name: "usage", ok: false, error: `missing --${label}` }],
      });
      process.exitCode = 2;
      return null;
    }
    return value;
  };

  const mode = requiredString("mode", values.mode);
  if (mode !== null) {
    if (mode !== "candidate" && mode !== "accepted") {
      emit({
        ok: false,
        summary: { totalChecks: 0, failedChecks: 1 },
        failedChecks: ["usage"],
        checks: [
          {
            name: "usage",
            ok: false,
            error: `--mode must be 'candidate' or 'accepted' (got '${mode}')`,
          },
        ],
      });
      process.exitCode = 2;
    } else {
      const engineeringPath = requiredString("engineering", values.engineering);
      const ownerPath = requiredString("owner", values.owner);
      const participantsPath = requiredString("participants", values.participants);
      const exitPath = requiredString("exit", values.exit);
      const implementationSha = requiredString("implementation-sha", values["implementation-sha"]);
      const observationSha = requiredString("observation-sha", values["observation-sha"]);

      if (
        engineeringPath !== null &&
        ownerPath !== null &&
        participantsPath !== null &&
        exitPath !== null &&
        implementationSha !== null &&
        observationSha !== null
      ) {
        if (!SHA_REGEX.test(implementationSha) || !SHA_REGEX.test(observationSha)) {
          emit({
            ok: false,
            summary: { totalChecks: 0, failedChecks: 1 },
            failedChecks: ["usage"],
            checks: [
              {
                name: "usage",
                ok: false,
                error:
                  "--implementation-sha and --observation-sha must be 40-character lowercase hex",
              },
            ],
          });
          process.exitCode = 2;
        } else {
          let releaseSha = values["release-sha"];
          if (mode === "accepted") {
            releaseSha = requiredString("release-sha", releaseSha);
          }
          if (
            releaseSha === null ||
            (releaseSha !== undefined && !SHA_REGEX.test(releaseSha))
          ) {
            emit({
              ok: false,
              summary: { totalChecks: 0, failedChecks: 1 },
              failedChecks: ["usage"],
              checks: [
                {
                  name: "usage",
                  ok: false,
                  error: "--release-sha must be a 40-character lowercase hex string",
                },
              ],
            });
            process.exitCode = 2;
          } else {
            let finalVerificationSha = values["final-verification-sha"];
            let acceptanceSha = values["acceptance-sha"];
            let finalVerificationPath = values["final-verification"];

            if (mode === "accepted") {
              finalVerificationSha = requiredString(
                "final-verification-sha",
                finalVerificationSha,
              );
              acceptanceSha = requiredString("acceptance-sha", acceptanceSha);
              finalVerificationPath = requiredString(
                "final-verification",
                finalVerificationPath,
              );
              if (
                finalVerificationSha !== null &&
                acceptanceSha !== null &&
                finalVerificationPath !== null &&
                (!SHA_REGEX.test(finalVerificationSha) || !SHA_REGEX.test(acceptanceSha))
              ) {
                emit({
                  ok: false,
                  summary: { totalChecks: 0, failedChecks: 1 },
                  failedChecks: ["usage"],
                  checks: [
                    {
                      name: "usage",
                      ok: false,
                      error:
                        "--final-verification-sha and --acceptance-sha must be 40-character lowercase hex",
                    },
                  ],
                });
                process.exitCode = 2;
              }
            }

            // Only run if no usage error already.
            if (process.exitCode !== 2) {
              const readEngineering = readReport(resolve(process.cwd(), engineeringPath));
              const readOwner = readReport(resolve(process.cwd(), ownerPath));
              const readParticipants = readReport(resolve(process.cwd(), participantsPath));
              const readExit = readReport(resolve(process.cwd(), exitPath));
              const readFinal =
                mode === "accepted" && finalVerificationPath !== null
                  ? readReport(resolve(process.cwd(), finalVerificationPath))
                  : { ok: true, content: "" };

              const missingReads = [
                ["engineering", readEngineering],
                ["owner", readOwner],
                ["participants", readParticipants],
                ["exit", readExit],
                ...(mode === "accepted" ? [["finalVerification", readFinal]] : []),
              ].filter(([, read]) => !read.ok);

              if (missingReads.length > 0) {
                emit({
                  ok: false,
                  summary: { totalChecks: 0, failedChecks: missingReads.length },
                  failedChecks: missingReads.map(([label]) => `read.${label}`),
                  checks: missingReads.map(([label, read]) => ({
                    name: `read.${label}`,
                    ok: false,
                    error: read.error,
                  })),
                });
                process.exitCode = 2;
              } else {
                emit(
                  runExitValidation({
                    mode,
                    engineeringMarkdown: readEngineering.content,
                    ownerMarkdown: readOwner.content,
                    participantsMarkdown: readParticipants.content,
                    exitMarkdown: readExit.content,
                    finalVerificationMarkdown: readFinal.content,
                    implementationSha,
                    observationSha,
                    releaseSha,
                    finalVerificationSha:
                      mode === "accepted" ? finalVerificationSha : undefined,
                    acceptanceSha: mode === "accepted" ? acceptanceSha : undefined,
                    acceptedDate:
                      mode === "accepted" ? values["accepted-date"] : undefined,
                    cwd: process.cwd(),
                  }),
                );
              }
            }
          }
        }
      }
    }
  }
}