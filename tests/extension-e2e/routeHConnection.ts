import type { BrowserContext, Worker } from "@playwright/test";

import { expect } from "./fixtures";

export async function connectRouteHExtension(
  context: BrowserContext,
  worker: Worker,
): Promise<void> {
  const settings = await context.newPage();
  try {
    await settings.goto("http://localhost:3000/settings", { waitUntil: "load" });
    await expect(settings.getByTestId("capture-connection-state")).toBeVisible();
    await settings.getByRole("button", { name: "连接扩展" }).click();
    await expect.poll(async () => worker.evaluate(async () => {
      const stored = await chrome.storage.local.get([
        "captureCapability",
        "captureConnectionStatus",
      ]);
      return typeof stored.captureCapability === "string"
        && stored.captureConnectionStatus === "connected";
    }), { timeout: 20_000 }).toBe(true);
    await expect(settings.getByTestId("capture-connection-state"))
      .toContainText("扩展已连接", { timeout: 20_000 });
  } finally {
    await settings.close();
  }
}
