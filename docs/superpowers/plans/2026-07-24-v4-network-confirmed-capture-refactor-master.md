# Chrome Extension Capture Protocol V4 Network-Confirmed Refactor Master Plan

> **For agentic workers:** Execute only one linked phase plan at a time. Use
> test-driven development for behavior changes, request independent review at
> every phase gate, and never treat unit tests, Fake OJ tests, real observation,
> RC freeze, acceptance, and release as interchangeable outcomes.

**Status:** Approved for phased execution on 2026-07-24. Phase 0 is complete and
engineering-verified. Phase A Tasks A0-A9 are complete as the authoritative
Phase A closeout scope; A10-A12 are deliberately deferred at user
direction. All four phases (0, A, B, C-D) retain their own authorization
and evidence gates. Phase A closeout report: see
`docs/superpowers/plans/2026-07-24-v4-network-confirmed-capture-refactor-phase-a-evidence-core-extension-e2e.md`
`A9 execution result` block and the `A10-A12 deferred` notes on Tasks
A10/A11/A12. Phase B (NowCoder network pilot) requires fresh explicit
authorization.

**Goal:** Replace click-created pending submissions with a fail-closed,
network-confirmed, platform-adapted evidence pipeline while retaining the V3
atomic attempt bundle, durable delivery, local authorization, and SQLite
projection boundaries.

**Architecture:** Raw browser signals are immediately reduced to safe evidence.
Platform adapters interpret protocol-specific signals but cannot mutate state.
A strict correlator links independent signals, a pure state machine owns all
transitions, and storage modules persist only the minimum state required to
survive MV3 service-worker suspension. Only server-confirmed E2 submissions
appear as waiting; only matching final E3 verdicts create the existing four-event
bundle.

**Linked execution plans:**

- [Phase 0 click-ingress stopgap](./2026-07-24-v4-network-confirmed-capture-refactor-phase-0-click-ingress-stopgap.md)
- [Phase A evidence core and real extension E2E](./2026-07-24-v4-network-confirmed-capture-refactor-phase-a-evidence-core-extension-e2e.md)
- [Phase B NowCoder network pilot](./2026-07-24-v4-network-confirmed-capture-refactor-phase-b-nowcoder-network-pilot.md)
- [Phase C-D platform migration and replacement RC](./2026-07-24-v4-network-confirmed-capture-refactor-phase-c-d-platform-migration-replacement-rc.md)

## 1. Audited Repository Baseline

Audit date: 2026-07-24.

- Branch: `feature/v1-followup`.
- Audit HEAD: `1ce70959fb0d08704c880a15447ecd25c2229fa7`.
- Audit worktree: clean.
- V3 implementation freeze point recorded by the repository:
  `2f4f5d895ea8d965fb64d19dc784ca5514480688`.
- Phase 0 is complete and user-accepted. AtCoder is the only adapter whose
  existing visible-DOM verdict detector is marked `production`.
- The V0 manual learning loop is implemented but not accepted. Formal
  observation, same-SHA F1-F4, and explicit V0 acceptance remain incomplete.
- `docs/superpowers/README.md` calls the V0 closeout plan active, while the
  closeout plan itself still says `Paused`. This is an authority conflict, not
  a harmless wording difference.
- The user's current real-browser report demonstrates a new acceptance blocker:
  navigating through NowCoder without submitting can make the popup waiting
  count increase. The exact live DOM trigger has not been retained and must not
  be invented, but the code proves the unsafe architecture can create waiting
  state from a qualifying click alone.
- Planning V4 does not by itself rewrite repository status. The first Phase 0
  task must reconcile the authority documents before any runtime commit is
  considered an observation candidate.

### Current click-to-waiting path

The audited implementation is:

```text
extension/src/content.ts click listener
-> detectProblemFromPage(...)
-> isExactSubmitControl(...)
-> contentRuntime.submissionObserved()
-> SUBMISSION_INTENT_OBSERVED
-> background.persistSubmissionIntent(...)
-> chrome.storage.local.pendingSubmissionIntents(status = active)
-> popup: waiting count +1
```

Code evidence:

- `extension/src/content.ts:116-130` converts a qualifying click into
  `runtime.submissionObserved()`.
- `extension/src/contentRuntime.ts:91-119` generates local session/submission
  identifiers and emits the intent.
- `extension/src/background.ts:134-149` writes the intent to local storage.
- `extension/src/popup.ts:25-45` counts active intents as `等待判题`.
- `extension/src/submissionControl.ts` uses exact normalized labels, so
  `Array.includes` is not a substring bug. However, the click gate does not
  inspect `event.isTrusted`, visibility, `disabled`, or `aria-disabled`.
- NowCoder currently accepts any matching native button, submit/button input,
  or explicit role-button with the exact label `提交` or `保存并提交`; it does not
  require the observed `button.btn-submit` contract.

## 2. Root Cause

The defect is not primarily a selector-quality problem. The system promotes a
UI action into a submission fact before observing any server interaction.

An exact label, trusted browser click, visible button, platform route, or
disabled-state check can make a hint less noisy, but none can prove:

- a request was sent;
- the request reached the server;
- the server accepted the submission;
- a stable submission object was created;
- a later verdict belongs to that submission.

Therefore the V3 invariant "exact click creates active pending" is invalid. V4
must move the active-waiting boundary to server-confirmed evidence.

## 3. V3 Modules To Preserve

The refactor is not a capture-system rewrite. Preserve these verified product
boundaries unless a failing V4 test proves a minimal additive change is needed:

- `POST /api/capture/attempts`.
- The ordered four-event atomic attempt bundle.
- `captureOutbox` and `captureQuarantine`.
- ACK schema validation and identity matching.
- Retry, backoff, item isolation, and storage-reserve behavior.
- Pairing credential, installation binding, rotation, and revocation.
- SQLite `capture_events`, `training_sessions`, and `training_attempts`
  projection transaction.
- The normalized final-verdict taxonomy.
- `SerializedWorkExecutor` as the background mutation ordering boundary.
- Existing page identity and visible final-verdict extractors when they remain
  evidence-backed.

Minimal additive server contract change permitted by V4:

- Historical `SUBMISSION_OBSERVED.payload.action = "submit_clicked"` must remain
  readable because persisted data and old bundles exist.
- V4 may add `"submission_confirmed"` to the schema and emit it for new bundles.
  Do not rewrite historical rows.

## 4. Confirmed Chrome MV3 Constraints

The following facts were rechecked against official documentation:

1. Manifest V3 retains ordinary `chrome.webRequest` observation. The principal
   MV3 restriction is that `webRequestBlocking` is unavailable to ordinary
   extensions; V4 needs observation, not blocking.
2. `onBeforeRequest` can expose request-body data only when `requestBody` is
   explicitly requested. V4 must leave it disabled by default.
3. webRequest exposes request lifecycle, method, URL, request ID, tab/frame,
   document identity, status, redirects, completion, and errors, but not the
   response body.
4. A `requestId` remains stable for one request lifecycle within a browser
   session. It is not a cross-restart submission identity.
5. `documentId` identifies the actual document and changes when a frame opens a
   new document; `frameId` alone survives navigation and is insufficient.
6. Static content scripts default to the `ISOLATED` world. A separately declared
   `MAIN` world script shares the page JavaScript environment and is therefore a
   low-trust source.
7. `chrome.storage.session` is in memory, is not exposed to content scripts by
   default, and is cleared by extension disable/reload/update and browser
   restart.
8. MV3 service workers are suspended and restarted. Global variables are
   coordination caches only, never authoritative state.
9. `webNavigation` reports SPA history updates and document IDs. It has no
   defined ordering relative to webRequest, so correlation cannot depend on a
   universal inter-API event order.
10. Playwright supports unpacked MV3 testing with bundled Chromium, a persistent
    context, `--disable-extensions-except`, `--load-extension`, and explicit
    service-worker discovery. Branded Chrome and Edge removed the required
    side-load flags.
11. `chrome.debugger` exposes CDP Network capabilities but requires the broad
    `debugger` permission and creates a visible debugging attachment. It is not
    an acceptable product dependency.
12. `chrome.devtools.network` can expose response content but requires an open
    DevTools extension page and is not an always-on product channel.

Official sources:

- https://developer.chrome.com/docs/extensions/reference/api/webRequest
- https://developer.chrome.com/docs/extensions/reference/api/storage
- https://developer.chrome.com/docs/extensions/develop/concepts/service-workers/lifecycle
- https://developer.chrome.com/docs/extensions/develop/concepts/content-scripts
- https://developer.chrome.com/docs/extensions/reference/api/webNavigation
- https://developer.chrome.com/docs/extensions/reference/api/debugger
- https://developer.chrome.com/docs/extensions/reference/api/devtools/network
- https://developer.chrome.com/docs/extensions/reference/api/scripting
- https://playwright.dev/docs/chrome-extensions

## 5. Platform Facts Still Requiring Network Characterization

Do not infer these from UI labels, old blog posts, or another OJ:

- NowCoder's current submission endpoint and method.
- Whether it uses fetch, XHR, form navigation, or more than one mechanism.
- Whether HTTP 200 can represent a rejected business operation.
- Whether its submission ID is in response JSON, a header, redirect, SPA URL,
  or a later API response.
- Authentication expiry, CSRF rejection, empty-code validation, rate limiting,
  duplicate submission, and cancellation behavior.
- Current LeetCode, Codeforces, and Luogu internal endpoint fields.
- Whether an existing platform's response summary is stable enough to retain as
  a fixture-backed adapter contract.

Each platform migration starts with a dated, sanitized characterization. A
missing protocol fact is a `BLOCKED` result, not permission to guess.

## 6. Open-Source Review

Reviewed repositories include:

- https://github.com/arunbhardwaj/LeetHub-2.0
- https://github.com/raphaelheinz/LeetHub-3.0
- https://github.com/LeetSync/LeetSync
- https://github.com/legojeon/LeetHub-Neo
- https://github.com/QasimWani/LeetHub

Useful platform techniques include extracting a submission ID from an exact
result URL, observing SPA navigation, wrapping page fetch/XHR, and polling or
observing narrow verdict DOM. They remain platform-specific techniques.

No reviewed project establishes a reusable cross-OJ contract equivalent to:

```text
real request observed
-> server acceptance confirmed
-> one stable submission identity
-> waiting state
-> matching final verdict
```

The project may borrow adapter-level techniques but must own its evidence model,
correlator, state machine, storage recovery, privacy gate, and acceptance tests.

## 7. Options Considered

### Option A: Continue strengthening DOM/button rules

Advantages:

- Small implementation cost.
- Useful as an immediate false-positive stopgap.

Rejected as final architecture because:

- It cannot prove a network request.
- It cannot distinguish transport success from business rejection.
- It cannot establish a stable server submission identity.
- Every platform/UI redesign reopens the same causal defect.

### Option B: Network-first evidence fusion

Advantages:

- Separates real transport evidence from UI hints.
- Allows per-platform confirmation policies without forcing three identical
  channels on every OJ.
- Supports strict concurrency and ambiguity handling.
- Creates independently testable adapter, correlator, state, storage, and
  delivery boundaries.

Costs:

- Requires network characterization.
- Requires new MV3 permissions and background observers.
- Requires a real unpacked-extension E2E lane.

Decision: **Selected.**

### Option C: `chrome.debugger` / CDP product capture

Advantage: broad network visibility including response retrieval.

Rejected because the permission and debugging attachment exceed the product's
minimum-data and minimum-permission boundary. CDP remains acceptable only for a
separately authorized, one-time developer investigation tool that never ships.

## 8. Recommended Runtime Architecture

```text
Raw Browser Signals
  -> platform-specific immediate sanitization
Safe Evidence
  -> Evidence Correlator
Correlated Evidence
  -> Capture State Machine
State Effects
  -> session/local storage
Finalized Submission
  -> existing atomic bundle
  -> existing outbox/quarantine/ACK/API/SQLite
```

The popup is a read-only presentation of stored state. It cannot create,
confirm, pair, merge, or finalize a submission.

## 9. Evidence Model

Evidence contains only fields required for deterministic correlation:

```ts
type EvidenceBase = {
  readonly schemaVersion: 1;
  readonly evidenceId: string;
  readonly platform: Platform;
  readonly tier: "E0" | "E1" | "E2" | "E3";
  readonly kind: string;
  readonly receivedAt: string;
  readonly tabId: number;
  readonly frameId: number;
  readonly documentId: string;
  readonly adapterVersion: string;
};
```

Tier semantics:

| Tier | Name | Minimum fact | May increase waiting? |
|---|---|---|---|
| E0 | `UI_HINT` | A bounded user-visible UI action occurred | No |
| E1 | `REQUEST_OBSERVED` | webRequest observed an exact adapter request | No |
| E2 | `SUBMISSION_CONFIRMED` | A recent E1 was linked to server acceptance and a stable submission ID | Yes |
| E3 | `FINAL_VERDICT_CONFIRMED` | A final verdict matches the confirmed submission | Finalizes |

`RawNetworkObservation` is an internal callback-local type. It must never be
accepted by state, storage, logs, fixtures, popup, or error reports.

`SafeRequestEvidence` may include:

- `requestId`;
- method;
- adapter-normalized endpoint key;
- resource type;
- tab/frame/document IDs;
- request lifecycle phase;
- status code;
- normalized redirect target;
- explicitly allowlisted scalar fields extracted in the adapter.

It may never include original body bytes, original response text, cookies,
authorization, CSRF values, source code, complete headers, or user identity.

## 10. Correlator Rules

### webRequest lifecycle

- `onBeforeRequest` creates one E1 request record.
- Redirect, response, completion, and error signals update the same record by
  `requestId`; they are not separate E1 candidates.
- A canceled/error/expired request cannot become E2.

### MAIN response summary to E1

MAIN bridge messages do not and cannot share webRequest `requestId`. They are
accepted only when all of these match exactly:

- platform;
- tab ID;
- frame ID;
- document ID;
- method;
- adapter-normalized endpoint key;
- adapter-defined short time window;
- exactly one unmatched E1 request.

Result:

- exactly one candidate: produce correlated evidence;
- zero candidates: discard the bridge message;
- more than one candidate: record bounded `AMBIGUOUS` diagnostics and produce no
  state transition.

Do not compare page `Date.now()` directly with webRequest `timeStamp`. Chrome
only guarantees API timestamps are internally consistent. The background worker
assigns a `receivedAt` value to every channel for cross-channel windows.

### Stable identity

Once obtained, `platform + externalSubmissionId` is the stable correlator key.
The adapter validates its type/format before it reaches state. A deterministic,
namespaced capture identity is derived for the existing server contract so
submission IDs from different platforms cannot collide.

## 11. Capture State Machine

Primary states:

```text
IDLE
-> REQUEST_OBSERVED
-> SUBMISSION_CONFIRMED
-> FINALIZED
```

Terminal/exception states:

- `REJECTED`: transport or business rejection.
- `AMBIGUOUS`: more than one legal correlation candidate.
- `EXPIRED`: the evidence window elapsed.

Optional phase field on `SUBMISSION_CONFIRMED`:

- `queued`;
- `judging`;
- `running`.

The phase is not a required state transition. Platforms may confirm and then
immediately return a final verdict.

Required invariants:

- E0 is optional and can never create E1/E2.
- Every E2 references one non-rejected, non-expired E1.
- E2 is idempotent by stable submission key.
- E3 must be final, occur after E2, match problem identity, and match stable
  submission identity when one is available.
- E3 before E2 may be retained only as short-lived session evidence when it has
  an exact stable identity; it cannot create waiting or a bundle by itself.
- Direct historical result-page opens create no E2 and no bundle.
- Any uncertainty produces no training record.

The pure test matrix must cover UI-only activity, keyboard submission, request
without hint, cancellation, HTTP 4xx, HTTP 200 business failure, direct final,
long judging, rapid repeated submissions, concurrent submissions, ambiguous
correlation, cross-tab/frame/document, SPA, BFCache, worker restart, browser
restart, extension reload/update, stale result pages, identity mismatch,
duplicate verdict, timeout cleanup, and forged bridge messages.

## 12. Adapter Contract

Adapter responsibilities:

- match a problem page;
- match a submission request;
- extract only allowlisted request scalars;
- normalize an endpoint key for correlation;
- interpret a response summary;
- interpret redirects and navigation;
- extract/validate a stable submission ID;
- extract a final verdict from an evidence-backed surface.

Adapters return Evidence or `null`. They cannot:

- read/write Chrome storage;
- create pending/confirmed records;
- search another adapter's platform;
- choose among multiple correlator candidates;
- construct an attempt bundle;
- call the local API;
- log raw browser signals.

Target structure:

```text
extension/src/adapters/
  contract.ts
  registry.ts
  shared/
  leetcode/{page,network,verdict}.ts
  nowcoder/{page,network,verdict}.ts
  atcoder/{page,network,verdict}.ts
  codeforces/{page,network,verdict}.ts
  luogu/{page,network,verdict}.ts
```

Split `platforms.ts` gradually. Existing exported functions may temporarily
delegate to the new registry so one phase does not rewrite all platforms.

## 13. Storage Boundaries

| Area | V4 responsibility |
|---|---|
| `chrome.storage.session` | E0 hints, E1 request lifecycles, page contexts, unmatched E3, ambiguity diagnostics |
| `chrome.storage.local` | E2 confirmed submissions, finalized-key tombstones, migration audit, outbox, quarantine, pairing |
| SQLite | Completed attempt bundles only |

Recovery behavior:

- Worker suspension: reload session/local state and continue.
- Browser restart: unconfirmed E1 is lost and must not be reconstructed; E2
  remains and may still receive a matching E3.
- Extension reload/update: session evidence is lost; migration is idempotent;
  local E2/outbox/quarantine/pairing remain.
- Corrupt/unknown stored value: reject that value and fail closed. Do not cast
  arbitrary storage data into trusted state.

Finalized tombstones may be bounded because V4 bundle/event IDs are
deterministic. If a very old E3 is reobserved after tombstone expiry, the local
API's existing idempotent replay prevents a second SQLite attempt.

## 14. Privacy and Security Boundary

Mandatory transformation:

```text
RawNetworkObservation
-> synchronous adapter sanitization
-> SafeSubmissionEvidence
```

Forbidden in storage, logs, fixtures, errors, and test artifacts:

- source code;
- Cookie or Set-Cookie;
- Authorization;
- CSRF names paired with values;
- passwords or tokens;
- complete request or response bodies;
- complete headers;
- account/user identity;
- full commercial statements.

If a platform requires a problem ID from a request body:

- requestBody is enabled only for that adapter's exact URL/method filter;
- the adapter parses synchronously;
- only a documented allowlisted scalar leaves the function;
- original bytes are never logged, copied into state, or placed in an error;
- source-code fields are ignored even when present.

MAIN bridge rules:

- opt in per adapter;
- emit only schema-bounded summaries;
- apply message size and field-count caps;
- validate again in the isolated relay and background;
- never create E2 without one unique webRequest E1;
- treat page messages as forgeable.

## 15. V4 Migration

Protocol migration requirements:

- increment the extension capture protocol to V4 exactly once;
- remove all V3 click-only active intents from waiting state;
- record removed count, migration time, source protocol, target protocol, and
  reason;
- preserve completed `captureOutbox` bundles;
- preserve quarantine;
- preserve installation ID and pairing credential;
- preserve server-side capture events, sessions, and attempts;
- preserve V2/V3 migration audit fields;
- write V4 authoritative state before removing legacy keys;
- remain idempotent across service-worker restart and extension reload;
- never reclassify a V3 click intent as an E2 confirmed submission.

## 16. Phase Overview

Tasks that modify shared entry points such as `background.ts`,
`attemptCapture.ts`, `installation.ts`, and `popup.ts` must execute in phase
order. Do not delegate overlapping writes to these files across phases; later
tasks must start from the verified result of the preceding phase.

### Phase 0: click-ingress stopgap

Disable click-created waiting globally, harden NowCoder's hint surface, migrate
legacy active intents, and make popup semantics honest. Automatic capture may be
temporarily unavailable; that is safer than retaining an unproven pending state.
Phase 0 is not V4 completion.

### Phase A: V4 infrastructure

Implement evidence, adapter contracts, correlator, state machine, storage,
network observer, optional bridge, background orchestration, Fake OJ, and the
real unpacked-extension E2E lane. Do not claim any real OJ network protocol is
supported merely because synthetic tests pass.

### Phase B: NowCoder experimental pilot

Obtain a user-authorized safe transcript from real submissions, implement the
NowCoder network policy, prove the known browse-only negative case, and perform
same-build real observation. This yields at most `experimental` V4 readiness.

### Phase C: platform waves

Migrate one platform at a time in the order:

```text
LeetCode -> AtCoder -> Codeforces -> Luogu
```

Each platform receives a new delta plan after characterization. No platform
inherits another platform's endpoint, field, timeout, or acceptance policy.

### Phase D: replacement RC

Freeze only after target platforms pass real extension E2E, privacy review,
real observation, same-SHA F1-F4, and explicit user acceptance.

## 17. Test Architecture

### Pure tests

Add focused Vitest suites for:

- evidence schemas and forbidden-field rejection;
- adapter matching/sanitization;
- correlator uniqueness;
- state transitions;
- storage migration/recovery;
- deterministic bundle identity;
- popup presentation.

### Safe network transcript fixtures

Each fixture records:

- acquisition date;
- platform and page type;
- evidence tier;
- whether a user performed the action;
- method and normalized path;
- resource type and status;
- normalized redirect path;
- response top-level field names;
- submission/status field names and scalar types;
- tab/frame/document relationship;
- expected E1/E2/E3 outcome;
- whether it may satisfy a production gate.

Fixtures never contain raw bodies, code, credentials, identities, or full
headers.

### Fake OJ

The Fake OJ must simulate:

- response with submission ID;
- 302 redirect to exact result URL;
- SPA result URL;
- HTTP 200 business rejection;
- HTTP 4xx;
- cancellation/network error;
- judging then final;
- immediate final;
- concurrent submissions;
- duplicate submissions/verdicts;
- forged MAIN bridge messages;
- multiple E1 candidates for one summary.

### Real unpacked-extension E2E

Create a separate Playwright configuration and command. The existing ordinary
Playwright lane must continue to assert no extension is loaded.

The extension lane must:

- build and load the exact `extension/dist` artifact;
- use bundled Chromium and a new persistent profile;
- obtain the MV3 service worker;
- install all network denial routes before navigation;
- allow only explicit Fake OJ responses and localhost API traffic;
- inspect real `storage.session` and `storage.local` through the extension
  worker;
- open the real popup URL;
- verify outbox, ACK, API, and disposable SQLite state;
- clean the profile/database without following links or reparse points.

Hard spike: Playwright `route.fulfill()` must be proven to trigger the real
extension webRequest listener. A Playwright request event alone is not proof.
If the spike fails, evaluate a loopback HTTPS/host-mapping harness. Do not widen
the production manifest, use a test-only manifest, or load a modified dist just
to make the test pass. If no exact-production-artifact route is reliable, mark
the E2E task `BLOCKED`.

## 18. Adapter Readiness

Do not reuse the existing single `status` field to claim V4 network readiness.
Track two distinct facts:

- current visible-DOM verdict certification;
- V4 network-confirmed capture readiness.

At audit time:

| Platform | Existing DOM status | V4 network status |
|---|---|---|
| AtCoder | production | uncharacterized |
| LeetCode | experimental | uncharacterized |
| NowCoder | experimental | uncharacterized |
| Codeforces | experimental | uncharacterized |
| Luogu | experimental / historical BLOCKED certification | uncharacterized |

Phase 0 disabling click-created pending does not rewrite historical AtCoder
certification, but AtCoder cannot be called V4-ready until its own network wave
passes.

## 19. RC Re-freeze Conditions

A replacement RC is allowed only when all are true:

- every target adapter has an explicit V4 readiness result;
- no click-only active pending path remains;
- the V4 migration is idempotent and preserves durable user state;
- pure, extension unit, ordinary E2E, real extension E2E, typecheck, lint,
  migration, build, and aggregate quality gates pass;
- the privacy audit finds no forbidden raw data in storage/logs/fixtures/errors;
- user-authorized real submissions are observed on the exact implementation
  SHA;
- same-SHA F1-F4 all approve;
- the user explicitly accepts the replacement candidate.

Engineering PASS is not an RC. RC is not acceptance. Acceptance is not public
release.

## 20. Rollback Strategy

- Before deployment, an individual implementation commit may be reverted using
  ordinary Git history only when explicitly authorized.
- After V4 migration, operational rollback must disable the affected adapter or
  capture globally and fail closed.
- Never restore the click-only V3 waiting path as a fallback.
- Never resurrect removed V3 active intents.
- Durable outbox/quarantine/pairing data must remain forward-compatible through
  an adapter rollback.
- If a platform protocol changes, set its V4 readiness to blocked/disabled,
  retain confirmed/outbox data, and require new characterization.
- Server API/schema changes must be additive so a disabled V4 extension does not
  require a database rollback.

## 21. Suggested Git Commit Boundaries

These are future suggestions, not authorization to commit:

1. `docs(extension): define capture protocol v4 plans`
2. `fix(extension): stop click-only pending intents`
3. `feat(extension): add v4 evidence and adapter contracts`
4. `feat(extension): add strict submission correlator and state machine`
5. `feat(extension): persist transient and confirmed capture state`
6. `feat(extension): observe submission request lifecycles`
7. `feat(extension): add optional response-summary bridge`
8. `test(extension): add unpacked mv3 fake-oj e2e`
9. `test(nowcoder): record sanitized network characterization`
10. `feat(nowcoder): confirm submissions from v4 evidence`
11. One independently verifiable commit set per later platform.
12. One replacement-RC evidence/status commit only after all gates pass.

Before every commit, inspect Git status, complete diff, staged diff, and recent
history; stage explicit task-owned paths only. Never push or create a PR without
explicit authorization.

## 22. Master Completion Criterion

This master plan is complete only when Phase 0, A, B, C, and D reach their own
terminal results, every targeted platform has an honest readiness state, a
replacement RC passes same-SHA verification and real observation, and the user
explicitly accepts it. A `BLOCKED` platform is an acceptable truthful phase
result; guessing a protocol is not.
