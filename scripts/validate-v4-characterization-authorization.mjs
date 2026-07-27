#!/usr/bin/env node

import { existsSync, readFileSync } from "node:fs";

const FENCED_JSON = /^\s*```json\s*\n([\s\S]*?)\n```/;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const REQUIRED_FORBIDDEN_DATA = Object.freeze([
  "source_code",
  "request_response_bodies",
  "cookies",
  "tokens",
  "csrf_values",
  "passwords",
  "complete_headers",
  "account_identity",
  "full_problem_statements",
]);
const REQUIRED_STOP_CONDITIONS = Object.freeze([
  "forbidden_data_displayed_or_persisted",
  "user_withdraws_authorization",
]);
const ALLOWED_RETAINED_FIELDS = new Set([
  "platform",
  "method",
  "normalized_path",
  "resource_type",
  "status_code",
  "normalized_redirect_path",
  "response_top_level_field_names",
  "submission_id_field_name",
  "submission_id_scalar_type",
  "verdict_status_field_name",
  "verdict_status_scalar_type",
  "tab_frame_document_relationship",
  "relative_timing_order",
  "signal_observed_from_real_user_action",
]);
const NOWCODER_HOSTNAME = /(?:^|\.)nowcoder\.com$/i;

function isValidDate(value) {
  if (typeof value !== "string" || !ISO_DATE.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

function isNonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function isUniqueStringArray(value) {
  return (
    Array.isArray(value) &&
    value.length > 0 &&
    value.every(isNonEmptyString) &&
    new Set(value).size === value.length
  );
}

export function validateAuthorization(data) {
  const failures = [];
  if (typeof data !== "object" || data === null || Array.isArray(data)) {
    return ["authorization record must be an object"];
  }

  if (data.type !== "v4-characterization-authorization") {
    failures.push("type must be v4-characterization-authorization");
  }
  if (data.schemaVersion !== "v4-characterization-authorization-1") {
    failures.push("schemaVersion must be v4-characterization-authorization-1");
  }
  if (!isValidDate(data.date)) failures.push("date must be a real ISO calendar date");
  if (data.status !== "approved") failures.push("status must be approved");
  if (data.platform !== "nowcoder") failures.push("platform must be nowcoder");
  if (!isNonEmptyString(data.hostname) || !NOWCODER_HOSTNAME.test(data.hostname)) {
    failures.push("hostname must be a NowCoder hostname without a URL path");
  }
  if (!isNonEmptyString(data.pageType)) failures.push("pageType is required");
  if (!isNonEmptyString(data.problemSelection)) failures.push("problemSelection is required");
  if (data.userActionOwner !== "user") {
    failures.push("userActionOwner must be user");
  }
  if (!Number.isInteger(data.maximumNaturalSubmissions) || data.maximumNaturalSubmissions < 1) {
    failures.push("maximumNaturalSubmissions must be an integer of at least 1");
  }
  if (data.browseOnlyObservation !== true) {
    failures.push("browseOnlyObservation must be true");
  }
  if (
    !isUniqueStringArray(data.forbiddenData) ||
    !REQUIRED_FORBIDDEN_DATA.every((field) => data.forbiddenData.includes(field))
  ) {
    failures.push("forbiddenData must declare every required forbidden data category");
  }
  if (
    !isUniqueStringArray(data.retainedFields) ||
    !data.retainedFields.every((field) => ALLOWED_RETAINED_FIELDS.has(field))
  ) {
    failures.push("retainedFields must contain only approved safe transcript fields");
  }
  if (
    !isUniqueStringArray(data.stopConditions) ||
    !REQUIRED_STOP_CONDITIONS.every((condition) => data.stopConditions.includes(condition))
  ) {
    failures.push("stopConditions must include forbidden-data and authorization-withdrawal stops");
  }
  return failures;
}

function parseReport(markdown) {
  const match = FENCED_JSON.exec(markdown);
  if (match === null) return { ok: false, error: "report must start with a fenced JSON record" };
  try {
    return { ok: true, data: JSON.parse(match[1]) };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { ok: false, error: `authorization record is not valid JSON: ${message}` };
  }
}

function main() {
  const path = process.argv[2];
  if (!isNonEmptyString(path)) {
    console.error("usage: node scripts/validate-v4-characterization-authorization.mjs <report-path>");
    process.exitCode = 2;
    return;
  }
  if (!existsSync(path)) {
    console.error(`authorization report does not exist: ${path}`);
    process.exitCode = 1;
    return;
  }

  const parsed = parseReport(readFileSync(path, "utf8"));
  if (!parsed.ok) {
    console.error(parsed.error);
    process.exitCode = 1;
    return;
  }

  const failures = validateAuthorization(parsed.data);
  if (failures.length > 0) {
    for (const failure of failures) console.error(`- ${failure}`);
    process.exitCode = 1;
    return;
  }
  console.log("V4 characterization authorization PASS");
}

if (process.argv[1] !== undefined && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  main();
}
