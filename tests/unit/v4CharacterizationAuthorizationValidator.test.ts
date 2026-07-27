import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { afterEach, describe, expect, test } from "vitest";

const validatorPath = resolve(
  process.cwd(),
  "scripts/validate-v4-characterization-authorization.mjs",
);
const tempRoots: string[] = [];

function validAuthorization(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    type: "v4-characterization-authorization",
    schemaVersion: "v4-characterization-authorization-1",
    date: "2026-07-26",
    status: "approved",
    platform: "nowcoder",
    hostname: "ac.nowcoder.com",
    pageType: "practice problem",
    problemSelection: "user-selected low-risk problem",
    userActionOwner: "user",
    maximumNaturalSubmissions: 1,
    browseOnlyObservation: true,
    forbiddenData: [
      "source_code",
      "request_response_bodies",
      "cookies",
      "tokens",
      "csrf_values",
      "passwords",
      "complete_headers",
      "account_identity",
      "full_problem_statements",
    ],
    retainedFields: ["platform", "method", "normalized_path", "status_code"],
    stopConditions: [
      "forbidden_data_displayed_or_persisted",
      "user_withdraws_authorization",
    ],
    ...overrides,
  };
}

function writeReport(data: Record<string, unknown>): string {
  const root = mkdtempSync(join(tmpdir(), "v4-characterization-auth-"));
  tempRoots.push(root);
  const path = join(root, "authorization.md");
  writeFileSync(path, `\`\`\`json\n${JSON.stringify(data, null, 2)}\n\`\`\`\n`, "utf8");
  return path;
}

function validate(data: Record<string, unknown>) {
  return spawnSync(process.execPath, [validatorPath, writeReport(data)], {
    encoding: "utf8",
  });
}

afterEach(() => {
  for (const root of tempRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe("V4 characterization authorization validator", () => {
  test("accepts an explicit, bounded NowCoder authorization", () => {
    const result = validate(validAuthorization());

    expect(result.status).toBe(0);
    expect(result.stdout).toContain("V4 characterization authorization PASS");
  });

  test("rejects a template that has not been explicitly approved", () => {
    const result = validate(validAuthorization({ status: "pending" }));

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("status must be approved");
  });

  test("rejects missing exact NowCoder scope", () => {
    const result = validate(validAuthorization({ hostname: "", problemSelection: "" }));

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("hostname must be a NowCoder hostname");
    expect(result.stderr).toContain("problemSelection is required");
  });

  test("rejects a non-NowCoder hostname or URL", () => {
    const nonNowCoder = validate(validAuthorization({ hostname: "example.invalid" }));
    const url = validate(validAuthorization({ hostname: "https://ac.nowcoder.com/problem" }));

    expect(nonNowCoder.status).toBe(1);
    expect(url.status).toBe(1);
    expect(nonNowCoder.stderr).toContain("NowCoder hostname");
    expect(url.stderr).toContain("NowCoder hostname");
  });

  test("rejects agent-owned submissions and an unbounded submission count", () => {
    const result = validate(
      validAuthorization({ userActionOwner: "agent", maximumNaturalSubmissions: 0 }),
    );

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("userActionOwner must be user");
    expect(result.stderr).toContain("maximumNaturalSubmissions");
  });

  test("rejects incomplete forbidden-data and stop-condition declarations", () => {
    const result = validate(
      validAuthorization({
        forbiddenData: ["source_code"],
        stopConditions: ["user_withdraws_authorization"],
      }),
    );

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("forbiddenData");
    expect(result.stderr).toContain("stopConditions");
  });

  test("rejects data outside the safe transcript allowlist", () => {
    const result = validate(validAuthorization({ retainedFields: ["platform", "headers"] }));

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("retainedFields");
  });
});
