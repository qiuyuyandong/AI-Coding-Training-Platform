# V4 Phase D D1 RED Provenance Audit - 2026-08-03

## Verdict

`EXCEPTION APPROVED - D1-U PROVENANCE ACCEPTED`

The retained logs do not satisfy the RED-first contract in sections 7.1 and
7.8 of the approved Phase D plan. One product failure has valid retained
pre-fix RED evidence. The remaining current production changes have GREEN
coverage but do not have a retained pre-fix RED transcript that can be mapped
to each change. Post-fix reruns, assertion defects, fixture defects, diagnostic
script failures, and browser/harness flakes are not being relabelled as RED.

The retained-log audit itself did not approve an exception. After reviewing
this exact classification, the user explicitly approved the narrow exception
defined below on 2026-08-03. D1-U may therefore be accepted with the recorded
exception. D1-C, D1 phase completion, D2, and D3 remain open or gated.

## Audited Baseline

- Branch: `feature/v1-followup`.
- HEAD: `e09f795eeb8168b79c7f18ad3418fa78320fdefa`.
- Evidence subject: the uncommitted D1 working tree based on that HEAD.
- Sources inspected: the D1 plan, D1 report, current Git diff, and retained
  `.tmp/phase-d*.log` / `.tmp/phase-d1*.log` transcripts.
- No reconstructed run was accepted as pre-fix evidence because the current
  working tree already contains the fixes.

## Valid Product RED

| Retained transcript | Product failure | Mapped production correction | Later GREEN |
|---|---|---|---|
| `.tmp/phase-d-d1-disable-enable-diagnostic.log` | Worker initialization failed while rehydrating retained malformed quarantine: `background: Cannot read properties of undefined (reading 'platform')`. A malformed durable value could prevent `GET_CAPTURE_STATE` from settling. | Strict outbox/quarantine parsing in `extension/src/attemptStorage.ts` and fail-closed malformed-record projection in `extension/src/backgroundOrchestrator.ts`. | `.tmp/phase-d-d1-extension-e2e-after-review-fix.log` records the full extension E2E lane passing; the final focused evidence is `.tmp/phase-d-d1-focused-final-exact-dist-7.log`, `5/5 passed`. |

This RED proves the narrow worker-rehydration crash and its fail-closed
correction. It does not prove every later malformed-record preservation,
popup-action, collision, timestamp, outbox-drain, or cache behavior.

## Rejected RED Candidates

| Transcript | Classification | Reason |
|---|---|---|
| `.tmp/phase-d-d1-focused-after-review-fixes-2.log` | Diagnostic-tool failure | `TypeError: Cannot convert undefined or null to object` came from the temporary diagnostic path and did not identify a product contract violation. |
| `.tmp/phase-d1-malformed-outbox-structured-details.log` | Fixture defect | The test expected two outbox records but retained the default valid quarantine fixture. Retry legally moved that valid item to outbox in addition to the valid and malformed outbox records, producing three. The GREEN correction explicitly seeds `captureQuarantine: []`; no production correction is proven by this failure. |
| `.tmp/phase-d1-collision-strict-final.log` | Assertion defect | The collision state already contained the valid and malformed entries; the failure was the expected object shape, not deletion of the wrong record. `.tmp/phase-d1-collision-strict-final-2.log` is GREEN after the assertion correction. |
| `.tmp/phase-d-d1-focused-final-exact-dist-4.log` | Fixture/identity defect | The expected seed identity omitted the canonical `bundle_` prefix. The product preserved the canonical bundle identity. |
| `.tmp/phase-d1-background-orchestrator-alarm-retry.log` | Unit harness timing defect | The test did not drain enough initialization microtasks after the persistence/cache handoff. The correction increased the bounded test pump; it did not change production alarm behavior. |
| Early `phase-d-d1-extension-*` and `phase-d-d1-quality-gate-*` failures containing closed browser/context, service-worker wait timeout, destroyed execution context, or page crash | Browser/harness flake | These failures do not establish a durable-state, identity, migration, pause, or delivery contract violation and later pass without a mapped product correction. |
| `.tmp/phase-d-d1-focused-after-orchestrator-fix.log` and the subsequent disable/enable state diagnostics | Fixture/policy expectation after the valid crash fix | After worker recovery was fixed, remaining differences were caused by invalid seed identities and by the test expecting retry policy to preserve the pre-action outbox/quarantine shape. They are not independent product RED evidence. |

## Production Changes Without Retained Pre-Fix RED

The following current production behaviors are covered by GREEN tests but do
not have retained valid pre-fix RED evidence:

1. `extension/src/background.ts`: non-user ingress is gated by
   `captureEnabled`, and the cached snapshot is invalidated when that setting
   changes.
2. `extension/src/backgroundPersistence.ts` and
   `extension/src/background.ts`: persistence completes before the snapshot is
   cached, and a persistence rejection clears the cache.
3. `extension/src/backgroundOrchestrator.ts`: authoritative local/session
   writes occur before explicit legacy cleanup through the production
   persistence boundary.
4. `extension/build.mjs`: the bounded `V4_BUILD_VARIANT=d1-replacement`
   same-source build identifier used by update-like tests.
5. `extension/src/attemptStorage.ts`, `extension/src/outboxDrain.ts`, and
   `extension/src/backgroundOrchestrator.ts`: semantic validation beyond the
   proven rehydration crash, including identity equality, nonnegative attempts,
   canonical timestamps, malformed outbox preservation, and malformed values
   surviving ordinary drain/retry operations.
6. `extension/src/popup.ts`, `extension/src/background.ts`, and
   `extension/src/backgroundOrchestrator.ts`: diagnostics-only malformed
   rendering and collision-safe malformed deletion targeting. The scope was
   user-authorized, but scope authorization is not a RED-provenance exception.

## Recorded Decision

On 2026-08-03 the user approved a narrow provenance exception for exactly the
six enumerated groups above. The approved exception states that:

- it applies only to this uncommitted D1 working tree and the listed changes;
- those changes retain their existing GREEN, exact-dist, and quality-gate
  requirements;
- it does not convert fixture, assertion, diagnostic, or harness failures into
  product RED;
- it is not a reusable exception for D2, D3, D4, or future work; and
- it does not authorize D1-C, D2, D3, commit, push, RC, acceptance, or release.

The decision accepts the missing historical provenance; it does not fabricate
or retroactively create RED evidence. With the retained GREEN evidence, D1-U
is accepted under this one-time exception. D1-C remains separately gated, so
the resulting state is
`D1 ENGINEERING GATE PASS WITH APPROVED D1-U PROVENANCE EXCEPTION; D1-C PENDING; D1 PHASE INCOMPLETE`.

**Later disposition:** This sentence records the state immediately after the
D1-U decision. D1-C subsequently passed and the independent final D1 review
returned `APPROVE`; the current phase verdict is `D1 PHASE COMPLETE` in
`work/reports/v4-phase-d-d1-upgrade-reliability-2026-08-03.md`.
