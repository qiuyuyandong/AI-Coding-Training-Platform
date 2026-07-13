import { describe, expect, it } from "vitest";
import type { TrainingAttempt } from "@/lib/domain/training";
import { buildCoachAnalysis } from "@/lib/services/coachAnalysis";

const NOW = "2026-07-06T12:00:00.000Z";

function attempt(overrides: Partial<TrainingAttempt>): TrainingAttempt {
  return {
    id: "attempt_1",
    captureSessionId: "session_1",
    submissionId: "submission_1",
    platform: "leetcode",
    problemExternalId: "two-sum",
    problemTitle: "Two Sum",
    canonicalUrl: "https://leetcode.com/problems/two-sum/",
    startedAt: "2026-07-06T10:00:00.000Z",
    result: "draft",
    createdAt: "2026-07-06T10:00:00.000Z",
    updatedAt: "2026-07-06T10:00:00.000Z",
    ...overrides,
  };
}

describe("buildCoachAnalysis", () => {
  it("returns onboarding guidance when there are no attempts", () => {
    const analysis = buildCoachAnalysis([], NOW);

    expect(analysis.summary).toContain("No completed training evidence yet");
    expect(analysis.recentWindowSize).toBe(0);
    expect(analysis.signals).toEqual([
      expect.objectContaining({ kind: "no-data", evidenceAttemptIds: [] }),
    ]);
    expect(analysis.recommendations).toEqual([
      expect.objectContaining({ title: "Complete one captured training session", evidenceAttemptIds: [] }),
    ]);
  });

  it("returns draft-only guidance without treating drafts as failures", () => {
    const analysis = buildCoachAnalysis([
      attempt({ id: "draft_1", result: "draft" }),
      attempt({ id: "draft_2", result: "draft", updatedAt: "2026-07-06T11:00:00.000Z" }),
    ], NOW);

    expect(analysis.summary).toContain("2 in-progress attempts");
    expect(analysis.signals).toEqual([
      expect.objectContaining({ kind: "draft-only", evidenceAttemptIds: ["draft_2", "draft_1"] }),
    ]);
    expect(analysis.recommendations[0]?.action).toContain("Finish one submission");
  });

  it("prioritizes failed and stuck attempts with evidence", () => {
    const analysis = buildCoachAnalysis([
      attempt({ id: "passed_1", result: "passed", problemTitle: "Valid Parentheses" }),
      attempt({ id: "failed_1", result: "failed", problemTitle: "Two Sum", verdict: "Wrong Answer", updatedAt: "2026-07-06T11:00:00.000Z" }),
      attempt({ id: "stuck_1", result: "stuck", problemTitle: "Three Sum", updatedAt: "2026-07-06T11:30:00.000Z" }),
    ], NOW);

    expect(analysis.summary).toContain("2 attempts need review");
    expect(analysis.signals.map((signal) => signal.kind)).toEqual(["recent-stuck", "recent-failure"]);
    expect(analysis.recommendations[0]?.evidenceAttemptIds).toEqual(["stuck_1", "failed_1"]);
  });

  it("treats partial attempts as review-worthy but lower priority than failed or stuck", () => {
    const analysis = buildCoachAnalysis([
      attempt({ id: "partial_1", result: "partial", problemTitle: "Binary Search", updatedAt: "2026-07-06T11:00:00.000Z" }),
      attempt({ id: "passed_1", result: "passed", problemTitle: "Two Sum" }),
    ], NOW);

    expect(analysis.summary).toContain("1 partial attempt");
    expect(analysis.signals[0]).toEqual(expect.objectContaining({ kind: "partial-review", evidenceAttemptIds: ["partial_1"] }));
  });

  it("returns momentum guidance when recent attempts all passed", () => {
    const analysis = buildCoachAnalysis([
      attempt({ id: "passed_1", result: "passed", problemTitle: "Two Sum" }),
      attempt({ id: "passed_2", result: "passed", problemTitle: "Valid Parentheses", updatedAt: "2026-07-06T11:00:00.000Z" }),
    ], NOW);

    expect(analysis.summary).toContain("2 recent passes");
    expect(analysis.signals).toEqual([
      expect.objectContaining({ kind: "momentum", evidenceAttemptIds: ["passed_2", "passed_1"] }),
    ]);
    expect(analysis.recommendations[0]?.action).toContain("Increase difficulty");
  });
});
