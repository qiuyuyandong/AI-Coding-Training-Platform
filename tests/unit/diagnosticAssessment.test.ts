import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";
import { afterEach, describe, expect, it } from "vitest";
import {
  DIAGNOSIS_BLUEPRINT_VERSION,
  DIAGNOSIS_PROMPTS,
  applyStartingNodeOverride,
  completeSession,
  recordResponse,
  resumeSession,
  startSession,
} from "@/lib/services/diagnosticAssessment";
import {
  LOCAL_DEFAULT_LEARNER_ID,
  type LearnerNodeBaselineRow,
} from "@/lib/domain/learner";
import { getOrCreateLocalProfile } from "@/lib/repositories/learnerProfiles";

/**
 * Unit tests for `lib/services/diagnosticAssessment.ts`.
 *
 * The service uses `lib/repositories/curriculum.ts` to discover the
 * active curriculum package for the starting-point override path.
 * Those repository helpers assume the `0006_curriculum_catalog.sql`
 * migration has been applied. Rather than running every migration in
 * the test, we apply only the schema slices that are actually read by
 * the service. The shapes mirror the canonical migrations byte-for-byte
 * so any drift surfaces here before it leaks into a release. The
 * `learner_node_baselines` table intentionally drops the
 * `node_id REFERENCES knowledge_nodes(id)` foreign key so the service
 * can store the row id it resolves through `loadActivePackage`; this
 * matches the test schema in `tests/unit/learnerRepository.test.ts`.
 *
 * The V0 immutable ability tables (`ability_snapshots`,
 * `ability_transitions`) are also created as empty tables so the
 * isolation test can prove that the diagnosis service never writes to
 * them; their presence mirrors the schema that Todo 14 will install.
 */

const tempDirs: string[] = [];
const tempDatabases: Database.Database[] = [];

function openSchema(): Database.Database {
  const directory = mkdtempSync(join(tmpdir(), "diagnosis-svc-"));
  tempDirs.push(directory);
  const db = new Database(join(directory, "schema.sqlite"));
  tempDatabases.push(db);
  db.pragma("foreign_keys = ON");
  db.exec(SCHEMA_SQL);
  return db;
}

function fixedClock(timestamp: string): () => string {
  return () => timestamp;
}

const SCHEMA_SQL = `
  CREATE TABLE curriculum_packages (
    id TEXT PRIMARY KEY,
    track_slug TEXT NOT NULL,
    semantic_version TEXT NOT NULL,
    checksum TEXT NOT NULL,
    source_revision TEXT NOT NULL,
    installed_at TEXT NOT NULL
  );

  CREATE TABLE knowledge_nodes (
    id TEXT PRIMARY KEY,
    stable_id TEXT NOT NULL,
    title TEXT NOT NULL,
    outcome TEXT NOT NULL,
    rationale TEXT NOT NULL,
    order_index INTEGER NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('planned', 'draft', 'published', 'deprecated')),
    provenance_json TEXT NOT NULL,
    package_id TEXT NOT NULL REFERENCES curriculum_packages(id),
    UNIQUE(package_id, stable_id)
  );

  CREATE TABLE knowledge_edges (
    id TEXT PRIMARY KEY,
    from_node_id TEXT NOT NULL REFERENCES knowledge_nodes(id),
    to_node_id TEXT NOT NULL REFERENCES knowledge_nodes(id),
    edge_type TEXT NOT NULL CHECK (edge_type IN ('required_prerequisite', 'recommended_prerequisite'))
  );

  CREATE TABLE learner_profiles (
    id TEXT PRIMARY KEY,
    onboarding_state TEXT NOT NULL CHECK (onboarding_state IN
      ('new', 'goal_resolved', 'diagnosing', 'plan_ready')),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE diagnostic_sessions (
    id TEXT PRIMARY KEY,
    learner_id TEXT NOT NULL REFERENCES learner_profiles(id),
    blueprint_version TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('in_progress', 'completed')),
    started_at TEXT NOT NULL,
    completed_at TEXT
  );

  CREATE TABLE diagnostic_responses (
    session_id TEXT NOT NULL REFERENCES diagnostic_sessions(id),
    prompt_id TEXT NOT NULL,
    response TEXT NOT NULL CHECK (response IN
      ('unknown', 'needs_foundation', 'can_with_help', 'ready')),
    created_at TEXT NOT NULL,
    PRIMARY KEY(session_id, prompt_id)
  );

  CREATE TABLE learner_node_baselines (
    learner_id TEXT NOT NULL REFERENCES learner_profiles(id),
    node_id TEXT NOT NULL,
    baseline TEXT NOT NULL CHECK (baseline IN
      ('unknown', 'needs_foundation', 'self_reported', 'ready')),
    confidence TEXT NOT NULL CHECK (confidence IN ('low', 'medium', 'high')),
    source TEXT NOT NULL CHECK (source IN ('diagnosis', 'manual_override')),
    updated_at TEXT NOT NULL,
    PRIMARY KEY(learner_id, node_id)
  );

  CREATE TABLE ability_snapshots (
    learner_id TEXT NOT NULL,
    node_id TEXT NOT NULL,
    visible_level TEXT NOT NULL,
    confidence TEXT NOT NULL,
    evidence_count INTEGER NOT NULL,
    stale INTEGER NOT NULL,
    input_fingerprint TEXT NOT NULL,
    projection_version TEXT NOT NULL,
    as_of_time TEXT NOT NULL,
    PRIMARY KEY(learner_id, node_id)
  );

  CREATE TABLE ability_transitions (
    id TEXT PRIMARY KEY,
    learner_id TEXT NOT NULL,
    node_id TEXT NOT NULL,
    previous_level TEXT NOT NULL,
    new_level TEXT NOT NULL,
    reason_codes_json TEXT NOT NULL,
    source_attempt_ids_json TEXT NOT NULL,
    source_attempt_revisions_json TEXT NOT NULL,
    input_fingerprint TEXT NOT NULL,
    projection_version TEXT NOT NULL,
    created_at TEXT NOT NULL,
    UNIQUE(learner_id, node_id, input_fingerprint, projection_version)
  );
`;

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

const EDGES: ReadonlyArray<readonly [string, string]> = [
  ["cpp-io-types", "cpp-control-flow-functions"],
  ["cpp-control-flow-functions", "cpp-containers"],
  ["cpp-containers", "program-decomposition"],
  ["program-decomposition", "debugging-testing"],
  ["program-decomposition", "git-build-workflow"],
  ["cpp-containers", "complexity-analysis"],
  ["complexity-analysis", "sorting-binary-search"],
  ["complexity-analysis", "stacks-queues"],
  ["complexity-analysis", "hashing-linked-structures"],
  ["program-decomposition", "trees-recursion-traversal"],
  ["hashing-linked-structures", "trees-recursion-traversal"],
  ["trees-recursion-traversal", "graphs-bfs-dfs"],
  ["stacks-queues", "graphs-bfs-dfs"],
];

function seedPublishedPackage(db: Database.Database): void {
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
  EDGES.forEach(([fromStableId, toStableId], index) => {
    insertEdge.run(
      `edge_${index}`,
      `node_${fromStableId}`,
      `node_${toStableId}`,
      "required_prerequisite",
    );
  });
}

function insertDraftNode(db: Database.Database): void {
  db.prepare(
    `INSERT INTO knowledge_nodes (
       id, stable_id, title, outcome, rationale, order_index, status, provenance_json, package_id
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    "node_draft_extra",
    "draft-extra",
    "Draft node",
    "Outcome",
    "Rationale",
    99,
    "draft",
    JSON.stringify({
      authority: "Test",
      url: "https://example.com/draft-extra",
      retrieved_at: "2026-07-17T00:00:00.000Z",
    }),
    "pkg_v0_1_0",
  );
}

function rowCount(db: Database.Database, tableName: string): number {
  // `tableName` is constructed by the test author from a fixed
  // literal; we never accept it from user input. Validate defensively
  // anyway because cheap defence beats a stale test explosion later.
  if (!/^[a-z_]+$/.test(tableName)) {
    throw new Error(`Unexpected table name '${tableName}'`);
  }
  const row = db
    .prepare<[], { readonly count: number }>(
      `SELECT COUNT(*) AS count FROM ${tableName}`,
    )
    .get();
  return row?.count ?? 0;
}

function bootstrapProfile(db: Database.Database): void {
  getOrCreateLocalProfile(db, {
    now: fixedClock("2026-07-17T00:00:00.000Z"),
  });
}

afterEach(() => {
  for (const db of tempDatabases.splice(0)) {
    try {
      db.close();
    } catch {
      // Already closed by the test body.
    }
  }
  for (const directory of tempDirs.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe("DIAGNOSIS_BLUEPRINT_VERSION", () => {
  it("freezes the V0 blueprint version literal", () => {
    expect(DIAGNOSIS_BLUEPRINT_VERSION).toBe("v0-diagnosis-1");
  });
});

describe("DIAGNOSIS_PROMPTS", () => {
  it("contains exactly six prompts in the documented order", () => {
    expect(DIAGNOSIS_PROMPTS.map((p) => p.promptId)).toEqual([
      "cpp-basics",
      "containers-functions",
      "debugging-testing",
      "git-build",
      "complexity-search-structures",
      "trees-graphs",
    ]);
  });

  it("covers all 12 published foundation nodes exactly once", () => {
    const covered = new Set<string>();
    for (const prompt of DIAGNOSIS_PROMPTS) {
      for (const nodeId of prompt.coveredNodeStableIds) {
        expect(covered.has(nodeId)).toBe(false);
        covered.add(nodeId);
      }
    }
    expect([...covered].sort()).toEqual([...NODE_STABLE_IDS].sort());
  });

  it("maps each prompt id to the documented node ranges", () => {
    expect(DIAGNOSIS_PROMPTS[0]?.coveredNodeStableIds).toEqual([
      "cpp-io-types",
      "cpp-control-flow-functions",
    ]);
    expect(DIAGNOSIS_PROMPTS[1]?.coveredNodeStableIds).toEqual([
      "cpp-containers",
      "program-decomposition",
    ]);
    expect(DIAGNOSIS_PROMPTS[2]?.coveredNodeStableIds).toEqual([
      "debugging-testing",
    ]);
    expect(DIAGNOSIS_PROMPTS[3]?.coveredNodeStableIds).toEqual([
      "git-build-workflow",
    ]);
    expect(DIAGNOSIS_PROMPTS[4]?.coveredNodeStableIds).toEqual([
      "complexity-analysis",
      "sorting-binary-search",
      "stacks-queues",
      "hashing-linked-structures",
    ]);
    expect(DIAGNOSIS_PROMPTS[5]?.coveredNodeStableIds).toEqual([
      "trees-recursion-traversal",
      "graphs-bfs-dfs",
    ]);
  });
});

describe("startSession", () => {
  it("creates an in_progress session using the V0 blueprint version", () => {
    const db = openSchema();
    const { sessionId } = startSession(db, LOCAL_DEFAULT_LEARNER_ID, {
      now: fixedClock("2026-07-17T00:00:00.000Z"),
    });

    const row = db
      .prepare<
        [string],
        {
          readonly status: string;
          readonly blueprint_version: string;
          readonly completed_at: string | null;
        }
      >(
        `SELECT status, blueprint_version, completed_at
           FROM diagnostic_sessions
          WHERE id = ?`,
      )
      .get(sessionId);

    expect(row?.status).toBe("in_progress");
    expect(row?.blueprint_version).toBe("v0-diagnosis-1");
    expect(row?.completed_at).toBeNull();
  });
});

describe("recordResponse", () => {
  it("persists a valid prompt + response pair", () => {
    const db = openSchema();
    const { sessionId } = startSession(db, LOCAL_DEFAULT_LEARNER_ID, {
      now: fixedClock("2026-07-17T00:00:00.000Z"),
    });

    recordResponse(db, sessionId, "cpp-basics", "ready", {
      now: fixedClock("2026-07-17T00:00:01.000Z"),
    });

    const row = db
      .prepare<
        [string, string],
        { readonly response: string; readonly created_at: string }
      >(
        `SELECT response, created_at
           FROM diagnostic_responses
          WHERE session_id = ? AND prompt_id = ?`,
      )
      .get(sessionId, "cpp-basics");
    expect(row?.response).toBe("ready");
    expect(row?.created_at).toBe("2026-07-17T00:00:01.000Z");
  });

  it("rejects an unknown prompt id with RangeError", () => {
    const db = openSchema();
    const { sessionId } = startSession(db, LOCAL_DEFAULT_LEARNER_ID, {
      now: fixedClock("2026-07-17T00:00:00.000Z"),
    });

    expect(() => recordResponse(db, sessionId, "unknown-prompt", "ready"))
      .toThrow(RangeError);
  });

  it("rejects an invalid response value with RangeError", () => {
    const db = openSchema();
    const { sessionId } = startSession(db, LOCAL_DEFAULT_LEARNER_ID, {
      now: fixedClock("2026-07-17T00:00:00.000Z"),
    });

    expect(() => recordResponse(db, sessionId, "cpp-basics", "expert"))
      .toThrow(RangeError);
  });

  it("overwrites a previous response for the same prompt", () => {
    const db = openSchema();
    const { sessionId } = startSession(db, LOCAL_DEFAULT_LEARNER_ID, {
      now: fixedClock("2026-07-17T00:00:00.000Z"),
    });

    recordResponse(db, sessionId, "cpp-basics", "unknown", {
      now: fixedClock("2026-07-17T00:00:01.000Z"),
    });
    recordResponse(db, sessionId, "cpp-basics", "ready", {
      now: fixedClock("2026-07-17T00:00:02.000Z"),
    });

    const rows = db
      .prepare<
        [string, string],
        { readonly response: string; readonly created_at: string }
      >(
        `SELECT response, created_at
           FROM diagnostic_responses
          WHERE session_id = ? AND prompt_id = ?`,
      )
      .all(sessionId, "cpp-basics");
    expect(rows).toHaveLength(1);
    expect(rows[0]?.response).toBe("ready");
    expect(rows[0]?.created_at).toBe("2026-07-17T00:00:02.000Z");
  });
});

describe("resumeSession", () => {
  it("returns the first unanswered prompt", () => {
    const db = openSchema();
    const started = startSession(db, LOCAL_DEFAULT_LEARNER_ID, {
      now: fixedClock("2026-07-17T00:00:00.000Z"),
    });
    recordResponse(db, started.sessionId, "cpp-basics", "ready", {
      now: fixedClock("2026-07-17T00:00:01.000Z"),
    });

    const resumed = resumeSession(db, LOCAL_DEFAULT_LEARNER_ID);
    expect(resumed.sessionId).toBe(started.sessionId);
    expect(resumed.nextPrompt?.promptId).toBe("containers-functions");
  });

  it("returns null nextPrompt once every prompt has been answered", () => {
    const db = openSchema();
    const started = startSession(db, LOCAL_DEFAULT_LEARNER_ID, {
      now: fixedClock("2026-07-17T00:00:00.000Z"),
    });
    for (const prompt of DIAGNOSIS_PROMPTS) {
      recordResponse(db, started.sessionId, prompt.promptId, "ready", {
        now: fixedClock("2026-07-17T00:00:01.000Z"),
      });
    }

    const resumed = resumeSession(db, LOCAL_DEFAULT_LEARNER_ID);
    expect(resumed.sessionId).toBe(started.sessionId);
    expect(resumed.nextPrompt).toBeNull();
  });

  it("starts a fresh session when no in_progress session exists", () => {
    const db = openSchema();
    const first = resumeSession(db, LOCAL_DEFAULT_LEARNER_ID);
    const second = resumeSession(db, LOCAL_DEFAULT_LEARNER_ID);

    expect(second.sessionId).toBe(first.sessionId);
    expect(second.nextPrompt?.promptId).toBe("cpp-basics");
    expect(rowCount(db, "diagnostic_sessions")).toBe(1);
  });
});

describe("completeSession", () => {
  function bootstrapAllReady(db: Database.Database) {
    seedPublishedPackage(db);
    const started = startSession(db, LOCAL_DEFAULT_LEARNER_ID, {
      now: fixedClock("2026-07-17T00:00:00.000Z"),
    });
    for (const prompt of DIAGNOSIS_PROMPTS) {
      recordResponse(db, started.sessionId, prompt.promptId, "ready", {
        now: fixedClock("2026-07-17T00:00:01.000Z"),
      });
    }
    return started;
  }

  it("upserts all 12 baselines as ready/low when every prompt is ready", () => {
    const db = openSchema();
    const started = bootstrapAllReady(db);

    const result = completeSession(db, started.sessionId, {
      now: fixedClock("2026-07-17T00:00:02.000Z"),
    });

    expect(result.baselines).toHaveLength(12);
    for (const row of result.baselines) {
      expect(row.baseline).toBe("ready");
      expect(row.confidence).toBe("low");
      expect(row.source).toBe("diagnosis");
    }
    const sessionRow = db
      .prepare<
        [string],
        {
          readonly status: string;
          readonly completed_at: string | null;
        }
      >(
        `SELECT status, completed_at
           FROM diagnostic_sessions
          WHERE id = ?`,
      )
      .get(started.sessionId);
    expect(sessionRow?.status).toBe("completed");
    expect(sessionRow?.completed_at).toBe("2026-07-17T00:00:02.000Z");
  });

  it("computes per-node baselines from mixed responses", () => {
    const db = openSchema();
    seedPublishedPackage(db);
    const started = startSession(db, LOCAL_DEFAULT_LEARNER_ID, {
      now: fixedClock("2026-07-17T00:00:00.000Z"),
    });
    // First prompt: nodes 1-2 → ready (cpp-io-types and cpp-control-flow-functions are ready/low)
    recordResponse(db, started.sessionId, "cpp-basics", "ready");
    // Second prompt: nodes 3-4 → can_with_help (cpp-containers, program-decomposition → self_reported/medium)
    recordResponse(db, started.sessionId, "containers-functions", "can_with_help");
    // Third prompt: node 5 → needs_foundation (debugging-testing → needs_foundation/medium)
    recordResponse(db, started.sessionId, "debugging-testing", "needs_foundation");
    // Fourth prompt: node 6 → ready (git-build-workflow → ready/low)
    recordResponse(db, started.sessionId, "git-build", "ready");
    // Fifth prompt: nodes 7-10 → "unknown" (all four become unknown/low)
    recordResponse(db, started.sessionId, "complexity-search-structures", "unknown");
    // Sixth prompt: nodes 11-12 → needs_foundation
    recordResponse(db, started.sessionId, "trees-graphs", "needs_foundation");

    const result = completeSession(db, started.sessionId, {
      now: fixedClock("2026-07-17T00:00:02.000Z"),
    });
    const byNode = new Map<string, LearnerNodeBaselineRow>(
      result.baselines.map((row) => [row.nodeId, row]),
    );

    expect(byNode.get("cpp-io-types")?.baseline).toBe("ready");
    expect(byNode.get("cpp-io-types")?.confidence).toBe("low");

    expect(byNode.get("cpp-control-flow-functions")?.baseline).toBe("ready");
    expect(byNode.get("cpp-control-flow-functions")?.confidence).toBe("low");

    expect(byNode.get("cpp-containers")?.baseline).toBe("self_reported");
    expect(byNode.get("cpp-containers")?.confidence).toBe("medium");

    expect(byNode.get("program-decomposition")?.baseline).toBe("self_reported");
    expect(byNode.get("program-decomposition")?.confidence).toBe("medium");

    expect(byNode.get("debugging-testing")?.baseline).toBe("needs_foundation");
    expect(byNode.get("debugging-testing")?.confidence).toBe("medium");

    expect(byNode.get("git-build-workflow")?.baseline).toBe("ready");
    expect(byNode.get("git-build-workflow")?.confidence).toBe("low");

    expect(byNode.get("complexity-analysis")?.baseline).toBe("unknown");
    expect(byNode.get("complexity-analysis")?.confidence).toBe("low");
    expect(byNode.get("sorting-binary-search")?.baseline).toBe("unknown");
    expect(byNode.get("stacks-queues")?.baseline).toBe("unknown");
    expect(byNode.get("hashing-linked-structures")?.baseline).toBe("unknown");

    expect(byNode.get("trees-recursion-traversal")?.baseline).toBe(
      "needs_foundation",
    );
    expect(byNode.get("trees-recursion-traversal")?.confidence).toBe("medium");
    expect(byNode.get("graphs-bfs-dfs")?.baseline).toBe("needs_foundation");
    expect(byNode.get("graphs-bfs-dfs")?.confidence).toBe("medium");
  });

  it("marks every baseline unknown/low when no response covers it", () => {
    const db = openSchema();
    seedPublishedPackage(db);
    const started = startSession(db, LOCAL_DEFAULT_LEARNER_ID, {
      now: fixedClock("2026-07-17T00:00:00.000Z"),
    });
    recordResponse(db, started.sessionId, "cpp-basics", "unknown");
    recordResponse(db, started.sessionId, "containers-functions", "unknown");
    recordResponse(db, started.sessionId, "debugging-testing", "unknown");
    recordResponse(db, started.sessionId, "git-build", "unknown");
    recordResponse(db, started.sessionId, "complexity-search-structures", "unknown");
    recordResponse(db, started.sessionId, "trees-graphs", "unknown");

    const result = completeSession(db, started.sessionId);
    expect(result.baselines).toHaveLength(12);
    for (const row of result.baselines) {
      expect(row.baseline).toBe("unknown");
      expect(row.confidence).toBe("low");
      expect(row.source).toBe("diagnosis");
    }
  });
});

describe("applyStartingNodeOverride", () => {
  it("upserts prerequisites 1-6 as ready/low/manual_override and node 7 as needs_foundation/medium", () => {
    const db = openSchema();
    seedPublishedPackage(db);
    bootstrapProfile(db);
    // Seed one prior diagnosis baseline that should be replaced by the
    // override so we can verify the upsert semantics. The migration
    // stores the row id (`node_cpp-io-types`) in `node_id`; the
    // service exposes the stable id at the API boundary.
    db.prepare(
      `INSERT INTO learner_node_baselines
         (learner_id, node_id, baseline, confidence, source, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
    ).run(
      LOCAL_DEFAULT_LEARNER_ID,
      "node_cpp-io-types",
      "unknown",
      "low",
      "diagnosis",
      "2026-07-17T00:00:00.000Z",
    );

    const result = applyStartingNodeOverride(
      db,
      LOCAL_DEFAULT_LEARNER_ID,
      "complexity-analysis",
      { now: fixedClock("2026-07-17T00:00:02.000Z") },
    );

    expect(result.baselines).toHaveLength(7);
    const byNode = new Map<string, LearnerNodeBaselineRow>(
      result.baselines.map((row) => [row.nodeId, row]),
    );
    const expectedPrereqs = [
      "cpp-io-types",
      "cpp-control-flow-functions",
      "cpp-containers",
      "program-decomposition",
      "debugging-testing",
      "git-build-workflow",
    ];
    for (const prereq of expectedPrereqs) {
      const row = byNode.get(prereq);
      expect(row?.baseline).toBe("ready");
      expect(row?.confidence).toBe("low");
      expect(row?.source).toBe("manual_override");
    }
    const target = byNode.get("complexity-analysis");
    expect(target?.baseline).toBe("needs_foundation");
    expect(target?.confidence).toBe("medium");
    expect(target?.source).toBe("manual_override");

    // Confirm the override actually replaced the prior diagnosis row
    // by inspecting the raw storage (the row id survives the API
    // translation, the baseline and source did not).
    const stored = db
      .prepare<
        [string, string],
        { readonly source: string; readonly baseline: string }
      >(
        `SELECT baseline, source
           FROM learner_node_baselines
          WHERE learner_id = ? AND node_id = ?`,
      )
      .get(LOCAL_DEFAULT_LEARNER_ID, "node_cpp-io-types");
    expect(stored?.baseline).toBe("ready");
    expect(stored?.source).toBe("manual_override");
  });

  it("upserts the full transitive closure for the final node (12 baselines)", () => {
    const db = openSchema();
    seedPublishedPackage(db);
    bootstrapProfile(db);

    const result = applyStartingNodeOverride(
      db,
      LOCAL_DEFAULT_LEARNER_ID,
      "graphs-bfs-dfs",
      { now: fixedClock("2026-07-17T00:00:02.000Z") },
    );

    expect(result.baselines).toHaveLength(12);
    const byNode = new Map<string, LearnerNodeBaselineRow>(
      result.baselines.map((row) => [row.nodeId, row]),
    );
    const expectedPrereqs = [
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
    ];
    for (const prereq of expectedPrereqs) {
      const row = byNode.get(prereq);
      expect(row?.baseline).toBe("ready");
      expect(row?.confidence).toBe("low");
      expect(row?.source).toBe("manual_override");
    }
    const target = byNode.get("graphs-bfs-dfs");
    expect(target?.baseline).toBe("needs_foundation");
    expect(target?.confidence).toBe("medium");
    expect(target?.source).toBe("manual_override");
  });

  it("throws RangeError when the nodeId does not exist", () => {
    const db = openSchema();
    seedPublishedPackage(db);
    bootstrapProfile(db);

    expect(() =>
      applyStartingNodeOverride(
        db,
        LOCAL_DEFAULT_LEARNER_ID,
        "does-not-exist",
      ),
    ).toThrow(RangeError);
  });

  it("throws RangeError when the nodeId is a draft node", () => {
    const db = openSchema();
    seedPublishedPackage(db);
    insertDraftNode(db);
    bootstrapProfile(db);

    expect(() =>
      applyStartingNodeOverride(
        db,
        LOCAL_DEFAULT_LEARNER_ID,
        "draft-extra",
      ),
    ).toThrow(RangeError);
  });
});

describe("isolation from ability tables", () => {
  it("never writes to ability_snapshots or ability_transitions", () => {
    const db = openSchema();
    seedPublishedPackage(db);
    bootstrapProfile(db);
    const started = startSession(db, LOCAL_DEFAULT_LEARNER_ID);
    for (const prompt of DIAGNOSIS_PROMPTS) {
      recordResponse(db, started.sessionId, prompt.promptId, "ready");
    }
    completeSession(db, started.sessionId);
    applyStartingNodeOverride(
      db,
      LOCAL_DEFAULT_LEARNER_ID,
      "complexity-analysis",
    );

    expect(rowCount(db, "ability_snapshots")).toBe(0);
    expect(rowCount(db, "ability_transitions")).toBe(0);
  });
});