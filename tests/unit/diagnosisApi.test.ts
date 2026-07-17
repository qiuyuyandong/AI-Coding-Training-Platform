import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { openDatabase } from "@/lib/db/client";
import { applyMigrations } from "@/lib/db/migrations";

/**
 * HTTP contract tests for `POST /api/diagnosis`.
 *
 * The route handler expects the full migration set (0001–0007+) to
 * be applied; we use `applyMigrations` so the schema matches
 * production exactly. The V0 curriculum package is seeded manually so
 * the `applyStartingNodeOverride` path can validate `nodeId` against
 * a real `knowledge_nodes` row.
 */

let tempDir = "";

beforeEach(() => {
  tempDir = mkdtempSync(join(tmpdir(), "diagnosis-api-"));
  process.env.TRAINING_DB_PATH = join(tempDir, "test.sqlite");
  const db = openDatabase();
  try {
    applyMigrations(db, { now: () => "2026-07-17T00:00:00.000Z" });
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
    const stableIds = [
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
    ];
    stableIds.forEach((stableId, index) => {
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
    edges.forEach(([from, to], index) => {
      insertEdge.run(
        `edge_${index}`,
        `node_${from}`,
        `node_${to}`,
        "required_prerequisite",
      );
    });
  } finally {
    db.close();
  }
});

afterEach(() => {
  delete process.env.TRAINING_DB_PATH;
  rmSync(tempDir, { recursive: true, force: true });
});

function diagnosisRequest(
  body: Record<string, unknown>,
  options: { readonly origin?: string } = {},
): Request {
  const headers = new Headers({ "content-type": "application/json" });
  headers.set("origin", options.origin ?? "http://localhost");
  return new Request("http://localhost/api/diagnosis", {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
}

type PromptPayload = {
  readonly promptId: string;
  readonly title: string;
  readonly question: string;
  readonly coveredNodeStableIds: readonly string[];
};

function isPromptPayload(value: unknown): value is PromptPayload {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Record<string, unknown>;
  if (typeof candidate.promptId !== "string") return false;
  if (typeof candidate.title !== "string") return false;
  if (typeof candidate.question !== "string") return false;
  if (!Array.isArray(candidate.coveredNodeStableIds)) return false;
  return candidate.coveredNodeStableIds.every(
    (entry) => typeof entry === "string",
  );
}

describe("POST /api/diagnosis start", () => {
  it("creates a fresh session and returns the first prompt", async () => {
    const { POST } = await import("@/app/api/diagnosis/route");
    const response = await POST(diagnosisRequest({ action: "start" }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(typeof body.sessionId).toBe("string");
    expect(isPromptPayload(body.nextPrompt)).toBe(true);
    expect(body.nextPrompt.promptId).toBe("cpp-basics");
  });
});

describe("POST /api/diagnosis response", () => {
  it("records the response and returns the next prompt", async () => {
    const { POST } = await import("@/app/api/diagnosis/route");
    const start = await POST(diagnosisRequest({ action: "start" }));
    const startBody = await start.json();

    const response = await POST(
      diagnosisRequest({
        action: "response",
        sessionId: startBody.sessionId,
        promptId: "cpp-basics",
        response: "ready",
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(isPromptPayload(body.nextPrompt)).toBe(true);
    expect(body.nextPrompt.promptId).toBe("containers-functions");

    const db = openDatabase();
    try {
      const row = db
        .prepare<[string, string], { readonly response: string }>(
          `SELECT response
             FROM diagnostic_responses
            WHERE session_id = ? AND prompt_id = ?`,
        )
        .get(startBody.sessionId, "cpp-basics");
      expect(row?.response).toBe("ready");
    } finally {
      db.close();
    }
  });

  it("returns null nextPrompt when every prompt is answered", async () => {
    const { POST } = await import("@/app/api/diagnosis/route");
    const start = await POST(diagnosisRequest({ action: "start" }));
    const startBody = await start.json();
    const prompts = [
      "cpp-basics",
      "containers-functions",
      "debugging-testing",
      "git-build",
      "complexity-search-structures",
      "trees-graphs",
    ];
    for (const promptId of prompts) {
      const result = await POST(
        diagnosisRequest({
          action: "response",
          sessionId: startBody.sessionId,
          promptId,
          response: "ready",
        }),
      );
      expect(result.status).toBe(200);
    }
    // After six `ready` answers, the next response call should signal
    // completion by returning null nextPrompt (the previous call
    // already answered the last prompt).
    const final = await POST(
      diagnosisRequest({
        action: "response",
        sessionId: startBody.sessionId,
        promptId: "trees-graphs",
        response: "ready",
      }),
    );
    const body = await final.json();
    expect(final.status).toBe(200);
    expect(body.nextPrompt).toBeNull();
  });
});

describe("POST /api/diagnosis complete", () => {
  it("returns the computed baselines", async () => {
    const { POST } = await import("@/app/api/diagnosis/route");
    const start = await POST(diagnosisRequest({ action: "start" }));
    const startBody = await start.json();
    for (const promptId of [
      "cpp-basics",
      "containers-functions",
      "debugging-testing",
      "git-build",
      "complexity-search-structures",
      "trees-graphs",
    ]) {
      await POST(
        diagnosisRequest({
          action: "response",
          sessionId: startBody.sessionId,
          promptId,
          response: "ready",
        }),
      );
    }

    const response = await POST(
      diagnosisRequest({
        action: "complete",
        sessionId: startBody.sessionId,
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(Array.isArray(body.baselines)).toBe(true);
    expect(body.baselines).toHaveLength(12);
    for (const row of body.baselines) {
      expect(row.baseline).toBe("ready");
      expect(row.confidence).toBe("low");
      expect(row.source).toBe("diagnosis");
    }
  });
});

describe("POST /api/diagnosis override", () => {
  it("returns the override baselines for a published node", async () => {
    const { POST } = await import("@/app/api/diagnosis/route");
    const response = await POST(
      diagnosisRequest({
        action: "override",
        nodeId: "complexity-analysis",
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(Array.isArray(body.baselines)).toBe(true);
    expect(body.baselines).toHaveLength(7);
    const byNode = new Map<string, Record<string, unknown>>(
      (body.baselines as readonly Record<string, unknown>[]).map(
        (row) => [String(row.nodeId), row],
      ),
    );
    expect(byNode.get("complexity-analysis")?.baseline).toBe(
      "needs_foundation",
    );
    expect(byNode.get("complexity-analysis")?.source).toBe("manual_override");
    expect(byNode.get("cpp-io-types")?.baseline).toBe("ready");
    expect(byNode.get("cpp-io-types")?.source).toBe("manual_override");
  });
});

describe("POST /api/diagnosis validation", () => {
  it("returns 400 for an unknown action", async () => {
    const { POST } = await import("@/app/api/diagnosis/route");
    const response = await POST(diagnosisRequest({ action: "bogus" }));
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.ok).toBe(false);
    expect(typeof body.error).toBe("string");
  });

  it("returns 400 when required fields are missing", async () => {
    const { POST } = await import("@/app/api/diagnosis/route");
    const response = await POST(diagnosisRequest({ action: "response" }));
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.ok).toBe(false);
    expect(Array.isArray(body.issues)).toBe(true);
  });

  it("returns 400 when the response value is invalid", async () => {
    const { POST } = await import("@/app/api/diagnosis/route");
    const start = await POST(diagnosisRequest({ action: "start" }));
    const startBody = await start.json();
    const response = await POST(
      diagnosisRequest({
        action: "response",
        sessionId: startBody.sessionId,
        promptId: "cpp-basics",
        response: "expert",
      }),
    );
    expect(response.status).toBe(400);
  });

  it("returns 400 when the nodeId for override does not exist", async () => {
    const { POST } = await import("@/app/api/diagnosis/route");
    const response = await POST(
      diagnosisRequest({ action: "override", nodeId: "nope" }),
    );
    expect(response.status).toBe(400);
  });
});