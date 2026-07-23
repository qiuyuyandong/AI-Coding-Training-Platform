# V0 Verdict-Gated Capture Repair Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Do not delegate unless the user explicitly authorizes subagents. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace page-event FIFO capture with verdict-gated atomic attempt bundles, clear the current 32 invalid legacy queue entries through an idempotent extension migration, and make completed attempts locally durable without head-of-line blocking.

**Architecture:** The content script records an exact-submit intent locally and emits no server traffic until an evidence-backed final verdict appears after that intent. The background worker converts the intent plus verdict into one stable four-event bundle, persists it in an outbox, and sends it to a new atomic local API; global connectivity/authentication failures pause delivery only, while item-specific failures move one bundle to quarantine and allow later bundles to continue. Extension protocol version 3 clears every V2 `eventQueue` entry once because old events cannot prove the new submit-to-verdict causal contract.

**Tech Stack:** TypeScript 5.8 strict mode, Chrome MV3 storage/runtime/alarms, Zod 3, Next.js 15 App Router route handlers, better-sqlite3 transactions, Vitest, Playwright.

**Execution status (2026-07-24): COMPLETE.** The V3 implementation, ACK repair,
cross-platform verdict foundation, extension lifecycle repair, popup feedback,
and current LeetCode semantic TLE repair are engineering-green. The one-time
migration cleared 32 legacy entries. A bounded real-Chrome recovery against the
user's existing TLE result produced `Time Limit Exceeded` / `partial`, received
a matching ACK, and returned every extension queue to zero. On 2026-07-24 the
user confirmed the same LeetCode case passes through a fresh natural submission
on implementation commit `2f4f5d895ea8d965fb64d19dc784ca5514480688`.
Formal multi-session observation and V0 acceptance remain pending. Evidence:
`work/reports/v0-leetcode-tle-semantic-result-repair-2026-07-23.md`.
V0.5 remains out of scope.

## Global Constraints

- Do not read cookies, tokens, passwords, source code, full commercial problem statements, localStorage login data, hidden DOM, or account submission history.
- Preserve `POST /api/capture/events` for backward compatibility; the repaired extension must use `POST /api/capture/attempts` for all new completed attempts.
- Keep AtCoder as the sole `production` adapter; LeetCode, NowCoder, Codeforces, and Luogu remain `experimental`.
- Keep TypeScript strict: no `any`, `as any`, `as unknown`, `@ts-ignore`, `@ts-expect-error`, or non-null assertions.
- Do not silently evict outbox or quarantine items.
- The user explicitly authorized deletion of all current legacy `eventQueue` entries (observed count: 32); implement deletion by versioned `chrome.storage.local` migration, never by editing Chrome LevelDB.
- Do not modify server-side historical attempts or capture events during the extension migration.
- Prefix every Git command with `$env:GIT_MASTER='1';`.
- Do not commit, push, or create a PR unless the user separately authorizes it. Commit steps below are authorization gates, not implicit permission.

---

### Task 1: Define and atomically ingest a completed capture attempt

**Files:**
- Create: `lib/capture/attemptBundle.ts`
- Create: `lib/services/captureAttemptBundle.ts`
- Create: `lib/services/normalizeCaptureEvent.ts`
- Create: `lib/http/captureRouteError.ts`
- Create: `app/api/capture/attempts/route.ts`
- Modify: `app/api/capture/events/route.ts`
- Create: `tests/unit/captureAttemptBundle.test.ts`
- Create: `tests/unit/captureAttemptApi.test.ts`

**Interfaces:**
- Produces: `CaptureAttemptBundleSchema`, `CaptureAttemptBundle`, `CaptureAttemptAckSchema`, `CaptureAttemptAck`, `ingestCaptureAttemptBundle(db, bundle, options)`.
- Produces: `normalizeCaptureEvent(event: CaptureEvent): CaptureEvent`, shared by both capture routes.
- Produces: `captureRouteErrorResponse(error: unknown)`, preserving the existing 400/401/409/500 mappings for both capture routes.
- HTTP: `POST /api/capture/attempts` accepts one strict bundle and returns `{ ok: true, bundleId, captureSessionId, attemptId, attemptStatus, replayed }`.

- [x] **Step 1: Write failing schema tests for exact bundle shape and identity invariants**

```ts
const bundle = attemptBundle();
expect(CaptureAttemptBundleSchema.parse(bundle)).toEqual(bundle);
expect(() => CaptureAttemptBundleSchema.parse({
  ...bundle,
  events: [bundle.events[1], bundle.events[0], bundle.events[2], bundle.events[3]],
})).toThrow();
expect(() => CaptureAttemptBundleSchema.parse({
  ...bundle,
  events: [bundle.events[0], {
    ...bundle.events[1],
    submissionId: "submission_other",
  }, bundle.events[2], bundle.events[3]],
})).toThrow();
```

- [x] **Step 2: Run the focused schema test and verify the missing-module failure**

Run: `npx vitest run tests/unit/captureAttemptBundle.test.ts`

Expected: FAIL because `@/lib/capture/attemptBundle` does not exist.

- [x] **Step 3: Implement the strict tuple schema and ACK schema**

```ts
export const CaptureAttemptBundleSchema = z.object({
  schemaVersion: z.literal(1),
  bundleId: z.string().min(1),
  events: z.tuple([
    SessionStartedEventSchema,
    SubmissionObservedEventSchema,
    VerdictObservedEventSchema,
    SessionEndedEventSchema,
  ]),
}).strict().superRefine((bundle, context) => {
  const [started, submitted, verdict, ended] = bundle.events;
  const sameSession = bundle.events.every(
    (event) => event.captureSessionId === started.captureSessionId
      && event.installationId === started.installationId
      && event.platform === started.platform
      && event.problemExternalId === started.problemExternalId,
  );
  if (!sameSession
    || submitted.submissionId !== verdict.submissionId
    || submitted.occurredAt > verdict.occurredAt
    || verdict.occurredAt > ended.occurredAt) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Capture attempt bundle identity or chronology is inconsistent",
    });
  }
});
```

The ACK schema must require `ok: true`, the same `bundleId`, a non-empty `captureSessionId` and `attemptId`, an `AttemptResultSchema` status, and `replayed: boolean`.

- [x] **Step 4: Write failing service tests for atomic success, rollback, and exact replay**

```ts
const first = ingestCaptureAttemptBundle(db, attemptBundle(), { now });
expect(first).toMatchObject({ attemptStatus: "passed", replayed: false });
expect(rowCount(db, "capture_events")).toBe(4);
expect(rowCount(db, "training_attempts")).toBe(1);

const replay = ingestCaptureAttemptBundle(db, attemptBundle(), { now });
expect(replay.replayed).toBe(true);
expect(rowCount(db, "capture_events")).toBe(4);

expect(() => ingestCaptureAttemptBundle(db, conflictingFinalEventBundle(), { now }))
  .toThrow(CaptureConflictError);
expect(rowCount(db, "capture_events")).toBe(4);
expect(rowCount(db, "training_attempts")).toBe(1);
```

- [x] **Step 5: Implement one outer SQLite transaction and return the verdict projection**

```ts
export function ingestCaptureAttemptBundle(
  db: Database.Database,
  input: CaptureAttemptBundle,
  options: CaptureIngestOptions = {},
): CaptureAttemptAck {
  const bundle = CaptureAttemptBundleSchema.parse(input);
  return db.transaction(() => {
    const results = bundle.events.map((event) =>
      ingestCaptureEvent(db, event, options));
    const verdictResult = results[2];
    if (verdictResult.attemptId === undefined
      || verdictResult.attemptStatus === undefined) {
      throw new Error("Verdict event did not materialize a training attempt");
    }
    return CaptureAttemptAckSchema.parse({
      ok: true,
      bundleId: bundle.bundleId,
      captureSessionId: verdictResult.captureSessionId,
      attemptId: verdictResult.attemptId,
      attemptStatus: verdictResult.attemptStatus,
      replayed: results.every((result) => result.replayed),
    });
  })();
}
```

- [x] **Step 6: Extract event normalization/error mapping and write failing route tests**

Move the existing platform/external-ID/canonical-URL normalization from `app/api/capture/events/route.ts` into `normalizeCaptureEvent`. Move the route catch mapping into `captureRouteErrorResponse`, with explicit branches for `CaptureRequestError`, `CaptureCredentialAuthenticationError`, `CanonicalProblemUrlError`, and `CaptureConflictError`, plus the existing 500 fallback. Test the new route for: missing/mismatched/revoked credential (401), explicit web origin (403), invalid media/body/bundle (415/413/400), atomic success (200), exact replay (200), changed event under reused ID (409), and thrown materialization failure (500 with zero partial rows).

- [x] **Step 7: Implement `POST /api/capture/attempts` without weakening the old route**

```ts
export async function POST(request: Request) {
  try {
    requireExtensionOrMissingOrigin(request);
    const credential = readBearerCredential(request);
    const parsed = CaptureAttemptBundleSchema.safeParse(
      await readBoundedJson(request),
    );
    if (!parsed.success) {
      return NextResponse.json(
        { ok: false, error: "Invalid capture attempt bundle", issues: parsed.error.issues },
        { status: 400 },
      );
    }
    const bundle = CaptureAttemptBundleSchema.parse({
      ...parsed.data,
      events: parsed.data.events.map(normalizeCaptureEvent),
    });
    const db = openDatabase();
    try {
      const result = db.transaction(() => {
        authorizeCaptureInstallation(
          db,
          credential,
          bundle.events[0].installationId,
        );
        const ingested = ingestCaptureAttemptBundle(db, bundle);
        touchCaptureInstallation(
          db,
          bundle.events[0].installationId,
          new Date().toISOString(),
        );
        return ingested;
      })();
      return NextResponse.json(result);
    } finally {
      db.close();
    }
  } catch (error) {
    return captureRouteErrorResponse(error);
  }
}
```

Share only error mapping that is truly identical; do not broaden origin or credential acceptance.

- [x] **Step 8: Run focused server tests**

Run: `npx vitest run tests/unit/captureAttemptBundle.test.ts tests/unit/captureAttemptApi.test.ts tests/unit/captureApi.test.ts tests/unit/captureMaterializer.test.ts`

Expected: all tests PASS; old single-event API behavior remains covered.

- [ ] **Step 9: Authorization-gated commit checkpoint**

If and only if the user authorizes commits:

```powershell
$env:GIT_MASTER='1'; git add lib/capture/attemptBundle.ts lib/services/captureAttemptBundle.ts lib/services/normalizeCaptureEvent.ts lib/http/captureRouteError.ts app/api/capture/attempts/route.ts app/api/capture/events/route.ts tests/unit/captureAttemptBundle.test.ts tests/unit/captureAttemptApi.test.ts
$env:GIT_MASTER='1'; git commit -m "feat(capture): ingest completed attempts atomically"
```

Otherwise leave the verified changes uncommitted.

---

### Task 2: Replace page lifecycle events with a submit-to-verdict state machine

**Files:**
- Create: `extension/src/attemptCapture.ts`
- Modify: `extension/src/contentRuntime.ts`
- Modify: `extension/src/content.ts`
- Modify: `extension/src/platforms.ts`
- Delete: `extension/src/pageLifecycle.ts`
- Delete: `extension/src/captureSession.ts`
- Create: `tests/unit/extensionAttemptCapture.test.ts`
- Rewrite: `tests/unit/extensionContentRuntime.test.ts`
- Modify: `tests/unit/extensionPlatforms.test.ts`
- Delete: `tests/unit/extensionPageLifecycle.test.ts`
- Delete: `tests/unit/extensionCaptureSession.test.ts`

**Interfaces:**
- Produces: `SubmissionIntentMessage`, `VerdictCandidateMessage`, `CaptureRuntimeMessage`, and strict type guards.
- Produces: `isExactSubmissionResultPage(location, document, detectedProblem): boolean`.
- Content runtime emits no `CaptureEvent`; it emits one intent message on exact submit and one candidate message only after valid post-submit transition evidence.

- [x] **Step 1: Write the failing pure-state tests**

Pin these cases:

```ts
expect(openThenClose().messages).toEqual([]);
expect(runOrDebugClick().messages).toEqual([]);
expect(exactSubmit({ baselineVerdict: null }).messages)
  .toHaveLength(1);
expect(exactSubmitThenVerdict("Accepted").messages.map((message) => message.type))
  .toEqual(["SUBMISSION_INTENT_OBSERVED", "VERDICT_CANDIDATE_OBSERVED"]);
expect(exactSubmitWithStaleVerdict("Accepted").messages)
  .toHaveLength(1);
expect(staleVerdictThenClearThenSameVerdict().messages.map((message) => message.type))
  .toEqual(["SUBMISSION_INTENT_OBSERVED", "VERDICT_CANDIDATE_OBSERVED"]);
expect(directOpenHistoricalVerdict().messages).toEqual([
  expect.objectContaining({ type: "VERDICT_CANDIDATE_OBSERVED" }),
]);
```

- [x] **Step 2: Run the test and verify it fails before implementation**

Run: `npx vitest run tests/unit/extensionAttemptCapture.test.ts tests/unit/extensionContentRuntime.test.ts`

Expected: FAIL because the new message/state interfaces do not exist.

- [x] **Step 3: Implement strict runtime messages**

```ts
export type SubmissionIntentMessage = {
  readonly type: "SUBMISSION_INTENT_OBSERVED";
  readonly intent: SubmissionIntentDraft;
};

export type VerdictCandidateMessage = {
  readonly type: "VERDICT_CANDIDATE_OBSERVED";
  readonly candidate: {
    readonly installationId: string;
    readonly platform: DetectedProblem["platform"];
    readonly problemExternalId: string;
    readonly verdict: string;
    readonly observedAt: string;
    readonly transitionEvidence: "same_document_transition" | "exact_result_document";
  };
};
```

`SubmissionIntentDraft` contains stable IDs, normalized problem identity, submit time, and optional baseline verdict, but no document identity. `PendingSubmissionIntent` adds `sourceDocumentId` and `status: "active"`; only the background worker may construct it from trusted `sender.documentId`.

- [x] **Step 4: Implement the no-page-events content runtime**

`pageHidden`, ordinary problem-page location changes, and unsupported routes emit no message. `submissionObserved` reads the current verdict as a baseline and emits one intent. Same-document verdict emission requires either a different non-null verdict or a null/Waiting/Judging phase after the submit. On startup or navigation to an exact result document, a visible final verdict may emit a candidate, but the background must reject it without a matching stored intent; this internal candidate is not a queue item or training record.

- [x] **Step 5: Export and test exact result-page evidence**

Reuse the already strict AtCoder and domestic result route parsing. Do not infer result pages from titles or generic `/submissions` list routes. Test exact first-party result URLs, spoofed hosts, extra query/hash values, problem pages, result lists, login pages, and ambiguous DOM identities.

- [x] **Step 6: Rewire `content.ts`**

Keep the exact submit-control guard. Pass `document`, `window.location`, `now`, and ID factory to the runtime. Send only strict runtime messages via `chrome.runtime.sendMessage`; do not send `CAPTURE_EVENT`.

- [x] **Step 7: Run focused runtime and detector tests**

Run: `npx vitest run tests/unit/extensionAttemptCapture.test.ts tests/unit/extensionContentRuntime.test.ts tests/unit/extensionPlatforms.test.ts tests/unit/extensionSubmissionControl.test.ts`

Expected: all tests PASS, including no event for page open/close and no historical verdict import.

- [ ] **Step 8: Authorization-gated commit checkpoint**

If authorized, commit with `fix(extension): gate capture on submitted verdicts`; otherwise leave uncommitted.

---

### Task 3: Persist intents, build stable bundles, and clear all V2 queue entries once

**Files:**
- Create: `extension/src/attemptStorage.ts`
- Modify: `extension/src/installation.ts`
- Modify: `tests/unit/extensionInstallation.test.ts`
- Create: `tests/unit/extensionAttemptStorage.test.ts`

**Interfaces:**
- Produces: `CAPTURE_PROTOCOL_VERSION = 3`.
- Produces: `planExtensionInitialization` with `pendingSubmissionIntents`, `captureOutbox`, `captureQuarantine`, `discardedPreBundleEventCount`, `preBundleQueueDiscardedAt`.
- Produces: `recordSubmissionIntent`, `consumeVerdictCandidate`, `buildCaptureAttemptBundle`, `expireSubmissionIntents` as pure functions.

- [x] **Step 1: Replace the old “preserve V2 queue” test with the authorized cutover test**

```ts
const thirtyTwo = Array.from({ length: 32 }, (_value, index) => ({
  event: legacyEvent(`event_${index}`),
  attempts: 0,
}));
const plan = planExtensionInitialization({
  captureProtocolVersion: 2,
  eventQueue: thirtyTwo,
  installationId: "installation_existing",
}, options);
expect(plan).toMatchObject({
  captureProtocolVersion: 3,
  eventQueue: [],
  discardedPreBundleEventCount: 32,
  preBundleQueueDiscardedAt: options.now,
  captureOutbox: [],
  captureQuarantine: [],
});
```

Also test that a second V3 initialization preserves a new outbox and does not increment the discarded count again.

- [x] **Step 2: Run initialization tests and verify the old preservation assertion fails**

Run: `npx vitest run tests/unit/extensionInstallation.test.ts`

Expected: FAIL until protocol 3 migration is implemented.

- [x] **Step 3: Implement the idempotent V3 migration**

The initialization storage write must set the new arrays and remove `eventQueue` with `chrome.storage.local.remove("eventQueue")` after the V3 state is durably set. `discardedPreBundleEventCount` is derived from the actual old array length; never hard-code 32. Preserve installation ID, capture enabled flag, endpoint, and credential.

- [x] **Step 4: Write pure intent matching and bundle construction tests**

Test:

- one active intent per installation/platform/problem;
- a new submit marks the previous intent `superseded` and becomes active;
- a verdict for another problem does nothing;
- a historical candidate before submit time does nothing;
- a same-document candidate without transition evidence does nothing;
- an exact result-document candidate consumes the matching active intent;
- an intent older than 24 hours becomes `expired`;
- bundle retry uses stable IDs and exactly four ordered events.

- [x] **Step 5: Implement the pure storage planners and capacity check**

```ts
export function canPersistCaptureBytes(input: {
  readonly quotaBytes: number;
  readonly bytesInUse: number;
  readonly estimatedWriteBytes: number;
}): boolean {
  return input.bytesInUse + input.estimatedWriteBytes
    <= input.quotaBytes - 256 * 1024;
}
```

Bundle construction must use submit time for session/submission, verdict time for verdict/end, and reuse the intent IDs. JSON byte estimation must use `new TextEncoder().encode(JSON.stringify(value)).byteLength`.

- [x] **Step 6: Run focused storage tests**

Run: `npx vitest run tests/unit/extensionInstallation.test.ts tests/unit/extensionAttemptStorage.test.ts`

Expected: all tests PASS, including exact deletion count 32 in the fixture and idempotent V3 initialization.

- [ ] **Step 7: Authorization-gated commit checkpoint**

If authorized, commit with `fix(extension): migrate legacy queue to verdict-gated storage`; otherwise leave uncommitted.

---

### Task 4: Implement non-blocking outbox delivery and quarantine

**Files:**
- Create: `extension/src/captureTransport.ts`
- Create: `extension/src/outboxDrain.ts`
- Delete: `extension/src/transport.ts`
- Delete: `extension/src/queueDrain.ts`
- Rewrite: `tests/unit/extensionTransport.test.ts`
- Rewrite: `tests/unit/extensionQueueDrain.test.ts` as `tests/unit/extensionOutboxDrain.test.ts`

**Interfaces:**
- Produces: `CaptureOutboxItem`, `CaptureQuarantineItem`, `CaptureAttemptFlushResult`, `postCaptureAttemptBundle` support helpers.
- Produces: `drainCaptureOutbox(dependencies, batchSize)` returning `empty`, `global_blocked`, or `batch_limit`.

- [x] **Step 1: Write failure-classification tests**

```ts
expect(planOutboxAfterFlush(state, successAck())).toMatchObject({
  outbox: [],
  quarantine: [],
  clearLastCaptureError: true,
});
expect(planOutboxAfterFlush(state, networkError()).outbox).toHaveLength(2);
expect(planOutboxAfterFlush(state, unauthorized()).outbox).toHaveLength(2);
expect(planOutboxAfterFlush(state, invalidBundle())).toMatchObject({
  outbox: [secondItem],
  quarantine: [expect.objectContaining({ item: firstItem })],
});
```

Pin 400/409/413/415 as item quarantine, 401/403/network as global block with no item removal, and 500 as capped retry followed by quarantine.

- [x] **Step 2: Write the head-of-line regression test**

The first item returns 400, the second returns 200. Assert both are attempted in one drain, the first is quarantined, the second is removed, and the outcome is `empty`.

- [x] **Step 3: Implement strict transport parsing**

Build the attempt endpoint from the configured event endpoint by replacing `/api/capture/events` with `/api/capture/attempts`; reject unrelated endpoint paths by falling back to the local default. Reuse the credential header behavior. Validate a 2xx body with `CaptureAttemptAckSchema` and require matching `bundleId`.

- [x] **Step 4: Implement outbox draining**

Each loop must reread storage before sending and before persisting, preserving events recorded while fetch is pending. Stop on global failures because later items use the same unavailable transport; continue after quarantining an item-specific failure. Schedule another executor turn on `batch_limit`.

- [x] **Step 5: Add pure actions for retry/delete/clear**

`retryQuarantined(id)` moves exactly one item to the end of outbox with attempts reset. `deleteQuarantined(id)`, `clearOutbox()`, and `clearQuarantine()` return counts for confirmation UI. None may clear pairing state or server records.

- [x] **Step 6: Run transport/outbox tests**

Run: `npx vitest run tests/unit/extensionTransport.test.ts tests/unit/extensionOutboxDrain.test.ts`

Expected: all tests PASS; no strict FIFO poison-item regression remains.

- [ ] **Step 7: Authorization-gated commit checkpoint**

If authorized, commit with `fix(extension): isolate failed attempt bundles`; otherwise leave uncommitted.

---

### Task 5: Integrate the background worker and recovery controls

**Files:**
- Modify: `extension/src/background.ts`
- Modify: `extension/src/popup.ts`
- Modify: `extension/src/popup.html`
- Rewrite: `tests/unit/extensionPopup.test.ts`
- Create: `tests/unit/extensionBackgroundMessages.test.ts`

**Interfaces:**
- Background consumes `SUBMISSION_INTENT_OBSERVED`, `VERDICT_CANDIDATE_OBSERVED`, `RETRY_CAPTURE_OUTBOX`, `RETRY_QUARANTINED_CAPTURE`, `DELETE_QUARANTINED_CAPTURE`, `CLEAR_CAPTURE_OUTBOX`, and `CLEAR_CAPTURE_QUARANTINE`.
- Popup presentation exposes `pendingText`, `outboxText`, `quarantineText`, `lastSyncText`, `blockingReasonText`, and migration summary.

- [x] **Step 1: Write background orchestration tests with fake storage**

Prove:

- intent persists but no fetch occurs;
- a matching verdict creates one bundle and triggers one drain;
- an unmatched historical verdict creates nothing;
- a 401 retains outbox, pairing success schedules drain, and success clears it;
- a 400 quarantines one item and sends the next;
- initialization with 32 old entries stores a deletion count of 32 and removes `eventQueue`.

- [x] **Step 2: Split background operations into serialized commands**

All state-changing messages and alarm delivery must use the existing serialized executor. Use `sender.documentId` when available to distinguish same-document transitions from exact result-document navigation; never trust a document ID supplied by page script data.

- [x] **Step 3: Rewrite popup presentation tests first**

```ts
expect(presentPopupState({
  pendingSubmissionIntents: [activeIntent],
  captureOutbox: [outboxItem],
  captureQuarantine: [quarantineItem],
  discardedPreBundleEventCount: 32,
})).toMatchObject({
  pendingText: "等待判题 1",
  outboxText: "待同步结果 1",
  quarantineText: "已隔离结果 1",
  migrationText: "已清除旧误采集记录 32 条",
});
```

- [x] **Step 4: Implement popup controls with explicit confirmations**

Render separate sections and buttons. Use `window.confirm` with counts before clearing outbox or quarantine. Highlight re-pair only for 401. Show platform, problem ID, verdict, occurred time, and error summary for quarantine; never show code, full statements, credentials, or raw authorization headers.

- [x] **Step 5: Ensure automatic triggers are complete**

Drain on initialization, new completed attempt, successful pairing, the one-minute alarm, and manual retry. Capture stays enabled during global delivery failures. Clear stale error only after a successful ACK or an explicit state-clearing action.

- [x] **Step 6: Run focused extension integration tests**

Run: `npx vitest run tests/unit/extensionBackgroundMessages.test.ts tests/unit/extensionPopup.test.ts tests/unit/extensionInstallation.test.ts tests/unit/extensionOutboxDrain.test.ts`

Expected: all tests PASS, including the authorized 32-item cutover case.

- [x] **Step 7: Build the extension and inspect the generated popup**

Run: `npm run extension:check`

Expected: typecheck, extension unit tests, MV3 build, dist parity, and ignored-dist checks all PASS.

- [x] **Step 8: Reload the unpacked extension to execute the one-time cleanup**

After `extension/dist` is rebuilt, reload that exact unpacked extension in Chrome. Open the popup and verify it reports `已清除旧误采集记录 32 条`, `待同步结果 0`, and no remaining legacy `eventQueue` count. This is the authorized destructive action; record the observed count, but do not claim it until actually seen.

- [ ] **Step 9: Authorization-gated commit checkpoint**

If authorized, commit with `fix(extension): surface verdict outbox recovery`; otherwise leave uncommitted.

---

### Task 6: Replace obsolete E2E assumptions and verify the repaired capture boundary

**Files:**
- Modify: `tests/e2e/captureFixtures.ts`
- Create: `tests/e2e/capture-attempt-bundle.spec.ts`
- Modify: `tests/e2e/capture-atcoder-problem.spec.ts`
- Modify: `tests/e2e/capture-luogu-problem.spec.ts`
- Modify: `tests/e2e/capture-multi-platform-identity.spec.ts`
- Delete: `tests/e2e/capture-spa-lifecycle.spec.ts`
- Modify: `README.md`
- Modify: `docs/architecture.md`
- Modify: `docs/runbook.md`
- Modify: `work/handoff-current.md`
- Modify: `work/reports/v0-engineering-gates.md`

**Interfaces:**
- E2E posts atomic bundles and verifies one final attempt per bundle.
- Documentation describes verdict-gated causality, local outbox/quarantine, and the V3 legacy queue cutover.

- [x] **Step 1: Add an E2E bundle factory and failing atomic API test**

Post one AC bundle and assert `/training` shows one completed captured attempt. Replay the exact bundle and assert it still shows one. Post a failing bundle with a conflicting final event and assert no partial new session/attempt/event rows are committed.

- [x] **Step 2: Update platform identity E2E to use complete attempt bundles**

Keep the existing platform canonical identity assertions. Stop treating `SESSION_STARTED + SUBMISSION_OBSERVED` as the public capture unit. Assert LeetCode.cn, NowCoder, Luogu, and AtCoder verdict bundles materialize to their normalized problem identities.

- [x] **Step 3: Remove the obsolete server-side SPA lifecycle smoke test**

SPA/pagehide behavior is now a pure extension state-machine concern and must remain covered in `extensionAttemptCapture.test.ts`; do not send page lifecycle events merely to preserve an obsolete E2E.

- [x] **Step 4: Run focused E2E**

Run: `npx playwright test tests/e2e/capture-attempt-bundle.spec.ts tests/e2e/capture-atcoder-problem.spec.ts tests/e2e/capture-luogu-problem.spec.ts tests/e2e/capture-multi-platform-identity.spec.ts`

Expected: all selected tests PASS under the Playwright-owned server and disposable database.

- [x] **Step 5: Reconcile docs without claiming acceptance**

Document that old client events remain server-compatible, new extension capture is verdict-gated, the current 32-item cleanup was user-authorized, and real OJ submission observation is still pending. Mark `894162b...` superseded only after a new implementation commit is explicitly authorized and created.

- [x] **Step 6: Run the authoritative verification sequence**

```powershell
npm run extension:check
npm run lint
npm run db:migrate
npm run test
npm run typecheck
npm run e2e
npm run build
npm run quality:gate
```

Record exact file/test/pass/skip counts from command output. Do not infer unrun checks as passing.

- [ ] **Step 7: Perform the bounded real-browser checks**

With the repaired unpacked extension and local app:

1. Open and close a supported problem without submitting; verify waiting/outbox/quarantine counts remain unchanged.
2. Run or debug without submitting; verify counts remain unchanged.
3. Perform one user-authorized real submission and observe the final verdict; verify “等待判题” becomes “待同步结果” and then one `/training` record.
4. Exercise a safe offline or invalid-endpoint simulation; verify a completed result remains local while a later result can still be recorded, then restore the endpoint and verify automatic drain.

Do not fabricate any result that requires the user to submit on an external OJ.

### Report 03 follow-up: LeetCode.cn `执行出错`

- [x] Reproduce the user-observed gap: the narrow LeetCode result node returned no verdict for the exact label `执行出错`, leaving the active intent waiting.
- [x] Map only the LeetCode label `执行出错` to protocol verdict `Runtime Error`; do not extrapolate the label to other adapters or scan outside the registered result node.
- [x] Add parser false-positive guards and a task-document intent → result-document first-frame `执行出错` → consumed intent → `Runtime Error` bundle regression.
- [x] Run the focused tests and `npm run extension:check`: 2 focused files / 107 tests and 18 extension files / 433 tests PASS; typecheck, MV3 build, and dist parity PASS.
- [x] Re-run `npm run quality:gate` after the user-owned development server releases port 3000. The authoritative rerun exits 0: lint, migration, curriculum validation, 67 unit files / 1006 passed / 1 capability skip, typecheck, 25 Playwright E2E, 18 extension files / 433 passed, MV3 build/dist parity, and the 20/20-page production build all PASS.
- [ ] Reload the repaired `extension/dist` and repeat one user-performed LeetCode.cn submission whose final result is exactly `执行出错`; verify waiting becomes one completed attempt with verdict `Runtime Error` and the existing taxonomy's result `partial`, and the outbox returns to zero without repeated requests.

### Report 03 follow-up 2: cross-platform verdict foundation

- [x] Record the failed real retest: LeetCode.cn `超出时间限制` produced no completed attempt and left the active pending intent visible, proving the LeetCode-only label patch was not a sufficient root fix.
- [x] Reproduce the actual SPA defect: after a local submit, a same-problem result-route transition in the same Chrome document was labelled `exact_result_document` and rejected by the background document-identity guard.
- [x] Retain local submit causality across same-document SPA navigation and emit `same_document_transition`; keep genuinely new result documents on the strict cross-document path.
- [x] Replace platform-specific verdict wording branches with one trusted-region taxonomy covering accepted/partial, time/memory/output/idleness limits, runtime, wrong-answer, presentation, compile, judge/system error, and `Other Failure`.
- [x] Keep waiting/judging/running/queue/compiling/testing/submitted states non-final. Keep page-body scanning forbidden and preserve narrative/summary false-positive guards.
- [x] Expand the atomic-bundle final-verdict whitelist and result projection: resource/runtime failures → `partial`, judge/system failures → `stuck`, other failures → `failed`.
- [x] Bump parser evidence to `atomic-bundle-verdict@0.2.0` and make bundle construction consume the exported parser version instead of a duplicate literal.
- [x] Run pending-intent expiry from the minute maintenance alarm; the previous implementation only expired during initialization.
- [x] Prove the focused lifecycle: same document submit → SPA route → `超出时间限制` → `Time Limit Exceeded` candidate → pending removed → one outbox bundle. Focused results: 3 extension files / 125 tests and 2 protocol files / 24 tests PASS.
- [x] Run `npm run extension:check`: 18 files / 439 tests PASS; typecheck, MV3 build, and dist parity PASS.
- [x] Run `npm run quality:gate`: exit 0; lint, disposable migration, curriculum validation, 67 unit files / 1014 passed / 1 capability skip, typecheck, 25 Playwright E2E, 18 extension files / 439 passed, MV3 build/dist parity, and 20/20-page production build PASS.
- [ ] Reload the rebuilt `extension/dist` and perform one user-authorized LeetCode.cn submission ending in `超出时间限制`. Verify `等待判题` returns to zero, one `Time Limit Exceeded` / `partial` attempt appears in `/training`, outbox returns to zero, and no timer resends it.
- [ ] After the TLE check passes, perform one different supported non-AC result if convenient; record the exact visible label and normalized category. Do not fabricate an external submission or treat this optional characterization as production certification.

### Report 03 follow-up 3: real result route, extension startup, and popup feedback

- [x] Reproduce the screenshot URL gap with a failing test for
  `/problems/two-sum/submissions/737484505/`; the prior exact-result check
  returned false even though problem identity and TLE verdict were available.
- [x] Recognize strict problem-scoped LeetCode result routes on `.cn` and `.com`
  while rejecting adjacent, malformed, noisy, and spoofed URLs.
- [x] Prove a task-document intent → new real-shape result document →
  first-frame TLE → consumed intent → atomic outbox bundle lifecycle.
- [x] Reproduce background initialization failure when
  `chrome.storage.local.setAccessLevel` is unavailable and capability-check the
  optional API without weakening supported-browser trusted-only storage.
- [x] Contain rejected content/popup Chrome promises and add pressed-state plus
  live-text feedback to popup action buttons.
- [x] Load the unpacked extension in isolated Chromium and prove initialization,
  `active 1 → 0`, `outbox 0 → 1`, normalized `Time Limit Exceeded`, button
  feedback, and zero captured page/popup/worker errors using synthetic HTML.
- [x] Run `npm run extension:check`: 19 files / 453 tests PASS; typecheck, MV3
  build, and dist parity PASS.
- [x] Run `npm run quality:gate`: exit 0; 68 unit files / 1028 passed / 1
  capability skip, 25 Playwright E2E, 19 extension files / 453 passed, lint,
  migration, curriculum validation, typecheck, MV3 build/dist parity, and
  20/20-page production build PASS.
- [ ] Reload the exact rebuilt `extension/dist` in the user's real Chrome,
  clear/inspect the extension error list, and repeat one TLE submission. Verify
  waiting returns to zero, one completed attempt synchronizes, outbox returns
  to zero, and no new extension error or timer resend appears.

### Report 03 follow-up 4: real Chrome content-context invalidation

- [x] Use the user-authorized Chrome extension manager to inspect the exact
  stored errors without reading cookies, account data, source code, or other
  tab contents. Both entries were content-script `Extension context
  invalidated` failures on LeetCode result pages; the service worker was not
  the source.
- [x] Put initialization, asynchronous messages, and every DOM/navigation/
  mutation/timer callback behind a shared lifecycle boundary. A stale
  content-script runtime now retires on its first failure; expected extension
  reload invalidation is silent and unrelated failures remain reportable.
- [x] Add three focused regressions for cross-realm invalidation recognition,
  silent retirement, and visible unexpected-failure retirement.
- [x] Run the focused extension tests: 2 files / 18 tests PASS.
- [x] Run `npm run extension:check`: 19 files / 456 tests PASS; typecheck, MV3
  build, and dist parity PASS.
- [x] In the real Chrome, reload the rebuilt `extension/dist`, clear the two old
  errors, refresh the already-open LeetCode result page, and return to the
  extension manager. No new `Errors` button or error entry appeared.
- [x] Run the final authoritative `npm run quality:gate`: exit 0; lint,
  disposable migration, curriculum validation, 68 unit files / 1031 passed /
  1 Windows file-symlink capability skip, typecheck, 25 Playwright E2E,
  19 extension files / 456 passed, MV3 build/dist parity, and the 20/20-page
  production build all PASS.

### Report 03 follow-up 5: restored problem URL and semantic result tab

- [x] Inspect the user's existing real LeetCode TLE page and prove the current
  UI uses duplicate `console-result` panes rather than only the legacy
  `submission-result` locator.
- [x] Reproduce the post-refresh lifecycle where LeetCode restores
  `/problems/<slug>/` but retains a selected first-party submission-detail tab.
- [x] Collapse identical visible verdict panes and reject conflicts.
- [x] Require the semantic detail tab to be unique, visible, selected, inside
  the official tabbar, and contain a recognized final verdict.
- [x] Prove transient `提交详情`, inactive tabs, unknown labels, and conflicting
  leaves do not consume the intent.
- [x] Prove stored intent → restored problem URL → selected TLE result →
  `Time Limit Exceeded` atomic bundle.
- [x] Recover the user's existing stuck TLE through the real local pipeline;
  verify `partial`, matching ACK, and active/outbox/quarantine/unmatched all
  return to zero. Void the diagnostic transient-label attempt with an explicit
  audit reason.
- [x] Run `npm run quality:gate`: exit 0; 68 unit files / 1039 passed /
  1 capability skip, 25 Playwright E2E, 19 extension files / 464 passed, lint,
  migration, curriculum validation, typecheck, MV3 build/dist parity, and
  20/20-page production build PASS.
- [x] Reload the final committed build and perform one fresh natural LeetCode
  non-AC submission. Confirm exactly one normalized attempt and all popup
  queues return to zero before formal observation starts. User confirmation:
  2026-07-24, the same LeetCode test case passed.

- [x] **Step 9: User-authorized repair commit checkpoint**

The user asked Codex to run `/neat-freak` and autonomously decide whether the
repair should be committed. The semantic TLE repair has focused, authoritative,
and bounded real-Chrome evidence, so freeze it in a local repair commit after
knowledge reconciliation. Exclude the user's pre-existing `AGENTS.md`,
observation sheets, bilingual plan, and bilingual specification edits. Do not
push or label the commit as an accepted release.

- [x] **Step 8: Authorization-gated commit checkpoint**

The user authorized an autonomous commit decision after repair and cleanup.
Freeze the repair and evidence in the local implementation commit containing
this plan with message `fix(v0): gate capture on completed verdicts`. Exclude
the user's pre-existing `AGENTS.md`, observation sheets, bilingual plan, and
combined bilingual specification edits. Do not push.

## Completion Gate

This plan is complete only when the old 32-item queue has been observed cleared after the exact repaired extension reload, focused and authoritative automated gates pass, no page-only action creates a pending result, and at least one real user submission demonstrates submit-intent-to-verdict causality. Engineering completion does not equal V0 acceptance; a new immutable RC, restarted observations, same-SHA F1-F4, and explicit user acceptance remain separate gates.
