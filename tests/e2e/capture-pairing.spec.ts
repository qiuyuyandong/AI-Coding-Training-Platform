import { expect, test } from "@playwright/test";
import Database from "better-sqlite3";
import { E2E_DB_PATH } from "./database";
import { captureEvent, type CaptureProblemFixture } from "./captureFixtures";

const problem: CaptureProblemFixture = {
  captureSessionId: "session_e2e_revoked",
  platform: "leetcode",
  problemExternalId: "two-sum",
  problemTitle: "Two Sum",
  canonicalUrl: "https://leetcode.com/problems/two-sum/",
};

test("pairs from settings and revoked credentials cannot write", async ({
  page,
  request,
}) => {
  await page.goto("/settings");
  await expect(page.getByRole("heading", { name: "Capture pairing" })).toBeVisible();
  await expect(page.getByText("installation_e2e", { exact: true })).toBeVisible();
  const seededInstallation = page.locator("li").filter({ hasText: "installation_e2e" });
  await expect(seededInstallation).toContainText("已配对");
  await expect(page.getByText(/credential v/i)).toHaveCount(0);

  await page.getByRole("button", { name: "创建配对码" }).click();
  const code = await page.getByTestId("pairing-code").textContent();
  if (code === null || code.length === 0) throw new Error("Pairing code was empty");

  const installationId = "installation_e2e_settings";
  const pairResponse = await request.post("/api/capture/pair", {
    data: { code, installationId },
  });
  expect(pairResponse.status()).toBe(200);
  const pairBody: unknown = await pairResponse.json();
  if (
    typeof pairBody !== "object"
    || pairBody === null
    || !("credential" in pairBody)
    || typeof pairBody.credential !== "string"
  ) {
    throw new Error("Pairing response did not return a credential");
  }

  await page.reload();
  await expect(page.getByText(installationId, { exact: true })).toBeVisible();
  await page.getByRole("button", { name: `轮换凭证 ${installationId}` }).click();
  await expect(page.getByTestId("pairing-code-panel")).toContainText(
    `轮换 ${installationId} 的凭证`,
  );
  await page.getByRole("button", { name: `撤销 ${installationId}` }).click();
  await expect(page.getByRole("status")).toContainText(`已撤销 ${installationId}`);

  const event = captureEvent(problem, {
    type: "SESSION_STARTED",
    eventId: "event_e2e_revoked",
    occurredAt: "2026-07-14T09:00:00.000Z",
  });
  const revokedResponse = await request.post("/api/capture/events", {
    data: { ...event, installationId },
    headers: { authorization: `Bearer ${pairBody.credential}` },
  });
  const mismatchResponse = await request.post("/api/capture/events", {
    data: { ...event, id: "event_e2e_mismatch", installationId: "installation_other" },
    headers: { authorization: `Bearer ${pairBody.credential}` },
  });
  expect(revokedResponse.status()).toBe(401);
  expect(mismatchResponse.status()).toBe(401);

  const db = new Database(E2E_DB_PATH, { readonly: true });
  try {
    const count = db.prepare<[], { readonly count: number }>(`
      SELECT COUNT(*) AS count FROM capture_events
      WHERE id IN ('event_e2e_revoked', 'event_e2e_mismatch')
    `).get()?.count ?? 0;
    expect(count).toBe(0);
  } finally {
    db.close();
  }
});
