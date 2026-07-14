# Phase 0B2 SPA and Queue Reliability Implementation Plan

**Status:** Completed and verified on 2026-07-14; retained as an implementation record.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Keep capture sessions correct across SPA/page lifecycle changes and drain the extension queue serially in order without losing events.

**Architecture:** Add a pure page-lifecycle reducer above the existing session event factories, then place a dependency-injected content runtime between that reducer and the Chrome watcher adapter. Extract a bounded queue drain and reusable serialized executor so the background worker remains the sole queue owner and never persists stale queue snapshots.

**Tech Stack:** Chrome MV3, strict TypeScript, Zod V2 capture events, Vitest/jsdom, Playwright, Next.js, SQLite.

## Global Constraints

- Do not change the V2 database schema, event envelope, or provenance level.
- Localhost credentials, pairing, origin trust, and trusted provenance are deferred to Phase 0B3.
- Do not add Chrome permissions or patch `history` in the page JavaScript world.
- Detect unobserved `pushState`/`replaceState` changes with a 500 ms URL poll fallback.
- Same problem identity is exactly `(platform, problemExternalId)`; canonical URL normalization remains Phase 0C.
- The mutation that first observes a different problem may emit lifecycle events but must not scan a verdict.
- The background worker is the only `eventQueue` writer and processes at most 25 heads per drain batch.
- Keep strict TypeScript: no `any`, `as any`, `as unknown`, suppression directives, or non-null assertions.
- Do not add external calls, new captured data categories, or real OJ traffic in tests.

---

### Task 1: Pure page lifecycle transitions

**Files:**
- Create: `extension/src/pageLifecycle.ts`
- Create: `tests/unit/extensionPageLifecycle.test.ts`

**Interfaces:**
- Consumes: `startCaptureSession`, `endCaptureSession`, `CaptureSessionState`, `CaptureRuntimeContext`, `DetectedProblem`, and `CaptureIdFactory`.
- Produces:

```ts
export type CapturePageLifecycleState = {
  readonly active?: CaptureSessionState;
};

export type CapturePageTransition = {
  readonly state: CapturePageLifecycleState;
  readonly events: readonly (SessionStartedEvent | SessionEndedEvent)[];
  readonly changed: boolean;
};

export function reconcilePageLifecycle(
  state: CapturePageLifecycleState,
  detected: DetectedProblem | null,
  context: CaptureRuntimeContext,
  occurredAt: string,
  createId: CaptureIdFactory,
): CapturePageTransition;

export function closePageLifecycle(
  state: CapturePageLifecycleState,
  reason: SessionEndedEvent["payload"]["endReason"],
  occurredAt: string,
  createId: CaptureIdFactory,
): CapturePageTransition;
```

- [ ] **Step 1: Write failing lifecycle tests**

Cover these exact cases in `tests/unit/extensionPageLifecycle.test.ts`:

```ts
it("keeps one session across routes for the same problem", () => {
  const started = reconcilePageLifecycle({}, twoSumDescription, context, t0, createId);
  const sameProblem = reconcilePageLifecycle(
    started.state,
    twoSumSubmissions,
    context,
    t1,
    createId,
  );
  expect(sameProblem.changed).toBe(false);
  expect(sameProblem.events).toEqual([]);
  expect(sameProblem.state.active?.captureSessionId).toBe("session_1");
});

it("ends the old problem before starting the next SPA problem", () => {
  const started = reconcilePageLifecycle({}, twoSum, context, t0, createId);
  const changed = reconcilePageLifecycle(started.state, validParentheses, context, t1, createId);
  expect(changed.events.map((event) => event.type)).toEqual([
    "SESSION_ENDED",
    "SESSION_STARTED",
  ]);
  expect(changed.events[0]).toMatchObject({ payload: { endReason: "spa_navigation" } });
  expect(changed.state.active?.captureSessionId).toBe("session_2");
});
```

Also assert supported-to-unsupported closes once, unsupported-to-unsupported is a no-op, `pagehide` clears the active session, and a later reconciliation creates a fresh session.

- [ ] **Step 2: Run the test and verify the missing module failure**

Run:

```powershell
npm run test -- tests/unit/extensionPageLifecycle.test.ts
```

Expected: FAIL because `extension/src/pageLifecycle.ts` does not exist.

- [ ] **Step 3: Implement the pure lifecycle reducer**

Use identity-only comparison and emit end before start:

```ts
function isSameProblem(active: CaptureSessionState, detected: DetectedProblem): boolean {
  return active.detected.platform === detected.platform
    && active.detected.problemExternalId === detected.problemExternalId;
}

if (state.active !== undefined && detected !== null && isSameProblem(state.active, detected)) {
  return { state, events: [], changed: false };
}

const ended = state.active === undefined
  ? []
  : [endCaptureSession(state.active, "spa_navigation", occurredAt, createId)];
if (detected === null) {
  return { state: {}, events: ended, changed: ended.length > 0 };
}
const started = startCaptureSession(detected, context, occurredAt, createId);
return { state: { active: started.state }, events: [...ended, started.event], changed: true };
```

`closePageLifecycle` returns `{ state: {}, events: [], changed: false }` without an active session, otherwise emits exactly one end event using the supplied reason.

- [ ] **Step 4: Run focused verification**

Run:

```powershell
npm run test -- tests/unit/extensionPageLifecycle.test.ts tests/unit/extensionCaptureSession.test.ts
npm run typecheck
```

Expected: both test files and typecheck pass.

- [ ] **Step 5: Commit Task 1**

```powershell
$env:GIT_MASTER='1'; git add extension/src/pageLifecycle.ts tests/unit/extensionPageLifecycle.test.ts
$env:GIT_MASTER='1'; git commit -m "feat: model capture page lifecycle"
```

---

### Task 2: Testable content runtime and SPA watchers

**Files:**
- Create: `extension/src/contentRuntime.ts`
- Modify: `extension/src/content.ts`
- Create: `tests/unit/extensionContentRuntime.test.ts`

**Interfaces:**
- Consumes: Task 1 lifecycle functions plus `observeSubmission` and `observeVerdict`.
- Produces:

```ts
export type CaptureContentRuntimeDependencies = {
  readonly context: CaptureRuntimeContext;
  readonly detectProblem: () => DetectedProblem | null;
  readonly detectVerdict: (platform: DetectedProblem["platform"]) => DetectedVerdict | null;
  readonly sendEvent: (event: CaptureEvent) => void;
  readonly now: () => string;
  readonly createId: CaptureIdFactory;
};

export type CaptureContentRuntime = {
  readonly start: () => void;
  readonly locationObserved: () => void;
  readonly documentMutated: () => void;
  readonly submissionObserved: () => void;
  readonly pageHidden: () => void;
  readonly pageShown: () => void;
  readonly currentState: () => CapturePageLifecycleState;
};

export function createCaptureContentRuntime(
  dependencies: CaptureContentRuntimeDependencies,
): CaptureContentRuntime;
```

- [ ] **Step 1: Write failing content-runtime tests**

In `tests/unit/extensionContentRuntime.test.ts`, inject mutable `detected` and `verdict` values plus an `events: CaptureEvent[]` collector. Assert:

```ts
runtime.start();
detected = validParentheses;
verdict = { verdict: "Wrong Answer" }; // stale old DOM text
runtime.documentMutated();
expect(events.slice(-2).map((event) => event.type)).toEqual([
  "SESSION_ENDED",
  "SESSION_STARTED",
]);
expect(events.some((event) => event.type === "VERDICT_OBSERVED"
  && event.problemExternalId === "valid-parentheses")).toBe(false);
runtime.documentMutated();
expect(events.at(-1)).toMatchObject({
  type: "VERDICT_OBSERVED",
  problemExternalId: "valid-parentheses",
});
```

Also test same-problem location observation, submission after problem change, unsupported routes, `pagehide`, and `pageshow` creating a fresh session without inventing a verdict.

- [ ] **Step 2: Run the test and verify the missing module failure**

```powershell
npm run test -- tests/unit/extensionContentRuntime.test.ts
```

Expected: FAIL because `contentRuntime.ts` does not exist.

- [ ] **Step 3: Implement `contentRuntime.ts`**

Keep mutable lifecycle state private. Use one helper that persists transitions and sends all returned events:

```ts
function reconcile(): boolean {
  const transition = reconcilePageLifecycle(
    state,
    dependencies.detectProblem(),
    dependencies.context,
    dependencies.now(),
    dependencies.createId,
  );
  state = transition.state;
  transition.events.forEach(dependencies.sendEvent);
  return transition.changed;
}
```

Keep a private `suppressNextMutationVerdict` flag. `locationObserved()` sets it when reconciliation changes problem identity. `documentMutated()` returns without scanning when reconciliation itself changes identity or when the flag is set, clearing the flag in either case. `submissionObserved()` reconciles first, clears the suppression because the click is current-page evidence, then emits a submission only when a session is active. `pageHidden()` closes with `pagehide`; `pageShown()` reconciles but does not scan a verdict.

- [ ] **Step 4: Replace `content.ts` with a narrow Chrome adapter**

After obtaining runtime context, construct the runtime with current `window.location`, `document.title`, and `document` detection functions. Install:

```ts
const NAVIGATION_POLL_MS = 500;
let lastHref = window.location.href;
let pollId: number | undefined;
let observer: MutationObserver | undefined;

function observeLocation(): boolean {
  if (window.location.href === lastHref) return false;
  lastHref = window.location.href;
  runtime.locationObserved();
  return true;
}
```

Use `popstate` and `hashchange` to call `observeLocation`, a 500 ms `window.setInterval` fallback, and a mutation observer that calls `observeLocation()` and then `runtime.documentMutated()`. The runtime suppression flag handles both event-first and mutation-first route observation. Stop poll/observer on `pagehide`; restart them and call `runtime.pageShown()` on `pageshow`. Keep a single click listener for visible submit text.

- [ ] **Step 5: Run focused verification**

```powershell
npm run test -- tests/unit/extensionContentRuntime.test.ts tests/unit/extensionPageLifecycle.test.ts tests/unit/extensionCaptureSession.test.ts tests/unit/extensionPlatforms.test.ts
npm run typecheck
npm run extension:build
```

Expected: tests, typecheck, and extension build pass.

- [ ] **Step 6: Commit Task 2**

```powershell
$env:GIT_MASTER='1'; git add extension/src/content.ts extension/src/contentRuntime.ts tests/unit/extensionContentRuntime.test.ts
$env:GIT_MASTER='1'; git commit -m "feat: capture SPA page lifecycle"
```

---

### Task 3: Serialized ordered queue drain

**Files:**
- Create: `extension/src/serializedWork.ts`
- Create: `extension/src/queueDrain.ts`
- Modify: `extension/src/background.ts`
- Create: `tests/unit/extensionSerializedWork.test.ts`
- Create: `tests/unit/extensionQueueDrain.test.ts`
- Modify: `tests/unit/extensionTransport.test.ts`

**Interfaces:**
- Consumes: `CaptureQueueItem`, `FlushResult`, `QueuePlan`, and `planQueueAfterFlush`.
- Produces:

```ts
export type SerializedWorkExecutor = {
  readonly schedule: (work: () => Promise<void>) => void;
  readonly idle: () => Promise<void>;
};

export function createSerializedWorkExecutor(
  initialization: Promise<void>,
  onError: (error: unknown) => void,
): SerializedWorkExecutor;

export type QueueDrainOutcome = {
  readonly reason: "empty" | "blocked" | "batch_limit";
  readonly processed: number;
};

export type QueueDrainDependencies = {
  readonly readQueue: () => Promise<readonly CaptureQueueItem[]>;
  readonly send: (event: CaptureQueueItem["event"]) => Promise<FlushResult>;
  readonly persist: (plan: QueuePlan) => Promise<void>;
};

export const MAX_DRAIN_BATCH_SIZE = 25;

export function drainCaptureQueue(
  dependencies: QueueDrainDependencies,
  batchSize?: number,
): Promise<QueueDrainOutcome>;
```

- [ ] **Step 1: Write failing serialized-executor tests**

Test that jobs execute in schedule order even when the first awaits a controlled promise, and that a rejected job calls `onError` while the following job still runs:

```ts
executor.schedule(async () => {
  order.push("first:start");
  await gate;
  order.push("first:end");
});
executor.schedule(async () => { order.push("second"); });
releaseGate();
await executor.idle();
expect(order).toEqual(["first:start", "first:end", "second"]);
```

- [ ] **Step 2: Write failing drain tests**

Use an in-memory queue and assert:

- three HTTP 200 events send in FIFO order and end `empty`;
- 400 and 409 heads are dropped and draining continues;
- retryable 500 increments the head and ends `blocked` without sending later events;
- capped 500 drops the head and continues;
- network error retains the head and ends `blocked`;
- batch size two with three events ends `batch_limit` and leaves one event;
- an enqueue job scheduled while drain send awaits runs afterward and its event remains/delivers rather than being overwritten.

- [ ] **Step 3: Run tests and verify missing module failures**

```powershell
npm run test -- tests/unit/extensionSerializedWork.test.ts tests/unit/extensionQueueDrain.test.ts
```

Expected: FAIL because the two implementation modules do not exist.

- [ ] **Step 4: Implement serialized executor and drain**

Executor failures must resolve the chain after reporting:

```ts
let tail = initialization.catch((error: unknown) => { onError(error); });
function schedule(work: () => Promise<void>): void {
  tail = tail.then(work).catch((error: unknown) => { onError(error); });
}
return { schedule, idle: () => tail };
```

The drain reads queue state before every head and stops only when empty, retry-blocked, or the batch limit is reached. Determine retained retry heads by comparing queue length before and after `planQueueAfterFlush`; do not compare event IDs because duplicate exact replays may legitimately be queued.

- [ ] **Step 5: Integrate background worker**

Replace the ad-hoc `captureWork` chain with `createSerializedWorkExecutor`. Replace single-head `flushQueue` with `drainCaptureQueue`. If the outcome is `batch_limit`, call `executor.schedule(flushQueue)`; do not immediately reschedule `blocked` outcomes.

Keep initialization, enqueue, alarm, endpoint parsing, HTTP mapping, and error-body behavior unchanged except for their use of the new executor/drain interfaces.

- [ ] **Step 6: Run focused verification**

```powershell
npm run test -- tests/unit/extensionSerializedWork.test.ts tests/unit/extensionQueueDrain.test.ts tests/unit/extensionTransport.test.ts tests/unit/extensionInstallation.test.ts
npm run typecheck
npm run extension:build
```

Expected: all tests, typecheck, and extension build pass.

- [ ] **Step 7: Commit Task 3**

```powershell
$env:GIT_MASTER='1'; git add extension/src/background.ts extension/src/queueDrain.ts extension/src/serializedWork.ts tests/unit/extensionQueueDrain.test.ts tests/unit/extensionSerializedWork.test.ts tests/unit/extensionTransport.test.ts
$env:GIT_MASTER='1'; git commit -m "feat: drain capture queue serially"
```

---

### Task 4: SPA-shaped E2E, current-state docs, and full gate

**Files:**
- Modify: `tests/e2e/captureFixtures.ts`
- Create: `tests/e2e/capture-spa-lifecycle.spec.ts`
- Modify: `README.md`
- Modify: `docs/architecture.md`
- Modify: `docs/runbook.md`
- Modify: `COMPLIANCE.md`

**Interfaces:**
- Consumes: V2 capture API and Task 1/2 lifecycle semantics.
- Produces: downstream proof that an old session closed with `spa_navigation` and a new open session remain isolated in SQLite and `/training`.

- [ ] **Step 1: Extend E2E event fixtures with session end**

Add this input variant and builder branch to `captureFixtures.ts`:

```ts
| {
    readonly type: "SESSION_ENDED";
    readonly eventId: string;
    readonly endReason: "spa_navigation" | "pagehide" | "capture_disabled";
    readonly occurredAt: string;
  }
```

Return a V2 event with no `submissionId` and `payload: { endReason: input.endReason }`.

- [ ] **Step 2: Add the SPA-shaped E2E**

Post, in order:

1. Two Sum session start, submission, Wrong Answer verdict, and `spa_navigation` end.
2. Valid Parentheses session start, submission, and Accepted verdict, with no end event.

Read the disposable database and assert:

```ts
expect(sessions).toEqual([
  { id: "session_e2e_spa_two_sum", end_reason: "spa_navigation" },
  { id: "session_e2e_spa_valid_parentheses", end_reason: null },
]);
expect(attempts).toEqual([
  { problem_external_id: "two-sum", verdict: "Wrong Answer" },
  { problem_external_id: "valid-parentheses", verdict: "Accepted" },
]);
```

Load each `/training` URL independently and assert its attempt panel excludes the other problem. State in the test name/comment that actual extension SPA detection is covered by unit runtime tests; this E2E validates the downstream event sequence because Playwright does not load the unpacked MV3 extension.

- [ ] **Step 3: Run E2E and isolation checks**

Record the default database SHA-256 before and after:

```powershell
npm run e2e
```

Expected: all E2E tests pass, the hash/existence state is unchanged, and `.tmp/playwright` does not exist after teardown.

- [ ] **Step 4: Update current-state documentation**

Document these exact facts:

- same-problem SPA routes retain a session; different problems emit end then start;
- URL observation uses browser events, DOM reconciliation, and a 500 ms poll fallback;
- `pagehide` remains best effort and BFCache `pageshow` starts a fresh observed session;
- queue drain is FIFO, serialized, bounded to 25 per batch, and stops on retryable failures;
- localhost credentials and trusted provenance remain deferred to 0B3;
- the E2E simulates the downstream SPA event sequence while unit tests cover the extension runtime itself.

Remove statements that SPA capture is wholly deferred, but do not claim a production-certified adapter.

- [ ] **Step 5: Run the complete quality gate**

Use the bundled Node runtime and run each command separately/fail-fast:

```powershell
npm run db:migrate
npm run test
npm run typecheck
npm run e2e
npm run extension:build
npm run build
```

Expected: every command exits 0; E2E leaves the default database unchanged and removes `.tmp/playwright`.

- [ ] **Step 6: Inspect and commit Task 4**

```powershell
$env:GIT_MASTER='1'; git diff --check
$env:GIT_MASTER='1'; git add tests/e2e/captureFixtures.ts tests/e2e/capture-spa-lifecycle.spec.ts README.md docs/architecture.md docs/runbook.md COMPLIANCE.md
$env:GIT_MASTER='1'; git commit -m "test: verify SPA capture lifecycle"
```

## Plan Self-Review

- Every 0B2 design requirement maps to one of the four tasks.
- SPA identity, stale-verdict suppression, pagehide/pageshow, serialization, retry stops, batch continuation, E2E boundary, and documentation are explicit.
- 0B3 security work and 0C canonicalization are excluded consistently.
- Interfaces use the same names and types across producer and consumer tasks.
- No placeholders or unbounded refactors remain.
