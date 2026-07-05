import { describe, expect, it } from "vitest";
import {
  CaptureEventSchema,
  pageDetectedEventToAttemptDraft,
  submissionEventToAttemptUpdate,
} from "@/lib/capture/events";

describe("CaptureEventSchema", () => {
  it("accepts a page detected event", () => {
    const event = CaptureEventSchema.parse({
      id: "evt_1",
      type: "PAGE_DETECTED",
      platform: "leetcode",
      problemExternalId: "two-sum",
      problemTitle: "Two Sum",
      canonicalUrl: "https://leetcode.com/problems/two-sum/",
      occurredAt: "2026-07-05T00:00:00.000Z",
      payload: { source: "content_script" }
    });

    expect(event.type).toBe("PAGE_DETECTED");
  });

  it("converts page detection into an attempt draft", () => {
    const draft = pageDetectedEventToAttemptDraft({
      id: "evt_1",
      type: "PAGE_DETECTED",
      platform: "leetcode",
      problemExternalId: "two-sum",
      problemTitle: "Two Sum",
      canonicalUrl: "https://leetcode.com/problems/two-sum/",
      occurredAt: "2026-07-05T00:00:00.000Z",
      payload: { source: "content_script" }
    });

    expect(draft.result).toBe("draft");
    expect(draft.platform).toBe("leetcode");
    expect(draft.problemExternalId).toBe("two-sum");
  });
});

describe("submissionEventToAttemptUpdate", () => {
  it("maps accepted verdicts into passed attempts", () => {
    const update = submissionEventToAttemptUpdate({
      id: "evt_2",
      type: "SUBMISSION_DETECTED",
      platform: "leetcode",
      problemExternalId: "two-sum",
      problemTitle: "Two Sum",
      canonicalUrl: "https://leetcode.com/problems/two-sum/",
      occurredAt: "2026-07-05T00:10:00.000Z",
      payload: { verdict: "Accepted", language: "TypeScript" }
    });

    expect(update.result).toBe("passed");
    expect(update.verdict).toBe("Accepted");
    expect(update.language).toBe("TypeScript");
  });
});
