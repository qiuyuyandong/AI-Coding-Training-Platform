import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import React from "react";

import SettingsPage from "@/app/settings/page";

const originalVaultPath = process.env.TRAINING_VAULT_PATH;
const originalVaultId = process.env.TRAINING_VAULT_ID;

afterEach(() => {
  restoreEnvironment("TRAINING_VAULT_PATH", originalVaultPath);
  restoreEnvironment("TRAINING_VAULT_ID", originalVaultId);
});

describe("Local Vault settings page", () => {
  it("shows launcher guidance without exposing a runtime switch API", () => {
    delete process.env.TRAINING_VAULT_PATH;
    delete process.env.TRAINING_VAULT_ID;
    render(<SettingsPage />);
    expect(screen.getByRole("heading", { name: "Local Vault" })).toBeTruthy();
    expect(screen.getByText(/未由 Local Vault launcher 启动/u)).toBeTruthy();
    expect(screen.getByRole("button", { name: "连接扩展" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /切换 Vault/u })).toBeNull();
    expect(screen.queryByText(/配对码/u)).toBeNull();
  });

  it("shows only the launcher-provided Vault identity and path", () => {
    process.env.TRAINING_VAULT_PATH = "D:\\Learner Vault";
    process.env.TRAINING_VAULT_ID = "vault_00000000-0000-4000-8000-000000000001";
    render(<SettingsPage />);
    expect(screen.getByTestId("vault-id").textContent).toBe(process.env.TRAINING_VAULT_ID);
    expect(screen.getByTestId("vault-path").textContent).toBe(process.env.TRAINING_VAULT_PATH);
    expect(screen.queryByText(/配对码/u)).toBeNull();
  });
});

function restoreEnvironment(key: "TRAINING_VAULT_PATH" | "TRAINING_VAULT_ID", value: string | undefined): void {
  if (value === undefined) delete process.env[key];
  else process.env[key] = value;
}
