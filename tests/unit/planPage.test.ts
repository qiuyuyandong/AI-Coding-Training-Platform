import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { openDatabase } from "@/lib/db/client";
import { applyMigrations } from "@/lib/db/migrations";
import { LOCAL_DEFAULT_LEARNER_ID } from "@/lib/domain/learner";
import {
  getOrCreateLocalProfile,
  listGoalHistory,
  setInterestTracks,
  setPrimaryTrack,
} from "@/lib/repositories/learnerProfiles";
import {
  applyStartingNodeOverride,
  completeSession,
  DIAGNOSIS_PROMPTS,
  recordResponse,
  startSession,
} from "@/lib/services/diagnosticAssessment";
import {
  createDailySnapshot,
  createLearningPlan,
  insertPlanItem,
} from "@/lib/repositories/plans";
import { PLAN_GENERATOR_VERSION } from "@/lib/services/planGenerator";

/**
 * V0 `/plan` page + API contract tests.
 *
 * The tests exercise the actual repository helpers and the two
 * `POST /api/plan/{goal,override-start}` route handlers against a
 * fully migrated temporary SQLite database seeded with the V0
 * curriculum package. The schema bootstrap mirrors the production
 * migrations so the route contracts and repository wrappers stay in
 * lockstep with the real schema.
 *
 * Coverage:
 *   - `setPrimaryTrack` returns a new active goal row and supersedes
 *     the prior one (no DB edit, only insert).
 *   - `setInterestTracks` rejects three distinct entries with a
 *     `RangeError`.
 *   - `applyStartingNodeOverride` accepts a known published node and
 *     returns baseline rows; rejects an unknown nodeId with
 *     `RangeError`.
 *   - `POST /api/plan/goal` persists the supplied goal and returns
 *     the active row; rejects oversize / duplicate interests with
 *     HTTP 400.
 *   - `POST /api/plan/override-start` returns the override baselines
 *     on success and HTTP 400 on an unknown / missing `nodeId`.
 *   - `buildPlanPagePayload` covers the `no_goal`, `pre_diagnosis`
 *     and `plan_overview` states.
 */

const NODE_STABLE_IDS = [
  "cpp-io-types",
  "cpp-control-flow-functions",
  "cpp-containers",
  "program-decomposition",
  "debugging-testing",
  "git-build-workflow",
  "complexity-analysis",
  "sorting-binary-search",
  "stacks-queues",
  "hashing-linked-structures",
  "trees-recursion-traversal",
  "graphs-bfs-dfs",
] as const;

const TRACKS = [
  "frontend-web",
  "backend-server",
  "client",
  "data-analytics-engineering",
  "ai-ml",
  "edge-ai-embedded",
  "cloud-platform",
  "security",
  "systems-software",
] as const;

let tempDir = "";

beforeEach(() => {
  tempDir = mkdtempSync(join(tmpdir(), "plan-page-"));
  process.env.TRAINING_DB_PATH = join(tempDir, "test.sqlite");
  const db = openDatabase();
  try {
    applyMigrations(db, { now: () => "2026-07-17T00:00:00.000Z" });
    seedCurriculumPackage(db);
    seedCareerTracks(db);
  } finally {
    db.close();
  }
});

afterEach(() => {
  delete process.env.TRAINING_DB_PATH;
  rmSync(tempDir, { recursive: true, force: true });
});

function seedCurriculumPackage(db: Database.Database): void {
  db.prepare(
    `INSERT INTO curriculum_packages (
       id, track_slug, semantic_version, checksum, source_revision, installed_at
     ) VALUES (?, ?, ?, ?, ?, ?)`,
  ).run(
    "pkg_v0_1_0",
    "software-development-foundations-v1",
    "1.0.0",
    "x".repeat(64),
    "rev-1",
    "2026-07-17T00:00:00.000Z",
  );
  const insertNode = db.prepare(
    `INSERT INTO knowledge_nodes (
       id, stable_id, title, outcome, rationale, order_index, status, provenance_json, package_id
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  NODE_STABLE_IDS.forEach((stableId, index) => {
    insertNode.run(
      `node_${stableId}`,
      stableId,
      `Title for ${stableId}`,
      `Outcome for ${stableId}`,
      `Rationale for ${stableId}`,
      index + 1,
      "published",
      JSON.stringify({
        authority: "Test",
        url: `https://example.com/${stableId}`,
        retrieved_at: "2026-07-17T00:00:00.000Z",
      }),
      "pkg_v0_1_0",
    );
  });
  const insertEdge = db.prepare(
    `INSERT INTO knowledge_edges (id, from_node_id, to_node_id, edge_type)
     VALUES (?, ?, ?, ?)`,
  );
  const edges: ReadonlyArray<readonly [string, string]> = [
    ["cpp-io-types", "cpp-control-flow-functions"],
    ["cpp-control-flow-functions", "cpp-containers"],
    ["cpp-containers", "program-decomposition"],
    ["program-decomposition", "debugging-testing"],
    ["cpp-containers", "complexity-analysis"],
  ];
  edges.forEach(([from, to], index) => {
    insertEdge.run(
      `edge_${index}`,
      `node_${from}`,
      `node_${to}`,
      "required_prerequisite",
    );
  });
  // Seed a canonical problem + source + practice task so plan_items
  // FKs (`practice_tasks.id`) are satisfied in the plan_overview test.
  db.prepare(
    `INSERT INTO canonical_problems (id, stable_id, title)
     VALUES (?, ?, ?)`,
  ).run("cp_cpp_io_types", "cp_cpp_io_types", "AtCoder practice_1");
  db.prepare(
    `INSERT INTO canonical_problem_sources (
       id, canonical_problem_id, platform, external_id, url, is_primary
     ) VALUES (?, ?, ?, ?, ?, ?)`,
  ).run(
    "cps_cpp_io_types",
    "cp_cpp_io_types",
    "atcoder",
    "practice_1",
    "https://atcoder.jp/contests/practice/tasks/practice_1",
    1,
  );
  db.prepare(
    `INSERT INTO practice_tasks (
       id, stable_id, canonical_problem_id, title, kind, difficulty_band, package_id
     ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    "task-cpp-io-types",
    "task-cpp-io-types",
    "cp_cpp_io_types",
    "Practice Task A",
    "oj",
    "intro",
    "pkg_v0_1_0",
  );
}

function seedCareerTracks(db: Database.Database): void {
  const insertTrack = db.prepare(
    `INSERT INTO career_tracks (id, slug, name, summary, status, package_id)
     VALUES (?, ?, ?, ?, ?, ?)`,
  );
  TRACKS.forEach((slug, index) => {
    insertTrack.run(
      `track_${index}`,
      slug,
      `Name for ${slug}`,
      JSON.stringify({
        purpose: `Purpose of ${slug}`,
        unavailable_in_v0: true,
      }),
      "published",
      "pkg_v0_1_0",
    );
  });
}

function planRequest(
  body: Record<string, unknown>,
  options: { readonly origin?: string } = {},
): Request {
  const headers = new Headers({ "content-type": "application/json" });
  headers.set("origin", options.origin ?? "http://localhost");
  return new Request("http://localhost/api/plan/goal", {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
}

function overrideRequest(
  body: Record<string, unknown>,
  options: { readonly origin?: string } = {},
): Request {
  const headers = new Headers({ "content-type": "application/json" });
  headers.set("origin", options.origin ?? "http://localhost");
  return new Request("http://localhost/api/plan/override-start", {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
}

describe("setPrimaryTrack wrapper", () => {
  it("returns a new active row when changing the primary track", () => {
    const db = openDatabase();
    try {
      getOrCreateLocalProfile(db, {
        now: () => "2026-07-17T00:00:00.000Z",
      });
      const first = setPrimaryTrack(db, LOCAL_DEFAULT_LEARNER_ID, null, {
        now: () => "2026-07-17T00:00:01.000Z",
      });
      expect(first.status).toBe("active");
      expect(first.primaryTrackId).toBeNull();
      expect(first.interestTrackIds).toEqual([]);

      const second = setPrimaryTrack(
        db,
        LOCAL_DEFAULT_LEARNER_ID,
        "systems-software",
        { now: () => "2026-07-17T00:00:02.000Z" },
      );
      expect(second.status).toBe("active");
      expect(second.primaryTrackId).toBe("systems-software");
      expect(second.id).not.toBe(first.id);

      const history = listGoalHistory(db, LOCAL_DEFAULT_LEARNER_ID);
      expect(history).toHaveLength(2);
      const active = history.find((row) => row.status === "active");
      expect(active?.primaryTrackId).toBe("systems-software");
      const superseded = history.find((row) => row.status === "superseded");
      expect(superseded?.primaryTrackId).toBeNull();
    } finally {
      db.close();
    }
  });
});

describe("setInterestTracks wrapper", () => {
  it("rejects three distinct track ids with a RangeError", () => {
    const db = openDatabase();
    try {
      getOrCreateLocalProfile(db);
      expect(() =>
        setInterestTracks(
          db,
          LOCAL_DEFAULT_LEARNER_ID,
          ["backend-server", "security", "frontend-web"],
        ),
      ).toThrow(RangeError);

      const history = listGoalHistory(db, LOCAL_DEFAULT_LEARNER_ID);
      expect(history).toHaveLength(0);
    } finally {
      db.close();
    }
  });

  it("accepts the zero-to-two distinct range", () => {
    const db = openDatabase();
    try {
      getOrCreateLocalProfile(db);
      const zero = setInterestTracks(db, LOCAL_DEFAULT_LEARNER_ID, []);
      expect(zero.interestTrackIds).toEqual([]);

      const two = setInterestTracks(db, LOCAL_DEFAULT_LEARNER_ID, [
        "backend-server",
        "security",
      ]);
      expect(two.interestTrackIds).toEqual(["backend-server", "security"]);
    } finally {
      db.close();
    }
  });
});

describe("applyStartingNodeOverride wrapper", () => {
  it("returns baseline rows for a known published node", () => {
    const db = openDatabase();
    try {
      getOrCreateLocalProfile(db);
      const result = applyStartingNodeOverride(
        db,
        LOCAL_DEFAULT_LEARNER_ID,
        "complexity-analysis",
      );
      expect(result.baselines.length).toBeGreaterThan(0);
      const target = result.baselines.find(
        (row) => row.nodeId === "complexity-analysis",
      );
      expect(target?.baseline).toBe("needs_foundation");
      expect(target?.confidence).toBe("medium");
      expect(target?.source).toBe("manual_override");
    } finally {
      db.close();
    }
  });

  it("throws RangeError when nodeId does not exist", () => {
    const db = openDatabase();
    try {
      getOrCreateLocalProfile(db);
      expect(() =>
        applyStartingNodeOverride(
          db,
          LOCAL_DEFAULT_LEARNER_ID,
          "does-not-exist",
        ),
      ).toThrow(RangeError);
    } finally {
      db.close();
    }
  });
});

describe("POST /api/plan/goal", () => {
  it("persists primary track + interest tracks and returns the active row", async () => {
    const { POST } = await import("@/app/api/plan/goal/route");
    const response = await POST(
      planRequest({
        primaryTrackId: "systems-software",
        interestTrackIds: ["backend-server", "security"],
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.goal.primaryTrackId).toBe("systems-software");
    expect(body.goal.interestTrackIds).toEqual(["backend-server", "security"]);

    const db = openDatabase();
    try {
      const history = listGoalHistory(db, LOCAL_DEFAULT_LEARNER_ID);
      const active = history.find((row) => row.status === "active");
      expect(active?.primaryTrackId).toBe("systems-software");
      expect(active?.interestTrackIds).toEqual(["backend-server", "security"]);
    } finally {
      db.close();
    }
  });

  it("returns 400 when interestTrackIds contains more than two entries", async () => {
    const { POST } = await import("@/app/api/plan/goal/route");
    const response = await POST(
      planRequest({
        primaryTrackId: "systems-software",
        interestTrackIds: [
          "backend-server",
          "security",
          "frontend-web",
          "client",
        ],
      }),
    );
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.ok).toBe(false);

    const db = openDatabase();
    try {
      expect(listGoalHistory(db, LOCAL_DEFAULT_LEARNER_ID)).toHaveLength(0);
    } finally {
      db.close();
    }
  });

  it("returns 400 when interestTrackIds contains duplicate slugs", async () => {
    const { POST } = await import("@/app/api/plan/goal/route");
    const response = await POST(
      planRequest({
        primaryTrackId: null,
        interestTrackIds: ["backend-server", "backend-server"],
      }),
    );
    expect(response.status).toBe(400);
  });
});

describe("POST /api/plan/override-start", () => {
  it("returns override baselines for a published node", async () => {
    const { POST } = await import("@/app/api/plan/override-start/route");
    const response = await POST(
      overrideRequest({ nodeId: "complexity-analysis" }),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(Array.isArray(body.baselines)).toBe(true);
    const byNode = new Map<string, Record<string, unknown>>(
      (body.baselines as readonly Record<string, unknown>[]).map((row) => [
        String(row.nodeId),
        row,
      ]),
    );
    expect(byNode.get("complexity-analysis")?.source).toBe("manual_override");
    expect(byNode.get("complexity-analysis")?.baseline).toBe(
      "needs_foundation",
    );
  });

  it("returns 400 when nodeId does not exist", async () => {
    const { POST } = await import("@/app/api/plan/override-start/route");
    const response = await POST(overrideRequest({ nodeId: "missing" }));
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.ok).toBe(false);
  });

  it("returns 400 when nodeId is missing from the request body", async () => {
    const { POST } = await import("@/app/api/plan/override-start/route");
    const response = await POST(overrideRequest({}));
    expect(response.status).toBe(400);
  });
});

describe("buildPlanPagePayload", () => {
  it("returns the no_goal state when the learner has no active goal", async () => {
    const { buildPlanPagePayload } = await import("@/app/plan/page");
    const db = openDatabase();
    try {
      const payload = buildPlanPagePayload(db);
      expect(payload.state).toBe("no_goal");
      if (payload.state === "no_goal") {
        expect(payload.tracks.length).toBe(TRACKS.length);
      }
    } finally {
      db.close();
    }
  });

  it("returns the pre_diagnosis state after a goal is set", async () => {
    const { buildPlanPagePayload } = await import("@/app/plan/page");
    const db = openDatabase();
    try {
      getOrCreateLocalProfile(db);
      setPrimaryTrack(db, LOCAL_DEFAULT_LEARNER_ID, "systems-software");
      setInterestTracks(db, LOCAL_DEFAULT_LEARNER_ID, [
        "backend-server",
        "security",
      ]);
      const payload = buildPlanPagePayload(db);
      expect(payload.state).toBe("pre_diagnosis");
      if (payload.state === "pre_diagnosis") {
        expect(payload.goal.primaryTrackId).toBe("systems-software");
        expect(payload.goal.interestTracks.map((t) => t.slug)).toEqual([
          "backend-server",
          "security",
        ]);
        // No in-progress session → first prompt is suggested.
        expect(payload.nextPromptId).toBe("cpp-basics");
      }
    } finally {
      db.close();
    }
  });

  it("transitions to plan_overview after a completed diagnosis + plan items", async () => {
    const { buildPlanPagePayload } = await import("@/app/plan/page");
    const db = openDatabase();
    try {
      getOrCreateLocalProfile(db);
      setPrimaryTrack(db, LOCAL_DEFAULT_LEARNER_ID, "systems-software");
      setInterestTracks(db, LOCAL_DEFAULT_LEARNER_ID, [
        "backend-server",
        "security",
      ]);
      const session = startSession(db, LOCAL_DEFAULT_LEARNER_ID);
      for (const prompt of DIAGNOSIS_PROMPTS) {
        recordResponse(db, session.sessionId, prompt.promptId, "ready");
      }
      completeSession(db, session.sessionId);

      // Seed an immutable plan + snapshot + a single primary item so
      // the page can render the plan overview state without going
      // through the full planner pipeline.
      const plan = createLearningPlan(
        db,
        LOCAL_DEFAULT_LEARNER_ID,
        PLAN_GENERATOR_VERSION,
        "{}",
        { now: () => "2026-07-17T00:00:10.000Z" },
      );
      const snapshot = createDailySnapshot(
        db,
        plan.id,
        "2026-07-17",
        30,
        "learn",
        PLAN_GENERATOR_VERSION,
        null,
        { now: () => "2026-07-17T00:00:10.000Z" },
      );
      insertPlanItem(
        db,
        snapshot.id,
        "task-cpp-io-types",
        "node_cpp-io-types",
        "primary",
        0,
        JSON.stringify(["common_foundation"]),
        {},
      );

      const overview = buildPlanPagePayload(db);
      expect(overview.state).toBe("plan_overview");
      if (overview.state === "plan_overview") {
        expect(overview.goal.primaryTrackId).toBe("systems-software");
        expect(overview.goal.interestTracks.map((t) => t.slug)).toEqual([
          "backend-server",
          "security",
        ]);
        expect(overview.overview.items.length).toBe(1);
        expect(overview.overview.items[0]?.role).toBe("primary");
        expect(overview.overview.items[0]?.nodeId).toBe("cpp-io-types");
        expect(overview.overview.generatorVersion).toBe(PLAN_GENERATOR_VERSION);
        expect(overview.baselines.length).toBe(12);
      }
    } finally {
      db.close();
    }
  });
});