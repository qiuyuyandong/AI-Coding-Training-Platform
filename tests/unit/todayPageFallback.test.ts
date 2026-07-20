import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import Database from "better-sqlite3";
import { applyMigrations } from "@/lib/db/migrations";
import { importPackage } from "@/lib/curriculum/importPackage";
import { buildTodayPagePayload } from "@/lib/pages/todayPage";
import { LOCAL_DEFAULT_LEARNER_ID } from "@/lib/domain/learner";
import { getOrCreateLocalProfile } from "@/lib/repositories/learnerProfiles";
import { PLAN_GENERATOR_VERSION } from "@/lib/services/planGenerator";

/**
 * 2026-07-20 follow-up: the safe-foundation fallback explanation on
 * `/today` must read as platform-neutral after the 1.0.1 promotion. We
 * install the real package, force a snapshot whose primary sits on
 * `cpp-io-types` with the `common_foundation` reason code, and assert
 * the explanation text no longer mentions AtCoder or `practice_1`.
 */

const V101_PACKAGE = join(
  process.cwd(),
  "content",
  "tracks",
  "software-development-foundations-v1",
);

let tmp = "";
let db: Database.Database | undefined;

beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), "today-page-fallback-"));
  const dbPath = join(tmp, "today.sqlite");
  process.env.TRAINING_DB_PATH = dbPath;
  db = new Database(dbPath);
  applyMigrations(db);
  const result = importPackage(db, V101_PACKAGE);
  if (!result.ok) {
    throw new Error(
      `importPackage failed: ${JSON.stringify(result.errors)}`,
    );
  }
  getOrCreateLocalProfile(db, {
    now: () => "2026-07-20T00:00:00.000Z",
  });

  // Seed a minimal plan + snapshot whose primary points at
  // `cpp-io-types` and carries the `common_foundation` reason code.
  db.prepare(
    `INSERT INTO learning_plans (
       id, learner_id, generator_version, snapshot_json, status, created_at
     ) VALUES (?, ?, ?, ?, ?, ?)`,
  ).run(
    "plan_test",
    LOCAL_DEFAULT_LEARNER_ID,
    PLAN_GENERATOR_VERSION,
    "{}",
    "active",
    "2026-07-20T00:00:00.000Z",
  );
  db.prepare(
    `INSERT INTO daily_plan_snapshots (
       id, learning_plan_id, local_date, effort_boundary_minutes,
       daily_mode, generator_version, created_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    "snap_test",
    "plan_test",
    "2026-07-20",
    30,
    "learn",
    PLAN_GENERATOR_VERSION,
    "2026-07-20T00:00:00.000Z",
  );
  db.prepare(
    `INSERT INTO plan_items (
       id, daily_plan_id, role, node_id, practice_task_id,
       reason_codes_json, rank
     ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    "item_test",
    "snap_test",
    "primary",
    "node_cpp-io-types",
    "task_task-cpp-io-types",
    JSON.stringify(["common_foundation"]),
    0,
  );
});

afterEach(() => {
  delete process.env.TRAINING_DB_PATH;
  if (db !== undefined) {
    db.close();
    db = undefined;
  }
  if (tmp !== "") {
    try {
      rmSync(tmp, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
    tmp = "";
  }
});

describe("buildTodayPagePayload fallback explanation", () => {
  it("returns a platform-neutral explanation when the primary is cpp-io-types with common_foundation", () => {
    expect(db).toBeDefined();
    const payload = buildTodayPagePayload(db!);
    expect(payload.state).toBe("available");
    if (payload.state !== "available") return;
    expect(payload.primary.nodeId).toBe("cpp-io-types");
    expect(payload.primary.reasonCodes).toContain("common_foundation");
    expect(payload.fallbackExplanation).not.toBeNull();
    const explanation = payload.fallbackExplanation ?? "";
    expect(explanation).not.toMatch(/AtCoder|atcoder/i);
    expect(explanation).not.toContain("practice_1");
  });
});
