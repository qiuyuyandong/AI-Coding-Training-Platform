import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
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

/**
 * V0 `POST /api/plans/items/[id]/complete` route tests (Todo 15).
 *
 * Pattern after `tests/unit/attemptApi.test.ts`: a single OS-temp
 * SQLite file is opened through `openDatabase` so the route's
 * `openDatabase()` call inside the handler resolves to the same
 * instance. Foreign-key enforcement stays OFF during plan generation
 * (matching `tests/unit/planGenerationService.test.ts`) so the V0
 * fixture's sample-package rows can populate the plan-item table
 * without matching `cpp-io-types`-style synthetic ids.
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
let planId = "";
let snapshotId = "";

beforeEach(() => {
  tempDir = mkdtempSync(join(tmpdir(), "plan-complete-api-"));
  const dbPath = join(tempDir, "complete-api.sqlite");
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
      inputFingerprint: "fp-plan-complete-api",
    };
    const persisted = generateAndPersistPlan(db, input);
    planId = persisted.planId;
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

function makeRequest(body: Record<string, unknown>): Request {
  return new Request(
    `http://localhost/api/plans/items/${primaryItemId}/complete`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        origin: "http://localhost",
      },
      body: JSON.stringify(body),
    },
  );
}

describe("POST /api/plans/items/[id]/complete", () => {
  it("returns 200 with attempt, nodeId, explanation, and nextPlan on a valid body", async () => {
    const route = await import("@/app/api/plans/items/[id]/complete/route");
    const response = await route.POST(makeRequest({
      result: "passed",
      language: "C++17",
      durationMinutes: 22,
      reflection: "Passed with one minor refactor.",
    }), { params: Promise.resolve({ id: primaryItemId }) });

    const bodyText = await response.text();
    if (response.status !== 200) {
      throw new Error(
        `API returned ${response.status}: ${bodyText}; primaryItemId=${primaryItemId}`,
      );
    }
    const body = JSON.parse(bodyText) as {
      readonly ok: boolean;
      readonly replayed: boolean;
      readonly attemptId: string;
      readonly nodeId: string;
      readonly explanation: { readonly levelLabel: string; readonly confidenceLabel: string };
      readonly nextPlan: { readonly planId: string; readonly snapshotId: string };
    };
    expect(body.ok).toBe(true);
    expect(body.replayed).toBe(false);
    expect(body.attemptId).toBe(`manual_plan_${primaryItemId}`);
    expect(body.nodeId).toBe("node_sample-node-a");
    expect(body.explanation.levelLabel).toBe("First success");
    expect(body.explanation.confidenceLabel).toBe("low");
    expect(body.nextPlan.planId).toBe(planId);
    expect(body.nextPlan.snapshotId).not.toBe(snapshotId);
  });

  it("rejects result='draft' with HTTP 400", async () => {
    const route = await import("@/app/api/plans/items/[id]/complete/route");
    const response = await route.POST(makeRequest({ result: "draft" }), {
      params: Promise.resolve({ id: primaryItemId }),
    });

    expect(response.status).toBe(400);
    const body = (await response.json()) as { readonly ok: boolean };
    expect(body.ok).toBe(false);

    const db = openDatabase();
    try {
      const rows = db
        .prepare<[], { readonly c: number }>(
          "SELECT COUNT(*) AS c FROM training_attempts",
        )
        .get();
      expect(rows?.c).toBe(0);
    } finally {
      db.close();
    }
  });

  it("rejects a body without result with HTTP 400", async () => {
    const route = await import("@/app/api/plans/items/[id]/complete/route");
    const response = await route.POST(makeRequest({ language: "C++17" }), {
      params: Promise.resolve({ id: primaryItemId }),
    });

    expect(response.status).toBe(400);
    const body = (await response.json()) as { readonly ok: boolean };
    expect(body.ok).toBe(false);
  });

  it("returns 404 when the plan item does not exist", async () => {
    const route = await import("@/app/api/plans/items/[id]/complete/route");
    const response = await route.POST(new Request(
      "http://localhost/api/plans/items/item_does_not_exist/complete",
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          origin: "http://localhost",
        },
        body: JSON.stringify({ result: "passed" }),
      },
    ), { params: Promise.resolve({ id: "item_does_not_exist" }) });

    expect(response.status).toBe(404);
    const body = (await response.json()) as { readonly ok: boolean; readonly error: string };
    expect(body.ok).toBe(false);
    expect(body.error).toBe("Plan item not found");
  });
});
