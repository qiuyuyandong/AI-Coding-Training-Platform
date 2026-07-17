import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import Database from "better-sqlite3";
import { applyMigrations } from "@/lib/db/migrations";
import { importPackage } from "@/lib/curriculum/importPackage";
import {
  buildMapIndex,
  findActiveCurriculumPackageId,
} from "@/app/map/page";
import { buildNodeDetail } from "@/app/map/[nodeId]/page";
import {
  listCareerTracks,
  listKnowledgeEdges,
  listPublishedKnowledgeNodes,
} from "@/lib/repositories/curriculum";
import {
  findLearningResourceByNode,
  listPracticeTasksForNode,
} from "@/lib/repositories/resources";

/**
 * Integration tests for the V0 `/map` page payloads.
 *
 * The map page (Todo 17) ships two server components backed by two pure
 * payload builders. This file verifies that those builders, when fed a
 * real migrated SQLite database with the canonical sample-package
 * fixture imported, return the exact shape the React components
 * consume. A separate test asserts the repository surface used by the
 * page renders the documented columns.
 */

const SAMPLE_FIXTURE = join(
  process.cwd(),
  "tests",
  "fixtures",
  "curriculum",
  "sample-package",
);

function openImportedDb(): { db: Database.Database; tmp: string } {
  const tmp = mkdtempSync(join(tmpdir(), "map-page-test-"));
  const db = new Database(join(tmp, "test.sqlite"));
  applyMigrations(db);
  const result = importPackage(db, SAMPLE_FIXTURE);
  if (!result.ok) {
    db.close();
    rmSync(tmp, { recursive: true, force: true });
    throw new Error(
      `failed to import sample fixture: ${result.errors.map((e) => e.code).join(", ")}`,
    );
  }
  return { db, tmp };
}

describe("curriculum repositories used by /map", () => {
  let db: Database.Database | undefined;
  let tmp: string | undefined;

  afterEach(() => {
    if (db !== undefined) {
      db.close();
      db = undefined;
    }
    if (tmp !== undefined) {
      try {
        rmSync(tmp, { recursive: true, force: true });
      } catch {
        /* ignore */
      }
      tmp = undefined;
    }
  });

  it("returns the documented columns for published nodes, edges, and tracks", () => {
    const opened = openImportedDb();
    db = opened.db;
    tmp = opened.tmp;
    const packageId = "pkg_sample-package_1_0_0";

    const nodes = listPublishedKnowledgeNodes(db, packageId);
    expect(nodes.length).toBe(2);
    expect(Object.keys(nodes[0]).sort()).toEqual(
      [
        "id",
        "order_index",
        "outcome",
        "package_id",
        "provenance_json",
        "rationale",
        "stable_id",
        "status",
        "title",
      ].sort(),
    );
    expect(nodes[0].stable_id).toBe("sample-node-a");
    expect(nodes[0].order_index).toBe(1);
    expect(nodes[0].status).toBe("published");

    const edges = listKnowledgeEdges(db, packageId);
    expect(edges.length).toBe(1);
    expect(edges[0].edge_type).toBe("required_prerequisite");

    const tracks = listCareerTracks(db, packageId);
    expect(tracks.length).toBe(9);
    expect(Object.keys(tracks[0]).sort()).toEqual(
      [
        "id",
        "name",
        "package_id",
        "slug",
        "status",
        "summary",
      ].sort(),
    );
    expect(typeof tracks[0].summary).toBe("string");
  });

  it("returns a reviewed primary resource and a primary practice task for sample-node-a", () => {
    const opened = openImportedDb();
    db = opened.db;
    tmp = opened.tmp;

    const nodes = listPublishedKnowledgeNodes(db, "pkg_sample-package_1_0_0");
    const nodeA = nodes.find((row) => row.stable_id === "sample-node-a");
    expect(nodeA).toBeDefined();

    const resource = findLearningResourceByNode(db, nodeA?.id ?? "");
    expect(resource).not.toBeNull();
    expect(resource?.review_status).toBe("reviewed");
    expect(resource?.title).toBe("Sample Resource A");

    const tasks = listPracticeTasksForNode(db, nodeA?.id ?? "");
    expect(tasks.length).toBe(1);
    expect(tasks[0].difficulty_band).toBe("intro");
  });
});

describe("buildMapIndex", () => {
  let db: Database.Database | undefined;
  let tmp: string | undefined;

  afterEach(() => {
    if (db !== undefined) {
      db.close();
      db = undefined;
    }
    if (tmp !== undefined) {
      try {
        rmSync(tmp, { recursive: true, force: true });
      } catch {
        /* ignore */
      }
      tmp = undefined;
    }
  });

  it("returns the available payload with nine directions, two nodes, one edge", () => {
    const opened = openImportedDb();
    db = opened.db;
    tmp = opened.tmp;

    const packageId = findActiveCurriculumPackageId(db);
    expect(packageId).toBe("pkg_sample-package_1_0_0");

    const payload = buildMapIndex(db);
    expect(payload.status).toBe("available");
    expect(payload.packageId).toBe("pkg_sample-package_1_0_0");
    expect(payload.directions.length).toBe(9);
    for (const direction of payload.directions) {
      expect(direction.slug.length).toBeGreaterThan(0);
      expect(direction.name.length).toBeGreaterThan(0);
      expect(direction.purpose.length).toBeGreaterThan(0);
      expect(direction.unavailableInV0).toBe(true);
    }

    expect(payload.nodes.length).toBe(2);
    expect(payload.nodes.map((node) => node.stableId).sort()).toEqual([
      "sample-node-a",
      "sample-node-b",
    ]);
    expect(payload.nodes[0].detailHref).toBe("/map/sample-node-a");
    expect(payload.nodes[1].detailHref).toBe("/map/sample-node-b");

    expect(payload.edges.length).toBe(1);
    expect(payload.edges[0]).toEqual({
      fromStableId: "sample-node-a",
      toStableId: "sample-node-b",
      edgeType: "required_prerequisite",
    });
  });

  it("returns an empty payload when no curriculum package is installed", () => {
    const tmpEmpty = mkdtempSync(join(tmpdir(), "map-page-empty-"));
    const emptyDb = new Database(join(tmpEmpty, "test.sqlite"));
    try {
      applyMigrations(emptyDb);
      const payload = buildMapIndex(emptyDb);
      expect(payload.status).toBe("empty");
      expect(payload.directions).toEqual([]);
      expect(payload.nodes).toEqual([]);
      expect(payload.edges).toEqual([]);
      expect(findActiveCurriculumPackageId(emptyDb)).toBeNull();
    } finally {
      emptyDb.close();
      rmSync(tmpEmpty, { recursive: true, force: true });
    }
  });
});

describe("buildNodeDetail", () => {
  let db: Database.Database | undefined;
  let tmp: string | undefined;

  afterEach(() => {
    if (db !== undefined) {
      db.close();
      db = undefined;
    }
    if (tmp !== undefined) {
      try {
        rmSync(tmp, { recursive: true, force: true });
      } catch {
        /* ignore */
      }
      tmp = undefined;
    }
  });

  it("returns the available payload for a published node with prerequisites, resource and practice", () => {
    const opened = openImportedDb();
    db = opened.db;
    tmp = opened.tmp;

    const payload = buildNodeDetail(db, "sample-node-b");
    expect(payload.status).toBe("available");
    if (payload.status !== "available") return;

    expect(payload.node.stableId).toBe("sample-node-b");
    expect(payload.node.title).toBe("Sample Node B");
    expect(payload.node.orderIndex).toBe(2);
    expect(payload.node.status).toBe("published");
    expect(payload.node.provenance.authority).toBe("Sample Authority");
    expect(payload.node.provenance.url).toBe("https://example.com/sample-b");

    expect(payload.prerequisites).toEqual(["sample-node-a"]);

    expect(payload.resource).not.toBeNull();
    expect(payload.resource?.title).toBe("Sample Resource B");
    expect(payload.resource?.reviewStatus).toBe("reviewed");
    expect(payload.resource?.access).toBe("open");

    expect(payload.practice).not.toBeNull();
    expect(payload.practice?.title).toBe("Practice Task B");
    expect(payload.practice?.difficultyBand).toBe("easy");
    expect(payload.practice?.primarySource?.platform).toBe("atcoder");
    expect(payload.practice?.primarySource?.url).toBe(
      "https://atcoder.jp/contests/abc086/tasks/abc086_a",
    );
    expect(payload.practice?.primarySource?.isPrimary).toBe(true);

    // The fixture has no ability_snapshots rows.
    expect(payload.ability).toBeNull();
  });

  it("returns an empty prerequisite list for a root node", () => {
    const opened = openImportedDb();
    db = opened.db;
    tmp = opened.tmp;

    const payload = buildNodeDetail(db, "sample-node-a");
    expect(payload.status).toBe("available");
    if (payload.status !== "available") return;
    expect(payload.prerequisites).toEqual([]);
    expect(payload.node.orderIndex).toBe(1);
  });

  it("returns the unknown-node payload for an unknown stable id", () => {
    const opened = openImportedDb();
    db = opened.db;
    tmp = opened.tmp;

    const payload = buildNodeDetail(db, "does-not-exist");
    expect(payload.status).toBe("unknown-node");
    if (payload.status === "unknown-node") {
      expect(payload.requestedNodeId).toBe("does-not-exist");
    }
  });

  it("returns the missing-package payload when no package is installed", () => {
    const tmpEmpty = mkdtempSync(join(tmpdir(), "map-page-empty-"));
    const emptyDb = new Database(join(tmpEmpty, "test.sqlite"));
    try {
      applyMigrations(emptyDb);
      const payload = buildNodeDetail(emptyDb, "sample-node-a");
      expect(payload.status).toBe("missing-package");
    } finally {
      emptyDb.close();
      rmSync(tmpEmpty, { recursive: true, force: true });
    }
  });
});