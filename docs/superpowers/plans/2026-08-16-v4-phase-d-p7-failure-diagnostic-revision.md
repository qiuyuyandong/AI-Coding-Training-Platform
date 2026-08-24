# V4 Phase D P7 failure diagnostic revision (2026-08-16)

**Status:** `REVISION 2 — AWAITING USER APPROVAL; NO LIVE ACTION AUTHORIZED`

This plan derives from the canonical
`docs/superpowers/plans/2026-08-16-v4-phase-d-d4-platform-specific-acceptance-rescue.md`
(section 20) and supersedes none of it. It authorizes only offline work plus
bounded browse-only diagnostic lanes; it grants no action-time authority and
no P8 closeout authority.

## 1. Authorization source

The user authorized P7 for both lanes on 2026-08-16. Both single-action
authorizations were consumed and both lanes failed closed (canonical plan
section 20). The user then authorized this new plan revision and selected:

1. **Diagnose first, then fix.** The fix package is a separate later
   decision, not part of this authorization.
2. **Bounded event-sequence export is allowed** in diagnostics: only stage
   names, the bounded stage-projection facts (`authorizedActions`,
   `exactSubmitCorroboration`, `stableResultLifecycles`, `e2Confirmed`,
   `e3Finalized`), and event ordering sequence numbers. URLs, identities,
   problem text, verdict text, storage values, timestamps, and database
   paths stay forbidden.
3. **The refresh requirement is accepted** for the LeetCode historical
   result surface, if the diagnosis confirms that root cause.

## 2. Failure facts (bounded evidence)

- **LeetCode** (`merge-two-sorted-lists`, profile
  `p7-leetcode-action-62e5709`): the extension wrote the allowlisted
  `lastCaptureError = verdict_candidate_chronology_mismatch` (confirmed in
  the disposable profile's local extension storage); observer target counts
  `e0/submit/status = 0/0/0`; stage `browse_only`; verdict
  `PROFILE_UNRESOLVED`; database `0/0/0`. Evidence:
  `output/playwright/v4-observation/62e57096c29b-leetcode-p7-leetcode-action-62e5709-real-observation-failed.json`.
- **NowCoder** (approved pilot `acm/contest/18839/1001`, profile
  `p7-nowcoder-action-62e5709`): no product capture error key was written to
  the disposable profile's local extension storage; the observer terminated
  with `observer_stage_rejected` at `browse_only`; verdict
  `OBSERVER_INVALID`; database `0/0/0`. Evidence:
  `output/playwright/v4-observation/62e57096c29b-nowcoder-p7-nowcoder-action-62e5709-real-observation-failed.json`.
- Both disposable profiles contain normal installation/pairing keys and no
  confirmed/tombstone writes. The frozen candidate
  `62e57096c29babe8370c3ad98f6bfe57a1a997f9`, the five dist hashes, the
  profile hash, and the tool hash
  `F0183DC723722ED939400D99782AC40A779A761971F2DFD310B8B964B6D40911` are
  unchanged.

## 3. Hypotheses

- **H1 (shared):** the E0 UI hint is never recorded on the real pages
  (content-script hint creation or session write not firing), so the
  observer's target readiness never arms and any E1/E2 progress is rejected
  or diverted.
- **H2 (LeetCode):** a historical pre-action result surface on the target
  problem triggers the P1 chronology guard
  (`verdict_candidate_chronology_mismatch`) exactly as designed; the
  sanctioned mitigation is refreshing the page once while the extension is
  active so the pre-action stable-ID baseline is seeded before submission.
- **H3 (NowCoder):** the submit/status E1 lifecycles are recorded before
  the E0 hint on the real page (ordering race), which the observer reducer
  rejects at `browse_only`.

## 4. Diagnostic package (offline + browse-only, no action)

### D-A. Bounded stage-sequence instrument

Extend the observation tooling behind the existing opt-in diagnostic
channel. The instrument lives in the runner and the diagnostic module only;
the reviewed observer module
(`scripts/v4-live-observation-observer.mjs`) stays byte-identical. The
combined tool hash remains `sha256(runner + observer + diagnostic)` in that
order and is refrozen after review.

- The diagnostic output file gains a `stageSequence` array. Each entry is a
  closed record `{ seq, stage, authorizedActions, exactSubmitCorroboration,
  stableResultLifecycles, e2Confirmed, e3Finalized }` built exclusively from
  the bounded projections already collected in the runner's `stageHistory`
  (`projectD4AcceptanceEvidence`) plus the final stage projection. `seq` is
  a monotonic integer starting at 1; `stage` is one of the closed reducer
  stage names (`browse_only`, `e1_observed`, `e2_confirmed`, `e3_outbox`,
  `acknowledged`); the array is capped at 64 entries (further entries are
  dropped, the cap itself is recorded). No URL, identity, timestamp, verdict
  text, storage value, or database path enters the file.
- The diagnostic file is written on EVERY lane ending, including the
  successful READY completion of a browse-only lane (new write path in the
  runner's ready branch), the failure paths, and the catch path.
- An opt-in `--diagnostic-refresh-after-ms=<n>` argument (only used for the
  LeetCode lane in this package) makes the runner perform exactly one
  `page.reload()` after `n` milliseconds of initial browse, then continues
  the normal browse check; the stage sequence records both the pre-refresh
  and post-refresh bounded entries.
- The change follows the established chain: RED/GREEN on the diagnostic
  suite (the existing 47 observer tests must stay green), typecheck,
  targeted ESLint, syntax checks, privacy audit
  (`scripts/audit-v4-extension-privacy.mjs`), a focused delta review, and a
  refrozen combined tool hash recorded in this plan before any diagnostic
  lane runs.
- The schemaVersion-3 evidence JSON stays untouched; the diagnostic file
  remains marked `DIAGNOSTIC, NOT A READY RECEIPT, NOT ACCEPTANCE EVIDENCE`.

### D-B. Static chronology confirmation (H2)

Trace the chronology-guard chain with file references and record the
conclusion as `confirmed` / `rejected` / `unsupported`:

- error-string production: `extension/src/contentRuntime.ts`
  (`verdict_candidate_chronology_mismatch` report point),
  `extension/src/verdictCandidateCoordinator.ts` (`chronology_mismatch`
  origin), `extension/src/backgroundOrchestrator.ts` (mapping to the final
  allowlisted error string), `extension/src/submitEpochControl.ts`
  (epoch/baseline guard), and `extension/src/captureErrorPrivacy.ts`
  (allowlist membership);
- the P1 pre-action baseline seeding rule and the canonical plan's recorded
  refresh requirement.

### D-C. Fresh browse-only lanes with the instrument

One fresh fixed profile/database browse-only lane per platform (LeetCode
`merge-two-sorted-lists`; NowCoder approved pilot), NO action mode, using
the frozen candidate/dist hashes and the refrozen tool hash:

- **LeetCode lane:** initial browse; after the diagnostic refresh
  (`--diagnostic-refresh-after-ms`), a second bounded browse segment.
  Observable: does the E0 hint re-establish after the refresh (baseline
  seeding observability) and does `authorizedActions` reach `>= 1` in the
  final browse entry?
- **NowCoder lane:** plain browse without refresh (refresh is
  LeetCode-only; a NowCoder refresh would pollute the H3 ordering
  observation).
- Hypothesis mapping:
  - `final browse entry authorizedActions >= 1` ⇒ H1 rejected for that
    platform;
  - `final browse entry authorizedActions = 0` with a visible submit
    control ⇒ H1 supported for that platform;
  - LeetCode refresh re-establishes `authorizedActions >= 1` after an
    initial `0` ⇒ the baseline-seeding/refresh mitigation is observable and
    H2's mitigation is available; if it stays `0` after refresh, H1 is
    strengthened for LeetCode.
  - H2 itself is adjudicated primarily by D-B (browse-only cannot reproduce
    the chronology error, which requires a verdict candidate); D-C provides
    the indirect seeding-observability corroboration described above.
- **Failure semantics:** a D-C lane failure terminates with its evidence
  retained as-is; there is NO automatic rerun, and any rerun (including one
  after fixing hash drift) requires a new user decision. D-C lanes consume
  no P7 action authority.

### D-D. Decision gate (returns to the user)

After D-A through D-C, present per-hypothesis three-state verdicts
(`confirmed` / `rejected` / `unsupported`), the bounded stage sequences, and
the enumerated fix options with their candidate-invalidation consequences.
No fix, no new candidate, and no new action lane starts without a separate
user decision.

## 5. Fix phase outline (NOT authorized here; decision-shaped only)

- **Runbook-only fix** (candidate stays valid): a documented pre-action
  checklist (refresh once while the extension is active, confirm the E0
  control is visible, submit exactly once) plus a fresh READY and fresh
  single-action authorizations.
- **Observer-contract fix** (candidate stays valid): e.g., accept the
  E0-then-E1 ordering on real pages or track the hint write separately;
  RED/GREEN, privacy, review, tool-hash refreeze, fresh READY lanes.
- **Product fix** (candidate invalidated): change the extension's
  hint/epoch/chronology behavior; RED/GREEN, D3 re-freeze of a NEW
  candidate, exact dist/hash receipt, fresh READY lanes, and new
  single-action authorizations.

## 6. Stop gates

- No real platform action, no click, no submission, no retry in this
  package. Browse-only lanes consume no P7 action authority.
- This plan grants no P8 integrated-closeout authority, no D5, no F1-F4,
  no RC, no release, no push, and no PR authority.
- The frozen candidate and its dist remain untouched unless a later fix
  decision explicitly invalidates them.
- Any profile/tool hash drift fails the affected lane closed with no
  automatic rerun.

## 7. Execution record

### D-A completion (2026-08-16)

RED first produced `3 failed / 13 passed` in the diagnostic suite; GREEN
closed them. The focused delta review returned `APPROVE` with 0 HIGH, 0
MEDIUM, and 0 LOW findings and independently re-ran the verification:
focused `63/63` (observer 47 + diagnostic 16), typecheck, targeted ESLint,
three `node --check`, privacy audit `0 findings`, and
`git diff --stat -- extension/src` empty. The reviewer-approved observer
module stayed byte-identical. Refrozen hashes:

```text
scripts/v4-live-observation.mjs           B0A661E4FB5FF9B8C1924C15451F9CBFE6848442A725AB9604D31FA30EEE9B43
scripts/v4-live-observation-observer.mjs  7DA0A1826E05B178911733786244734966585B3B38F24B8F3AB05D9C774FE2D3 (unchanged)
scripts/v4-live-observation-diagnostic.mjs EBDDA2C9C8EAB556A6D82AF261E3FDF54874C69AA50623DCF2EC96CBF9E8287D
combined observation-tool hash (runner + observer + diagnostic, in order) 0D7B9517B3355E9F895851222EDBEF366CE1563CF50CFC7D7D8EB74347E8B245
```

The browse-only diagnostic lanes may now run with this tool hash.

### D-B + D-C completion (2026-08-16)

D-B static tracing (all references verified):

- `extension/src/contentRuntime.ts:370-372` reports
  `verdict_candidate_chronology_mismatch` when a verdict observation's
  `observedAt` is earlier than the armed submit epoch's `confirmedAt`; the
  candidate is then not emitted.
- `extension/src/verdictCandidateCoordinator.ts:251-253` and `:283-284`
  terminalize legacy candidates with `chronology_mismatch` when a later
  matching submit lifecycle exists or when the candidate predates the
  confirmed record; `extension/src/backgroundOrchestrator.ts:1092-1093`
  maps that to the final allowlisted string; `extension/src/submitEpochControl.ts:254`
  guards the epoch path; `extension/src/captureErrorPrivacy.ts:24` keeps the
  string on the allowlist.
- The canonical plan's P1 section records the refresh requirement for a
  historical surface with an unavailable baseline.

**H2 verdict: CONFIRMED (LeetCode).** The P7 error is exactly the designed
fail-closed chronology guard firing on a pre-action result surface observed
before the fresh submit was confirmed. The accepted mitigation is the
pre-action page refresh (baseline seeding); whether a refresh actually
prevents the guard on the real page can only be proven by a future real
action lane.

D-C bounded browse results (fresh profiles, no action, no login):

- LeetCode (`p7-diag-leetcode-62e5709`, with one refresh): READY=1;
  stageSequence `[browse_only(authorizedActions=0), browse_only(0)]`;
  no rejected batches; DB `0/0/0`.
- NowCoder (`p7-diag-nowcoder-62e5709`, no refresh): READY=1;
  stageSequence `[browse_only(0), browse_only(0)]`; no rejected batches;
  DB `0/0/0`.

**H1 verdict: UNSUPPORTED.** e0 stayed 0 in both fresh-profile browse
lanes, but the fresh profiles are not logged in, so submit-control
visibility cannot be verified from bounded evidence; this neither confirms
nor rejects the hint-write path.

**H3 verdict: UNSUPPORTED by browse, but strongly implied by the P7
NowCoder action failure.** The reducer can only reject at `browse_only`
with `observer_stage_rejected` when an E1 delta arrived while
`targetReady` was false (e0=0); a logged-in browse or a further action
lane would be required to adjudicate.

The failed diagnostic-lane semantics held: both lanes ended normally, no
retry occurred, and no P7 action authority was consumed.

### D-D mechanism finding (2026-08-16)

Logged-in browse lanes (user logged in, 90-second windows): LeetCode
`p7-diag2-leetcode-62e5709` and NowCoder `p7-diag2-nowcoder-62e5709` both
ended READY with `authorizedActions=0` in every stageSequence entry and no
rejected batches.

Static tracing then closed the mechanism:

- `extension/src/content.ts:144-159` creates the E0 hint ONLY on a trusted
  click that `isEligibleUiHint` accepts;
- `extension/src/uiHint.ts:34-53` requires the exact submit control
  (NowCoder: `button.btn-submit` labelled exactly `保存并提交`; LeetCode:
  the exact submit-control matchers from `submissionControl.ts`), visible
  and enabled, plus `isTrusted`.

So browsing never produces E0 by design, and during a real submission the
hint write races the webRequest E1 write: the click-triggered hint message
must travel content-script → background executor → session write, while the
submit POST's E1 lands directly in `transientE1`. When E1 arrives before
the hint, the observer sees `e1>0` with `e0=0` and rejects at
`browse_only` — the exact NowCoder P7 failure shape. The LeetCode P7
failure was the independently confirmed H2 chronology guard (stale
pre-action result panel), with the same click-only hint path explaining
`e0=0` in the failure snapshot.

**Revised verdicts:** H1 rejected (the hint path exists but is
click-triggered only); H3 confirmed by mechanism (E1-before-E0 race on the
click-only path); H2 remains confirmed for LeetCode with the accepted
refresh mitigation.

### Fix design (option 4, product change; presented for user approval)

F1 — visibility-seeded E0: in the content-script watcher/mutation path,
when the exact submit control is visible and enabled, emit the bounded E0
hint (same `ui_hint` schema, same 30-second TTL and max-8 bounds; re-seeded
on watcher ticks so a long pre-submit pause cannot expire back to zero).
Waiting state is NOT created by visibility: waiting still requires
server-confirmed evidence, unchanged. This removes the E1-before-E0 race
for both platforms and seeds LeetCode's pre-action E0.

F2 — keep the trusted-click path unchanged (bounded, no waiting).

The LeetCode H2 refresh requirement stays in the runbook. Consequence:
candidate `62e5709` is invalidated; the chain is RED/GREEN → privacy →
independent review → D3 re-freeze of a NEW candidate → exact dist/five
hashes → fresh READY lanes (both platforms) → new single-action
authorizations (one per lane).

### F1 execution record (2026-08-16, user approved)

- RED: `5 failed / 22 passed` (visibility helper, runtime method, wiring,
  E0-dedup coverage). GREEN closed them.
- The Fake OJ E2E contract required three follow-up corrections, each
  diagnosed from the failing suite: (1) the click must not mint a second
  hint/epoch when the visibility seed already reported the control —
  NowCoder confirmation requires exactly one problem candidate; (2) the
  seed can be dropped while an active characterization isolates ingress, so
  the click always reports and the background dedups identical E0 hints per
  (platform, problem, document, TTL); (3) the LeetCode runtime dedups
  ActionEpoch creation per problem inside the TTL window so seed+click
  never produces two epochs. The submit-epoch control tests were aligned to
  the new invariant.
- Final verification: extension unit `1622/1622`, extension E2E
  `53 passed / 1 known harness skip` (the four affected specs `49/49` +
  skip), typecheck, targeted ESLint, privacy `0 findings`, both contract
  CLIs PASS.

### New candidate freeze (2026-08-16)

The F1 chain invalidates candidate `62e5709`. New commits on
`feature/v1-followup` (parent `d826291`): `b705df5` (seed), `c366de4`
(test-contract alignment), `786a96c` (dedup), `915a98d` (submit-epoch test
alignment). Immutable new candidate commit:
`915a98d0317148d063a3fad0e1888cb7aa74e2da`.

Exact D3 validator:

```text
node scripts/validate-v4-candidate.mjs --candidate 915a98d0317148d063a3fad0e1888cb7aa74e2da
  exit 0 — V4 candidate commit PASS
```

Inside the gate: lint, db:migrate, curriculum validation, root unit
`2505 passed / 1 skipped`, typecheck, app E2E `25/25`, extension unit
`1622/1622`, extension E2E `53 passed / 1 known harness skip`, production
build `20/20`, privacy `0 findings`, readiness PASS, and post-gate identity
replay PASS. Default database metadata preserved (`479232` /
`2026-07-23T15:56:38`).

Exact dist frozen at `.tmp/p7-f1-exact-dist-915a98d`:

```text
manifest.json         A85C3275D559BD46AAA034FEEA9B14EAFECFC6F56341713B2AFB8B024E2B3E64
background.js         AFC7F5A41DD9B267C4C065EB4306929B1CBF50759EB4805E320106CE7C168D24
content.js            E757372F26282D06782B53EF1A994189209D6B07FF3A7B1245BAD6590B3D09E1
popup.js              12B1514A2B5C6D6DEB31E84A8A910C540B815013CF1676C95EAFBC9A25171924
main-world-bridge.js  4D89A80F0351295EE1C0CD173BE107080983868D18510D028854695EACEE3943
```

Candidate receipt: `.tmp/p7-f1-candidate-receipt-915a98d.json`. The
observation tool hash remains `0D7B9517...E8B245` and the acceptance-profile
hash remains `D35892A2...D6069` (unchanged).

Fresh READY lanes (browse-only, no action, new profiles/databases):

- LeetCode: `READY=1`, `ACTION_AUTHORIZED=0`, DB `0/0/0`; evidence
  `output/playwright/v4-observation/915a98d03171-leetcode-p7f1-leetcode-ready-915a98d-ready.json`.
- NowCoder: `READY=1`, `ACTION_AUTHORIZED=0`, DB `0/0/0`; evidence
  `output/playwright/v4-observation/915a98d03171-nowcoder-p7f1-nowcoder-ready-915a98d-ready.json`.

Next: new single-action authorizations (one per lane, naming the platform,
target, and candidate `915a98d0317148d063a3fad0e1888cb7aa74e2da`) require a
separate user decision.

### Superseded execution direction (2026-08-24)

The cross-project capture-chain repair plan
`docs/superpowers/plans/2026-08-23-v4-phase-d-cross-project-capture-chain-reliability-repair.md`
supersedes the action-next wording above. Observer compatibility is frozen at
`9cf7926`; the current immutable product candidate is
`34916705712cac1ef2e5d8816cd8e40fa4e29ca7` with exact candidate PASS. No
single-action authorization exists. The only next live gate is a separately
authorized, sequential new-candidate READY-only run (LeetCode then NowCoder),
with `ACTION_AUTHORIZED=0` and stop on first failure.


