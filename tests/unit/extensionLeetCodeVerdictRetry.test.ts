import { describe, expect, it } from "vitest";
import { safeStoredCaptureError } from "@/extension/src/captureErrorPrivacy";
import {
  shouldRetryLeetCodeVerdictCandidate,
  storageChangeRevivesVerdictCandidate,
} from "@/extension/src/adapters/leetcode/network";

describe("shouldRetryLeetCodeVerdictCandidate", () => {
  it("retries when no confirmed submission is visible yet", () => {
    expect(shouldRetryLeetCodeVerdictCandidate([])).toBe(true);
  });

  it("does not retry once the E2 confirmation is visible", () => {
    expect(shouldRetryLeetCodeVerdictCandidate(["cn/740553045"])).toBe(false);
  });

  it("does not retry on a multi-candidate ambiguity", () => {
    expect(shouldRetryLeetCodeVerdictCandidate(["cn/1", "cn/2"])).toBe(false);
  });
});

describe("storageChangeRevivesVerdictCandidate", () => {
  it("revives only when the confirmed-submissions key changed", () => {
    expect(storageChangeRevivesVerdictCandidate({ confirmedSubmissions: {} })).toBe(true);
    expect(storageChangeRevivesVerdictCandidate({ captureEnabled: false })).toBe(false);
    expect(storageChangeRevivesVerdictCandidate({})).toBe(false);
    expect(storageChangeRevivesVerdictCandidate(null)).toBe(false);
    expect(storageChangeRevivesVerdictCandidate(undefined)).toBe(false);
    expect(storageChangeRevivesVerdictCandidate("confirmedSubmissions")).toBe(false);
  });
});

describe("verdict candidate timeout diagnostic", () => {
  it("passes the closed timeout reason through the storage allowlist", () => {
    const reason = "verdict candidate unconfirmed: leetcode:two-sum";
    expect(safeStoredCaptureError(reason)).toBe(reason);
  });

  it("rejects slashes, spaces, and non-slug problem identities", () => {
    expect(safeStoredCaptureError("verdict candidate unconfirmed: leetcode:two/sum")).toBe("Retained capture error");
    expect(safeStoredCaptureError("verdict candidate unconfirmed: leetcode:two sum")).toBe("Retained capture error");
    expect(safeStoredCaptureError("verdict candidate unconfirmed: leetcode:..")).toBe("Retained capture error");
  });

  it("rejects other verdict-candidate-like text with no match", () => {
    expect(safeStoredCaptureError("verdict candidate confirmed: leetcode:two-sum")).toBe("Retained capture error");
    expect(safeStoredCaptureError("unconfirmed: leetcode:two-sum")).toBe("Retained capture error");
  });
});
