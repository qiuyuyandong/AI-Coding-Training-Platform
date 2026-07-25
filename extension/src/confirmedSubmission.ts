import type { Platform } from "./platforms";

export type ConfirmedSubmission = {
  readonly schemaVersion: 1;
  readonly status: "confirmed";
  readonly platform: Platform;
  readonly problemExternalId: string;
  readonly externalSubmissionId: string;
  readonly confirmedAt: string;
};

export function readConfirmedSubmissions(
  value: unknown,
): readonly ConfirmedSubmission[] {
  return Array.isArray(value) ? value.filter(isConfirmedSubmission) : [];
}

function isConfirmedSubmission(value: unknown): value is ConfirmedSubmission {
  return typeof value === "object" && value !== null
    && "schemaVersion" in value && value.schemaVersion === 1
    && "status" in value && value.status === "confirmed"
    && hasPlatform(value, "platform")
    && hasNonemptyString(value, "problemExternalId")
    && hasNonemptyString(value, "externalSubmissionId")
    && hasNonemptyString(value, "confirmedAt");
}

function hasNonemptyString(value: object, key: string): boolean {
  return key in value
    && typeof Reflect.get(value, key) === "string"
    && String(Reflect.get(value, key)).length > 0;
}

function hasPlatform(value: object, key: string): boolean {
  if (!(key in value)) return false;
  const platform = Reflect.get(value, key);
  return platform === "leetcode" || platform === "nowcoder" || platform === "luogu"
    || platform === "codeforces" || platform === "atcoder";
}
