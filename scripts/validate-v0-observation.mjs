#!/usr/bin/env node
// V0 observation-report validator.
//
// Usage:
//   node scripts/validate-v0-observation.mjs --owner <path>
//   node scripts/validate-v0-observation.mjs --participants <path>
//
// Emits deterministic JSON to stdout describing every check and the
// pass/fail result. Exit code 0 means the report passes every rule; 1
// means at least one rule failed; 2 means usage error (missing or
// malformed arguments). The script never reads cookies, env keys, or
// remote services, and contains no PowerShell syntax. It uses native
// `spawnSync` to invoke `git` for SHA existence checks and re-sets the
// `GIT_MASTER` environment variable on the child so repository hooks
// stay in lockstep with the rest of the project.

import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { spawnSync } from "node:child_process";

// Constants are frozen so a downstream consumer cannot mutate them and
// subtly change validator behavior at runtime.
export const SHA_REGEX = /^[0-9a-f]{40}$/;
export const ISO_DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;
export const EFFORT_BOUNDARIES = Object.freeze([15, 30, 60, 90]);
export const OWNER_REQUIRED_DATES_SPAN = 7;
export const PARTICIPANT_REQUIRED_DATES_SPAN = 14;
export const OWNER_REQUIRED_EFFECTIVE_SESSIONS = 3;
export const PARTICIPANT_REQUIRED_IDS = Object.freeze(["P1", "P2"]);
export const REPORT_TYPE_OWNER = "v0-observation-owner";
export const REPORT_TYPE_PARTICIPANTS = "v0-observation-participants";

// Forbidden feature claims that the V0 pilot docs must never make. The
// plan is explicit: hosted AI, cloud sync/backup/storage, telemetry,
// public launch, and similar V0-out-of-scope phrases are forbidden.
// The validator scans the full markdown body, not just the JSON block,
// so narrative text cannot smuggle in a hidden claim.
export const FORBIDDEN_PATTERNS = Object.freeze([
  Object.freeze({ name: "hosted-ai", pattern: /\bhosted[- ]ai\b/i }),
  Object.freeze({ name: "cloud-sync", pattern: /\bcloud[- ]sync\b/i }),
  Object.freeze({ name: "cloud-backup", pattern: /\bcloud[- ]backup\b/i }),
  Object.freeze({ name: "cloud-storage", pattern: /\bcloud[- ]storage\b/i }),
  Object.freeze({ name: "cloud-hosted", pattern: /\bcloud[- ]hosted\b/i }),
  Object.freeze({ name: "telemetry", pattern: /\btelemetry\b/i }),
  Object.freeze({ name: "background-analytics", pattern: /\bbackground[- ]analytics\b/i }),
  Object.freeze({ name: "usage-analytics", pattern: /\busage[- ]analytics\b/i }),
  Object.freeze({ name: "public-launch", pattern: /\bpublic[- ]launch\b/i }),
]);

const FENCE_REGEX = /```(?:json)?[ \t]*\n([\s\S]*?)\n```[ \t]*/;

function isString(value) {
  return typeof value === "string" && value.length > 0;
}

function isObject(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

// Find the first fenced JSON code block in the markdown. The validator
// is intentionally tolerant of the prose between fenced blocks but
// strict about the block's location: it must appear before the first
// H1/H2 markdown header so it cannot accidentally match a JSON example
// embedded in the narrative.
export function findFirstFencedJsonBlock(markdown) {
  if (typeof markdown !== "string" || markdown.length === 0) {
    return { ok: false, error: "markdown content is empty" };
  }
  const headerIndex = (() => {
    const headerMatch = /^#{1,6}\s/m.exec(markdown);
    return headerMatch === null ? markdown.length : headerMatch.index;
  })();
  const leadingSection = markdown.slice(0, headerIndex);
  const match = FENCE_REGEX.exec(leadingSection);
  if (match === null) {
    return { ok: false, error: "no fenced JSON block found in the leading section" };
  }
  const body = match[1];
  try {
    const data = JSON.parse(body);
    return { ok: true, data };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { ok: false, error: `failed to parse JSON block: ${message}` };
  }
}

// Run native git with the same GIT_MASTER prefix the rest of the
// repository uses. This mirrors the rule documented in AGENTS.md and
// keeps repository hooks aware of the validator context.
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

export function shaExists(sha, { cwd } = {}) {
  if (typeof sha !== "string" || !SHA_REGEX.test(sha)) {
    return { ok: false, exists: false, error: "sha is not a 40-character lowercase hex string" };
  }
  const result = gitCommand(["cat-file", "-e", sha], { cwd });
  if (!result.ok) {
    return {
      ok: true,
      exists: false,
      error: `git cat-file -e exited with code ${result.code}: ${result.stderr.trim()}`,
    };
  }
  return { ok: true, exists: true };
}

// Forbidden-feature-claim scan over the full markdown text. Returns the
// list of violations, with byte offsets so the JSON output is precise.
export function findForbiddenClaims(markdown) {
  if (typeof markdown !== "string") {
    return [];
  }
  const violations = [];
  for (const { name, pattern } of FORBIDDEN_PATTERNS) {
    const match = pattern.exec(markdown);
    if (match !== null) {
      violations.push({
        kind: name,
        snippet: match[0],
        offset: match.index,
      });
    }
  }
  return violations;
}

// Date helpers.
function dateToUtcDayCount(dateString) {
  if (!ISO_DATE_REGEX.test(dateString)) return null;
  const parts = dateString.split("-").map((p) => Number.parseInt(p, 10));
  const year = parts[0];
  const month = parts[1];
  const day = parts[2];
  if (
    Number.isNaN(year) ||
    Number.isNaN(month) ||
    Number.isNaN(day) ||
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > 31
  ) {
    return null;
  }
  const utcMillis = Date.UTC(year, month - 1, day);
  const normalized = new Date(utcMillis);
  if (
    normalized.getUTCFullYear() !== year ||
    normalized.getUTCMonth() !== month - 1 ||
    normalized.getUTCDate() !== day
  ) {
    return null;
  }
  return Math.floor(utcMillis / 86_400_000);
}

function daysBetween(startDate, endDate) {
  const start = dateToUtcDayCount(startDate);
  const end = dateToUtcDayCount(endDate);
  if (start === null || end === null) return null;
  return end - start;
}

function distinctDates(values) {
  const seen = new Set();
  for (const value of values) {
    if (dateToUtcDayCount(value) !== null) seen.add(value);
  }
  return Array.from(seen).sort();
}

// Validate a parsed owner report. The function is pure: it never opens
// the filesystem or spawns git, so the TS test suite can call it with
// inline fixtures.
export function validateOwnerReport(parsed) {
  const checks = [];
  const errors = [];

  function check(name, ok, detail) {
    checks.push({ name, ok, ...(detail !== undefined ? { detail } : {}) });
    if (!ok) errors.push(name);
  }

  if (!isObject(parsed)) {
    check("report.shape", false, "report data must be a JSON object");
    return finalize("owner", checks, errors);
  }

  check("report.type", parsed.type === REPORT_TYPE_OWNER, {
    actual: parsed.type,
    expected: REPORT_TYPE_OWNER,
  });
  check("report.schemaVersion", isString(parsed.schemaVersion), { actual: parsed.schemaVersion });
  check("report.implementationSha", SHA_REGEX.test(parsed.implementationSha ?? ""), {
    actual: parsed.implementationSha,
  });
  check("report.status", parsed.status === "PASS" || parsed.status === "HOLD", {
    actual: parsed.status,
  });

  if (dateToUtcDayCount(parsed.windowStart ?? "") === null) {
    check("owner.windowStart.isoDate", false, { actual: parsed.windowStart });
  } else {
    check("owner.windowStart.isoDate", true);
  }
  if (dateToUtcDayCount(parsed.windowEnd ?? "") === null) {
    check("owner.windowEnd.isoDate", false, { actual: parsed.windowEnd });
  } else {
    check("owner.windowEnd.isoDate", true);
  }

  const span = daysBetween(parsed.windowStart, parsed.windowEnd);
  if (span === null) {
    check("owner.datesSpan.days", false, { detail: "windowStart/windowEnd must be ISO YYYY-MM-DD" });
  } else {
    check("owner.datesSpan.days", span >= OWNER_REQUIRED_DATES_SPAN, {
      actual: span,
      minimum: OWNER_REQUIRED_DATES_SPAN,
    });
  }

  const sessions = Array.isArray(parsed.effectiveSessions) ? parsed.effectiveSessions : [];
  const sessionDates = distinctDates(
    sessions.map((s) => (isObject(s) ? s.date : "")).filter(Boolean),
  );
  check("owner.effectiveSessions.isArray", Array.isArray(parsed.effectiveSessions), {
    actual: parsed.effectiveSessions,
  });
  check("owner.effectiveSessions.distinctDates", sessionDates.length >= OWNER_REQUIRED_EFFECTIVE_SESSIONS, {
    actualDistinctDates: sessionDates.length,
    minimum: OWNER_REQUIRED_EFFECTIVE_SESSIONS,
    dates: sessionDates,
  });

  // Required per-session fields: date, effortBoundaryMinutes, primaryTaskStableId,
  // action, nextDecisionChanged, reasonUnderstood, choiceFrictionNote.
  let requiredFieldsOk = true;
  let effortBoundaryOk = true;
  let actionOk = true;
  let withinWindowOk = true;
  const windowStartDay = dateToUtcDayCount(parsed.windowStart ?? "");
  const windowEndDay = dateToUtcDayCount(parsed.windowEnd ?? "");
  for (const [index, session] of sessions.entries()) {
    if (!isObject(session)) {
      requiredFieldsOk = false;
      continue;
    }
    const sessionChecks = {
      hasDate: dateToUtcDayCount(session.date ?? "") !== null,
      hasEffortBoundary: EFFORT_BOUNDARIES.includes(session.effortBoundaryMinutes),
      hasPrimaryTask: isString(session.primaryTaskStableId),
      hasAction: ["started", "completed", "skipped", "replaced"].includes(session.action),
      hasNextDecisionChanged: typeof session.nextDecisionChanged === "boolean",
      hasReasonUnderstood: typeof session.reasonUnderstood === "boolean",
      hasFrictionNote: isString(session.choiceFrictionNote),
      hasFailureOrBugId: isString(session.failureOrBugId),
    };
    const allFields = Object.values(sessionChecks).every(Boolean);
    if (!allFields) {
      requiredFieldsOk = false;
    }
    if (!sessionChecks.hasEffortBoundary) effortBoundaryOk = false;
    if (!sessionChecks.hasAction) actionOk = false;
    const sessionDay = dateToUtcDayCount(session.date ?? "");
    if (
      sessionDay === null ||
      windowStartDay === null ||
      windowEndDay === null ||
      sessionDay < windowStartDay ||
      sessionDay > windowEndDay
    ) {
      withinWindowOk = false;
    }
    if (!allFields) {
      checks.push({
        name: `owner.effectiveSessions[${index}].requiredFields`,
        ok: false,
        detail: sessionChecks,
      });
      errors.push(`owner.effectiveSessions[${index}].requiredFields`);
    }
  }
  check("owner.effectiveSessions.requiredFields", requiredFieldsOk);
  check("owner.effectiveSessions.effortBoundary", effortBoundaryOk, {
    allowed: EFFORT_BOUNDARIES,
  });
  check("owner.effectiveSessions.action", actionOk);
  check("owner.effectiveSessions.withinWindow", withinWindowOk, {
    windowStart: parsed.windowStart,
    windowEnd: parsed.windowEnd,
    dates: sessionDates,
  });

  // At least one full map→plan→today→completion→next-decision loop.
  const loops = Array.isArray(parsed.loopEvidence) ? parsed.loopEvidence : [];
  check("owner.loopEvidence.isArray", Array.isArray(parsed.loopEvidence), {
    actual: parsed.loopEvidence,
  });
  const completedLoopExists = loops.some((entry) => {
    if (!isObject(entry)) return false;
    return (
      entry.mapVisited === true &&
      entry.planVisited === true &&
      entry.todayVisited === true &&
      entry.completionRecorded === true &&
      entry.nextDecisionChanged === true
    );
  });
  check("owner.fullLoop.mapPlanTodayCompletionNext", completedLoopExists, {
    actual: loops.map((loop) =>
      isObject(loop)
        ? {
            date: loop.date,
            map: loop.mapVisited === true,
            plan: loop.planVisited === true,
            today: loop.todayVisited === true,
            completion: loop.completionRecorded === true,
            nextDecision: loop.nextDecisionChanged === true,
          }
        : null,
    ),
  });

  const failures = Array.isArray(parsed.failures) ? parsed.failures : [];
  let failuresOk = true;
  for (const [index, failure] of failures.entries()) {
    if (
      !isObject(failure) ||
      !isString(failure.id) ||
      !isString(failure.summary) ||
      !isString(failure.disposition)
    ) {
      failuresOk = false;
      checks.push({
        name: `owner.failures[${index}].shape`,
        ok: false,
        detail: failure,
      });
      errors.push(`owner.failures[${index}].shape`);
    }
  }
  check("owner.failures.shape", failuresOk);

  return finalize("owner", checks, errors);
}

// Validate a parsed participants report.
export function validateParticipantsReport(parsed) {
  const checks = [];
  const errors = [];

  function check(name, ok, detail) {
    checks.push({ name, ok, ...(detail !== undefined ? { detail } : {}) });
    if (!ok) errors.push(name);
  }

  if (!isObject(parsed)) {
    check("report.shape", false, "report data must be a JSON object");
    return finalize("participants", checks, errors);
  }

  check("report.type", parsed.type === REPORT_TYPE_PARTICIPANTS, {
    actual: parsed.type,
    expected: REPORT_TYPE_PARTICIPANTS,
  });
  check("report.schemaVersion", isString(parsed.schemaVersion), { actual: parsed.schemaVersion });
  check("report.implementationSha", SHA_REGEX.test(parsed.implementationSha ?? ""), {
    actual: parsed.implementationSha,
  });
  check("report.status", parsed.status === "PASS" || parsed.status === "HOLD", {
    actual: parsed.status,
  });

  const participants = Array.isArray(parsed.participants) ? parsed.participants : [];
  check("participants.isArray", Array.isArray(parsed.participants), {
    actual: parsed.participants,
  });

  const ids = participants
    .filter(isObject)
    .map((p) => p.id)
    .filter((id) => typeof id === "string");
  const uniqueSortedIds = Array.from(new Set(ids)).sort();
  check(
    "participants.ids",
    PARTICIPANT_REQUIRED_IDS.every((id) => ids.includes(id)) &&
      uniqueSortedIds.length === PARTICIPANT_REQUIRED_IDS.length,
    { actual: uniqueSortedIds, expected: PARTICIPANT_REQUIRED_IDS.slice().sort() },
  );

  let allDatesSpanOk = true;
  let allFullLoopOk = true;
  let allChoiceFrictionOk = true;
  let allReasonComprehensionOk = true;
  let allFailuresOk = true;

  for (const [index, participant] of participants.entries()) {
    if (!isObject(participant)) {
      allDatesSpanOk = false;
      allFullLoopOk = false;
      allChoiceFrictionOk = false;
      allReasonComprehensionOk = false;
      allFailuresOk = false;
      continue;
    }
    const span = daysBetween(participant.windowStart, participant.windowEnd);
    if (span === null || span < PARTICIPANT_REQUIRED_DATES_SPAN) {
      allDatesSpanOk = false;
      checks.push({
        name: `participants[${participant.id ?? index}].datesSpan.days`,
        ok: false,
        actual: span,
        minimum: PARTICIPANT_REQUIRED_DATES_SPAN,
      });
      errors.push(`participants[${participant.id ?? index}].datesSpan.days`);
    } else {
      checks.push({
        name: `participants[${participant.id ?? index}].datesSpan.days`,
        ok: true,
        actual: span,
      });
    }

    const hasLoop = participant.fullLoopCompleted === true;
    if (!hasLoop) {
      allFullLoopOk = false;
      checks.push({
        name: `participants[${participant.id ?? index}].fullLoopCompleted`,
        ok: false,
        actual: participant.fullLoopCompleted,
      });
      errors.push(`participants[${participant.id ?? index}].fullLoopCompleted`);
    } else {
      checks.push({
        name: `participants[${participant.id ?? index}].fullLoopCompleted`,
        ok: true,
      });
    }

    const choiceFrictionAnswer = participant.choiceFrictionAnswer;
    if (
      choiceFrictionAnswer !== "yes" &&
      choiceFrictionAnswer !== "no" &&
      choiceFrictionAnswer !== "partial"
    ) {
      allChoiceFrictionOk = false;
      checks.push({
        name: `participants[${participant.id ?? index}].choiceFrictionAnswer`,
        ok: false,
        actual: choiceFrictionAnswer,
      });
      errors.push(`participants[${participant.id ?? index}].choiceFrictionAnswer`);
    } else {
      checks.push({
        name: `participants[${participant.id ?? index}].choiceFrictionAnswer`,
        ok: true,
      });
    }

    const reasonAnswer = participant.reasonComprehensionAnswer;
    if (
      reasonAnswer !== "yes" &&
      reasonAnswer !== "no" &&
      reasonAnswer !== "partial"
    ) {
      allReasonComprehensionOk = false;
      checks.push({
        name: `participants[${participant.id ?? index}].reasonComprehensionAnswer`,
        ok: false,
        actual: reasonAnswer,
      });
      errors.push(`participants[${participant.id ?? index}].reasonComprehensionAnswer`);
    } else {
      checks.push({
        name: `participants[${participant.id ?? index}].reasonComprehensionAnswer`,
        ok: true,
      });
    }

    const failures = Array.isArray(participant.failures) ? participant.failures : [];
    let participantFailuresOk = true;
    for (const [failureIndex, failure] of failures.entries()) {
      if (
        !isObject(failure) ||
        !isString(failure.id) ||
        !isString(failure.summary) ||
        !isString(failure.disposition)
      ) {
        participantFailuresOk = false;
        checks.push({
          name: `participants[${participant.id ?? index}].failures[${failureIndex}].shape`,
          ok: false,
          detail: failure,
        });
        errors.push(
          `participants[${participant.id ?? index}].failures[${failureIndex}].shape`,
        );
      }
    }
    if (!participantFailuresOk) {
      allFailuresOk = false;
    }
  }

  check("participants.datesSpan.allOk", allDatesSpanOk);
  check("participants.fullLoop.allOk", allFullLoopOk);
  check("participants.choiceFrictionAnswer.allOk", allChoiceFrictionOk);
  check("participants.reasonComprehensionAnswer.allOk", allReasonComprehensionOk);
  check("participants.failures.allOk", allFailuresOk);

  return finalize("participants", checks, errors);
}

function finalize(kind, checks, errors) {
  const ok = errors.length === 0;
  return {
    ok,
    kind,
    summary: {
      totalChecks: checks.length,
      failedChecks: errors.length,
    },
    failedChecks: errors,
    checks,
  };
}

// Run the validator end-to-end. Returns a result object that can be
// JSON-serialized; the CLI path additionally calls `process.exit`.
export function runOwnerValidation({ markdown, cwd }) {
  const forbidden = findForbiddenClaims(markdown);
  const parsed = findFirstFencedJsonBlock(markdown);
  if (!parsed.ok) {
    return {
      ok: false,
      kind: "owner",
      summary: { totalChecks: 0, failedChecks: 1 },
      failedChecks: ["report.json.parse"],
      checks: [{ name: "report.json.parse", ok: false, error: parsed.error }],
      forbiddenClaims: forbidden,
    };
  }
  const validation = validateOwnerReport(parsed.data);
  const shaCheck = (() => {
    const sha = parsed.data.implementationSha;
    if (typeof sha !== "string" || !SHA_REGEX.test(sha)) {
      return { ok: false, exists: false, error: "implementationSha missing or malformed" };
    }
    return shaExists(sha, { cwd });
  })();
  const shaOk = shaCheck.ok && shaCheck.exists === true;
  const shaCheckEntry = {
    name: "report.implementationSha.gitExists",
    ok: shaOk,
    ...(shaCheck.error !== undefined ? { error: shaCheck.error } : {}),
  };
  const checks = [...validation.checks, shaCheckEntry];
  const failedChecks = [...validation.failedChecks];
  if (!shaOk) failedChecks.push("report.implementationSha.gitExists");
  return {
    ok: validation.ok && shaOk && forbidden.length === 0,
    kind: "owner",
    summary: {
      totalChecks: checks.length,
      failedChecks: failedChecks.length,
    },
    failedChecks,
    checks,
    forbiddenClaims: forbidden,
  };
}

export function runParticipantsValidation({ markdown, cwd }) {
  const forbidden = findForbiddenClaims(markdown);
  const parsed = findFirstFencedJsonBlock(markdown);
  if (!parsed.ok) {
    return {
      ok: false,
      kind: "participants",
      summary: { totalChecks: 0, failedChecks: 1 },
      failedChecks: ["report.json.parse"],
      checks: [{ name: "report.json.parse", ok: false, error: parsed.error }],
      forbiddenClaims: forbidden,
    };
  }
  const validation = validateParticipantsReport(parsed.data);
  const shaCheck = (() => {
    const sha = parsed.data.implementationSha;
    if (typeof sha !== "string" || !SHA_REGEX.test(sha)) {
      return { ok: false, exists: false, error: "implementationSha missing or malformed" };
    }
    return shaExists(sha, { cwd });
  })();
  const shaOk = shaCheck.ok && shaCheck.exists === true;
  const shaCheckEntry = {
    name: "report.implementationSha.gitExists",
    ok: shaOk,
    ...(shaCheck.error !== undefined ? { error: shaCheck.error } : {}),
  };
  const checks = [...validation.checks, shaCheckEntry];
  const failedChecks = [...validation.failedChecks];
  if (!shaOk) failedChecks.push("report.implementationSha.gitExists");
  return {
    ok: validation.ok && shaOk && forbidden.length === 0,
    kind: "participants",
    summary: {
      totalChecks: checks.length,
      failedChecks: failedChecks.length,
    },
    failedChecks,
    checks,
    forbiddenClaims: forbidden,
  };
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
      owner: { type: "string" },
      participants: { type: "string" },
    },
  });
  const ownerPath = values.owner;
  const participantsPath = values.participants;
  if (!ownerPath && !participantsPath) {
    emit({
      ok: false,
      kind: "usage",
      summary: { totalChecks: 0, failedChecks: 1 },
      failedChecks: ["usage"],
      checks: [
        {
          name: "usage",
          ok: false,
          error: "specify either --owner <path> or --participants <path>",
        },
      ],
    });
    process.exitCode = 2;
  } else if (ownerPath && participantsPath) {
    emit({
      ok: false,
      kind: "usage",
      summary: { totalChecks: 0, failedChecks: 1 },
      failedChecks: ["usage"],
      checks: [
        {
          name: "usage",
          ok: false,
          error: "specify exactly one of --owner or --participants, not both",
        },
      ],
    });
    process.exitCode = 2;
  } else if (ownerPath) {
    const target = resolve(process.cwd(), ownerPath);
    const read = readReport(target);
    if (!read.ok) {
      emit({
        ok: false,
        kind: "owner",
        summary: { totalChecks: 0, failedChecks: 1 },
        failedChecks: ["report.read"],
        checks: [{ name: "report.read", ok: false, error: read.error }],
      });
      process.exitCode = 2;
    } else {
      emit(runOwnerValidation({ markdown: read.content, cwd: process.cwd() }));
    }
  } else {
    const target = resolve(process.cwd(), participantsPath);
    const read = readReport(target);
    if (!read.ok) {
      emit({
        ok: false,
        kind: "participants",
        summary: { totalChecks: 0, failedChecks: 1 },
        failedChecks: ["report.read"],
        checks: [{ name: "report.read", ok: false, error: read.error }],
      });
      process.exitCode = 2;
    } else {
      emit(runParticipantsValidation({ markdown: read.content, cwd: process.cwd() }));
    }
  }
}
