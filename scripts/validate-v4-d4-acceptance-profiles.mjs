#!/usr/bin/env node

import { existsSync, readFileSync, realpathSync, statSync } from "node:fs";
import { dirname, isAbsolute, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "..");
const profilePath = resolve(
  repoRoot,
  "docs/superpowers/specs/v4-d4-acceptance-profiles.json",
);
const readinessPath = resolve(
  repoRoot,
  "docs/superpowers/specs/v4-adapter-readiness.json",
);

const CORE_INVARIANTS = Object.freeze([
  "candidate_artifact_identity",
  "isolated_zero_baseline",
  "single_authorized_action",
  "intervention_bounded_action_epoch",
  "unique_new_submission_identity",
  "exact_e2_e3_binding",
  "exactly_once_delivery_projection",
  "closed_terminal_recovery_state",
  "privacy_and_platform_isolation",
]);
const ACTIVATION_PREREQUISITES = Object.freeze([]);
const REMAINING_AUTHORIZATION_GATES = Object.freeze([
  "candidate_freeze",
  "live_observation",
]);
const AUTHORIZATION_SOURCE = "docs/superpowers/plans/2026-08-16-v4-phase-d-d4-platform-specific-acceptance-rescue.md";
const TRANSPORT_AUTHORIZATION_SOURCE = "docs/superpowers/plans/2026-08-24-v4-phase-d-local-vault-no-pairing-revision.md";
const PROPOSED_PLATFORMS = Object.freeze(["leetcode", "nowcoder"]);
const DEFERRED_PLATFORMS = Object.freeze(["atcoder", "codeforces", "luogu"]);
const FORBIDDEN_ROOT = /(?:latest|highest|time[- ]?only|time window|window[- ]?only|popup[- ]?only)/iu;
const REQUIRED_FORBIDDEN_FALLBACKS = Object.freeze({
  leetcode: Object.freeze([
    "latest_submission",
    "highest_submission_id",
    "time_only",
    "window_only",
    "historical_result",
    "popup_only",
    "click_derived_waiting",
  ]),
  nowcoder: Object.freeze([
    "latest_submission",
    "highest_submission_id",
    "time_only",
    "window_only",
    "global_submission_list",
    "popup_only",
    "click_derived_waiting",
  ]),
});
const READINESS_POLICY_ALIGNMENT = Object.freeze({
  leetcode: "aligned",
  nowcoder: "aligned",
});
const READY_REQUIRED_STATE = Object.freeze([
  "exact_dist_and_fixed_extension_id",
  "canonical_localhost_endpoint",
  "active_disposable_vault_zero_database",
  "capture_connection_connected",
  "capture_recovery_ready",
  "empty_waiting_outbox_quarantine",
]);
const READY_RECEIPT_BINDINGS = Object.freeze([
  "candidate_sha",
  "candidate_receipt_hash",
  "exact_dist_hashes",
  "profile_identity",
  "database_identity",
  "vault_config_identity",
  "extension_id",
  "installation_identity",
  "capability_version",
]);

function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function nonemptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function nonemptyStringArray(value) {
  return Array.isArray(value) && value.length > 0 && value.every(nonemptyString);
}

function evidencePathExists(root, evidencePath) {
  if (!nonemptyString(evidencePath)) return false;
  const normalized = evidencePath.replace(/\\/g, "/").trim();
  if (normalized.startsWith("/") || /^[a-zA-Z]:\//u.test(normalized)
    || normalized.split("/").includes("..")) return false;
  try {
    const realRoot = realpathSync(root);
    const realEvidence = realpathSync(resolve(realRoot, normalized));
    const relativePath = relative(realRoot, realEvidence);
    return relativePath !== ""
      && relativePath !== ".."
      && !relativePath.startsWith(`..${process.platform === "win32" ? "\\" : "/"}`)
      && !isAbsolute(relativePath)
      && statSync(realEvidence).isFile();
  } catch {
    return false;
  }
}

function readinessStatuses(document) {
  const statuses = new Map();
  if (!isRecord(document) || !Array.isArray(document.records)) return statuses;
  for (const record of document.records) {
    if (!isRecord(record) || !nonemptyString(record.platform)
      || !nonemptyString(record.status)) continue;
    statuses.set(record.platform, record.status);
  }
  return statuses;
}

function sameClosedList(actual, expected) {
  return Array.isArray(actual)
    && actual.length === expected.length
    && actual.every((value, index) => value === expected[index]);
}

export function validateV4D4AcceptanceProfiles(
  document,
  readinessDocument,
  root = process.cwd(),
) {
  if (!isRecord(document)) return ["acceptance profile document must be an object"];
  const failures = [];
  if (document.schemaVersion !== 1) failures.push("schemaVersion must be 1");
  if (document.contractStatus !== "authorized_for_offline_work_only") {
    failures.push("contract status must remain authorized for offline work only");
  }
  if (document.authorizationSource !== AUTHORIZATION_SOURCE
    || !evidencePathExists(root, document.authorizationSource)) {
    failures.push("authorization source must resolve to the reviewed D4 rescue plan");
  }
  if (document.transportAuthorizationSource !== TRANSPORT_AUTHORIZATION_SOURCE
    || !evidencePathExists(root, document.transportAuthorizationSource)) {
    failures.push("transport authorization source must resolve to the approved Route H plan");
  }
  if (!sameClosedList(document.activationPrerequisites, ACTIVATION_PREREQUISITES)) {
    failures.push("activation prerequisites must be empty after P0A completion");
  }
  if (!sameClosedList(document.remainingAuthorizationGates, REMAINING_AUTHORIZATION_GATES)) {
    failures.push("candidate freeze and live observation must remain separately gated");
  }
  if (document.minimumCausalGrade !== "ISOLATED") {
    failures.push("authorized minimum causal grade must be ISOLATED");
  }
  if (document.directCapability !== "CAPABILITY_BLOCKED") {
    failures.push("direct capability must remain CAPABILITY_BLOCKED");
  }
  if (document.aggregateCompletion !== "all-active-profiles-pass-on-one-candidate") {
    failures.push("aggregate completion must require one candidate");
  }
  if (!sameClosedList(document.coreInvariants, CORE_INVARIANTS)) {
    failures.push("core invariants must match the closed D4 contract");
  }
  const connection = document.readyConnectionContract;
  if (!isRecord(connection)
    || connection.status !== "authorized_offline_preparation_only"
    || connection.preparation !== "fresh_profile_localhost_settings_once"
    || !sameClosedList(connection.requiredState, READY_REQUIRED_STATE)
    || !sameClosedList(connection.receiptBindings, READY_RECEIPT_BINDINGS)
    || connection.secretPolicy !== "ready_runner_never_reads_copies_or_emits_raw_capability") {
    failures.push("READY connection contract must match the closed Route H preparation boundary");
  }

  const readiness = readinessStatuses(readinessDocument);
  const profiles = Array.isArray(document.profiles) ? document.profiles : [];
  if (!Array.isArray(document.profiles)) failures.push("profiles must be an array");
  const seen = new Set();
  for (const candidate of profiles) {
    const platform = isRecord(candidate) && nonemptyString(candidate.platform)
      ? candidate.platform
      : "unknown";
    if (!isRecord(candidate)) {
      failures.push(`${platform}: profile must be an object`);
      continue;
    }
    if (!PROPOSED_PLATFORMS.includes(platform)) {
      failures.push(`${platform}: platform is not proposed in D4 rescue`);
    }
    if (seen.has(platform)) failures.push(`${platform}: duplicate platform profile`);
    seen.add(platform);
    if (candidate.status !== "authorized_offline") {
      failures.push(`${platform}: status must remain authorized for offline work only`);
    }
    if (candidate.causalGrade !== "ISOLATED") {
      failures.push(`${platform}: causal grade must be ISOLATED`);
    }
    if (candidate.readinessStatus !== readiness.get(platform)) {
      failures.push(`${platform}: acceptance/readiness status disagreement`);
    }
    const expectedAlignment = READINESS_POLICY_ALIGNMENT[
      /** @type {keyof typeof READINESS_POLICY_ALIGNMENT} */ (platform)
    ];
    if (candidate.readinessPolicyAlignment !== expectedAlignment) {
      failures.push(`${platform}: readiness policy alignment disposition is invalid`);
    }
    for (const field of [
      "profileVersion",
      "targetScope",
      "actionRoot",
      "submissionRoot",
    ]) {
      if (!nonemptyString(candidate[field])) failures.push(`${platform}: ${field} is required`);
    }
    if (!evidencePathExists(root, candidate.characterizationSource)) {
      failures.push(`${platform}: characterization source must exist as a repository file`);
    }
    for (const field of [
      "permittedCorroboration",
      "forbiddenFallbacks",
      "privacyFields",
    ]) {
      if (!nonemptyStringArray(candidate[field])) {
        failures.push(`${platform}: ${field} must be a nonempty string array`);
      }
    }
    if (nonemptyString(candidate.submissionRoot)
      && FORBIDDEN_ROOT.test(candidate.submissionRoot)) {
      failures.push(`${platform}: submission root contains a forbidden fallback`);
    }
    const requiredFallbacks = REQUIRED_FORBIDDEN_FALLBACKS[
      /** @type {keyof typeof REQUIRED_FORBIDDEN_FALLBACKS} */ (platform)
    ];
    if (requiredFallbacks !== undefined
      && !sameClosedList(candidate.forbiddenFallbacks, requiredFallbacks)) {
      failures.push(`${platform}: forbidden fallbacks must match the closed platform list`);
    }
    if (Object.prototype.hasOwnProperty.call(candidate, "coreOverrides")) {
      failures.push(`${platform}: profiles cannot override core invariants`);
    }
  }
  for (const platform of PROPOSED_PLATFORMS) {
    if (!seen.has(platform)) failures.push(`${platform}: proposed profile is required`);
  }

  const deferred = Array.isArray(document.deferredPlatforms)
    ? document.deferredPlatforms
    : [];
  if (!Array.isArray(document.deferredPlatforms)) {
    failures.push("deferredPlatforms must be an array");
  }
  const deferredSeen = new Set();
  for (const candidate of deferred) {
    const platform = isRecord(candidate) && nonemptyString(candidate.platform)
      ? candidate.platform
      : "unknown";
    if (!isRecord(candidate)) {
      failures.push(`${platform}: deferred profile must be an object`);
      continue;
    }
    if (!DEFERRED_PLATFORMS.includes(platform)) {
      failures.push(`${platform}: platform is not a deferred D4 platform`);
    }
    if (deferredSeen.has(platform)) failures.push(`${platform}: duplicate deferred platform`);
    deferredSeen.add(platform);
    if (candidate.readinessStatus !== "blocked") {
      failures.push(`${platform}: deferred platform must retain readiness status blocked`);
    }
    if (readiness.get(platform) !== "blocked") {
      failures.push(`${platform}: readiness document no longer records blocked`);
    }
  }
  for (const platform of DEFERRED_PLATFORMS) {
    if (!deferredSeen.has(platform)) failures.push(`${platform}: deferred platform is required`);
  }
  return failures;
}

function main() {
  if (process.argv[2] !== "--all") {
    console.error("usage: node scripts/validate-v4-d4-acceptance-profiles.mjs --all");
    process.exitCode = 2;
    return;
  }
  if (!existsSync(profilePath) || !existsSync(readinessPath)) {
    console.error("V4 D4 acceptance profiles FAIL: required source is unreadable");
    process.exitCode = 1;
    return;
  }
  let profiles;
  let readiness;
  try {
    profiles = JSON.parse(readFileSync(profilePath, "utf8"));
    readiness = JSON.parse(readFileSync(readinessPath, "utf8"));
  } catch {
    console.error("V4 D4 acceptance profiles FAIL: invalid JSON");
    process.exitCode = 1;
    return;
  }
  const failures = validateV4D4AcceptanceProfiles(profiles, readiness, repoRoot);
  if (failures.length > 0) {
    for (const failure of failures) console.error(`- ${failure}`);
    process.exitCode = 1;
    return;
  }
  console.log("V4 D4 acceptance profiles PASS");
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) main();
