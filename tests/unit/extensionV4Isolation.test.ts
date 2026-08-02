import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";
import { PLATFORM_ADAPTERS } from "@/extension/src/adapters/registry";
import { LEETCODE_NETWORK_POLICY } from "@/extension/src/adapters/leetcode/network";
import { NOWCODER_NETWORK_POLICY } from "@/extension/src/adapters/nowcoder/network";
import {
  recordConfirmedSubmission,
  type ConfirmedSubmissionRecord,
  type ConfirmedSubmissionState,
} from "@/extension/src/confirmedSubmissionStorage";
import { planExtensionInitialization } from "@/extension/src/installation";

const NOW = "2026-08-02T14:00:00.000Z";
const SOURCE_ROOT = join(process.cwd(), "extension", "src");

function sourceFiles(root: string): string[] {
  return readdirSync(root).flatMap((entry) => {
    const path = join(root, entry);
    return statSync(path).isDirectory() ? sourceFiles(path) : [path];
  }).filter((path) => path.endsWith(".ts"));
}

function confirmed(platform: "leetcode" | "nowcoder", problemExternalId: string): ConfirmedSubmissionRecord {
  return Object.freeze({
    schemaVersion: 1,
    status: "confirmed",
    platform,
    problemExternalId,
    externalSubmissionId: "42",
    confirmedAt: NOW,
    storageKey: `${platform}:42`,
    lastE3At: NOW,
  });
}

describe("V4 platform isolation", () => {
  it("routes request shapes only through their owner policy", () => {
    const nowcoderRequest = {
      kind: "request",
      url: "https://ac.nowcoder.com/nccommon/submit_cd",
      requestId: "same-request",
      method: "POST",
      resourceType: "xmlhttprequest",
      lifecycle: "completed",
      statusCode: 200,
      tabId: 7,
      frameId: 0,
      documentId: "doc-owner",
      receivedAt: NOW,
      apiTimeStamp: 1,
    };
    const leetcodeRequest = {
      ...nowcoderRequest,
      url: "https://leetcode.cn/problems/two-sum/submit/",
    };

    expect(NOWCODER_NETWORK_POLICY.requestEvidence(nowcoderRequest)?.platform).toBe("nowcoder");
    expect(LEETCODE_NETWORK_POLICY.requestEvidence(nowcoderRequest)).toBeNull();
    expect(LEETCODE_NETWORK_POLICY.requestEvidence(leetcodeRequest)?.platform).toBe("leetcode");
    expect(NOWCODER_NETWORK_POLICY.requestEvidence(leetcodeRequest)).toBeNull();
  });

  it("namespaces the same raw submission ID by platform", () => {
    const empty: ConfirmedSubmissionState = Object.freeze({ confirmed: Object.freeze([]), tombstones: Object.freeze([]) });
    const leetcode = recordConfirmedSubmission(empty, confirmed("leetcode", "two-sum"), NOW).state;
    const both = recordConfirmedSubmission(leetcode, confirmed("nowcoder", "practice/abc"), NOW).state;

    expect(both.confirmed.map((record) => record.storageKey)).toEqual([
      "leetcode:42",
      "nowcoder:42",
    ]);
  });

  it("preserves durable records for every platform regardless of readiness metadata", () => {
    const records = [confirmed("leetcode", "two-sum"), confirmed("nowcoder", "practice/abc")];
    const plan = planExtensionInitialization({
      captureProtocolVersion: 4,
      installationId: "installation-isolation",
      confirmedSubmissions: records,
      confirmedSubmissionTombstones: [],
      captureOutbox: [{ id: "opaque-existing-outbox" }],
    }, {
      now: NOW,
      createInstallationId: () => "unused",
    });

    expect(plan.confirmedSubmissions).toEqual(records);
    expect(plan.captureOutbox).toEqual([{ id: "opaque-existing-outbox" }]);
    const terminalStatuses = new Set<string>(["experimental", "blocked", "disabled", "production"]);
    expect(Object.values(PLATFORM_ADAPTERS).every((record) =>
      terminalStatuses.has(record.v4NetworkStatus)
    )).toBe(true);
  });

  it("has no reachable V3 click-intent event or pending-intent write path", () => {
    const findings = sourceFiles(SOURCE_ROOT).flatMap((path) => {
      const source = readFileSync(path, "utf8");
      const forbidden = [
        "v3_submission_intent_recorded",
        "SUBMISSION_INTENT_OBSERVED",
        "pendingSubmissionIntents:",
      ];
      return forbidden
        .filter((token) => source.includes(token))
        .map((token) => `${relative(process.cwd(), path)} contains ${token}`);
    });

    expect(findings).toEqual([]);
  });

  it("keeps Fake OJ protocol claims out of the production registry", () => {
    const registry = readFileSync(join(SOURCE_ROOT, "adapters", "registry.ts"), "utf8");
    expect(registry).not.toMatch(/fake[ _-]?oj/iu);
    expect(registry).not.toContain("__capture_v4_fake_oj__");
  });
});
