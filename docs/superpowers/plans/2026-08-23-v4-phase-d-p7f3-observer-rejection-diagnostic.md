# V4 Phase D P7F3 observer rejection diagnostic (2026-08-23)

**Status:** `P7F4 LEETCODE BROWSE LANE FAILED CLOSED WITH ROOT CODE; NOWCODER NOT RUN; USER DECISION REQUIRED — NO LIVE ACTION AUTHORIZED`

**Authorization source:** On 2026-08-23 the user instructed the agent to
execute this plan. That approval covers the offline diagnostic sequence and
the two READY-only browse lanes defined here. It does not authorize a click or
submission.

## 1. Why another action lane must not start yet

Candidate `915a98d0317148d063a3fad0e1888cb7aa74e2da` remains the immutable
product candidate. Its exact dist and receipt remain
`.tmp/p7-f1-exact-dist-915a98d` and
`.tmp/p7-f1-candidate-receipt-915a98d.json`.

The working tree contains a harness-only observer amendment. Its current
combined tool hash is
`0CC38395B9027CCBA0B90C35CE15AC0D83EB6AEA66E578FE86A4CB9BCD04893F`.
The focused offline gate passes (`48/48`, typecheck, targeted ESLint, syntax,
privacy `0 findings`, and D4 profile validation), but this same tool hash has
already produced the terminal LeetCode artifact
`output/playwright/v4-observation/915a98d03171-leetcode-p7f3-leetcode-action-915a98d-real-observation-failed.json`:
`OBSERVER_INVALID / observer_stage_rejected`, final stage `browse_only`,
database `0/0/0`.

Two earlier LeetCode action artifacts (`p7f1` and `p7f2`) failed with the
same closed reason under earlier tool hashes. These action-lane identities
must be treated as consumed. Repeating a submission now would create another
unadjudicable sample, violate the no-silent-retry rule, and would not certify
either platform. The current NowCoder evidence reaches READY only; it does
not repair or supersede the LeetCode blocker.

## 2. Objective

Identify the exact bounded observer transition rejected after LeetCode READY,
without reading or exporting raw platform/browser data and without performing
a real submission. Then run one new browse-only diagnostic lane per active
platform to prove the refrozen diagnostic tool is stable before returning to
the user for a separate action-time decision.

This plan does not change the candidate, product runtime, adapter behavior,
permissions, schema, API, database projection, or D4 acceptance profile.

## 3. Diagnostic contract

The diagnostic may retain only:

- closed stage names and monotonic sequence numbers;
- bounded counts already allowed by `projectD4AcceptanceEvidence`;
- a closed rejection-transition code describing which count/cardinality
  invariant rejected the transition;
- pre/post tool, profile, candidate-receipt, and five dist hashes;
- database counts only.

It must not retain URL/query values, submission identity, timestamps, verdict
text, DOM text, source code, problem statements, response bodies, headers,
cookies, credentials, account data, browser-storage values, or database paths.
Unknown or malformed diagnostic input remains terminal.

## 4. Execution sequence

1. **Evidence reconciliation.** Record `p7f1`, `p7f2`, and `p7f3` as terminal
   LeetCode action-lane failures. Preserve their profiles, databases, and
   artifacts; do not reopen, reset, delete, or reuse them. Confirm the current
   leftover P7F3 database remains `0/0/0` before any cleanup decision.
2. **RED.** Add focused tests that reproduce the still-unclassified
   post-READY `observer_stage_rejected` shapes using bounded synthetic
   projections: coalesced E0/status, repeated status identity, status
   replacement, E0+submit+status in one callback, and status change after E0.
   At least one test must fail against the current observer bytes.
3. **Diagnostic GREEN only.** Extend the diagnostic projection to emit one
   closed rejection-transition code. Do not relax acceptance semantics or
   make a rejected transition pass until the bounded evidence identifies a
   product-safe rule and the user separately approves it.
4. **Offline gates.** Run focused observer/diagnostic tests, typecheck,
   targeted ESLint, `node --check` for all three observation-tool files,
   privacy audit, both contract validators, and candidate-isolation diff.
   Obtain an independent tool/privacy review before refreezing the combined
   tool hash.
5. **Two browse-only channel checks.** With fresh profile IDs and fresh
   zero-row databases, run LeetCode `merge-two-sorted-lists` once and NowCoder
   `acm/contest/18839/1001` once in READY-only mode. Use
   `--authorize-action` nowhere. Stop the sequence on the first failure; do
   not retry. Preserve one bounded diagnostic artifact and one schema-v3
   evidence artifact per completed lane.
6. **Decision return.** Report the exact rejection classification and both
   browse-only outcomes. A later real LeetCode submission and a later real
   NowCoder submission each require a fresh, explicit single-action
   authorization naming platform, target, and candidate.

## 5. Stop gates

- No click, submit, replay, profile reuse, profile deletion, database reset,
  or real platform action is authorized by this draft.
- No production fix, candidate refreeze, D4 closeout, P8, D5, F1-F4, RC,
  release, push, or PR is authorized.
- Any candidate/dist/profile/tool hash drift stops the affected lane.
- Any first diagnostic or browse-lane failure stops the sequence; there is no
  automatic rerun.
- Existing user-owned working-tree changes are preserved and are not treated
  as approved merely because their focused tests pass.

## 6. User decision requested

Approve or reject this diagnostic-only sequence. Approval authorizes the
offline diagnostic work and exactly two fresh **browse-only** channel checks;
it does not authorize either real submission.

## 7. Offline execution record (2026-08-23)

The user approved this plan and explicitly requested Sentry and Ponytail
plugin use. Sentry read-only API access was unavailable because the local
environment has no `SENTRY_AUTH_TOKEN`, `SENTRY_ORG`, or `SENTRY_PROJECT`;
the repository also has no Sentry SDK integration. No token was requested in
chat and no external telemetry dependency was added. Ponytail full mode and
its dedicated review pass returned `Lean already. Ship.`: the implementation
adds no dependency or logging framework and reuses the existing reducer and
diagnostic writer.

RED was retained before implementation:

```text
npm exec vitest run tests/unit/v4LiveObservationObserver.test.ts tests/unit/v4LiveObservationStorageKeyDiagnostic.test.ts
  exit 1 — 2 failed / 64 passed
```

Both failures proved the same missing contract: the reducer returned only
`observer_stage_rejected`, and the runner had no diagnostic-only root code.
GREEN adds an opt-in `diagnosticCode` at the shared rejection source and one
schema-version-2 diagnostic-only `stageRejection` record. Normal reducer
results and schema-version-3 acceptance evidence remain byte-shape compatible.
The code identifies every stage-rejection branch with a static code, including
`e0_coalesced_with_submit`, `leetcode_status_cardinality_exceeded`, and
`snapshot_before_arm`; it exports no identity, URL, timestamp, or storage
value.

Final offline gates:

- focused observer + diagnostic: `66/66` PASS;
- typecheck and targeted ESLint: PASS;
- all three observation-tool `node --check` commands: PASS;
- extension privacy audit: `0 findings`;
- D4 acceptance profiles and adapter readiness validators: PASS;
- candidate-isolation production diff from `915a98d...`: empty;
- `git diff --check`: PASS (Windows line-ending warnings only).

Frozen combined observation-tool hash (runner + observer + diagnostic, in
that order):
`9E3880AC0DA84A737D14DFC2C96B8C2ADCA73739B954B7B17932854A1E89E8CB`.
Acceptance-profile hash remains
`D35892A2FADDB8B8F4313684E96C261F6C256A3E9FEE79D34C5DB531678D6069`.
Candidate SHA, receipt, exact dist, and all five dist hashes remain unchanged.

## 8. P7F4 browse-lane result and root cause (2026-08-23)

The stale P7F3 Next.js server was verified as workspace-owned and stopped.
Its preserved database had already been confirmed at `0/0/0`; no consumed
profile or database was reopened, reset, deleted, or reused.

The first planned browse-only lane used:

- platform/target: LeetCode `merge-two-sorted-lists`;
- profile: `p7f4-leetcode-diagnostic-915a98d` (fresh);
- database: adjacent fresh disposable SQLite, baseline `0/0/0`;
- candidate: `915a98d0317148d063a3fad0e1888cb7aa74e2da`;
- frozen tool hash: `9E3880AC...E89E8CB`;
- action authority: absent (`--authorize-action` was not supplied);
- one accepted LeetCode diagnostic refresh.

The lane failed closed before READY. The schema-version-2 diagnostic records:

```text
stage: browse_only
authorizedActions: 0
stageRejection.code: e0_cardinality_exceeded
terminalReason: observer_stage_rejected
```

The schema-version-3 evidence records `OBSERVER_INVALID / UNRESOLVED`, final
stage `browse_only`, unchanged candidate/profile/tool/dist hashes, and database
`0/0/0`. No click, submission, E2, delivery, or database write occurred.

Evidence:

- `output/playwright/v4-observation/p7f4-leetcode-diagnostic-915a98d-storage-key-diagnostic.json`;
- `output/playwright/v4-observation/915a98d03171-leetcode-p7f4-leetcode-diagnostic-915a98d-real-observation-failed.json`.

The stop gate fired on the first failed lane. The NowCoder P7F4 browse lane
was **not run** and no fresh NowCoder profile/database was created.

### Root-cause chain

The diagnostic code proves that the target projection observed more than one
LeetCode E0. Static source tracing closes why:

1. `extension/src/backgroundOrchestrator.ts::handleE0Recorded` deliberately
   deduplicates only per `(platform, problem, sourceDocumentId)`;
2. `extension/src/uiHint.ts` retains valid hints for 30 seconds (maximum 8);
3. the accepted refresh creates a new browser document, so the old-document
   and new-document hints legitimately overlap inside that TTL;
4. `scripts/v4-live-observation-observer.mjs::projectTargetSession` counts all
   target hints across documents, while the reducer rejects target `e0 > 1`.

The failure is therefore an observer/product scope mismatch across a refresh,
not an extension capture failure. No raw document ID or storage value was read
or exported to reach this conclusion.

### Decision options

1. **Observer-only projection fix (recommended; candidate remains valid).**
   Validate every target hint exactly as today, but project the target E0 as
   bounded presence (`0 | 1`) rather than cross-document cardinality. The
   production writer already proves same-document dedup. Required chain:
   focused RED/GREEN for two-document refresh plus same-document duplicate
   fail-closed coverage, privacy, Ponytail/tool review, tool-hash refreeze, and
   two new browse-only lanes.
2. **Product cross-document replacement (candidate invalidated).** Replace the
   older same-platform/problem hint when a new document reports visibility.
   This requires a new product decision, multi-tab semantics, full extension
   regression, D3 candidate refreeze, and new lanes.
3. **Remove the refresh (not recommended).** This avoids the immediate browse
   failure but abandons the accepted stale-result baseline mitigation and does
   not make a later action lane trustworthy.

No option is authorized by this completed diagnostic run. The next operation
requires a new explicit user decision.

## 9. Supersession note (2026-08-23)

The user subsequently approved the observer-only bounded-presence option as
part of
`docs/superpowers/plans/2026-08-23-v4-phase-d-cross-project-capture-chain-reliability-repair.md`.
Its offline RED/GREEN and freeze gate are complete: focused tests are `68/68`,
privacy is `0 findings`, the product-candidate isolation diff is empty, and the
new combined observation-tool hash is
`40FB0E40FFDD949F96C287B60AEC52C482B4BE6D9F620297CCBD2FCBDCB775A9`.
No new READY-only lane or real action has been authorized or run. The master
cross-project repair plan is now the only current execution entrypoint.
