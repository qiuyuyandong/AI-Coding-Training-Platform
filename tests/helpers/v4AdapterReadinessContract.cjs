"use strict";

const characterizedStatuses = new Set([
  "candidate",
  "experimental",
  "blocked",
  "production",
  "disabled",
]);

function isNonBlankString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function hasEntries(value) {
  return Array.isArray(value) && value.length > 0;
}

function normalizeRepoRelativePath(raw) {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  if (trimmed.length === 0) return null;
  if (/^[a-zA-Z]:[\\/]/.test(trimmed)) return null;
  if (/^[\\/]/.test(trimmed)) return null;
  const segments = trimmed.replace(/\\/g, "/").split("/");
  let depth = 0;
  for (const segment of segments) {
    if (segment === "" || segment === ".") continue;
    if (segment === "..") {
      if (depth === 0) return null;
      depth -= 1;
      continue;
    }
    depth += 1;
  }
  return trimmed.replace(/\\/g, "/");
}

function validateV4AdapterReadinessRecord(value) {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return ["record must be an object"];
  }

  const record = value;
  const failures = [];
  if (!isNonBlankString(record.platform)) failures.push("platform is required");
  if (
    record.status !== "uncharacterized" &&
    record.status !== "candidate" &&
    record.status !== "experimental" &&
    record.status !== "blocked" &&
    record.status !== "production" &&
    record.status !== "disabled"
  ) {
    failures.push("status is invalid");
    return failures;
  }

  if (!characterizedStatuses.has(record.status)) return failures;

  if (record.status === "disabled") {
    if (!isNonBlankString(record.disableReason)) {
      failures.push("disable reason is required for disabled status");
    }
    return failures;
  }

  if (typeof record.characterization !== "object" || record.characterization === null) {
    failures.push("characterization is required");
  } else {
    const characterization = record.characterization;
    if (!isNonBlankString(characterization.date)) failures.push("characterization date is required");
    if (!isNonBlankString(characterization.source)) {
      failures.push("characterization source is required");
    } else if (normalizeRepoRelativePath(characterization.source) === null) {
      failures.push("characterization source must be a repo-relative path");
    }
    if (characterization.tier !== "public" && characterization.tier !== "authenticated") {
      failures.push("characterization tier is required");
    }
    if (record.status === "production" && characterization.tier === "authenticated") {
      failures.push("authenticated characterization cannot support production");
    }
  }

  if (!isNonBlankString(record.requestMatcher)) failures.push("request matcher is required");
  if (!isNonBlankString(record.e2Policy)) failures.push("E2 policy is required");
  if (!isNonBlankString(record.e3Policy)) failures.push("E3 policy is required");
  if (!hasEntries(record.privacyFields)) failures.push("privacy fields are required");
  if (!hasEntries(record.fakeOjCases)) failures.push("Fake OJ cases are required");
  if (!isNonBlankString(record.realObservation)) {
    failures.push("real observation is required");
  } else if (normalizeRepoRelativePath(record.realObservation) === null) {
    failures.push("real observation must be a repo-relative path");
  }
  if (!isNonBlankString(record.failureDisposition)) {
    failures.push("failure disposition is required");
  }
  if (!isNonBlankString(record.endpointDriftDisposition)) {
    failures.push("endpoint drift disposition is required");
  }
  if (record.status === "production" && record.productionCertification !== true) {
    failures.push("production certification is required");
  }

  return failures;
}

module.exports = {
  validateV4AdapterReadinessRecord,
  normalizeRepoRelativePath,
};
