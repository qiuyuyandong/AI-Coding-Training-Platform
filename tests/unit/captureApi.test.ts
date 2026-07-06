import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { openDatabase } from "@/lib/db/client";

let tempDir = "";

beforeEach(() => {
  tempDir = mkdtempSync(join(tmpdir(), "capture-api-"));
  process.env.TRAINING_DB_PATH = join(tempDir, "test.sqlite");
  const db = openDatabase();
  try {
    const sql = readFileSync(join(process.cwd(), "lib", "db", "migrations", "0001_initial.sql"), "utf8");
    db.exec(sql);
  } finally {
    db.close();
  }
});

afterEach(() => {
  delete process.env.TRAINING_DB_PATH;
  rmSync(tempDir, { recursive: true, force: true });
});

function validEvent() {
  return {
    id: "evt_api_1",
    type: "PAGE_DETECTED",
    platform: "leetcode",
    problemExternalId: "two-sum",
    problemTitle: "Two Sum",
    canonicalUrl: "https://leetcode.com/problems/two-sum/",
    occurredAt: "2026-07-06T00:00:00.000Z",
    payload: { source: "test" },
  };
}

describe("capture API", () => {
  it("returns 200 for valid capture events", async () => {
    const { POST } = await import("@/app/api/capture/events/route");

    const response = await POST(new Request("http://localhost/api/capture/events", { method: "POST", body: JSON.stringify(validEvent()) }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true, eventId: "evt_api_1" });
  });

  it("returns 400 for invalid capture events", async () => {
    const { POST } = await import("@/app/api/capture/events/route");

    const response = await POST(new Request("http://localhost/api/capture/events", { method: "POST", body: JSON.stringify({ id: "bad" }) }));

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.ok).toBe(false);
    expect(body.error).toBe("Invalid capture event");
  });

  it("returns recent capture status", async () => {
    const events = await import("@/app/api/capture/events/route");
    await events.POST(new Request("http://localhost/api/capture/events", { method: "POST", body: JSON.stringify(validEvent()) }));
    const status = await import("@/app/api/capture/status/route");

    const response = await status.GET();

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.recentEvents[0].id).toBe("evt_api_1");
  });
});
