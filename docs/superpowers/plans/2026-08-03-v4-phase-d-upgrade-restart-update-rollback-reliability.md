# V4 Phase D Upgrade, Restart, Update, and Rollback Reliability Plan

**Status:** `APPROVED`

**Date:** 2026-08-03

**Authority:** This is the sole detailed Phase D D1-D5 plan. The parent V4
master plan and the Phase C-D orchestration plan may summarize Phase D and link
here, but they must not contain a second detailed D1-D5 specification.

**Implementation state:** Phase D implementation is authorized only within this
plan's dependency order and stated boundaries. D1 may begin after the recorded
independent approval below; D2 and D3 remain gated by their explicit
completion and review requirements.

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

### 6.2 D4/D5 evidence-only status commit

A D4/D5 status commit is a later, separately authorized commit containing only
evidence reports, validator inputs, and status/documentation reconciliation
permitted by D4/D5. It is not a new implementation candidate and cannot change
runtime behavior.

An evidence-only status commit must not modify:

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

## 10. Task D4 - Same-SHA Real Observations

**Dependencies:** D3 immutable implementation candidate SHA and explicit user
authorization for each real platform action.

### 10.1 Platform scope

Real natural submissions are permitted only for the existing active V4 network
policies:

- LeetCode: current `experimental` policy and its characterized host scope.
- NowCoder: current `experimental` policy and its characterized host scope.

AtCoder, Codeforces, and Luogu remain `V4_BLOCKED`. D4 must not retry their
natural submissions. D4 may only validate that their registry/readiness records,
blocker references, and fail-closed behavior have not drifted. Historical
AtCoder DOM production certification is not re-certified by D4.

### 10.2 Required evidence

For each allowed active policy, the report must contain:

- browse-only negative flow;
- a fresh natural submission performed by the authorized user;
- E1 observation with waiting unchanged;
- E2 confirmation with waiting incremented once;
- matching E3 finalization exactly once;
- ACK, outbox, and quarantine outcome;
- local Training result and SQLite counts;
- every unmatched, ambiguous, false-positive, false-negative, or platform
  failure;
- actual browser, extension, and localhost conditions;
- the exact implementation SHA that built the loaded artifact;
- hashes of every loaded dist file, at minimum `manifest.json`,
  `background.js`, `content.js`, `popup.js`, and `main-world-bridge.js` when
  present.

Every D4 report must record the actual build source, not a planned SHA or the
current branch name. The SHA and hashes must be checked before the first
submission and repeated in the report's final evidence block.

### 10.3 Invalidation rule

Any modification to runtime source, `extension/manifest.json`, permissions,
SQLite migrations/schema, `extension/build.mjs`, any build script, adapter
protocol, or the production artifact invalidates all D4 observations made on
the prior candidate SHA. The process returns to D3 with a new authorized
candidate. Reports must never be edited to bridge different SHAs.

A documentation-only D4/D5 status commit may record evidence after the
observation. It must not modify the implementation candidate or its artifact.

### 10.4 Completion

D4 completes only when required LeetCode/NowCoder observations pass on the
same immutable candidate SHA and all blocked-platform status checks pass. A
user-dependent observation remains pending until it actually happens. No
synthetic participant, date, submission, or browser result is valid evidence.

## 11. Task D5 - Same-SHA F1-F4 and Explicit Acceptance

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

All four lanes must independently `APPROVE`. Then present the complete
evidence to the user and request explicit acceptance. Acceptance is not public
release.

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
- D4 active-policy observations pass on that exact SHA and all blocked statuses
  remain unchanged and honestly fail closed;
- D5 F1-F4 all approve the same SHA;
- any later commit is evidence-only and contains no implementation or artifact
  mutation;
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
- The real-observation scope excludes blocked-platform retries and does not
  claim Web Store/CRX/enterprise update support.
- Automated PASS, real observation PASS, reviewer approval, user acceptance,
  RC, and release remain separate labels.

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
