# Phase 0C2 Manual Attempts and Traceable Corrections Implementation Plan

**Status:** Completed, fully verified, and merged into `feature/v1-followup` on 2026-07-14 at `983e10a`; retained as an implementation record.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add server-owned manual training attempts, narrow optimistic corrections, queryable change history, and idempotent logical voiding while preserving existing V2 capture data.

**Architecture:** One evolved `training_attempts` table represents capture and manual records; manual rows have no fabricated capture identity. A separate scalar correction table records only actual allowlisted changes, while a service transaction applies values and history together. Existing repository queries exclude voided rows by default, so Training, Growth, and Coach share one active-record rule.

**Tech Stack:** Next.js App Router, strict TypeScript, SQLite/`better-sqlite3`, Zod, Vitest, Playwright, Chrome MV3.

## Global Constraints

- Migration 0005 must copy every existing V2 attempt and must not clear capture events, sessions, credentials, problems, or attempts.
- `recordSource` is server-owned: capture transition writes `capture`; manual creation writes `manual`; request bodies cannot set it.
- Manual attempts have no capture session, submission, submission event, verdict event, or verdict.
- Correction allowlist is exactly `result`, `language`, `durationMinutes`, `reflection`, `startedAt`, and `endedAt`.
- Correction history stores scalar old/new values, reason, time, and resulting revision; no snapshots, JSON diff, code, HTML, or problem statement.
- Current-value update and correction inserts share one SQLite transaction and use optimistic `expectedRevision` checks.
- Voiding is logical, reasoned, queryable, and idempotent; default Training/Growth/Coach queries exclude voided rows.
- Manual/correction writes use existing bounded JSON and same-origin checks; 0B3 capture credentials and authorization remain unchanged.
- Tests use in-memory, OS-temp, or `.tmp/playwright` databases only and never open the repository default database.
- Keep TypeScript strict; no `any`, `as any`, `as unknown`, TypeScript suppression, or non-null assertions.

---

### Task 1: Attempt source, revision, void state, and active-only queries

**Files:**

- Create: `lib/db/migrations/0005_attempt_manual_corrections.sql`
- Modify: `lib/domain/training.ts`
- Modify: `lib/repositories/attempts.ts`
- Modify: `lib/services/captureTransition.ts`
- Modify: `tests/unit/migrations.test.ts`
- Modify: `tests/unit/attemptQueries.test.ts`
- Modify: `tests/unit/captureMaterializer.test.ts`
- Modify: attempt fixtures in `tests/unit/growthStats.test.ts`, `tests/unit/coachAnalysis.test.ts`, `tests/e2e/coach-growth.spec.ts`

**Interfaces:**

- Produces `AttemptRecordSourceSchema`, `AttemptRecordSource`, `AttemptCorrectionFieldSchema`, `AttemptCorrection`, and the evolved `TrainingAttempt` with `recordSource`, `revision`, `voidedAt`, and `voidReason`.
- Produces `findAttemptByIdIncludingVoided` and keeps `findAttemptBySubmissionId` inclusive so capture replay can find a voided submission.
- `listAttempts`, `findLatestAttempt`, and `aggregateAttempts` remain active-only without an opt-out.

- [ ] **Step 1: Write failing migration and domain tests**

Add an upgrade fixture that copies migrations 0001-0004, inserts one paired V2 attempt, applies repository migrations, and asserts the original business/capture columns are unchanged plus:

```ts
expect(row).toMatchObject({
  id: "attempt_preserved_0c2",
  capture_session_id: "session_preserved_0c2",
  submission_id: "submission_preserved_0c2",
  record_source: "capture",
  revision: 1,
  voided_at: null,
  void_reason: null,
});
expect(countRows(db, "attempt_corrections")).toBe(0);
```

Add schema tests proving `capture` requires capture/session identity, `manual` forbids it, void time/reason are paired, and `endedAt` cannot precede `startedAt`.

- [ ] **Step 2: Run tests and verify the red state**

Run:

```powershell
npm run test -- tests/unit/migrations.test.ts tests/unit/attemptQueries.test.ts tests/unit/captureMaterializer.test.ts
```

Expected: FAIL because migration 0005 and new attempt fields do not exist.

- [ ] **Step 3: Add migration 0005**

Create `training_attempts_v4` with nullable capture identity and these checks:

```sql
record_source TEXT NOT NULL CHECK (record_source IN ('capture', 'manual')),
revision INTEGER NOT NULL DEFAULT 1 CHECK (revision > 0),
voided_at TEXT,
void_reason TEXT,
CHECK (
  (record_source = 'capture' AND capture_session_id IS NOT NULL AND submission_id IS NOT NULL)
  OR
  (record_source = 'manual' AND capture_session_id IS NULL AND submission_id IS NULL
    AND submission_event_id IS NULL AND verdict_event_id IS NULL AND verdict IS NULL)
),
CHECK (
  (voided_at IS NULL AND void_reason IS NULL)
  OR (voided_at IS NOT NULL AND void_reason IS NOT NULL)
)
```

Copy every current attempt with `record_source = 'capture'`, revision 1, and null void fields; drop/rename only the old attempt table; recreate `idx_training_attempts_session_time` and `idx_training_attempts_problem_updated`. Then create `attempt_corrections` with `(correction_id, field_name)` primary key and the exact field-name check from the design.

- [ ] **Step 4: Evolve the domain and capture transition**

Define:

```ts
export const AttemptRecordSourceSchema = z.enum(["capture", "manual"]);
export const AttemptCorrectionFieldSchema = z.enum([
  "result", "language", "durationMinutes", "reflection",
  "startedAt", "endedAt", "voidedAt",
]);
```

Make capture identity fields optional in `TrainingAttemptSchema`, add source/revision/void fields, and use `superRefine` for source/identity, void pairing, and timestamp order. `transitionSubmissionAttempt` and `transitionVerdictAttempt` set `recordSource: "capture"` and `revision: 1` for new attempts.

- [ ] **Step 5: Map new columns and exclude voided rows by default**

Extend `AttemptRow`, insert/update bindings, and `fromRow`. Add `voided_at IS NULL` to list and aggregate SQL. Implement:

```ts
export function findAttemptByIdIncludingVoided(
  db: Database.Database,
  id: string,
): TrainingAttempt | null;
```

Keep `findAttemptBySubmissionId` inclusive. Add repository tests with one active manual row and one newer voided row proving latest, list, and aggregate return only active records.

- [ ] **Step 6: Update typed test fixtures**

Every `TrainingAttempt` fixture explicitly supplies `recordSource: "capture"` and `revision: 1`. E2E direct inserts remain capture rows. No fixture uses a fake manual session.

- [ ] **Step 7: Verify and commit Task 1**

Run:

```powershell
npm run test -- tests/unit/migrations.test.ts tests/unit/attemptQueries.test.ts tests/unit/captureMaterializer.test.ts tests/unit/growthStats.test.ts tests/unit/coachAnalysis.test.ts
npm run typecheck
```

Expected: selected tests and typecheck pass.

Commit: `feat: add attempt source and active-state schema`

### Task 2: Server-owned manual attempt creation

**Files:**

- Create: `lib/services/manualAttempts.ts`
- Create: `app/api/attempts/route.ts`
- Create: `tests/unit/manualAttempts.test.ts`
- Create: `tests/unit/attemptApi.test.ts`
- Modify: `lib/repositories/attempts.ts` only if a create-only insert helper is required

**Interfaces:**

- Produces `ManualAttemptInputSchema`, `ManualAttemptInput`, and `createManualAttempt(db, input, options?)`.
- `createManualAttempt` options inject `now` and `id` for deterministic tests; production defaults use ISO time and `crypto.randomUUID()`.
- Produces `POST /api/attempts`, returning `{ ok: true, attempt }` with HTTP 201.

- [ ] **Step 1: Write failing service and route tests**

Use in-memory/temporary migrated databases. Prove a manual record:

```ts
expect(attempt).toMatchObject({
  id: "manual_attempt_test",
  recordSource: "manual",
  captureSessionId: undefined,
  submissionId: undefined,
  revision: 1,
  result: "failed",
});
```

Prove a known platform derives a canonical URL, platform `manual` requires an observed HTTP(S) URL, and invalid time order fails. Route tests send same-origin bounded JSON and verify HTTP 201. Strict-body cases containing `recordSource`, `captureSessionId`, `submissionId`, `submissionEventId`, `verdictEventId`, `revision`, `verdict`, or `voidedAt` must return HTTP 400 and write zero attempts.

- [ ] **Step 2: Run tests and verify the red state**

Run:

```powershell
npm run test -- tests/unit/manualAttempts.test.ts tests/unit/attemptApi.test.ts
```

Expected: FAIL because the service and route do not exist.

- [ ] **Step 3: Implement the strict manual input and service**

Use this shape:

```ts
export const ManualAttemptInputSchema = z.object({
  platform: PlatformSchema,
  problemExternalId: z.string().trim().min(1).max(200),
  problemTitle: z.string().trim().min(1).max(300),
  canonicalUrl: z.string().url().optional(),
  startedAt: z.string().datetime(),
  endedAt: z.string().datetime().optional(),
  result: AttemptResultSchema,
  language: z.string().trim().min(1).max(100).optional(),
  durationMinutes: z.number().int().nonnegative().max(10080).optional(),
  reflection: z.string().trim().min(1).max(2000).optional(),
}).strict();
```

Normalize identity and canonical URL, generate only the attempt ID, set `recordSource: "manual"`, revision 1, and omit all capture identity/evidence/verdict fields. Persist through the attempt repository.

- [ ] **Step 4: Implement the manual POST route**

Call `requireSameOrigin`, `readBoundedJson`, and `ManualAttemptInputSchema.safeParse`. Map request/normalization/schema errors to 400/403/413/415 and unexpected persistence errors to 500. Never infer source from the body.

- [ ] **Step 5: Verify and commit Task 2**

Run:

```powershell
npm run test -- tests/unit/manualAttempts.test.ts tests/unit/attemptApi.test.ts tests/unit/attemptQueries.test.ts
npm run typecheck
```

Expected: selected tests and typecheck pass.

Commit: `feat: create manual training attempts`

### Task 3: Optimistic correction history and idempotent voiding

**Files:**

- Create: `lib/repositories/attemptCorrections.ts`
- Create: `lib/services/attemptCorrections.ts`
- Create: `app/api/attempts/[id]/route.ts`
- Create: `app/api/attempts/[id]/corrections/route.ts`
- Create: `app/api/attempts/[id]/void/route.ts`
- Delete: `app/api/attempts/[id]/reflection/route.ts`
- Modify: `lib/repositories/attempts.ts`
- Create: `tests/unit/attemptCorrections.test.ts`
- Modify: `tests/unit/attemptApi.test.ts`
- Modify: `tests/unit/captureApi.test.ts`

**Interfaces:**

- Produces `AttemptCorrectionRequestSchema`, `AttemptCorrectionRequest`, `VoidAttemptRequestSchema`, `correctAttempt`, and `voidAttempt`.
- Produces repository `listAttemptCorrections`, `insertAttemptCorrectionChanges`, `updateAttemptCorrectionFields`, and `markAttemptVoided`.
- Produces PATCH attempt, GET corrections, and POST void routes.

- [ ] **Step 1: Write failing correction tests**

Cover six behaviors:

1. one PATCH changes multiple allowlisted fields, increments revision once, and writes only actual changed fields;
2. attempt row count is unchanged;
3. stale `expectedRevision` throws a conflict and changes nothing;
4. identity/source/verdict/event fields are rejected by the strict API schema;
5. a trigger that aborts correction insertion causes the current-value update to roll back;
6. correcting a voided row conflicts.

Use an explicit rollback assertion:

```ts
db.exec(`
  CREATE TRIGGER fail_correction_insert
  BEFORE INSERT ON attempt_corrections
  BEGIN SELECT RAISE(ABORT, 'forced correction failure'); END;
`);
expect(() => correctAttempt(db, attemptId, input, options)).toThrow();
expect(findAttemptByIdIncludingVoided(db, attemptId)?.result).toBe("failed");
```

- [ ] **Step 2: Write failing void tests**

Void an active row and assert revision increment, one `voidedAt` history item, and exclusion from list/latest/aggregate. Repeat void with a stale revision and a different reason; assert HTTP/service success with `replayed: true`, original time/reason unchanged, and no second history operation.

- [ ] **Step 3: Run tests and verify the red state**

Run:

```powershell
npm run test -- tests/unit/attemptCorrections.test.ts tests/unit/attemptApi.test.ts
```

Expected: FAIL because correction repositories/services/routes do not exist.

- [ ] **Step 4: Implement correction repositories**

`updateAttemptCorrectionFields` accepts the already validated complete prospective attempt plus `expectedRevision` and updates only the six allowlisted columns, `updated_at`, and `revision = revision + 1`. Its SQL includes `voided_at IS NULL AND revision = @expectedRevision` and returns the changed-row count.

`insertAttemptCorrectionChanges` inserts scalar rows. `listAttemptCorrections` selects rows belonging to the newest 100 correction IDs, orders them, and groups them into `AttemptCorrection` objects without JSON parsing.

- [ ] **Step 5: Implement transactional services**

`correctAttempt` checks existence, active state, and revision before computing changes. Encode numbers as decimal text, strings/datetimes verbatim, and cleared values as SQL null. Reject no-op changes. Wrap conditional update and all change-row inserts in one `db.transaction`.

`voidAttempt` first returns the stored attempt with `replayed: true` when already voided. Otherwise check revision, conditionally set void fields/increment revision, and insert one `voidedAt` change in one transaction.

- [ ] **Step 6: Implement routes and remove the unaudited reflection route**

Mutation routes require same origin and bounded JSON. Map:

- request/schema/no-change errors to 400;
- not found to 404;
- stale revision or active-state conflicts to 409;
- unexpected errors to 500.

The history GET returns `{ ok: true, corrections }`. Delete the reflection route and update its capture API test to use the general correction route with `expectedRevision` and `reason`.

- [ ] **Step 7: Verify and commit Task 3**

Run:

```powershell
npm run test -- tests/unit/attemptCorrections.test.ts tests/unit/attemptApi.test.ts tests/unit/captureApi.test.ts tests/unit/attemptQueries.test.ts tests/unit/captureMaterializer.test.ts
npm run typecheck
```

Expected: selected tests and typecheck pass.

Commit: `feat: add traceable attempt corrections`

### Task 4: Training UI, source visibility, E2E, and current-state docs

**Files:**

- Create: `components/ManualAttemptPanel.tsx`
- Modify: `components/TrainingWorkspace.tsx`
- Modify: `components/AttemptStatusPanel.tsx`
- Modify: `lib/services/growthStats.ts`
- Modify: `app/growth/page.tsx`
- Modify: `tests/unit/growthStats.test.ts`
- Modify: `tests/e2e/coach-growth.spec.ts`
- Modify: `README.md`
- Modify: `docs/architecture.md`
- Modify: `docs/runbook.md`
- Modify: `COMPLIANCE.md`

**Interfaces:**

- `ManualAttemptPanel` posts one strict manual record for the current task and dispatches an `attempts-changed` browser event after success.
- `AttemptStatusPanel` listens for that event, edits through PATCH, loads correction history, and voids through POST.
- Growth activity exposes `recordSource` and renders `Manual entry` or `Automatic capture`.

- [ ] **Step 1: Add source to the Growth activity model test**

Update Growth service tests to assert each recent item carries the attempt's `recordSource`. Do not add a second aggregate or source-specific totals.

- [ ] **Step 2: Implement the manual panel**

Use native controlled inputs for result, language, duration, start/end time, reflection, and canonical URL. Task platform/external ID/title are props from `TrainingWorkspace`. Convert `datetime-local` values to ISO before POST. Show inline success/error text and dispatch `attempts-changed` after HTTP 201.

- [ ] **Step 3: Replace reflection editing with the correction editor**

The attempt panel renders source and revision, initializes the six allowlisted fields from the latest attempt, and requires a correction reason. PATCH includes the displayed revision. On 409, show the conflict and reload instead of overwriting. Load `/corrections` for the latest attempt and render grouped field changes with reason/time. A separate void reason posts to `/void`; success reloads the active scoped query.

- [ ] **Step 4: Add the full manual browser path**

In the disposable E2E database, record the active attempt count. Through `/training`:

1. create a failed manual attempt and see `Manual entry`;
2. verify Growth count increases by one and Coach's active window increases (up to 50);
3. correct result to passed with a reason and see history `failed` to `passed`;
4. verify the database and Growth attempt total did not increase again;
5. void with a reason and see Training empty state;
6. verify Growth returns to the original active count and Coach excludes the row.

Also assert an automatic capture row renders `Automatic capture`.

- [ ] **Step 5: Run focused UI/E2E verification**

Run:

```powershell
npm run test -- tests/unit/growthStats.test.ts tests/unit/attemptApi.test.ts tests/unit/attemptCorrections.test.ts
npm run typecheck
npm run e2e -- tests/e2e/coach-growth.spec.ts
```

Expected: selected unit tests, typecheck, and the Coach/Growth browser file pass against `.tmp/playwright` only.

- [ ] **Step 6: Update current-state docs**

Document migration 0005, capture/manual source semantics, nullable capture identity for manual rows, revision conflict behavior, correction allowlist/history, logical voiding, active-only Training/Growth/Coach queries, same-origin local mutation routes, and the absence of snapshots/code/HTML/large JSON.

- [ ] **Step 7: Verify and commit Task 4**

Run `git diff --check`, inspect the task diff, and commit:

`test: verify Phase 0C2 manual fallback`

## Complete Phase 0C2 gate

- [ ] Record default `training-platform.sqlite` existence, length, and last-write metadata without opening or hashing it.
- [ ] Run `npm run db:migrate` with `TRAINING_DB_PATH` set to a disposable `.tmp/phase-0c2-gate/migrate.sqlite`.
- [ ] Run `npm run test`.
- [ ] Run `npm run typecheck`.
- [ ] Run `npm run e2e`.
- [ ] Run `npm run extension:build`.
- [ ] Run `npm run build`.
- [ ] Confirm default-database metadata is unchanged, generated test directories are removed, `git diff --check` is clean, and forbidden TypeScript escape scans are empty.
- [ ] Fast-forward merge `codex/phase-0c2-manual-corrections` into `feature/v1-followup`, remove the owned `.worktrees/phase-0c2` worktree, delete the merged branch, and rerun unit tests plus typecheck from the merged checkout.

## Self-review record

- **Spec coverage:** migration preservation, source ownership, manual create, correction allowlist/history, atomicity, stale conflicts, idempotent void, active-only queries, source UI, E2E, and full gates each map to a task.
- **Scope:** no capture credential changes, snapshots, generic audit framework, import, AI, code storage, capture cleanup, or major UI refactor.
- **Type consistency:** `recordSource`, `expectedRevision`, `AttemptCorrection`, and the six correction field names are identical across tasks.
- **Transaction boundary:** Task 3 explicitly couples the conditional current-row update and correction inserts in one service transaction and tests rollback.
- **Compatibility:** Task 1 copies V2 rows as capture records and retains inclusive submission lookup for late capture replay.
- **Placeholder scan:** no unfinished marker, undefined neighboring interface, or generic “add tests/error handling” step remains.
