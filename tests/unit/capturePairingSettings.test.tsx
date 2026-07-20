import { render, screen } from "@testing-library/react";
import React from "react";
import { describe, expect, it, vi } from "vitest";
import { CapturePairingSettings } from "@/app/settings/CapturePairingSettings";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

describe("CapturePairingSettings", () => {
  it("uses Chinese pairing states and never exposes credential version labels", () => {
    const { container } = render(
      <CapturePairingSettings
        installations={[
          {
            installationId: "installation_first",
            credentialVersion: 1,
            status: "active",
            createdAt: "2026-07-20T08:00:00.000Z",
          },
          {
            installationId: "installation_rotated",
            credentialVersion: 2,
            status: "active",
            createdAt: "2026-07-20T08:00:00.000Z",
            rotatedAt: "2026-07-20T09:00:00.000Z",
            lastSeenAt: "2026-07-20T09:01:00.000Z",
          },
          {
            installationId: "installation_revoked",
            credentialVersion: 3,
            status: "revoked",
            createdAt: "2026-07-20T08:00:00.000Z",
            revokedAt: "2026-07-20T10:00:00.000Z",
          },
        ]}
      />,
    );

    expect(screen.getByRole("heading", { name: "配对新扩展" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "已配对的扩展" })).toBeTruthy();
    const rotatedRow = screen.getByText("installation_rotated", { exact: true }).closest("li");
    const revokedRow = screen.getByText("installation_revoked", { exact: true }).closest("li");
    expect(rotatedRow?.textContent).toContain("已配对 · 凭证已轮换");
    expect(revokedRow?.textContent).toContain("已撤销 · 凭证已轮换");
    expect(screen.getByRole("button", {
      name: "轮换凭证 installation_rotated",
    })).toBeTruthy();
    const revokeButton = screen.getByRole("button", {
      name: "撤销 installation_revoked",
    });
    expect(revokeButton).toBeInstanceOf(HTMLButtonElement);
    expect(revokeButton).toHaveProperty("disabled", true);
    expect(container.textContent).not.toContain("credential");
    expect(container.textContent).not.toMatch(/凭证 v\d+/i);
  });
});
