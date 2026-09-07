// @vitest-environment node

import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn, type ChildProcess } from "node:child_process";
import { chromium } from "@playwright/test";
import { afterEach, describe, expect, it } from "vitest";
import { createNativeCdpRelay } from "../../scripts/cdp-native-relay.mjs";

const directories: string[] = [];
const processes: ChildProcess[] = [];
const relays: Array<{ readonly close: () => Promise<void> }> = [];

afterEach(async () => {
  for (const relay of relays.splice(0)) await relay.close();
  for (const process of processes.splice(0)) process.kill();
  for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true });
});

describe("native CDP relay with bundled Chromium", () => {
  it("lets Playwright create and close a page without terminating Chromium", async () => {
    const profile = mkdtempSync(join(tmpdir(), "cdp-relay-chromium-"));
    directories.push(profile);
    const browserProcess = spawn(chromium.executablePath(), [
      "--headless=new",
      "--remote-debugging-port=0",
      `--user-data-dir=${profile}`,
      "--no-first-run",
      "--no-default-browser-check",
    ], { stdio: "ignore", windowsHide: true });
    processes.push(browserProcess);
    const activePortFile = join(profile, "DevToolsActivePort");
    await waitForFile(activePortFile);
    const [port, browserPath] = readFileSync(activePortFile, "utf8").trim().split(/\r?\n/u);
    if (port === undefined || browserPath === undefined) throw new Error("Bundled Chromium did not publish a CDP endpoint");
    const relayLogs: string[] = [];
    const relay = await createNativeCdpRelay({
      upstreamEndpoint: `ws://127.0.0.1:${port}${browserPath}`,
      onLog: (code) => relayLogs.push(code),
    });
    relays.push(relay);

    let browser;
    try {
      browser = await chromium.connectOverCDP(relay.endpoint);
    } catch (error) {
      throw new Error(`Relay connect failed: ${relayLogs.join(",")}`, { cause: error });
    }
    const context = browser.contexts()[0];
    if (context === undefined) throw new Error("CDP connection returned no browser context");
    const page = await context.newPage();
    await page.setContent("<title>relay proof</title><p>synthetic only</p>");
    await expect(page.title()).resolves.toBe("relay proof");
    await page.close();
    await browser.close();
    await relay.close();

    const versionResponse = await fetch(`http://127.0.0.1:${port}/json/version`);
    expect(versionResponse.ok).toBe(true);
    expect(browserProcess.exitCode).toBeNull();
  }, 30_000);
});

async function waitForFile(path: string): Promise<void> {
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    if (existsSync(path)) return;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error("Timed out waiting for bundled Chromium DevToolsActivePort");
}
