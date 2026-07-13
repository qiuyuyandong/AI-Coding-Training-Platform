# Phase 0B1 Capture Session Protocol Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the V1 problem/verdict heuristic with a V2 session/submission protocol that preserves distinct submissions, rejects conflicting replays, and never treats page lifecycle as an attempt result.

**Architecture:** A strict discriminated event envelope feeds an immutable raw event table and pure deterministic transition service. The API ingests each new raw event and applies its session/attempt projection in one SQLite transaction. The extension generates logical installation, session, and submission identifiers but remains explicitly unpaired until the later credential phase.

**Tech Stack:** TypeScript 5.8 strict mode, Zod 3.25, SQLite/`better-sqlite3` 12.11, Next.js 15 App Router, Chrome MV3, Vitest 3.2, Playwright 1.53.

## Global Constraints

- The approved design is `docs/superpowers/specs/2026-07-14-phase-0b1-capture-protocol-design.md`.
- V1 API events and queued extension events are discarded; no legacy compatibility branch is added.
- Migration 0003 may destroy only the known synthetic rows in `capture_events` and `training_attempts`; it must preserve problem/catalog data.
- `training_sessions.ended_at` and `end_reason` remain nullable; no code assumes `SESSION_ENDED` arrives.
- `installationId` is correlation metadata, not authentication or trust.
- Raw event insertion and projection writes occur in one database transaction.
- Reusing an event ID with a different normalized payload is HTTP 409, not replay.
- The two-problem E2E uses complete `page.goto` loads and does not claim SPA coverage.
- Keep TypeScript strict: no `any`, `as any`, `as unknown`, `@ts-ignore`, `@ts-expect-error`, or non-null assertions.
- Keep all databases in tests temporary; E2E continues to use `.tmp/playwright/training-platform.sqlite`.
- Every Git command is prefixed with `$env:GIT_MASTER='1';`; do not push or create a PR.

---

### Task 1: Define the V2 Protocol and Destructive Schema Cutover

**Files:**
- Create: `lib/capture/protocol.ts`
- Create: `lib/db/migrations/0003_capture_sessions_and_submissions.sql`
- Modify: `lib/capture/events.ts`
- Modify: `lib/domain/training.ts`
- Replace: `tests/unit/captureEvents.test.ts`
- Modify: `tests/unit/migrations.test.ts`

**Interfaces:**
- Produces: `CaptureEventSchema`, `CaptureEvent`, event-specific types, `captureEventFingerprint(event)`, and `verdictEventToAttemptUpdate(event)`.
- Produces tables: `training_sessions`, V2 `capture_events`, and V2 `training_attempts`.
- Migration prefix: 0003, confirmed after merged 0001 and 0002.

- [ ] **Step 1: Replace capture protocol tests with failing V2 contract tests**

Cover these exact cases in `tests/unit/captureEvents.test.ts`:

```ts
expect(() => CaptureEventSchema.parse({ ...sessionStartedEvent(), schemaVersion: 1 })).toThrow();
expect(() => CaptureEventSchema.parse({ ...sessionStartedEvent(), submissionId: "submission_1" })).toThrow();
expect(() => CaptureEventSchema.parse({ ...submissionObservedEvent(), submissionId: undefined })).toThrow();
expect(CaptureEventSchema.parse(verdictObservedEvent()).type).toBe("VERDICT_OBSERVED");
expect(captureEventFingerprint(verdictObservedEvent())).toBe(
  captureEventFingerprint({ ...verdictObservedEvent(), payload: { language: "C++", verdict: "Accepted" } }),
);
expect(verdictEventToAttemptUpdate(verdictObservedEvent()).result).toBe("passed");
```

Use valid defaults with `schemaVersion: 2`, `captureSessionId: "session_1"`, `installationId: "installation_1"`, `adapterVersion: "leetcode@0.1.0"`, `parserVersion: "verdict@0.1.0"`, `pageOrigin: "https://leetcode.com"`, and `provenanceLevel: "extension_unpaired"`.

- [ ] **Step 2: Run the protocol tests and verify the V2 symbols are missing**

Run:

```powershell
npm run test -- tests/unit/captureEvents.test.ts
```

Expected: FAIL because the V2 discriminated schemas and fingerprint function do not exist.

- [ ] **Step 3: Implement the strict V2 discriminated union**

Create `lib/capture/protocol.ts` with strict event schemas built from this common shape:

```ts
const BaseCaptureEventSchema = z.object({
  schemaVersion: z.literal(2),
  id: z.string().min(1),
  captureSessionId: z.string().min(1),
  installationId: z.string().min(1),
  adapterVersion: z.string().min(1),
  parserVersion: z.string().min(1),
  pageOrigin: z.string().url(),
  provenanceLevel: z.literal("extension_unpaired"),
  platform: PlatformSchema,
  problemExternalId: z.string().min(1),
  problemTitle: z.string().min(1),
  canonicalUrl: z.string().url(),
  occurredAt: z.string().datetime(),
});
```

Define strict `SESSION_STARTED` and `SESSION_ENDED` objects without `submissionId`, and strict `SUBMISSION_OBSERVED` and `VERDICT_OBSERVED` objects with a required `submissionId`. Export the event-specific inferred types and:

```ts
export const CaptureEventSchema = z.discriminatedUnion("type", [
  SessionStartedEventSchema,
  SubmissionObservedEventSchema,
  VerdictObservedEventSchema,
  SessionEndedEventSchema,
]);
```

Implement stable recursive object-key sorting followed by `createHash("sha256")` so semantically identical payload objects produce the same fingerprint regardless of key order.

- [ ] **Step 4: Keep verdict classification behind the V2 verdict type**

Replace the V1 conversion helpers in `lib/capture/events.ts`. Re-export the V2 protocol and expose:

```ts
export type AttemptUpdate = {
  readonly result: "passed" | "failed" | "partial" | "stuck";
  readonly verdict: string;
  readonly language?: string;
  readonly endedAt: string;
};

export function verdictEventToAttemptUpdate(event: VerdictObservedEvent): AttemptUpdate;
```

Preserve the existing accepted/failed/partial verdict classification behavior and explicit payload `result` override. A V2 verdict always has a non-empty verdict; remove the old `"Unknown"` fallback.

- [ ] **Step 5: Write the destructive migration**

Create `0003_capture_sessions_and_submissions.sql`. It must drop `training_attempts` before `capture_events`, preserve `problems`, and create the following constraints:

```sql
CREATE TABLE training_sessions (
  id TEXT PRIMARY KEY,
  installation_id TEXT NOT NULL,
  platform TEXT NOT NULL,
  problem_external_id TEXT NOT NULL,
  problem_title TEXT NOT NULL,
  canonical_url TEXT NOT NULL,
  provenance_level TEXT NOT NULL CHECK (provenance_level = 'extension_unpaired'),
  started_at TEXT NOT NULL,
  ended_at TEXT,
  end_reason TEXT CHECK (end_reason IN ('pagehide', 'spa_navigation', 'capture_disabled')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CHECK ((ended_at IS NULL AND end_reason IS NULL) OR (ended_at IS NOT NULL AND end_reason IS NOT NULL))
);

CREATE TABLE capture_events (
  id TEXT PRIMARY KEY,
  schema_version INTEGER NOT NULL CHECK (schema_version = 2),
  type TEXT NOT NULL CHECK (type IN ('SESSION_STARTED', 'SUBMISSION_OBSERVED', 'VERDICT_OBSERVED', 'SESSION_ENDED')),
  capture_session_id TEXT NOT NULL,
  submission_id TEXT,
  installation_id TEXT NOT NULL,
  adapter_version TEXT NOT NULL,
  parser_version TEXT NOT NULL,
  page_origin TEXT NOT NULL,
  provenance_level TEXT NOT NULL CHECK (provenance_level = 'extension_unpaired'),
  platform TEXT NOT NULL,
  problem_external_id TEXT NOT NULL,
  problem_title TEXT NOT NULL,
  canonical_url TEXT NOT NULL,
  occurred_at TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  event_fingerprint TEXT NOT NULL,
  received_at TEXT NOT NULL,
  CHECK (
    (type IN ('SUBMISSION_OBSERVED', 'VERDICT_OBSERVED') AND submission_id IS NOT NULL)
    OR (type IN ('SESSION_STARTED', 'SESSION_ENDED') AND submission_id IS NULL)
  )
);

CREATE TABLE training_attempts (
  id TEXT PRIMARY KEY,
  capture_session_id TEXT NOT NULL REFERENCES training_sessions(id),
  submission_id TEXT NOT NULL UNIQUE,
  platform TEXT NOT NULL,
  problem_external_id TEXT NOT NULL,
  problem_title TEXT NOT NULL,
  canonical_url TEXT NOT NULL,
  started_at TEXT NOT NULL,
  ended_at TEXT,
  result TEXT NOT NULL CHECK (result IN ('draft', 'passed', 'failed', 'partial', 'stuck')),
  verdict TEXT,
  language TEXT,
  duration_minutes INTEGER,
  reflection TEXT,
  submission_event_id TEXT,
  verdict_event_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
```

Add indexes for session events, session attempts, problem attempts, and session end lookup.

- [ ] **Step 6: Extend migration tests for destructive upgrade and nullable sessions**

In `tests/unit/migrations.test.ts`, create an old-schema database by applying only migrations 0001 and 0002 from a temporary migration directory, insert one synthetic capture event and attempt, then apply the repository migrations. Assert:

```ts
expect(countRows(db, "capture_events")).toBe(0);
expect(countRows(db, "training_attempts")).toBe(0);
expect(countRows(db, "training_sessions")).toBe(0);
expect(countRows(db, "problems")).toBe(1);
```

Insert an open session with both `ended_at` and `end_reason` null and assert it succeeds. Assert mismatched nullability fails the table check.

- [ ] **Step 7: Update domain schemas and run focused tests**

Add `TrainingSessionSchema` and extend `TrainingAttemptSchema` with non-null `captureSessionId` and `submissionId`, plus optional `submissionEventId` and `verdictEventId`. Remove `sourceEventId`.

Run:

```powershell
npm run test -- tests/unit/captureEvents.test.ts tests/unit/migrations.test.ts
```

Expected: protocol and migration tests pass.

- [ ] **Step 8: Commit Task 1**

```powershell
$env:GIT_MASTER='1'; git add lib/capture/protocol.ts lib/capture/events.ts lib/domain/training.ts lib/db/migrations/0003_capture_sessions_and_submissions.sql tests/unit/captureEvents.test.ts tests/unit/migrations.test.ts
$env:GIT_MASTER='1'; git commit -m "feat: define capture protocol v2"
```

---

### Task 2: Add Deterministic Transactional Projection and API Conflicts

**Files:**
- Create: `lib/services/captureTransition.ts`
- Create: `lib/repositories/trainingSessions.ts`
- Replace: `lib/repositories/captureEvents.ts`
- Replace: `lib/repositories/attempts.ts`
- Replace: `lib/services/captureMaterializer.ts`
- Modify: `app/api/capture/events/route.ts`
- Replace: `tests/unit/captureMaterializer.test.ts`
- Modify: `tests/unit/captureApi.test.ts`

**Interfaces:**
- Produces: `transitionCaptureState(state, event, now): CaptureTransition` as a pure function.
- Produces: `ingestCaptureEvent(db, event, { now }): CaptureIngestResult`, which owns the SQLite transaction.
- Produces: `CaptureConflictError` mapped to HTTP 409.

```ts
export type CaptureIngestResult = {
  readonly eventId: string;
  readonly captureSessionId: string;
  readonly attemptId?: string;
  readonly attemptStatus?: AttemptResult;
  readonly replayed: boolean;
};
```

- [ ] **Step 1: Write failing pure transition tests**

Use in-memory domain objects, not SQLite, to cover:

```ts
it("keeps identical verdicts as separate attempts when submission IDs differ");
it("creates a completed attempt when verdict arrives before submission");
it("does not let a later submission event revert a completed attempt to draft");
it("ignores a verdict older than the projected verdict timestamp");
it("closes a session without changing a draft attempt");
it("allows an open session with no SESSION_ENDED event");
it("rejects a session ID reused for another problem");
it("rejects a new submission occurring after session end");
```

Run `npm run test -- tests/unit/captureMaterializer.test.ts` and expect missing transition symbols.

- [ ] **Step 2: Implement the pure transition service**

Define:

```ts
export type CaptureState = {
  readonly session: TrainingSession | null;
  readonly attempt: TrainingAttempt | null;
};

export type CaptureTransition = {
  readonly session: TrainingSession;
  readonly attempt?: TrainingAttempt;
};

export class CaptureConflictError extends Error {}

export function transitionCaptureState(
  state: CaptureState,
  event: CaptureEvent,
  now: string,
): CaptureTransition;
```

Session identity equality is `(installationId, platform, problemExternalId)`. Use `event.occurredAt` for semantic timestamps and `now` only for audit timestamps. Generate attempt IDs as `attempt_${submissionId}`. `SESSION_ENDED` leaves `attempt` unchanged.

- [ ] **Step 3: Implement focused session and attempt repositories**

`trainingSessions.ts` exports `findTrainingSessionById` and `saveTrainingSession` using an upsert of every projected field.

`attempts.ts` keeps the existing page-facing `listRecentAttempts`, `findAttemptById`, and `updateAttemptReflection` contracts, and adds `findAttemptBySubmissionId` and `saveTrainingAttempt`. Update row mapping to V2 columns.

`captureEvents.ts` exports:

```ts
export function findCaptureEventFingerprint(db: Database.Database, eventId: string): string | null;
export function insertCaptureEvent(
  db: Database.Database,
  event: CaptureEvent,
  fingerprint: string,
  receivedAt: string,
): void;
export function listRecentCaptureEvents(db: Database.Database, limit?: number): CaptureEvent[];
```

- [ ] **Step 4: Implement transactional ingestion**

Replace the materializer with `ingestCaptureEvent`. Its transaction performs this order:

```ts
const fingerprint = captureEventFingerprint(parsed);
const existingFingerprint = findCaptureEventFingerprint(db, parsed.id);
if (existingFingerprint !== null) {
  if (existingFingerprint !== fingerprint) {
    throw new CaptureConflictError(`Capture event ${parsed.id} conflicts with its stored payload`);
  }
  return replayResult(db, parsed);
}

const state = loadCaptureState(db, parsed);
const transition = transitionCaptureState(state, parsed, now());
insertCaptureEvent(db, parsed, fingerprint, now());
saveTrainingSession(db, transition.session);
if (transition.attempt !== undefined) saveTrainingAttempt(db, transition.attempt);
return resultFromTransition(transition, false);
```

Place the complete sequence above inside the callback passed to `db.transaction`, then invoke the returned transaction function. A failure after raw insertion must roll back both raw and projected rows.

- [ ] **Step 5: Add repository-backed ingestion tests**

Use `applyMigrations` on a temporary database and assert:

- exact event replay returns `replayed: true` and row counts remain one;
- same event ID with a changed payload throws `CaptureConflictError` and preserves the first row;
- two `Wrong Answer` verdicts with different submission IDs create two attempts;
- a session identity conflict leaves the conflicting raw event absent;
- `SESSION_ENDED` leaves a draft attempt draft;
- verdict-before-submission converges to one completed attempt.

- [ ] **Step 6: Map API status codes and update API tests**

The route parses V2 input, calls `ingestCaptureEvent` directly, and maps `CaptureConflictError` to:

```ts
return NextResponse.json({ ok: false, error: error.message }, { status: 409 });
```

Add tests proving V1 returns 400, exact replay returns 200 with `replayed: true`, and changed-payload replay returns 409. Keep database setup on `applyMigrations` and temporary paths.

- [ ] **Step 7: Run focused Task 2 verification**

```powershell
npm run test -- tests/unit/captureMaterializer.test.ts tests/unit/captureApi.test.ts
npm run typecheck
```

Expected: both files pass and TypeScript exits 0.

- [ ] **Step 8: Commit Task 2**

```powershell
$env:GIT_MASTER='1'; git add lib/services/captureTransition.ts lib/repositories/trainingSessions.ts lib/repositories/captureEvents.ts lib/repositories/attempts.ts lib/services/captureMaterializer.ts app/api/capture/events/route.ts tests/unit/captureMaterializer.test.ts tests/unit/captureApi.test.ts
$env:GIT_MASTER='1'; git commit -m "feat: project capture sessions transactionally"
```

---

### Task 3: Cut the Extension Over to V2 Identities

**Files:**
- Create: `extension/src/captureSession.ts`
- Create: `extension/src/installation.ts`
- Modify: `extension/src/content.ts`
- Modify: `extension/src/background.ts`
- Modify: `extension/src/transport.ts`
- Create: `tests/unit/extensionCaptureSession.test.ts`
- Create: `tests/unit/extensionInstallation.test.ts`
- Modify: `tests/unit/extensionTransport.test.ts`

**Interfaces:**
- Produces pure extension helpers for initialization planning and session/submission event generation.
- Keeps `CAPTURE_EVENT` transport messages, but their event must satisfy `CaptureEventSchema` V2.
- Adds `GET_CAPTURE_CONTEXT` request/response for content scripts.

- [ ] **Step 1: Write failing initialization and identity lifecycle tests**

Cover:

```ts
expect(planExtensionInitialization({ captureProtocolVersion: 1, eventQueue: [{}, {}] }, fixed)).toMatchObject({
  discardedLegacyEventCount: 2,
  shouldLogLegacyDiscard: true,
  eventQueue: [],
  captureProtocolVersion: 2,
});
```

Also assert a second initialization at version 2 does not log or discard again, an existing installation ID is preserved, two submit observations get different submission IDs, equal verdicts after separate submissions emit twice, verdict-before-submit creates a submission ID, and `SESSION_ENDED` has no submission ID.

Run the two new test files and expect missing modules.

- [ ] **Step 2: Implement pure installation planning**

`extension/src/installation.ts` exports `CAPTURE_PROTOCOL_VERSION = 2`, a strict runtime context, and:

```ts
export type ExtensionInitializationPlan = {
  readonly installationId: string;
  readonly captureEnabled: boolean;
  readonly captureEndpoint: string;
  readonly captureProtocolVersion: 2;
  readonly eventQueue: readonly CaptureQueueItem[];
  readonly discardedLegacyEventCount: number;
  readonly legacyQueueDiscardedAt?: string;
  readonly shouldLogLegacyDiscard: boolean;
};

export function planExtensionInitialization(
  stored: Record<string, unknown>,
  options: { readonly now: string; readonly createInstallationId: () => string },
): ExtensionInitializationPlan;
```

When the stored version is not 2, count the raw array length of `eventQueue`, clear it, and set `legacyQueueDiscardedAt`. `shouldLogLegacyDiscard` is true only for this cutover. Preserve valid V2 queue items when the version is already 2.

- [ ] **Step 3: Implement the pure content-session state machine**

`captureSession.ts` exports start, submission, verdict, and end functions. Each receives an injected `createId` and ISO timestamp. A submission creates a new submission ID and clears `lastVerdict`; verdict deduplication is scoped to the active submission ID.

Use fixed metadata constants for this release:

```ts
export const ADAPTER_VERSION = "multi-platform@0.2.0";
export const PARSER_VERSION = "visible-verdict@0.2.0";
export const PROVENANCE_LEVEL = "extension_unpaired";
```

- [ ] **Step 4: Wire background initialization and one-time logging**

Initialize once at worker startup, write the initialization plan to `chrome.storage.local`, and log exactly:

```ts
console.info(`[capture-v2] discarded ${plan.discardedLegacyEventCount} queued V1 event(s)`);
```

Expose the resolved installation context through `GET_CAPTURE_CONTEXT`. Keep the current retry plan; queue serialization remains outside 0B1.

- [ ] **Step 5: Wire content emission without SPA interception**

On a detected full page load:

1. request the background context;
2. create and send `SESSION_STARTED`;
3. create a new submission ID on every observed submit click;
4. associate visible verdict with the active submission, or create one when verdict arrives first;
5. send best-effort `SESSION_ENDED` from `pagehide`.

Do not patch `history.pushState`, `replaceState`, or `popstate` in this task.

- [ ] **Step 6: Update transport tests and run Task 3 verification**

Update fixtures to V2 and prove V1 queue items fail `isQueueItem`. Run:

```powershell
npm run test -- tests/unit/extensionCaptureSession.test.ts tests/unit/extensionInstallation.test.ts tests/unit/extensionTransport.test.ts tests/unit/extensionPlatforms.test.ts
npm run typecheck
npm run extension:build
```

Expected: extension-focused tests pass, strict types pass, and MV3 artifacts build.

- [ ] **Step 7: Commit Task 3**

```powershell
$env:GIT_MASTER='1'; git add extension/src/captureSession.ts extension/src/installation.ts extension/src/content.ts extension/src/background.ts extension/src/transport.ts tests/unit/extensionCaptureSession.test.ts tests/unit/extensionInstallation.test.ts tests/unit/extensionTransport.test.ts
$env:GIT_MASTER='1'; git commit -m "feat: emit capture protocol v2 from extension"
```

---

### Task 4: Add Full-Load Two-Problem E2E and Current-State Documentation

**Files:**
- Create: `tests/e2e/captureFixtures.ts`
- Create: `tests/e2e/capture-protocol.spec.ts`
- Modify: `tests/e2e/coach-growth.spec.ts`
- Modify: `components/TrainingWorkspace.tsx`
- Modify: `README.md`
- Modify: `docs/architecture.md`
- Modify: `docs/runbook.md`
- Modify: `COMPLIANCE.md`

**Interfaces:**
- Produces reusable Playwright V2 event builders.
- Verifies three distinct submissions across two full-loaded training pages.
- Makes no SPA reliability claim.

- [ ] **Step 1: Add V2 E2E event builders and migrate existing smoke events**

`captureFixtures.ts` exports builders for all four event types with fixed unpaired extension metadata and caller-supplied event/session/submission/problem/time fields. Replace every V1 body in `coach-growth.spec.ts` with a V2 body.

- [ ] **Step 2: Write the failing two-problem scenario**

Create one session for `two-sum` with two submissions that both receive `Wrong Answer`, and one session for `valid-parentheses` with one `Accepted` submission. Use API requests to ingest the events, then assert the disposable database contains three attempts and two distinct `Wrong Answer` submission IDs.

Use complete page loads:

```ts
await page.goto("/training?platform=leetcode&externalId=two-sum&title=Two%20Sum");
await expect(page.getByRole("heading", { name: "Two Sum" })).toBeVisible();
await expect(page.locator("section").filter({ hasText: "Training attempt" })).not.toContainText("Valid Parentheses");

await page.goto("/training?platform=leetcode&externalId=valid-parentheses&title=Valid%20Parentheses");
await expect(page.getByRole("heading", { name: "Valid Parentheses" })).toBeVisible();
await expect(page.locator("section").filter({ hasText: "Training attempt" })).not.toContainText("Two Sum");
```

Run the new test first. Expected: the API fixtures or current V1 workspace copy fails the new V2 assertions; server startup and database isolation remain green.

- [ ] **Step 3: Update the workspace copy to the implemented V2 boundary**

In `components/TrainingWorkspace.tsx`, replace the sentence beginning `This V1 workspace` with:

```tsx
<p className="mt-3 text-slate-600">
  This local workspace opens the original platform and shows V2 session/submission events returned by the browser extension.
</p>
```

Keep `AttemptStatusPanel` scoped by `(platform, externalId)` and do not add the broader Phase 0C repository/query refactor.

- [ ] **Step 4: Run the complete E2E suite**

```powershell
npm run e2e
```

Expected: all prior smoke tests plus the new protocol scenario pass with one worker, and `.tmp/playwright` is absent after teardown.

- [ ] **Step 5: Update current-state documentation**

Document:

- V2 session/submission identity and exact replay/conflict semantics;
- nullable session end and best-effort `pagehide`;
- destructive removal of synthetic V1 capture rows;
- `installationId` as non-authenticating metadata;
- V1 queue discard count/log behavior;
- explicit deferral of SPA, queue serialization, localhost credential, and production adapter certification.

Do not describe deferred capabilities as implemented.

- [ ] **Step 6: Run the complete 0B1 quality gate**

Use the bundled Node runtime if system Node 24.13 still exhibits the confirmed `fs.rmSync` defect. Run each command separately:

```powershell
npm run db:migrate
npm run test
npm run typecheck
npm run e2e
npm run extension:build
npm run build
```

Verify E2E leaves the default database existence/hash unchanged and removes `.tmp/playwright`.

- [ ] **Step 7: Inspect the final diff and commit Task 4**

```powershell
$env:GIT_MASTER='1'; git diff --check
$env:GIT_MASTER='1'; git status --short
$env:GIT_MASTER='1'; git add tests/e2e/captureFixtures.ts tests/e2e/capture-protocol.spec.ts tests/e2e/coach-growth.spec.ts components/TrainingWorkspace.tsx README.md docs/architecture.md docs/runbook.md COMPLIANCE.md
$env:GIT_MASTER='1'; git commit -m "test: verify capture protocol v2 end to end"
```

## Final Acceptance Checklist

- [ ] V1 API events are rejected and V1 extension queue entries are discarded once with a logged/persisted count.
- [ ] Open sessions are valid without `ended_at`.
- [ ] `SESSION_ENDED` never completes or classifies an attempt.
- [ ] Exact event replay is idempotent; same event ID with changed payload is HTTP 409.
- [ ] Raw events and projections commit or roll back together.
- [ ] Two identical verdicts under distinct submission IDs create distinct attempts.
- [ ] Out-of-order verdict/submission events converge to one attempt.
- [ ] Session IDs cannot cross-link different problems.
- [ ] `installationId` is documented and modeled as untrusted metadata.
- [ ] The two-problem E2E uses full page loads and makes no SPA claim.
- [ ] Migration, unit, type, E2E, extension build, and production build gates pass.
