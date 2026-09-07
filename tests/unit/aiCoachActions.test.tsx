import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AiCoachActions } from "@/components/AiCoachActions";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe("AiCoachActions", () => {
  it("performs no request on render and calls AI only after an explicit click", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(async () => new Response(JSON.stringify({
      ok: true,
      id: "report-1",
      source: "fallback",
      report: {
        summary: "Local fallback",
        strengths: [],
        risks: [],
        nextSteps: ["Continue locally"],
        evidenceIds: ["evidence-1"],
      },
    }), { status: 200, headers: { "content-type": "application/json" } }));
    globalThis.fetch = fetch;
    render(<AiCoachActions
      surface="coach"
      evidenceOptions={[{ id: "evidence-1", label: "run" }]}
      initialPreference={{ mode: "on_demand", allowedContext: ["evidence_summary"] }}
    />);
    expect(fetch).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "生成 Coach 报告" }));
    await waitFor(() => expect(fetch).toHaveBeenCalledOnce());
    expect(fetch.mock.calls[0]?.[0]).toBe("/api/ai/reports");
    expect(await screen.findByText("Local fallback")).toBeTruthy();
  });
});
