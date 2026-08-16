// @vitest-environment node

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { validateV4D4AcceptanceProfiles } from "@/scripts/validate-v4-d4-acceptance-profiles.mjs";

const profiles = JSON.parse(
  readFileSync("docs/superpowers/specs/v4-d4-acceptance-profiles.json", "utf8"),
);
const readiness = JSON.parse(
  readFileSync("docs/superpowers/specs/v4-adapter-readiness.json", "utf8"),
);

function cloneProfiles(): Record<string, unknown> {
  return JSON.parse(JSON.stringify(profiles));
}

function profileRecords(document: Record<string, unknown>): Record<string, unknown>[] {
  const value = document.profiles;
  return Array.isArray(value)
    ? value.filter((entry): entry is Record<string, unknown> => (
      typeof entry === "object" && entry !== null && !Array.isArray(entry)
    ))
    : [];
}

describe("V4 D4 platform-specific acceptance profile validator", () => {
  it("accepts the authorized offline LeetCode and NowCoder isolated contract", () => {
    expect(validateV4D4AcceptanceProfiles(profiles, readiness)).toEqual([]);
  });

  it("records P0A completion while retaining later authorization gates", () => {
    expect(profiles).toMatchObject({
      contractStatus: "authorized_for_offline_work_only",
      authorizationSource:
        "docs/superpowers/plans/2026-08-16-v4-phase-d-d4-platform-specific-acceptance-rescue.md",
      activationPrerequisites: [],
      remainingAuthorizationGates: [
        "candidate_freeze",
        "live_observation",
        "d5",
      ],
      minimumCausalGrade: "ISOLATED",
      directCapability: "CAPABILITY_BLOCKED",
      aggregateCompletion: "all-active-profiles-pass-on-one-candidate",
    });
  });

  it("rejects a missing authorization source or remaining authorization gate", () => {
    const missingSource = cloneProfiles();
    missingSource.authorizationSource = "docs/superpowers/plans/does-not-exist.md";
    expect(validateV4D4AcceptanceProfiles(missingSource, readiness)).toContain(
      "authorization source must resolve to the reviewed D4 rescue plan",
    );

    const missingGate = cloneProfiles();
    missingGate.remainingAuthorizationGates = ["candidate_freeze", "live_observation"];
    expect(validateV4D4AcceptanceProfiles(missingGate, readiness)).toContain(
      "candidate freeze, live observation, and D5 must remain separately gated",
    );
  });

  it("rejects drift in top-level authorization and causal boundaries", () => {
    const status = cloneProfiles();
    status.contractStatus = "authorized_for_live_work";
    expect(validateV4D4AcceptanceProfiles(status, readiness)).toContain(
      "contract status must remain authorized for offline work only",
    );

    const prerequisites = cloneProfiles();
    prerequisites.activationPrerequisites = ["unknown_gate"];
    expect(validateV4D4AcceptanceProfiles(prerequisites, readiness)).toContain(
      "activation prerequisites must be empty after P0A completion",
    );

    const minimum = cloneProfiles();
    minimum.minimumCausalGrade = "DIRECT";
    expect(validateV4D4AcceptanceProfiles(minimum, readiness)).toContain(
      "authorized minimum causal grade must be ISOLATED",
    );

    const direct = cloneProfiles();
    direct.directCapability = "AVAILABLE";
    expect(validateV4D4AcceptanceProfiles(direct, readiness)).toContain(
      "direct capability must remain CAPABILITY_BLOCKED",
    );

    const aggregate = cloneProfiles();
    aggregate.aggregateCompletion = "one-platform-pass";
    expect(validateV4D4AcceptanceProfiles(aggregate, readiness)).toContain(
      "aggregate completion must require one candidate",
    );
  });

  it("rejects a profile that drops a non-overridable core invariant", () => {
    const document = cloneProfiles();
    document.coreInvariants = ["candidate_artifact_identity"];
    expect(validateV4D4AcceptanceProfiles(document, readiness)).toContain(
      "core invariants must match the closed D4 contract",
    );
  });

  it("locks the intervention-bounded action epoch into the core contract", () => {
    expect(profiles.coreInvariants).toContain("intervention_bounded_action_epoch");
  });

  it("rejects duplicate or non-authorized platform profiles", () => {
    const duplicate = cloneProfiles();
    duplicate.profiles = [
      ...profileRecords(duplicate),
      profileRecords(duplicate)[0],
    ];
    expect(validateV4D4AcceptanceProfiles(duplicate, readiness)).toContain(
      "leetcode: duplicate platform profile",
    );

    const draft = cloneProfiles();
    const first = profileRecords(draft)[0];
    if (first !== undefined) first.status = "draft";
    expect(validateV4D4AcceptanceProfiles(draft, readiness)).toContain(
      "leetcode: status must remain authorized for offline work only",
    );

    const causalGrade = cloneProfiles();
    const causalFirst = profileRecords(causalGrade)[0];
    if (causalFirst !== undefined) causalFirst.causalGrade = "DIRECT";
    expect(validateV4D4AcceptanceProfiles(causalGrade, readiness)).toContain(
      "leetcode: causal grade must be ISOLATED",
    );
  });

  it("rejects readiness drift and a fabricated characterization source", () => {
    const drift = cloneProfiles();
    const first = profileRecords(drift)[0];
    if (first !== undefined) first.readinessStatus = "production";
    expect(validateV4D4AcceptanceProfiles(drift, readiness)).toContain(
      "leetcode: acceptance/readiness status disagreement",
    );

    const missing = cloneProfiles();
    const missingFirst = profileRecords(missing)[0];
    if (missingFirst !== undefined) {
      missingFirst.characterizationSource = "work/reports/does-not-exist.md";
    }
    expect(validateV4D4AcceptanceProfiles(missing, readiness)).toContain(
      "leetcode: characterization source must exist as a repository file",
    );
  });

  it("rejects a forbidden latest/time-only evidence profile", () => {
    const document = cloneProfiles();
    const first = profileRecords(document)[0];
    if (first !== undefined) first.submissionRoot = "latest submission in a time window";
    expect(validateV4D4AcceptanceProfiles(document, readiness)).toContain(
      "leetcode: submission root contains a forbidden fallback",
    );
  });

  it("rejects readiness-policy and forbidden-fallback contract drift", () => {
    const readinessPolicy = cloneProfiles();
    const first = profileRecords(readinessPolicy)[0];
    if (first !== undefined) first.readinessPolicyAlignment = "change_required_before_activation";
    expect(validateV4D4AcceptanceProfiles(readinessPolicy, readiness)).toContain(
      "leetcode: readiness policy alignment disposition is invalid",
    );

    const fallbacks = cloneProfiles();
    const fallbackFirst = profileRecords(fallbacks)[0];
    if (fallbackFirst !== undefined) fallbackFirst.forbiddenFallbacks = ["time_only"];
    expect(validateV4D4AcceptanceProfiles(fallbacks, readiness)).toContain(
      "leetcode: forbidden fallbacks must match the closed platform list",
    );
  });

  it("keeps AtCoder, Codeforces, and Luogu deferred and blocked", () => {
    const document = cloneProfiles();
    document.deferredPlatforms = [
      { platform: "atcoder", readinessStatus: "experimental" },
      { platform: "codeforces", readinessStatus: "blocked" },
      { platform: "luogu", readinessStatus: "blocked" },
    ];
    expect(validateV4D4AcceptanceProfiles(document, readiness)).toContain(
      "atcoder: deferred platform must retain readiness status blocked",
    );
  });
});
