# V4 Phase D Upgrade, Restart, Update, and Rollback Reliability Plan

**Status:** `D4 ACCEPTANCE CONTRACT REVISION 2 WRITTEN — independent review required before the next live action`

**Date:** 2026-08-03

**Authority:** This is the sole detailed Phase D D1-D5 plan. The parent V4
master plan and the Phase C-D orchestration plan may summarize Phase D and link
here, but they must not contain a second detailed D1-D5 specification.

**Implementation state:** D1-D3 are complete on immutable Revision 5 candidate
`aa1a572c3913b35dd3f0391f849dab66e79c56a2`. Its exact validator and frozen
dist evidence are recorded in
`work/reports/v4-phase-d-task26-exact-submit-refreeze-2026-08-11.md`. D4 is
incomplete after Task 27 exposed an observation-tool transition rejection;
the receipt did not prove a production failure. Acceptance Contract Revision 2
below separates immutable product evidence from versioned observation-tool
evidence and replaces mandatory millisecond intermediate snapshots with a
causal, invariant-based end-to-end contract. D5 remains stopped. Final user
acceptance remains a separate explicit gate.

**Independent review (2026-08-03):** `APPROVE`. The independent plan reviewer
found no HIGH or MEDIUM blocker and confirmed that this file is the sole
detailed D1-D5 specification, the parent contains only orchestration context,
the platform/status split is accurate, and the D1-D4 gates are executable.
Non-blocking observations are recorded for D2's explicit enumeration of
forbidden-key occurrences, harmless unconditional legacy cleanup removes, and
the already-required executor re-check of Git state.

**Independent D1 scope decision (2026-08-03):** The user authorized a narrow
D1 expansion after review found that the existing runtime did not fail closed
when capture was paused and that the update-like artifact test did not use a
normal replacement build. The authorized boundary permits: a runtime
`captureEnabled` gate at the existing background ingress, a build-script test
variant that still runs the normal production build from the current source
SHA, strict fresh-worker acquisition, and stronger disposable API/identity
assertions. It does not authorize a new kill-switch subsystem, adapter policy,
permission, schema, migration, or network adapter.

**Independent D1 scope revision (2026-08-03, user authorized):** The user
approved one additional narrow exception after final review found that
malformed retained quarantine records could not be safely distinguished from
valid records at the popup/action boundary. D1 may modify only the existing
popup presentation and existing delete action payload to: (a) show malformed
quarantine/outbox diagnostics without retry controls; and (b) carry an explicit
malformed deletion target so deleting one malformed record cannot delete a
valid record with the same visible ID. This is not a UI redesign, product
feature, new control surface, or general action-protocol expansion. No new
permission, adapter, schema, migration, network behavior, or rollback
subsystem is authorized by this revision.

## 1. Authority and Relationship

This plan is subordinate to, and must not rewrite, the following authoritative
records:

- [V4 network-confirmed capture master](./2026-07-24-v4-network-confirmed-capture-refactor-master.md)
- [Phase C-D platform migration and replacement RC orchestration plan](./2026-07-24-v4-network-confirmed-capture-refactor-phase-c-d-platform-migration-replacement-rc.md)
- [Phase C C5 closeout](../../../work/reports/v4-phase-c-c5-closeout-2026-08-02.md)
- [Current handoff](../../../work/handoff-current.md)
- [V4 adapter readiness manifest](../specs/v4-adapter-readiness.json)

The parent Phase C-D plan originally described D1-D5 in detail. That text is
now historical orchestration context only; this file is the only place where
the executable Phase D task contract lives. Phase C C0-C5 execution facts,
platform results, counts, hashes, and closeout boundaries remain in their
existing reports and are not reopened by Phase D.

The dependency order is unchanged:

```text
C5 -> D1 -> D2 -> D3 -> D4 -> D5
```

No D1 work may begin merely because Phase C is complete. Phase D starts only
after this plan is independently reviewed and approved.

## 2. Input Baseline

The baseline recorded while this plan was prepared is:

| Item | Baseline |
|---|---|
| Branch | `feature/v1-followup` |
| Current implementation commit | `97a08c6de2c85d0de128a36d5bf5eebef433aec9` |
| Working tree at plan preparation | clean |
| Upstream divergence at plan preparation | `0/0` against `origin/feature/v1-followup` |
| Phase | Phase C C0-C5 engineering complete; Phase D not started |
| Release state | not RC, not product acceptance, not released |
| Product boundary | V0.5 remains prohibited |

The executor must re-check branch, HEAD, worktree, and upstream before D1. The
table is an input fact, not a permission to commit or start implementation.

### 2.1 Platform status must stay split

The registry DOM status and the V4 network readiness status are different
artifacts and must be asserted separately.

| Platform | Registry DOM `status` | Registry/readiness V4 network status | Phase D treatment |
|---|---|---|---|
| LeetCode | `experimental` | `experimental` | Existing policy only; no new adapter |
| NowCoder | `experimental` | `experimental` | Existing policy only; no new adapter |
| AtCoder | `production` | `blocked` | Preserve historical DOM certification; do not retry network capture |
| Codeforces | `experimental` | `blocked` | Preserve blocker; do not retry network capture |
| Luogu | `experimental` | `blocked` | Preserve blocker; do not retry network capture |

The `production` AtCoder value in the second column is historical DOM
certification only. It does not make AtCoder V4 network-ready. No Phase D task
may promote, demote, or reinterpret these results.

### 2.2 Current implementation surfaces to inspect

D1 must use the current repository behavior as the subject of tests, not a
new storage design. The relevant surfaces include:

- `extension/src/installation.ts`: protocol version 4, initialization plan,
  local/session split, legacy cleanup, and `applyExtensionInitializationSplit`.
- `extension/src/backgroundOrchestrator.ts`: local/session key surfaces,
  durable projections, event reduction, and restart rehydration.
- `extension/src/confirmedSubmissionStorage.ts`: confirmed records and bounded
  tombstones.
- `extension/src/outboxDrain.ts`: delivery, retry, quarantine, and ACK
  behavior.
- `extension/src/background.ts`: initialization, alarms, webRequest wiring,
  Service Worker recovery, and content ingress recovery.
- `extension/src/transientEvidenceStorage.ts`: bounded session evidence and
  pruning.
- `extension/src/adapters/registry.ts` and
  `docs/superpowers/specs/v4-adapter-readiness.json`: separate DOM and V4
  status contracts.
- `extension/build.mjs`, `scripts/check-extension-dist.mjs`, and
  `playwright.extension.config.ts`: exact production-dist build and test
  boundaries.
- `lib/db/migrations.ts` and existing migration suites: SQLite forward
  migration, idempotency, and transaction rollback evidence.

## 3. Goal

Phase D validates reliability before a replacement implementation candidate is
considered. It is a reliability and release-evidence phase, not a feature
phase. It must establish, within a bounded and honest scope, that:

- legacy V2/V3 state can be upgraded forward to the current V4 storage shape;
- repeated initialization does not duplicate, rewrite, or promote state;
- an interrupted initialization can be resumed from each explicit persistence
  boundary;
- Service Worker, browser, extension reload, disable/enable, and exact-dist
  replacement behavior are separately understood;
- confirmed submissions, tombstones, outbox, quarantine, pairing, and delivery
  metadata are not lost or identity-rewritten;
- legacy click-derived pending state is removed safely and never resurrected;
- duplicate E3/API delivery remains one durable attempt;
- supported rollback is operationally fail-closed and non-destructive;
- registry and readiness states do not drift during upgrade or rollback;
- production build, extension installation, and update-like paths use the exact
  production artifact rather than a test-only manifest or modified bundle.

Phase D does not make an engineering PASS an RC, an RC an accepted product,
or an accepted product a public release.

## 4. Non-Goals and Hard Boundaries

The following are outside this plan:

- No new OJ network adapter and no reimplementation of an existing adapter.
- No retry of AtCoder, Codeforces, or Luogu without new legal protocol evidence
  and a separately reviewed platform delta plan.
- No modification of the current blocked platform conclusions.
- No new product behavior, business feature, UI rewrite, or performance work.
- No Web Store, CRX, managed-policy, browser-channel, Edge, macOS, or automatic
  enterprise-update certification.
- No destructive downgrade, database DOWN migration, schema rollback, or
  restoration of a V3 click-only waiting path.
- No resurrection or consumption of removed V3 `pendingSubmissionIntents`.
- No direct editing of a real Chrome profile, Chrome LevelDB, or the default
  `training-platform.sqlite`.
- No deletion of user data as a rollback mechanism.
- No V0.5, Public Beta, deployment, publication, or release work.
- No Phase D implementation before this plan is independently approved.

### 4.1 Supported rollback scope

Rollback has two deliberately limited meanings:

1. **Before deployment:** An explicitly authorized Git revert of the
   implementation candidate using ordinary history. No revert is authorized by
   this plan.
2. **After V4 storage has been used:** Disable the affected adapter or disable
   global capture so new evidence fails closed, while retaining durable
   confirmed submissions, tombstones, outbox, quarantine, pairing, and delivery
   metadata. A later build may mark a platform `blocked` or `disabled` only
   through the normal reviewed registry/readiness process.

The current plan does not authorize a new runtime kill-switch field or a new
adapter-management subsystem. D1 must prove what the current `captureEnabled`
and registry/readiness boundaries actually do. If a safe rollback cannot be
expressed through existing behavior without changing an adapter, manifest,
migration, or unrelated shared contract, D1 stops with a blocker rather than
adding an unplanned mechanism.

Existing outbox delivery policy during global capture pause must be recorded,
not guessed. D1 must state whether already-created outbox items are retained,
drained, deferred, or blocked under the current implementation. In every case,
their identity and serialized bundle must remain unchanged. If a required
rollback policy cannot be expressed safely, the result is `BLOCKED`, not an
implicit behavior change.

### 4.2 Recovery definition

Recovery means re-running the current initializer and its normal storage
operations from a documented interruption boundary. It does not mean repairing
arbitrary hand-edited, malformed, or semantically contradictory storage.
Malformed known records must fail closed, remain non-promoted, and be reported
as a stop condition if the current parser cannot safely retain them.

## 5. Phase D State Labels

The following labels must remain distinct:

- `engineering gate PASS`: the named automated checks passed.
- `real observation PASS`: the authorized disposable Chrome operation was
  actually performed and its evidence validated.
- `APPROVE`: an independent reviewer accepts the specified evidence.
- `RC`: a candidate has passed the applicable same-SHA release gates; this is
  not user acceptance.
- `Accepted`: the user explicitly accepts the candidate; this is not public
  release.
- `Released`: a separate future authorization, not in Phase D.

Until section 7.7 / Gate D1-C completes, D1 may not be called complete even if
every automated command passes.

## 6. Submission and Evidence Identity

Phase D uses two different commit identities. They must never be conflated.

### 6.1 D3 immutable implementation candidate SHA

The D3 candidate SHA is the exact authorized implementation commit used for
all subsequent same-build evidence. It contains the reviewed implementation,
tests, fixtures, scripts, and current-state documents allowed by D3. It is
immutable for D4/D5 observation purposes.

The candidate SHA must be recorded before real observation begins, together
with the exact hashes of the built files at that SHA. The ignored
`extension/dist` directory is not a substitute for recording hashes.

### 6.2 D4/D5 evidence and observation-tool commits

A D4/D5 status commit is a later, separately authorized commit containing only
evidence reports, validator inputs, and status/documentation reconciliation
permitted by D4/D5. It is not a new implementation candidate and cannot change
runtime behavior.

A D4 observation-tool commit is versioned separately from the D3 product
candidate. It may change only the dedicated live-observation runner/helper and
their focused unit tests, plus plan/report/handoff documents. It may not change
runtime source, manifest, permissions, build scripts, database schema, adapter
policy, production E2E behavior, or the frozen dist. The report must record
both identities:

- `productCandidateSha` and the five frozen artifact hashes; and
- `observationToolSha` (or an exact dirty-diff hash before commit) and the
  observation helper/runner hashes.

Before a live action, an observation-tool change must pass its focused tests,
typecheck, targeted lint, privacy audit, `node --check`, `git diff --check`,
and an explicit candidate-isolation diff proving the product candidate and
loaded artifact are unchanged. This narrow tooling lane does **not** invalidate
the D3 candidate. Mixing product and tool changes in one commit is forbidden
and returns the work to D3.

An evidence-only status commit, and the observation-tool commit outside its
explicit allowlist, must not modify:

- runtime source;
- `extension/manifest.json` or permissions;
- SQLite migrations or schema;
- `extension/build.mjs` or any build script;
- adapter protocol or registry behavior;
- the exact production artifact used for the observation.

If any of those change, the D3 candidate SHA is invalid for all real
observations. The process returns to D3, creates a new authorized candidate,
rebuilds the artifact, and repeats the required observations. Reports may not
bridge observations from different implementation SHAs.

## 7. Task D1 - Upgrade, Restart, Update, and Rollback Reliability

**Objective:** Prove forward upgrade, repeated initialization, restart/update
recovery, durable-state retention, and supported fail-closed rollback without
duplicate attempts or legacy click-state resurrection.

**Dependency:** Phase C C5 closeout and independent approval of this plan.

**D1 artifacts after approval:**

- Create `tests/unit/extensionV4UpgradeMatrix.test.ts`.
- Create `tests/extension-e2e/capture-v4-upgrade.spec.ts`.
- Create a dated report at
  `work/reports/v4-phase-d-d1-upgrade-reliability-YYYY-MM-DD.md`.
- Modify installation/storage/orchestrator code or the extension E2E harness
  only when a D1 RED test proves a narrowly scoped defect.
- Test-only additions to existing migration suites are allowed when needed to
  close a proven migration coverage gap; no SQLite migration SQL may be added
  or changed.

**D1 does not authorize:** adapter protocol work, blocked-platform retries,
manifest permission changes, UI work, schema changes, a new rollback subsystem,
or changes outside a proven RED failure.

### 7.1 D1.1 - Matrix and RED tests first

Before changing implementation code, write failing tests for the following
state classes. The RED run must be recorded; a pre-existing test that already
passes is coverage evidence, not a reason to skip the matrix entry.

#### Upgrade seed states

- Fresh V4 install with no local or session state.
- V2 state with `eventQueue`, including a non-empty queue and its discard
  accounting.
- V3 state with active, superseded, and expired `pendingSubmissionIntents`.
- V3 state with authoritative `captureOutbox`, `captureQuarantine`, pairing
  credential, endpoint, retry fields, and stale legacy `outbox`/`quarantine`.
- Current V4 state with confirmed submissions, tombstones, pending outbox,
  quarantine, credential/version, last-delivery metadata, and unknown keys.
- Current V4 state with E1-only transient session evidence.
- Current V4 state with confirmed E2, finalized submission/tombstone, and a
  pending outbox bundle.
- Current V4 state with retry-blocked outbox and quarantined item.
- State representing every partial initialization boundary in section 7.2.

#### Required assertions

Every matrix case must record before/after:

- all known storage keys and all intentionally unknown sentinel keys;
- local/session placement of each key;
- confirmed, tombstone, outbox, quarantine, E0, E1, unmatched-E3, and
  diagnostic counts;
- `storageKey`, platform, problem identity, external submission identity, and
  bundle identity for retained records;
- `waitingCount`, `outboxCount`, `finalizedCount`, and derived state;
- legacy key presence/removal;
- API request count, ACK count, SQLite capture-event count, session count, and
  training-attempt count where the E2E path is used;
- default database metadata before and after the run.

### 7.2 D1.2 - Six explicit persistence interruption boundaries

The test harness must inject failure at each exact operation in
`applyExtensionInitializationSplit`. The normal order is:

```text
local.set
session.set
remove pendingSubmissionIntents
remove eventQueue
remove outbox
remove quarantine
```

The conditional removals are only applicable when their legacy key is present
or the initialization plan requests removal. The `outbox` and `quarantine`
removals are the explicit cleanup of the old key names; authoritative
`captureOutbox` and `captureQuarantine` are retained separately.

For each boundary, use a storage spy that can reject immediately before the
operation mutates state. Where the fake storage can model it safely, run a
second variant that applies the mutation and then rejects the promise, because
the caller cannot distinguish that ambiguous completion. No test may edit a
Chrome profile or SQLite file to simulate the failure.

The preceding `local.get` and `session.get` calls are a separate read-failure
probe, not one of the six mutation boundaries. If either read rejects, the
test must assert that no mutation or legacy cleanup occurred and that a retry
is safe.

The following table is normative.

| Boundary | Failure injection position | First re-run expectation | Second re-run / idempotency expectation | `migratedAt` semantics | Durable, unknown-key, and default-DB requirements |
|---|---|---|---|---|---|
| `local.set` | Reject at `storage.local.set(localItems)` before mutation; also test post-apply rejection when the spy supports it | If no local mutation happened, the first successful re-run is the migration event. It writes V4 authoritative state before any legacy cleanup. If the write did apply, the re-run reads V4 state and does not recalculate the migration | No duplicate confirmed record, outbox item, quarantine item, tombstone, or migration audit. A second run produces no material state change; repeated safe removes may be called as no-ops | For V3, a failed pre-write attempt has no persisted timestamp; the first successful write sets `migratedAt` to that run's supplied `now`. After a successful write, every re-run preserves the stored timestamp. V2/fresh states have no V3 migration timestamp | Confirmed/outbox/quarantine/credential/settings are not lost. Unknown keys remain. The default SQLite metadata remains unchanged because initialization uses storage only; E2E API state uses a disposable DB |
| `session.set` | Reject at `storage.session.set(sessionItems)` after local authoritative state has succeeded | Re-run restores only the expected session slice that still exists in the selected lifecycle. Local V4 state and legacy migration audit remain authoritative; no local rollback is attempted | A second run does not rewrite unchanged local durable values or duplicate transient entries. Session writes are content-idempotent | The timestamp was persisted by `local.set`; it is preserved and never refreshed by the session retry | Local durable state, unknown local/session keys, and the default DB are preserved. Loss of a session-only slice must not promote an E1/E3 or create an attempt |
| `remove pendingSubmissionIntents` | Reject at `storage.local.remove("pendingSubmissionIntents")` after authoritative writes | Re-run sees V4 state plus the still-present legacy key, keeps the existing migration audit, and removes the key. No active intent is promoted or consumed | A second run finds no pending key and makes no semantic change; no V3 waiting state returns | V3 `migratedAt` is the timestamp already written by `local.set`; it is not changed by cleanup retries | Confirmed/outbox/quarantine/pairing and unknown keys survive. Only this explicit legacy key may be removed. Default DB metadata is unchanged |
| `remove eventQueue` | Reject at `storage.local.remove("eventQueue")` after the authoritative write and any pending-intent cleanup | Re-run sees V4 state with the old queue still present, preserves the recorded discard count/time, and removes only `eventQueue` | A second run is a semantic no-op; no queue is recounted and no discard timestamp changes | If the source is V2, no V3 `migratedAt` is created. If the source is V3 with a queue, the existing V3 timestamp is preserved | Authoritative V4 outbox/quarantine and unknown keys survive. The old queue is the only permitted deletion. Default DB metadata remains unchanged |
| `remove outbox` | Reject at `storage.local.remove("outbox")` after authoritative `captureOutbox` has been written | Re-run never reads or merges stale `outbox`; it retains authoritative `captureOutbox` and removes the stale legacy key | A second run has no stale-key effect and cannot send the stale bundle a second time. Authoritative outbox identity and attempt count remain unchanged | Existing V3 migration timestamp is preserved; cleanup does not create or refresh it | `captureOutbox`, `captureQuarantine`, confirmed state, pairing, and unknown keys survive. Only the explicit old `outbox` key is removed. Default DB metadata is unchanged |
| `remove quarantine` | Reject at `storage.local.remove("quarantine")` after authoritative `captureQuarantine` has been written | Re-run retains authoritative quarantine and removes the stale legacy key without merging it | A second run is a semantic no-op; no quarantined item is duplicated, retried, or deleted from the authoritative key | Existing migration timestamp is preserved; cleanup does not create or refresh it | `captureQuarantine`, `captureOutbox`, confirmed state, pairing, and unknown keys survive. Only the explicit old `quarantine` key is removed. Default DB metadata is unchanged |

For every row, the test must distinguish these cases:

- operation rejected before mutation;
- operation mutated state but its promise rejected;
- operation succeeded and the process stopped before the next operation.

The first successful re-run must be safe in all supported cases. The second
re-run must be semantically idempotent, even if Chrome receives harmless
repeated `remove` calls for already absent legacy keys. A test must not require
zero API calls where the current implementation intentionally issues a safe
cleanup call; it must require zero destructive state changes and zero duplicate
delivery.

### 7.3 D1.3 - Storage key inventory and unknown-key policy

The allowlist for the matrix is the union of all actual extension storage write
entrances, not only `LOCAL_INITIALIZATION_KEYS` and
`SESSION_INITIALIZATION_KEYS`. D1 must verify this inventory against a source
search before asserting preservation.

#### Local durable keys

The current inventory to verify includes:

```text
installationId
captureCredential
captureCredentialVersion
captureEnabled
captureEndpoint
captureProtocolVersion
confirmedSubmissions
confirmedSubmissionTombstones
captureOutbox
captureQuarantine
lastCaptureError
lastSuccessfulCaptureAt
lastDeliveredAttemptId
lastDeliveredAttemptStatus
pairedAt
v4ClickIntentMigration
discardedPreBundleEventCount
preBundleQueueDiscardedAt
```

#### Explicit local legacy cleanup keys

These are not durable V4 authorities and may be removed only for the explicit
upgrade cleanup contract:

```text
pendingSubmissionIntents
outbox
quarantine
```

#### Session and diagnostic keys

The current inventory to verify includes:

```text
uiHints
transientE1
transientPageContexts
transientUnmatchedE3
transientAmbiguityDiagnostics
characterizationSession
b3WitnessState
contentIngressDiagnostics
contentIngressReady
webRequestSpikeMarkers
leetcodeEndpointDiagnostics
```

The first five keys are V4 transient evidence. The remaining keys are
diagnostic/control-plane state and must not enter capture state. Their
lifecycle must be tested separately from confirmed/outbox durability.

Any key found by the source inventory but missing from this plan must be added
to the D1 report before the matrix is accepted. Any key not in the explicit
legacy cleanup list is an unknown or separately owned key and must not be
deleted by initialization. A sentinel unknown key must be seeded in both local
and session storage and asserted after every migration/restart path.

### 7.4 D1.4 - Expected `storage.session` lifecycle matrix

This matrix is a verification hypothesis, not an already accepted fact. Each
row requires evidence. If observed behavior differs from the expected result,
D1 stops and the plan status becomes `BLOCKED` or the scope is independently
revised; the report must not silently rewrite the expectation.

| Lifecycle | Trigger under test | Expected local durable state | Expected session state | Expected runtime behavior | Acceptance status |
|---|---|---|---|---|---|
| Service Worker restart | CDP stop and reawaken of the MV3 worker in one browser/extension session | Retained | Expected retained; verify E1/control-plane state is rehydrated without duplicate listeners | Global caches are rebuilt; one legal continuation is allowed | Pending D1 evidence |
| `chrome.runtime.reload` | Explicit extension runtime reload | Retained | Expected cleared; verify transient state does not resume | New initialization reads local state only and remains fail-closed until legal new evidence | Pending D1 evidence |
| Extension disable/enable | Disable then enable the unpacked extension in the browser UI | Retained while the extension remains installed | Expected cleared; verify diagnostic and B3 sessions do not resume | No stale content runtime or pending click state is accepted | Pending D1 evidence |
| Browser full restart | Close and reopen the persistent browser context/profile | Retained | Expected cleared; verify no transient evidence is promoted | Startup recovery flushes only supported durable state and does not duplicate attempts | Pending D1 evidence |
| Same-path unpacked reload | Reload the same unpacked extension path with the same artifact | Retained | Expected cleared; verify extension ID and durable identity remain stable | Reinitialization is content-idempotent and legacy cleanup is safe | Pending D1 evidence |
| Replacement dist reload | Load the same-source `d1-replacement` build-identifier variant at the same unpacked path/profile | Retained | Expected cleared; verify transient data is not carried across the same-source artifact reload | The variant reload is recorded; it does not prove distinct implementation-version or distinct-SHA compatibility, and no old click path returns | Pending D1 evidence |

The expected matrix deliberately distinguishes a worker restart from every
extension reload and from a browser restart. Existing unit or E2E tests may be
reused, but they do not convert a row from pending to complete without a D1
matrix assertion and evidence.

The following actions are unsupported and must not be inferred from the
matrix: uninstall/reinstall data retention, a new extension ID, a new browser
profile, direct profile-file repair, or a destructive downgrade.

### 7.5 D1.5 - Focused exact-production-dist extension E2E

The focused E2E suite must use the exact `extension/dist` generated by the
normal build, bundled Chromium and a fresh disposable persistent profile. It
must not use a test-only manifest, modified permissions, a source-loaded
extension, or direct profile/LevelDB edits.

Required scenarios include:

- fresh install and current V4 initialization;
- a profile seeded through approved extension test interfaces with V2/V3/V4
  storage states from D1.1;
- same-path unpacked reload;
- `chrome.runtime.reload`;
- disable/enable;
- Service Worker stop/reawaken at E1, E2, E3, and outbox stages;
- browser full restart after E1 and after E2;
- replacement dist reload with the durable state retained and transient state
  treated according to the expected matrix;
- network failure, outbox retention, recovery, matching ACK, replayed ACK, and
  exactly one SQLite attempt with four capture events;
- confirmed submission, tombstone, outbox, quarantine, pairing, and delivery
  metadata retention;
- no duplicate E2/E3 projection after reload or worker restart;
- default database metadata unchanged before and after every test;
- safe temporary-profile teardown that does not follow symbolic links,
  junctions, or broken reparse points.

The existing generic service-worker-restart skip is not D1 evidence. The suite
must use the known CDP stop/reawaken helper pattern from the passing NowCoder
lane, re-acquire the live worker, and poll after reattachment. If the dedicated
matrix cannot run without the skipped harness behavior, D1 is `BLOCKED`.

### 7.6 D1.6 - Rollback, fail-closed, and readiness checks

D1 must test, using existing behavior only, that:

- global capture pause does not create new E0/E1/E2/E3/bundle state;
- a blocked or disabled adapter does not create a new confirmation or bundle;
- existing confirmed submissions, tombstones, outbox, quarantine, pairing,
  delivery metadata, and identity fields remain unchanged;
- re-enabling the current supported path does not consume a legacy pending
  intent or restore click-derived waiting;
- repeated E3/API replay remains one durable attempt;
- blocked platform results remain blocked and fail closed;
- the registry DOM status and V4 network status retain the exact split matrix
  in section 2.1;
- the readiness JSON and registry agree before and after every initialization
  and rollback fixture.

If the current code cannot make capture pause or adapter blocking fail closed
at the required boundary, the RED result must identify the real owner module.
The D1 implementation boundary then applies:

- installation/storage/orchestrator/E2E-harness defects may be fixed only when
  directly proven by the RED test;
- a defect in `background.ts` listener registration, `networkObserver.ts`,
  `outboxDrain.ts`, registry semantics, manifest permissions, migrations, or
  adapter policy requires an independent scope decision before any fix;
- no engineer may widen D1's modification boundary merely to turn a RED run
  green.

### 7.7 D1.7 - User-authorized disposable Chrome observation

After automated D1 gates pass, a separate user authorization is required for
the external observation. The observation uses a disposable Chrome-compatible
profile, the exact production dist, Fake OJ/localhost traffic, and a
disposable SQLite database. It performs no real OJ submission.

The operator must record:

- browser name and version;
- extension manifest version and extension ID for the disposable profile;
- source implementation SHA used to build the loaded dist;
- hashes for `manifest.json`, `background.js`, `content.js`, `popup.js`, and
  `main-world-bridge.js` when present;
- each lifecycle action and its start/end time;
- local/session key snapshots and exact count deltas;
- API request/ACK counts and SQLite row deltas;
- any skipped, flaky, or externally blocked operation.

No real profile, LevelDB, or default database may be opened for editing. If a
browser operation cannot be performed without violating that boundary, leave
it pending and mark D1 incomplete rather than substituting a fabricated
observation.

### 7.8 D1.8 - Verification gates and completion

D1 verification is intentionally split into six named gates:

#### Gate D1-U - Unit RED/GREEN

Test the migration planner, six interruption boundaries, key allowlist,
storage lifecycle expectations, duplicate replay, and existing DB migration
contracts. The RED run is captured before a proven fix; the GREEN run is
captured after it.

```powershell
npx vitest run --config vitest.extension.config.ts tests/unit/extensionV4UpgradeMatrix.test.ts
npm run test -- tests/unit/migrations.test.ts tests/unit/curriculumMigration.test.ts tests/unit/abilityMigration.test.ts
```

No new migration SQL is permitted. Existing every-prefix, idempotent, and
transaction rollback coverage must remain green.

#### Gate D1-E - Focused extension E2E

```powershell
npm run extension:e2e -- tests/extension-e2e/capture-v4-upgrade.spec.ts
```

This command must load the exact production dist and use a disposable profile
and database.

#### Gate D1-R - Readiness

```powershell
node scripts/validate-v4-adapter-readiness.mjs --all
```

#### Gate D1-X - Extension checks

```powershell
npm run extension:check
```

#### Gate D1-Q - Full quality

```powershell
npm run quality:gate
```

#### Gate D1-C - User-authorized disposable Chrome observation

Build and verify the artifact before loading it:

```powershell
npm run extension:build
node scripts/check-extension-dist.mjs
```

Then execute the lifecycle matrix in section 7.7 with explicit user
authorization. The manual observation has no substitute command and cannot be
declared passed from Playwright alone.

**D1 engineering gate completion:** D1-U, D1-E, D1-R, D1-X, and D1-Q pass;
the report contains exact counts and no unreviewed skip.

**D1 phase completion:** the engineering gates pass, D1-C is actually
completed, the evidence report is internally consistent, and an independent
reviewer approves D1. Automated PASS without D1-C is only
`D1 engineering gate PASS`, never `D1 complete`.

**D1 stop conditions:** data loss, changed durable identity, duplicate
attempt, duplicate ACK projection, pending-intent resurrection, readiness
drift, default database mutation, permission widening, a required schema or
adapter-protocol change, unsafe cleanup, or inability to perform the authorized
observation within the stated boundary.

## 8. Task D2 - Privacy and Permission Audit

**Dependency:** D1 phase completion, not merely D1 engineering gate PASS.

**Objective:** Confirm that the exact target artifact collects no more than the
approved safe-evidence contract and has no forbidden raw data in storage,
logs, fixtures, or errors.

**Artifacts after approval:**

- Create `scripts/audit-v4-extension-privacy.mjs`.
- Create `tests/unit/v4ExtensionPrivacyAudit.test.ts`.
- Create a dated report under `work/reports/`.
- Modify source or fixtures only for a finding proven by a RED audit test and
  accepted within the D2 boundary.

### 8.1 Production `requestBody` allowlist

The currently approved production `requestBody` use list is exactly:

```text
[]
```

There are no approved production exceptions in this Phase D plan.

The audit must verify the following concrete facts:

| Location | Platform/scope | Request-body fields | Current reason and test requirement |
|---|---|---|---|
| `extension/src/networkObserver.ts` listener registration | All V4 network platforms | None requested; no `requestBody` extra-info option | Lifecycle metadata only. Tests must reject any future listener registration that requests body data |
| `extension/src/background.ts` webRequest listener registration | All production listeners | None requested | Background wiring must remain body-free. The audit must inspect the registered filters and extra-info arguments |
| `extension/src/adapters/leetcode/network.ts` | LeetCode | None read or retained | `requestBody` appears only in forbidden-input rejection sets; tests must prove rejection is not use |
| `extension/src/adapters/nowcoder/network.ts` | NowCoder | None read or retained | `requestBody` appears only in forbidden-input rejection sets; tests must prove rejection is not use |

Adversarial tests and forbidden-key lists that contain the string
`requestBody` are not production use and must be classified separately. A
future exception would require a new reviewed entry containing the exact file,
platform, field name, scalar type, reason, privacy boundary, and test names;
the phrase "approved request body" alone is never sufficient. Any production
request-body use not listed above is a D2 finding and a stop condition.

### 8.2 D2 RED tests and completion

The RED suite must reject:

- forbidden storage, log, fixture, and error keys;
- body, raw body, response body, code, headers, credentials, cookies, tokens,
  account identifiers, or full problem statements;
- any production `requestBody` request because the allowlist is empty;
- broad host permissions, `webRequestBlocking`, `debugger`, DevTools, remote
  code, and test-only manifest paths;
- local/session access violations where the browser API supports the check;
- synthetic fixtures without provenance and real fixtures without provenance.

Verification:

```powershell
npx vitest run tests/unit/v4ExtensionPrivacyAudit.test.ts
node scripts/audit-v4-extension-privacy.mjs
npm run extension:check
```

D2 is complete only with zero forbidden findings and an independent privacy
review `APPROVE`. A static audit supplements, and does not replace, code review
or real extension testing.

## 9. Task D3 - Freeze One Immutable Implementation Candidate

**Dependencies:** C0-C5 terminal readiness results, D1 phase completion, D2
approval, and explicit user authorization to commit.

**Objective:** Freeze one implementation SHA after reliability and privacy
evidence are complete, without folding real observations into the candidate.

### 9.1 Test-first checks

Before the candidate is staged, add or run RED checks for:

- a dirty-path classifier rejecting database files, generated dist, temporary
  profiles, Playwright artifacts, raw transcripts, environment files, and
  unrelated user changes;
- an RC/candidate validator rejecting click-only runtime symbols, missing
  adapter statuses, failed extension E2E, failed privacy audit, failed
  readiness validation, or documentation disagreement;
- exact default-database metadata preservation;
- explicit separation of candidate implementation SHA from later evidence-only
  status commits.

### 9.2 Candidate boundary

The candidate contains only classified task-owned implementation, tests,
fixtures, scripts, and current-state documentation. It excludes evidence that
would self-reference a future candidate unless the release contract explicitly
allows a later evidence commit.

Before the authorized commit, inspect status, the full diff, staged diff, and
recent history. Stage explicit paths only. Do not amend, push, create a PR, or
call the candidate RC accepted.

### 9.3 Candidate verification

```powershell
npm run lint
npm run db:migrate
npm run test
npm run typecheck
npm run e2e
npm run extension:check
npm run extension:e2e
npm run build
npm run quality:gate
node scripts/audit-v4-extension-privacy.mjs
node scripts/validate-v4-adapter-readiness.mjs --all
$env:GIT_MASTER='1'; git diff --check
```

D3 completion requires exact counts, default database metadata preservation,
independent code review `APPROVE`, and one explicitly authorized immutable
implementation candidate SHA. This is not yet an RC, acceptance, or release.

## 10. Task D4 - Same-SHA Real-Platform End-to-End Engineering Observations

**Dependencies:** immutable product candidate
`aa1a572c3913b35dd3f0391f849dab66e79c56a2`, its exact Task 26 dist, an
independently reviewed D4 observation tool, and action-time user authorization
under section 10.6. This scope does not authorize acceptance, release,
deployment, push, PR, or any broader platform action.

### 10.0 Acceptance Contract Revision 2 design basis

D4 validates the product journey, causal identity, and durable side effects.
It does not validate that Chrome delivers one storage callback per business
stage or that an observer captures every transient state as a separate frame.

This contract follows four established engineering principles:

1. Chrome documents `storage.onChanged` as firing when **one or more** items
   change; callback count is not a business-stage clock:
   <https://developer.chrome.com/docs/extensions/reference/api/storage>.
2. Google SRE distinguishes black-box user-visible symptoms from white-box
   causes and treats production probes/canaries as structured production
   validation. D4 therefore makes end-to-end product outcomes authoritative
   and uses intermediate instrumentation for diagnosis:
   <https://sre.google/sre-book/monitoring-distributed-systems/> and
   <https://sre.google/sre-book/testing-reliability/>.
3. W3C Trace Context and OpenTelemetry model a distributed operation through a
   stable causal identity/graph, not adjacency of observer callbacks:
   <https://www.w3.org/TR/trace-context/> and
   <https://opentelemetry.io/docs/specs/otel/overview/>.
4. AWS uses explicit request identifiers and idempotency to make repeated or
   late delivery auditable while preserving one logical side effect:
   <https://aws.amazon.com/builders-library/making-retries-safe-with-idempotent-APIs/>.

Therefore a missing standalone E1 or E2 screenshot is not a product failure.
Identity contradiction, duplicate durable effects, missing delivery, unsafe
data access, or a non-empty final recovery queue remains a product failure.

### 10.1 Platform scope

Real-platform engineering submissions are permitted only for the existing
active V4 network policies:

- LeetCode: current `experimental` policy and characterized host scope;
- NowCoder: exact approved pilot `acm/contest/18839/1001` only.

AtCoder, Codeforces, and Luogu remain `V4_BLOCKED`. D4 must not submit to them.
It validates their registry/readiness/blocker drift through automated checks
only. Historical AtCoder DOM production certification is not re-certified.

These actions are **real-platform automated engineering observations**. They
are not natural user submissions, user acceptance, RC, or release evidence.

### 10.2 Authoritative evidence hierarchy

Evidence is evaluated in this order. A lower layer may corroborate but cannot
overrule a contradiction in a higher layer.

1. **Immutable product identity:** exact candidate SHA and five frozen dist
   hashes, checked before authorization and after the observation.
2. **Authorized target identity:** one named platform/problem, one disposable
   profile, one isolated zero-row database, and at most one submit action.
3. **Causal product contract:** exact target submit evidence, exact E2/E3
   platform/problem/submission binding, and the candidate's fail-closed guards.
   Raw request/tab/frame/document identifiers are never exported.
4. **Durable product outcome:** exactly one four-event bundle, one HTTP 200
   capture POST, one ACK, SQLite delta `+4 capture_events / +1 session / +1
   attempt`, and final waiting/outbox/quarantine `0/0/0` with no blocking
   diagnostic.
5. **Corroboration:** popup screenshots, separate E1/E2 snapshots, timestamps,
   or platform UI images. These help diagnosis but are not standalone gates.

The report must label every causal fact as one of:

- `direct`: retained by the safe observer or durable store;
- `coalesced`: multiple facts became visible in one valid observer snapshot;
- `contract-implied`: a later durable fact is impossible on this exact
  candidate unless its prerequisite passed the production fail-closed guard;
- `not-observed`: unavailable and not needed by another hard invariant.

`contract-implied` is allowed only when the report cites the exact automated
regression that proves the prerequisite. It may not be inferred from elapsed
time, popup text, URL recency, or “latest submission” guesses.

### 10.3 Per-platform hard acceptance invariants

Each LeetCode and NowCoder lane passes only when all rows below pass:

| Invariant | Required evidence | Hard gate |
| --- | --- | --- |
| Candidate/artifact identity | exact SHA plus identical five pre/post hashes | yes |
| Isolation baseline | fresh profile, paired extension, isolated DB `0/0/0`, browse-only produces no queue/DB mutation | yes |
| Authorized action | exact target and no more than one submission | yes |
| Submit causality | one exact target submit identity; no ambiguity, crossed platform/problem/context, or conflicting lifecycle | yes |
| E2/E3 binding | one exact confirmation and one stable final submission/verdict bound to that submit; direct, coalesced, or contract-implied evidence is allowed | yes |
| Verdict | any member of `FINAL_CAPTURE_VERDICTS`, including `Compile Error`, is valid; D4 tests capture correctness, not solution correctness | yes |
| Delivery | one bundle, one POST 200, one ACK | yes |
| SQLite projection | exact delta `4/1/1`; event kinds exactly `SESSION_STARTED`, `SUBMISSION_OBSERVED`, `VERDICT_OBSERVED`, `SESSION_ENDED`; action `submission_confirmed`; matching safe platform/problem/submission/verdict identity; nondecreasing timestamps; one non-voided attempt | yes |
| Final recovery state | waiting/outbox/quarantine `0/0/0`, no blocking diagnostic | yes |
| Separate E1 and E2 snapshots | diagnostic only; absence cannot fail an otherwise proven causal chain | no |
| Callback count/order and manual screenshots | diagnostic only | no |

The observer must retain cumulative facts. A valid callback may advance across
multiple facts in one snapshot, including E0+E1, E1+E2, or E0+E1+E2. It records
the transition as `coalesced`; it does not invent separate timestamps or claim
that an unobserved intermediate snapshot existed. A downstream E2/E3/ACK may
prove a prerequisite only under the `contract-implied` rule above.

Legacy `submit_clicked`, click-derived waiting, latest-by-time submission
selection, popup-only success, or a database count without the exact event and
identity projection can never satisfy D4.

The sole known non-causal storage exception is session `b3WitnessState`.
Ordinary NowCoder navigation may update this V4 browse-characterization control
key after characterization is stopped. The observer may inspect its key name
only and ignore that entry without reading `oldValue` or `newValue`; it cannot
satisfy a causal fact. Any unknown, credential, V3, or mixed illegal key remains
terminal.

The observer still fails closed on unknown keys, forbidden/private data,
identity mismatch, multiple eligible submits, lifecycle conflict, decreasing
durable counts, duplicate bundle/POST/attempt, queue growth beyond the closed
contract, post-ACK mutation, or artifact/hash drift. “Fail closed” does not
mean rejecting a legal coalesced transition.

### 10.4 Outcome classification and stop rules

Every lane receives exactly one classification:

- `D4_PLATFORM_PASS`: every hard invariant in section 10.3 passes;
- `PRODUCT_FAIL`: a production invariant is contradicted or final delivery is
  missing while the observer remains valid;
- `OBSERVER_INVALID`: the tool cannot safely adjudicate the run; this is not a
  production failure and does not invalidate the D3 candidate;
- `ENVIRONMENT_BLOCKED`: login/CAPTCHA/2FA/profile/browser/local-server failure
  prevents adjudication;
- `PLATFORM_BLOCKED`: the named platform prevents the authorized action or
  final result, without evidence of a product defect.

The generic string `observer_stage_rejected` is insufficient as a final
diagnosis. Any rejection must write a bounded safe receipt containing fixed
reason, cumulative target fact counts, closed queue counts, isolated DB counts,
and artifact hashes. It must not retain raw request/document/endpoint/time/URL,
verdict DOM text, source code, problem statement, body/header/token/account, or
database path.

`PRODUCT_FAIL` stops both lanes immediately and requires causal review before
any retry. `OBSERVER_INVALID` permits only observation-tool repair and offline
adjudication; it does not authorize product edits or D3 re-freeze. If existing
safe durable evidence already proves every hard invariant, the same run may be
adjudicated `D4_PLATFORM_PASS` without another submission. Otherwise a new
real action requires new authorization. No silent retry is allowed.

### 10.5 Observation-tool implementation gate

Before another platform action, the harness-only Revision 2 change must prove:

- separated E0 -> E1 -> E2 and coalesced E0+E1, E1+E2, E0+E1+E2 all reach the
  same causal fact set without fabricated timestamps;
- duplicate snapshots are idempotent;
- true reordering, identity conflict, target mismatch, unknown keys, hostile
  getters, and post-ACK mutation remain terminal;
- both `Compile Error` and `Accepted` traverse the same request-bound E3 and
  exactly-once delivery contract;
- failure receipts obey the privacy boundary; and
- product candidate source and five frozen artifacts are byte-identical.

Required commands are the focused observer suite, the focused
submit/control/flow suites that anchor causal implication, `npm run typecheck`,
targeted ESLint, privacy audit, `node --check` for both observer modules,
`git diff --check`, and candidate-isolation diff. An independent code/privacy
review must `APPROVE` this tooling revision before live action. A full D3
candidate validator is not rerun because the product candidate is unchanged.

### 10.6 User-interaction budget

D4 must minimize operator burden. The Commander owns server/database/profile
setup, pairing, hash checks, observer evidence, platform navigation, final
adjudication, cleanup, and reporting. The user is asked only to:

1. log in inside the isolated Chromium windows if existing sessions are not
   available; and
2. give **one consolidated action-time authorization** after both exact lanes
   report READY. That authorization names LeetCode and NowCoder targets and
   permits at most one submission on each, with no code/editor read and no
   retry.

The authorization expires if candidate/hash/target/profile/database changes,
if either lane loses READY before its action, or on the first classified
failure. It does not authorize a replacement action. The user is not asked for
popup screenshots, timestamps, queue counts, repeated status messages, or a
second confirmation between the two lanes. The Commander must explicitly say
when it is safe to close each disposable browser.

Immediately before each authorized action, the Commander silently rechecks the
exact target, READY state, candidate/dist hashes, profile identity, and zero-row
database. This is safety revalidation, not another user confirmation. After the
first platform reaches a terminal classification, the Commander contacts the
user only if intervention is required; otherwise it proceeds to the second
already-authorized lane. A successful lane is never repeated.

The two lanes are prepared **sequentially**, because the frozen extension and
local application intentionally share the single fixed origin
`http://localhost:3000`; they are not claimed to be simultaneously live. Each
lane receives a fixed, platform-specific disposable profile and database. A
`ready` receipt freezes their safe identities after browse-only `0/0/0`, then
the browser closes without a submission. After both receipts exist, the one
consolidated authorization may be requested. At action time the same profile
and database are reopened one lane at a time and must silently regain READY;
drift or failure expires the authorization before any action on that lane.

For each lane, preparation creates the fixed directory, migrates
`training-platform.sqlite` under a lane-specific `TRAINING_DB_PATH`, and writes
the resolved path followed by one newline to the adjacent
`server-db-path.txt`. The local app is started with that same environment
value. The runner derives this fixed pointer by default. It validates the
pointer file and canonical database path (including junction rejection)
**before** opening SQLite, then requires business counts `0/0/0`.

### 10.7 Invalidation rule

Any modification to runtime source, manifest, permissions, SQLite schema,
build script, adapter protocol/policy, or production artifact invalidates the
candidate and returns to D3. Reports must never bridge product SHAs.

A compliant section 6.2 observation-tool or documentation-only commit does not
invalidate the product candidate. Its own SHA/hashes and review evidence must
be recorded separately.

### 10.8 Completion

D4 completes when one LeetCode lane and one exact approved-pilot NowCoder lane
are both `D4_PLATFORM_PASS` on candidate `aa1a572...` and identical frozen
artifact hashes, and blocked-platform readiness/drift checks pass without real
submissions. This permits D5 independent review; it is not user acceptance,
RC, or release. No synthetic participant, date, submission, or browser result
is valid evidence.

## 11. Task D5 - Same-SHA F1-F4, Then Explicit Acceptance

**Dependency:** D4 complete.

Run four independent review lanes against the same D3 implementation SHA and
the same D4 evidence set:

- **F1:** plan compliance, task completeness, and evidence completeness;
- **F2:** code quality, privacy, security, concurrency, migration, storage
  recovery, rollback, and update-scope fidelity;
- **F3:** hands-on exact-artifact extension QA, including the D1 lifecycle
  matrix and D4 observations;
- **F4:** scope, documentation, fixture provenance, registry/readiness status,
  blocked-platform honesty, and release-contract fidelity.

F1 and F3 must adjudicate D4 against section 10 Revision 2. They must not reject
an otherwise complete causal/durable chain merely because E1 and E2 were not
captured as separate snapshots. They must reject unsupported
`contract-implied` claims, identity ambiguity, duplicate effects, missing final
delivery, artifact drift, or an observer/tool version that was not independently
reviewed and recorded.

All four lanes must independently `APPROVE`. Then stop at the final user gate,
present the complete evidence, and request one explicit acceptance decision.
Automated engineering observation PASS and F1-F4 APPROVE do not imply that
decision. Acceptance is not public release.

Final verification commands:

```powershell
node scripts/validate-v4-adapter-readiness.mjs --all
node scripts/audit-v4-extension-privacy.mjs
npm run quality:gate
```

Reconcile `AGENTS.md`, README, architecture, compliance, docs index, runbook,
and handoff only after the evidence exists. The reconciliation belongs in the
evidence-only status commit and must not change runtime behavior. Do not push,
create a PR, deploy, publish to the Chrome Web Store, start V0.5, or call an
engineering PASS a release.

## 12. Phase D Completion Definition

Phase D is complete only when all of the following are true:

- this standalone plan was independently approved;
- D1 engineering gates pass and the user-authorized disposable Chrome
  observation is complete;
- D1 report records exact counts, keys, interruption outcomes, hashes, skips,
  and default-database preservation;
- D2 has zero forbidden findings and an independent privacy approval;
- D3 created one immutable implementation candidate SHA with explicit user
  authorization;
- D4 active-policy automated engineering observations pass on that exact SHA
  and all blocked statuses remain unchanged and honestly fail closed;
- D5 F1-F4 all approve the same SHA;
- any later commit is evidence-only or a section 6.2 observation-tool commit
  and contains no product implementation or artifact mutation;
- the user explicitly accepts the candidate if acceptance is requested.

Until every condition is true, the repository is not a replacement accepted RC,
not accepted, and not released. A blocked platform is an acceptable truthful
result; guessing a protocol is not.

## 13. Independent Reviewer Checklist

The independent reviewer must inspect the actual written plan and repository,
not only this summary. The reviewer must check:

- This file is the only detailed Phase D D1-D5 specification and the parent
  plan links here instead of duplicating it.
- The Phase C C0-C5 facts, current SHA, platform states, and AtCoder DOM/V4
  distinction are accurate and not reopened.
- D4 is adjudicated by section 10 hard causal/durable invariants, not by callback
  count or mandatory standalone E1/E2 snapshots.
- Legal coalescence is accepted without invented timestamps; unsupported
  contract implication, identity ambiguity, duplicates, and privacy violations
  remain hard failures.
- The observation-tool identity/allowlist/review is separate from the immutable
  product candidate, and the candidate-isolation proof is mandatory.
- The one-batch action-time authorization and user-interaction budget do not
  permit retries, extra platforms, code/editor reads, or acceptance claims.
- The six `applyExtensionInitializationSplit` boundaries are listed in the
  exact order and each has a failure point, first rerun expectation, second
  rerun idempotency expectation, timestamp semantics, durable-state rule,
  unknown-key rule, and default-DB rule.
- `migratedAt` behavior distinguishes a failed pre-write V3 migration from a
  post-write retry and does not refresh on V4 re-runs.
- The storage key inventory includes actual write entrances beyond the two
  initialization arrays and does not delete unspecified keys.
- The six `storage.session` lifecycle rows are marked expected/pending and
  distinguish worker restart, runtime reload, disable/enable, full browser
  restart, same-path unpacked reload, and replacement-dist reload.
- D1 is split into unit RED/GREEN, focused extension E2E, readiness,
  extension, full quality, and user-authorized disposable Chrome observation.
- The existing generic Service Worker skip cannot be counted as D1 evidence and
  the CDP re-acquisition path is specified.
- The production `requestBody` allowlist is explicitly empty and all current
  string occurrences are correctly classified as rejection/test material.
- D1 does not silently authorize fixes in background observer, outbox,
  registry, manifest, migration, or build-script boundaries when a RED test
  finds a defect there.
- D3 candidate SHA and D4/D5 evidence-only status commit are unambiguous.
- Every D4 report must record the actual implementation SHA and dist hashes,
  and the invalidation rule covers runtime, manifest, migration, and build
  script changes.
- The real-platform automated-observation scope excludes blocked-platform
  retries and does not
  claim Web Store/CRX/enterprise update support.
- Automated test PASS, real-platform automated engineering observation PASS,
  reviewer APPROVE, natural user submission, user acceptance, RC, and release
  remain separate labels.

The reviewer must return one of:

- `APPROVE`, with any non-blocking observations clearly labelled; or
- `REJECT`, with severity, repository evidence, and mandatory fixes.

## 14. Current Entry Verdict and Stop State

The repository has the technical Phase C prerequisite for D1: C5 is closed,
the readiness manifest has terminal states, existing storage/restart/E2E
fixtures exist, and the current quality gate evidence is recorded. However,
the Phase D procedure is not authorized until this standalone plan receives an
independent review.

Current state:

```text
APPROVED
```

D1 may now begin under this plan. D1-C, D3 candidate creation, and each D4
natural-submission observation remain separately gated by the requirements and
authorizations stated in their respective sections. Do not push, create a PR,
or call an engineering PASS an RC, acceptance, or release.

### 14.1 D1 execution reconciliation (2026-08-03)

The D1 GREEN commands passed, but the full pre-fix D1-U RED transcript required
by sections 7.1 and 7.8 was not retained. A targeted malformed-quarantine RED
reproduction exists, but it is not a substitute for the full matrix RED record.
At this reconciliation checkpoint, before the later provenance audit and user
decision in section 14.2, no plan exception had been approved and D1-U remained
open. This paragraph records that historical checkpoint; section 14.2 is the
current D1-U authority.

### 14.2 D1 RED provenance audit (2026-08-03)

The retained-log audit is recorded in
`work/reports/v4-phase-d-d1-red-provenance-audit-2026-08-03.md`. Its initial
finding was `CHANGES REQUIRED - D1-U RED PROVENANCE EXCEPTION REQUIRED`; after
the exact exception below was approved, its current verdict became
`EXCEPTION APPROVED - D1-U PROVENANCE ACCEPTED`. The audit accepts only the
malformed-quarantine worker-rehydration crash as valid retained product RED. It
rejects the malformed-outbox count, quarantine-collision, seed-identity,
alarm-microtask, diagnostic-script, and browser/harness failures as substitutes
for product RED.

The audit found GREEN-only production changes in the capture pause/cache gate,
persistence-before-cache boundary, authoritative-write-before-cleanup order,
same-source replacement build variant, semantic malformed-record preservation,
and diagnostics-only popup/delete behavior.

**D1-U provenance decision (2026-08-03, user approved):** The user explicitly
accepted a narrow, non-precedential exception for exactly those six groups in
the current uncommitted D1 working tree. The exception accepts missing
historical RED provenance; it does not invent RED evidence. Existing GREEN,
exact-dist, and quality-gate requirements remain mandatory. Fixture, assertion,
diagnostic-tool, and browser/harness failures remain excluded from product RED.
The exception cannot be reused by D2, D3, D4, or future work and does not
authorize D1-C, D2, D3, commit, push, RC, acceptance, or release.

With that decision recorded, D1-U is accepted under the approved exception and
the D1 engineering gates pass. At this pre-observation checkpoint D1-C remained
separately gated and unperformed; section 14.4 controls the current D1-C state.

### 14.3 D1-C Chrome debug attempt (2026-08-03)

The separately authorized D1-C attempt is recorded in
`work/reports/v4-phase-d-d1-c-chrome-debug-2026-08-03.md` with verdict
`D1-C NOT PASSED; DEBUG BLOCKED BEFORE PRODUCT OBSERVATION`. Branded Chrome
`150.0.7871.187` ignored the command-line unpacked-extension load path. The
follow-up CDP installation debug reused the user's existing default profile
through Chrome's process singleton and did not complete any D1-C lifecycle
assertion. The real-profile debug is explicitly excluded from D1-C evidence.

The debug cleanup cleared the extension's local/session storage, disabled the
development extension, and closed temporary tabs. Automated uninstall initially
returned `uninstall canceled by user`; a later explicit foreground confirmation
removed the development extension, and final inspection found no project
extension residual. No real OJ submission or default database edit/write was
performed; default database metadata was read-only compared and unchanged.

### 14.4 D1-C disposable observation (2026-08-03)

The user-authorized D1-C retry completed in a headed, isolated Chromium
`138.0.7204.23` process with disposable profiles, exact production dist, Fake
OJ/localhost traffic, and disposable SQLite. The full five-scenario command
passed `5/5`. Direct inspection of
`.tmp/phase-d-d1-e2e-evidence.json` confirmed all 13 lifecycle transitions,
stable durable identities, normal/replacement hashes, one extension request and
ACK, one replay request and ACK, and SQLite deltas `+4/+1/+1`. The default
database metadata remained unchanged.

The observation is recorded in
`work/reports/v4-phase-d-d1-c-disposable-observation-2026-08-03.md`. The final post-harness
`npm run quality:gate` exited `0` with `2156/1` unit tests, `25` app E2E,
`1406` extension tests, `53/1` extension E2E, and production build PASS.

D1-C is complete.

### 14.5 D1 final review and completion (2026-08-03)

The independent final reviewer inspected the actual D1 diff, the exact six-group
provenance exception, D1-C headed evidence, real-profile cleanup, default
database preservation, final quality gate, and reconciled reports. The reviewer
found no blocking or important issue and returned `APPROVE`.

All section 7.8 completion conditions are now met. D1 phase is complete. D2 has
not started; D3 remains gated by D2 completion. D1 completion is not RC,
acceptance, or release.

### 14.6 D2 engineering gate (2026-08-03)

D2 started only after D1 final review returned `APPROVE`. The required audit
script, 22-case adversarial suite, ambient test declaration, and dated report
were added. The pre-implementation test and CLI commands both failed because
their required files did not exist, preserving real RED provenance for the
missing audit capability.

The final focused suite passes `22/22`. The audit reports `0 findings` against
the source manifest, current production-built dist manifest/JavaScript,
production extension TypeScript, and OJ/Fake-OJ fixture corpus. The approved
production `requestBody` use allowlist remains empty. `npm run extension:check`
passes with `42` files / `1406` tests and a production build; the privacy audit
again reports `0 findings` after that rebuild. Default database metadata is
unchanged.

Evidence is recorded in
`work/reports/v4-phase-d-d2-privacy-permission-audit-2026-08-03.md` with verdict
`D2 REMEDIATION GREEN; INDEPENDENT PRIVACY RE-REVIEW PENDING`.

The first independent privacy review returned `CHANGES REQUIRED` with one
BLOCKER, three HIGH findings, and one MEDIUM finding. RED tests proved remote
capture-endpoint exfiltration, raw transport-error persistence, AST/wrapper
bypasses, incomplete manifest/dist coverage, and weak fixture provenance. The
first remediation restricts transport to HTTP loopback, closes newly produced
transport errors, adds runtime storage-key ownership enforcement and supported
trusted-context access levels, and strengthens the static audit and fixture
schemas. A second review returned `CHANGES REQUIRED` for retained legacy-error
display, direct background storage paths, nested/link collection, and fixture
credential aliases. The second remediation closes those paths. Focused privacy
audit is now `35/35`; focused product privacy is `68/68`; `extension:check`
passes `43` files / `1412` tests; rebuilt-dist audit returns `0 findings`.

At this pre-final-review checkpoint D2 remained incomplete; section 14.7
controls the current completion state. D3 had not started.

### 14.7 D2 final review and completion (2026-08-03)

A third privacy review found one remaining HIGH structured-summary trust path.
The final fix discards caller-provided structured quarantine summaries and uses
a fixed diagnostic, while valid quarantine metadata remains derived only from
strictly parsed bundle fields. The fourth independent privacy review found no
remaining issue and returned `APPROVE`.

The final `npm run quality:gate` exited `0`: `99` unit files with `2197/1`,
`25` app E2E, `43` extension files with `1412` tests, `53/1` extension E2E,
and production build `20/20`. The post-gate privacy audit reports `0 findings`,
readiness validation passes, default database metadata is unchanged, and no
port 3000 listener remains.

D2 is complete. D3 candidate engineering is complete under explicit user
authorization to create the immutable candidate commit. This is not RC,
acceptance, or release.

### 14.8 D3 authorization and candidate preflight (2026-08-03 to 2026-08-04)

The user explicitly authorized D3 candidate creation, excluding push, PR, RC,
acceptance, and release. The current dirty paths were classified as task-owned
D1/D2 implementation, tests, scripts, reports, plan, and handoff paths; no
database, generated dist, temporary profile, Playwright artifact, environment
file, raw transcript, or unrelated path was found.

The V4 candidate validator and its 14-case unit suite were added. It rejects
unowned/generated/secret paths, stale click-runtime symbols, failed extension
E2E or privacy/readiness evidence, documentation disagreement, database
metadata mutation, and candidate worktree/path violations. The initial RED
commands failed because the candidate test and validator did not exist. The
validator no longer accepts operator-reported extension-E2E or quality-gate
exit/count flags; `--preflight` runs the real `npm run quality:gate` and parses
the final Extension E2E summary from its output. The immutable candidate SHA
was created as `509faf0e60532cf565a6a57aa796b96bc1053f38`
(`feat(v4): harden Phase D capture reliability`). The candidate gate then
passed `2217/1` unit, `25` app E2E, `1414` extension tests, `53/1` extension
E2E, production build `20/20`, zero privacy findings, readiness validation,
and default-database preservation. The final independent D3 review returned
`APPROVE` with no HIGH or MEDIUM findings. The handoff and plan reconciliation
is included in the current candidate HEAD; its exact self-referential SHA is
reported by the final Git closeout rather than embedded here. D3 candidate
engineering is complete. This is not RC, acceptance, or release.

### 14.9 D4 Task 12 review and automated-observation authority (2026-08-10)

The ninth LeetCode observation failed on the documentation-reconciled repair
lineage because a residual historical `Accepted` candidate predated the real
E1 while the later identical verdict was suppressed by text-only dedupe. Task
12 now owns a causal RED and a frozen LeetCode-only submit-epoch repair
contract in
`docs/superpowers/plans/2026-08-06-v4-phase-d-d4-e3-candidate-coordinator-repair.md`.

The user-authorized Commander goal changes the remaining D4 evidence operation
from an operator-performed natural submission to a minimum Chrome-performed
real-platform automated engineering observation for LeetCode and NowCoder.
This is a classification split, not an acceptance shortcut:

```text
automated engineering observation PASS
!= natural user submission
!= user acceptance
!= RC
!= release
```

Task 12 received one supplemental project-GPT `REJECT` and one authoritative
local reviewer `REJECT`; only tests and plans were revised in response. Both
reviewers subsequently approved the repaired frozen contract. Tasks 13 and 14
are now engineering-complete on that contract; Task 15 re-freeze is active.
Tasks 16 and D5 remain gated by the new immutable candidate and their own
evidence contracts.

### 14.10 D4 Tasks 13-14 completion and Task 15 re-freeze entry (2026-08-10)

Task 13 implementation `fe36f6b4770d3d929479464c03e8bea6dbb97ba9`
adds the exact in-document submit-epoch control plane. Task 14 implementation
`0f695ddfad6989e407424feff457d28d081d657b` persists the additive request
identity, binds the coordinator to the exact lifecycle, terminalizes stale
legacy pre-E1 candidates, and adds fresh exact restart replay. Their detailed
contracts and closeouts remain in the D4 coordinator repair plan and Task 13/
14 reports; neither commit is D4 observation, D5, RC, acceptance, or release.

Task 15 pre-freeze verification on the clean documentation-reconciled tree
recorded:

```text
focused Task 13/14 suite: 12 files, 507/507 passed
privacy audit:            PASS, 0 findings
adapter readiness:        PASS
extension:check:          exit 0; 47 files, 1549/1549 tests; build/parity PASS
extension:e2e:            53 passed, 1 known harness skip
default database:         479232 bytes; mtime 2026-07-23T15:56:38.8411343Z
```

The independent code and privacy reviews returned `APPROVE` with no findings.
The first plan review returned `REJECT (HIGH)` because non-archived handoff
sections still named Task 14 as the next action; Workspace, Current Phase,
Chronology, In Flight, Next Commander Action, and the current E2E count were
reconciled without a runtime change. The plan re-review then returned
`APPROVE` with the exact validator invocation and same-SHA/hash/re-freeze
boundaries confirmed.

All three pre-commit verdicts are now `APPROVE`. The Task 15 candidate commit
may contain only this plan and `work/handoff-current.md`, both classified by
the D3 validator. Its exact SHA cannot be self-referenced in that commit and
must be recorded in the later evidence-only closeout. The candidate validator
must now run `npm run quality:gate`, recheck privacy/readiness, prove exact HEAD
and clean worktree before and after the gate, and preserve the default database
metadata. Exact dist hashes are recorded only after that successful same-SHA
gate. Any subsequent runtime/protocol/manifest/permission/build/migration/dist
change invalidates the candidate before Task 16.

#### First Task 15 candidate gate failure and isolation repair

The first freeze commit `0c263ccf2459b2dda7897ad899e0c3fd439876ec`
is **not a valid candidate**. Its exact validator invocation exited `1` at
`npm test`, so the derived `extension-e2e.pass` and `quality-gate.pass` checks
also failed. Vitest recursively discovered two ignored historical Git
worktrees under `.worktrees/`, including their stale source tests and nested
third-party `node_modules`; the failures were cross-version assertions and
third-party Jest/callback tests, not failures in the current root test tree.

Both historical worktrees contain pre-existing dirty report files and are
therefore preserved without reset, removal, or modification. The test-first
repair adds `.worktrees/**` to the root Vitest exclusion list and classifies
`vitest.config.ts` as an owned D3 candidate path. The focused validator RED was
13 passed / 2 failed; after the repair it is 15/15, with typecheck, targeted
ESLint, and diff-check also passing. This test/gate configuration change
invalidates `0c263cc...` and requires a new reviewed candidate commit followed
by a fresh exact-SHA validator run. No runtime, protocol, manifest, permission,
build artifact, migration, or database file changed.

Focused code, privacy, and plan re-review all returned `APPROVE` with no
findings. The reviewer additionally listed the effective root Vitest suite and
confirmed it contains no `.worktrees` entry while retaining the real root
tests. The isolation repair is therefore authorized for the new candidate
commit; only a successful fresh exact-SHA validator may complete Task 15.

#### Task 15 immutable candidate completion

The new immutable candidate is
`f18eddf4cb4d7dd24c439b2dea5917793839e6a2` (`fix(v4): isolate candidate
gate from worktrees`). The exact command

```powershell
node scripts/validate-v4-candidate.mjs --candidate f18eddf4cb4d7dd24c439b2dea5917793839e6a2
```

exited `0` with `V4 candidate commit PASS`. Its internal nine-stage quality
gate recorded unit `2353/1`, app E2E `25/25`, extension unit `1549/1549`,
extension E2E `53/1`, and production build `20/20`; privacy audit remained
`0 findings`, readiness remained `PASS`, candidate HEAD/worktree identity held
before and after the gate, and the default database remained 479232 bytes with
mtime `2026-07-23T15:56:38.8411343Z`. No listener remained on port 3000.

The exact candidate-built artifacts are frozen as:

```text
manifest.json         22B1FBEAC7FEAC799C159D5A5D295700F7FEF5A395C40F1A39168EA9E0293D08
background.js         4575A8BC67F4775D78AC5756DDED77B70FC905E2AE6953B90C3E9896369DCE7B
content.js            C68465D60D21F6B74A7A081ED6E053DC1FB968B93871A7EE3D7500ABD997CD3B
popup.js              3D164737873BB36A522300FC4B92829C419A3EAEC4CACDC0CF111A91497CF478
main-world-bridge.js   4D89A80F0351295EE1C0CD173BE107080983868D18510D028854695EACEE3943
```

Task 15 is engineering-complete. The generated ignored `extension/dist`
remains the exact artifact for Task 16 and must be hash-checked again before
the first platform action. Later evidence/status documentation commits do not
replace the candidate SHA. Any runtime, protocol, manifest, permission, build,
migration, or dist change invalidates it and returns to Task 15 re-freeze.
This is D3/Task 15 engineering evidence only, not D4 delivery, D5 approval,
RC, acceptance, or release.
Production runtime, manifest, build scripts, protocol, and artifact remain
unchanged at this stop state.

### 14.11 Final D3 refreeze and same-SHA final deliveries (2026-08-11; D4 close superseded)

The later Task 17-22 repair sequence supersedes candidate `f18eddf...` for D4
observation purposes. It closes the real LeetCode result-route regression,
rejects exact reserved NowCoder `/acm/problem/list` identity without widening
the pilot, and repairs the test-only extension-worker waiter lifecycle without
retry or timeout changes. The final immutable candidate is
`a911425a415db2ee374430ced62edcaa7b786866`.

The exact candidate validator exited `0` with root `2393/1`, app E2E `25/25`,
extension unit `1587/1587`, extension E2E `53/1`, build `20/20`, privacy
`0 findings`, readiness `PASS`, clean pre/post identity, and preserved default
database metadata. Its frozen dist hashes are recorded in
`work/reports/v4-phase-d-task22-nowcoder-repair-refreeze-2026-08-11.md`.

Fresh same-SHA final deliveries were then observed. LeetCode `cn/741526004` and the
approved NowCoder pilot `84444687` each produced exactly one POST, four
events, one session, one attempt, ACK, and zero final
waiting/outbox/quarantine. The blocked-platform readiness/drift lane passed
292/292 without submissions. One earlier NowCoder submission `84444621` is
explicitly excluded because its tab predated extension installation and had no
E0 click listener; it produced no E2, POST, or SQLite row and caused no runtime
change.

The evidence is
`work/reports/v4-phase-d-task23-same-sha-observations-2026-08-11.md`.
Independent F1 review later found that it did not preserve the required
contemporaneous browse-only, E1, and E2 states for each active policy. Final
delivery cannot reconstruct those stages. D4 therefore remains incomplete,
Revision 3 of the 2026-08-10 repair plan is the only authorized remediation,
and D5 is stopped. This is not final user acceptance, an RC, or a release.

### 14.12 Revision 5 re-freeze, Task 27, and Acceptance Contract Revision 2 (2026-08-12)

The preparation and review statements in this subsection are historical
snapshots. They are superseded by the later LeetCode failure, the
E1-provisional observer repair, and §14.14 parity follow-up; they do not grant
current platform authorization. The only current status at that historical
checkpoint was expired authorization, no live retry, and `REVIEW REQUIRED`
pending independent review.

Revision 5 later repaired the exact submit/GraphQL epoch identity conflict and
re-froze immutable product candidate
`aa1a572c3913b35dd3f0391f849dab66e79c56a2`. Its exact validator passed root
`2430/1`, app E2E `25/25`, extension unit `1591/1591`, extension E2E `53/1`,
build `20/20`, privacy `0 findings`, readiness `PASS`, and default-database
preservation. Task 26 records the five exact dist hashes.

Task 27 then reached observer READY on a fresh profile/zero-row DB but ended
`observer_stage_rejected`; its safe receipt retained only the preceding
browse-only state. It did not prove a production failure or implicate Compile
Error. No retry occurred.

Section 10 Acceptance Contract Revision 2 supersedes the closing sentence of
section 14.11 and the proposed fail-on-coalescence remediation in the
2026-08-10 repair plan. D4 now validates the causal/durable end-to-end
invariants and treats separate intermediate snapshots as diagnostic. The
observation tool is versioned separately under section 6.2, so a compliant
harness-only correction does not invalidate candidate `aa1a572...`. The
harness RED/GREEN gate is now complete: observer `67/67`, focused causal
regression `241/241`, typecheck/lint/syntax/diff checks exit `0`, privacy audit
`0 findings`, candidate-isolation diff empty, and all five Task 26 hashes
byte-identical. The reducer accepts separated/coalesced E0/E1/E2 and the
production consume-style E3/ACK shape after locking the E2 submission key;
true reordering, identity conflict, duplicate durable effects, legacy V3 click
causality, and privacy violations remain terminal. The earlier independent
code/privacy review approved causal observer Revision 2 with no HIGH/MEDIUM
findings. Follow-up independent review of the sequential READY runner amendment
also returned `APPROVE` with no HIGH/MEDIUM findings. This authorizes only the
sequential preparation defined in section 10.6; it does not authorize a real
submission. D5, RC, acceptance, and release remain stopped.

The exact `241` is observer `67` plus product anchors LeetCode adapter `105`,
NowCoder network `28`, verdict candidate coordinator `21`, and verdict
candidate flow `20`; the Revision 2 report records both exact commands.

Sequential preparation produced one LeetCode READY receipt. The first
NowCoder READY preparation stopped fail-closed at browse-only with
`OBSERVER_INVALID / observer_storage_key_rejected`, zero queues and SQLite
`0/0/0`, and no submission. The narrow `b3WitnessState` ignore amendment above
received follow-up independent `APPROVE` with no HIGH/MEDIUM findings. This
authorizes one NowCoder READY retry only; no submission is authorized.

That retry succeeded. Both fixed lanes are now READY with browse-only target
counts `0/0/0/0`, extension queues `0/0/0`, SQLite `0/0/0`, identical frozen
hashes, and closed browsers/server. Receipts:
`output/playwright/v4-observation/leetcode-readiness-1786526390512.json` and
`output/playwright/v4-observation/nowcoder-readiness-1786527061654.json`.
The next gate is the one consolidated section 10.6 action-time authorization;
no action has occurred.

After consolidated authorization, desktop window ownership could not be safely
bound and the outer runner wait timed out while still browse-only. SQLite
remained `0/0/0`, so no submission occurred and no action count was consumed.
The runner now has a closed `--authorized-submit=true` mode: incompatible with
`--ready-only`, fixed to the two approved platform selectors, one strict click
after READY, and automatic close only after ACK. It does not read code/editor
content. This observer-runner amendment is `REVIEW REQUIRED` before use.

Independent follow-up review returned `APPROVE` with no HIGH/MEDIUM findings.
The authorized LeetCode action then began one strict-selector dispatch. Its
safe terminal receipt recorded `attempted=true`, `clickCompleted=false`, exact
target submit E1 `1`, E0/E2/delivery `0`, all extension queues zero, SQLite
`0/0/0`, and classification
`OBSERVER_INVALID / observer_transition_unadjudicable`. Because a submit E1
was observed, the LeetCode action budget is consumed even though delivery was
not proven. The consolidated authorization expired immediately; NowCoder was
not submitted. No retry is authorized. Evidence:
`output/playwright/v4-observation/leetcode-real-observation-failed-1786528735567.json`.
D4 remains incomplete and D5 remains stopped.

Read-only adjudication then added a disposable observer characterization for
the exact bounded shape `confirmed=1`, tombstones/outbox/quarantine `0/0/0`,
zero-count database, and allowlisted `epoch_result_surface_unchanged`. The RED
run added one focused test and produced `1 failed / 70 passed` (71 total): the
new adjudicator was intentionally absent before implementation. GREEN is
`71/71` for `tests/unit/v4LiveObservationObserver.test.ts`. The pure helper
recognizes `recovery_candidate` only when an exact prior-lane submission key is
supplied; key mismatch and target mismatch are `wrong_identity`, while missing
binding, missing error, or any durable side effect is `stale_unbound`. The
ordinary reducer still rejects this nonempty/error-bearing snapshot at a fresh
baseline (`observer_capture_error`); no baseline relaxation or replay path was
added.

Static immutable-path mapping is E2 persistence at
`extension/src/backgroundOrchestrator.ts:871-906`, exact E3 consume/tombstone/
outbox construction at `:1207-1359`, and ACK/outbox clearing plus
`lastSuccessfulCaptureAt` at `extension/src/outboxDrain.ts:140-154`. The actual
fixed-lane receipt contains only `confirmed=1`, not the allowlisted identity
fields needed to supply the helper's expected key. Opening the real profile to
obtain that identity would cross this checkpoint's no-browser/raw-LevelDB
boundary. Therefore the fixture's exact candidate is characterization only,
not live evidence; the actual profile remains stale/unbound.

Current engineering choice is **Option B — terminal profile evidence; use a
new isolated profile/database and a separately authorized action later** —
`REVIEW REQUIRED` pending independent review. Preserve the profile, database,
receipt, and exact dist; do not reset, delete, replay E3, retry READY, or submit.
The helper/test hashes are observer-only:

```text
scripts/v4-live-observation-observer.mjs  2928636445E52AA54C5B048CEE92A31020FB83A0D53D08161FAFD437CE4BF803
tests/unit/v4LiveObservationObserver.test.ts 61B57C69A8E05D0FB0663C794895ED355ACFBEE6D4F7A0E6A0DEB68E04831708
tests/unit/v4LiveObservationObserver.d.ts B61E0F632274C758B6B0551D3EAD750C3404FD8B50CBCC379BE1D7918982FFBA
```

No new authorization is requested. D4 remains incomplete and D5 remains
stopped.

### 14.13 Callback-arrival E1 provisional observer repair (2026-08-12)

The authorized follow-up was limited to the observer helper/runner, focused
observer tests/declarations, and this status documentation. Before the repair,
the new RED test reproduced the LeetCode failure shape: a baseline followed by
the exact target submit E1, with no separately retained E0, was rejected as a
terminal `observer_stage_rejected` transition. The RED run was
`npx vitest run --no-file-parallelism tests/unit/v4LiveObservationObserver.test.ts`:
`1 failed / 67 passed (68)` at
`tests/unit/v4LiveObservationObserver.test.ts:873`.

The GREEN observer now records a target E1-only callback as bounded
`stage=e1_provisional`, `e1Status=provisional`, and does not mark E1 as an
accepted evidence basis or infer E0. A later matching E0 is accepted only when
the safe internal chronology projection is `e0-before-e1`, derived from the
authoritative E0 `observedAt` and submit E1 `receivedAt`; only the bounded order
enum (`not-observed`, `e0-before-e1`, `e0-after-e1`) is exposed in snapshots and
receipts. E0-after-E1, E2 without E0, target/identity conflicts, duplicate
durable effects, legacy V3 click causality, and unsafe/private values remain
fail-closed. Repeated identical callbacks remain idempotent. A page close while
the E1 provisional state is unresolved is classified with the fixed safe
reason `observer_provisional_timeout` and never becomes a delivery claim.

The persistent page mirrors the same bounded target-order projection. Raw
timestamps are not serialized into stage history or failure receipts; internal
metadata is held outside the enumerable snapshot boundary. No extension
runtime, manifest, schema, build, adapter, immutable candidate
`aa1a572c3913b35dd3f0391f849dab66e79c56a2`, exact dist, live browser, or
database was modified. No commit, push, retry, NowCoder action, or D5 action
occurred.

GREEN evidence:

```text
observer focused:       69/69 passed
product causal anchors: 174/174 passed
combined focused total: 243/243 passed
npm run typecheck:       exit 0
targeted ESLint:         exit 0
node --check (2 scripts): exit 0
privacy audit:           PASS, 0 findings
git diff --check:        exit 0 (only CRLF conversion warnings)
protected-path diff:     empty for extension/src, manifest, dist, runtime,
                         schema/database, build, package, candidate validator
Task 26 dist hashes:     byte-identical (all five frozen hashes)
```

The exact causal anchor command remains the four frozen product suites in
section 14.12. The observer suite is now 69 tests (including LeetCode and
NowCoder E1-provisional convergence, timeout receipt, chronology, duplicate,
privacy, and legacy-path coverage). The updated observer/runner/test hashes
are recorded in the Revision 2 report. This is observer engineering evidence,
not D4 platform acceptance, RC, release, or user acceptance. At that
pre-parity checkpoint, independent review of the new repair was still required
and the worker verdict was `REVIEW REQUIRED`, not `APPROVE`; the current verdict
is recorded in §14.14. No live retry was authorized.

Section 14.13's 69-test count is the pre-parity snapshot. Section 14.14 is
the current observer status and supersedes it with the persistent-entrypoint
parity GREEN count of 70/70 and combined focused count 244/244.

### 14.14 Persistent entrypoint parity repair (2026-08-12)

Independent review rejected the first observer-only repair for one parity gap:
the persistent fake-Chrome entrypoint dropped its private E0/E1 chronology
metadata after an unrelated allowed callback. A RED test inserted a bounded
`contentIngressReady` callback between E1 and E0 and observed
`targetOrder=not-observed` instead of `e0-before-e1` (`69 passed / 1 failed`,
70 total). The entrypoint now preserves the bounded internal metadata across
all allowed callback batches and attaches it after each projection.

The GREEN fake-Chrome parity test proves E1-only is provisional/nonterminal,
an intervening allowed callback does not erase it, matching E0 produces only
the safe enum `e0-before-e1` and converges through the reducer, and
E0-after-E1 produces `e0-after-e1` and is rejected. Serialized events contain
no raw timestamps or private request/document fields. Final observer evidence
is `70/70`, frozen product anchors `174/174`, combined `244/244`, typecheck,
targeted lint, syntax checks, privacy audit `0 findings`, diff-check, and
protected-path isolation all pass; all five Task 26 dist hashes remain
byte-identical. The independent final review reran observer `70/70` and frozen
product anchors `174/174` (`244/244` combined), found no HIGH or MEDIUM issue,
and matched the observer-only hashes and all five frozen dist hashes recorded
in the Revision 2 report. Final verdict: **`APPROVE` for the provisional-E1
observer amendment only**. This does not restore the expired action
authorization, authorize live retry/NowCoder/D5, or complete D4. The next
action is a new real-observation plan followed by new explicit action-time
authorization; no direct submission is permitted from this approval.

### 14.15 Fixed-lane environment audit and stale confirmation discovery (2026-08-12)

The next sequential READY-only preparation was stopped before any platform
action. The fixed LeetCode lane used the documented profile
`.tmp/v4-live-observation-profiles/d4-revision2-leetcode`, the adjacent
database pointer
`.tmp/v4-live-observation-db/d4-revision2-leetcode/server-db-path.txt`, and
the exact Task 26 dist `.tmp/task26-exact-dist-aa1a572`. The pointer resolved to
that lane's adjacent `training-platform.sqlite`; the database and pointer were
not symlinks or junctions, and the three business counts were `0/0/0` after
the documented migration. The same preflight was completed for the fixed
NowCoder lane. Historical `.tmp` profile/database directories remain present
as cleanup debt only; the fixed runner did not enumerate or load them.

The fixed LeetCode runner then failed in `--ready-only=true
--authorized-submit=false` before READY. Its bounded receipt is
`output/playwright/v4-observation/leetcode-real-observation-failed-1786548934476.json`.
The receipt binds the same fixed profile identity
`179279b529ccdb5483c1bba3202e3af2a26c4dfbc114e3e0286937a703184212`, database
identity `fc1a8e401dc10e24eeefa09ac7dabd1728505d9711944ae7c85f697f46f6f58a`,
and byte-identical pre/final five dist hashes. It records
`OBSERVER_INVALID`, fixed safe error `epoch_result_surface_unchanged`, target
counts `e0=0/e1=0/submit=0/status=0`, extension counts
`confirmed=1/tombstones=0/outbox=0/quarantine=0`, and final SQLite
`0/0/0`. No click, submission, or action authorization was consumed; the
local server processes `52296/45408` were stopped and port 3000 was verified
free. NowCoder READY was not attempted.

This is evidence of stale same-profile durable state, not evidence of a
production defect. Static inspection of the immutable
`extension/src/backgroundOrchestrator.ts:871-906` and `:1207-1359` paths shows
that `handleE2Recorded` persists a confirmed record before E3, while
`handleE3Recorded` requires the matching confirmed record and then removes it
while creating the tombstone/outbox delivery path. Therefore `confirmed=1`
with no tombstone/outbox and SQLite
`0/0/0` is consistent with a prior E2 that did not reach E3, or with delayed
state observed after an earlier observer termination; it does not prove a new
submit and cannot be used as a READY baseline. The receipt does not explain or
invalidate the separately proven callback-arrival E1-before-E0 observer repair.

The safe follow-up is bounded adjudication, not recovery by mutation: preserve
the profile, database, receipt, and exact dist; perform read-only identity and
chronology review of the existing confirmed count; add/execute disposable
observer/unit fixtures for confirmed-without-E3 and delayed-E2 discovery; and
write a recovery decision that specifies whether a matching E3 can be
replayed without a new platform action. Any live replay, profile reset,
database reset, or new READY/action attempt requires a written plan revision
and an independent review `APPROVE` first, followed by fresh explicit
action-time authorization. No authorization is requested in this checkpoint.
D4 remains incomplete and D5 remains stopped.

Independent follow-up review found one MEDIUM harness ambiguity: the
read-only adjudicator would previously treat any allowlisted capture error as
eligible for a recovery candidate when an expected key was supplied. A RED
fixture changed only `lastCaptureError` to `epoch_started_missing` and
reproduced the over-acceptance (`1 failed / 70 passed`, 71 total; received
`recovery_candidate`, required `stale_unbound/capture_error_mismatch`). The
GREEN fix requires the exact §14.15 fact
`epoch_result_surface_unchanged`; `epoch_started_missing`, network errors, and
other general allowlisted errors now remain `stale_unbound` with the fixed
reason `capture_error_mismatch`. The helper still requires the exact expected
prior-lane submission key, never replays E3/ACK, and never relaxes a fresh
baseline. GREEN remains `71/71`.

This follow-up does not change the real receipt's safe interpretation: its
error is the exact result-surface error, but its identity fields are not
exported, so the fixture's candidate cannot bind the actual profile. At the
pre-review checkpoint Option B was `REVIEW REQUIRED`; no replay, reset, READY
retry, action, or new authorization was permitted.
Latest observer-only hashes are:

```text
scripts/v4-live-observation-observer.mjs  2928636445E52AA54C5B048CEE92A31020FB83A0D53D08161FAFD437CE4BF803
tests/unit/v4LiveObservationObserver.test.ts 61B57C69A8E05D0FB0663C794895ED355ACFBEE6D4F7A0E6A0DEB68E04831708
tests/unit/v4LiveObservationObserver.d.ts B61E0F632274C758B6B0551D3EAD750C3404FD8B50CBCC379BE1D7918982FFBA
```

Independent final review (2026-08-13) reran the post-fix observer and gates:
observer `71/71`, typecheck exit `0`, targeted lint exit `0`, both observer
syntax checks exit `0`, privacy audit `0 findings`, `git diff --check` exit `0`
(known LF/CRLF warnings only), and protected-path diff empty. It matched the
three observer-only hashes above and all five immutable Task 26 dist hashes:

```text
manifest.json        A85C3275D559BD46AAA034FEEA9B14EAFECFC6F56341713B2AFB8B024E2B3E64
background.js        9222BC90DB397B37499DE119482958BEAF1DD1A6E3136F7546A475676EC46C2D
content.js           8AC66A0B8B23AA2F5273D1687550226926A4D3791CBF1C1C3786B9D20FD785FC
popup.js             F863C9758EBF2FF464634D6FF986D3F296017C8A5A37D45A3692FB3F1B80240D
main-world-bridge.js 4D89A80F0351295EE1C0CD173BE107080983868D18510D028854695EACEE3943
```

The historical MEDIUM exact-error ambiguity is closed; the final reviewer
found no HIGH or MEDIUM findings and returned **`APPROVE` for Option B**. This
is an observer/evidence disposition only: it grants no current real
authorization, does not reset/delete/replay the fixed profile or database,
and does not complete D4 or restart D5. The next step is a new written
real-observation plan, then a new profile/database READY preparation followed
by fresh action-time authorization. No direct submission is permitted from
this approval.

### 14.16 New-generation fixed identity plan (2026-08-13)

The approved Option B follow-up now has an observer-only generation binding.
The reviewed generation token is the closed value
`d4-revision2-generation2`; the historical `d4-revision2` lane is evidence
only and is rejected by the generation-aware validators. No generation-2
profile, pointer, database, browser, server, READY checkpoint, or action was
created or opened in this step.

The only future paths are:

```text
.tmp/v4-live-observation-profiles/d4-revision2-generation2-leetcode
.tmp/v4-live-observation-profiles/d4-revision2-generation2-nowcoder
.tmp/v4-live-observation-db/d4-revision2-generation2-leetcode/server-db-path.txt
.tmp/v4-live-observation-db/d4-revision2-generation2-nowcoder/server-db-path.txt
.tmp/v4-live-observation-db/d4-revision2-generation2-leetcode/training-platform.sqlite
.tmp/v4-live-observation-db/d4-revision2-generation2-nowcoder/training-platform.sqlite
```

The runner requires exactly one `--generation=d4-revision2-generation2`.
Missing, unknown, historical, duplicate, wrong-platform, cross-generation,
profile-reuse, pointer, and junction/path-escape inputs fail closed before any
database read or browser launch. Every readiness or eventual action receipt
binds the generation together with the existing profile/database SHA-256
identities; the generation is never inferred from a mutable path or from old
evidence. Receipt fields remain bounded and do not contain raw paths,
timestamps, cookies, response bodies, query values, or account data.

The subsequent real-observation sequence is deliberately sequential and
READY-only: first LeetCode `leetcode.cn/problems/merge-two-sorted-lists/`, then
the approved NowCoder target
`ac.nowcoder.com/acm/contest/18839/1001`, both loaded with the immutable exact
dist `.tmp/task26-exact-dist-aa1a572`. The five frozen artifact hashes are
unchanged from §14.15 (manifest
`A85C3275D559BD46AAA034FEEA9B14EAFECFC6F56341713B2AFB8B024E2B3E64`,
background
`9222BC90DB397B37499DE119482958BEAF1DD1A6E3136F7546A475676EC46C2D`,
content
`8AC66A0B8B23AA2F5273D1687550226926A4D3791CBF1C1C3786B9D20FD785FC`,
popup
`F863C9758EBF2FF464634D6FF986D3F296017C8A5A37D45A3692FB3F1B80240D`, and
bridge
`4D89A80F0351295EE1C0CD173BE107080983868D18510D028854695EACEE3943`).
Use `--ready-only=true --authorized-submit=false`; do not click or submit. A
first failure, identity mismatch, nonzero baseline, stale state, or missing
authentication stops the sequence and preserves evidence. A later action-time
authorization may cover at most one merged action per lane, only after a
reviewed READY receipt; all prior authorization is expired and cannot be
reused.

Observer RED/GREEN evidence for this amendment is `76/77` (the intentional RED
runner-binding test) followed by `77/77` GREEN. The frozen product causal
anchors remain `174/174` (`251/251` combined with this 77-case observer suite).
Typecheck, targeted lint, two observer syntax checks, privacy audit, diff
check, and protected-path isolation are required before any READY preparation.
Independent review has now rerun the generation-2 observer suite and frozen
product anchors: observer `77/77`, anchors `174/174`, combined focused
`251/251`, with no HIGH or MEDIUM findings. The review also confirmed the
corrected test SHA `09AE1AC4CB595FE16D042AEA8F7B6C8C93E4397B9A928384982366C1B8D2DA70`
against `Get-FileHash`; the observer-only hashes and all five frozen dist hashes
remain unchanged. Final verdict: **`APPROVE` for the generation-2
observer-only amendment and isolated preparation only**. This changes only
observer/helper/runner/tests and documentation; it does not modify extension
source, runtime, manifest, schema, build, adapter, package, dist, immutable
candidate `aa1a572c3913b35dd3f0391f849dab66e79c56a2`, historical
profiles/databases, or the default database. The approval permits only new
generation-2 isolated profile/database preparation and sequential READY-only
work. The user's standing default action approval does not bypass READY: each
lane may perform at most one action only after its own valid READY, and the
first failure stops the sequence. No cookies, credentials, or account data may
be copied or exported. This is not D4 acceptance and does not restart D5;
D4 is incomplete and D5 remains stopped.

### 14.17 Generation-2 receipt identity unwrap repair (2026-08-13)

The first generation-2 LeetCode READY-only run reached `READY=1` with a fresh
profile and isolated `0/0/0` database, but its receipt omitted `generation`.
The cause was observer-runner-only: `projectObservationIdentity()` returns a
success wrapper whose fields live under `.value`; the runner destructured
profile/database identities from `.value` but read `generation` from the
wrapper itself. The exact receipt
`output/playwright/v4-observation/leetcode-readiness-1786552707075.json` is
therefore **INVALID READY diagnostic** and cannot authorize an action. It is
preserved unchanged; no receipt is fabricated or amended.

The narrow repair adds the pure observer helper
`projectObservationReceiptIdentity()`. It requires `ok=true`, the exact three
data fields under `.value`, a reviewed generation, and lower-case SHA-256
profile/database identities; outer or missing/undefined generation, unknown
keys, accessor fields, and malformed identities fail closed. The runner now
consumes the validated `.value` and uses `observationGeneration` for every
READY, ACK, and failure receipt path.

RED was `3 failed / 75 passed` (`78` total). GREEN after repair is:

```text
observer focused: 78/78
frozen product anchors: 174/174
combined focused: 252/252
npm run typecheck: exit 0
targeted ESLint: exit 0
node --check (observer + runner): exit 0
privacy audit: PASS, 0 findings
git diff --check: exit 0 (known LF/CRLF warnings only)
protected product-path diff: empty
```

The five Task 26 dist hashes remain byte-identical. The fixed LeetCode server
was stopped after the invalid receipt; port 3000 is free. The NowCoder
generation-2 profile was only read-only verified as an empty ordinary
directory and was neither deleted nor opened. No server, browser, READY retry,
login, click, submit, action authorization, or NowCoder lane ran after the
diagnosis. The pre-hardening checkpoint was **`REVIEW REQUIRED`**; that status
is historical and is superseded by the independent final review recorded in
the hostile-wrapper follow-up below. It did not restore authorization,
complete D4, or restart D5.

#### 14.17 follow-up — hostile outer receipt wrapper (2026-08-13)

Independent hardening found one observer-only MEDIUM: the receipt projector
could read `identity.ok` or `identity.value` before checking the outer
descriptor, so a hostile getter could throw rather than return the fixed
`observer_generation_rejected` result. RED added separate outer-`ok` and
outer-`value` getters (each must be read zero times), inherited fields, an
extra own key, and a non-data descriptor. Before the fix this was `3 failed /
78 passed` (`81` total).

The helper now gates the outer wrapper without reading values: its prototype
must be `Object.prototype` or `null`, `Reflect.ownKeys()` must be exactly
`ok` and `value`, and both own descriptors must be data descriptors. Only
then are `ok` and `value` read; the existing inner exact-key/data-descriptor
gate remains in force. No catch is used to swallow raw exceptions. GREEN is:

```text
observer focused:       81/81 passed
frozen product anchors: 174/174 passed
combined focused total: 255/255 passed
npm run typecheck:       exit 0
targeted ESLint:         exit 0
node --check (2 scripts): exit 0
privacy audit:           PASS, 0 findings
git diff --check:        exit 0 (CRLF conversion warnings only)
protected product-path diff: empty
```

The hashes in the preceding identity-unwrapper record are historical, not
current: observer `8B2D68B2C93274AF4F01667630F95EB125D352AE152E5AE35688D5F332C37D79`,
runner `6859FB997C7F379B9C4B3CBABEA2DCF7EB62F160A9544532E59B2102BCCA4E46`,
test `09AE1AC4CB595FE16D042AEA8F7B6C8C93E4397B9A928384982366C1B8D2DA70`,
and d.ts `E76687FC485200E3C7C3A2350042F60E593494071652FCE42DB3E0DE68DDCE14`.
Current observer-only SHA-256 values are:

```text
scripts/v4-live-observation-observer.mjs  B058734A363D593BDF9FCC70768B0BAC88D34E8281B742F26E810A94FC8EEF65
scripts/v4-live-observation.mjs           FBD9834F5709AAF12167DA171E44A4D68C2954CFD75D57E007CBF72719498F61
tests/unit/v4LiveObservationObserver.test.ts 306FE408DBE0C418223907F392DA3125E8D1973C3D9AD7FEE06F9F0F83366E31
tests/unit/v4LiveObservationObserver.d.ts FC53651B490F18BFC789D0331EC12D30A2078A4AD5C840D1D1883AB28F8E6539
```

All five immutable Task 26 dist hashes remain byte-identical. The prior
generation-2 LeetCode READY receipt remains an **INVALID READY diagnostic**
and was not amended; NowCoder was not run. No live/server/browser/READY or
action work occurred. Independent final review reran the current observer and
frozen product anchors: observer `81/81`, anchors `174/174`, combined focused
`255/255`, with no HIGH or MEDIUM findings. It confirmed the current
observer-only SHA-256 values recorded above and all five frozen dist hashes
match the reviewed evidence. Final verdict: **`APPROVE` for the receipt
identity observer-only repair and new generation-2 isolated READY-only
preparation**. This approval does not amend or rehabilitate the old invalid
receipt, complete D4, restart D5, or constitute RC/release. The user's
standing action approval still requires a valid READY for each lane, at most
one action per lane, and immediate stop on the first failure; cookies,
credentials, and account data must never be copied or exported. Runtime,
manifest, schema, build, adapter, dist, candidate, authorization, and D4/D5
state remain unchanged.

### 14.18 Generation-2 valid READY-only receipts (2026-08-13)

After the §14.17 independent `APPROVE`, both new generation-2 lanes were
prepared sequentially in READY-only mode. No action-time authorization was
used and no submit/click occurred.

LeetCode reused its already-created generation-2 profile with the same fixed
database and exact dist:

```text
receipt: output/playwright/v4-observation/leetcode-readiness-1786554246043.json
generation: d4-revision2-generation2
outcome/finalStage: ready / browse_only
target e0/e1/submit/status: 0/0/0/0
outbox/quarantine: 0/0
SQLite capture_events/sessions/attempts: 0/0/0
```

The receipt contains the expected profile/database identities and identical
pre/final five-artifact hashes. It supersedes neither the earlier invalid
receipt nor any real action evidence; it is READY-only evidence.

NowCoder's pre-created empty profile was read-only verified as the exact
ordinary non-reparse path and was removed by the Commander. A fresh fixed-DB
server then ran the first-use profile with `reuse-profile=false`:

```text
receipt: output/playwright/v4-observation/nowcoder-readiness-1786554388436.json
generation: d4-revision2-generation2
outcome/finalStage: ready / browse_only
target e0/e1/submit/status: 0/0/0/0
outbox/quarantine: 0/0
SQLite capture_events/sessions/attempts: 0/0/0
```

This receipt likewise contains the expected profile/database identities and
byte-identical five hashes. Both browser contexts and local servers were
closed, port 3000 is free, and both fixed databases remain `0/0/0`. No
cookies, credentials, source code, or problem text were read or exported.

This closes only sequential generation-2 READY preparation. It does not
complete D4, authorize a click, restart D5, or constitute RC/release. The next
step requires fresh action-time authorization after the two valid READY
receipts; a first action failure still expires the batch authorization.

### 14.19 Authorized strict-click E1-before-E0 adjudication (2026-08-13)

The first authorized generation-2 LeetCode action consumed exactly one strict
runner click and produced bounded failure receipt
`output/playwright/v4-observation/leetcode-real-observation-failed-1786555212760.json`.
The receipt binds generation/profile/database and the unchanged five Task 26
dist hashes. It records `authorizedAction.attempted=true`,
`clickCompleted=true`, target `e0/e1/submit/status=1/1/1/0`, extension queues
`0/0/0/0`, SQLite `0/0/0`, final stage `e1_provisional`, and classification
`OBSERVER_INVALID / observer_target_rejected`. The user-supplied platform
screenshot shows that the same action reached a final `Compile Error` surface;
the screenshot is corroborative only and is not a D4 receipt.

Static candidate review shows that `Compile Error` is already a member of
`FINAL_CAPTURE_VERDICTS` and has a request-bound LeetCode E3 regression. The
failure occurred before E2/E3: the content hint is recorded by a document
bubble-phase click listener, while the page submit handler may synchronously
dispatch the exact network request first. Therefore the same runner-owned
strict click can legally expose E1 before its diagnostic E0, including an
authoritative `e0-after-e1` timestamp order. Historical databases and multiple
extension versions were not loaded by this fixed lane and are not the cause.

The next amendment is observer-only and must remain fail-closed. RED must
reproduce baseline -> exact target E1 provisional -> matching E0 with
`targetOrder=e0-after-e1`. GREEN may accept that convergence only when the
runner supplies a closed trusted context proving the one authorized strict
selector action was dispatched. Without that context, the same order remains
terminal. E2-before-E0, wrong platform/problem/identity, more than one target
submit or click, legacy V3 paths, duplicate durable effects, queue/DB drift,
and privacy violations remain terminal. The runner receipt must retain the
existing bounded `authorizedAction` proof and may not expose timestamps, raw
request/document/URL/body/code/verdict DOM, cookies, credentials, or account
data.

Current verdict is **`REVIEW REQUIRED`** for this observer-only amendment. The
LeetCode action is consumed and must not be retried; the consolidated batch
stopped on the first failure, so NowCoder action count remains zero. No live
runner/server/browser remains, port 3000 is free, and the evidence profile,
database, receipt, and immutable dist must be preserved. No production
runtime/manifest/schema/build/adapter/dist/candidate change is authorized and
no D3 re-freeze is triggered. A new live READY or action is forbidden until
RED/GREEN gates and independent review close this amendment.

#### 14.19 follow-up — strict-click chronology and ACK-race closeout

The pre-review `REVIEW REQUIRED` verdict above is historical. Two focused RED
failures were retained during the repair: the authorized strict-click
E1-before-E0 convergence was rejected, and successful stage evidence exposed
confirmed/tombstone identities and timestamps. Later review also reproduced
the ACK-before-click-promise settlement race and required a production-path
runner replay test rather than a source-order assertion.

The final observer-only implementation mints a module-private, one-shot
`dispatch_started` capability immediately before the sole fixed selector click.
It binds the same target object, generation, profile/database identities,
platform/problem, selector, and dispatch count `1`. Only LeetCode
E1-provisional followed by its matching single E0 with
`targetOrder=e0-after-e1` may consume it. The reducer stores only a private
adjudication boolean so later E2/E3/ACK snapshots can retain that bounded order;
the flag is neither storage-controlled nor serialized. No context still
rejects the same order.

Snapshots received while the click promise is pending are replayed through the
same reducer. A click rejection is superseded only when that replay proves the
complete ACK state. The ordinary callback, deferred replay, and database
monitor share one guarded `finalizeAcknowledged()` path, so success evidence
and context close occur exactly once. Tests cover reject plus full
E1/E0/E2/E3/ACK, reject without E1, E1/E0 without ACK, E2-before-E0, wrong
target, forged/reused capability, and ready-only isolation. Successful stage
evidence now contains only closed counts/basis/state; the success receipt no
longer contains a wall-clock `observedAt`.

Final authoritative evidence is:

```text
observer focused:       88/88 passed
frozen product anchors: 174/174 passed
combined focused total: 262/262 passed
npm run typecheck:       exit 0
targeted ESLint:         exit 0
node --check (2 scripts): exit 0
privacy audit:           PASS, 0 findings
git diff --check:        exit 0 (known LF/CRLF warnings only)
protected product-path diff: empty
```

Reviewed observer-only SHA-256 values:

```text
scripts/v4-live-observation-observer.mjs  45948FE4E9864815F07E13233200C99BA8732C46865C0CCDF38908504E2BE9ED
scripts/v4-live-observation.mjs           72D14F40772BD8036CF1C5B6303C3F7CB8184122E51251F6732ED56CE5BF896A
tests/unit/v4LiveObservationObserver.test.ts 077E4D202D667741FC04711D895C05CA3791E23040743B770240DA5BC08ECD02
tests/unit/v4LiveObservationObserver.d.ts 1A51483E63630C49406405EBDE4B1A901C927D0FD3605C001EC1CA2A859283E6
```

Independent final review reran the current bytes and returned **`APPROVE`**
with no HIGH or MEDIUM findings. It confirmed the protected product diff is
empty and all five Task 26 dist hashes are unchanged. This approval applies
only to the observer/runner amendment; it does not rehabilitate the failed
receipt, authorize a retry on the consumed generation-2 LeetCode profile,
complete D4, or restart D5. The old LeetCode profile/database/receipt remain
terminal evidence. Any further live attempt requires a new isolated
profile/database identity and a new READY under these reviewed observer bytes;
credentials/cookies/account data must not be copied.

### 14.20 Generation-3 isolated replacement preparation

The consumed generation-2 LeetCode profile/database/receipt are immutable
terminal evidence and must not be reset, deleted, replayed, or reused. The
generation-2 NowCoder lane did not consume an action, but its READY receipt was
created under older observer bytes; it is not carried into the replacement
batch. A coherent replacement therefore uses new identities for both lanes:

```text
generation: d4-revision2-generation3
profile: .tmp/v4-live-observation-profiles/d4-revision2-generation3-{platform}
database: .tmp/v4-live-observation-db/d4-revision2-generation3-{platform}/training-platform.sqlite
pointer: .tmp/v4-live-observation-db/d4-revision2-generation3-{platform}/server-db-path.txt
```

This is an observer-only identity amendment under section 6.2. RED must prove
that generation3 is initially rejected. Historical generation2 remains valid
only as immutable files/receipts: the new runner parser and all identity/path/
pointer/profile validators must reject it, and it can never resolve to
generation3 paths. GREEN must accept exactly generation3 plus the matching platform paths,
reject missing/unknown/duplicate/cross-generation/wrong-platform/reuse mismatch
and junction escapes, and bind READY/failure/ACK receipts to generation3.
Runtime, manifest, schema, build, adapters, candidate, frozen dist, default DB,
and all historical profiles/DBs remain untouched; no D3 re-freeze is triggered.

After focused gates and independent `APPROVE`, prepare the two generation3
lanes sequentially in READY-only mode. New profiles must be created empty by
the runner. Login, if required, must happen interactively in those isolated
windows; cookies, credentials, tokens, or account data must never be copied
from older profiles. No action/click/submission is permitted during preparation.
A preparation failure stops both lanes. D4 remains incomplete and D5 stopped.

The generation3 identity amendment is now independently **`APPROVE`** with no
HIGH or MEDIUM findings. RED was observer `88/89`, with the sole failure being
the initially rejected generation3 token. GREEN is observer `89/89`; the four
frozen product anchors are `174/174`, for `263/263` focused tests. Commander
reran typecheck, targeted ESLint, both observer syntax checks, the privacy audit
(`0 findings`), `git diff --check`, and the protected-path comparison; all exit
`0`, and the protected product diff is empty. Current observer-only hashes are:

```text
scripts/v4-live-observation-observer.mjs  4E697F1114D4306BACE167A55D23D3623C34940155FB94D51839ABD526B1F57A
scripts/v4-live-observation.mjs           72D14F40772BD8036CF1C5B6303C3F7CB8184122E51251F6732ED56CE5BF896A
tests/unit/v4LiveObservationObserver.test.ts 3E3E11A47BC5350C14F1E983BF34B2C9E1E2C0FDFAF615F1C43BED29D7946233
tests/unit/v4LiveObservationObserver.d.ts 10301E9243DC6C39370B96E7ED93454EDD2C6F7F59F98605DB690D9B65DA829C
```

The five Task 26 dist hashes remain byte-identical. The new parser accepts only
`d4-revision2-generation3`; generation2, missing, unknown, duplicate,
cross-platform, cross-root, reuse-mismatched, symlink, and junction identities
remain fail-closed. Historical generation2 assets are preserved but cannot be
opened by the current runner. This approval permits only sequential
generation3 READY-only preparation. It is not D4 PASS, D5, RC, release, or an
authorization to click or submit.

### 14.21 Generation-3 READY and terminal LeetCode observation

Both generation3 lanes reached READY-only sequentially without a click:
LeetCode receipt `leetcode-readiness-1786559426411.json` and NowCoder receipt
`nowcoder-readiness-1786559535694.json`. Each binds generation3, the exact
per-lane profile/database identities, target/queue/SQLite zero counts, and the
unchanged five frozen dist hashes. The user then logged into both already-open
isolated profiles. No cookie, credential, token, or account data was read or
copied. Repeated login windows were an orchestration inefficiency, not a
contract requirement; the exact generation3 profile processes were identified
and closed while the user's ordinary Chrome remained running.

Under the standing one-action-per-lane authorization, LeetCode executed exactly
one strict selector click. Receipt
`output/playwright/v4-observation/leetcode-real-observation-failed-1786560268026.json`
is `OBSERVER_INVALID / observer_capture_error`, with safe error
`epoch_result_surface_unchanged`. The causal chain reached `e1_provisional`,
then accepted E0/E1, then E2; final stage is `e2_confirmed`. Counts are target
`e0/e1/submit/status=1/1/1/0`, extension
`confirmed/tombstones/outbox/quarantine=1/0/0/0`, and SQLite `0/0/0`.
Authorized action evidence is `attempted=true`, `clickCompleted=true`; no E3,
POST, ACK, session, or attempt was recorded.

This proves the strict-click chronology observer repair worked through E2. It
does not prove D4 delivery. Compile Error remains an allowed verdict; the
terminal reason is that no fresh result-surface epoch was observed after the
confirmed request. The runner, exact Chromium children, and fixed DB server
were stopped; port 3000 is free and the user's normal Chrome was untouched.
First-failure-stop therefore forbids the NowCoder action. Preserve both
generation3 READY receipts and the LeetCode failure profile/database/receipt;
do not retry, reset, replay, or submit again without a new written revision and
independent review. D4 remains incomplete and D5 stopped.

### 14.22 Revision 3: recoverable result-surface diagnostic adjudication

The generation3 LeetCode receipt is authoritative only as
`OBSERVER_INVALID`; it is not evidence of `PRODUCT_FAIL` or
`PLATFORM_BLOCKED`. Static review shows that
`epoch_result_surface_unchanged` is a closed, identity-free diagnostic emitted
when exact E2 arrives before a legal verdict/surface transition is visible.
It is persisted as `lastCaptureError`, but it does not delete the exact
submit epoch or the confirmed submission. The epoch remains eligible for a
later legal DOM proof until the existing five-minute TTL. The current live
observer therefore made a category error by treating this recoverable
diagnostic as an immediate terminal failure.

This revision is strictly observer-only under section 6.2. It may modify only
the dedicated live-observation helper/runner, their focused declarations and
tests, and this plan/report/handoff. It must not modify runtime, content,
background, adapters, manifest, permissions, schema, build, package scripts,
the frozen candidate, default database, or dist. Consequently a compliant
implementation does not trigger D3 re-freeze.

The observer must treat exactly `epoch_result_surface_unchanged`, first seen
with a valid exact E2 chain, as a monotonic `e2_surface_pending` fact rather
than success or failure. It may remain present through a later valid E3 and
pending outbox. Only the existing exact ACK invariants — matching locked E2
identity, tombstone/outbox lifecycle, SQLite `+4/+1/+1`, final queues zero,
and cleared `lastCaptureError` — may complete the lane. The observer must not
invent E3, infer a verdict, use a screenshot, accept a generic mutation, or
weaken any identity, chronology, duplicate-side-effect, queue, database, V3,
or privacy gate.

RED/GREEN must cover all of the following:

1. E0/E1/E2 followed by the closed diagnostic, including a coalesced E2 plus
   diagnostic callback and exact duplicate callbacks, enters one idempotent
   pending state instead of rejecting.
2. A pending diagnostic followed by the production E3 consume shape and then
   exact ACK clears the diagnostic and completes exactly once. An exact repeat
   callback with the same safe snapshot and database counts is idempotent at
   pending, E3, and ACK. A second durable side effect — additional or changed
   confirmed/tombstone/outbox identity, another database `+4/+1/+1`,
   resurrected confirmed state, queue drift, or database drift — still
   rejects.
3. The diagnostic before E2, after ACK, with a wrong target/identity, or after
   another capture error rejects. Disappearance before exact ACK, replacement
   by another error, multiple errors, unknown keys, hostile accessors, legacy
   `submit_clicked`, and malformed values remain fail-closed.
4. Every other allowlisted or unknown `lastCaptureError` remains immediately
   terminal. No general "ignore capture errors" rule is permitted.
5. Only an authorized-submit lane starts the deadline. The runner starts one
   monotonic `315000ms` timer when the reducer first accepts a snapshot (or
   ordered callback convergence) proving exact E2 plus the single
   `epoch_result_surface_unchanged` diagnostic. This is the product's
   `300000ms` epoch TTL plus a fixed `15000ms` observer scheduling allowance,
   measured from the later observer fact so it cannot expire before the
   product TTL. READY-only mode never starts a deadline. Exact E3 accepted
   before expiry proves the surface transition and cancels the surface timer;
   it then starts one monotonic `30000ms` delivery timer. Exact ACK cancels
   whichever timer is active. Surface expiry writes exactly one bounded
   `OBSERVER_INVALID / observer_surface_transition_timeout` receipt, closes
   the runner-owned context, and makes all later callbacks evidence-inert.
   Delivery expiry analogously writes exactly one bounded
   `OBSERVER_INVALID / observer_delivery_timeout` receipt. Tests must cover
   E3 immediately before surface expiry, ACK immediately before delivery
   expiry, and callbacks after either terminal deadline without relying on
   wall-clock sleeps.
   The already-dispatched `dispatchCount=1` action has consumed that lane's
   authorization; timeout does not create, restore, transfer, preserve, or
   imply retry authorization. Any later action requires new explicit user
   authorization and a newly reviewed entry state.
6. Success and failure receipts expose only closed stage/basis labels, fixed
   reasons, target/queue/database counts, generation/profile/database/dist
   identities, and the closed authorized-action projection. They must contain
   no URL, request/document/submission identity, verdict, DOM data, timestamp,
   code, body, cookie, token, credential, or account data.
7. Focused tests must prove no observer callback writes extension storage,
   performs a network request, changes SQLite, clicks a control, starts a
   second action, or opens another browser profile.

The same-text/same-Element case remains deliberately unaccepted: the current
production runtime receives only a generic MutationObserver wake-up and has no
safe signal that distinguishes a stale panel from an in-place rerender with
the same normalized verdict. If a later bounded observation reaches the
deadline without E3, the result remains `OBSERVER_INVALID`; it cannot be
promoted to `PLATFORM_BLOCKED` without separately reviewed, privacy-safe
platform evidence. If evidence later proves that a legal verdict or distinct
narrow Element transition occurred but the runtime missed it, that is a new
product defect requiring RED, production repair, D3 re-freeze, and new exact
dist validation.

Entry verdict for this revision is **`REVIEW REQUIRED`**. No browser, login,
READY retry, click, submission, reset, replay, candidate mutation, or D5 work
is authorized by this section. The next action is independent read-only review
of this contract; implementation may start only after all HIGH/MEDIUM findings
are closed and the review returns `APPROVE`.

That entry verdict is a historical pre-implementation checkpoint. Independent
plan review first rejected an ambiguous authorization/deadline clause; the
contract was corrected to consume the dispatched action permanently, start a
fixed `315000ms` surface timer only at accepted E2 plus diagnostic, and use a
separate `30000ms` E3-to-ACK delivery timer. The second plan review returned
**`APPROVE`** with no HIGH/MEDIUM findings.

RED was observer `89/94` (five new failures). During GREEN review, Commander
found two additional contract escapes and recorded a second RED of `93/96`:
the timeout reasons were absent from the bounded receipt reason set, and an
ACK-shaped snapshot could still retain `lastCaptureError`. Exact duplicate
callbacks were also explicitly restored as idempotent after distinguishing
them from duplicate durable side effects. Final GREEN is observer `96/96`;
the four frozen product anchors are `174/174`, for `270/270` focused tests.
Typecheck, targeted ESLint, both script syntax checks, privacy audit (`0
findings`), `git diff --check`, and protected-path isolation all pass.

Current observer-only SHA-256 identities are:

```text
scripts/v4-live-observation-observer.mjs  613168151501618A0D3AB8B97581150504ACBC620D089EF0229967B45207C2DB
scripts/v4-live-observation.mjs           60A304A4BAD9925C652361AE1C727E1FFAD9B0AF4EEBF02C677682703A4E3259
tests/unit/v4LiveObservationObserver.test.ts B3753D1E0111C25E358CC56CD6F44294FC98402258E8A9D15B77580223CB65C8
tests/unit/v4LiveObservationObserver.d.ts 5EFA489DBD9D38DEB1F59E67F99DE76541F047F609E865060608ADB8E9E6A0D5
```

Independent final code review returned **`APPROVE`**, no HIGH/MEDIUM. The
protected runtime/manifest/schema/build/adapter/dist diff remains empty and
the five Task 26 dist hashes remain byte-identical, so D3 is not re-frozen.
This approval is limited to the observer amendment; the generation3
LeetCode action remains consumed terminal evidence, D4 remains incomplete,
and D5 remains stopped. No live, server, browser, login, build, commit, or push
was performed during this repair.

### 14.23 Generation-4 single-lane replacement plan

The next observation must not reuse or reset the consumed generation3
LeetCode profile/database. To reduce user login work and preserve the
first-failure rule, replacement preparation is sequential by platform rather
than opening two login windows together:

1. add an observer-only identity amendment accepting exactly
   `d4-revision2-generation4` and rejecting every historical generation. The
   CLI parser, generation validator, fixed-path helper, profile validator,
   database-path validator, pointer validator, identity projector, receipt
   projector, and runner arguments are all mandatory enforcement points and
   must accept only these exact lane paths:

   ```text
   .tmp/v4-live-observation-profiles/d4-revision2-generation4-{platform}
   .tmp/v4-live-observation-db/d4-revision2-generation4-{platform}/training-platform.sqlite
   .tmp/v4-live-observation-db/d4-revision2-generation4-{platform}/server-db-path.txt
   ```

   RED must prove that every generation3 LeetCode/NowCoder token, profile,
   database, pointer, and receipt identity is rejected before any historical
   path is created, opened, migrated, reset, or otherwise mutated;
2. after focused gates and independent review, create only the LeetCode
   generation4 zero-row database and new runner-owned empty profile, then run
   READY-only;
3. if interactive login is required, perform one human login in exactly that
   fixed profile. READY and action run serially and never concurrently. The
   action may relaunch the same persistent profile after READY closes its
   context, but it must not require another login or open a second profile;
   never copy cookies, credentials, tokens, or account data from ordinary
   Chrome or historical profiles;
4. obtain a fresh action-time authorization and execute at most one strict
   LeetCode action; any failure or observer timeout stops the batch; and
5. the current generation4 runner rejects NowCoder immediately after closed
   target parsing and before reading, creating, migrating, or opening any DB,
   pointer, profile, or browser asset. Only after LeetCode D4 PASS may a new
   written amendment define and independently review a closed PASS capability
   before enabling a separate NowCoder generation4 profile, login, READY, and
   one newly authorized action.

Generation4 runner arguments must include exactly one value for each of
`--expected-observer-sha256`, `--expected-runner-sha256`,
`--expected-focused-test-sha256`, and `--expected-declaration-sha256`, each a
canonical uppercase 64-hex SHA-256 recorded by the final independent review.
Before opening a browser or platform page, the runner recomputes the four
fixed repository paths below and requires byte equality with those expected
values; it repeats the computation before every READY/failure/ACK receipt.

```text
scripts/v4-live-observation-observer.mjs
scripts/v4-live-observation.mjs
tests/unit/v4LiveObservationObserver.test.ts
tests/unit/v4LiveObservationObserver.d.ts
```

Receipts contain only the four safe hashes (no paths), the exact per-lane
generation/profile/database identities, and the unchanged five frozen dist
hashes. Missing, duplicate, malformed, mixed-version, pre/post-drift, or
wrong-expected hashes terminate before action and may not produce READY.
Focused RED/GREEN must cover all four files and all receipt outcomes.
The independent observer-tool-drift receipt must also include the already
validated pre-action five-file dist hashes and a non-recursive final five-file
projection. If final dist bytes cannot be read or differ, it records only a
fixed `distIdentityRejected` marker plus the safe expected hashes and remains
terminal; it must not call the ordinary evidence writer recursively.

Historical profiles/databases/receipts remain immutable evidence and must not
be deleted, migrated, reset, or opened by the new runner. Generation3
NowCoder's zero dispatch is only a historical fact, not transferable action
authorization. A generation4 NowCoder action requires LeetCode D4 PASS, its
own generation4 READY receipt, and a new explicit action-time authorization;
any LeetCode failure or timeout forbids even creating, opening, or logging into
the generation4 NowCoder profile/database. This plan does not authorize a
browser, login, READY, click, or submission yet. Entry verdict is
**`REVIEW REQUIRED`** for the generation4 identity delta; D4 remains
incomplete and D5 stopped.

The generation4 identity delta is now independently **`APPROVE`** with no
HIGH/MEDIUM findings. Initial RED was observer `96/100`; GREEN reached
`100/100`. First code review then rejected a missing LeetCode-first runner
gate and a tool-drift receipt without frozen-dist identity. Follow-up RED was
`100/103`; final GREEN is `103/103`. Typecheck, targeted ESLint, both script
syntax checks, privacy audit (`0 findings`), `git diff --check`, and protected
product-path isolation all pass. Current SHA-256 identities are:

```text
scripts/v4-live-observation-observer.mjs  A023F3D18CAA1CD051C3B94E6EB2763AEAEDF2C82D8B1E6AF592B689858DAC2C
scripts/v4-live-observation.mjs           32CA4C6CA9E50974A017A651FC9937B79D0D893AD40912E2F066E877BC2FC88C
tests/unit/v4LiveObservationObserver.test.ts 9665A6103B1056B2D09CD4C2383BCFA08B18ED2924EB6D8C876F27AADA77B096
tests/unit/v4LiveObservationObserver.d.ts 3ED3065EF8BA2FA1C99DBED23AA05F9D9CFB9F11DE8BCBA02D0882D862200753
```

The current runner rejects generation4 NowCoder before any DB, pointer,
profile, output, or browser asset is opened or created. Observer-tool drift
receipts include the non-recursive five-file dist identity or fixed
`distIdentityRejected`. Runtime, manifest, schema, build, adapter, candidate
and dist remain unchanged; D3 is not re-frozen. This approval permits only one
LeetCode generation4 READY-only preparation with a new zero-row DB and new
runner-owned profile. It does not authorize a click/submission or complete
D4/D5.

### 14.24 Deferred-replay rejection evidence preservation

Read-only source adjudication confirms an observer evidence-loss path, without
claiming that it was the live cause. During an authorized click, snapshots are
queued in `deferredActionSnapshots`. The replay helper advances private state
and safe history for each accepted prefix, but on the first rejected snapshot
returns only a generic reason. The runner then writes `deferred.at(-1)` against
the unchanged outer `browse_only` history. Thus “no lifecycle observed” and
“safe E0/E1 facts appeared and later regressed” can collapse to the same zero
count receipt.

This amendment is observer-only and diagnostic-only. It must not accept any
snapshot currently rejected or change product/runtime behavior. RED/GREEN
must prove:

1. replay failure retains an immutable safe accepted-prefix history and the
   index of the first rejected snapshot (not the last deferred item);
2. a pure rejected-transition projector records only prior stage, safe
   prior/rejected target and aggregate-session counts, `targetOrder` enum,
   extension queue counts, database counts, and closed diagnostic-presence
   booleans;
3. it emits one fixed class from a closed set: `target_count_regression`,
   `target_order_conflict`, `extension_state_conflict`,
   `database_progression_conflict`, or `transition_unadjudicable`;
4. replay failure appends only the safe accepted prefix to failure
   `stageHistory` and attaches the bounded rejected transition. Direct reducer
   failures use the same projection;
5. `browse -> E1 provisional -> target clear` is distinguishable from an
   immediate rejected zero snapshot, while both remain terminal; and
6. hostile getters, unknown keys, identities, timestamps, paths,
   request/document data, URL/body/header/code/cookie/token/account material
   remain rejected and absent from receipts.

The classifier is deterministic and does not use an implementation-chosen
priority. It first projects exact own data properties into four independent
conflict booleans: target-count regression/inconsistent target arithmetic;
target-order contradiction; extension confirmed/tombstone/outbox/quarantine
contradiction; and database progression contradiction. If and only if exactly
one boolean is true, it emits that dimension's fixed class. If none or more
than one is true, it emits `transition_unadjudicable`. Invalid shape, unknown
keys, accessors, non-canonical numbers/enums, or unavailable safe prior state
fail projection with `observer_value_rejected` and produce no partial
diagnosis. Focused tests must cover all four single-conflict classes, every
pairwise multi-conflict combination collapsing to
`transition_unadjudicable`, zero-conflict rejection, and hostile/unknown input.

Duplicate callback idempotence, identity/order/privacy gates, deadlines,
exact ACK `+4/+1/+1`, and one-click capability must remain unchanged. Scope is
only the observer helper/runner, focused declaration/tests, and
plan/report/handoff. No production extension, manifest, schema, build,
adapter, candidate, dist, DB reset, browser, login, READY, action, retry, or
NowCoder operation is authorized. Entry verdict: **`REVIEW REQUIRED`**.

### Generation4 LeetCode READY-only evidence (2026-08-13)

The single permitted generation4 LeetCode preparation reached **`READY`**
without a second login window. Receipt:
`output/playwright/v4-observation/leetcode-readiness-1786566437035.json`.
It binds generation `d4-revision2-generation4`, target
`leetcode.cn / merge-two-sorted-lists`, profile identity
`cd9f7b7375829a54b577531dcb27704679b6066f3cdc686465fcc1b01689c256`,
database identity
`8e3fefb38129aca9d12089953b1c0accea29131d80bb58b8d85765d183e6fa54`,
the four approved observer-tool hashes above, and all five unchanged frozen
dist hashes. Target counts, queues, and SQLite are all zero; final stage is
`browse_only`; the receipt records no authorized action. The runner-owned
browser context and fixed-DB server are closed and port 3000 is free.

No click or submission occurred. The only next permitted operation is one
fresh action-time authorization for at most one strict LeetCode click against
this exact profile/database/tool/dist identity. NowCoder remains hard-closed,
D4 incomplete, and D5 stopped.

### Generation4 LeetCode action result (2026-08-13)

The user's standing approval authorized one strict action against the exact
READY identity. The runner consumed exactly one click and wrote
`output/playwright/v4-observation/leetcode-real-observation-failed-1786566841561.json`.
The receipt is `OBSERVER_INVALID / observer_stage_rejected /
observer_transition_unadjudicable`: the strict selector action completed, but
the retained safe evidence stayed at `browse_only`, target counts
`0/0/0/0`, extension queues `0/0/0/0`, and SQLite `0/0/0`. Tool and dist
pre/final hashes and profile/database identities remained exact. No E0, E1,
E2, E3, POST, or ACK was accepted.

First-failure stop is active. The runner, browser, and server are closed,
SQLite locks are zero, and port 3000 is free. No retry, reset, replay, or
NowCoder preparation is authorized. The next engineering action is a
read-only reducer/callback-path adjudication and a minimal offline RED; this
receipt alone cannot distinguish a platform lifecycle absence from an
observer callback-contract defect and therefore does not authorize a product
or adapter change or D3 re-freeze. D4 remains incomplete and D5 stopped.

### 14.24 final closeout and 14.25 generation5 proposal

Section 14.24 is independently **`APPROVE`** with no HIGH/MEDIUM. RED was
`103 passed / 1 failed` (104 total); final GREEN is `105/105`. Frozen product
anchors are `174/174`; typecheck, targeted ESLint, both syntax checks, privacy
audit (`0 findings`), diff-check, and protected product isolation pass. The
final semantic correction treats `lastSuccessfulCaptureAt: undefined` as no
successful capture. Current SHA-256 identities are:

```text
observer  F9FEA06A9C4145A6339C4B8F3A870347AB04FEF650FD22C8B5C6D1156493B63B
runner    4FDCC35FE5173A2C99A4D9D0177BE9512BAB1F00BA4D5FF1F37AA2AFC7DB16F3
test      983B878656B0638104C71FA2E5A735AE01C124ED3BFF9E08C4394B25E1C7EEB4
d.ts      2ED9635F8810D5402B37051536967A8B2638291310570D074F6FBD48C1168D29
```

Generation4 remains consumed and terminal; this repair cannot reconstruct its
lost prefix and does not authorize a retry. No product/dist change or D3
re-freeze occurred.

The next proposed lane uses `d4-revision2-generation5` with exact new
LeetCode-only profile, zero-row DB, adjacent pointer, the four hashes above,
and the unchanged five Task 26 dist hashes. All older generations must reject
before open or mutation. One fixed-profile window is allowed; if login is
needed it happens once there, without reading/copying cookies, credentials,
tokens, account data, code, or problem text. READY and at most one strict
action run serially on that same identity under the user's standing approval.
Any failure stops; no retry/reset/replay/second profile. NowCoder remains
rejected before asset creation until LeetCode D4 PASS and a separate reviewed
amendment. Generation5 receipts must include the §14.24 safe prefix/first
rejection evidence and exact tool/dist/lane identity. Entry verdict:
**`REVIEW REQUIRED`**; no generation5 browser/action is yet authorized.

The preceding generation5 shorthand is superseded by this executable
contract. The one accepted token is `d4-revision2-generation5`; exact paths:

```text
.tmp/v4-live-observation-profiles/d4-revision2-generation5-leetcode
.tmp/v4-live-observation-db/d4-revision2-generation5-leetcode/training-platform.sqlite
.tmp/v4-live-observation-db/d4-revision2-generation5-leetcode/server-db-path.txt
```

`validateObservationGenerationArguments`, every fixed profile/DB/pointer
resolver and validator, `projectObservationIdentity`, receipt identity
projection, and runner entry accept only that token and those paths.
Generation1-4, unknown/duplicate values, cross-platform paths, mismatched
pointer contents, and wrong reuse state reject before read/open/create/mkdir/
migrate/reset/output/browser operations. Generation5 NowCoder rejects after
closed target parsing and before all asset access.

Every invocation requires exactly one canonical uppercase 64-hex value for
each existing expected observer/runner/focused-test/declaration hash argument.
The runner recomputes all four fixed files before browser launch, READY,
action, and every receipt. The five frozen dist hashes and non-recursive drift
receipt remain mandatory. RED covers every old generation at all enforcement
points, cross-platform/path/pointer/reuse conflicts, malformed/duplicate hash
arguments, drift, and READY/failure/ACK identity.

READY-only is a separate first invocation with `authorized-submit=false` and
must close with a zero-action receipt. Only after Commander separately verifies
the exact generation/profile/database/tool/dist identity, zero target/queue/DB
counts, and absence of an action field may a second invocation use
`authorized-submit=true`. The user's explicit standing approval supplies the
human authorization without another repetitive prompt; it does not bypass
the separate READY evidence gate or permit a click in the READY invocation.
The action remains bound to the same identity and exact selector, at most
once. Any failure stops with no retry/reset/replay/second profile. Generation5
failure receipts include the section 14.24 safe prefix/first-rejection
evidence. This executable contract remains **`REVIEW REQUIRED`**.

Generation5 implementation is now independently **`APPROVE`** with no
HIGH/MEDIUM. RED was `105 passed / 1 failed` (106 total); final focused GREEN
is `107/107`, product anchors `174/174`, and typecheck/lint/syntax/privacy
(`0 findings`)/diff/protected isolation pass. Current hashes:

```text
observer  48B65E4E2432E9641C5D0D5D4F20027A23EEE9F64E21F128E4B9E9C233E1D2C1
runner    CE15746975B2FBDC45506A14F2C9A37F8FA8BBC1AA9E8FD7BBC1482D75C8F515
test      6F0D0B33CAEE66AEDBF44A125F3E07058B61C36BF82F6C9420C74E078F26AD4F
d.ts      E218D2A786B8F5EF70CE78633B33891BE60971B65C45E13039690E68E4807CB2
```

Approval permits only the separate generation5 LeetCode READY-only
invocation. It does not itself prove READY or D4 PASS; action remains gated by
Commander verification of the resulting zero-action READY receipt.

### Generation5 terminal post-adjudication (historical checkpoint; current interpretation superseded by sections 14.33-14.34)

Generation5 READY receipt `leetcode-readiness-1786570800357.json` passed the
separate zero-action gate. The subsequent one-click action receipt
`leetcode-real-observation-failed-1786571076379.json` preserves an accepted
prefix with E0 `1`, E1/submit/status `0`, followed by the first rejected
transition E0 `1 -> 0`; queues and SQLite remained zero and tool/dist/lane
identity stayed exact. Product source and tests establish E0 as a bounded
30-second session fact that is alarm-pruned to an empty array.

At that checkpoint, independent adjudication superseded the receipt's original
tool classification with the historical lane result **`PRODUCT_FAIL`**: exact submit E1 was absent
before the product E0 lifecycle ended, so final delivery was missing while the
repaired observer remained valid. The original receipt is immutable and is not
rewritten. Bounded record:
`work/reports/v4-phase-d-d4-leetcode-generation5-post-adjudication.json`.

This stops both D4 lanes. No retry, reset, replay, new generation, NowCoder,
product edit, D3 re-freeze, D5, RC, or release is authorized. The only next
step is a written causal review of the frozen candidate's missing exact E1.

### 14.26 Frozen-candidate exact-E1 causal review

The causal review is now complete through the public-protocol and local
listener boundary. It does **not** authorize another submission or a product
patch.

Direct public first-party frontend evidence from the current LeetCode.cn
problem bundle still calls `submitV2`, which performs an authenticated
`POST /problems/{slug}/submit/`, then polls
`GET /submissions/detail/{submissionId}/v2/check/`. The exact current public
assets inspected without login, cookies, account state, code, or problem text
were:

```text
55312-504752a2397de7ad.js  SHA256 7486C2C67C8825E550D975BECD81757CAA9358823E52009BEA3225A1D9417275
95809-e2516c0f7276b083.js  SHA256 F298FEB1DEF1D49DE08DC429B58B86DCC8FFA427ED8887C2D1407CF65AC9C280
problem route chunk           SHA256 58DC074C2C9DF048D25E667CC228842B42546E1B4EB6CA2F76DCA799BB949795
```

This exactly matches the frozen adapter's accepted submit and `v2/check`
path shapes and proves that the REST path remains present in the current
public bundle. It does **not** prove which runtime branch the authenticated
generation5 session executed, and it does not exclude account/experiment
branching, a delayed chunk, GraphQL, or another submit path in that specific
run. A compile-error result is downstream of some completed submit operation
and cannot by itself explain the absence of every exact-submit E1 lifecycle.
The generation5 fixed profile,
fixed zero-row database, exact observer hashes, exact frozen dist hashes, and
single loaded lane also rule out the earlier multiple-extension/multiple-DB
hypothesis for this run.

The remaining causal boundary is the Chrome `webRequest` ingress. The frozen
runtime registers all five lifecycle listeners for owned hosts and
`xmlhttprequest`; it records E1 only when the request has a nonnegative tab
and frame, a nonempty `documentId`, an owned host, and an allowlisted endpoint.
Chrome documents `documentId` as optional. The generation5 receipt proves
that E0 was delivered through the same extension/background but does not
prove that the submit request reached `webRequest`, carried `documentId`, or
survived the observer's guards. The current product intentionally persists no
bounded reason for ignored production lifecycles, so the existing receipt
cannot distinguish missing listener delivery, missing `documentId`, or an
unexpected request metadata shape.

Historical checkpoint decision: **`PRODUCT_FAIL` remained the lane result; the
actual protocol branch and `webRequest` ingress outcome were both
unadjudicated.** Sections 14.30-14.34 supersede its current interpretation:
the exact click-generated submit cannot be safely bound to E1, so this
checkpoint cannot prove a deterministic frozen-product defect. No adapter
broadening is justified. In
particular, treating any GraphQL request, click, URL, or compile-error surface
as E1 would lower the D4 hard identity gate and is forbidden.

The next executable engineering task is an **offline-only RED/GREEN audit** of
the frozen listener boundary before any new live lane:

1. add focused cases for the exact REST submit across before/completed/error,
   optional/missing `documentId`, redirect, service-worker restart, and E0
   `29,999/30,000ms` timing;
2. prove listener registration and dist/manifest parity without modifying the
   frozen product or dist;
3. specify a separate observer-only, bounded characterization proposal only
   if the offline matrix cannot discriminate the cause. Such a proposal may
   export counts and fixed reason enums only—never URL/path, request ID,
   document ID, timestamps, body, headers, code, cookies, tokens, or account
   data—and cannot satisfy E1 or D4;
4. obtain independent review before implementing any characterization or
   consuming another real submission.

Independent plan review: **`APPROVE`**, with no HIGH/MEDIUM after the public
bundle claim was narrowed to evidence of an available REST path rather than
proof of the authenticated generation5 runtime branch. Approval covers only
the offline matrix above. D4 and D5 remain stopped; candidate
`aa1a572c3913b35dd3f0391f849dab66e79c56a2` and its dist remain frozen.

### 14.26 offline matrix closeout

The approved matrix is independently **`APPROVE`**, no HIGH/MEDIUM. Only four
focused test files changed; `extension/src`, manifest, dist, observer/runner,
candidate, schema, build, and databases were not changed. Added evidence
covers exact `.cn` REST submit at before/completed/error/redirect, missing and
empty `documentId`, fresh-observer restart persistence, E0 at `29,999ms` and
`30,000ms`, all five registered listener paths, and byte-identical source/dist
manifest.

Worker verification: seven focused files `353/353`; independent changed-file
verification: four files `184/184`. Typecheck, targeted ESLint,
`check-extension-dist`, privacy audit (`0 findings`), diff-check, and protected
isolation pass. Test file SHA256 values:

```text
extensionNetworkObserver.test.ts             3FEF7363A64F85DFA655270ABD408BE1F561010535CD099002E45EC0FA0B7CC1
extensionNetworkObserverIntegration.test.ts  43F4C1F843B103A6B8CA82897A425E8912DCFE7CCD49A5F4334B875492AFD0E4
extensionUiHint.test.ts                       017E9E1FAABA6CC4CDFE9AE077FE80F92292376200D56C640BF669D6E428FF40
extensionBackgroundMessages.test.ts          F370679376562E484235FC457493E3CC06339AB8AB1AFABA67C8825534B0DB93
```

The result proves the frozen implementation works for the modeled REST and
metadata shapes. It does not prove which request branch or metadata Chrome
produced in generation5, so no product patch is justified.

### 14.27 No-click authenticated asset identity proposal

To avoid another login and avoid consuming another submission, the next
proposed diagnostic reopens only the existing generation5 LeetCode profile in
a single browser context and performs **no click**. It is not a READY retry,
D4 retry, or acceptance run. It must not start the local capture server, open
SQLite, alter extension state, or create a new profile/generation.

The diagnostic may read only `script[src]` URLs whose parsed origin is exactly
`https://static.leetcode.cn`; it may not read DOM text, editor content,
cookies, storage, headers, request bodies, account/user objects, tokens,
problem statements, submissions, or page-state JSON. Static script bytes must
then be fetched without browser credentials from their public URLs. The
bounded receipt may contain only:

- fixed profile identity and frozen dist/tool hashes already present in the
  generation5 READY receipt;
- the public static asset filenames and SHA256 hashes;
- closed booleans for presence of `submitV2`, exact REST submit-path builder,
  exact `v2/check` builder, GraphQL operation symbols, and an allowlisted
  problem-route chunk;
- final fixed classification
  `authenticated_asset_matches_public_rest_bundle | authenticated_asset_branch_unresolved | observer_asset_audit_invalid`.

No path outside public asset filenames, timestamp, tab/document/request ID,
URL query, DOM value, account identity, or raw source snippet may enter the
receipt. The audit cannot satisfy E1 or D4 and cannot authorize a product
change. If it matches the public REST bundle, the next plan may focus on
Chrome listener/metadata characterization; if it remains unresolved, a later
one-click characterization requires a separate written amendment and
independent approval. No action authorization carries into this audit.

Current verdict: **`REVIEW REQUIRED`**. Until approval, do not launch a
browser or touch the generation5 profile.

Independent review: **`REJECT`** (one HIGH, two MEDIUM). Reopening the
persistent profile necessarily lets Chrome internally read session data and
write more than cache, contradicting the proposed no-touch claim; static asset
identity also cannot adjudicate runtime branching, and the URL/fetch bounds
were incomplete. This proposal is abandoned and must not be executed.

### 14.28 One-click protocol-category characterization proposal

The next proposal replaces the rejected asset audit with a diagnostic that
can answer the actual unresolved question while avoiding another login. It is
not a D4 retry and cannot produce D4 evidence.

A new dedicated observer-tool runner may reopen the already terminal
generation5 LeetCode profile in one persistent browser context **without
loading any extension** and without starting localhost, SQLite, or the capture
server. The user has already authorized real submissions and prepared this
logged-in profile. Chrome will necessarily use the profile's internal session
state and may perform normal browser writes; this is the sole narrow exception
to the historical-profile no-open rule. Program code must never call cookie,
storage, account, profile-file, header, body, response-body, DOM-text, editor,
or page-state APIs and must never export those values. No profile file may be
copied, hashed, enumerated, or compared.

The runner must launch with `--disable-extensions` and must reject any
`--load-extension` or `--disable-extensions-except` argument before opening
the profile. Source/tests/receipt bind `extensionsDisabled: true`; failure is
invalid before click. The runner navigates only to the exact fixed LeetCode
problem URL and permits
one call to the existing strict selector
`button[data-e2e-locator="console-submit-button"]`. Immediately before that
call it attaches a Playwright request listener. For each request the runner
may synchronously inspect only `method()`, `resourceType()`, and `url()` long
enough to parse and increment a closed counter; the strings are discarded and
never logged or retained. It must not call `postData`, `headers`, `allHeaders`,
`response`, or any equivalent API.

Only `POST` requests whose Playwright resource type is `xhr` or `fetch` are
candidates. GET/HEAD/navigation/script/image/font and all other noncandidate
traffic is ignored without parsing. Candidate POST URLs are then classified.
Cross-origin candidate POST is not parsed beyond origin classification and is
counted separately as bounded `cross_origin_post`, so it cannot be mistaken
for `no_owned_post`; any value above zero forces
`protocol_characterization_invalid` and authorizes no protocol inference.
Closed owned categories:

- `exact_rest_submit_post`: exact HTTPS host `leetcode.cn`, default port,
  no username/password/fragment, pathname exactly
  `/problems/merge-two-sorted-lists/submit/`, method POST, resource type
  `xhr|fetch`; query is ignored in memory and never retained;
- `owned_graphql_post`: same exact origin and safety grammar, pathname exactly
  `/graphql`, POST, `xhr|fetch`; this is a path category only and never claims
  the operation was the submit;
- `other_owned_post`: same exact origin/safety grammar, POST, `xhr|fetch`, but
  neither exact category;
- `unsafe_or_unclassified`: malformed candidate URL, credentialed URL,
  nondefault port, fragment, unexpected scheme, unsafe owned path, or any
  counter overflow;
- `no_owned_post`: derived only when the bounded window closes with all owned
  POST counters zero.

Each counter is bounded to `0 | 1 | many`. One monotonic `15,000ms` deadline
starts immediately before listener attachment and covers locator resolution,
click dispatch, click promise resolution/rejection, and the whole observation
window through one `Promise.race`; it is never reset or extended. At deadline
the runner writes fixed invalid evidence, removes the listener, and closes the
context/browser. There is no retry, reload, second click, second profile,
NowCoder, or extension observation.

The JSON receipt is exact-key and may contain only schema version, fixed tool
version/hash, fixed platform/problem, fixed profile identity already known
from the generation5 READY receipt, selector enum, click attempted/completed
booleans, `extensionsDisabled: true`, the five bounded counters, and exactly
one classification:

```text
exact_rest_path_observed
graphql_path_observed_protocol_unadjudicated
other_owned_post_observed
no_owned_post_observed
protocol_characterization_ambiguous
protocol_characterization_invalid
```

Any multiple nonzero categories, unsafe/unclassified request, hostile getter,
runner/tool drift, selector mismatch, profile mismatch, or output projection
failure is invalid. No timestamp, URL/path string, query, ID, verdict, status,
account data, or platform response enters the receipt. A compile-error result
is irrelevant and must not be read.

Interpretation remains diagnostic only:

- exact REST observed narrows the next repair investigation to Chrome
  extension `webRequest` delivery/metadata;
- GraphQL/other observed identifies protocol-category drift but cannot itself
  become E1;
- no request or ambiguous/invalid result authorizes no product inference.

Implementation scope is one new dedicated script, focused pure helper/tests,
and plan/report/handoff only. It must not modify the existing D4 runner,
observer reducer, production extension, manifest, adapter, schema, build,
candidate, dist, or any database. Required RED/GREEN covers exact URL grammar,
queries discarded, credential/port/fragment/host/type rejection, `0|1|many`,
multiple-category ambiguity, hostile accessors, forbidden API source scan,
cross-origin-only, cross-origin plus exact REST, cross-origin `many`, exact
receipt keys/privacy, click exactly once, extension absent, and no localhost/
DB imports.

Current verdict: **`REVIEW REQUIRED`**. No browser or click until independent
approval, GREEN tool review, and a **new explicit action-time authorization**
whose exact scope is `terminal generation5 profile + extensions disabled +
one click + one 15-second protocol characterization`. The earlier standing
approval was consumed by the generation5 D4 action and cannot authorize this
diagnostic. That new authorization would override the old first-failure stop
only for this non-D4 characterization; first failure here stops permanently.

Independent plan review: **`APPROVE`**, no HIGH/MEDIUM, after closing the new
authorization requirement, total monotonic deadline, mandatory extension-
disabled launch, candidate traffic filter, cross-origin invalidation, fixed
output containment, and pre/post-launch tool identity checks.
Approval permits tool RED/GREEN only. Browser launch and click still require
GREEN independent code review plus new action-time authorization.

Tool implementation is now independently **`APPROVE`**, no HIGH/MEDIUM. The
final review-bound SHA256 values are:

```text
scripts/v4-protocol-characterization.mjs       8D6196D6C22B7AD7A3EB792650FAC321B29CF17C57AB72C10829038CC1ED85F9
tests/unit/v4ProtocolCharacterization.test.ts  FE4EC5FF1239979A18988CCD42B48B8305AEBD58109095C3D4340E8530CFC7C4
tests/unit/v4ProtocolCharacterization.d.ts     09CDB3B8174F46AB026B08ABA702F237A26186389702747438C7A55FED4E9295
```

RED for the final late-request defect was `42 passed / 2 failed` (44 total);
GREEN is `44/44`. Typecheck, targeted ESLint, syntax, privacy (`0 findings`),
diff-check, and protected product isolation pass. The listener remains active
after click resolution until the same total 15-second deadline, so a delayed
POST cannot be misclassified as no request. Browser/network/live remain
unexecuted.

The only open gate is a new explicit action-time authorization for exactly one
extension-disabled generation5-profile diagnostic click and its single
15-second window. This authorization has not yet been granted.

### 14.28 Offline tool implementation status (2026-08-13)

The dedicated extension-free protocol characterization tool is implemented in
`scripts/v4-protocol-characterization.mjs` with focused declarations/tests in
`tests/unit/v4ProtocolCharacterization.{d.ts,test.ts}`. RED was recorded before
the script existed (import resolution failure, 0 tests collected); GREEN now
covers the closed request categories, exact REST/GraphQL/other-owned paths,
cross-origin and unsafe terminal invalidation, bounded `0|1|many` counters,
hostile accessors, exact privacy-safe receipt projection, strict one-click
seam, launch-argument rejection, extension-disabled source guard, fixed
contained output path, pre-launch and pre-receipt SHA-256 identity checks,
window-closed success (click completion remains pending until the shared
deadline closes), timeout-invalid receipts, cleanup seams, and one monotonic
15-second `Promise.race` deadline (44/44 focused tests). This is
tool engineering only; the verdict remains **`REVIEW REQUIRED`**. No browser,
profile, click, network, localhost, SQLite, extension, or D4 evidence was
produced.

Current focused-file SHA-256 values:

```text
scripts/v4-protocol-characterization.mjs       BF0D9982649AB1075130165F44FC624749445818ED61EC976E42BC379B0492DE
tests/unit/v4ProtocolCharacterization.test.ts  772CD88507F1542598A5BA76534A4E5B5F865D8769A0C8BBB1F2637BBEBB3303
tests/unit/v4ProtocolCharacterization.d.ts     C4625A07E102839B8D1B39725631050D18F7545D4EA416CDB2B67CE2C7F5062A
```

### 14.28.1 Windows CLI entry repair (2026-08-13)

The first RED was an actual child-process invocation of
`node scripts/v4-protocol-characterization.mjs --disable-extensions`: the
broken `import.meta.url` string comparison treated the Windows relative
invocation as an import, so the process exited `0` without running the CLI
and without creating output. The new pure
`isProtocolCharacterizationMainModule` cases cover the Windows file URL,
absolute and relative paths, a foreign module, a malformed module URL, and a
missing argv path. The child-process RED was `50 passed / 2 failed`; GREEN is
`52/52`.

The minimal fix uses `resolve(invokedPath) === fileURLToPath(moduleUrl)` in a
try/catch and calls the runner only when that pure predicate is true. A direct
invalid CLI invocation now exits `1` with no stdout/stderr and no output file;
importing the module remains side-effect free. CLI failures are therefore
fail-closed with a nonzero exit code.

Verification: focused protocol tests `52/52`; typecheck PASS; targeted ESLint
PASS; `node --check scripts/v4-protocol-characterization.mjs` PASS; V4
extension privacy audit `0 findings`; `git diff --check` PASS (only existing
LF/CRLF normalization warnings); protected runtime/manifest/schema/build/
adapter/dist diff empty; all five frozen production-dist hashes remain equal.
No browser, profile, click, network, localhost, SQLite, extension, or D4
evidence was produced, and no action-time authorization was consumed. Current
verdict remains **`REVIEW REQUIRED`**; independent review is required before
any live characterization.

Current focused-file SHA-256 values:

```text
scripts/v4-protocol-characterization.mjs       E50B8153C0F64A88B889F70D73BF17C182E3820BB26B53ED158CB132A235E029
tests/unit/v4ProtocolCharacterization.test.ts  4B4A8E7F3D44E840CB58E7CC42E6B05B502C0FEA5C16EC6FE755971E43CFE27A
tests/unit/v4ProtocolCharacterization.d.ts     CE41AA2BCEF6932D5BBB7A469B33043C3228F01CCB131516D24784C0448264EE
```

### 14.28.2 Actual protocol characterization and public-bundle closeout (2026-08-13)

The Windows CLI repair checkpoint above was offline-only. It was subsequently
superseded by exactly one extension-disabled characterization action using the
terminal generation5 LeetCode profile. The immutable bounded receipt is
`output/playwright/v4-protocol-characterization/protocol-characterization.json`
(SHA-256
`58DBB9CC062DC1B386EF60154ACF41B9320E6765D9B6229155323F1BCA6AD0BE`).
It binds tool SHA
`E50B8153C0F64A88B889F70D73BF17C182E3820BB26B53ED158CB132A235E029`,
records `extensionsDisabled=true`, one completed strict click, exact REST `0`,
GraphQL-path `0`, other-owned POST `many`, cross-origin POST `many`, unsafe
`0`, and therefore the terminal classification
**`protocol_characterization_invalid`**. The action authorization was consumed;
there is no retry, second click, NowCoder action, or D4 inference.

The receipt does not prove that the authenticated submit omitted REST or
GraphQL. It contains no submit binding, request identity, ordering, URL/path,
or operation name, and the nonzero cross-origin bucket makes the whole window
invalid by contract. It cannot become E1 evidence or retroactively alter the
historical generation5 checkpoint classification **`PRODUCT_FAIL /
exact_submit_e1_missing_before_e0_lifecycle_end`**; sections 14.33-14.34
govern the current causal interpretation.

A subsequent public-only audit fetched the official problem page and its 66
declared `static.leetcode.cn` JavaScript assets without credentials or account
state. Only five assets contained eight literal `method:"POST"` sites:
two REST-submit call sites, three telemetry sites, and three other sites
(upload signature, code formatting, and run-code enqueue). Supporting public
code still contains the exact REST builders `/problems/{slug}/submit/` and
`/submissions/detail/{id}/v2/check/`; separate public chunks also contain
GraphQL clients. These are only public-bundle presence facts. They do not
identify the generation5 authenticated runtime branch and cannot bind the
receipt's `many` buckets to the submit action.

The five literal-POST asset identities (raw-byte SHA-256) are:

```text
chunks/main-f372668afb3abb9c.js                                      6D129569DC65EE59BF95C4B615B3CBDB95290212F7ED28D3E1B8F0186D114751
chunks/pages/_app-752bfaa9e9bbe8e8.js                               E41AB003A35C5510936BBA62478516381A750B866CF3573A7CAA9362B50FF398
chunks/95809-e2516c0f7276b083.js                                    15EB63E16E2624F6E567785B811796A3AE7342960005ADEC0ACBBEF37C08DC19
chunks/12294-51736575eb6af081.js                                    92AB4432E203874DEFEC4A84CD431BF44398533753F7A6D316D465F600688D5F
chunks/pages/problems/%5Bslug%5D/%5B%5B...tab%5D%5D-9cfbe2a8390836d3.js F9E26A468347B64CC9C99661D22BCCCD125E31EFF956DA54B9B4591E3816C0FB
```

Supporting REST-builder chunk `chunks/55312-504752a2397de7ad.js` is
`AC949159912B1AD7F5ED6309961498CEFADFA025FFD55091AA0E284A9B40AF15`.
No raw source, response body, cookie, token, account identifier, code, or
commercial problem text was persisted. The compile-error screen is downstream
verdict evidence and still cannot explain missing E1. The single fixed
generation5 profile, zero-row database, and exact frozen dist exclude the
multiple-database/multiple-extension hypothesis for that lane.

Historical decision at that checkpoint: public static audit **`APPROVE`** as
bounded causal evidence; protocol characterization **`REJECT /
OBSERVER_INVALID`**; generation5 D4 lane remained **`PRODUCT_FAIL`**. Sections
14.33-14.34 supersede the current interpretation with
`D4_CAUSAL_DIAGNOSTIC_UNADJUDICABLE`; production repair, adapter broadening, D3
re-freeze, another live action, NowCoder, and D5 remain **`REJECT`**. No
current evidence supports a frozen-product edit. The next engineering action
is documentation/evidence reconciliation only unless a separately reviewed
design can obtain a safe, submit-bound protocol or listener-delivery fact
without another submission.

Independent final review: **`APPROVE`**, no HIGH/MEDIUM. Final read-only gates
on the current bytes: protocol tool `52/52`; the seven-file exact-E1/product
anchor selection `330/330`; TypeScript typecheck PASS; V4 extension privacy
audit `0 findings`; `git diff --check` PASS (line-ending warnings only);
protected production/candidate paths unchanged. Full build, full quality gate,
browser, server, database migration, and additional live actions were not run.

### 14.29 Submit-bound E1 causal probe (implementation contract)

This section supersedes any proposal to infer the authenticated submit branch
from public assets or a generic POST window. Its only goal is to locate one
authorized action within the chain `action -> page request -> Chrome
webRequest -> frozen production classification -> transient E1`. It is not a
D4 retry and cannot satisfy D4.

#### Frozen production chain audit

The audit source is candidate
`aa1a572c3913b35dd3f0391f849dab66e79c56a2`, not the public bundle:

| Layer | Input fact | Frozen hard gate / fail-closed condition | Existing observable fact | Missing fact to obtain |
|---|---|---|---|---|
| Listener registration | service-worker evaluation of `background.ts` | `registerNetworkObserverListeners` registers exactly five listeners with `OJ_HOST_PATTERNS` and `xmlhttprequest/main_frame/sub_frame`; a worker that never evaluates or restarts inside the epoch cannot be assumed registered | exact source/dist hashes and service-worker target | whether the epoch overlapped a stable registered worker |
| Raw callback | Chrome `onBeforeRequest`, `onBeforeRedirect`, `onResponseStarted`, `onCompleted`, or `onErrorOccurred` details | host/type filter must fire; callback absence is not inferred from page traffic alone | none in the generation5 receipt | whether a same-filter Chrome callback existed for the action-bound request |
| Ingress normalization | `WebRequestDetails` | forbidden keys, unsupported method/type, negative tab/frame, absent/empty/unobserved document, unowned host, invalid URL, or endpoint-normalization failure are ignored with a closed reason | offline production-function tests | exact production `LifecycleOutcome` for the live raw callback |
| Endpoint classification | raw owned HTTPS URL | `normalizeLeetCodeNetworkEndpoint` accepts only exact submit/check/result pathname grammars; query is discarded and fragment/credentials/port/wrong host fail | public REST presence and offline exact-path matrix | which production endpoint class, if any, the action-bound callback produced |
| Identity validation | requestId, tabId, frameId, documentId, method, resource type, endpoint key | one requestId may merge only monotonic lifecycle fields; identity conflict is retained as a corrupt-record diagnostic; submit confirmation additionally requires exact context and chronology | unit anchors | whether callback metadata was present/valid in the real epoch |
| E1 creation | production observer `recorded` outcome | `parseSafeEvidence` must accept the exact closed E1 record | no live E1 in generation5 | whether production function returned `recorded` |
| E1 persistence | `e1_recorded` orchestrator event | platform/tab/frame/document/adapter identity must agree; duplicate lifecycle is idempotent, conflicting identity fails closed | session `transientE1` is the authoritative bounded slice | whether the action-bound opaque request identity appeared in `transientE1` |
| Downstream transition | persisted exact submit E1 | later E2 must bind exact submit request and identity; no problem-only/latest fallback | existing D3 anchors | out of scope unless E1 is accepted |

`onBeforeRequest` supplies the earliest lifecycle fact; later lifecycle callbacks
merge under Chrome request identity. Redirects retain only the normalized
redirect endpoint or reject. `onCompleted` also schedules LeetCode endpoint
diagnostics and E2 confirmation, but those downstream operations cannot create
E1 when the production observer rejected the callback. A service-worker
replacement, probe worker replacement, listener-registration uncertainty, or
request identity mismatch during the diagnostic epoch is terminal invalid.

#### Candidate-external architecture

New files are limited to a dedicated tool and focused declarations/tests:

```text
scripts/v4-e1-causal-diagnostic.mjs
tests/unit/v4E1CausalDiagnostic.test.ts
tests/unit/v4E1CausalDiagnostic.d.ts
```

The tool may generate an isolated temporary MV3 probe extension only after all
offline path/hash/argument checks pass. It loads alongside the exact frozen
production dist but is not a second production build. The probe is read-only:
it registers the same host/type listener filters, forwards each callback into
separately instantiated exported `createWebRequestObserver` and
`createLeetCodeEndpointDiagnostic` functions from an extension source tree
proven byte-equal to the candidate, and records only closed projections. This
is a deterministic **`FROZEN_CANDIDATE_COUNTERFACTUAL`**; it does not prove
that the listener in the loaded production service worker executed. The probe
never blocks or modifies a request.

Four fact planes remain distinct:

1. **Action fact:** one exact selector, one in-memory epoch, arm then dispatch;
2. **Page-network fact:** method/resource type/owned-host and production
   endpoint-class result, computed in memory and immediately discarding URL;
3. **Chrome/candidate-function fact:** same-filter raw callback lifecycle plus
   the byte-proven candidate-function counterfactual outcome/reason, never a
   copied parser and never represented as proof that the production listener
   ran;
4. **Production-ingress fact:** Playwright/CDP evaluates one fixed read-only
   projector inside the loaded production service-worker realm. The projector
   may call only `chrome.storage.session.get(["transientE1"])`, HMAC the
   request identity inside that realm, and return a closed projection. A
   companion extension cannot read production storage. The epoch secret is an
   evaluate argument only: it is never messaged to an extension, stored, or
   returned. Evaluation failure, worker replacement, or any storage write is
   terminal invalid.

An unpredictable 256-bit epoch secret exists only in harness memory. URL
correlation uses exactly
`HMAC(secret, "url-bind-v1\\0" + epoch + "\\0" + method + "\\0" +
resourceType + "\\0" + canonicalRawUrl)` in both the page and Chrome planes.
Chrome-to-production request correlation uses exactly
`HMAC(secret, "request-bind-v1\\0" + epoch + "\\0" + requestId)` in both the
probe worker and the production-worker projector. The domains distinguish URL
from request identity while preserving pairwise equality. Both joins must be
bidirectional one-to-one; repeated/noise candidates, missing reverse matches,
mismatched opaque identities, stale/pre-dispatch facts, or failure to bind all
four planes is `DIAGNOSTIC_INVALID`. The secret is destroyed after projection;
the secret, raw values, and HMACs are never written to a receipt.

The closed terminal classification is exactly:

```text
ACTION_WITH_NO_OWNED_REQUEST
OWNED_REQUEST_NO_WEBREQUEST_CALLBACK
WEBREQUEST_CALLBACK_REJECTED_METADATA
WEBREQUEST_CALLBACK_UNKNOWN_ENDPOINT
WEBREQUEST_CALLBACK_ACCEPTED_NO_E1
E1_ACCEPTED
DIAGNOSTIC_INVALID
```

`WEBREQUEST_CALLBACK_UNKNOWN_ENDPOINT` requires all of: one page/Chrome opaque
request match, one owned POST, the real exact LeetCode endpoint normalizer
returning no adapter endpoint, and the real production endpoint diagnostic
returning `unmatched_submit_path`. The generic network observer may still
record its coarse fallback endpoint `submit`; that is observer ingress, not
exact adapter acceptance. Temporal proximity alone is insufficient. Exact
REST classification comes only from the real exact LeetCode normalizer and
its `leetcode/submit/...` endpoint key.

`OWNED_REQUEST_NO_WEBREQUEST_CALLBACK` requires one page request classified by
the frozen production normalizer as the exact target submit, zero probe
callbacks for its opaque URL identity, stable production/probe workers, and no
other candidate. A probe callback accepted by the frozen candidate-function
counterfactual but absent from production `transientE1` is instead
`WEBREQUEST_CALLBACK_ACCEPTED_NO_E1`; its receipt must label the function
source `FROZEN_CANDIDATE_COUNTERFACTUAL`, and it does not guess whether actual
listener registration, listener execution, scheduling, persistence, or worker
lifecycle is the narrower cause.

Receipt data is limited to fixed tool/candidate/dist identities, target enums,
action arm/dispatch counts, `0|1|many` counters, method/endpoint/resource and
metadata-state enums, production outcome/reason enums, E1 present/absent, and
one terminal classification. It contains no URL/path/query, timestamp,
request/submission ID, opaque HMAC, body, response, header, cookie, token,
code, DOM/editor/problem text, username, or account ID.

Required RED/GREEN covers the full matrix in the user contract: exact REST,
merged/duplicate callbacks, unknown/new endpoint, ambiguity, no callback,
background/noise exclusion, missing document, invalid tab/frame/type/redirect,
worker replacement, duplicate action/request, identity conflict, reversed or
stale chronology, malformed/unknown inputs, cross-origin/telemetry/unrelated
POST, epoch replacement, contained output, exact CLI, timeout/timer faults,
single receipt, hostile accessors, and all privacy prohibitions. No browser or
live action is permitted until focused GREEN, all gates, and an independent
nine-question review return `APPROVE` with no HIGH/MEDIUM.

Even after code review, action authorization remains closed until a separate
**zero-click preflight** proves the exact frozen dist and probe identities, both
service-worker targets, the five-listener probe registration, the CDP read-only
projection handshake, ephemeral-secret handoff, zero storage writes, output
containment, and clean shutdown. The preflight must not navigate to the real
platform or click/submit. Any failure closes the proposal rather than retrying.

Independent design review round 1 returned `REJECT` with 2 HIGH and 2 MEDIUM
findings: production-realm projection was unspecified, counterfactual functions
were overstated as actual listener execution, the HMAC join protocol was not
closed, and the zero-click preflight was absent. The amendments above close the
written design only; implementation and final independent verification remain
required.

Historical design checkpoint (superseded by the implementation closeout below):
**`IMPLEMENTATION AUTHORIZED; LIVE NOT AUTHORIZED; REVIEW REQUIRED`**.

#### Implementation closeout

The contract-only reducer is GREEN, but the executable causal probe is not
implemented. RED was an import-resolution failure while the dedicated script
was absent. GREEN is focused `22/22`; typecheck, targeted ESLint, script syntax,
privacy audit (`0 findings`), diff check, and protected-path isolation pass.
The fixed CLI without an injected live boundary exits `1` and creates no
receipt, so it cannot fabricate live evidence.

Current SHA-256 identities are:

- tool: `261568AED227E90FD9BE341B63C16C53C29E7ECDF785F03E5EC9964A7435E2E1`;
- focused test: `FFF578EB8959FF94C406B381DE44A32A803AAA79FD151435B1D8DC6B5819CB5F`;
- declaration: `A72E000065D33EC3E9515D9993FB09184307CE66B7B750221FF0DFA55D91B039`.

The implementation remains a pure/injectable four-plane reducer. It does not
provide the same-filter MV3 probe, production-worker CDP read-only
`transientE1` projection, pairwise HMAC joins, or zero-click preflight required
above. It therefore cannot distinguish a real Chrome callback from actual
production E1 persistence and cannot support an action-time request.

Independent final review returned **`REJECT`** with 4 HIGH and 1 MEDIUM.
Although focused `22/22` and the static gates pass, the implementation cannot
support a live conclusion because it has no MV3 same-filter listener, no
production-worker CDP projection, no zero-click preflight, and no real
four-plane HMAC join. It also permits classifications without proven stable
worker/listener facts, accepts arbitrary injected functions rather than the
loaded frozen dist, and contains a shadow endpoint classifier. These are
evidence-validity blockers, not product findings.

Final verdict: **`REJECT / LIVE NOT AUTHORIZED / NO ACTION REQUEST`**.

### 14.30 Historical protocol audit and executable four-plane repair

#### C1 v6 versus Task 26

Read-only Git, report, source, and frozen-dist inspection establishes:

1. C1 v6 is real authenticated evidence. Submission `cn/739108591` delivered
   through trusted E0, completed `POST /graphql/`, and exact
   result-distribution GETs. Its closeout explicitly identifies the earlier
   exact submit/check grammar as single-sample overfitting.
2. Revision 5 fixed a real internal identity contradiction: STARTED was keyed
   to exact submit request `A`, while GraphQL-result CONFIRMED used GraphQL
   request `B`. If `A` exists, the exact lookup necessarily fails.
3. Task 24 live evidence recorded `epoch_started_missing`, waiting `1`, and no
   delivery, but its bounded receipt did not retain an exact-submit lifecycle.
   It therefore does not prove that request `A` existed in that live epoch.
4. Task 26's new positive evidence is automated: unit RED/GREEN and a corrected
   synthetic GraphQL E2E that explicitly emits exact submit `A` before GraphQL
   `B`. The re-freeze report states no real platform request occurred.
5. The frozen `background.js` (SHA-256
   `9222BC90DB397B37499DE119482958BEAF1DD1A6E3136F7546A475676EC46C2D`)
   retains GraphQL and result-distribution support, but now rejects the branch
   with `missing_submit` unless a unique exact submit E1 exists. GraphQL is
   corroboration only because request bodies are forbidden and cannot provide
   a privacy-safe operation/submission identity.
6. The architecture rationale—one request-bound epoch preventing stale-panel,
   crossed-document, replay, and same-verdict ambiguity—is valid as a safety
   objective. What is not established is that the current authenticated UI
   always supplies the selected exact REST request.
7. Generation5 `E0 1 -> E0 0 / E1 0` is directly consistent with the historical
   GraphQL-only runtime shape, but does not by itself prove the current request
   was GraphQL or exclude listener/metadata failure.

Historical audit verdict:
**`TASK26_LIVE_PROTOCOL_ASSUMPTION_UNPROVEN`**. This is not yet proof that the
production premise is wrong, so no product patch or D3 re-freeze is authorized.
The only permitted next engineering work is the candidate-external four-plane
capability below; browser execution remains forbidden.

#### Four-plane repair contract

The existing reducer becomes a final aggregator only. It may not import
`extension/src`, classify endpoints, apply production metadata policy, accept
arbitrary production-function injection, or output any non-invalid result
without complete preflight proof.

- Plane A: strict action/page fetch-XHR POST facts; no Chrome request id.
- Plane B: generated passive MV3 companion with mechanically extracted filter
  parity and five lifecycle listeners; memory only, no blocking/body/headers/
  storage/DOM/localhost/external network.
- Plane C: fixed CDP expression in the actual frozen production service worker,
  bound to candidate/background hash; only closed listener/worker facts and a
  read-only `chrome.storage.session.get(["transientE1"])` projection.
- Plane D: combines only closed A/B/C facts and labels every conclusion
  `DIRECT`, `STATIC_IMPLIED`, or `UNRESOLVED`.

Pairwise joins use a fresh 32-byte CSPRNG key with no fallback:

```text
page <-> companion:
HMAC-SHA256(K, "d4-e1/page-mv3/v1\0" || canonical(method, origin, pathname, resourceType))

companion <-> production:
HMAC-SHA256(K, "d4-e1/mv3-production/v1\0" || chromeRequestId)
```

Both joins are exact one-to-one and tokens never enter receipt/log/storage.
RNG failure, missing/replaced workers, listener count other than five,
filter mismatch, identity drift, stale proof, unknown plane data, or any
missing required fact is `DIAGNOSTIC_INVALID`.

`--preflight-only=true` is a separate structural capability with no selector
or click function in its input type or runtime path. This round implements and
tests it but does not execute Chromium, the platform, a login profile, or a
real zero-click preflight.

Current verdict: **`IMPLEMENTATION IN PROGRESS / LIVE NOT AUTHORIZED`**.

#### Implementation and independent-review closeout

The candidate-external implementation now contains a zero-click preflight
orchestrator, a mechanically generated same-filter passive MV3 companion, a
fixed frozen-worker read-only projection, two domain-separated ephemeral HMAC
joins, a final-only reducer, and a separately isolated (not wired or
authorized) page-action plane. The public preflight entry accepts only the
closed argv object; injectable test orchestration is forced to
`DIAGNOSTIC_INVALID`, returns no proof, and its reducer results are deliberately
unbranded so they cannot mint an `E1_ACCEPTED` receipt.

The production projection remains limited to the reviewed fixed read of
`session.transientE1`; it does not read all local/session storage and therefore
does not touch credential-bearing keys. Chrome does not expose a trustworthy
read-only fact proving that the production worker made no transient storage
writes during the full window, so `zeroProductionWrites` is deliberately kept
false and the preflight returns `DIAGNOSTIC_INVALID /
preflight_proof_unavailable`. Likewise, Playwright exposes the persistent
context only after launch, leaving an unavoidable interval before the runner
can attach its `serviceworker` lifecycle monitor. Full-window replacement proof
is also deliberately false. Neither condition is upgraded from `UNRESOLVED`
to an authorization fact.

Actual RED was the initial focused-suite import failure while the dedicated
tool was absent. Latest GREEN is focused `41/41`. The following commands all
exit `0`: focused Vitest, `npm run typecheck`, targeted ESLint for the two tools
and focused test, `node --check` for both tools, the V4 privacy audit (`0
findings`), and `git diff --check`. A deliberately invalid CLI invocation exits
`1` and leaves both the fixed receipt and temporary workspace absent. The
protected candidate/runtime/manifest/schema/build/dist diff relative to
`aa1a572c3913b35dd3f0391f849dab66e79c56a2` is empty. No Chromium, platform,
profile, server, database, zero-click real preflight, or action was run.

Current SHA-256 identities:

- `scripts/v4-e1-causal-diagnostic.mjs`:
  `1D3971C0DBC166982249972A541E347FDDEB556B574D69D61AB1BFD44CC19959`;
- `scripts/v4-e1-causal-action-plane.mjs`:
  `809CB3EC2D4EDCE3367669B4DE1FE0A1E768E8BCE736F0AB30FC3B846A02A51F`;
- `tests/unit/v4E1CausalDiagnostic.test.ts`:
  `AC01E6832E1DD7AE05D229845F70D86454626B4A5D1762DD6DD38581B82B356F`;
- `tests/unit/v4E1CausalDiagnostic.d.ts`:
  `DBA9678D58300DE69E36BE6E9DDE0C2B7CE03D0821A32A84374553266CA9BE85`.

Independent review closed the earlier public-proof-seam and layered-cleanup
findings, but retained two HIGH evidence-validity blockers: the post-launch
worker-monitor blind interval and the inability to prove zero production
storage writes (unchanged before/after state is insufficient). The reviewer
also retained MEDIUM caveats for non-zeroizable WebCrypto key material and for
never treating an in-process WeakSet proof as a cross-process action
authorization.

Final verdict: **`REJECT / LIVE NOT AUTHORIZED / NO ACTION REQUEST`**. The
historical audit label remains
**`TASK26_LIVE_PROTOCOL_ASSUMPTION_UNPROVEN`**. No zero-click preflight may be
proposed under the present evidence contract, and no product patch, D3
re-freeze, D4 retry, NowCoder action, or D5 work is authorized.

### 14.31 Evidence-epoch capability contract revision

This section revises evidence semantics only. It does not amend the probe,
candidate, product, adapter, manifest, schema, build, or dist, and it does not
authorize Chromium, a zero-click preflight, navigation, login, click, submit,
NowCoder, D5, or D3 re-freeze.

#### Epistemic boundary

The experiment is divided into two disjoint intervals:

1. `PRE_EVIDENCE_INTERVAL`: Chromium launch through acquisition of the
   context, installation of worker lifecycle witnesses, exact identification
   of the current production and companion workers, and completion of the
   relevant safe baseline. Facts from this interval are labelled exactly
   `PRE_EPOCH_UNOBSERVED`. The contract makes no assertion that workers did not
   start or change, or that production state did not change.
2. `EVIDENCE_EPOCH`: begins only after `ARM_EVIDENCE_EPOCH` succeeds and ends
   at the verified close. Only facts created or directly observed in this
   interval may participate in a causal conclusion.

`ARM_EVIDENCE_EPOCH` requires all of the following direct/static facts:

- the exact five frozen dist hashes and exact production `background.js` hash;
- exactly one current production worker and one current companion worker,
  each with a verified current identity;
- five current production listeners and five current companion listeners;
- mechanically extracted same-filter parity;
- successful fixed read-only production and companion projection handshakes;
- a fresh 32-byte ephemeral HMAC session;
- a privacy-approved relevant production baseline;
- worker lifecycle monitoring installed before the epoch begins;
- no action has occurred; and
- the preflight path structurally owns no selector/click/submit capability.

Any missing, malformed, ambiguous, or drifting arm fact is
`DIAGNOSTIC_INVALID`; no epoch is armed.

Arm ordering is closed: install lifecycle witnesses first; identify and bind
the two current workers; verify hashes/listeners/filter/projections; create and
install the fresh key; capture the production baseline with that key; clear
the companion's pre-arm in-memory records/counters; verify the companion
baseline is empty; then publish the arm boundary. A future page plane ignores
all requests until the exactly-one dispatch boundary. Any callback in an arm
race or any pre-dispatch matching/noise candidate makes the run ambiguous and
invalid rather than being reassigned to the action.

#### No pre-epoch causal reuse

Arm creates a new HMAC key and epoch after the safe baseline. The runner keeps
the baseline's bounded production E1 tokens and diagnostic/count enums only in
memory. An action-era fact is eligible only if:

- it is observed after arm and after the one authorized dispatch;
- its page-to-companion and companion-to-production HMAC joins are each exact
  one-to-one;
- its production token was absent from the arm baseline;
- it binds the exact current workers identified at arm; and
- it does not depend on a pre-arm request, callback, HMAC, worker identity,
  diagnostic, or transient E1 entry.

Pre-arm production entries may be retained as baseline exclusions but never
as positive evidence. A pre-arm alarm or cleanup that later changes relevant
state cannot establish a positive action-bound join; any unexplained relevant
delta makes the epoch invalid. The preflight proof itself is not reusable as
an action authorization or cross-process credential. A future action run must
arm a fresh epoch and fresh key under the same closed checks.

An unbound diagnostic enum is never promoted to an exclusive root-cause fact.
It may corroborate an exact action-bound production fact; otherwise the result
remains `SUBMIT_BOUND_PROTOCOL_UNRESOLVED` or `DIAGNOSTIC_INVALID`. This prevents
a delayed pre-arm alarm/diagnostic from being relabelled as the action's Case A.

#### Epoch worker continuity

The obsolete hard property
`FULL_LAUNCH_NO_WORKER_REPLACEMENT_PROVEN` is deleted. Its replacement is
`EPOCH_WORKER_CONTINUITY_PROVEN`:

- after arm and until verified close, both exact worker objects must remain
  present and stable;
- replacement, disappearance, recreation, close, additional matching worker,
  or identity drift is immediately `DIAGNOSTIC_INVALID`;
- final worker identity is compared with the arm identity; and
- no statement is made about worker history before arm.

Pre-review threat hypothesis (superseded by the independent result below): a
worker A that starts and exits before observation should not directly join a
later action because the baseline is established on current worker B and a
fresh HMAC key is generated afterward. Independent review found that worker
history itself is not the remaining problem; a request started before arm can
still deliver lifecycle callbacks after arm. That concrete in-flight-request
path is addressed in the terminal review below and keeps this draft rejected.

#### Diagnostic non-mutation and production drift

The obsolete property `ZERO_PRODUCTION_TRANSIENT_STORAGE_WRITES_PROVEN` is
deleted. It conflated two different questions.

`DIAGNOSTIC_NON_MUTATING` is a hard property of tool capability and source:

- the companion has no storage permission and no storage, runtime-mutation,
  localhost, external-network, body/header/cookie, DOM, or blocking surface;
- the fixed production expression is mechanically allowlisted as read-only
  and cannot call storage mutation, runtime messaging, fetch, alarms, listener
  mutation, DOM mutation, or production functions;
- the preflight runner invokes no production mutation surface; and
- the action plane remains structurally absent from preflight.

`RELEVANT_STATE_DRIFT_FAIL_CLOSED` is a separate epoch observation property.
At arm and close, the same privacy-approved projection is obtained: baseline
and delta of `transientE1` bounded count/opaque HMAC set, current worker
identity, and already-approved diagnostic/count enums only. No raw state,
credential, URL, request id, token, submission id, or timestamp is returned or
persisted. Any unexplained relevant change, projection failure, ambiguous
delta, or identity mismatch is `PRODUCTION_STATE_DRIFT_UNRESOLVED` and makes
the result `DIAGNOSTIC_INVALID`.

Threat hypothesis before independent review: a hypothetical production write
`X -> Y -> X` with no relevant effect should not change a reducer conclusion.
The reviewer agreed that full-window zero-write proof is unnecessary, but
found a relevant non-hypothetical `X -> Y -> X`: production E1 may be persisted
and then consumed by E3 or pruned by TTL before the close snapshot. Therefore
snapshot equality cannot support a negative “no E1” conclusion. The final
review below replaces this over-broad assertion.

#### Revised preflight meaning and retained hard gates

`PREFLIGHT_READY` means only that the current toolchain can arm a future
evidence epoch from a known point: exact frozen product, exact current workers,
listener/filter parity, fixed read projection, fresh HMAC capability,
diagnostic non-mutation, an armable epoch monitor, verified clean close, and no
action. It does not mean browser-history purity, zero production writes,
protocol proof, D4 PASS, action authorization, user acceptance, RC, or release.

The revision does not relax frozen identity, dist hashes, current listener
identity, same-filter parity, exact one-to-one HMAC, exactly-one action,
action-after-arm, no retry, epoch worker continuity, identity drift,
ambiguity, relevant-state drift, privacy, diagnostic non-mutation, shadow
adapter prohibition, working-tree-as-production prohibition, or fail-closed
unknown state.

Contract-author verdict before independent review:
**`REVIEW REQUIRED / LIVE NOT AUTHORIZED`**. If and only if a new independent
threat-model review returns `APPROVE` with no exploitable HIGH/MEDIUM, the next
proposal may be one zero-click preflight. It still cannot request or authorize
a real submission.

#### Independent threat-model review

Final verdict: **`REJECT / LIVE NOT AUTHORIZED`**, with **2 HIGH / 0 MEDIUM**.
The reviewer agreed that neither full-launch worker purity nor absolute zero
production writes is a necessary property. However, the proposed replacement
contract does not yet isolate the action epoch:

1. **Pre-arm in-flight request contamination.** Request `R0` can start before
   arm but receive `onResponseStarted`/`onCompleted` after the action dispatch.
   A later action request `R1` with the same method/origin/path/type has the
   same page-to-companion tuple. If the companion creates a candidate from a
   late lifecycle callback rather than requiring its own post-arm,
   post-dispatch `onBeforeRequest` root, page `R1` can join companion and
   production facts for `R0`, producing a false positive conclusion.
2. **Relevant transient production state.** Production can persist action E1
   and later remove it through successful E3 consumption or the approved TTL
   prune. Arm and close can therefore both observe `X` even though action-bound
   E1 existed at intermediate state `Y`. An async persistence operation can
   also land after the close projection. Snapshot equality cannot support a
   negative “no E1” or metadata-rejection conclusion.

A future contract revision, not implementation in this checkpoint, must add:

- every eligible companion request requires a directly observed
  `onBeforeRequest` root after both arm and the exactly-one dispatch;
- later lifecycle events may extend only that rooted opaque request-id record
  and may never create a candidate independently;
- pre-arm/in-flight roots, pre-dispatch facts, missing roots, duplicate roots,
  and ambiguous tuple matches are terminal invalid;
- absence of action-bound production E1 remains
  `SUBMIT_BOUND_PROTOCOL_UNRESOLVED` unless an approved direct production
  transition witness proves the negative after all known callback/persistence
  work is quiescent;
- verified close must stop new inputs, drain every known diagnostic queue,
  reject pending callbacks, then take the final projection; an unavailable
  quiescence barrier cannot support a negative classification; and
- E1 later consumed by E3 is positive E1 evidence if it was directly witnessed
  during the epoch, never evidence that E1 was absent.

The reviewer confirmed privacy remains intact, D4 delivery/ACK/SQLite and
identity gates were not textually relaxed, `PREFLIGHT_READY` remains distinct
from action authorization and D4 PASS, and
`TASK26_LIVE_PROTOCOL_ASSUMPTION_UNPROVEN` must remain authoritative.

This review removes the two obsolete absolute gates but does **not** approve
their current replacements. No zero-click preflight may be proposed from this
revision.

### 14.32 Rooted-request and monotonic-positive-evidence contract

This revision addresses the two §14.31 threat-model findings in documentation
only. It does not change probe/product code and does not authorize tests,
Chromium, preflight, platform access, action, submit, NowCoder, D3 re-freeze,
or D5. Its epistemic rule is: positive facts require direct evidence; absence
of a witness is `NOT_OBSERVED`, never proof of `ABSENT`.

#### Monotonic action/request state machines

The run phase is single-directional:

```text
PRE_EPOCH
  -> EPOCH_ARMED
  -> DISPATCH_GATE_ARMED
  -> ACTION_DISPATCHED
  -> REQUEST_COLLECTION
  -> EPOCH_CLOSING
  -> EPOCH_CLOSED
```

`DISPATCH_GATE_ARMED` requires the evidence epoch, page plane, and companion to
be installed; the companion must acknowledge the gate; page and runner states
must agree; and `dispatchCount` must still be zero. The runner then performs,
without an intervening await, `dispatchCount := 1`, transitions to
`ACTION_DISPATCHED`, and invokes the strict-one locator click. This creates a
closed pre/post-dispatch observation boundary, not an atomic proof that a
network request was physically caused by the click. Wall-clock proximity is
never a join rule.

Each companion request has its own monotonic lineage:

```text
UNSEEN
  -> ROOTED_POST_DISPATCH
  -> REDIRECTED* / RESPONSE_STARTED?
  -> COMPLETED | ERRORED
```

Only a directly observed companion `onBeforeRequest` while the current epoch
and dispatch gate are active may create `ROOTED_POST_DISPATCH`. The root binds
the current epoch, current companion worker, an in-memory opaque Chrome
request-id HMAC, the safe tuple HMAC, phase, and lifecycle state. Raw request
identity never leaves the companion/HMAC boundary. Duplicate roots, lifecycle
regression, both completed and errored, or mutation after terminal are invalid.

`onBeforeRedirect`, `onResponseStarted`, `onCompleted`, and `onErrorOccurred`
can only extend an existing exact request-id root. They can never create,
repair, infer, or substitute a root. A potentially action-relevant later event
without a current legal root is `DIAGNOSTIC_INVALID`, regardless of endpoint,
status, tuple, or time proximity.

Pre-arm and pre-dispatch roots remain in a bounded companion-internal stale
lineage registry until close. Their later callbacks extend only their stale
lineage. Clearing candidate counters may not erase the opaque root identity
needed to recognize a late stale completion.

#### Page-to-companion cardinality and non-atomic dispatch window

The page tuple HMAC is a candidate join key, not request identity. For a page
fact `P`, `PAGE_MV3_JOIN=MATCHED` requires exactly one post-dispatch legal root
with the same tuple token. Zero matches remains `UNRESOLVED`; more than one
match is ambiguous and invalid. Multiple page facts with the same token are
also invalid. Different rooted tuples may coexist; the diagnostic never picks
first/latest/closest and never guesses which path is submit.

The gate-to-click boundary cannot be cross-process atomic. A request occurring
in that interval may enter observation only under its own root and page fact.
It cannot borrow another request's lifecycle or request-id token. If an
identical-tuple background request and click-era request cannot be separated by
one-to-one cardinality and lineage, the result is invalid. The contract claims
only an exactly controlled action window, not physical click causation from
timing alone.

#### Normative R0/R1 traces

```text
R0.onBeforeRequest   PRE_DISPATCH
ARM / DISPATCH
R1.onBeforeRequest   POST_DISPATCH
R0.onCompleted       POST_DISPATCH
R1.onCompleted
tuple(R0) == tuple(R1)
```

Required result: `R0` remains stale; its completion extends only `R0`; it
cannot create a candidate or join page `R1`; only `R1` may be eligible. If page
tuple cardinality cannot distinguish the lineages, the entire join is invalid.
`E1_ACCEPTED(R0 as R1)` is forbidden.

```text
R0.onBeforeRequest   PRE_DISPATCH
ARM / DISPATCH
R0.onCompleted
(no R1 root)
```

Required result: no action candidate and no positive E1 attribution. A missing
action root is unresolved or invalid according to whether an action-relevant
orphan lifecycle was observed; it is never repaired by `R0.onCompleted`.

#### Monotonic production E1 ledger

The diagnostic owns an in-memory `MONOTONIC_PRODUCTION_E1_LEDGER`. Each
approved frozen-worker read-only projection may add a directly witnessed safe
request HMAC/count/approved identity after baseline exclusion. An entry is
labelled `E1_WITNESSED_DIRECT` and is never removed if production later
consumes or prunes the underlying `transientE1`.

`E1_ACCEPTED` requires exactly one eligible rooted request, an exact
page-to-companion join, an exact companion-to-production request HMAC join,
and a direct ledger witness for the same root. It does not require the final
production state to retain E1. Baseline/pre-dispatch tokens are exclusions and
cannot become positive ledger entries.

Sampling can prove `PRESENT_AT_SAMPLE`; repeated absence can prove only
`E1_NOT_OBSERVED`. The contract prohibits deriving `NO_E1`, `NO_WRITE`,
`NO_TRANSITION`, listener-not-called, dropped-request, or production-never-
received from arm/close equality or polling misses.

Normative `X -> Y -> X` results:

- if a projection directly observes action E1 at `Y`, the ledger permanently
  retains `E1_WITNESSED_DIRECT`, even if E3/TTL returns storage to `X`;
- if no projection observes `Y`, close `X` yields `E1_NOT_OBSERVED` and
  `SUBMIT_BOUND_PROTOCOL_UNRESOLVED`, never a negative production claim;
- if `Y` lands after final projection, the epoch remains unresolved.

No new production listener, monkey patch, storage interceptor, or invasive
transition stream is required. A naturally available safe direct witness may
support stronger evidence; otherwise negative E1 classification is simply
unavailable.

#### Bounded close and quiescence

Quiescence is explicitly layered:

1. `ROOT_LIFECYCLE_QUIESCENCE`: every known eligible root reaches completed or
   errored within the bounded deadline. Deadline expiry is unresolved/invalid;
   it never proves absence.
2. `DIAGNOSTIC_QUEUE_QUIESCENCE`: all diagnostic-owned page/companion facts,
   HMAC operations, projections, reducer work, and receipt projection are
   drained and must settle.
3. `PRODUCTION_INTERNAL_QUIESCENCE`: `UNKNOWN` unless the frozen product
   already exposes an approved safe completion barrier. It is never inferred
   from layers 1 and 2.

Close order is normative: disable further action; freeze dispatch count at
one; stop new page facts and new eligible roots; allow existing roots their
bounded terminal lifecycle; reject relevant orphan events; drain diagnostic
work; take one final read-only projection and update only positive ledger
entries; verify epoch worker continuity and retained relevant drift; destroy
the ephemeral HMAC capability; then close. The final projection cannot prove
that production will never persist later, so no-witness results remain
unresolved.

#### Closed result taxonomy

Terminal classification is reduced to:

```text
E1_ACCEPTED
CALLBACK_METADATA_INCOMPATIBLE_WITH_FROZEN_GUARD
SUBMIT_BOUND_PROTOCOL_UNRESOLVED
DIAGNOSTIC_INVALID
```

`ACTION_WITH_NO_SUBMIT_BOUND_REQUEST` and
`PRODUCTION_INGRESS_ABSENT_UNRESOLVED` are removed because their names invite
negative inference; their safe cases collapse into
`SUBMIT_BOUND_PROTOCOL_UNRESOLVED` with bounded auxiliary facts such as page
count, rooted callback count, `E1_NOT_OBSERVED`, and basis enum.

Metadata incompatibility is terminal only when one exact post-dispatch rooted
request matches the one page fact, its direct safe metadata violates a
mechanically proven necessary frozen guard, and no competing action-bound root
could explain the submit. With any competing/unresolved root, the terminal
result is protocol unresolved; `observedGuardIncompatibleRoot=true` may remain
an auxiliary direct/static fact but never an exclusive root cause.

#### Preflight meaning and diagnostic utility

A future `PREFLIGHT_READY` would prove only the ability to establish the epoch,
dispatch gate, rooted-request machinery, epoch worker continuity, exact HMAC
joins, read-only positive production projection, diagnostic-owned queue close,
privacy-safe cleanup, and no action. It cannot prove future terminal diagnosis,
no-E1, production internal quiescence, platform protocol, D4 PASS, or action
authorization.

The future tool's bounded information gain is still material but asymmetric:

- it can directly prove post-dispatch page request tuples;
- it can prove same-filter companion callbacks with exact root lineage;
- it can prove safe callback metadata;
- it can preserve a directly sampled positive production E1;
- it can prove one unique root incompatible with a necessary frozen guard;
- it cannot prove which unrecognized path is submit, callback non-delivery,
  no production E1, dropped persistence, or global production quiescence.

Thus a future action could reliably distinguish positive E1 acceptance, one
unique direct guard incompatibility, ambiguity/invalid instrumentation, and an
honest unresolved result. Whether that information is worth one real action is
a later decision after offline implementation and code review; this contract
does not authorize it.

All original D4 product gates remain unchanged: exact frozen candidate/dist,
one action/no retry, submit-to-E2-to-E3 identity, final verdict, one bundle,
one HTTP 200 POST, one ACK, SQLite `+4/+1/+1`, final queues `0/0/0`, privacy,
protected product paths, and D5 stop. `TASK26_LIVE_PROTOCOL_ASSUMPTION_UNPROVEN`
remains authoritative.

Contract-author verdict before new independent review:
**`REVIEW REQUIRED / LIVE NOT AUTHORIZED`**. Even an approval permits only a
proposal to implement this offline contract delta and RED/GREEN tests. It does
not permit a zero-click preflight or action.

#### Independent §14.32 threat-model review

Final verdict: **`REJECT / LIVE NOT AUTHORIZED`**, with **1 HIGH / 0 MEDIUM**.
The reviewer confirms that the rooted request lineage closes the R0 late-
lifecycle attack and that the monotonic ledger plus bounded negative
epistemics closes the `X -> Y -> X` false-negative attack. Later lifecycle
events cannot create roots; tuple HMAC is no longer treated as request
identity; direct positive E1 survives E3/TTL; polling misses, final equality,
and after-close persistence remain unresolved; and production internal
quiescence is not claimed.

One positive-attribution attack remains. Between dispatch-gate ACK/state change
and the strict click actually causing a submit request, page background/retry
logic can emit a single request with the same safe tuple as submit. If the click
itself emits no submit, that background request can be the only post-dispatch
page fact/root, can be directly witnessed as production E1, and can satisfy
cardinality, both HMAC joins, lineage, and ledger. The current contract would
incorrectly permit `E1_ACCEPTED` or terminal metadata incompatibility even
though it proves only an action-window request, not click-originated submit.
With only one visible background root there is no ambiguity to trigger the
existing fail-closed rule.

The contract cannot proceed to offline implementation until one of two safe
directions is independently reviewed:

1. a candidate-external, privacy-safe, non-temporal direct witness binds the
   strict click to the actual request without modifying frozen production; or
2. all window-correlated request/E1/metadata observations remain auxiliary
   facts and terminal classification stays `SUBMIT_BOUND_PROTOCOL_UNRESOLVED`;
   `E1_ACCEPTED` and submit-root-cause verdicts are unavailable.

Future RED must include: click completes or fails without producing submit;
one same-tuple background root/page fact; a direct production E1 ledger match;
and both normal and guard-incompatible metadata. Neither path may yield
`E1_ACCEPTED` or a submit root cause without direct click-origin evidence.

The reviewer reports that a real diagnostic action under the current contract
is not worth consuming: it can still return a fully closed but incorrectly
attributed positive chain. No offline implementation delta, zero-click
preflight, action authorization, live submission, product change, or D5 work is
authorized. `TASK26_LIVE_PROTOCOL_ASSUMPTION_UNPROVEN` remains authoritative.

### 14.33 Browser-native click-to-request causal witness capability audit

This revision is documentation and threat-model work only. It does not change
the probe, tests, product, frozen candidate, or frozen dist. It does not run
Chromium, CDP, a zero-click preflight, a platform page, a network observation,
an action, a click, or a submission. The fixed starting state is section 14.32
`REJECT / 1 HIGH / 0 MEDIUM`; the remaining HIGH is
`GATE_TO_CLICK_CAUSALITY_UNPROVEN`.

#### Minimum direct-causality standard

A direct witness must establish a browser-native, non-temporal edge from the
exact controlled click invocation `C` to the exact request instance `R`:

```text
REQUEST R is causally descended from EXACT CONTROLLED CLICK C
```

After/near/only-in-window, tuple uniqueness, endpoint similarity, status,
transient user activation, the same function, and the same stack shape are not
direct causality. Any mechanism that cannot defeat the one-unrelated-same-
tuple-background-request attack is auxiliary only.

#### Official protocol and Chromium source findings

- CDP [`Network.requestWillBeSent`](https://chromedevtools.github.io/devtools-protocol/tot/Network/#event-requestWillBeSent)
  defines `hasUserGesture` as a boolean and Chromium's
  [`InspectorNetworkAgent`](https://chromium.googlesource.com/chromium/src/+/refs/heads/main/third_party/blink/renderer/core/inspector/inspector_network_agent.cc)
  copies it from `ResourceRequest::HasUserGesture()`. Chromium
  [`ResourceRequest`](https://chromium.googlesource.com/chromium/src/+/refs/heads/main/third_party/blink/renderer/platform/loader/fetch/resource_request.cc)
  stores an OR-ed boolean, not a gesture identifier. User activation is a
  time-bounded/consumable state, so an unrelated request during the same
  activation may also be true. No field joins it to one
  `Input.dispatchMouseEvent` invocation.
- CDP [`Network.Initiator`](https://chromedevtools.github.io/devtools-protocol/tot/Network/#type-Initiator)
  and [`Runtime.StackTrace`](https://chromedevtools.github.io/devtools-protocol/tot/Runtime/#type-StackTrace)
  expose code/async ancestry. `parent` and `parentId` identify debugger async
  stacks, not a DOM event invocation or CDP input command. Re-running the same
  handler can produce the same lineage without producing a unique click token.
- [`Debugger.setAsyncCallStackDepth`](https://chromedevtools.github.io/devtools-protocol/tot/Debugger/#method-setAsyncCallStackDepth),
  [`DOMDebugger.setEventListenerBreakpoint`](https://chromedevtools.github.io/devtools-protocol/tot/DOMDebugger/#method-setEventListenerBreakpoint),
  and paused `EventListener` call frames expose code execution, but breakpoints
  pause page execution and change scheduling. A paused call-frame identifier is
  valid only while paused and is not propagated into Network events.
- [`Network.setAttachDebugStack`](https://chromedevtools.github.io/devtools-protocol/tot/Network/#method-setAttachDebugStack)
  attaches a page-script stack id for debugging; the protocol does not define
  it as an exact input/event invocation identity.
- Blink emits `EventDispatch` as a duration event in
  [`event_dispatcher.cc`](https://chromium.googlesource.com/chromium/src/+/refs/heads/main/third_party/blink/renderer/core/dom/events/event_dispatcher.cc).
  It emits `ResourceSendRequest` as an instant event in
  [`inspector_trace_events.cc`](https://chromium.googlesource.com/chromium/src/+/refs/heads/main/third_party/blink/renderer/core/inspector/inspector_trace_events.cc).
  The latter payload contains request id, raw URL, method, frame, resource type,
  stack, and initiator; the former contains event type and optional input
  attributes, but no request parent id, backend node id, latency flow id, or
  CDP command id. Displayed nesting is same-thread interval containment, not an
  explicit browser-emitted click-parent edge on the request.
- Chromium creates a per-input latency trace id in
  [`RenderInputRouterLatencyTracker`](https://chromium.googlesource.com/chromium/src/+/refs/heads/main/components/input/render_input_router_latency_tracker.cc)
  and carries it through `LatencyInfo.Flow`. However,
  [`Input.dispatchMouseEvent`](https://chromedevtools.github.io/devtools-protocol/tot/Input/#method-dispatchMouseEvent)
  returns no identity. Chromium's
  [`input_handler.cc`](https://chromium.googlesource.com/chromium/src/+/refs/heads/main/content/browser/devtools/protocol/input_handler.cc)
  constructs a debugger-origin WebMouseEvent and injects it without returning
  the internally created latency id. `EventDispatch` and
  `ResourceSendRequest` do not expose that id.
- Event Timing may expose an interaction id and backend node id for a logical
  interaction, but no official field joins the specific CDP input invocation
  to that interaction, then to `EventDispatch`, then to a request. A pre-click
  hit test or event-listener `backendNodeId` establishes an expected/registered
  node, not the actual end-to-end request parent.
- Blink's
  [`EventLoop`](https://chromium.googlesource.com/chromium/src/+/refs/heads/main/third_party/blink/renderer/platform/scheduler/public/event_loop.h)
  documents that microtasks can run at task/script checkpoints. Independent
  main-thread tasks cannot synchronously interleave inside one JS stack, but a
  trace interval alone does not identify why a microtask ran or provide an
  invocation-specific async parent. Worker, timer, animation-frame, and later
  Promise/await requests are outside a provable synchronous click edge unless
  a separate invocation identity exists; none was found.

#### Capability matrix

| Candidate | Classification | Static conclusion |
| --- | --- | --- |
| `Network.hasUserGesture` | `AUXILIARY_ONLY` | Transient activation boolean; no unique gesture/click identity. |
| `Network.Initiator.stack` | `AUXILIARY_ONLY` | Code lineage/call location, not one handler invocation. |
| Runtime async `StackTrace` / `parentId` | `NO_CAUSAL_IDENTITY` | Debugger async ancestry is not joined to one input or DOM event instance. |
| Debugger EventListener breakpoint | `OBSERVER_EFFECT_REJECTED` | Pauses execution; call-frame id does not propagate to request. |
| DOMDebugger click breakpoint | `OBSERVER_EFFECT_REJECTED` | Same pause/scheduling mutation and missing request join. |
| `Network.setAttachDebugStack` | `AUXILIARY_ONLY` | Debug stack identity/code ancestry, not exact controlled click identity. |
| Tracing `EventDispatch` | `UNKNOWN_REQUIRES_RUNTIME_CHARACTERIZATION` | Duration is structural substrate, but has no exact CDP-input/target identity; runtime characterization is forbidden this round and cannot by itself repair the missing protocol edge. |
| `ResourceSendRequest` nesting | `AUXILIARY_ONLY` | Same-thread interval containment may support synchronous corroboration, but the request has no explicit EventDispatch parent id and raw payload is privacy-sensitive. |
| `LatencyInfo.Flow` / input bind id | `NO_CAUSAL_IDENTITY` | Browser-native per-input id exists internally but is not returned by CDP or joined to EventDispatch/request. |
| CDP `Input.dispatchMouseEvent` | `NO_CAUSAL_IDENTITY` | Command returns success only, not an input/event/flow id. |
| Exact-target backend node / hit test | `AUXILIARY_ONLY` | Expected or registered node can be bounded/HMACed, but no native end-to-end click-event-to-request join exists. |
| Passive page listener | `OBSERVER_EFFECT_REJECTED` | Mutates listener topology/page timing and still needs a request join. |
| `fetch`/XHR monkey patch | `OBSERVER_EFFECT_REJECTED` | Mutates the measured runtime and is not frozen-candidate evidence. |
| Header/query/action-token injection | `OBSERVER_EFFECT_REJECTED` | Mutates the platform request/product behavior; also violates privacy/security boundaries. |

No candidate is `DIRECT_FEASIBLE` under the minimum standard.

#### Synchronous and asynchronous boundary

If an exact controlled input, its actual target, its exact click dispatch, and
an explicit child request id were all browser-natively joined, a synchronous
request could be called `DIRECT_SYNC_CLICK_REQUEST`. Static source shows only
separate pieces: an unreturned input latency id, an EventDispatch duration,
and a request instant. It does not show the required joins. Therefore even the
strongest same-thread containment remains auxiliary in this contract.

`Promise.resolve().then(fetch)`, `await`, timer, animation-frame, framework
scheduler, and worker requests are `SUBMIT_BOUND_PROTOCOL_UNRESOLVED` unless an
invocation-specific async identity reaches the Network request. Fast execution
or interval proximity cannot substitute. A trace stack may show code lineage,
but repeated invocations of the same code remain indistinguishable.

#### Privacy and observer-effect threat model

The prohibited data set remains request/response bodies, headers, cookies,
tokens, authorization, code/editor content, problem text, account identity,
DOM text, raw full URL/query, script source, and arbitrary storage.

- `ResourceSendRequest` trace payload natively includes raw URL/request id and
  stack/initiator material. CDP Tracing streams raw events; no protocol field
  filter was found that emits only the desired parent relation. In-memory
  projection and no raw persistence reduce retention but do not eliminate the
  initial sensitive read. Full tracing is therefore not approved for D4.
- Network/Tracing without pause are comparatively passive, but they add
  instrumentation overhead and expose a larger data surface. They may support
  future characterization only after a separate privacy design; they cannot
  create the missing causal edge.
- Debugger/DOMDebugger/EventListener breakpoints and pause/resume are active
  observers that change scheduling and can change the very request path under
  test.
- Page listeners and runtime wrappers change page behavior. Request token,
  header, or query injection changes the platform request and invalidates
  frozen-candidate evidence.

#### Current-project audit and closed conclusion

The current diagnostic contains no browser-native direct edge from a CDP input
invocation to a DOM click invocation and then to a Network request. Its
post-dispatch root, page fact, tuple cardinality, HMAC joins, and monotonic
production E1 ledger remain action-window facts. A single unrelated same-tuple
background request can still satisfy them. The section 14.32 HIGH is therefore
real and unresolved by available official interfaces.

The external click causal diagnostic route is closed as:

```text
WINDOW_CORRELATED_FACTS_AUXILIARY_ONLY
```

Action-window facts can never produce `E1_ACCEPTED`,
`CALLBACK_METADATA_ROOT_CAUSE`, or `PRODUCTION_DELIVERY_ROOT_CAUSE`. Their
strongest safe terminal result is `SUBMIT_BOUND_PROTOCOL_UNRESOLVED` plus
bounded auxiliary facts. No section 14.34 implementation plan is opened.

The existing uncommitted diagnostic/protocol scripts and their tests predate
this closeout and are now explicitly
`HISTORICAL_NON_AUTHORITATIVE_DO_NOT_EXECUTE`. In particular, any code path or
test expectation that still names `E1_ACCEPTED`,
`ACTION_WITH_NO_SUBMIT_BOUND_REQUEST`, or
`CALLBACK_METADATA_INCOMPATIBLE_WITH_FROZEN_GUARD` does not represent the
current evidence contract and cannot mint D4 evidence, support a preflight, or
justify an action. This documentation status intentionally supersedes those
working-tree labels; this round is forbidden from editing or running them.

The frozen candidate remains an immutable D3 engineering candidate, but its
D4 root cause is now classified:

```text
D4_CAUSAL_DIAGNOSTIC_UNADJUDICABLE
```

This does not certify D4, invalidate the D3 engineering gate, prove the Task26
live protocol premise true or false, or authorize another action.
`TASK26_LIVE_PROTOCOL_ASSUMPTION_UNPROVEN` remains authoritative.

#### Engineering exit routes

- Route A (current recommendation): retain `aa1a572...` as the frozen D3
  engineering candidate, stop further live retries for this candidate, record
  D4 as causally unadjudicable, and keep D5 stopped. This has the lowest
  immediate engineering and privacy risk.
- Route B (future product version only): design a production-owned explicit
  causal identity that is carried from action epoch/token through submit
  ingress, E1, E2, and E3. This is a product/protocol change, not an observer
  repair. It requires a new written plan, RED/GREEN, privacy review, D3
  re-freeze, and a new D4. The exact transport must itself avoid mutating
  third-party requests unless separately approved. It is not implemented or
  authorized here.

Contract-author verdict before the independent review was
**`NO_SAFE_DIRECT_WITNESS / LIVE NOT AUTHORIZED`**. The allowed reviewer
verdict set was `APPROVE_DIRECT_WITNESS_FEASIBILITY`,
`NO_SAFE_DIRECT_WITNESS`, or `REJECT / REVIEW_INCOMPLETE`.

#### Independent section 14.33 review

The new independent reviewer answered all fifteen required questions and
returned **`NO_SAFE_DIRECT_WITNESS`**. It found no HIGH issue in the static
audit or capability matrix. It confirmed that `hasUserGesture` is activation
corroboration, stacks are code/async lineage, Input/Latency/EventDispatch/
ResourceSendRequest lack one shared invocation identity, interval containment
is not an explicit request parent edge, async paths must remain unresolved,
trace payloads exceed the approved privacy surface, and debugger breakpoints
perturb execution. It also confirmed `WINDOW_CORRELATED_FACTS_AUXILIARY_ONLY`,
`D4_CAUSAL_DIAGNOSTIC_UNADJUDICABLE`, Route A now, Route B only as a future
product change, and continued `TASK26_LIVE_PROTOCOL_ASSUMPTION_UNPROVEN`.

The reviewer initially reported one MEDIUM documentation/implementation-status
drift because the historical working-tree reducer still contains the obsolete
positive result labels. The explicit
`HISTORICAL_NON_AUTHORITATIVE_DO_NOT_EXECUTE` rule above closes that status gap
within this documentation-only scope; the old scripts remain unmodified and
unauthorized. The reviewer re-reviewed the clarification and confirmed the
finding closed. Final independent findings are **HIGH: none; MEDIUM: none**.
Final verdict: **`NO_SAFE_DIRECT_WITNESS`**.

### 14.34 Route A closeout

This closeout selects **Route A**. It is a documentation and static working-
tree audit only. Route B is not opened, designed, or implemented. No test,
typecheck, lint, build, migration, E2E, Chromium, CDP, preflight, platform,
login, network characterization, click, submission, reset, retry, deletion,
restore, commit, push, or PR operation ran.

The external diagnostic route is closed because section 14.33 found no
privacy-safe browser-native direct click-to-request witness. Its independent
final review returned `NO_SAFE_DIRECT_WITNESS`, with HIGH none and MEDIUM
none. Window-correlated facts remain `AUXILIARY_ONLY`; their strongest safe
causal outcome is `SUBMIT_BOUND_PROTOCOL_UNRESOLVED`.

The protected product diff from frozen candidate
`aa1a572c3913b35dd3f0391f849dab66e79c56a2` is empty for product runtime,
extension source/manifest/dist, adapter, schema/migration/database, build,
package, app, and production-E2E paths. The current five dist hashes remain
exactly the Task26 frozen hashes. Therefore D1 and D2 remain complete, and D3
remains an immutable **engineering candidate**. This does not make it an RC,
accepted build, or release.

#### Current evidence hierarchy

1. Sections 14.33-14.34 are the current authority:
   `NO_SAFE_DIRECT_WITNESS`, `WINDOW_CORRELATED_FACTS_AUXILIARY_ONLY`,
   `TASK26_LIVE_PROTOCOL_ASSUMPTION_UNPROVEN`, and
   `D4_CAUSAL_DIAGNOSTIC_UNADJUDICABLE`.
2. `work/reports/v4-phase-d-d4-leetcode-generation5-post-adjudication.json`
   is retained unchanged as an immutable historical factual receipt: one
   strict click, E0 `1 -> 0`, no accepted E1/E2/E3/delivery, and database
   `0/0/0`. Its `PRODUCT_FAIL /
   exact_submit_e1_missing_before_e0_lifecycle_end` classification records the
   checkpoint interpretation at the time; it does not prove that the frozen
   adapter deterministically failed the actual click-generated submit
   protocol.
3. Historical observer/protocol tools, tests, RED/GREEN counts, and hashes are
   engineering history only. They are
   `HISTORICAL_NON_AUTHORITATIVE_DO_NOT_EXECUTE` and cannot mint current D4
   evidence or authorize a preflight/action.

D4 is **not PASS**, is **not currently a deterministic PRODUCT_FAIL**, and is
not accepted. Its current root cause is causally unadjudicable, so D4 remains
incomplete. D5 remains stopped and has not started. No further retry on this
candidate is authorized. Every earlier sentence proposing READY preparation,
a new observation plan, an action-time authorization, or a next live action is
a superseded historical checkpoint and grants no current authority.

#### Authority and disposition matrix

| Working-tree class | Authority | Route A recommendation | Rationale |
| --- | --- | --- | --- |
| `AGENTS.md`, this plan, `work/handoff-current.md`, and `work/reports/v4-phase-d-d4-acceptance-contract-revision-2026-08-12.md` | Current status authority | **KEEP** in a future Route A documentation/evidence commit | They carry the current interpretation and stop state; `AGENTS.md` prevents the next agent from following superseded live-next wording. |
| `work/reports/v4-phase-d-d4-leetcode-generation5-post-adjudication.json` | Immutable historical fact record | **KEEP** unchanged with the same future evidence commit | Preserve the safe observed facts; supersede only the interpretation in prose. |
| `scripts/v4-live-observation{,-observer}.mjs` and `tests/unit/v4LiveObservationObserver.{test.ts,d.ts}` tracked deltas | Historical observer engineering | **RESTORE** to HEAD in a separately authorized cleanup | Their facts/hashes are recorded; the dirty deltas are not Route A authority. No restore occurs now. |
| Four tracked section 14.26 focused test deltas (`extensionNetworkObserver*`, `extensionUiHint`, `extensionBackgroundMessages`) | Historical offline regression evidence | **SEPARATE-UNRELATED** from Route A; preserve for an explicit later regression-evidence decision | They have test value but are neither product changes nor necessary Route A closeout content. |
| Untracked `v4-e1-causal-*` and `v4-protocol-characterization*` scripts/tests/declarations | Superseded diagnostic experiments | **DELETE-UNTRACK** only in a separately authorized cleanup | They are absent from HEAD and package entrypoints, self-reference only, and prohibited from execution; their history is already recorded. No deletion occurs now. |
| NowCoder plan and Task23 historical report tracked deltas | Earlier D4 documentation | **SEPARATE-UNRELATED** reconciliation | Do not mix them into the Route A closeout commit without a distinct evidence review. |
| Ignored `.tmp` profiles/databases and `output/playwright` receipts | Local private/runtime evidence, not source control | **KEEP local and untouched; never commit** | They may contain browser/profile state. Cleanup requires a separate explicit authorization and exact-target audit. |

`package.json` still exposes the HEAD-tracked `extension:observe` command. Route
A status forbids using it for D4, but this documentation-only closeout does not
silently remove or alter an executable command. If the user later wants a
mechanical guard against accidental execution, that must be a separate,
explicitly reviewed cleanup/tombstone change.

#### Recommended future commit split (not executed)

- **Commit A — Route A authority:** `AGENTS.md`, the three current status
  documents, and the unchanged generation5 historical JSON evidence.
- **Commit B — tooling cleanup, only after explicit authorization:** restore
  historical tracked observer deltas and delete the superseded untracked
  diagnostic/protocol files; any package-command tombstone is reviewed in
  this separate change.
- The four offline regression-test deltas and the NowCoder/Task23 historical
  documentation remain outside both commits until their own disposition is
  decided.

Route B is mentioned only as a future product direction: a production-owned
identity could someday span action -> submit ingress -> E1 -> E2 -> E3, but it
requires its own plan, threat model, RED/GREEN implementation, privacy review,
new D3 validation/freeze, and new D4. None of that is designed or authorized
here.

Contract-author verdict before review was **`REVIEW REQUIRED / NO COMMIT`**.
The new independent reviewer initially found one HIGH status conflict in
`AGENTS.md`: its stale live-next text could direct the next agent to retry.
That document was brought into the Route A authority/KEEP set and now
explicitly supersedes every prior fresh-observation/action-next instruction.
The reviewer rechecked all twelve required questions, the empty protected
diff, and the dirty-worktree disposition. Final findings are **HIGH: none;
MEDIUM: none**. Final verdict: **`ROUTE_A_CLOSEOUT_APPROVE`**. This approves
the Route A documentation closeout only; it does not authorize cleanup,
commit, live work, or Route B.
