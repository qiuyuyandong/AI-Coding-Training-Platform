import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import Database from "better-sqlite3";
import { applyMigrations } from "@/lib/db/migrations";
import { importPackage } from "@/lib/curriculum/importPackage";
import { LOCAL_DEFAULT_LEARNER_ID } from "@/lib/domain/learner";
import {
  abilityLabel,
  findMappedAttempt,
  listMappedAttempts,
} from "@/lib/services/attemptNodeMapping";
import { findAbilitySnapshot, upsertAbilitySnapshot } from "@/lib/repositories/ability";
import { createManualAttempt } from "@/lib/services/manualAttempts";
import { createHash } from "node:crypto";

/**
 * V0 mapped-attempt helper tests (Todo 20).
 *
 * The helper joins `attempt_node_mappings` → `knowledge_nodes` → and
 * (when present) `ability_snapshots`, returning a strict shape the
 * `/training` page can render inline. These tests build a small but
 * realistic fixture by applying every-prefix migrations, importing the
 * sample-package curriculum, and inserting one mapped + one unmapped
 * manual attempt with corresponding ability snapshots. The same
 * fixtures also exercise the voided-attempt exclusion rule.
 */

const SAMPLE_PACKAGE_PATH = join(
  process.cwd(),
  "tests",
  "fixtures",
  "curriculum",
  "sample-package",
);

function openTmpDb(): { db: Database.Database; tmp: string } {
  const tmp = mkdtempSync(join(tmpdir(), "attempt-node-mapping-test-"));
  const db = new Database(join(tmp, "test.sqlite"));
  applyMigrations(db, { now: () => "2026-07-17T00:00:00.000Z" });
  return { db, tmp };
}

function fingerprint(seed: string): string {
  return createHash("sha256").update(seed).digest("hex");
}

type AttemptContext = {
  readonly id: string;
};

function createLocalLearner(db: Database.Database): void {
  db.prepare(
    `INSERT INTO learner_profiles (id, onboarding_state, created_at, updated_at)
     VALUES (?, 'plan_ready', ?, ?)`,
  ).run(LOCAL_DEFAULT_LEARNER_ID, "2026-07-17T00:00:00.000Z", "2026-07-17T00:00:00.000Z");
}

function insertMappedAttempt(
  db: Database.Database,
  nodeId: string,
  endedAt: string,
): AttemptContext {
  const id = `manual_${randomHex(8)}`;
  createManualAttempt(
    db,
    {
      platform: "atcoder",
      problemExternalId: "practice_1",
      problemTitle: "Practice Task A",
      canonicalUrl: "https://atcoder.jp/contests/practice/tasks/practice_1",
      startedAt: endedAt,
      endedAt,
      result: "passed",
    },
    { id: () => id, now: () => endedAt },
  );
  db.prepare(
    `INSERT INTO attempt_node_mappings (
       id, attempt_id, node_id, role, mapping_reason, created_at
     ) VALUES (?, ?, ?, 'primary', ?, ?)`,
  ).run(`mapping_${id}`, id, nodeId, `test:${id}`, endedAt);
  return { id };
}

function insertUnmappedAttempt(db: Database.Database, endedAt: string): AttemptContext {
  const id = `manual_${randomHex(8)}`;
  createManualAttempt(
    db,
    {
      platform: "atcoder",
      problemExternalId: "abc200_a",
      problemTitle: "Legacy unmapped attempt",
      startedAt: endedAt,
      endedAt,
      result: "failed",
    },
    { id: () => id, now: () => endedAt },
  );
  return { id };
}

function insertVoidedMappedAttempt(
  db: Database.Database,
  nodeId: string,
  endedAt: string,
): AttemptContext {
  const id = `manual_${randomHex(8)}`;
  createManualAttempt(
    db,
    {
      platform: "atcoder",
      problemExternalId: "abc086_a",
      problemTitle: "Voided mapped attempt",
      canonicalUrl: "https://atcoder.jp/contests/abc086/tasks/abc086_a",
      startedAt: endedAt,
      endedAt,
      result: "passed",
    },
    { id: () => id, now: () => endedAt },
  );
  db.prepare(
    `INSERT INTO attempt_node_mappings (
       id, attempt_id, node_id, role, mapping_reason, created_at
     ) VALUES (?, ?, ?, 'primary', ?, ?)`,
  ).run(`mapping_${id}`, id, nodeId, `test:${id}`, endedAt);
  db.prepare(
    `UPDATE training_attempts
        SET voided_at = ?, void_reason = 'test'
      WHERE id = ?`,
  ).run(endedAt, id);
  return { id };
}

function randomHex(bytes: number): string {
  const chars = "0123456789abcdef";
  let value = "";
  for (let i = 0; i < bytes * 2; i += 1) {
    const index = Math.floor(Math.random() * chars.length);
    value += chars[index];
  }
  return value;
}

describe("attemptNodeMapping", () => {
  let db: Database.Database;
  let tmp: string;
  let nodeIdA: string;
  let nodeIdB: string;

  beforeEach(() => {
    const opened = openTmpDb();
    db = opened.db;
    tmp = opened.tmp;

    const importResult = importPackage(db, SAMPLE_PACKAGE_PATH);
    expect(importResult.ok).toBe(true);
    if (!importResult.ok) throw new Error("package import failed");

    createLocalLearner(db);

    const nodeRows = db
      .prepare<[], { id: string; stable_id: string }>(
        "SELECT id, stable_id FROM knowledge_nodes ORDER BY order_index ASC",
      )
      .all();
    expect(nodeRows.length).toBeGreaterThanOrEqual(2);
    const first = nodeRows[0];
    const second = nodeRows[1];
    if (first === undefined || second === undefined) {
      throw new Error("expected at least 2 published nodes in sample-package");
    }
    nodeIdA = first.id;
    nodeIdB = second.id;
  });

  afterEach(() => {
    if (db) {
      db.close();
      db = undefined as unknown as Database.Database;
    }
    if (tmp) {
      try {
        rmSync(tmp, { recursive: true, force: true });
      } catch {
        /* ignore */
      }
      tmp = undefined as unknown as string;
    }
  });

  it("returns mapped:false for an attempt with no mapping row", () => {
    const attempt = insertUnmappedAttempt(db, "2026-07-17T01:00:00.000Z");
    const result = findMappedAttempt(db, attempt.id);
    expect(result.attemptId).toBe(attempt.id);
    expect(result.mapped).toBe(false);
    expect(result.node).toBeNull();
    expect(result.ability).toBeNull();
  });

  it("returns mapped:true with node metadata and ability label for a mapped attempt", () => {
    const endedAt = "2026-07-17T02:00:00.000Z";
    const attempt = insertMappedAttempt(db, nodeIdA, endedAt);

    upsertAbilitySnapshot(db, {
      learner_id: LOCAL_DEFAULT_LEARNER_ID,
      node_id: nodeIdA,
      visible_level: "L1",
      confidence: "low",
      evidence_count: 1,
      stale: false,
      input_fingerprint: fingerprint("mapped-test-1"),
      projection_version: "v0-ability-projector-1",
      as_of_time: endedAt,
    });

    const result = findMappedAttempt(db, attempt.id);
    expect(result.mapped).toBe(true);
    expect(result.node).not.toBeNull();
    if (result.node === null) throw new Error("node must not be null");
    expect(result.node.nodeId).toBe(nodeIdA);
    expect(result.node.title.length).toBeGreaterThan(0);
    expect(result.node.role).toBe("primary");
    expect(result.ability).not.toBeNull();
    if (result.ability === null) throw new Error("ability must not be null");
    expect(result.ability.visibleLevel).toBe("L1");
    expect(result.ability.confidence).toBe("low");
    expect(result.ability.label).toBe("L1 (low)");

    // Sanity-check the same snapshot via the repository so we know the
    // JOIN helper is reading the same row the UI is rendering.
    const fromRepository = findAbilitySnapshot(db, LOCAL_DEFAULT_LEARNER_ID, nodeIdA);
    expect(fromRepository?.visible_level).toBe("L1");
  });

  it("returns mapped:true with null ability when no snapshot exists yet", () => {
    const attempt = insertMappedAttempt(db, nodeIdB, "2026-07-17T03:00:00.000Z");
    const result = findMappedAttempt(db, attempt.id);
    expect(result.mapped).toBe(true);
    expect(result.ability).toBeNull();
    expect(result.node).not.toBeNull();
  });

  it("filters out voided attempts so the Training page never surfaces them as mapped", () => {
    const endedAt = "2026-07-17T04:00:00.000Z";
    const attempt = insertVoidedMappedAttempt(db, nodeIdA, endedAt);
    const result = findMappedAttempt(db, attempt.id);
    expect(result.mapped).toBe(false);
    expect(result.node).toBeNull();
    expect(result.ability).toBeNull();
  });

  it("listMappedAttempts returns a strict same-order array for an attempt-id list", () => {
    const mappedA = insertMappedAttempt(db, nodeIdA, "2026-07-17T05:00:00.000Z");
    const unmapped = insertUnmappedAttempt(db, "2026-07-17T05:01:00.000Z");
    const mappedB = insertMappedAttempt(db, nodeIdB, "2026-07-17T05:02:00.000Z");
    upsertAbilitySnapshot(db, {
      learner_id: LOCAL_DEFAULT_LEARNER_ID,
      node_id: nodeIdA,
      visible_level: "L1",
      confidence: "low",
      evidence_count: 1,
      stale: false,
      input_fingerprint: fingerprint("batch-test-a"),
      projection_version: "v0-ability-projector-1",
      as_of_time: "2026-07-17T05:00:00.000Z",
    });
    upsertAbilitySnapshot(db, {
      learner_id: LOCAL_DEFAULT_LEARNER_ID,
      node_id: nodeIdB,
      visible_level: "L2",
      confidence: "medium",
      evidence_count: 2,
      stale: false,
      input_fingerprint: fingerprint("batch-test-b"),
      projection_version: "v0-ability-projector-1",
      as_of_time: "2026-07-17T05:02:00.000Z",
    });

    const result = listMappedAttempts(db, [mappedA.id, unmapped.id, mappedB.id]);
    expect(result).toHaveLength(3);
    expect(result[0]?.attemptId).toBe(mappedA.id);
    expect(result[0]?.mapped).toBe(true);
    expect(result[0]?.ability?.visibleLevel).toBe("L1");
    expect(result[1]?.attemptId).toBe(unmapped.id);
    expect(result[1]?.mapped).toBe(false);
    expect(result[2]?.attemptId).toBe(mappedB.id);
    expect(result[2]?.mapped).toBe(true);
    expect(result[2]?.ability?.visibleLevel).toBe("L2");
  });

  it("returns an empty array when the input list is empty", () => {
    expect(listMappedAttempts(db, [])).toEqual([]);
  });

  it("abilityLabel produces a stable terse label for every level + confidence", () => {
    const labels = [
      abilityLabel({ visibleLevel: "unassessed", confidence: "low" }),
      abilityLabel({ visibleLevel: "L1", confidence: "low" }),
      abilityLabel({ visibleLevel: "L2", confidence: "medium" }),
      abilityLabel({ visibleLevel: "L3", confidence: "high" }),
      abilityLabel({ visibleLevel: "L4", confidence: "high" }),
      abilityLabel({ visibleLevel: "L5", confidence: "high" }),
    ];
    expect(labels).toEqual([
      "unassessed (low)",
      "L1 (low)",
      "L2 (medium)",
      "L3 (high)",
      "L4 (high)",
      "L5 (high)",
    ]);
  });

  it("rejects an empty attemptId so the helper never silently succeeds", () => {
    expect(() => findMappedAttempt(db, "")).toThrow(RangeError);
  });
});