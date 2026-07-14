import { describe, expect, it } from "vitest";
import {
  closePageLifecycle,
  reconcilePageLifecycle,
} from "@/extension/src/pageLifecycle";
import type { CaptureIdKind } from "@/extension/src/captureSession";
import type { DetectedProblem } from "@/extension/src/platforms";

const context = {
  installationId: "installation_1",
  captureEnabled: true,
  provenanceLevel: "extension_unpaired" as const,
};
const t0 = "2026-07-14T03:00:00.000Z";
const t1 = "2026-07-14T03:01:00.000Z";

const twoSum: DetectedProblem = {
  platform: "leetcode",
  problemExternalId: "two-sum",
  problemTitle: "Two Sum",
  canonicalUrl: "https://leetcode.com/problems/two-sum/",
};

const twoSumSubmissions: DetectedProblem = {
  ...twoSum,
  problemTitle: "Two Sum - Submissions",
  canonicalUrl: "https://leetcode.com/problems/two-sum/submissions/",
};

const validParentheses: DetectedProblem = {
  platform: "leetcode",
  problemExternalId: "valid-parentheses",
  problemTitle: "Valid Parentheses",
  canonicalUrl: "https://leetcode.com/problems/valid-parentheses/",
};

function idFactory() {
  const counts = new Map<CaptureIdKind, number>();
  return (kind: CaptureIdKind): string => {
    const next = (counts.get(kind) ?? 0) + 1;
    counts.set(kind, next);
    return `${kind}_${next}`;
  };
}

describe("capture page lifecycle", () => {
  it("keeps one session across routes for the same problem", () => {
    const createId = idFactory();
    const started = reconcilePageLifecycle({}, twoSum, context, t0, createId);
    const sameProblem = reconcilePageLifecycle(
      started.state,
      twoSumSubmissions,
      context,
      t1,
      createId,
    );

    expect(sameProblem.changed).toBe(false);
    expect(sameProblem.events).toEqual([]);
    expect(sameProblem.state.active?.captureSessionId).toBe("session_1");
  });

  it("ends the old problem before starting the next SPA problem", () => {
    const createId = idFactory();
    const started = reconcilePageLifecycle({}, twoSum, context, t0, createId);
    const changed = reconcilePageLifecycle(
      started.state,
      validParentheses,
      context,
      t1,
      createId,
    );

    expect(changed.events.map((event) => event.type)).toEqual([
      "SESSION_ENDED",
      "SESSION_STARTED",
    ]);
    expect(changed.events[0]).toMatchObject({
      captureSessionId: "session_1",
      payload: { endReason: "spa_navigation" },
    });
    expect(changed.events[1]).toMatchObject({
      captureSessionId: "session_2",
      problemExternalId: "valid-parentheses",
    });
    expect(changed.state.active?.captureSessionId).toBe("session_2");
  });

  it("closes an active session when SPA navigation leaves a problem", () => {
    const createId = idFactory();
    const started = reconcilePageLifecycle({}, twoSum, context, t0, createId);
    const leftProblem = reconcilePageLifecycle(
      started.state,
      null,
      context,
      t1,
      createId,
    );

    expect(leftProblem.changed).toBe(true);
    expect(leftProblem.state.active).toBeUndefined();
    expect(leftProblem.events).toHaveLength(1);
    expect(leftProblem.events[0]).toMatchObject({
      type: "SESSION_ENDED",
      payload: { endReason: "spa_navigation" },
    });
  });

  it("does nothing while no supported problem is active", () => {
    const transition = reconcilePageLifecycle(
      {},
      null,
      context,
      t0,
      idFactory(),
    );

    expect(transition).toEqual({ state: {}, events: [], changed: false });
  });

  it("pagehide closes the active session exactly once", () => {
    const createId = idFactory();
    const started = reconcilePageLifecycle({}, twoSum, context, t0, createId);
    const hidden = closePageLifecycle(
      started.state,
      "pagehide",
      t1,
      createId,
    );
    const repeated = closePageLifecycle(
      hidden.state,
      "pagehide",
      t1,
      createId,
    );

    expect(hidden.events).toHaveLength(1);
    expect(hidden.events[0]).toMatchObject({
      type: "SESSION_ENDED",
      payload: { endReason: "pagehide" },
    });
    expect(repeated).toEqual({ state: {}, events: [], changed: false });
  });

  it("starts a fresh session when a hidden page is shown again", () => {
    const createId = idFactory();
    const started = reconcilePageLifecycle({}, twoSum, context, t0, createId);
    const hidden = closePageLifecycle(
      started.state,
      "pagehide",
      t1,
      createId,
    );
    const shown = reconcilePageLifecycle(
      hidden.state,
      twoSum,
      context,
      "2026-07-14T03:02:00.000Z",
      createId,
    );

    expect(shown.events).toHaveLength(1);
    expect(shown.events[0]).toMatchObject({
      type: "SESSION_STARTED",
      captureSessionId: "session_2",
    });
  });
});
