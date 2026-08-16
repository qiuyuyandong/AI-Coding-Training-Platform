// @vitest-environment node

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { validateV4AdapterReadiness } from "@/scripts/validate-v4-adapter-readiness.mjs";
import {
  validateV4AdapterReadinessRecord,
} from "@/tests/helpers/v4AdapterReadinessContract.cjs";

const readiness = JSON.parse(
  readFileSync("docs/superpowers/specs/v4-adapter-readiness.json", "utf8"),
) as { records: Record<string, unknown>[] };
const registry = readFileSync("extension/src/adapters/registry.ts", "utf8");
const realObservationPath = "work/reports/v4-nowcoder-e3-ingress-repair-2026-07-29.md";

function registryWith(platform: string, status: string): string {
  return `export const PLATFORM_ADAPTERS = {
  ${platform}: {
    v4NetworkStatus: "${status}",
  },
};`;
}

function validRecord(overrides: Record<string, unknown> = {}) {
  return {
    platform: "nowcoder",
    status: "experimental",
    characterization: {
      date: "2026-07-29",
      source: realObservationPath,
      tier: "authenticated",
    },
    requestMatcher: "POST /submit",
    e2Policy: "Unique recent E1 plus server acceptance.",
    e3Policy: "Exact stable submission identity after E2.",
    privacyFields: ["method"],
    fakeOjCases: ["success"],
    realObservation: realObservationPath,
    failureDisposition: "Fail closed.",
    endpointDriftDisposition: "Record a bounded path-only diagnostic and fail closed.",
    productionCertification: false,
    ...overrides,
  };
}

describe("V4 adapter readiness validator", () => {
  it("accepts the recorded NowCoder experimental state", () => {
    expect(validateV4AdapterReadiness(readiness, registry)).toEqual([]);
  });

  it("locks the authorized LeetCode result-root readiness contract", () => {
    const record = readiness.records.find((candidate) => candidate.platform === "leetcode");
    expect(record).toMatchObject({
      status: "experimental",
      requestMatcher: "Legacy implemented path: POST /problems/<slug>/submit[/] then GET /submissions/detail/<numeric-id>/(v2/)?check[/]. Implemented P1 result-root path: one trusted visible exact submit control creates a same-document ActionEpoch and pre-action result baseline; one completed GET /submissions/api/{runtime|memory}_distribution/<numeric-id>[/] on an exact owned HTTPS host supplies the stable ID. Exact REST submit and POST /graphql/ may corroborate but are not required; identity conflict or multiple eligible roots fail closed.",
      e2Policy: "The legacy implemented path requires one unique completed HTTP 200 submit/check pair. The implemented P1 result-root path requires one recent same-document trusted ActionEpoch, a zero/fresh pre-action result baseline, no competing action or submission, and exactly one completed HTTP 200 result-distribution lifecycle with a new numeric ID bound to the exact host/problem within five seconds. Historical or baseline IDs, wrong scope or document, conflicts, and multiple eligible IDs fail closed; duplicate callbacks for one stable ID coalesce; REST and GraphQL are optional corroboration. P1 offline RED/GREEN proves this runtime policy without promoting LeetCode beyond experimental readiness.",
    });
  });

  it("records Codeforces as terminally blocked after the natural form-navigation observation", () => {
    const record = readiness.records.find((candidate) => candidate.platform === "codeforces");
    expect(record).toMatchObject({
      platform: "codeforces",
      status: "blocked",
      characterization: {
        date: "2026-08-02",
        tier: "authenticated",
      },
      productionCertification: false,
    });
    expect(validateV4AdapterReadiness(readiness, registry)).toEqual([]);
  });

  it.each([
    ["characterization", undefined],
    ["requestMatcher", ""],
    ["e2Policy", ""],
    ["e3Policy", ""],
    ["privacyFields", []],
    ["fakeOjCases", []],
    ["realObservation", ""],
    ["failureDisposition", ""],
    ["endpointDriftDisposition", ""],
  ])("rejects a characterized record without %s", (field, value) => {
    expect(
      validateV4AdapterReadiness(
        { records: [validRecord({ [field]: value })] },
        registry,
      ),
    ).not.toEqual([]);
  });

  it("rejects authenticated characterization claimed as production", () => {
    expect(
      validateV4AdapterReadiness(
        { records: [validRecord({ status: "production", productionCertification: true })] },
        registryWith("nowcoder", "production"),
      ),
    ).toContain("nowcoder: authenticated characterization cannot support production");
  });

  it("accepts an implemented candidate with failed real-observation evidence", () => {
    expect(validateV4AdapterReadiness(
      {
        records: [validRecord({
          platform: "leetcode",
          status: "candidate",
          realObservation:
            "work/reports/v4-leetcode-c1-candidate-observation-diagnostics-2026-07-30.md",
        })],
      },
      registryWith("leetcode", "candidate"),
    )).toEqual([]);
  });

  it("rejects docs and registry status disagreement", () => {
    expect(
      validateV4AdapterReadiness({ records: [validRecord({ status: "blocked" })] }, registry),
    ).toContain("nowcoder: docs/registry status disagreement");
  });

  it("accepts an independent blocked platform record", () => {
    expect(
      validateV4AdapterReadiness(
        { records: [validRecord({ status: "blocked" })] },
        registryWith("nowcoder", "blocked"),
      ),
    ).toEqual([]);
  });

  it("rejects fabricated evidence paths", () => {
    expect(
      validateV4AdapterReadiness(
        { records: [validRecord({ realObservation: "work/reports/does-not-exist.md" })] },
        registry,
      ),
    ).toContain("nowcoder: real observation must exist as a repository file");
  });

  it("rejects a directory in place of an evidence artifact", () => {
    expect(
      validateV4AdapterReadiness(
        { records: [validRecord({ realObservation: "work/reports" })] },
        registry,
      ),
    ).toContain("nowcoder: real observation must exist as a repository file");
  });

  it("rejects absolute or escaping evidence paths", () => {
    const failures = validateV4AdapterReadinessRecord(
      validRecord({ realObservation: "../escaping.md" }),
    );
    expect(failures).toContain("real observation must be a repo-relative path");
  });

  it("accepts a disabled record with reason and no other fields", () => {
    expect(
      validateV4AdapterReadiness(
        { records: [{ platform: "nowcoder", status: "disabled", disableReason: "withdrawn" }] },
        registryWith("nowcoder", "disabled"),
      ),
    ).toEqual([]);
  });

  it("rejects a disabled record without a reason", () => {
    expect(
      validateV4AdapterReadiness(
        { records: [{ platform: "nowcoder", status: "disabled" }] },
        registryWith("nowcoder", "disabled"),
      ),
    ).toContain("nowcoder: disable reason is required for disabled status");
  });

  it("does not misread comments that quote another status", () => {
    const maskedRegistry = registryWith("nowcoder", "experimental").replace(
      'v4NetworkStatus: "experimental"',
      '// note: prior status was "blocked"\n    v4NetworkStatus: "experimental"',
    );
    expect(validateV4AdapterReadiness(
      { records: [validRecord()] },
      maskedRegistry,
    )).toEqual([]);
    });
  });

  it("records Luogu as terminally blocked after the cross-document observation", () => {
    const record = readiness.records.find((candidate) => candidate.platform === "luogu");
    expect(record).toMatchObject({
      platform: "luogu",
      status: "blocked",
      characterization: {
        date: "2026-08-02",
        source: "work/reports/v4-luogu-c4-blocker-2026-08-02.md",
        tier: "authenticated",
      },
      realObservation: "work/reports/v4-luogu-c4-blocker-2026-08-02.md",
      productionCertification: false,
    });
  });
