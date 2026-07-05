import { describe, expect, it } from "vitest";
import { ProblemSchema } from "@/lib/domain/problem";

describe("ProblemSchema", () => {
  it("accepts metadata-only external problems", () => {
    const parsed = ProblemSchema.parse({
      id: "prob_cf_1",
      platform: "codeforces",
      externalId: "4A",
      title: "Watermelon",
      canonicalUrl: "https://codeforces.com/problemset/problem/4/A",
      tags: ["math"],
      difficulty: "800",
      status: "not_started",
      contentMode: "metadata_only",
      trainingMode: "deep_link",
      createdAt: "2026-07-05T00:00:00.000Z",
      updatedAt: "2026-07-05T00:00:00.000Z"
    });

    expect(parsed.contentMode).toBe("metadata_only");
    expect(parsed.trainingMode).toBe("deep_link");
  });

  it("rejects non-metadata content for no-cache platforms", () => {
    expect(() =>
      ProblemSchema.parse({
        id: "prob_lc_1",
        platform: "leetcode",
        externalId: "two-sum",
        title: "Two Sum",
        canonicalUrl: "https://leetcode.com/problems/two-sum/",
        tags: ["array"],
        difficulty: "easy",
        status: "not_started",
        contentMode: "licensed_statement",
        trainingMode: "deep_link",
        createdAt: "2026-07-05T00:00:00.000Z",
        updatedAt: "2026-07-05T00:00:00.000Z"
      })
    ).toThrow();
  });
});
