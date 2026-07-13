import { describe, expect, it } from "vitest";
import type { TrainingAttempt } from "@/lib/domain/training";
import { buildGrowthStats } from "@/lib/services/growthStats";

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

describe("buildGrowthStats", () => {
  it("returns zero rates and empty distribution for no attempts", () => {
    const stats = buildGrowthStats([]);

    expect(stats.totalAttempts).toBe(0);
    expect(stats.completedAttempts).toBe(0);
    expect(stats.passedAttempts).toBe(0);
    expect(stats.completionRate).toBe(0);
    expect(stats.passRate).toBe(0);
    expect(stats.resultDistribution).toEqual({ draft: 0, passed: 0, failed: 0, partial: 0, stuck: 0 });
    expect(stats.recentActivity).toEqual([]);
  });

  it("counts partial as completed and draft as not completed", () => {
    const stats = buildGrowthStats([
      attempt({ id: "draft_1", result: "draft" }),
      attempt({ id: "passed_1", result: "passed" }),
      attempt({ id: "failed_1", result: "failed" }),
      attempt({ id: "partial_1", result: "partial" }),
      attempt({ id: "stuck_1", result: "stuck" }),
    ]);

    expect(stats.totalAttempts).toBe(5);
    expect(stats.completedAttempts).toBe(4);
    expect(stats.passedAttempts).toBe(1);
    expect(stats.completionRate).toBe(0.8);
    expect(stats.passRate).toBe(0.25);
    expect(stats.resultDistribution).toEqual({ draft: 1, passed: 1, failed: 1, partial: 1, stuck: 1 });
  });

  it("sorts recent activity by updatedAt descending and limits to five", () => {
    const stats = buildGrowthStats(Array.from({ length: 6 }, (_, index) => attempt({
      id: `attempt_${index}`,
      problemTitle: `Problem ${index}`,
      result: "passed",
      updatedAt: `2026-07-06T10:0${index}:00.000Z`,
    })));

    expect(stats.recentActivity.map((item) => item.id)).toEqual(["attempt_5", "attempt_4", "attempt_3", "attempt_2", "attempt_1"]);
  });
});
