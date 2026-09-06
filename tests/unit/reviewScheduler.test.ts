import { describe, expect, it } from "vitest";
import { scheduleNextReview } from "@/lib/services/reviewScheduler";

describe("review scheduler", () => {
  const createdAt = "2026-09-01T00:00:00.000Z";

  it.each([
    ["independent_effective_completion", "E3", "variant", "2026-09-08T00:00:00.000Z"],
    ["independent_effective_completion", "E4", "transfer", "2026-09-15T00:00:00.000Z"],
    ["assisted_effective_completion", "E3", "refresh", "2026-09-02T00:00:00.000Z"],
    ["productive_struggle", "E4", "prerequisite_check", "2026-09-02T00:00:00.000Z"],
    ["unproductive_trial_and_error", "E2", "prerequisite_check", "2026-09-03T00:00:00.000Z"],
    ["insufficient_evidence", "E1", "refresh", "2026-09-02T00:00:00.000Z"],
  ] as const)("schedules %s at bounded next evidence", (outcome, coverageLevel, purpose, dueAt) => {
    const review = scheduleNextReview({ outcome, coverageLevel, createdAt });
    expect(review.purpose).toBe(purpose);
    expect(review.dueAt).toBe(dueAt);
    expect(review.priority).toBeGreaterThan(0);
  });
});
