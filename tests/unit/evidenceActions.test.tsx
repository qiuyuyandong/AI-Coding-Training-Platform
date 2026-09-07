import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { EvidenceActions } from "@/components/EvidenceActions";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe("EvidenceActions network feedback", () => {
  it("shows a stable assessment error instead of leaving an unhandled rejection", async () => {
    globalThis.fetch = vi.fn<typeof globalThis.fetch>(async () => { throw new Error("offline"); });
    render(<EvidenceActions nodes={[{ id: "node-1", title: "Node one" }]} initialReviews={[]} />);

    fireEvent.click(screen.getByRole("button", { name: "保存" }));

    expect((await screen.findByRole("status")).textContent).toContain("网络错误：offline");
    await waitFor(() => expect(screen.getByRole("button", { name: "保存" }).getAttribute("disabled")).toBeNull());
  });

  it("keeps a due review visible and reports a failed completion request", async () => {
    globalThis.fetch = vi.fn<typeof globalThis.fetch>(async () => { throw new Error("connection reset"); });
    render(<EvidenceActions
      nodes={[{ id: "node-1", title: "Node one" }]}
      initialReviews={[{ id: "review-1", nodeTitle: "Node one", purpose: "refresh", dueAt: "2026-09-07T00:00:00.000Z" }]}
    />);

    fireEvent.click(screen.getByRole("button", { name: "标记完成" }));

    expect((await screen.findByRole("status")).textContent).toContain("网络错误：connection reset");
    expect(screen.getAllByText("Node one").length).toBeGreaterThan(0);
  });
});
