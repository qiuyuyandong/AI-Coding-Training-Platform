import { fireEvent, render, screen } from "@testing-library/react";
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { TrainingAttempt } from "@/lib/domain/training";

const baseAttempt: TrainingAttempt = {
  id: "att-poll-1",
  captureSessionId: "ses-poll-1",
  submissionId: "sub-poll-1",
  recordSource: "capture",
  platform: "leetcode",
  problemExternalId: "two-sum",
  problemTitle: "Two Sum",
  canonicalUrl: "https://leetcode.com/problems/two-sum/",
  startedAt: "2026-07-15T10:00:00.000Z",
  endedAt: "2026-07-15T11:00:00.000Z",
  result: "draft",
  language: "python",
  durationMinutes: 30,
  reflection: "initial note",
  revision: 1,
  createdAt: "2026-07-15T10:00:00.000Z",
  updatedAt: "2026-07-15T11:00:00.000Z",
};

function freshAttempt(): TrainingAttempt {
  return { ...baseAttempt, language: baseAttempt.language };
}

let pollCallback: (() => void) | undefined;

describe("AttemptStatusPanel polling resilience", () => {
  afterEach(() => {
    pollCallback = undefined;
    vi.restoreAllMocks();
  });

  it(
    "preserves a typed correction reason across a polling tick when the server returns unchanged data as a fresh object",
    { timeout: 15000 },
    async () => {
      const originalFetch = globalThis.fetch;
      const fetchMock = vi.fn();
      globalThis.fetch = fetchMock;

      let correctionsCallCount = 0;
      fetchMock.mockImplementation(async (url: string | URL | Request) => {
        const path = typeof url === "string" ? url : url instanceof URL ? url.pathname + url.search : url.url;
        if (path.includes("/corrections")) {
          correctionsCallCount += 1;
          return {
            ok: true,
            json: async () => ({ ok: true, corrections: [] }),
          } as Response;
        }
        return {
          ok: true,
          json: async () => ({ ok: true, recentAttempts: [freshAttempt()] }),
        } as Response;
      });

      const setIntervalSpy = vi.spyOn(window, "setInterval").mockImplementation((handler: TimerHandler) => {
        pollCallback = handler as () => void;
        return 1 as unknown as ReturnType<typeof setInterval>;
      });

      try {
        const { AttemptStatusPanel } = await import("@/components/AttemptStatusPanel");
        render(<AttemptStatusPanel platform="leetcode" externalId="two-sum" />);

        await vi.waitFor(() => {
          expect(screen.getByText("Two Sum")).toBeTruthy();
        }, { timeout: 5000 });
        expect(setIntervalSpy).toHaveBeenCalledTimes(1);
        expect(pollCallback).toBeDefined();

        const reasonInput = screen.getByLabelText("Correction reason") as HTMLInputElement;
        fireEvent.change(reasonInput, { target: { value: "fixed the result" } });
        expect(reasonInput.value).toBe("fixed the result");

        const correctionsBeforePoll = correctionsCallCount;

        // Fire the captured polling callback.
        // With the buggy object-identity dependency, this triggers the sync
        // effect on every render, which calls refreshCorrections → setState →
        // re-render → new latest reference → effect fires again. The test
        // catches this as an unbounded corrections fetch count.
        pollCallback!();

        // Let cascading effects settle
        await new Promise((resolve) => setTimeout(resolve, 2000));

        // correctionsCallCount must be bounded — one initial call plus at most
        // one for the poll-triggered sync. An unbounded count signals the
        // infinite render loop caused by the object-identity dependency bug.
        expect(correctionsCallCount - correctionsBeforePoll).toBeLessThan(5);

        // The user's typed correction reason must survive the poll
        expect(reasonInput.value).toBe("fixed the result");
      } finally {
        globalThis.fetch = originalFetch;
      }
    },
  );
});
