# Phase 2.2 Training Records Loop Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convert local browser capture events into idempotent `training_attempts`, then expose recent attempt status to Training, Coach, and Growth pages.

**Architecture:** The capture API remains the boundary: it validates and saves `CaptureEvent`, then calls a small materializer service inside the same database transaction. The materializer uses repository helpers to create/reuse draft attempts, update attempts from verdict events, and store `source_event_id` for idempotency. UI additions are intentionally minimal: Training shows recent attempt state, Coach/Growth show real attempt-derived summaries or explicit empty states.

**Tech Stack:** Next.js App Router, TypeScript strict mode, Zod, better-sqlite3, SQLite migrations, Vitest, React server/client components.

---

## File Structure

Create or modify these files:

```text
lib/db/migrations/0002_attempt_capture_source.sql     # add source_event_id and indexes for idempotent materialization
lib/domain/training.ts                                # new TrainingAttempt schema and result union
lib/repositories/attempts.ts                          # new attempt repository helpers
lib/services/captureMaterializer.ts                   # new event-to-attempt service
app/api/capture/events/route.ts                       # call materializer after saving capture event
app/api/attempts/recent/route.ts                      # new recent attempts endpoint for UI panels
components/AttemptStatusPanel.tsx                     # new client panel for Training page
components/TrainingWorkspace.tsx                      # render AttemptStatusPanel beside CaptureStatusPanel
app/coach/page.tsx                                    # show minimal attempt-based coach summary
app/growth/page.tsx                                   # show minimal attempt-based growth summary
README.md                                            # document Phase 2.2 local training loop behavior
COMPLIANCE.md                                        # document capture-to-attempt local-only boundary
```

Do not add LLM, Playwright/CDP companion, code execution, full statement capture, or remote sync in this phase.

---

## Task 1: Migration and TrainingAttempt Domain

**Files:**
- Create: `lib/db/migrations/0002_attempt_capture_source.sql`
- Create: `lib/domain/training.ts`
- Test: `tests/unit/captureEvents.test.ts`

- [ ] **Step 1: Add converter tests for accepted, failed, unknown, and language payloads**

Edit `tests/unit/captureEvents.test.ts` so it includes these cases:

```ts
import { describe, expect, it } from "vitest";
import { pageDetectedEventToAttemptDraft, submissionEventToAttemptUpdate, type CaptureEvent } from "@/lib/capture/events";

function event(overrides: Partial<CaptureEvent> = {}): CaptureEvent {
  return {
    id: "evt_1",
    type: "PAGE_DETECTED",
    platform: "leetcode",
    problemExternalId: "two-sum",
    problemTitle: "Two Sum",
    canonicalUrl: "https://leetcode.com/problems/two-sum/",
    occurredAt: "2026-07-06T00:00:00.000Z",
    payload: {},
    ...overrides,
  };
}

describe("capture event attempt conversion", () => {
  it("creates attempt drafts from page detection events", () => {
    const draft = pageDetectedEventToAttemptDraft(event());

    expect(draft).toEqual({
      result: "draft",
      platform: "leetcode",
      problemExternalId: "two-sum",
      problemTitle: "Two Sum",
      canonicalUrl: "https://leetcode.com/problems/two-sum/",
      startedAt: "2026-07-06T00:00:00.000Z",
    });
  });

  it("marks accepted verdicts as passed", () => {
    const update = submissionEventToAttemptUpdate(event({ type: "VERDICT_UPDATED", payload: { verdict: "Accepted", language: "TypeScript" } }));

    expect(update).toEqual({ result: "passed", verdict: "Accepted", language: "TypeScript", endedAt: "2026-07-06T00:00:00.000Z" });
  });

  it("marks non-accepted verdicts as failed", () => {
    const update = submissionEventToAttemptUpdate(event({ type: "SUBMISSION_DETECTED", payload: { verdict: "Wrong Answer" } }));

    expect(update).toEqual({ result: "failed", verdict: "Wrong Answer", endedAt: "2026-07-06T00:00:00.000Z" });
  });

  it("uses Unknown when a verdict payload is missing", () => {
    const update = submissionEventToAttemptUpdate(event({ type: "VERDICT_UPDATED", payload: {} }));

    expect(update).toEqual({ result: "failed", verdict: "Unknown", endedAt: "2026-07-06T00:00:00.000Z" });
  });
});
```

- [ ] **Step 2: Run converter tests**

Run:

```powershell
npm run test -- tests/unit/captureEvents.test.ts
```

Expected: tests pass or fail only because existing tests need import consolidation. Fix only this test file if needed.

- [ ] **Step 3: Add migration for source event idempotency**

Create `lib/db/migrations/0002_attempt_capture_source.sql`:

```sql
ALTER TABLE training_attempts ADD COLUMN source_event_id TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_training_attempts_source_event_id
  ON training_attempts(source_event_id)
  WHERE source_event_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_training_attempts_problem_open
  ON training_attempts(platform, problem_external_id, result, updated_at);
```

This migration is intentionally additive so existing `0001_initial.sql` databases migrate safely.

- [ ] **Step 4: Add TrainingAttempt domain schema**

Create `lib/domain/training.ts`:

```ts
import { z } from "zod";
import { PlatformSchema } from "./source";

export const AttemptResultSchema = z.enum(["draft", "passed", "failed", "partial", "stuck"]);
export type AttemptResult = z.infer<typeof AttemptResultSchema>;

export const TrainingAttemptSchema = z.object({
  id: z.string().min(1),
  platform: PlatformSchema,
  problemExternalId: z.string().min(1),
  problemTitle: z.string().min(1),
  canonicalUrl: z.string().url(),
  startedAt: z.string().datetime(),
  endedAt: z.string().datetime().optional(),
  result: AttemptResultSchema,
  verdict: z.string().optional(),
  language: z.string().optional(),
  durationMinutes: z.number().int().nonnegative().optional(),
  reflection: z.string().optional(),
  sourceEventId: z.string().min(1).optional(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export type TrainingAttempt = z.infer<typeof TrainingAttemptSchema>;
```

- [ ] **Step 5: Verify Task 1**

Run:

```powershell
npm run db:migrate
npm run test -- tests/unit/captureEvents.test.ts
npm run typecheck
```

Expected: migration applies, tests pass, typecheck exits 0.

- [ ] **Step 6: Commit Task 1**

```powershell
$env:GIT_MASTER='1'; git add lib/db/migrations/0002_attempt_capture_source.sql lib/domain/training.ts tests/unit/captureEvents.test.ts
$env:GIT_MASTER='1'; git commit -m "Add training attempt capture schema" -m "Ultraworked with [Sisyphus](https://github.com/code-yeongyu/oh-my-openagent)" -m "Co-authored-by: Sisyphus <clio-agent@sisyphuslabs.ai>"
```

---

## Task 2: Attempt Repository and Materializer

**Files:**
- Create: `lib/repositories/attempts.ts`
- Create: `lib/services/captureMaterializer.ts`
- Create: `tests/unit/captureMaterializer.test.ts`

- [ ] **Step 1: Write materializer tests**

Create `tests/unit/captureMaterializer.test.ts`:

```ts
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";
import { describe, expect, it } from "vitest";
import type { CaptureEvent } from "@/lib/capture/events";
import { materializeCaptureEvent } from "@/lib/services/captureMaterializer";

function openTestDatabase(): Database.Database {
  const db = new Database(join(mkdtempSync(join(tmpdir(), "training-loop-")), "test.sqlite"));
  db.exec(`
    CREATE TABLE training_attempts (
      id TEXT PRIMARY KEY,
      platform TEXT NOT NULL,
      problem_external_id TEXT NOT NULL,
      problem_title TEXT NOT NULL,
      canonical_url TEXT NOT NULL,
      started_at TEXT NOT NULL,
      ended_at TEXT,
      result TEXT NOT NULL,
      verdict TEXT,
      language TEXT,
      duration_minutes INTEGER,
      reflection TEXT,
      source_event_id TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE UNIQUE INDEX idx_training_attempts_source_event_id
      ON training_attempts(source_event_id)
      WHERE source_event_id IS NOT NULL;
    CREATE INDEX idx_training_attempts_problem_open
      ON training_attempts(platform, problem_external_id, result, updated_at);
  `);
  return db;
}

function event(overrides: Partial<CaptureEvent> = {}): CaptureEvent {
  return {
    id: "evt_1",
    type: "PAGE_DETECTED",
    platform: "leetcode",
    problemExternalId: "two-sum",
    problemTitle: "Two Sum",
    canonicalUrl: "https://leetcode.com/problems/two-sum/",
    occurredAt: "2026-07-06T00:00:00.000Z",
    payload: {},
    ...overrides,
  };
}

describe("materializeCaptureEvent", () => {
  it("creates a draft attempt from PAGE_DETECTED", () => {
    const db = openTestDatabase();
    try {
      const result = materializeCaptureEvent(db, event());

      expect(result).toEqual({ attemptId: result.attemptId, attemptStatus: "draft" });
      expect(db.prepare("SELECT COUNT(*) AS count FROM training_attempts").get()).toEqual({ count: 1 });
    } finally {
      db.close();
    }
  });

  it("reuses an open draft for repeated page detection", () => {
    const db = openTestDatabase();
    try {
      const first = materializeCaptureEvent(db, event({ id: "evt_1" }));
      const second = materializeCaptureEvent(db, event({ id: "evt_2" }));

      expect(second.attemptId).toBe(first.attemptId);
      expect(db.prepare("SELECT COUNT(*) AS count FROM training_attempts").get()).toEqual({ count: 1 });
    } finally {
      db.close();
    }
  });

  it("updates an open draft from a verdict event", () => {
    const db = openTestDatabase();
    try {
      const draft = materializeCaptureEvent(db, event({ id: "evt_1" }));
      const completed = materializeCaptureEvent(db, event({ id: "evt_2", type: "VERDICT_UPDATED", payload: { verdict: "Accepted", language: "TypeScript" } }));

      expect(completed).toEqual({ attemptId: draft.attemptId, attemptStatus: "passed" });
      expect(db.prepare("SELECT result, verdict, language FROM training_attempts").get()).toEqual({ result: "passed", verdict: "Accepted", language: "TypeScript" });
    } finally {
      db.close();
    }
  });

  it("creates and completes an attempt when verdict arrives before a draft", () => {
    const db = openTestDatabase();
    try {
      const completed = materializeCaptureEvent(db, event({ id: "evt_1", type: "SUBMISSION_DETECTED", payload: { verdict: "Wrong Answer" } }));

      expect(completed.attemptStatus).toBe("failed");
      expect(db.prepare("SELECT COUNT(*) AS count FROM training_attempts WHERE result = 'failed'").get()).toEqual({ count: 1 });
    } finally {
      db.close();
    }
  });

  it("does not duplicate attempts for the same source event", () => {
    const db = openTestDatabase();
    try {
      const first = materializeCaptureEvent(db, event({ id: "evt_1" }));
      const second = materializeCaptureEvent(db, event({ id: "evt_1" }));

      expect(second).toEqual(first);
      expect(db.prepare("SELECT COUNT(*) AS count FROM training_attempts").get()).toEqual({ count: 1 });
    } finally {
      db.close();
    }
  });
});
```

- [ ] **Step 2: Run materializer tests and confirm red**

Run:

```powershell
npm run test -- tests/unit/captureMaterializer.test.ts
```

Expected: FAIL because `@/lib/services/captureMaterializer` does not exist.

- [ ] **Step 3: Add attempt repository helpers**

Create `lib/repositories/attempts.ts`:

```ts
import type Database from "better-sqlite3";
import { TrainingAttemptSchema, type AttemptResult, type TrainingAttempt } from "@/lib/domain/training";

type AttemptRow = {
  readonly id: string;
  readonly platform: string;
  readonly problem_external_id: string;
  readonly problem_title: string;
  readonly canonical_url: string;
  readonly started_at: string;
  readonly ended_at: string | null;
  readonly result: string;
  readonly verdict: string | null;
  readonly language: string | null;
  readonly duration_minutes: number | null;
  readonly reflection: string | null;
  readonly source_event_id: string | null;
  readonly created_at: string;
  readonly updated_at: string;
};

export type CreateDraftAttemptInput = {
  readonly id: string;
  readonly platform: TrainingAttempt["platform"];
  readonly problemExternalId: string;
  readonly problemTitle: string;
  readonly canonicalUrl: string;
  readonly startedAt: string;
  readonly sourceEventId: string;
  readonly now: string;
};

export type CompleteAttemptInput = {
  readonly attemptId: string;
  readonly result: Exclude<AttemptResult, "draft">;
  readonly verdict: string;
  readonly language?: string;
  readonly endedAt: string;
  readonly sourceEventId: string;
  readonly now: string;
};

function fromRow(row: AttemptRow): TrainingAttempt {
  return TrainingAttemptSchema.parse({
    id: row.id,
    platform: row.platform,
    problemExternalId: row.problem_external_id,
    problemTitle: row.problem_title,
    canonicalUrl: row.canonical_url,
    startedAt: row.started_at,
    endedAt: row.ended_at ?? undefined,
    result: row.result,
    verdict: row.verdict ?? undefined,
    language: row.language ?? undefined,
    durationMinutes: row.duration_minutes ?? undefined,
    reflection: row.reflection ?? undefined,
    sourceEventId: row.source_event_id ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  });
}

export function findAttemptBySourceEventId(db: Database.Database, sourceEventId: string): TrainingAttempt | null {
  const row = db.prepare<string, AttemptRow>("SELECT * FROM training_attempts WHERE source_event_id = ?").get(sourceEventId);
  return row === undefined ? null : fromRow(row);
}

export function findOpenAttemptByProblem(db: Database.Database, platform: string, problemExternalId: string): TrainingAttempt | null {
  const row = db
    .prepare<[string, string], AttemptRow>(`
      SELECT * FROM training_attempts
      WHERE platform = ? AND problem_external_id = ? AND result = 'draft'
      ORDER BY updated_at DESC
      LIMIT 1
    `)
    .get(platform, problemExternalId);
  return row === undefined ? null : fromRow(row);
}

export function createDraftAttemptFromCapture(db: Database.Database, input: CreateDraftAttemptInput): TrainingAttempt {
  db.prepare(`
    INSERT INTO training_attempts (
      id, platform, problem_external_id, problem_title, canonical_url, started_at,
      result, source_event_id, created_at, updated_at
    ) VALUES (
      @id, @platform, @problemExternalId, @problemTitle, @canonicalUrl, @startedAt,
      'draft', @sourceEventId, @now, @now
    )
  `).run(input);
  return findAttemptBySourceEventId(db, input.sourceEventId) ?? findOpenAttemptByProblem(db, input.platform, input.problemExternalId) ?? failAttemptLookup(input.id);
}

export function updateAttemptFromCapture(db: Database.Database, input: CompleteAttemptInput): TrainingAttempt {
  db.prepare(`
    UPDATE training_attempts
    SET result = @result,
        verdict = @verdict,
        language = @language,
        ended_at = @endedAt,
        source_event_id = @sourceEventId,
        updated_at = @now
    WHERE id = @attemptId
  `).run({ ...input, language: input.language ?? null });
  const row = db.prepare<string, AttemptRow>("SELECT * FROM training_attempts WHERE id = ?").get(input.attemptId);
  return row === undefined ? failAttemptLookup(input.attemptId) : fromRow(row);
}

export function listRecentAttempts(db: Database.Database, limit = 10): TrainingAttempt[] {
  const rows = db.prepare<number, AttemptRow>("SELECT * FROM training_attempts ORDER BY updated_at DESC LIMIT ?").all(limit);
  return rows.map(fromRow);
}

function failAttemptLookup(id: string): never {
  throw new Error(`Training attempt not found after write: ${id}`);
}
```

- [ ] **Step 4: Add capture materializer service**

Create `lib/services/captureMaterializer.ts`:

```ts
import type Database from "better-sqlite3";
import { pageDetectedEventToAttemptDraft, submissionEventToAttemptUpdate, type CaptureEvent } from "@/lib/capture/events";
import {
  createDraftAttemptFromCapture,
  findAttemptBySourceEventId,
  findOpenAttemptByProblem,
  updateAttemptFromCapture,
} from "@/lib/repositories/attempts";
import type { AttemptResult } from "@/lib/domain/training";

export type MaterializedAttemptResult = {
  readonly attemptId?: string;
  readonly attemptStatus?: AttemptResult;
};

export function materializeCaptureEvent(db: Database.Database, event: CaptureEvent): MaterializedAttemptResult {
  const existing = findAttemptBySourceEventId(db, event.id);
  if (existing !== null) return { attemptId: existing.id, attemptStatus: existing.result };

  if (event.type === "PAGE_DETECTED" || event.type === "TRAINING_STARTED") {
    const draft = pageDetectedEventToAttemptDraft(event);
    const open = findOpenAttemptByProblem(db, draft.platform, draft.problemExternalId);
    if (open !== null) return { attemptId: open.id, attemptStatus: open.result };

    const attempt = createDraftAttemptFromCapture(db, {
      id: `attempt_${event.id}`,
      platform: draft.platform,
      problemExternalId: draft.problemExternalId,
      problemTitle: draft.problemTitle,
      canonicalUrl: draft.canonicalUrl,
      startedAt: draft.startedAt,
      sourceEventId: event.id,
      now: new Date().toISOString(),
    });
    return { attemptId: attempt.id, attemptStatus: attempt.result };
  }

  if (event.type === "SUBMISSION_DETECTED" || event.type === "VERDICT_UPDATED") {
    const update = submissionEventToAttemptUpdate(event);
    const draft = pageDetectedEventToAttemptDraft(event);
    const open = findOpenAttemptByProblem(db, draft.platform, draft.problemExternalId);
    const attempt =
      open ??
      createDraftAttemptFromCapture(db, {
        id: `attempt_${event.id}`,
        platform: draft.platform,
        problemExternalId: draft.problemExternalId,
        problemTitle: draft.problemTitle,
        canonicalUrl: draft.canonicalUrl,
        startedAt: draft.startedAt,
        sourceEventId: `${event.id}:draft`,
        now: new Date().toISOString(),
      });
    const completed = updateAttemptFromCapture(db, { attemptId: attempt.id, ...update, sourceEventId: event.id, now: new Date().toISOString() });
    return { attemptId: completed.id, attemptStatus: completed.result };
  }

  if (event.type === "TRAINING_ENDED") {
    const draft = pageDetectedEventToAttemptDraft(event);
    const open = findOpenAttemptByProblem(db, draft.platform, draft.problemExternalId);
    if (open === null) return {};
    const completed = updateAttemptFromCapture(db, {
      attemptId: open.id,
      result: "stuck",
      verdict: "Training ended",
      endedAt: event.occurredAt,
      sourceEventId: event.id,
      now: new Date().toISOString(),
    });
    return { attemptId: completed.id, attemptStatus: completed.result };
  }

  return {};
}
```

- [ ] **Step 5: Run materializer tests**

Run:

```powershell
npm run test -- tests/unit/captureMaterializer.test.ts
npm run typecheck
```

Expected: materializer tests pass and typecheck exits 0.

- [ ] **Step 6: Commit Task 2**

```powershell
$env:GIT_MASTER='1'; git add lib/repositories/attempts.ts lib/services/captureMaterializer.ts tests/unit/captureMaterializer.test.ts
$env:GIT_MASTER='1'; git commit -m "Add capture attempt materializer" -m "Ultraworked with [Sisyphus](https://github.com/code-yeongyu/oh-my-openagent)" -m "Co-authored-by: Sisyphus <clio-agent@sisyphuslabs.ai>"
```

---

## Task 3: Capture API Integration and Recent Attempts Endpoint

**Files:**
- Modify: `app/api/capture/events/route.ts`
- Create: `app/api/attempts/recent/route.ts`
- Modify: `tests/unit/captureApi.test.ts`

- [ ] **Step 1: Extend capture API tests**

Add tests to `tests/unit/captureApi.test.ts` covering:

```ts
it("creates a draft attempt for valid PAGE_DETECTED events", async () => {
  const response = await POST(requestWithEvent(event({ id: "evt_page", type: "PAGE_DETECTED" })));
  const body = await response.json();

  expect(response.status).toBe(200);
  expect(body.ok).toBe(true);
  expect(body.eventId).toBe("evt_page");
  expect(body.attemptStatus).toBe("draft");
});

it("updates the draft attempt for verdict events", async () => {
  await POST(requestWithEvent(event({ id: "evt_page", type: "PAGE_DETECTED" })));
  const response = await POST(requestWithEvent(event({ id: "evt_verdict", type: "VERDICT_UPDATED", payload: { verdict: "Accepted" } })));
  const body = await response.json();

  expect(response.status).toBe(200);
  expect(body.attemptStatus).toBe("passed");
});
```

Use the existing helper style in the file. If the file currently lacks `requestWithEvent`, define it locally as:

```ts
function requestWithEvent(event: CaptureEvent): Request {
  return new Request("http://localhost/api/capture/events", { method: "POST", body: JSON.stringify(event) });
}
```

- [ ] **Step 2: Run capture API tests and confirm red**

Run:

```powershell
npm run test -- tests/unit/captureApi.test.ts
```

Expected: FAIL because the API does not call the materializer or include attempt fields yet.

- [ ] **Step 3: Integrate materializer in capture API**

Modify `app/api/capture/events/route.ts` so the success path is:

```ts
const db = openDatabase();
try {
  const result = db.transaction(() => {
    saveCaptureEvent(db, parsed.data);
    return materializeCaptureEvent(db, parsed.data);
  })();
  return NextResponse.json({ ok: true, eventId: parsed.data.id, ...result });
} catch (error) {
  return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Failed to save capture event" }, { status: 500 });
} finally {
  db.close();
}
```

Import `materializeCaptureEvent` from `@/lib/services/captureMaterializer`.

- [ ] **Step 4: Add recent attempts route**

Create `app/api/attempts/recent/route.ts`:

```ts
import { NextResponse } from "next/server";
import { openDatabase } from "@/lib/db/client";
import { listRecentAttempts } from "@/lib/repositories/attempts";

export async function GET() {
  const db = openDatabase();
  try {
    const recentAttempts = listRecentAttempts(db, 10);
    return NextResponse.json({ ok: true, recentAttempts });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Failed to read recent attempts", recentAttempts: [] },
      { status: 500 },
    );
  } finally {
    db.close();
  }
}
```

- [ ] **Step 5: Verify Task 3**

Run:

```powershell
npm run test -- tests/unit/captureApi.test.ts tests/unit/captureMaterializer.test.ts
npm run typecheck
```

Expected: tests pass and typecheck exits 0.

- [ ] **Step 6: Commit Task 3**

```powershell
$env:GIT_MASTER='1'; git add app/api/capture/events/route.ts app/api/attempts/recent/route.ts tests/unit/captureApi.test.ts
$env:GIT_MASTER='1'; git commit -m "Materialize capture events into attempts" -m "Ultraworked with [Sisyphus](https://github.com/code-yeongyu/oh-my-openagent)" -m "Co-authored-by: Sisyphus <clio-agent@sisyphuslabs.ai>"
```

---

## Task 4: Training, Coach, and Growth Attempt Feedback

**Files:**
- Create: `components/AttemptStatusPanel.tsx`
- Modify: `components/TrainingWorkspace.tsx`
- Modify: `app/coach/page.tsx`
- Modify: `app/growth/page.tsx`

- [ ] **Step 1: Add AttemptStatusPanel**

Create `components/AttemptStatusPanel.tsx`:

```tsx
"use client";

import { useEffect, useState } from "react";
import type { TrainingAttempt } from "@/lib/domain/training";

type AttemptsResponse = {
  readonly ok: boolean;
  readonly recentAttempts: readonly TrainingAttempt[];
  readonly error?: string;
};

export function AttemptStatusPanel() {
  const [state, setState] = useState<AttemptsResponse>({ ok: true, recentAttempts: [] });

  useEffect(() => {
    let cancelled = false;

    async function loadAttempts(): Promise<void> {
      try {
        const response = await fetch("/api/attempts/recent", { cache: "no-store" });
        const body: AttemptsResponse = await response.json();
        if (!cancelled) setState(body);
      } catch (error) {
        if (!cancelled) {
          setState({ ok: false, recentAttempts: [], error: error instanceof Error ? error.message : "Failed to load attempts" });
        }
      }
    }

    void loadAttempts();
    const id = window.setInterval(loadAttempts, 5000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, []);

  const latest = state.recentAttempts[0];

  return (
    <section className="mt-4 rounded-xl border border-slate-200 bg-white p-4 text-sm">
      <h2 className="font-semibold text-slate-950">Training attempt</h2>
      {!state.ok && <p className="mt-2 text-red-700">{state.error ?? "Attempt status unavailable"}</p>}
      {state.ok && !latest && <p className="mt-2 text-slate-600">No training attempts yet. Open an original problem with capture enabled.</p>}
      {latest && (
        <div className="mt-2 text-slate-600">
          <p>
            Latest: {latest.result} · {latest.platform} · {latest.problemTitle}
          </p>
          {latest.verdict && <p>Verdict: {latest.verdict}</p>}
          <p className="text-xs text-slate-500">Updated: {latest.updatedAt}</p>
        </div>
      )}
    </section>
  );
}
```

- [ ] **Step 2: Render AttemptStatusPanel in training workspace**

Modify `components/TrainingWorkspace.tsx`:

```tsx
import { AttemptStatusPanel } from "./AttemptStatusPanel";
import { CaptureStatusPanel } from "./CaptureStatusPanel";
```

Then render:

```tsx
<CaptureStatusPanel />
<AttemptStatusPanel />
```

- [ ] **Step 3: Add minimal Coach server summary**

Modify `app/coach/page.tsx` to read attempts and show an empty/failed/passed summary:

```tsx
import { openDatabase } from "@/lib/db/client";
import { listRecentAttempts } from "@/lib/repositories/attempts";

export default function CoachPage() {
  const db = openDatabase();
  try {
    const attempts = listRecentAttempts(db, 20);
    const failed = attempts.filter((attempt) => attempt.result === "failed" || attempt.result === "stuck");
    return (
      <main className="mx-auto max-w-4xl px-6 py-10">
        <h1 className="text-3xl font-semibold">Coach</h1>
        {attempts.length === 0 ? (
          <p className="mt-3 text-slate-600">No attempts yet. Complete a captured training session to unlock local coach feedback.</p>
        ) : (
          <section className="mt-4 rounded-xl border border-slate-200 bg-white p-4">
            <p className="text-slate-700">Recent attempts: {attempts.length}</p>
            <p className="mt-2 text-slate-700">Focus: {failed.length > 0 ? "Review failed or stuck attempts first." : "Keep building consistency with new problems."}</p>
          </section>
        )}
      </main>
    );
  } finally {
    db.close();
  }
}
```

- [ ] **Step 4: Add minimal Growth server summary**

Modify `app/growth/page.tsx`:

```tsx
import { openDatabase } from "@/lib/db/client";
import { listRecentAttempts } from "@/lib/repositories/attempts";

export default function GrowthPage() {
  const db = openDatabase();
  try {
    const attempts = listRecentAttempts(db, 50);
    const completed = attempts.filter((attempt) => attempt.result !== "draft");
    const passed = attempts.filter((attempt) => attempt.result === "passed");
    return (
      <main className="mx-auto max-w-4xl px-6 py-10">
        <h1 className="text-3xl font-semibold">Growth</h1>
        {attempts.length === 0 ? (
          <p className="mt-3 text-slate-600">No attempt data yet. Captured sessions will appear here after Phase 2.2 materializes them.</p>
        ) : (
          <section className="mt-4 grid gap-3 sm:grid-cols-3">
            <div className="rounded-xl border border-slate-200 bg-white p-4"><p className="text-sm text-slate-500">Attempts</p><p className="text-2xl font-semibold">{attempts.length}</p></div>
            <div className="rounded-xl border border-slate-200 bg-white p-4"><p className="text-sm text-slate-500">Completed</p><p className="text-2xl font-semibold">{completed.length}</p></div>
            <div className="rounded-xl border border-slate-200 bg-white p-4"><p className="text-sm text-slate-500">Passed</p><p className="text-2xl font-semibold">{passed.length}</p></div>
          </section>
        )}
      </main>
    );
  } finally {
    db.close();
  }
}
```

- [ ] **Step 5: Verify Task 4**

Run:

```powershell
npm run typecheck
npm run build
```

Expected: both commands exit 0.

- [ ] **Step 6: Commit Task 4**

```powershell
$env:GIT_MASTER='1'; git add components/AttemptStatusPanel.tsx components/TrainingWorkspace.tsx app/coach/page.tsx app/growth/page.tsx
$env:GIT_MASTER='1'; git commit -m "Show materialized training attempts" -m "Ultraworked with [Sisyphus](https://github.com/code-yeongyu/oh-my-openagent)" -m "Co-authored-by: Sisyphus <clio-agent@sisyphuslabs.ai>"
```

---

## Task 5: Documentation and Final Verification

**Files:**
- Modify: `README.md`
- Modify: `COMPLIANCE.md`

- [ ] **Step 1: Update README**

Add this section after Browser Extension:

```md
## Training Records Loop

Capture events posted to `/api/capture/events` are materialized into local `training_attempts`.
`PAGE_DETECTED` creates or reuses a draft attempt, while submission/verdict events complete the latest open draft for the same platform and problem.
Recent attempts are available from `/api/attempts/recent` and are shown on Training, Coach, and Growth pages.
```

- [ ] **Step 2: Update COMPLIANCE**

Add under Phase 2.1 Browser Capture:

```md
## Phase 2.2 Training Records Loop

Capture events are converted into local training attempts only after the user-installed extension observes user-visible page or verdict state.
The app stores attempt metadata, verdicts, language labels, timestamps, and user-local training state.
It does not read cookies, session tokens, hidden platform data, or full commercial problem statements.
```

- [ ] **Step 3: Run full verification**

Run:

```powershell
npm run db:migrate
npm run test
npm run typecheck
npm run extension:build
npm run build
node "C:\Users\迷失\.claude\plugins\cache\openai-codex\codex\1.0.4/scripts/codex-companion.mjs" review
```

Expected:

- DB migration exits 0.
- Vitest passes all test files.
- TypeScript typecheck exits 0.
- Extension build exits 0.
- Next build exits 0.
- Codex review reports no actionable defects, or all findings are fixed and review rerun.

- [ ] **Step 4: Commit Task 5**

```powershell
$env:GIT_MASTER='1'; git add README.md COMPLIANCE.md
$env:GIT_MASTER='1'; git commit -m "Document training records loop" -m "Ultraworked with [Sisyphus](https://github.com/code-yeongyu/oh-my-openagent)" -m "Co-authored-by: Sisyphus <clio-agent@sisyphuslabs.ai>"
```

---

## Final Acceptance Checklist

- [ ] `git status --short` is clean.
- [ ] Recent commits are atomic and in this order:
  1. `Add training attempt capture schema`
  2. `Add capture attempt materializer`
  3. `Materialize capture events into attempts`
  4. `Show materialized training attempts`
  5. `Document training records loop`
- [ ] `npm run test` passes.
- [ ] `npm run typecheck` passes.
- [ ] `npm run extension:build` passes.
- [ ] `npm run build` passes.
- [ ] Codex review passes with no actionable defects.
- [ ] No external LLM, Playwright/CDP companion, code execution, cookie/session reading, or full commercial statement caching was added.
