# V4 NowCoder E3 Ingress Repair and Retest Plan

> **Date:** 2026-07-29
>
> **Status:** Authorized for planning only. Implementation, Chrome operation,
> real submission, commit, push, Phase C work, and adapter promotion are not
> authorized by this document.
>
> **Predecessor:** Phase B terminal closeout at `7bac194`; observed production
> implementation `05555ef`.
>
> **Problem statement:** On the real NowCoder result document, the public final
> verdict was visible and E2 had already been confirmed, but the extension
> content script did not start. Therefore no verdict candidate reached the
> background worker and no E3 was created.

## Goal

Repair and prove this exact chain:

```text
real NowCoder result document
  -> extension content bootstrap starts in the isolated world
  -> content runtime detects the exact result identity and visible final verdict
  -> one verdict candidate reaches the background with Chrome-owned sender identity
  -> the strict NowCoder policy creates one E3
```

The implementation must preserve the existing fail-closed behavior:

- a direct historical result-page open may create only an unmatched E3;
- an unmatched E3 must not create a bundle, API request, SQLite attempt, or
  waiting state;
- only a previously confirmed matching E2 may pair with E3;
- duplicate static/programmatic injection must not create duplicate runtimes,
  messages, E3 records, bundles, or deliveries.

## Scope Decision

This plan covers only the already characterized result route family:

```text
https://ac.nowcoder.com/acm/contest/view-submission?submissionId=<1-20 decimal digits>
```

It does not generalize the NowCoder problem adapter, submission protocol, or
verdict DOM extractor to other NowCoder products, hosts, contest types, or
result routes. The existing pilot problem identity
`acm/contest/18839/1001` remains unchanged.

## Evidence Baseline

The implementation team must begin from these facts rather than repeat broad
protocol discovery:

- B4 already characterized the safe submit/status/final-verdict chain.
- B6 already implements strict E1/E2/E3 parsing and correlation.
- B7 already proves the synthetic production-dist E0/E1/E2/E3/API/SQLite
  chain.
- B8 observed trusted E0, real E1/E2, stable submission ID `84258557`, and the
  matching visible final verdict.
- B8 terminal state contained one confirmed submission and zero E3, unmatched
  E3, bundle, outbox, quarantine, capture event, training session, and training
  attempt.

The blocker is therefore upstream of verdict parsing and E3 correlation. The
repair must first distinguish content bootstrap failure from later runtime
failure instead of assuming every missing E3 is a manifest-match problem.

Authoritative inputs:

- `work/reports/v4-nowcoder-b8-same-build-observation-2026-07-28.md`
- `work/reports/v4-nowcoder-phase-b-terminal-closeout-2026-07-28.md`
- `extension/manifest.json`
- `extension/src/content.ts`
- `extension/src/contentRuntime.ts`
- `extension/src/platforms.ts`
- `extension/src/adapters/nowcoder/verdict.ts`
- `extension/src/adapters/nowcoder/network.ts`
- `extension/src/background.ts`
- `extension/src/backgroundOrchestrator.ts`

## Considered Approaches

### Approach 1: Manifest-only correction

Keep only the static `content_scripts` declaration and adjust its match
patterns or `run_at`.

**Advantages**

- no new extension permission;
- smallest apparent code change.

**Rejected as the sole repair**

- the current manifest already contains the exact
  `view-submission*` pattern and uses `document_start`;
- B8 reload, worker restart, extension reload, and disable/enable did not
  restore ingress;
- another pattern edit would not prove that the content bootstrap actually
  executed;
- it offers no recovery for an already-open eligible document after an
  unpacked-extension reload.

The static declaration remains the primary injection path, but it is not a
sufficient recovery mechanism.

### Approach 2: Network-derived E3

Create final verdict evidence from status traffic or another background-only
signal.

**Rejected**

- the requested chain explicitly requires the real result document and content
  script startup;
- it would weaken the user-visible verdict boundary;
- it risks conflating “submission confirmed” with “final verdict confirmed”;
- it would expand B4 characterization and privacy scope.

### Approach 3: Static primary plus exact-route self-healing injection

Retain the static manifest script. Add:

1. an idempotent content bootstrap guard;
2. a safe content-ready handshake;
3. an exact-route navigation coordinator;
4. bounded `chrome.scripting.executeScript` recovery into only the top-frame
   eligible document;
5. startup reconciliation for an eligible result tab that was already open
   when the extension or worker started.

**Selected**

This is the smallest approach that both fixes the observed lifecycle gap and
produces direct evidence about where ingress succeeds or fails. It adds
permissions, so the route, frame, document, and payload boundaries must be
closed and tested.

Official MV3 constraints used by this design:

- static scripts remain declared under `content_scripts`;
- `chrome.scripting.executeScript` requires the `scripting` permission and
  matching host permission;
- `chrome.webNavigation` requires the `webNavigation` permission;
- programmatic injection targets an exact tab/frame or Chrome document ID and
  defaults to the isolated world;
- `injectImmediately` is not proof of pre-load execution, so correctness must
  not depend on winning a page-load race.

References:

- <https://developer.chrome.com/docs/extensions/develop/concepts/content-scripts>
- <https://developer.chrome.com/docs/extensions/reference/api/scripting>
- <https://developer.chrome.com/docs/extensions/reference/api/webNavigation>

## Target Architecture

### 1. Pure route gate

Add a pure predicate for the exact E3 ingress URL. It must accept only:

- scheme `https:`;
- hostname exactly `ac.nowcoder.com`;
- no username, password, or non-default port;
- pathname exactly `/acm/contest/view-submission` with optional trailing slash
  only if the existing E3 policy accepts it;
- no hash;
- exactly one query key, `submissionId`;
- one value matching `[0-9]{1,20}`.

The manifest may retain its broader match-pattern syntax because Chrome match
patterns cannot express the full query grammar. The pure runtime gate is the
authoritative admission decision.

### 2. Idempotent content bootstrap

Extract content startup into a small bootstrap unit. In the isolated world it
must claim a per-document sentinel before installing:

- polling;
- `MutationObserver`;
- click listener;
- navigation listeners;
- page lifecycle listeners;
- the capture runtime.

If static and programmatic injection both execute in the same document, the
second bootstrap must not install another runtime. It may reannounce the closed
ready handshake so a restarted worker can rebuild its transient ready registry;
the background deduplicates readiness by Chrome document identity.

The sentinel is an extension-isolated implementation detail. It must not be
written into page DOM, localStorage, sessionStorage, cookies, or the MAIN
world.

### 3. Safe content-ready handshake

After the runtime is constructed and its lifecycle listeners are installed,
but before its first verdict candidate is forwarded, send a closed runtime
message such as:

```ts
{
  type: "CONTENT_RUNTIME_READY",
  schemaVersion: 1,
  purpose: "capture"
}
```

The message must not contain URL, title, DOM text, verdict, source code,
account identity, or arbitrary metadata. The background derives authoritative
tab, frame, document, and URL identity from `MessageSender`.

The handshake is diagnostic/control-plane evidence only. It must not enter the
capture state machine, create waiting, or satisfy E0/E1/E2/E3. The content
entry announces readiness only when its current location passes the exact
NowCoder result-route gate, including after a same-document location change.
Repeated announcements are allowed on recovery; the background exposes one
deduplicated ready record per Chrome document.

### 4. Exact-route injection coordinator

Implement the admission and decision logic as a pure module. Chrome event
adapters remain thin.

Inputs:

- navigation kind: committed, history-state update, or startup reconciliation;
- Chrome-owned tab ID, frame ID, document ID when available, and URL;
- whether the current document has already sent a valid ready handshake;
- injection result or closed injection error.

Rules:

- accept only the pure exact result-route gate;
- accept only top frame `frameId === 0`;
- prefer `documentId` targeting when Chrome supplies it;
- otherwise target only `tabId` and frame `0`;
- never use `allFrames`;
- never inject into `about:blank`, `data:`, `blob:`, `file:`, localhost, a
  different NowCoder route, or another host;
- static injection remains enabled;
- `onCommitted` records the eligible navigation/document but does not inject;
- a valid static ready handshake marks that document ready;
- `onCompleted` injects once only if the committed document is still eligible
  and has not announced readiness;
- an eligible history-state update injects immediately only when the same
  document has no ready record, because it has no later `onCompleted` event;
- startup reconciliation injects immediately into an already-open eligible
  top-frame document;
- a received handshake suppresses later attempts for that document;
- duplicate events and worker wakeups remain harmless because the content
  sentinel prevents a second runtime and the background deduplicates a
  reannounced ready handshake;
- errors become bounded reason codes, not free text copied from the page;
- navigation/error cleanup removes only transient coordinator state.

Chrome event coverage:

- `webNavigation.onCommitted` for new result documents;
- `webNavigation.onCompleted` for the post-static-injection recovery decision;
- `webNavigation.onHistoryStateUpdated` for same-document SPA transitions;
- worker/extension startup reconciliation of already-open exact result tabs.

The coordinator must not alter confirmed submissions, unmatched E3,
tombstones, outbox, quarantine, or pairing state.

### 5. Existing E3 path remains authoritative

After content startup, retain the existing flow:

```text
contentRuntime
  -> VERDICT_CANDIDATE_OBSERVED
  -> background validates MessageSender
  -> NOWCODER_NETWORK_POLICY.verdictEvidence
  -> e3_recorded
  -> backgroundOrchestrator
```

Do not introduce another E3 constructor, verdict normalization table, nearest
request fallback, page-script bridge, response-body parser, or DOM-to-storage
side channel.

## Planned Files

Expected modifications:

- `extension/manifest.json`
  - add only `scripting` and `webNavigation` permissions;
  - retain the static content script and existing host permissions.
- `extension/src/content.ts`
  - delegate startup to the idempotent bootstrap;
  - emit the closed ready handshake.
- `extension/src/background.ts`
  - validate the ready message from `MessageSender`;
  - register thin navigation/startup adapters;
  - call the pure injection coordinator.
- `extension/build.mjs`
  - change only if a new source module needs explicit bundling/parity coverage.

Expected new focused modules:

- `extension/src/contentBootstrap.ts`
  - per-document isolated-world startup guard.
- `extension/src/contentIngress.ts`
  - exact URL gate, ready registry, injection decisions, closed diagnostics.

Expected tests:

- `tests/unit/extensionContentBootstrap.test.ts`
- `tests/unit/extensionContentIngress.test.ts`
- modify `tests/unit/extensionBackgroundMessages.test.ts`
- modify `tests/unit/extensionBackgroundOrchestrator.test.ts` only if needed to
  prove that the handshake never enters the orchestrator;
- modify `tests/extension-e2e/capture-v4-nowcoder.spec.ts`
- modify Fake OJ routing helpers only where required for exact document and
  reload scenarios.

If implementation discovery shows that these boundaries cannot remain pure,
stop and revise this plan before adding logic directly to `background.ts`.

## Execution Tasks

### Task 0: Freeze the blocker and protect scope

**Write first**

- a regression assertion that the exact result route is present in the
  production manifest;
- a test proving that manifest presence alone is not treated as runtime-ready;
- a test proving a ready handshake cannot create capture state.

**Checks**

- record starting branch and SHA;
- confirm `vitest.config.ts` and `.local/` remain pre-existing unrelated
  workspace state;
- snapshot default database metadata without reading or hashing its contents;
- record exact production `extension/dist` parity before the repair.

**Completion**

The missing boundary is represented as:

```text
eligible document != content runtime ready != E3
```

No code is changed outside the extension ingress/test/docs scope.

### Task 1: Add the pure exact-route and injection decision model

**Red tests**

Accept:

- exact host/path with one decimal `submissionId`;
- optional accepted trailing slash, only if synchronized with the existing E3
  policy;
- top-frame committed navigation;
- top-frame history-state transition;
- startup reconciliation of an already-open eligible tab.

Reject:

- wrong scheme, host, port, path, frame, hash, missing ID, duplicate ID,
  non-decimal ID, overlong ID, extra query key, credentials;
- localhost Fake OJ URL presented as a production URL;
- `about:blank`;
- navigation without a Chrome-owned tab ID;
- an already-ready document;
- a duplicate attempt for the same navigation/document key.

**Implementation**

- implement the pure URL gate;
- implement closed decision/effect unions;
- use full `(tabId, frameId, documentId)` identity when available;
- use no wall clock in the pure reducer;
- bound transient entries by count and navigation cleanup.

**Verification**

```powershell
npx vitest run --config vitest.extension.config.ts tests/unit/extensionContentIngress.test.ts
npm run typecheck
```

### Task 2: Make content startup idempotent and observable

**Red tests**

- first bootstrap installs exactly one runtime and announces ready;
- second bootstrap in the same isolated document installs no runtime and may
  reannounce ready for worker recovery;
- a new document receives a fresh bootstrap;
- handshake payload is closed and contains no page-derived fields;
- readiness does not emit UI hint, verdict candidate, E3, waiting, or API work;
- extension-context invalidation stops quietly and does not retry forever.

**Implementation**

- add the isolated-world sentinel;
- extract watcher/listener setup behind the bootstrap;
- announce ready after runtime construction/listener installation and before
  the first verdict candidate is forwarded;
- retain existing runtime ordering and verdict detection behavior.

**Verification**

```powershell
npx vitest run --config vitest.extension.config.ts tests/unit/extensionContentBootstrap.test.ts tests/unit/extensionContentRuntime.test.ts tests/unit/extensionOperation.test.ts
npm run typecheck
```

### Task 3: Wire exact-route self-healing injection

**Red tests**

- background accepts only the closed ready message;
- sender URL, tab, frame, and document are authoritative;
- forged message identity and non-top-frame readiness are rejected;
- committed/history/startup events produce only closed injection effects;
- the Chrome adapter calls `scripting.executeScript` with `content.js`,
  isolated world, and exact document/frame target;
- static-ready suppresses the recovery call;
- duplicated static and programmatic execution produces one runtime;
- injection failure records one bounded diagnostic and leaves capture state
  unchanged;
- worker restart and extension reload do not duplicate E3 or delivery.

**Implementation**

- add `scripting` and `webNavigation` permissions;
- register navigation listeners through the existing serialized execution
  boundary;
- reconcile already-open exact result tabs when the worker initializes;
- keep Chrome APIs out of the pure coordinator;
- do not add `tabs`, `activeTab`, `<all_urls>`, `allFrames`, or MAIN-world
  execution unless a new reviewed decision proves they are necessary.

**Verification**

```powershell
npx vitest run --config vitest.extension.config.ts tests/unit/extensionContentIngress.test.ts tests/unit/extensionBackgroundMessages.test.ts
npm run extension:check
```

### Task 4: Extend production-dist E2E around ingress

Use the exact built `extension/dist`, not a source-only harness.

Required scenarios:

1. static exact-result navigation starts one runtime and creates one
   deduplicated ready record;
2. programmatic recovery on an eligible already-open result document starts
   the runtime;
3. static plus programmatic race remains single-runtime and single-E3;
4. wrong host/path/query/frame produces no injection;
5. direct historical result open creates at most one unmatched E3 and zero
   bundle/API/SQLite attempt;
6. confirmed E2 followed by exact matching result creates one E3 and one
   bundle;
7. judging-to-final DOM mutation emits one final E3;
8. worker restart before result navigation still reaches E3;
9. extension reload with the result tab already open reconciles safely;
10. mismatched submission ID remains unmatched/fail-closed;
11. repeated reload/history events do not duplicate bundle or delivery.

The harness may inspect extension-owned public status/export surfaces and
disposable storage. It must not seed production state through Worker internals
to claim a black-box pass.

Expected completed full-chain database result:

- 4 capture events for one V3-compatible atomic bundle;
- 1 training session;
- 1 training attempt;
- no duplicate rows after reload/restart.

**Verification**

```powershell
npm run extension:e2e -- tests/extension-e2e/capture-v4-nowcoder.spec.ts
npm run extension:e2e
```

### Task 5: First real ingress observation without a new submission

This task requires fresh explicit authorization to operate Chrome, but it does
not require a new submission.

Use:

- a fresh unpacked exact `extension/dist`;
- a fresh extension profile or a fully recorded clean extension state;
- the already-known public result URL for a historical submission;
- no code entry and no submit-control interaction.

Observe through public/bounded extension evidence:

```text
navigation committed
  -> CONTENT_RUNTIME_READY received for Chrome sender document
  -> exact result detected
  -> one E3 recorded as unmatched
```

Required outcome:

- exactly one deduplicated content-ready record is observed for the document;
- E3 has the exact URL submission ID;
- unmatched E3 is exactly one;
- confirmed/outbox/quarantine/bundle remain zero in the fresh profile;
- disposable SQLite remains empty;
- reload, worker restart, and extension reload do not create duplicates.

If ready is absent, stop and name the failing ingress layer.
If ready exists but E3 is absent, stop and move the blocker to
problem/result/verdict detection; do not relax the route or DOM policy.

### Task 6: Same-build fresh full-chain real retest

This task requires separate fresh authorization for one natural NowCoder
submission. Planning authorization is not execution authorization.

Preconditions:

- Tasks 0-5 PASS on one committed implementation SHA;
- exact `extension/dist` is rebuilt from that SHA and parity-checked;
- disposable local server/database is paired;
- browse-only waiting remains zero;
- the user owns or explicitly delegates the visible submit action;
- no agent reads or modifies source code, credentials, tokens, response body,
  headers, account identity, or full statement.

Required public evidence:

```text
trusted visible submit action
  -> one E0
  -> exact submit/status network chain
  -> one E2 with stable submission ID
  -> exact public result document
  -> one content-ready handshake
  -> one matching E3
  -> one bundle
  -> one local API delivery
  -> one SQLite training attempt
```

Negative assertions:

- browse-only and click-only still create no waiting;
- E2 does not exist before server confirmation;
- E3 identity equals E2 identity exactly;
- no ambiguity, quarantine, duplicate delivery, or unmatched E3 remains;
- default database metadata is unchanged;
- no fake/manual E3 is injected.

Terminal verdicts:

- `PASS`: all required evidence exists on the same committed build SHA.
- `BLOCKED`: name the first missing layer and preserve fail-closed state.
- `FAIL`: the repair creates false positives, duplicates, privacy expansion,
  default-database mutation, or regression.

### Task 7: Authoritative verification and closeout

Run:

```powershell
npm run extension:check
npm run extension:e2e
npm run quality:gate
$env:GIT_MASTER='1'; git diff --check
```

Record exact:

- branch and implementation SHA;
- test files, passed/skipped/failed counts;
- lint, migration, curriculum, typecheck, application E2E, extension build,
  extension E2E, and production build results;
- disposable and default database preservation;
- real observation result;
- remaining warnings and known skips;
- whether an independent review actually occurred.

Update only after evidence exists:

- this plan's execution-result blocks;
- `work/reports/` with a dated ingress observation and terminal closeout;
- `work/handoff-current.md`;
- `README.md`, `AGENTS.md`, architecture, and runbook if current truth changes.

Do not mark NowCoder production-ready merely because this plan passes. Adapter
promotion requires a separate reviewed decision and broader real-platform
evidence.

## Acceptance Matrix

| Layer | Automated evidence | Real evidence | Pass condition |
|---|---|---|---|
| G0 navigation | exact-route unit/E2E | public result navigation | Chrome-owned exact top-frame document |
| G1 bootstrap | idempotency unit/E2E | ready handshake | exactly one runtime per document |
| G2 delivery to worker | sender-validation tests | ready visible in bounded status | exact sender tab/frame/document |
| G3 visible verdict detector | DOM fixture/E2E | matching public verdict | one normalized final verdict |
| G4 E3 construction | policy/background tests | E3 ID equals URL ID | one strict E3 |
| Fail-closed historical open | production-dist E2E | no-submit real observation | unmatched E3 only; no bundle/API/DB |
| Full chain | production-dist E2E | one authorized natural submission | one E2 + one E3 + one delivery + one attempt |

## Privacy and Security Boundaries

- No response body, request body, headers, cookies, tokens, credentials,
  account identity, source code, or full statement.
- No broad host permission or `<all_urls>`.
- No MAIN-world execution.
- No all-frame injection.
- No page-provided identity trusted over `MessageSender`.
- No ready handshake field copied from DOM or page script.
- No content-ready signal admitted as capture evidence.
- No closest/nearest request or verdict fallback.
- No manually seeded real E3.
- No default database write.

## Rollback

The repair must be separable so rollback can:

1. remove `scripting` and `webNavigation` permissions;
2. remove navigation/startup recovery listeners;
3. remove content-ready coordinator state;
4. retain the existing static content script, E1/E2 policy, confirmed
   submissions, unmatched E3, outbox, quarantine, tombstones, and local
   attempts;
5. leave NowCoder experimental and fail-closed.

Never delete a real attempt as part of rollback. Use existing correction or
voiding only for a separately proven erroneous record.

## Non-goals

- no Phase C or other platform work;
- no general NowCoder adapter expansion;
- no network-only verdict confirmation;
- no production promotion, RC, V0 acceptance, V0.5, release, push, or PR;
- no refactor of the capture state machine or API contract;
- no change to click-created waiting rules;
- no browser operation or real submission during plan authoring.

## Unique Next Action

Review and authorize Task 0-4 implementation. Real Chrome Task 5 and natural
submission Task 6 remain separate explicit execution gates even after the
engineering tasks pass.

---

## Execution Result

**Date:** 2026-07-29
**Verdict:** Tasks 0-6 PASS on a single committed SHA (uncommitted working
tree at the time of closeout; see `work/handoff-current.md` for the current
branch state). This block closes the engineering + observation chapters
authorized by this plan. Adapter promotion is **not** authorized by this
plan — it requires a separate reviewed decision per
`work/reports/v4-nowcoder-e3-ingress-repair-2026-07-29.md#boundary`.

### Task 0 — Freeze the blocker and protect scope

PASS.

- `tests/unit/extensionContentIngress.test.ts` — 27 URL-gate
  acceptance/rejection cases for the exact result route.
- `tests/unit/extensionBackgroundMessages.test.ts` — added
  `keeps the exact NowCoder result route in the production manifest`
  and `treats the closed ready handshake as control plane, not
  capture state` assertions.
- Pre-existing `vitest.config.ts` and unrelated `.local/` workspace
  state were untouched.
- Default `training-platform.sqlite` preserved (metadata-only
  `lstatSync` snapshots before and after every Task 5/6 run).

The missing boundary now reads:

```text
eligible document != content runtime ready != E3
```

with all three layers simultaneously asserted in unit tests and in
Task 5's real-profile observation.

### Task 1 — Pure exact-route and injection decision model

PASS.

- `extension/src/contentIngress.ts` — new pure module
  (no `chrome.*`, no DOM, no wall clock, no I/O).
- 69 `tests/unit/extensionContentIngress.test.ts` cases cover URL
  acceptance/rejection, top-frame rule, tabId rule, document
  identity, wrong URL rejection, committed non-inject, completed
  inject-after-commit, history-state/startup immediate injection,
  ready suppression, idempotent ready, transient registry bounds
  (max 100), cleanup by documentId and tabId, ready on non-top
  frame rejection. `npm run typecheck` clean.

Independent Task 0/1 review flagged and the implementation now
corrects the original review's MEDIUM finding #3: the result route
no longer accepts a trailing slash — `isExactNowCoderResultUrl`
requires `pathname === "/acm/contest/view-submission"` and the
existing `readResultPageSubmissionId` in
`extension/src/adapters/nowcoder/network.ts:272-282` matches this
exact shape. E3 evidence now matches the gate.

### Task 2 — Idempotent content bootstrap

PASS.

- `extension/src/contentBootstrap.ts` — new 37-line module.
- `tests/unit/extensionContentBootstrap.test.ts` — 4 tests:
  installs once and announces ready; reannounces but does not
  install a duplicate runtime; second concurrent bootstrap returns
  `installing` instead of double-installing; capture disabled
  (install returns `false`) does not retain the sentinel.

The review's HIGH finding #1 is corrected: a capture-disabled
install now returns `inactive` and the sentinel is cleared so a
later user opt-in still gets a clean installation.

### Task 3 — Exact-route self-healing injection

PASS.

- `extension/manifest.json` adds `scripting` and `webNavigation`.
  Existing `content_scripts` matches and per-host `host_permissions`
  are unchanged. No `<all_urls>`, no `allFrames`, no `tabs`,
  no `activeTab` introduced.
- `extension/src/background.ts` registers the four
  `chrome.webNavigation` listeners through the existing serialized
  executor, the `chrome.scripting.executeScript` call uses `world:
  "ISOLATED"`, `files: ["content.js"]`, `injectImmediately: true`,
  and prefers `target: { tabId, documentIds: [docId] }` whenever
  Chrome supplies a document id (otherwise `frameIds: [0]`).
- Startup-time `reconcileOpenNowCoderResultTabs` reconciles an
  already-open eligible result tab after worker initialization
  and on `chrome.runtime.onStartup`.

The review's HIGH #1 and MEDIUM #2/#4 findings are corrected:
diagnostics are persisted to `session.contentIngressDiagnostics`
(`injection_failed` only, capped at 20, closed schema), ready
registry is persisted to `session.contentIngressReady` (capped at 20,
closed schema, used by Task 5 only — never enters capture state),
and the `onCommitted` listener performs an idempotent per-tab
cleanup if the URL fails the gate (no orphan transient entries).

### Task 4 — Production-dist E2E around ingress

PASS.

- `tests/extension-e2e/capture-v4-nowcoder.spec.ts` adds the `direct
  exact result creates one unmatched E3 without delivery` scenario
  covering Task 5's fail-closed observation guarantee.
- The Fake OJ routing still serves the exact NowCoder family; the
  new ingress recovery does not change production extension
  behavior for LeetCode, AtCoder, Codeforces, or Luogu.

`npm run extension:check` PASS. `npm run extension:e2e` 47/47
passed on the second consecutive run; one transient Playwright
beforeEach timeout on the historical Fake OJ
`HTTP 200 business rejection` resolved on isolated rerun
(unrelated to this repair).

### Task 5 — Real history-open ingress observation

PASS. Authorized on 2026-07-29. No real `ac.nowcoder.com`
network traffic — Playwright bundled Chromium
`ac.nowcoder.com/**` requests are routed through the bundled
helper that serves the nowcoder route family.

- File: `tests/extension-e2e/capture-v4-nowcoder-task5-real-observation.spec.ts`.
- Observed: exactly one `contentIngressReady` record
  `{ reason: "ready_record", tabId: <chrome>, frameId: 0, documentId: uuid }`;
  exactly one unmatched E3 with
  `externalSubmissionId === "84258557"`,
  `problemExternalId === "acm/contest/18839/1001"`,
  `verdict === "Wrong Answer"`;
  `confirmedSubmissions/outbox/quarantine` all empty; default SQLite
  metadata unchanged.

### Task 6 — Same-build fresh full-chain real retest

PASS. Authorized on 2026-07-29. Production-built `extension/dist`
exercised on a fresh profile with the disposable local app paired.

- File: `tests/extension-e2e/capture-v4-nowcoder-task6-real-retest.spec.ts`.
- Observed E0 → E1 → E2 → E3 → bundle → `POST /api/capture/attempts`
  → SQLite training attempt on a single commit-able SHA. The
  disposable SQLite gained exactly `+4 capture_events`,
  `+1 training_session`, `+1 training_attempt`. A subsequent
  reload of the delivered result page and a navigation to a
  mismatched `submissionId` did not duplicate the bundle.

### Authoritative verification

`npm run quality:gate` exited 0 on 2026-07-29 — see the full table
in `work/reports/v4-nowcoder-e3-ingress-repair-2026-07-29.md`.

### Boundary carried forward

- NowCoder remains `experimental` for DOM and V4 network
  readiness. Promotion is not authorized by this plan.
- No push, no PR, no user data modification, no default-database
  write, no real ac.nowcoder.com HTTP traffic outside the bundled
  Chromium route interceptor.
- The four other real OJ platforms remain uncharacterized for V4
  network capture in this plan's scope.

