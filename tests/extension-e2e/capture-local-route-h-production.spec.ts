import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { chromium, expect, test, type Worker } from "@playwright/test";

import identity from "../../extension/identity.json";
import { readDatabaseCounts } from "./database";

const EXTENSION_DIST = resolve(process.cwd(), "extension", "dist");
const PROFILE_ROOT = resolve(process.cwd(), ".tmp", "playwright-extension", "route-h-production");
const DB_PATH_FILE = resolve(process.cwd(), ".tmp", "server-db-path.txt");

test("production Route H connects without exposing a capability and survives reload", async () => {
  expect(existsSync(resolve(EXTENSION_DIST, "manifest.json"))).toBe(true);
  mkdirSync(PROFILE_ROOT, { recursive: true });
  const profile = resolve(PROFILE_ROOT, String(Date.now()));
  const context = await chromium.launchPersistentContext(profile, {
    channel: "chromium",
    headless: true,
    args: [
      `--disable-extensions-except=${EXTENSION_DIST}`,
      `--load-extension=${EXTENSION_DIST}`,
      "--no-proxy-server",
      "--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE localhost, EXCLUDE 127.0.0.1",
    ],
  });

  try {
    const worker = await captureWorker(context.serviceWorkers()[0]
      ?? await context.waitForEvent("serviceworker", { timeout: 20_000 }));
    expect(worker.url()).toBe(`chrome-extension://${identity.extensionId}/background.js`);

    const page = await context.newPage();
    await page.goto("http://localhost:3000/settings");
    await expect(page.getByTestId("capture-connection-state"))
      .toContainText("需要连接扩展");
    await page.getByRole("button", { name: "连接扩展" }).click();
    await expect(page.getByTestId("capture-connection-state"))
      .toContainText("扩展已连接", { timeout: 20_000 });

    const stored = await worker.evaluate(async () => chrome.storage.local.get([
      "captureCapability",
      "captureCapabilityVersion",
      "captureConnectionStatus",
      "captureCredential",
      "captureCredentialVersion",
      "pairedAt",
    ]));
    expect(stored.captureCapability).toMatch(/^capture_[A-Za-z0-9_-]{43}$/u);
    expect(stored.captureCapabilityVersion).toBe(1);
    expect(stored.captureConnectionStatus).toBe("connected");
    expect(stored.captureCredential).toBeUndefined();
    expect(stored.captureCredentialVersion).toBeUndefined();
    expect(stored.pairedAt).toBeUndefined();

    const pageText = await page.locator("body").innerText();
    expect(pageText).not.toContain(String(stored.captureCapability));
    await page.reload();
    await expect(page.getByTestId("capture-connection-state"))
      .toContainText("扩展已连接");

    const dbPath = readFileSync(DB_PATH_FILE, "utf8").trim();
    expect(readDatabaseCounts(dbPath)).toEqual({
      captureEvents: 0,
      trainingSessions: 0,
      trainingAttempts: 0,
    });
  } finally {
    await context.close();
  }
});

async function captureWorker(value: Worker): Promise<Worker> {
  await value.evaluate(() => chrome.runtime.id);
  return value;
}
