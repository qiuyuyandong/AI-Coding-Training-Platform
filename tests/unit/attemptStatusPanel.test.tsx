import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
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

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

function flushMicrotasks(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

// Captures the polling handler that AttemptStatusPanel schedules via
// setInterval so the test can fire it deterministically inside act. The
// production handler is the async refresh function, so the captured type
// is `() => Promise<void>`; we still need a runtime guard before invoking
// it because the spy may not have been called by the time we read it.
let pollHandler: (() => Promise<void>) | undefined;
let nextPollId = 0;

function requirePollHandler(): () => Promise<void> {
  if (pollHandler === undefined) {
    throw new Error("expected setInterval to have captured a polling handler");
  }
  return pollHandler;
}

describe("AttemptStatusPanel polling resilience", () => {
  afterEach(() => {
    pollHandler = undefined;
    nextPollId = 0;
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
      fetchMock.mockImplementation(async (input: RequestInfo | URL) => {
        const path =
          typeof input === "string"
            ? input
            : input instanceof URL
              ? input.pathname + input.search
              : input.url;
        if (path.includes("/corrections")) {
          correctionsCallCount += 1;
          return jsonResponse({ ok: true, corrections: [] });
        }
        return jsonResponse({ ok: true, recentAttempts: [freshAttempt()] });
      });

      const setIntervalMock = vi.fn((handler: TimerHandler): number => {
        if (typeof handler === "function") {
          pollHandler = handler as () => Promise<void>;
        }
        nextPollId += 1;
        return nextPollId;
      });
      const originalSetInterval = window.setInterval;
      Object.defineProperty(window, "setInterval", {
        value: setIntervalMock,
        writable: true,
        configurable: true,
      });

      try {
        const { AttemptStatusPanel } = await import("@/components/AttemptStatusPanel");

        // Render inside act and flush microtasks so the mount effect's
        // async refresh() finishes its setState inside the same act.
        await act(async () => {
          render(<AttemptStatusPanel platform="leetcode" externalId="two-sum" />);
          await flushMicrotasks();
        });

        expect(setIntervalMock).toHaveBeenCalledTimes(1);
        expect(screen.getByText("Two Sum")).toBeTruthy();

        const reasonElement = screen.getByLabelText("Correction reason");
        if (!(reasonElement instanceof HTMLInputElement)) {
          throw new Error("expected the correction reason label to target an HTMLInputElement");
        }
        const reasonInput = reasonElement;

        await act(async () => {
          fireEvent.change(reasonInput, { target: { value: "fixed the result" } });
        });
        expect(reasonInput.value).toBe("fixed the result");

        const correctionsBeforePoll = correctionsCallCount;
        const handler = requirePollHandler();

        // Fire the captured polling callback inside act so React flushes the
        // resulting state updates before we observe the DOM. The mocked
        // server returns a brand-new attempt object whose primitive fields
        // (id, result, language, durationMinutes, reflection, startedAt,
        // endedAt, revision) are identical to the previous one.
        // AttemptStatusPanel mirrors `latest` into form state from a useEffect
        // whose dependency list is those primitives, so an identical-primitive
        // re-fetch must NOT re-fire the effect; otherwise it would clear the
        // correction reason and re-fetch the corrections history.
        await act(async () => {
          await handler();
          await flushMicrotasks();
        });

        // The poll must leave the user's typed correction reason intact and
        // must not trigger an extra corrections fetch. Asserting on the form
        // value is the deterministic observable for "the sync effect did not
        // re-fire"; asserting on the corrections fetch count is the
        // deterministic observable for "no cascading re-render storm strayed
        // into refreshCorrections".
        await waitFor(() => {
          expect(reasonInput.value).toBe("fixed the result");
        });
        expect(correctionsCallCount).toBe(correctionsBeforePoll);
      } finally {
        globalThis.fetch = originalFetch;
        window.setInterval = originalSetInterval;
      }
    },
  );
});
