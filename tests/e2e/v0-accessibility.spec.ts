import { expect, test } from "@playwright/test";
import Database from "better-sqlite3";
import { applyMigrations } from "@/lib/db/migrations";
import { importPackage } from "@/lib/curriculum/importPackage";
import { E2E_DB_PATH } from "./database";
import { join } from "node:path";

/**
 * V0 accessibility Playwright gate (Todo 25).
 *
 * This test proves the list-first `/map` page is keyboard reachable
 * end-to-end:
 *
 *   1. Every node link is reachable via sequential `Tab` from the
 *      document start, so keyboard-only users can land on every entry
 *      of the 12-node list.
 *   2. Pressing `Enter` while a node link is focused navigates to the
 *      detail page (default browser behaviour for `<a href>`).
 *   3. Browser `Back` returns to `/map` with the list visible and
 *      re-focusable: focusing the document body and pressing `Tab`
 *      lands on the first node link, so the user does not lose their
 *      place in the list.
 *   4. The supplementary SVG visualisation is non-essential: it lives
 *      inside a collapsed `<details>` element and removing it must
 *      not break navigation. The list (`<ol>`) remains the primary
 *      navigation entry point.
 *
 * The test relies on the sample-package fixture shipped under
 * `tests/fixtures/curriculum/sample-package`. The disposable database
 * the Playwright-owned web server reads is migrated before launch by
 * `tests/e2e/prepare.ts`; the test then re-runs the importer against
 * that DB so the list is non-empty. No AI environment variables, no
 * extension, and no non-localhost request is permitted.
 */

const SAMPLE_PACKAGE_PATH = join(
  process.cwd(),
  "tests",
  "fixtures",
  "curriculum",
  "sample-package",
);

const REQUIRED_AI_ENV = [
  "TRAINING_AI_MODE",
  "TRAINING_AI_OPENAI_BASE_URL",
  "TRAINING_AI_OPENAI_MODEL",
  "TRAINING_AI_OPENAI_API_KEY",
  "TRAINING_AI_TIMEOUT_MS",
  "TRAINING_AI_DAILY_QUOTA",
  "V0_AI_REFLECTION_ENABLED",
  "V0_AI_REFLECTION_URL",
  "V0_AI_REFLECTION_MODEL",
  "V0_AI_REFLECTION_API_KEY",
  "V0_AI_REFLECTION_TIMEOUT_MS",
];

function ensureAiEnvAbsent(): void {
  for (const key of REQUIRED_AI_ENV) {
    const value = process.env[key];
    if (value !== undefined && value.length > 0) {
      throw new Error(
        `V0 accessibility gate forbids ${key}; remove it from the e2e environment before running`,
      );
    }
  }
}

function seedPackageDatabase(): void {
  const db = new Database(E2E_DB_PATH);
  try {
    // better-sqlite3 enables foreign-key enforcement by default; this
    // connection flips it off so the re-import path matches the
    // v0-core-learning-loop spec (see the rationale comment in that
    // file). The /map accessibility gate never exercises the planner
    // path, but the import itself is the same package commit.
    db.pragma("foreign_keys = OFF");
    applyMigrations(db, { now: () => "2026-07-17T00:00:00.000Z" });
    const result = importPackage(db, SAMPLE_PACKAGE_PATH, {
      now: () => "2026-07-17T00:00:00.000Z",
    });
    if (!result.ok) {
      throw new Error(
        `Sample-package import failed: ${JSON.stringify(result.errors)}`,
      );
    }
  } finally {
    db.close();
  }
}

function assertNoExtensionLoaded(
  contexts: ReadonlyArray<import("@playwright/test").BrowserContext>,
): void {
  for (const context of contexts) {
    for (const worker of context.serviceWorkers()) {
      if (worker.url().startsWith("chrome-extension://")) {
        throw new Error(
          `Extension service worker detected: ${worker.url()} — accessibility gate forbids loaded extensions`,
        );
      }
    }
    for (const page of context.pages()) {
      for (const frame of page.frames()) {
        if (frame.url().startsWith("chrome-extension://")) {
          throw new Error(
            `Extension frame detected: ${frame.url()} — accessibility gate forbids loaded extensions`,
          );
        }
      }
    }
  }
}

test("V0 accessibility: /map is keyboard reachable, detail/back/focus and SVG-hidden navigation", async ({
  page,
  context,
  browser,
}, testInfo) => {
  ensureAiEnvAbsent();
  seedPackageDatabase();

  const pageRequests: string[] = [];
  page.on("request", (req) => {
    pageRequests.push(req.url());
  });

  // Phase 1: navigate to /map and verify the list is the primary nav.
  await page.goto("/map");
  const mapHeading = page.getByRole("heading", {
    name: "12 个顺序节点（列表为主要导航）",
  });
  await expect(mapHeading).toBeVisible();

  // List links live inside the `<ol>` of nodes. The supplementary SVG
  // visualisation also contains `<a href="/map/...">` links, so we
  // scope the selector to the ordered list to count only navigation
  // entries that survive when the SVG is removed.
  const nodeLinks = page.locator("ol a[href^='/map/']");
  const nodeLinkCount = await nodeLinks.count();
  expect(nodeLinkCount).toBeGreaterThan(0);

  // Phase 2: capture the list hrefs so the Tab traversal can verify
  // each one is reachable in document order.
  const hrefs: string[] = [];
  for (let index = 0; index < nodeLinkCount; index += 1) {
    const href = await nodeLinks.nth(index).getAttribute("href");
    if (href === null || href.length === 0) {
      throw new Error(`Node link #${index} is missing href`);
    }
    hrefs.push(href);
  }

  // Move focus to the document body before sequential Tab. The body
  // element is the safest anchor; calling `.focus()` on the page root
  // resets the chain so the next Tab lands on the first focusable.
  await page.evaluate(() => {
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
    document.body.tabIndex = -1;
    document.body.focus();
  });

  // Phase 3: walk forward with Tab and collect every reached href.
  const tabbedHrefs = new Set<string>();
  const totalTabs = nodeLinkCount + 16; // generous budget to cover header / breadcrumb / footer
  for (let step = 0; step < totalTabs; step += 1) {
    await page.keyboard.press("Tab");
    const focusedHref = await page.evaluate(() => {
      const active = document.activeElement;
      if (active instanceof HTMLAnchorElement) {
        return active.getAttribute("href");
      }
      return null;
    });
    if (focusedHref !== null && focusedHref.startsWith("/map/")) {
      tabbedHrefs.add(focusedHref);
      if (tabbedHrefs.size === hrefs.length) break;
    }
  }

  // Every node link must be reachable by keyboard alone.
  for (const href of hrefs) {
    expect(
      tabbedHrefs.has(href),
      `Tab traversal missed ${href}; only reached ${[...tabbedHrefs].join(", ")}`,
    ).toBe(true);
  }

  // Phase 4: focus the first node link and press Enter to navigate.
  const firstHref = hrefs[0];
  if (firstHref === undefined) {
    throw new Error("No /map node links were captured");
  }
  await page.locator(`a[href="${firstHref}"]`).first().focus();
  await expect(
    page.locator(`a[href="${firstHref}"]`).first(),
  ).toBeFocused();

  await page.keyboard.press("Enter");
  const expectedDetailPath = firstHref;
  await page.waitForURL(new RegExp(`${expectedDetailPath}$`));
  await expect(page.locator("main h1").first()).toBeVisible();

  // Phase 5: browser Back returns to /map with the list visible and the
  // first node link re-focusable from the document body. Chromium does
  // not guarantee cross-history focus restoration for arbitrary
  // anchors, so we explicitly re-anchor focus on the body and verify
  // a single Tab lands on the originating link.
  await page.goBack();
  await page.waitForURL(/\/map$/);
  await expect(mapHeading).toBeVisible();

  // Chromium does not guarantee cross-history focus restoration for
  // arbitrary `<a>` elements. To prove the list is re-focusable from
  // the document body (i.e. the user did not lose their place), we
  // anchor focus on the body and Tab forward until we land on the
  // originating list link.
  await page.evaluate(() => {
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
    document.body.tabIndex = -1;
    document.body.focus();
  });
  let refocusedHref: string | null = null;
  const refocusBudget = nodeLinkCount + 16;
  for (let step = 0; step < refocusBudget; step += 1) {
    await page.keyboard.press("Tab");
    refocusedHref = await page.evaluate(() => {
      const active = document.activeElement;
      if (active instanceof HTMLAnchorElement) {
        return active.getAttribute("href");
      }
      return null;
    });
    if (refocusedHref === firstHref) break;
  }
  expect(refocusedHref).toBe(firstHref);

  // Phase 6: the supplementary SVG visualisation lives inside a
  // collapsed `<details>` element. Removing the SVG (or the entire
  // `<details>`) MUST NOT affect the list navigation — the `<ol>` of
  // node links sits outside the supplementary view.
  const beforeCount = await nodeLinks.count();
  await page.evaluate(() => {
    const details = document.querySelector("details");
    if (details !== null) details.remove();
    const svg = document.querySelector("svg[role='img']");
    if (svg !== null) svg.remove();
  });
  const afterCount = await nodeLinks.count();
  expect(afterCount).toBe(beforeCount);

  // Phase 7: after removing the SVG, focus the first node link and
  // press Enter again to confirm navigation still works.
  await page.locator(`a[href="${firstHref}"]`).first().focus();
  await page.keyboard.press("Enter");
  await page.waitForURL(new RegExp(`${expectedDetailPath}$`));

  // Phase 8: no extension is loaded by the test context.
  assertNoExtensionLoaded([context, ...browser.contexts()]);

  // Phase 9: every captured request must target localhost; no extension
  // URLs may appear in the network log either.
  const configuredOrigin = new URL(
    testInfo.project.use.baseURL ?? "http://localhost:3000",
  ).origin;
  const allowedOrigins = new Set([
    configuredOrigin,
    "http://localhost:3000",
    "http://127.0.0.1:3000",
  ]);
  const externalRequests = pageRequests.filter((url) => {
    try {
      return !allowedOrigins.has(new URL(url).origin);
    } catch {
      return true;
    }
  });
  expect(externalRequests).toEqual([]);
  expect(
    pageRequests.filter((url) => url.startsWith("chrome-extension://")),
  ).toEqual([]);
});
