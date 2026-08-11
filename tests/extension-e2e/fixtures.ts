import {
  lstatSync,
  mkdirSync,
  readdirSync,
  rmdirSync,
  unlinkSync,
} from "node:fs";
import { isAbsolute, relative, resolve } from "node:path";

import {
  chromium,
  test as base,
  type BrowserContext,
  type Worker,
} from "@playwright/test";

import { resolveExtensionWorkerLifecycle } from "./extensionWorkerLifecycle";

const TEMP_ROOT = resolve(process.cwd(), ".tmp", "playwright-extension");
const PROFILES_ROOT = resolve(TEMP_ROOT, "profiles");
export const EXTENSION_DIST = resolve(process.cwd(), "extension", "dist");

type ExtensionFixtures = {
  readonly extensionContext: BrowserContext;
  readonly extensionWorker: Worker;
  readonly extensionId: string;
};

export const test = base.extend<ExtensionFixtures>({
  extensionContext: async ({}, provide, testInfo) => {
    const profile = resolve(
      PROFILES_ROOT,
      `${testInfo.workerIndex}-${testInfo.testId.replace(/[^a-z0-9-]/giu, "-")}`,
    );
    removeSafeProfile(profile);
    mkdirSync(profile, { recursive: true });
    const context = await chromium.launchPersistentContext(profile, {
      channel: "chromium",
      headless: true,
      args: [
        `--disable-extensions-except=${EXTENSION_DIST}`,
        `--load-extension=${EXTENSION_DIST}`,
        // Bundled Chromium currently disables developer-mode extensions on
        // reload unless this experimental policy is disabled. Production Chrome
        // policy remains untouched; this only lets the test exercise reload.
        "--disable-features=ExtensionDisableUnsupportedDeveloper",
        "--no-proxy-server",
        "--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE localhost, EXCLUDE 127.0.0.1",
      ],
    });
    try {
      await provide(context);
    } finally {
      await context.close();
      removeSafeProfile(profile);
    }
  },
  extensionWorker: async ({ extensionContext }, provide) => {
    const existing = extensionContext.serviceWorkers()[0];
    const worker = existing ?? await wakeExtensionServiceWorker(extensionContext);
    await provide(worker);
  },
  extensionId: async ({ extensionWorker }, provide) => {
    const extensionId = new URL(extensionWorker.url()).host;
    if (extensionId.length === 0) throw new Error("MV3 service worker has no extension ID");
    await provide(extensionId);
  },
});

export { expect } from "@playwright/test";

async function wakeExtensionServiceWorker(context: BrowserContext): Promise<Worker> {
  const page = await context.newPage();
  try {
    await page.goto("chrome://extensions/", { waitUntil: "domcontentloaded" });
    const extensionId = await page.evaluate((): string | undefined => {
      const manager = document.querySelector("extensions-manager");
      const list = manager?.shadowRoot?.querySelector("#items-list");
      const items = list?.shadowRoot?.querySelectorAll("extensions-item") ?? [];
      for (const item of items) {
        const data = Reflect.get(item, "data");
        if (typeof data !== "object" || data === null || Reflect.get(data, "name") !== "Unified OJ Capture") continue;
        const id = Reflect.get(data, "id");
        return typeof id === "string" && id.length > 0 ? id : undefined;
      }
      return undefined;
    });
    if (extensionId === undefined) throw new Error("Unified OJ Capture is not loaded");
    return await resolveExtensionWorkerLifecycle({
      readExisting: () => context.serviceWorkers()[0],
      waitForStarted: () => context.waitForEvent("serviceworker", { timeout: 15_000 }),
      openPopup: async () => {
        await page.goto(`chrome-extension://${extensionId}/popup.html`, { waitUntil: "domcontentloaded" });
      },
    });
  } finally {
    await page.close();
  }
}

function removeSafeProfile(target: string): void {
  const relativePath = relative(PROFILES_ROOT, target);
  if (relativePath === "" || relativePath === ".."
    || relativePath.startsWith("..\\") || relativePath.startsWith("../")
    || isAbsolute(relativePath)) {
    throw new Error(`Unsafe extension profile cleanup path: ${target}`);
  }
  removePath(target);
}

function removePath(target: string): void {
  const stats = lstatSync(target, { throwIfNoEntry: false });
  if (stats === undefined) return;
  if (stats.isSymbolicLink() || !stats.isDirectory()) {
    unlinkSync(target);
    return;
  }
  for (const entry of readdirSync(target)) removePath(resolve(target, entry));
  rmdirSync(target);
}
