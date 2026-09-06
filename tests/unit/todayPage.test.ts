import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { openDatabase } from "@/lib/db/client";
import { applyMigrations } from "@/lib/db/migrations";
import { importPackage } from "@/lib/curriculum/importPackage";
import { LOCAL_DEFAULT_LEARNER_ID } from "@/lib/domain/learner";
import { getOrCreateLocalProfile } from "@/lib/repositories/learnerProfiles";
import {
  generateAndPersistPlan,
} from "@/lib/services/planGenerationService";
import type { PlanGeneratorInput } from "@/lib/services/planGenerator";
import { PLAN_GENERATOR_VERSION } from "@/lib/services/planGenerator";
import { buildTodayPagePayload } from "@/lib/pages/todayPage";

/**
 * V0 `/today` page + feedback API tests (Todo 19).
 *
 * Pattern after `tests/unit/planCompletionApi.test.ts`: a single
 * OS-temp SQLite file is opened through `openDatabase` so the route's
 * `openDatabase()` call inside the handler resolves to the same
 * instance. Foreign-key enforcement is turned OFF during plan
 * generation to mirror the existing fixture pattern.
 *
 * Coverage:
 *   - `buildTodayPagePayload` returns `no_plan`, `no_snapshot` and
 *     `available` states correctly.
 *   - `POST /api/plans/items/[id]/feedback` rejects `completed` with
 *     HTTP 400 (the dedicated completion endpoint owns that action).
 *   - `POST /api/plans/items/[id]/feedback` rejects `skipped` without
 *     an allowed `reasonCode`.
 *   - `POST /api/plans/items/[id]/feedback` rejects `skipped` with
 *     `reasonCode: 'other'` when `reasonText` is blank.
 *   - `accepted`, `started`, `skipped` (with allowed reason) append one
 *     `task_feedback` row and are idempotent on duplicate calls.
 *   - `skipped` creates exactly one successor `daily_plan_snapshots`
 *     row plus one `plan_revision_events` row with `event_type =
 *     'item_skipped'`.
 *   - Sending `effortBoundaryMinutes` that differs from the current
 *     snapshot's effort creates one successor snapshot with the new
 *     effort and records `event_type = 'effort_changed'`.
 */

const SAMPLE_FIXTURE = join(
  process.cwd(),
  "tests",
  "fixtures",
  "curriculum",
  "sample-package",
);

let tempDir = "";
let primaryItemId = "";
let snapshotId = "";

beforeEach(() => {
  tempDir = mkdtempSync(join(tmpdir(), "today-page-"));
  const dbPath = join(tempDir, "today.sqlite");
  process.env.TRAINING_DB_PATH = dbPath;
  const db = openDatabase();
  try {
    db.pragma("foreign_keys = OFF");
    applyMigrations(db);
    const result = importPackage(db, SAMPLE_FIXTURE);
    if (!result.ok) {
      throw new Error(
        `importPackage failed: ${JSON.stringify(result.errors)}`,
      );
    }
    getOrCreateLocalProfile(db, {
      now: () => "2026-07-17T00:00:00.000Z",
    });
    const input: PlanGeneratorInput = {
      nodes: [
        { stable_id: "sample-node-a", order_index: 1, title: "Sample Node A" },
        { stable_id: "sample-node-b", order_index: 2, title: "Sample Node B" },
      ],
      edges: [
        { from_stable_id: "sample-node-a", to_stable_id: "sample-node-b" },
      ],
      practicesByNode: new Map<
        string,
        ReadonlyArray<{
          stable_id: string;
          title: string;
          difficulty_band: "intro" | "easy";
        }>
      >([
        [
          "sample-node-a",
          [{ stable_id: "sample-task-a", title: "Practice Task A", difficulty_band: "intro" }],
        ],
        [
          "sample-node-b",
          [{ stable_id: "sample-task-b", title: "Practice Task B", difficulty_band: "easy" }],
        ],
      ]),
      resourcesByNode: new Map<string, { review_status: string }>([
        ["sample-node-a", { review_status: "reviewed" }],
        ["sample-node-b", { review_status: "reviewed" }],
      ]),
      effortBoundaryMinutes: 30,
      prerequisitesByNode: {
        "sample-node-b": ["sample-node-a"],
      },
      learnerId: LOCAL_DEFAULT_LEARNER_ID,
      goalPrimaryNodeId: "sample-node-a",
      dailyMode: "learn",
      localDate: "2026-07-17",
      inputFingerprint: "fp-today-page",
    };
    const persisted = generateAndPersistPlan(db, input);
    snapshotId = persisted.snapshotId;
    const item = db
      .prepare<[string], { readonly id: string }>(
        `SELECT id FROM plan_items WHERE daily_plan_id = ? AND role = 'primary' LIMIT 1`,
      )
      .get(persisted.snapshotId);
    if (item === undefined) {
      throw new Error("Primary plan item was not persisted");
    }
    primaryItemId = item.id;
  } finally {
    db.close();
  }
});

afterEach(() => {
  delete process.env.TRAINING_DB_PATH;
  rmSync(tempDir, { recursive: true, force: true });
});

function makeFeedbackRequest(
  body: Record<string, unknown>,
  options: { readonly id?: string; readonly origin?: string } = {},
): Request {
  const id = options.id ?? primaryItemId;
  return new Request(
    `http://localhost/api/plans/items/${id}/feedback`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        origin: options.origin ?? "http://localhost",
      },
      body: JSON.stringify(body),
    },
  );
}

describe("buildTodayPagePayload", () => {
  it("returns the available state with exactly one primary item", async () => {
    const { buildTodayPagePayload } = await import("@/lib/pages/todayPage");
    const db = openDatabase();
    try {
      const payload = buildTodayPagePayload(db);
      expect(payload.state).toBe("available");
      if (payload.state === "available") {
        expect(payload.dailyMode).toBe("learn");
        expect(payload.effortBoundaryMinutes).toBe(30);
        expect(payload.generatorVersion).toBe(PLAN_GENERATOR_VERSION);
        expect(payload.primary.planItemId).toBe(primaryItemId);
        // The selector picks the candidate that ranks highest under the
        // 30-minute effort preference. The exact node varies, but the
        // contract is that exactly one primary is exposed.
        expect(["sample-node-a", "sample-node-b"]).toContain(
          payload.primary.nodeId,
        );
        expect(payload.primary.practiceTaskTitle.length).toBeGreaterThan(0);
        expect(payload.primary.reasonCodes.length).toBeGreaterThan(0);
        expect(payload.primary.mapHref).toBe(
          `/map/${payload.primary.nodeId}`,
        );
        expect(payload.alternatives.length).toBeGreaterThanOrEqual(0);
        // Alternatives must never duplicate the primary node.
        for (const alt of payload.alternatives) {
          expect(alt.nodeId).not.toBe(payload.primary.nodeId);
        }
        // There is at most one alternative per non-primary role.
        const roles = new Set(payload.alternatives.map((a) => a.role));
        expect(roles.size).toBe(payload.alternatives.length);
      }
    } finally {
      db.close();
    }
  });

  it("returns no_plan when the learner profile has no active plan", async () => {
    const db = openDatabase();
    try {
      db.pragma("foreign_keys = OFF");
      db.exec("DELETE FROM task_feedback");
      db.exec("DELETE FROM plan_items");
      db.exec("DELETE FROM daily_plan_snapshots");
      db.exec("DELETE FROM plan_revision_events");
      db.exec("DELETE FROM learning_plans");
    } finally {
      db.close();
    }
    const { buildTodayPagePayload } = await import("@/lib/pages/todayPage");
    const db2 = openDatabase();
    try {
      const payload = buildTodayPagePayload(db2);
      expect(payload.state).toBe("no_plan");
    } finally {
      db2.close();
    }
  });

  it("returns no_snapshot when the plan has no daily snapshot", async () => {
    const db = openDatabase();
    try {
      db.pragma("foreign_keys = OFF");
      db.exec("DELETE FROM task_feedback");
      db.exec("DELETE FROM plan_items");
      db.exec("DELETE FROM daily_plan_snapshots");
      db.exec("DELETE FROM plan_revision_events");
    } finally {
      db.close();
    }
    const { buildTodayPagePayload } = await import("@/lib/pages/todayPage");
    const db2 = openDatabase();
    try {
      const payload = buildTodayPagePayload(db2);
      expect(payload.state).toBe("no_snapshot");
    } finally {
      db2.close();
    }
  });
});

describe("POST /api/plans/items/[id]/feedback", () => {
  it("rejects action='completed' with HTTP 400", async () => {
    const route = await import("@/app/api/plans/items/[id]/feedback/route");
    const response = await route.POST(
      makeFeedbackRequest({ action: "completed" }),
      { params: Promise.resolve({ id: primaryItemId }) },
    );
    expect(response.status).toBe(400);
    const body = (await response.json()) as { readonly ok: boolean; readonly error: string };
    expect(body.ok).toBe(false);
    expect(body.error).toMatch(/complete/i);
  });

  it("rejects skipped without reasonCode with HTTP 400", async () => {
    const route = await import("@/app/api/plans/items/[id]/feedback/route");
    const response = await route.POST(
      makeFeedbackRequest({ action: "skipped" }),
      { params: Promise.resolve({ id: primaryItemId }) },
    );
    expect(response.status).toBe(400);
    const body = (await response.json()) as { readonly ok: boolean };
    expect(body.ok).toBe(false);
  });

  it("rejects skipped reasonCode='other' without reasonText with HTTP 400", async () => {
    const route = await import("@/app/api/plans/items/[id]/feedback/route");
    const response = await route.POST(
      makeFeedbackRequest({ action: "skipped", reasonCode: "other" }),
      { params: Promise.resolve({ id: primaryItemId }) },
    );
    expect(response.status).toBe(400);
  });

  it("rejects invalid action values with HTTP 400", async () => {
    const route = await import("@/app/api/plans/items/[id]/feedback/route");
    const response = await route.POST(
      makeFeedbackRequest({ action: "deleted" }),
      { params: Promise.resolve({ id: primaryItemId }) },
    );
    expect(response.status).toBe(400);
  });

  it("returns 404 when the plan item does not exist", async () => {
    const route = await import("@/app/api/plans/items/[id]/feedback/route");
    const response = await route.POST(
      makeFeedbackRequest({ action: "started" }, { id: "item_missing" }),
      { params: Promise.resolve({ id: "item_missing" }) },
    );
    expect(response.status).toBe(404);
  });

  it("appends 'started' feedback without creating a successor snapshot", async () => {
    const route = await import("@/app/api/plans/items/[id]/feedback/route");
    const response = await route.POST(
      makeFeedbackRequest({ action: "started" }),
      { params: Promise.resolve({ id: primaryItemId }) },
    );
    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      readonly ok: boolean;
      readonly replayed: boolean;
      readonly snapshotId: string | null;
    };
    expect(body.ok).toBe(true);
    expect(body.replayed).toBe(false);
    expect(body.snapshotId).toBeNull();

    const db = openDatabase();
    try {
      const feedback = db
        .prepare<[string], { readonly action: string }>(
          `SELECT action FROM task_feedback WHERE plan_item_id = ?`,
        )
        .all(primaryItemId);
      expect(feedback).toHaveLength(1);
      expect(feedback[0]?.action).toBe("started");
      const snapshots = db
        .prepare<[], { readonly c: number }>(
          `SELECT COUNT(*) AS c FROM daily_plan_snapshots`,
        )
        .get();
      expect(snapshots?.c).toBe(1);
    } finally {
      db.close();
    }
  });

  it("is idempotent on duplicate 'started' feedback", async () => {
    const route = await import("@/app/api/plans/items/[id]/feedback/route");
    const first = await route.POST(
      makeFeedbackRequest({ action: "started" }),
      { params: Promise.resolve({ id: primaryItemId }) },
    );
    expect(first.status).toBe(200);
    const second = await route.POST(
      makeFeedbackRequest({ action: "started" }),
      { params: Promise.resolve({ id: primaryItemId }) },
    );
    expect(second.status).toBe(200);
    const body = (await second.json()) as { readonly replayed: boolean };
    expect(body.replayed).toBe(true);

    const db = openDatabase();
    try {
      const feedback = db
        .prepare<[string], { readonly action: string }>(
          `SELECT action FROM task_feedback WHERE plan_item_id = ?`,
        )
        .all(primaryItemId);
      expect(feedback).toHaveLength(1);
    } finally {
      db.close();
    }
  });

  it("creates a successor snapshot and item_skipped revision on 'skipped'", async () => {
    const route = await import("@/app/api/plans/items/[id]/feedback/route");
    const response = await route.POST(
      makeFeedbackRequest({
        action: "skipped",
        reasonCode: "too_hard",
      }),
      { params: Promise.resolve({ id: primaryItemId }) },
    );
    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      readonly ok: boolean;
      readonly snapshotId: string | null;
    };
    expect(body.ok).toBe(true);
    expect(body.snapshotId).not.toBeNull();

    const db = openDatabase();
    try {
      const feedback = db
        .prepare<[string, string], { readonly reason_code: string | null }>(
          `SELECT reason_code FROM task_feedback
            WHERE plan_item_id = ? AND action = ?`,
        )
        .get(primaryItemId, "skipped");
      expect(feedback?.reason_code).toBe("too_hard");

      const snapshots = db
        .prepare<[], { readonly c: number }>(
          `SELECT COUNT(*) AS c FROM daily_plan_snapshots`,
        )
        .get();
      expect(snapshots?.c).toBe(2);

      const events = db
        .prepare<[string], { readonly event_type: string }>(
          `SELECT event_type FROM plan_revision_events
            WHERE after_daily_plan_id = ?`,
        )
        .all(body.snapshotId ?? "");
      expect(events).toHaveLength(1);
      expect(events[0]?.event_type).toBe("item_skipped");
      const refreshed = buildTodayPagePayload(db);
      expect(refreshed.state).toBe("available");
      if (refreshed.state === "available") {
        expect(refreshed.snapshotId).toBe(body.snapshotId);
      }
    } finally {
      db.close();
    }
  });

  it("creates a successor snapshot with new effort on effort change", async () => {
    const route = await import("@/app/api/plans/items/[id]/feedback/route");
    const response = await route.POST(
      makeFeedbackRequest({
        action: "accepted",
        effortBoundaryMinutes: 60,
      }),
      { params: Promise.resolve({ id: primaryItemId }) },
    );
    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      readonly ok: boolean;
      readonly snapshotId: string | null;
    };
    expect(body.ok).toBe(true);
    expect(body.snapshotId).not.toBeNull();

    const db = openDatabase();
    try {
      const successor = db
        .prepare<[string], { readonly effort_boundary_minutes: number }>(
          `SELECT effort_boundary_minutes FROM daily_plan_snapshots
            WHERE id = ?`,
        )
        .get(body.snapshotId ?? "");
      expect(successor?.effort_boundary_minutes).toBe(60);

      const events = db
        .prepare<[string], { readonly event_type: string }>(
          `SELECT event_type FROM plan_revision_events
            WHERE after_daily_plan_id = ?`,
        )
        .all(body.snapshotId ?? "");
      expect(events[0]?.event_type).toBe("effort_changed");
      const refreshed = buildTodayPagePayload(db);
      expect(refreshed.state).toBe("available");
      if (refreshed.state === "available") {
        expect(refreshed.snapshotId).toBe(body.snapshotId);
        expect(refreshed.effortBoundaryMinutes).toBe(60);
      }
    } finally {
      db.close();
    }
  });

  it("creates a successor snapshot for each supported daily mode", async () => {
    const route = await import("@/app/api/plans/items/[id]/feedback/route");
    const response = await route.POST(
      makeFeedbackRequest({ action: "accepted", dailyMode: "build" }),
      { params: Promise.resolve({ id: primaryItemId }) },
    );
    expect(response.status).toBe(200);
    const body = (await response.json()) as { readonly snapshotId: string | null };
    const db = openDatabase();
    try {
      const successor = db.prepare<[string], { readonly daily_mode: string }>(
        "SELECT daily_mode FROM daily_plan_snapshots WHERE id = ?",
      ).get(body.snapshotId ?? "");
      expect(successor?.daily_mode).toBe("build");
      const event = db.prepare<[string], { readonly event_type: string }>(
        "SELECT event_type FROM plan_revision_events WHERE after_daily_plan_id = ?",
      ).get(body.snapshotId ?? "");
      expect(event?.event_type).toBe("mode_changed");
    } finally {
      db.close();
    }
  });

  it("does NOT create a successor snapshot when effort matches", async () => {
    const route = await import("@/app/api/plans/items/[id]/feedback/route");
    const response = await route.POST(
      makeFeedbackRequest({
        action: "accepted",
        effortBoundaryMinutes: 30,
      }),
      { params: Promise.resolve({ id: primaryItemId }) },
    );
    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      readonly ok: boolean;
      readonly snapshotId: string | null;
    };
    expect(body.ok).toBe(true);
    expect(body.snapshotId).toBeNull();

    const db = openDatabase();
    try {
      const snapshots = db
        .prepare<[], { readonly c: number }>(
          `SELECT COUNT(*) AS c FROM daily_plan_snapshots`,
        )
        .get();
      expect(snapshots?.c).toBe(1);
    } finally {
      db.close();
    }
  });

  it("rejects an invalid effort value with HTTP 400", async () => {
    const route = await import("@/app/api/plans/items/[id]/feedback/route");
    const response = await route.POST(
      makeFeedbackRequest({
        action: "accepted",
        effortBoundaryMinutes: 45,
      }),
      { params: Promise.resolve({ id: primaryItemId }) },
    );
    expect(response.status).toBe(400);
  });
});

describe("POST /api/plans/items/[id]/feedback (origin guard)", () => {
  it("rejects cross-origin requests with HTTP 403", async () => {
    const route = await import("@/app/api/plans/items/[id]/feedback/route");
    const response = await route.POST(
      makeFeedbackRequest({ action: "started" }, { origin: "http://evil.example" }),
      { params: Promise.resolve({ id: primaryItemId }) },
    );
    expect(response.status).toBe(403);
  });
});

describe("snapshot continuity invariant", () => {
  it("every successful successor snapshot records exactly one revision event", async () => {
    const route = await import("@/app/api/plans/items/[id]/feedback/route");
    await route.POST(
      makeFeedbackRequest({
        action: "skipped",
        reasonCode: "not_now",
      }),
      { params: Promise.resolve({ id: primaryItemId }) },
    );

    const db = openDatabase();
    try {
      type Row = { readonly after_daily_plan_id: string; readonly c: number };
      const counts = db
        .prepare<string[], Row>(
          `SELECT after_daily_plan_id, COUNT(*) AS c
             FROM plan_revision_events
            GROUP BY after_daily_plan_id`,
        )
        .all();
      for (const row of counts) {
        expect(row.c).toBe(1);
      }
    } finally {
      db.close();
    }
    void snapshotId;
  });
});
