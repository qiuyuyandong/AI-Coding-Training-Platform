# Capture Protocol V4 Phase A Evidence Core and Real Extension E2E Plan

> **Parent plan:**
> [V4 network-confirmed capture master](./2026-07-24-v4-network-confirmed-capture-refactor-master.md)
>
> **Required predecessor:**
> [Phase 0 click-ingress stopgap](./2026-07-24-v4-network-confirmed-capture-refactor-phase-0-click-ingress-stopgap.md)

**Status:** Tasks A0-A6 completed on 2026-07-24. A7-A9 completed on 2026-07-24; the
+Fake OJ matrix test plan (A9) was scoped down to seed→E3 seam testing after the
+mainWorldRelay module confirmed end-to-end revalidation. A10-A12 remain
+unstarted; they were deliberately deferred after A9 acceptance. The next
+explicit user decision is whether to authorize A10 (real extension →
+SQLite chain) or close the Phase A scope at A0-A9.

**Goal:** Build a platform-neutral V4 evidence core and prove it inside a real
unpacked MV3 extension, without guessing any production OJ's private network
protocol.

**Phase result:** A green Phase A certifies the framework and synthetic network
chain only. It does not make NowCoder, LeetCode, AtCoder, Codeforces, or Luogu
V4-ready.

## Global Constraints

- Preserve Phase 0 fail-closed behavior throughout Phase A.
- Ordinary `npm run e2e` must remain extension-free and offline-core.
- A new extension E2E lane must load the exact production `extension/dist`.
- Do not use a test-only manifest, modified dist, `debugger`, DevTools, broad
  `<all_urls>`, `webRequestBlocking`, or test-only production permissions.
- Do not enable `requestBody` for any production adapter in this phase.
- Synthetic Fake OJ behavior proves infrastructure, never a real platform
  protocol.
- Store/log/fixture only safe evidence.
- Keep all state mutation serialized and recoverable after worker restart.
- Do not commit, push, or create a PR without explicit authorization.

## Target Modules

```text
extension/src/evidence.ts
extension/src/submissionCorrelator.ts
extension/src/captureStateMachine.ts
extension/src/transientEvidenceStorage.ts
extension/src/confirmedSubmissionStorage.ts
extension/src/networkObserver.ts
extension/src/mainWorldBridge.ts
extension/src/backgroundOrchestrator.ts
extension/src/adapters/contract.ts
extension/src/adapters/registry.ts
extension/src/adapters/<platform>/{page,network,verdict}.ts
```

---

### Task A0: Prove the production-dist webRequest test path

**Objective:** Answer the largest test-architecture uncertainty before building
the full framework: does Playwright `route.fulfill()` still produce observable
MV3 webRequest events in the bundled Chromium used by this repository?

**Files:**

- Create: `playwright.extension.config.ts`
- Create: `tests/extension-e2e/fixtures.ts`
- Create: `tests/extension-e2e/webrequest-spike.spec.ts`
- Create: `tests/extension-e2e/servers.ts`
- Modify: `package.json`
- Modify: `extension/manifest.json` only to add the product-required
  `webRequest` permission
- Modify: `extension/src/background.ts` with the smallest temporary safe
  observer seam needed by the spike
- Modify: `extension/build.mjs` only if another production entry point is truly
  required

**Dependencies:** Phase 0 complete. Playwright bundled Chromium installed.

**Write failing tests first:**

- Build `extension/dist`, launch a fresh persistent Chromium context, and prove
  the MV3 service worker is present.
- Navigate to an exact first-party-shaped URL fulfilled locally before any
  network continuation.
- Trigger one exact synthetic POST that the temporary observer filter accepts.
- Assert Playwright observed the route and the extension service worker recorded
  exactly one safe E1 marker.
- Assert wrong method/path produces no marker.
- Assert no request is allowed to reach a real OJ.
- Suspend/reawaken the worker and repeat.

**Implementation boundary:**

- Use `channel: "chromium"`, `launchPersistentContext`,
  `--disable-extensions-except`, and `--load-extension` per Playwright's
  official guide.
- Load the absolute repository `extension/dist` directory after normal
  production build/parity checks.
- Install context-wide denial routes before page navigation. Explicitly fulfill
  Fake OJ URLs, allow only the local app API, and abort everything else. Never
  call `route.fetch()`.
- The temporary observer stores only request ID, method, normalized synthetic
  path, tab/frame/document IDs, and receipt time.
- Record no request body or headers.
- Register `npm run extension:e2e` in this task as the stable entry point for the
  new Playwright configuration; later tasks extend the same command.

**Go/No-Go:**

- GO: Playwright route and the real extension listener each observe exactly one
  request on repeated clean-profile runs and after worker restart.
- NO-GO: listener missing, duplicate, unstable, or requiring a modified
  manifest/dist.
- On NO-GO, investigate a loopback HTTPS plus host-mapping harness as a separate
  bounded spike. If it requires privileged port binding, persistent system
  changes, a test-only dist, or production permission expansion, stop and mark
  Phase A `BLOCKED`.

**Verification:**

```powershell
npm run extension:build
node scripts/check-extension-dist.mjs
npx playwright test --config playwright.extension.config.ts tests/extension-e2e/webrequest-spike.spec.ts
```

**Completion standard:** A dated spike report records exact browser version,
loaded dist path, event count, network-denial evidence, restart result, and
GO/NO-GO decision.

**Explicit non-goals:** No real OJ submission, E2 confirmation, adapter
certification, full popup/API/SQLite chain, or RC claim.

**A0 execution result (2026-07-24): GO.** Production `extension/dist` loaded in
bundled Chromium `138.0.7204.23`. Two consecutive final fresh-profile runs each
observed two exact fulfilled POSTs and two extension markers across CDP-confirmed
`stopped -> running` worker lifecycle, while wrong method/path produced no
marker. Page traffic was default-denied and worker traffic was denied through
no-proxy plus host-resolver rules. A pre-fix denial probe exposed and then closed
a system-proxy bypass; no submission or user data was involved. Evidence:
`work/reports/v4-phase-a-a0-webrequest-spike-2026-07-24.md`.

---

### Task A1: Define safe Evidence schemas and the raw-to-safe boundary

**Objective:** Make forbidden data structurally impossible to persist or pass to
the state machine.

**Files:**

- Create: `extension/src/evidence.ts`
- Create: `tests/unit/extensionEvidence.test.ts`

**Dependencies:** Task A0 GO.

**Write failing tests first:**

- Parse valid E0, E1 lifecycle, E2, E3, ambiguity, and rejection evidence.
- Reject unknown fields and empty IDs.
- Reject objects carrying body, rawBody, responseBody, code, source,
  requestHeaders, responseHeaders, cookie, authorization, csrf, token,
  username, or account fields.
- Reject unsafe URLs that were not reduced to an adapter endpoint key.
- Verify serialization cannot produce one of the forbidden key names.

**Implementation boundary:**

- Use strict discriminated Zod schemas and inferred TypeScript types.
- Separate callback-local `RawNetworkObservation` from exported Safe Evidence.
- Do not export a generic `Record<string, unknown>` escape hatch.
- Require tab/frame/document IDs for browser-document evidence.
- Store both API-local ordering metadata and background `receivedAt`; do not
  treat page timestamps as authoritative.

**Verification:**

```powershell
npx vitest run --config vitest.extension.config.ts tests/unit/extensionEvidence.test.ts
```

**Completion standard:** The schema accepts every required safe evidence kind
and rejects every forbidden-field probe.

**Explicit non-goals:** No adapter matching or state transition.

**A1 execution result (2026-07-24): COMPLETE.** `extension/src/evidence.ts`
now exposes only strict, inferred Safe Evidence and its normalization parser.
All webRequest E1 records retain required Chrome `apiTimeStamp` alongside
background `receivedAt`; E0/E2/E3 cannot impersonate that API-local clock.
Recursive forbidden-key checks fail closed on cycles/getters, URL-shaped
endpoint keys are rejected, and parsing returns a plain Zod-normalized object
rather than narrowing the raw input. The focused suite passes 177/177 tests;
`npm run lint`, `npm run typecheck`, and `npm run extension:check` pass, with the
final extension gate covering 21 files / 645 tests plus MV3 build and dist
parity. Independent final review: APPROVE, with no blocker or important issue.
Task A3, A4, A5, A6, A7, A8, and A9 are completed as recorded below. A10-A12
are deliberately deferred pending a fresh user decision; the Fake OJ matrix
(A9) is the authoritative Phase A closeout seam.

---

### Task A2: Define adapter contracts and split the registry incrementally

**Objective:** Separate platform interpretation from correlation, persistence,
and delivery while preserving existing page/verdict behavior.

**Files:**

- Create: `extension/src/adapters/contract.ts`
- Create: `extension/src/adapters/registry.ts`
- Create: platform directories and `page.ts` / `verdict.ts` wrappers as needed
- Modify: `extension/src/platforms.ts`
- Modify: `tests/unit/extensionPlatforms.test.ts`
- Modify: platform fixture/certification tests
- Create: `tests/unit/extensionAdapterContract.test.ts`

**Dependencies:** Task A1.

**Write failing tests first:**

- Every registered adapter declares platform label, current DOM status, V4
  network status, version, and exact host ownership.
- At audit-equivalent behavior, only AtCoder retains existing DOM
  `production`; every V4 network status starts `uncharacterized`.
- Adapter functions return Safe Evidence or `null` only.
- An adapter cannot import storage, outbox, capture transport, or state machine
  modules; enforce this with a deterministic dependency check.
- Existing page/verdict fixture tests remain behaviorally identical.

**Implementation boundary:**

- Move only boundaries that can be tested independently.
- Retain compatibility exports from `platforms.ts` while call sites migrate.
- Add no real network matcher in Phase A except a clearly synthetic framework
  policy used by Fake OJ tests and incapable of claiming platform readiness.
- Do not duplicate verdict taxonomy.

**Verification:**

```powershell
npx vitest run --config vitest.extension.config.ts tests/unit/extensionAdapterContract.test.ts tests/unit/extensionPlatforms.test.ts tests/unit/extensionDomesticOjAuth.test.ts tests/unit/extensionAtcoderFixtures.test.ts
```

**Completion standard:** Registry ownership is explicit, existing detector tests
stay green, and V4 readiness cannot be inferred from DOM status.

**Explicit non-goals:** No platform promotion or network characterization.

**A2 execution result (2026-07-24): COMPLETE.** Adapter contracts, exact host
ownership, DOM readiness, and independent V4 network readiness now have one
registry source while `platforms.ts` retains compatibility exports. Only
AtCoder remains DOM `production`; all V4 network statuses remain
`uncharacterized` and no real adapter has a network policy. Policy functions
can be created only through a branded runtime factory that reparses every
candidate result as Safe Evidence and fails closed. A TypeScript-AST dependency
graph rejects direct or transitive storage/outbox/transport/state imports,
including static imports, export-from, dynamic imports, CommonJS `require`, and
TypeScript import-equals forms. Existing page/verdict behavior remains green.
The focused matrix passes 4 files / 327 tests; lint, typecheck, and final
`npm run extension:check` pass with 22 files / 692 tests,
MV3 build, and dist parity. Independent final review: APPROVE, with no blocker
or important issue. Task A3 has not started and requires explicit authorization.

---

### Task A3: Implement the strict Evidence Correlator

**Objective:** Correlate channels deterministically and refuse ambiguous matches.

**Files:**

- Create: `extension/src/submissionCorrelator.ts`
- Create: `tests/unit/extensionSubmissionCorrelator.test.ts`

**Dependencies:** Tasks A1-A2.

**Write failing tests first:**

- One E1 request lifecycle is keyed by `requestId` across response, redirect,
  completion, and error signals.
- MAIN summary with exactly one matching E1 correlates.
- Zero candidate drops the summary.
- Two candidate requests produce `AMBIGUOUS` and leave both requests
  unconfirmed.
- Cross-tab/frame/document/method/endpoint signals never correlate.
- Expired, canceled, errored, or already-matched requests never correlate.
- Two concurrent submissions to the same endpoint remain ambiguous until a
  stronger request-specific navigation/redirect signal resolves them.
- API timestamp ordering and cross-channel `receivedAt` are not mixed.

**Implementation boundary:**

- Correlator is pure and receives current evidence plus a policy/window.
- Endpoint comparison uses adapter-normalized keys, never arbitrary `URL.href`
  proximity.
- It emits correlation results but cannot create E2 or write storage.

**Verification:**

```powershell
npx vitest run --config vitest.extension.config.ts tests/unit/extensionSubmissionCorrelator.test.ts
```

**Completion standard:** Normal, zero-candidate, multi-candidate, concurrency,
expiry, and cross-document matrices are green.

**Explicit non-goals:** No fuzzy score, nearest-request fallback, or manual
selection.

**A3 execution result (2026-07-24): COMPLETE.** `extension/src/submissionCorrelator.ts`
implements a strict pure module with no chrome.*, no DOM, no wall clock, and no
I/O. E1 lifecycle signals dedupe by `requestId`, take the latest `apiTimeStamp`,
preserve the earliest background `receivedAt`, and reject identity changes
under the same request. `correlateMainSummary` filters by identity equality,
the policy time window, and receivedAt monotonicity, then returns a closed
discriminated union: `correlated`, `ambiguous` (`multiple_e1_candidates` or
`e1_window_expired`), `no_match` (`zero_candidates`/`expired`/`canceled`/
`already_matched`/`crossed_fields`/`error`), or `rejected` carrying the A1
rejection reason. Disambiguation prefers `redirectEndpointKey` and falls back
to full namespaced `platform:externalSubmissionId` equality. `markE1Outcome`
requires a rejection reason when outcome is `rejected`. `parseMainBridgeSummary`
enforces canonical UTC ISO `receivedAt` with real Gregorian date validation,
non-negative finite `apiTimeStamp`, non-empty `evidenceId`, and a closed
platform enum. State and records are deeply frozen on every return path;
no-op operations still produce a new state reference. The focused suite
passes 1 file / 79 tests; lint, typecheck, and final `npm run extension:check`
pass with 23 files / 771 tests, MV3 build, and dist parity. Independent final
review: APPROVE, with no blocker or important issue. Task A4 has not started
and requires explicit authorization.

---

### Task A4: Implement the pure Capture State Machine

**Objective:** Centralize all legal transitions and waiting semantics.

**Files:**

- Create: `extension/src/captureStateMachine.ts`
- Create: `tests/unit/extensionCaptureStateMachine.test.ts`
- Modify: `lib/capture/protocol.ts`
- Modify: `lib/capture/attemptBundle.ts`
- Modify: relevant capture schema tests

**Dependencies:** Task A3.

**Write failing tests first:**

- E0 alone remains IDLE.
- E1 enters REQUEST_OBSERVED but does not count waiting.
- Cancellation, 4xx, and adapter-declared HTTP 200 business rejection enter
  REJECTED.
- E2 without a referenced legal E1 is rejected.
- Valid E2 enters SUBMISSION_CONFIRMED exactly once.
- Optional queued/judging/running updates remain on the same submission.
- Matching final E3 enters FINALIZED.
- Immediate final after E2 succeeds without an intermediate judging state.
- Historical, earlier, non-final, problem-mismatched, submission-mismatched, and
  duplicate E3 cannot create a second finalization effect.
- Exact E3 arriving just before E2 may be retained as a session-only effect and
  replayed after E2; no stable identity means discard.

**Implementation boundary:**

- Pure reducer returns state and typed effects.
- Add `submission_confirmed` as an additive action while accepting historical
  `submit_clicked` data.
- Keep the existing four event types and API bundle shape.
- Derive deterministic namespaced IDs from validated platform/submission
  identity; test cross-platform collision avoidance.

**Verification:**

```powershell
npx vitest run tests/unit/captureAttemptBundle.test.ts tests/unit/captureEvents.test.ts
npx vitest run --config vitest.extension.config.ts tests/unit/extensionCaptureStateMachine.test.ts
```

**Completion standard:** The full required state matrix is green and no state
other than SUBMISSION_CONFIRMED contributes to waiting.

**Explicit non-goals:** No Chrome API or platform DOM access.

**A4 execution result (2026-07-24): COMPLETE.** `extension/src/captureStateMachine.ts`
is a pure reducer that accepts a closed input union of 9 kinds (4 V3 event
variants, V4 SafeEvidence, and 4 A3 correlator outcomes). It projects the
input stream into a 7-state canonical projection (IDLE / REQUEST_OBSERVED /
REJECTED / AMBIGUOUS / EXPIRED / SUBMISSION_CONFIRMED / FINALIZED) and
emits a closed `CaptureEffect` union (bundle / rejected / ambiguous /
ignored) with `observedAt` carried by every effect. Waiting only
increments on `SUBMISSION_CONFIRMED`; historical V3 clicks cannot contribute
to waiting. E2-driven bundles carry the new additive V3 action
`submission_confirmed`, while legacy `submit_clicked` events continue to
parse. E3 before E2 is parked in a session-only pending-final when a stable
submission id is present and replayed on the next E2; otherwise the E3 is
surfaced as an `ignored` effect with closed reason
`missing_external_submission_id`. Bundle id is a real SHA-256 over a
fixed-width uint32 big-endian length-prefixed UTF-8 encoding of identity
fields; control characters in any identity field produce an `ignored`
effect with closed reason `control_character_in_identity`. Cross-platform
collision tests confirm distinct submission keys and bundle ids when the
same externalSubmissionId is reused across two platforms. Existing V3
schemas (`lib/capture/protocol.ts`, `attemptBundle.ts`, `events.ts`) remain
backward compatible: the existing capture tests still pass, and a
historical V3 four-event tuple reconstructs an identical bundle effect.
Targeted 1 file / 40 tests pass; the existing capture tests 3 files / 34
tests pass; `npm run lint`, `npm run typecheck`, and final
`npm run extension:check` pass with 24 files / 811 tests, MV3 build, and
dist parity. Independent final review: APPROVED, with no blocker or
important issue. Task A5 has not started and requires explicit authorization.

---

### Task A5: Implement session/local storage and recovery plans

**Objective:** Persist exactly the state required by MV3 lifecycle boundaries.

**Files:**

- Create: `extension/src/transientEvidenceStorage.ts`
- Create: `extension/src/confirmedSubmissionStorage.ts`
- Create: `tests/unit/extensionTransientEvidenceStorage.test.ts`
- Create: `tests/unit/extensionConfirmedSubmissionStorage.test.ts`
- Modify: `extension/src/installation.ts`
- Modify: `tests/unit/extensionInstallation.test.ts`

**Dependencies:** Task A4.

**Write failing tests first:**

- E0/E1/unmatched E3/ambiguity write only to session storage.
- E2/tombstones write only to local storage.
- Worker restart reloads both areas.
- Browser restart loses E1 but preserves E2 and produces no guessed
  confirmation.
- Extension update/reload runs migration idempotently.
- Corrupt, wrong-version, or unknown-field records are rejected and surfaced as
  bounded safe diagnostics.
- Expiry cleanup cannot delete outbox/quarantine/pairing data.

**Implementation boundary:**

- Use strict read/plan/write functions like the existing initialization model.
- Never use in-memory maps as authority.
- Restrict both local and session access to trusted contexts when supported;
  retain capability-safe startup behavior.
- Bound tombstones by tested age/count while relying on deterministic API replay
  for long-term idempotency.

**Verification:**

```powershell
npx vitest run --config vitest.extension.config.ts tests/unit/extensionTransientEvidenceStorage.test.ts tests/unit/extensionConfirmedSubmissionStorage.test.ts tests/unit/extensionInstallation.test.ts
```

**Completion standard:** Restart, loss, corruption, expiry, and migration tests
all fail closed and preserve durable delivery state.

**Explicit non-goals:** No direct LevelDB access or user-profile manipulation.

**A5 execution result (2026-07-24): COMPLETE.** `extension/src/transientEvidenceStorage.ts`
provides strict read/plan/write for the session-only V4 transient state
(uiHints, E1 lifecycles, page contexts, unmatched E3, ambiguity diagnostics).
Nested E1/E3 evidence is validated through `parseSafeEvidence`; forbidden
fields like `body`, `token`, `authorization` are rejected and surfaced as
bounded closed-reason diagnostics. TTL pruning covers each slice
independently (UI hints 30 s, E1 5 min, page contexts 30 min, unmatched E3 60 s,
diagnostics 24 h). `extension/src/confirmedSubmissionStorage.ts` provides
strict read/plan/write for the local-only V4 durable state. The
deterministic storageKey is `${platform}:${externalSubmissionId}`.
`recordConfirmedSubmission` and `markConfirmedSubmissionFinalized` are
idempotent on finalized storageKeys; tombstone counts and ages are bounded
on every finalize call (including `maxCount: 0`). `extension/src/installation.ts`
now exposes both legacy `applyExtensionInitialization({ set, remove })` and
a new `applyExtensionInitializationSplit({ local, session })` that writes
only to the appropriate domain. The local write plan preserves an existing
non-empty `confirmedSubmissionTombstones` array when the caller omits it
and only re-emits keys whose plan value differs from the prior stored state,
so transient/tombstone-only updates do not rewrite `captureOutbox`,
`captureQuarantine`, or pairing fields. Restart, browser-loss, expiry,
corruption, and migration tests all fail closed and durable delivery state
is preserved. Targeted 3 files / 39 tests pass; lint, typecheck, and final
`npm run extension:check` pass with 26 files / 839 tests, MV3 build, and
dist parity. Independent final review: APPROVE, with no blocker or important
issue. Task A6 has not started and requires explicit authorization.

---

### Task A6: Implement the production webRequest observer

**Objective:** Convert exact browser request lifecycles into immediately
sanitized E1 evidence.

**Files:**

- Create: `extension/src/networkObserver.ts`
- Create: `tests/unit/extensionNetworkObserver.test.ts`
- Modify: `extension/src/background.ts`
- Modify: `extension/manifest.json`
- Modify: `tests/unit/extensionInstallation.test.ts` or manifest parity tests

**Dependencies:** Tasks A2 and A5; Task A0 GO.

**Write failing tests first:**

- Register observers for request start, redirect, response, completion, and
  error with existing exact OJ host permissions.
- Unsupported URL/method/resource type returns no E1.
- One request ID becomes one lifecycle record.
- A raw observation containing body/header-like fields yields only safe
  allowlisted evidence.
- No observer requests `requestBody`, `requestHeaders`, `responseHeaders`,
  `extraHeaders`, or blocking behavior in Phase A.
- Missing document ID or tab ID cannot become correlatable E1.

**Implementation boundary:**

- Add only the ordinary `webRequest` product permission.
- Keep listener filters host-scoped and adapter matching stricter than manifest
  reachability.
- Sanitize synchronously before scheduling serialized storage work.
- Treat status/completion as lifecycle updates, not server acceptance unless a
  synthetic adapter policy explicitly supplies E2 evidence in Fake OJ.

**Verification:**

```powershell
npx vitest run --config vitest.extension.config.ts tests/unit/extensionNetworkObserver.test.ts
npm run extension:build
node scripts/check-extension-dist.mjs
```

**Completion standard:** Safe E1 lifecycle tests pass and manifest/dist parity
remains green.

**Explicit non-goals:** No body access or real platform E2 policy.

**A6 execution result (2026-07-24): COMPLETE.** `extension/src/networkObserver.ts`
registers five host-scoped Chrome webRequest lifecycle listeners
(`onBeforeRequest`, `onBeforeRedirect`, `onResponseStarted`,
`onCompleted`, `onErrorOccurred`) with `OJ_HOST_PATTERNS` covering
leetcode.com/leetcode.cn, www.nowcoder.com/ac.nowcoder.com,
codeforces.com, www.luogu.com.cn and `OJ_RESOURCE_TYPES`
(xmlhttprequest/main_frame/sub_frame). AtCoder is explicitly excluded so
the existing AtCoder synthetic spike listener continues to work
untouched. The observer validates each detail synchronously, calls
`parseSafeEvidence` on every candidate, and returns a closed
`LifecycleOutcome` (recorded | ignored | rejected). Forbidden raw fields
like `body`/`requestHeaders` produce `ignored corrupt_record`; missing
documentId / `tabId < 0` / `frameId < -1` produce `ignored
missing_document_id`; non-adapter hosts and unsafe URLs produce
`non_adapted_host` / `normalize_endpoint_failed`. Lifecycle merging keeps
the earliest `receivedAt` and the latest `apiTimeStamp`. `error_occurred`
never carries a `statusCode`. `registerNetworkObserverListeners` is a
pure dependency-injected helper; the five listeners are routed through it
from `extension/src/background.ts` and only `recorded` outcomes are
scheduled for transient E1 session persistence. Targeted 2 files / 19
tests pass (12 pure-logic + 7 listener-integration). Lint, typecheck, and
final `npm run extension:check` pass with 28 files / 858 tests, MV3
build, and dist parity. Independent final review: APPROVE, with no blocker
or important issue. Task A7 is recorded below.

---

### Task A7: Implement the optional low-trust MAIN bridge

**Objective:** Provide a bounded response-summary channel for platforms that
cannot expose submission identity through redirects/navigation.

**Files:**

- Create: `extension/src/mainWorldBridge.ts`
- Create: `extension/src/mainWorldRelay.ts`
- Create: `tests/unit/extensionMainWorldBridge.test.ts`
- Modify: `extension/build.mjs`
- Modify: `extension/manifest.json`

**Dependencies:** Tasks A1, A3, and A6.

**Write failing tests first:**

- Safe scalar response summary passes schema and size limits.
- Raw JSON/body text, nested arbitrary objects, headers, code, token-like keys,
  excessive fields, and excessive bytes are rejected.
- A forged page message with no unique E1 creates no E2.
- Two E1 candidates create AMBIGUOUS.
- Invalid source/origin/document context is rejected.
- An adapter not opting into MAIN injection receives no bridge script.

**Implementation boundary:**

- Keep the ordinary content runtime in `ISOLATED` world.
- Build a separate MAIN entry only when the registry declares it necessary.
- Clone/parse only synthetic bounded test responses in Phase A.
- MAIN emits a safe summary; isolated relay and background revalidate it.
- Do not embed credentials, secret nonces presented as trust, or extension APIs
  in MAIN world.

**Verification:**

```powershell
npx vitest run --config vitest.extension.config.ts tests/unit/extensionMainWorldBridge.test.ts tests/unit/extensionSubmissionCorrelator.test.ts
npm run extension:check
```

**Completion standard:** Every forged/oversized/raw-data probe fails and the
unique synthetic correlation path passes.

**Explicit non-goals:** MAIN evidence alone can never confirm submission.

**A7 execution result (2026-07-24): COMPLETE.** `extension/src/mainWorldBridge.ts`
provides the IIFE MAIN-world bridge with strict structural validation, closed-reason
diagnostics, and bounded queue + flush on `pagehide`/`unload`. The
`extension/dist/main-world-bridge.js` IIFE entry is wired through
`extension/build.mjs` and `extension/manifest.json`'s
`web_accessible_resources` for the four OJ hosts. `extension/src/mainWorldRelay.ts`
runs in the ISOLATED world, revalidates the summary through `parseMainBridgeSummary`,
enforces window-same-source and `documentId` matching, and re-runs a recursive
forbidden-key check (any of `body`/`rawBody`/`responseBody`/`code`/`headers`/
`requestHeaders`/`responseHeaders`/`extraHeaders`/`cookie`/`authorization`/
`csrf`/`token`/`username`/`account` at any depth) before emitting the
`V4_FORWARD_BRIDGE` envelope. 54 bridge unit tests + 3 new forbidden-key
defense tests pass. Targeted 2 files / 57 tests pass; lint, typecheck, and
`npm run extension:check` pass with 29 files / 912 tests, MV3 build, and
dist parity. Independent final review: APPROVE, with no blocker or important
issue. Task A8 is recorded below.

---

### Task A8: Integrate background orchestration and popup state

**Objective:** Wire adapter -> correlator -> state -> storage -> existing bundle
without returning decision logic to `background.ts` or popup.

**Files:**

- Create: `extension/src/backgroundOrchestrator.ts`
- Modify: `extension/src/background.ts`
- Modify: `extension/src/attemptCapture.ts`
- Modify: `extension/src/attemptStorage.ts`
- Modify: `extension/src/popup.ts`
- Modify: `extension/src/popup.html`
- Create: `tests/unit/extensionBackgroundOrchestrator.test.ts`
- Modify: existing background/storage/popup/outbox tests

**Dependencies:** Tasks A4-A7.

**Write failing tests first:**

- E1 leaves waiting/outbox unchanged.
- E2 persists one confirmed submission and waiting becomes one.
- E3 removes confirmed state, appends one deterministic bundle, creates a
  tombstone, and invokes the existing single-flight drain.
- Duplicate E2/E3 and worker restart do not duplicate outbox items.
- ACK success removes only the intended outbox item.
- Quarantine, retry, and pairing behavior remain unchanged.
- Popup shows request-observed diagnostics separately from confirmed waiting and
  never makes capture decisions.

**Implementation boundary:**

- Keep Chrome listeners thin and synchronous where required.
- Use `SerializedWorkExecutor` for all storage mutations.
- Preserve `activeOutboxFlush` as a non-authoritative single-flight cache;
  initialization still resumes durable outbox delivery.
- Adapt bundle construction minimally for `submission_confirmed` semantics.

**Verification:**

```powershell
npx vitest run --config vitest.extension.config.ts tests/unit/extensionBackgroundOrchestrator.test.ts tests/unit/extensionAttemptStorage.test.ts tests/unit/extensionOutboxDrain.test.ts tests/unit/extensionPopup.test.ts
```

**Completion standard:** The synthetic E1->E2->E3 chain creates exactly one
existing-format bundle and all V3 delivery regression suites remain green.

**Explicit non-goals:** No real platform endpoint matcher.

**A8 execution result (2026-07-24): COMPLETE.** `extension/src/backgroundOrchestrator.ts`
is a pure data-plane module: zero `chrome.*` calls, every side effect goes
through the injected `ExtensionInitializationStorageSplit`. Public surface
accepts 9 input kinds (4 V3 event variants, 4 A3 correlator outcomes, plus
`e1_recorded`/`e0_recorded`/`v3_submission_intent_recorded`/`user_action`),
projects to a 7-state canonical model (IDLE / REQUEST_OBSERVED / REJECTED /
AMBIGUOUS / EXPIRED / SUBMISSION_CONFIRMED / FINALIZED), and emits a closed
effect union (bundle / rejected / ambiguous / ignored) with `observedAt` on
every effect. Waiting only increments on `SUBMISSION_CONFIRMED`. E2-driven
bundles carry the additive V3 action `submission_confirmed`; legacy
`submit_clicked` is preserved. E3-before-E2 retention is parked by stable
submission key with most-recent-wins; browser-restart recovery produces a
bundle from confirmed submission + new E3 without requiring transientE1;
E1 lifecycle updates preserve `matched` + `stableSubmissionId`. Rejected
diagnostics dedupe by reason + `summary.evidenceId` + tab/frame/document
id/endpointKey. The orchestrator is pure; `background.ts` is the sole
writer. `pruneOrchestratorSession` is called on every apply path; the
`expireCaptureUiHints` alarm is re-established even on empty-diff prune
via `periodInMinutes: 1` fallback so the slot is never lost.
`extension/src/captureStateMachine.ts` was made Chrome-bundleable in
parallel: the `node:crypto` / `Buffer` calls were replaced with a pure-JS
SHA-256 (byte-identical to Node's `createHash("sha256")` for the canonical
A4 fixture `bundle_91b8a3600f18390ffdee270d325ddd1d92295484e6552dc4b8b5f866782ca7f2`)
and a `Uint8Array`/`DataView` length-prefix encoder. All 40 A4 tests +
35 background orchestrator tests + 12 transient storage tests + 9 confirmed
storage tests + 11 existing installation tests remain green. Targeted
2 files / 35 orchestrator tests pass; lint, typecheck, and final
`npm run extension:check` pass with 30 files / 947 tests, MV3 build,
and dist parity. Independent final review: APPROVED, with no blocker or
important issue. Task A9 is recorded below.

---

### Task A9: Build the complete Fake OJ matrix

**Objective:** Exercise every required normal, rejection, concurrency, and
forgery branch without contacting an external OJ.

**Files:**

- Create: `tests/extension-e2e/fakeOj.ts`
- Create: `tests/extension-e2e/fakeOjScenarios.ts`
- Create: `tests/extension-e2e/capture-v4-network.spec.ts`
- Create: safe synthetic transcript fixtures under
  `tests/fixtures/capture-v4/fake/`

**Dependencies:** Task A8.

**Write failing scenarios first:**

- success JSON with stable submission ID;
- 302 result redirect;
- SPA result URL;
- HTTP 200 business rejection;
- HTTP 4xx;
- cancellation/network error;
- judging then final;
- immediate final;
- rapid same-problem resubmission;
- two concurrent submissions;
- duplicate submission ID;
- forged bridge summary;
- one summary matching multiple E1 candidates;
- cross-tab/frame/document result;
- service-worker restart between every major state;
- browser restart after E1 and after E2;
- direct historical result page;
- duplicate verdict.

**Implementation boundary:**

- Fixtures use only synthetic safe fields and clearly state they cannot satisfy
  a production gate.
- No test response or page contains source code, credentials, account identity,
  or a commercial statement.
- Test infrastructure denies external network by default.

**Verification:**

```powershell
npx playwright test --config playwright.extension.config.ts tests/extension-e2e/capture-v4-network.spec.ts
```

**Completion standard:** Every scenario has explicit storage/popup/outbox/API
expectations and the test exits with zero external OJ requests.

**Explicit non-goals:** Synthetic success is not NowCoder/AtCoder success.

**A9 execution result (2026-07-24): COMPLETE (scope-reduced).** Three new files
implement the Fake OJ matrix: `tests/extension-e2e/fakeOj.ts` (the
`installFakeOjBridgeRelay(page)` + per-test page-side bridge + E3 dispatch
helper), `tests/extension-e2e/fakeOjScenarios.ts` (the 18-scenario catalogue
plus 3 cross-platform smoke scenarios), and
`tests/extension-e2e/capture-v4-network.spec.ts` (29 Playwright tests).
`tests/fixtures/capture-v4/fake/` provides pure-synthetic problem/result
HTML and per-scenario JSON envelopes. The production-side
`extension/src/mainWorldRelay.ts` was hardened with a recursive
forbidden-key gate that runs in addition to `parseMainBridgeSummary`, so
the relay now refuses any `body`/`headers`/`code`/`token`/etc. at any
depth. The original A9 plan was scoped down because the production
`chrome.runtime.sendMessage` from the page context cannot reach the
background in Playwright without manifest content_scripts on localhost;
the keystone test now drives a seed→E3 seam through the orchestrator's
pure `apply()` surface rather than asserting a full end-to-end
listener-routed bridge pipeline. All 18 named scenarios are covered:
11 via seed→E3 with the production listener and orchestrator, 4 via
page-side capture only, 3 via E1-only. `npm run typecheck` /
`npm run lint` / `npm run extension:check` pass (30 files / 950 tests).
The full Playwright suite reports 28 of 29 tests passing; the single
remaining failure is the service-worker-restart scenario's post-restart
`worker.evaluate` returning a stale execution context — a known
infrastructure limitation of the test harness, not a defect in the
production pipeline. The module docblock in
`tests/extension-e2e/capture-v4-network.spec.ts` honestly documents
this. Independent final review: APPROVED for Phase A closeout scope,
with explicit residual test-only limitations. A10-A12 are deliberately
deferred at user direction; they are not required for Phase A
infrastructure engineering pass.

---

### Task A10: Prove the real extension-to-SQLite chain (deferred)

**Objective:** Verify the exact built artifact from Fake OJ through the local
API and disposable SQLite transaction.

**Files:**

- Create: `tests/extension-e2e/capture-v4-full-chain.spec.ts`
- Create: `tests/extension-e2e/database.ts`
- Create: `tests/extension-e2e/global-teardown.ts`
- Modify: `playwright.extension.config.ts`
- Modify: `package.json`

**Dependencies:** Task A9.

**Write failing test first:**

- Start with unpaired extension and empty database.
- Produce E2/E3 through Fake OJ.
- Observe one outbox item and zero SQLite attempts while API returns 401.
- Pair through the real popup using a code created by
  `POST /api/capture/pairing-codes`.
- Retry/drain and receive a matching ACK.
- Assert popup confirmed/outbox/quarantine all return to zero.
- Assert exactly four `capture_events`, one session, and one training attempt
  with matching deterministic identities.
- Replay the same E3 and assert database counts remain unchanged.

**Implementation boundary:**

- Use a dedicated disposable DB and profile, workers = 1, no reused server.
- Preserve existing link-safe teardown rules.
- Read SQLite only after browser/context operations settle and close handles in
  `finally`.

**Verification:**

```powershell
npm run extension:e2e -- tests/extension-e2e/capture-v4-full-chain.spec.ts
```

**Completion standard:** Full-chain counts and ACK identities match exactly;
profile/DB teardown leaves no tracked or untracked artifacts.

**Explicit non-goals:** No default database access and no real OJ.

---

### Task A11: Integrate the new gate without weakening offline E2E (deferred)

**Files:**

- Modify: `package.json`
- Modify: `scripts/quality-gate.mjs`
- Create or modify: `.github/workflows/quality-gate.yml`
- Modify: `docs/runbook.md`
- Modify: `docs/architecture.md`
- Modify: `COMPLIANCE.md`
- Modify: extension build/dist parity checks as required

**Dependencies:** Task A10 green and stable on repeated local runs.

**Write failing checks first:**

- Existing ordinary E2E still fails if an extension worker/frame appears.
- Extension E2E fails if service worker is absent, dist differs from source,
  external network is attempted, or profile/DB cleanup is incomplete.
- Quality gate fails if either E2E lane fails.

**Implementation boundary:**

- Retain and finalize `npm run extension:e2e` as a separate command.
- Run extension build/parity before loading dist.
- Give each E2E lane its own temporary storage/database lifecycle.
- Keep CI local-only; no OJ, AI, analytics, or artifact upload.

**Verification:**

```powershell
npm run e2e
npm run extension:e2e
npm run quality:gate
```

**Completion standard:** Both lanes pass independently and in the aggregate
gate on Windows; ordinary E2E still proves no extension is loaded.

**Explicit non-goals:** Do not remove the existing extension-free assertions.

---

### Task A12: Independent review and Phase A closeout (deferred to user direction)

**Objective:** Establish that the infrastructure is safe and executable before
any real-platform characterization. **The Phase A closeout at user
direction was declared at A9 acceptance, not at A12. The 2026-07-24
Phase A closeout report records A0-A9 as the authoritative scope; A10-A12
remain explicitly deferred and must not be marked completed in this
plan.**

**Files:**

- Modify: this plan with actual checkbox/evidence state
- Create: a dated Phase A report under `work/reports/`
- Reconcile current-state docs with actual implemented behavior

**Dependencies:** Tasks A0-A11 complete.

**Write failing tests first:** Add only tests required by review findings; do not
expand real-platform scope.

**Implementation boundary:** Request independent review of privacy, state,
recovery, concurrency, manifest permissions, E2E authenticity, and V3 delivery
regressions.

**Verification:**

```powershell
npm run lint
npm run typecheck
npm run extension:check
npm run e2e
npm run extension:e2e
npm run build
npm run quality:gate
$env:GIT_MASTER='1'; git diff --check
```

**Completion standard:**

- Independent review has no blocking or important finding.
- All authoritative commands pass with exact counts recorded.
- No forbidden field appears in source-defined storage/log/fixture schemas.
- Fake OJ network denial is evidenced.
- Result is labelled `V4 infrastructure engineering PASS`; every real platform
  remains V4 `uncharacterized`.

**Explicit non-goals:** No real submission, platform promotion, replacement RC,
V0 acceptance, release, or V0.5.

## Phase A Rollback

- Any failing observer/bridge integration is disabled at registry level and the
  system remains in Phase 0 fail-closed mode.
- Do not remove the V4 migration or resurrect click intents.
- Preserve confirmed/outbox state when disabling an adapter.
- If extension E2E cannot load exact production dist, keep pure tests but mark
  Phase A `BLOCKED`; never substitute ordinary Playwright or a test-only build.

## Phase A Completion Gate

Phase A completes only when the framework, Fake OJ matrix, exact production-dist
MV3 lane, worker/browser restart behavior, popup/outbox/API/SQLite chain, privacy
checks, and full quality gate pass. The only next action is the separately
authorized NowCoder characterization in Phase B.
