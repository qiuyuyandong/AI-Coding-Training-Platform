import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import Database from "better-sqlite3";
import { z } from "zod";
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

const __mockDbHandle = vi.hoisted(() => ({
  current: null as Database.Database | null,
}));

vi.mock("@/lib/db/client", () => ({
  openDatabase: () => {
    if (__mockDbHandle.current === null) {
      throw new Error("openDatabase mock has no current connection");
    }
    const handle = __mockDbHandle.current;
    if (handle.open === false) {
      throw new Error("openDatabase mock connection is already closed");
    }
    return handle;
  },
}));

import { openDatabase as _openDatabaseImportForRuntime } from "@/lib/db/client";
import { applyMigrations } from "@/lib/db/migrations";
import { importPackage } from "@/lib/curriculum/importPackage";
import { LOCAL_DEFAULT_LEARNER_ID } from "@/lib/domain/learner";
import { getOrCreateLocalProfile } from "@/lib/repositories/learnerProfiles";
import {
  createLearningPlan,
  createDailySnapshot,
  insertPlanItem,
} from "@/lib/repositories/plans";

/**
 * V0 `POST /api/plans/items/[id]/complete` — opt-in AI reflection tests
 * (Todo 22). The route calls `requestReflectionQuestion` from
 * `lib/services/reflectionExperiment` only after the core SQLite
 * transaction commits and only when the request explicitly sets
 * `requestAiReflection: true`. The AI call is therefore completely
 * outside the SQLite transaction and cannot affect ability or plan
 * rows; a failure of the AI call must still return HTTP 200 with a
 * deterministic fallback question.
 *
 * The fixture keeps foreign keys enabled so the optional-AI path exercises
 * the same row-ID contract as production.
 */

void _openDatabaseImportForRuntime;

const SAMPLE_FIXTURE = join(
  process.cwd(),
  "tests",
  "fixtures",
  "curriculum",
  "sample-package",
);

const VALID_AI_ENV = {
  V0_AI_REFLECTION_ENABLED: "1",
  V0_AI_REFLECTION_URL: "https://example.test/v1/chat/completions",
  V0_AI_REFLECTION_MODEL: "test-reflection-model",
  V0_AI_REFLECTION_API_KEY: "sk-test-deterministic-key",
  V0_AI_REFLECTION_TIMEOUT_MS: "8000",
} as const;

type FetchCall = {
  readonly url: string;
  readonly init: { readonly method?: string } | undefined;
};

type FetchResponseLike = {
  readonly ok: boolean;
  readonly status: number;
  readonly text: () => Promise<string>;
};

type FetchSpyFn = (
  url: string,
  init?: { readonly method?: string },
) => Promise<FetchResponseLike>;

type FetchSpy = {
  readonly fn: FetchSpyFn;
  readonly calls: FetchCall[];
  readonly mock: ReturnType<typeof vi.fn>;
};

function makeFetchSpy(response: {
  readonly status?: number;
  readonly body?: string;
} = {}): FetchSpy {
  const status = response.status ?? 200;
  const body = response.body ?? JSON.stringify({
    choices: [
      {
        message: {
          content: JSON.stringify({
            question: "Which invariant would break first under a larger input?",
          }),
        },
      },
    ],
  });
  const calls: FetchCall[] = [];
  const implementation: FetchSpyFn = (
    url: string,
    init?: { readonly method?: string },
  ) => {
    calls.push({ url, init });
    return Promise.resolve({
      ok: status >= 200 && status < 300,
      status,
      text: () => Promise.resolve(body),
    });
  };
  const mock = vi.fn(implementation);
  const fn: FetchSpyFn = mock;
  return { fn, calls, mock };
}

let tempDir = "";
let primaryItemId = "";

function applyEnv(values: Partial<Record<keyof typeof VALID_AI_ENV, string | undefined>>): void {
  for (const key of Object.keys(VALID_AI_ENV) as ReadonlyArray<keyof typeof VALID_AI_ENV>) {
    const value = values[key];
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
}

function applyDisabledEnv(): void {
  applyEnv({ V0_AI_REFLECTION_ENABLED: "0" });
}

function applyValidEnv(): void {
  applyEnv(VALID_AI_ENV);
}

function clearEnv(): void {
  applyEnv({
    V0_AI_REFLECTION_ENABLED: undefined,
    V0_AI_REFLECTION_URL: undefined,
    V0_AI_REFLECTION_MODEL: undefined,
    V0_AI_REFLECTION_API_KEY: undefined,
    V0_AI_REFLECTION_TIMEOUT_MS: undefined,
  });
}

beforeEach(() => {
  tempDir = mkdtempSync(join(tmpdir(), "plan-complete-ai-"));
  const databasePath = join(tempDir, "complete-ai.sqlite");
  process.env.TRAINING_DB_PATH = databasePath;
  const db = new Database(databasePath);
  db.pragma("foreign_keys = ON");
  __mockDbHandle.current = db;
  try {
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
    const now = "2026-07-17T00:00:00.000Z";
    const plan = createLearningPlan(
      db,
      LOCAL_DEFAULT_LEARNER_ID,
      "v0-plan-generator-1",
      JSON.stringify({}),
      { now: () => now },
    );
    const snapshot = createDailySnapshot(
      db,
      plan.id,
      "2026-07-17",
      30,
      "learn",
      "v0-plan-generator-1",
      null,
      { now: () => now },
    );
    type IdRow = { readonly id: string };
    const task = db
      .prepare<[string], IdRow>(
        "SELECT id FROM practice_tasks WHERE stable_id = ? LIMIT 1",
      )
      .get("sample-task-a");
    const node = db
      .prepare<[string], IdRow>(
        "SELECT id FROM knowledge_nodes WHERE stable_id = ? LIMIT 1",
      )
      .get("sample-node-a");
    if (task === undefined || node === undefined) {
      throw new Error("Imported plan-item row IDs were not found");
    }
    const reasonCodes = JSON.stringify(["primary_first_pass"]);
    const item = insertPlanItem(
      db,
      snapshot.id,
      task.id,
      node.id,
      "primary",
      0,
      reasonCodes,
      { now: () => now },
    );
    primaryItemId = item.id;
  } finally {
    db.close();
    __mockDbHandle.current = null;
  }
  vi.spyOn(console, "log").mockImplementation(() => undefined);
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  clearEnv();
  delete process.env.TRAINING_DB_PATH;
  if (tempDir.length > 0) {
    rmSync(tempDir, { recursive: true, force: true });
  }
  tempDir = "";
  primaryItemId = "";
  __mockDbHandle.current = null;
});

const CompletionResponseSchema = z.object({
  ok: z.boolean(),
  replayed: z.boolean(),
  attemptId: z.string(),
  nodeId: z.string(),
  explanation: z.object({
    levelLabel: z.string(),
    confidenceLabel: z.string(),
  }),
  nextPlan: z.object({ planId: z.string(), snapshotId: z.string() }),
  aiReflection: z.object({
    source: z.enum(["ai", "fallback"]),
    question: z.string(),
  }).optional(),
});

type CompletionResponse = z.infer<typeof CompletionResponseSchema>;

function readResponseBody(text: string): CompletionResponse {
  const body: unknown = JSON.parse(text);
  return CompletionResponseSchema.parse(body);
}

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

async function postCompletion(body: Record<string, unknown>): Promise<{
  readonly status: number;
  readonly body: CompletionResponse;
  readonly raw: string;
}> {
  // The route closes its own database handle in a finally block; sharing
  // a single long-lived connection across the mock and the route means
  // the route reads back the rows that the bootstrap inserted.
  const ownedDb = new Database(process.env.TRAINING_DB_PATH ?? ":memory:");
  ownedDb.pragma("foreign_keys = ON");
  __mockDbHandle.current = ownedDb;
  try {
    const route = await import("@/app/api/plans/items/[id]/complete/route");
    const response = await route.POST(makeRequest(body), {
      params: Promise.resolve({ id: primaryItemId }),
    });
    const text = await response.text();
    return { status: response.status, body: readResponseBody(text), raw: text };
  } finally {
    ownedDb.close();
    __mockDbHandle.current = null;
  }
}

function stubFetch(spy: FetchSpy): void {
  vi.stubGlobal("fetch", spy.fn);
}

function openVerificationDatabase(): Database.Database {
  // Verify state with a fresh connection that matches what the mock
  // exposes to the route; the bootstrap closed its handle already.
  const db = new Database(process.env.TRAINING_DB_PATH ?? ":memory:");
  db.pragma("foreign_keys = ON");
  return db;
}

describe("POST /api/plans/items/[id]/complete with requestAiReflection", () => {
  it("makes zero outbound fetches when the opt-in is false", async () => {
    applyValidEnv();
    const fetchSpy = makeFetchSpy();
    stubFetch(fetchSpy);

    const { status, body } = await postCompletion({
      result: "passed",
      requestAiReflection: false,
    });

    expect(status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.replayed).toBe(false);
    expect(body.aiReflection).toBeUndefined();
    expect(fetchSpy.mock).not.toHaveBeenCalled();
    expect(fetchSpy.calls).toHaveLength(0);
  });

  it("makes zero outbound fetches when the opt-in is omitted entirely", async () => {
    applyValidEnv();
    const fetchSpy = makeFetchSpy();
    stubFetch(fetchSpy);

    const { status, body } = await postCompletion({
      result: "passed",
    });

    expect(status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.aiReflection).toBeUndefined();
    expect(fetchSpy.mock).not.toHaveBeenCalled();
    expect(fetchSpy.calls).toHaveLength(0);
  });

  it("returns 200 with the deterministic fallback when AI is disabled", async () => {
    applyDisabledEnv();
    const fetchSpy = makeFetchSpy();
    stubFetch(fetchSpy);

    const { status, body } = await postCompletion({
      result: "passed",
      requestAiReflection: true,
    });

    expect(status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.replayed).toBe(false);
    expect(body.aiReflection).toBeDefined();
    expect(body.aiReflection?.source).toBe("fallback");
    expect(body.aiReflection?.question).toBe(
      "What part of your approach would you reuse on a harder variant?",
    );
    expect(fetchSpy.mock).not.toHaveBeenCalled();
    expect(fetchSpy.calls).toHaveLength(0);

    const db = openVerificationDatabase();
    try {
      const trainingAttempts = db
        .prepare<[], { readonly c: number }>(
          "SELECT COUNT(*) AS c FROM training_attempts",
        )
        .get();
      expect(trainingAttempts?.c).toBe(1);
      const snapshots = db
        .prepare<[], { readonly c: number }>(
          "SELECT COUNT(*) AS c FROM daily_plan_snapshots",
        )
        .get();
      expect(snapshots?.c).toBeGreaterThanOrEqual(2);
    } finally {
      db.close();
    }
  });

  it("returns 200 with source 'ai' when the opt-in is true and the upstream returns a valid question", async () => {
    applyValidEnv();
    const fetchSpy = makeFetchSpy();
    stubFetch(fetchSpy);

    const { status, body } = await postCompletion({
      result: "passed",
      requestAiReflection: true,
    });

    expect(status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.aiReflection).toBeDefined();
    expect(body.aiReflection?.source).toBe("ai");
    expect(body.aiReflection?.question).toBe(
      "Which invariant would break first under a larger input?",
    );
    expect(fetchSpy.mock).toHaveBeenCalledTimes(1);
    expect(fetchSpy.calls).toHaveLength(1);
    const call = fetchSpy.calls[0];
    expect(call?.url).toBe(VALID_AI_ENV.V0_AI_REFLECTION_URL);
    expect(call?.init?.method).toBe("POST");
  });

  it("returns 200 with the fallback when the provider returns a 500 after a committed core success", async () => {
    applyValidEnv();
    const fetchSpy = makeFetchSpy({ status: 500, body: "internal" });
    stubFetch(fetchSpy);

    const { status, body } = await postCompletion({
      result: "failed",
      requestAiReflection: true,
    });

    expect(status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.aiReflection).toBeDefined();
    expect(body.aiReflection?.source).toBe("fallback");
    expect(body.aiReflection?.question).toBe(
      "What is the smallest failing assumption you can test next?",
    );
    expect(fetchSpy.mock).toHaveBeenCalledTimes(1);

    const db = openVerificationDatabase();
    try {
      const trainingAttempts = db
        .prepare<[], { readonly c: number }>(
          "SELECT COUNT(*) AS c FROM training_attempts",
        )
        .get();
      expect(trainingAttempts?.c).toBe(1);
    } finally {
      db.close();
    }
  });
});
