# Superpowers Documentation Index

> **Current status (2026-08-16):** The user accepted `ISOLATED` as the
> replacement D4 minimum; P0A alignment and P1 LeetCode offline RED/GREEN are
> complete, and P2 NowCoder non-regression passes without a NowCoder production
> change. The machine contract is `authorized_for_offline_work_only`; P3 is
> next. P1 proves the ActionEpoch/result-root runtime branch offline but does
> not create a live D4 claim. Candidate freeze, live observation, D5/F1-F4,
> RC, release, push, and PR remain unauthorized. Historical Route A facts stay
> authoritative for their own runs but cannot satisfy the new contract. Plans:
> [`plans/2026-08-16-v4-phase-d-d4-platform-specific-acceptance-rescue.md`](plans/2026-08-16-v4-phase-d-d4-platform-specific-acceptance-rescue.md)
> and
> [`plans/2026-08-16-v4-leetcode-d4-readiness-contract-alignment.md`](plans/2026-08-16-v4-leetcode-d4-readiness-contract-alignment.md).
>
> **Historical status (2026-08-09):** **V4 Phase D D1, D2, and D3 candidate engineering
> work is complete** on `feature/v1-followup` (candidate `509faf0e60532cf565a6a57aa796b96bc1053f38`;
> doc-reconciled HEAD `78ac9c73fbfe3359dab0044d82e52cc36abd7b12`; final
> candidate gate `2217/1` unit, `25` app E2E, `1414` extension tests,
> `53/1` extension E2E, production build `20/20`, zero privacy findings,
> readiness `PASS`, default-database preservation). This is not RC,
> acceptance, or release. The **D4 E3 candidate/E2 coordinator repair**
> (Tasks 0-10, implementation `a9515a8`, plan
> [`plans/2026-08-06-v4-phase-d-d4-e3-candidate-coordinator-repair.md`](plans/2026-08-06-v4-phase-d-d4-e3-candidate-coordinator-repair.md))
> is complete but end-to-end delivery is unproven: observations 7 and 8
> proved the E2 confirmation lands after any bounded poll window, and the
> 9th real observation (2026-08-09, merge-two-sorted-lists,
> `cn/741081653`) FAILED with a new root cause — a stale historical
> "Accepted" result panel misclassified as a transition created a candidate
> predating the submit, while the real result's identical "Accepted" text
> was deduped (`contentRuntime.ts` lines 206-211), so the coordinator
> failed closed with no bundle. A RED test for same-problem repeat
> submissions and a written plan revision are required before further code
> changes; a 10th observation is required before D5 F1-F4 authorization.
> The earlier **V4 Phase C
> C0-C5 engineering work is complete** verdict remains authoritative on
> the same branch. C1 LeetCode is network-`V4_EXPERIMENTAL`; C2 AtCoder,
> C3 Codeforces, and C4 Luogu are network-`V4_BLOCKED`; NowCoder remains
> network-`experimental`. C5 proves adapter ownership, namespaced identity,
> durable-state isolation, terminal readiness coverage, and removes the
> reachable V3 click-derived pending fallback. Historical AtCoder DOM
> production certification is unchanged. **Phase C Task C1 LeetCode
> remains `V4_EXPERIMENTAL`** on the same Phase C closeout. Adapter
> `v4-leetcode-network-6` completed the user's same-build LeetCode.cn
> submission `cn/739108591`, final verdict, paired API delivery, and
> disposable SQLite projection. C1's readiness CLI, 2009 runnable unit
> tests, 25 app E2E, 1261 extension tests, 48 runnable extension E2E, and
> production build pass; one Windows capability test and one known
> extension harness case remain explicitly skipped. Authenticated
> evidence caps LeetCode at experimental. Luogu Revision 3 was approved
> and executed; its different-document submit/record observation is
> terminally blocked. Any blocked-platform retry requires a separately
> reviewed browser-owned bridge or platform-protocol change.
>
> **Earlier V4 evidence (still authoritative for their own scope):**
> V4 Phase 0 click-ingress stopgap, Phase A A0-A12, Phase B B0-B7, and
> the B8 missing-E3 layer closed on `c26c578` (Tasks 0-6 of
> `plans/2026-07-29-v4-nowcoder-e3-ingress-repair-and-retest.md`).
> The Phase B B8 terminal BLOCKED verdict from
> `work/reports/v4-nowcoder-phase-b-terminal-closeout-2026-07-28.md`
> is superseded only for the missing-E3 ingress layer; every other
> Phase B outcome remains authoritative. NowCoder remains `experimental`;
> promotion requires a separate reviewed decision. Phase A0-A12 is
> the authoritative V4 framework engineering pass. A
> NowCoder browse-only false positive exposed that V3 can create waiting state
> from a qualifying click without server confirmation. Formal V0 observation,
> replacement-RC work, same-SHA F1–F4, and acceptance are blocked until the V4
> gates are satisfied. Commit `2f4f5d895ea8d965fb64d19dc784ca5514480688`
> remains historical V3 repair evidence, not a current acceptance anchor.
> Phase A A0-A12 is complete. Phase B delivered a safe NowCoder transcript,
> strict experimental adapter, and production-dist full-chain coverage, but
> B8's real result page did not emit E3; NowCoder remains experimental.

The completed repair implementation record is
[`plans/2026-07-21-v0-verdict-gated-capture-repair.md`](plans/2026-07-21-v0-verdict-gated-capture-repair.md).
The completed execution entry is:
[`plans/2026-07-24-v4-network-confirmed-capture-refactor-phase-0-click-ingress-stopgap.md`](plans/2026-07-24-v4-network-confirmed-capture-refactor-phase-0-click-ingress-stopgap.md).
The V0 closeout plan remains blocked:
[`plans/2026-07-18-v0-closeout-observation-final-verification.md`](plans/2026-07-18-v0-closeout-observation-final-verification.md).
The bilingual interface plan is approved future scope and must remain deferred
until V0 is explicitly accepted:
[`plans/2026-07-21-v0-bilingual-user-interface.md`](plans/2026-07-21-v0-bilingual-user-interface.md).
The completed stabilization package is recorded in
[`plans/2026-07-18-v0-stabilization-known-issues.md`](plans/2026-07-18-v0-stabilization-known-issues.md)
with RC evidence at
[`../../work/reports/v0-stabilization-2026-07-18.md`](../../work/reports/v0-stabilization-2026-07-18.md).

This directory contains both active product planning and historical implementation records. Phase numbers were reused during early prototype work, so use this index before executing a plan.

The independently authorized development-tool plan is
[`plans/2026-08-24-development-only-sentry-error-tooling.md`](plans/2026-08-24-development-only-sentry-error-tooling.md).
It permits only opt-in local runtime exception projection and does not change
the Phase D product candidate or authorize production service monitoring.

## Current authority and target hierarchy

1. [`../../IDEA.md`](../../IDEA.md) — product definition, adopted decisions, V0/V0.5/V1/Public Beta scope.
2. [`plans/2026-07-11-product-development-roadmap.md`](plans/2026-07-11-product-development-roadmap.md) — active release/Phase map and exit gates.
3. [`plans/2026-07-24-v4-network-confirmed-capture-refactor-master.md`](plans/2026-07-24-v4-network-confirmed-capture-refactor-master.md) — active V4 phase hierarchy and gates.
4. [`plans/2026-07-24-v4-network-confirmed-capture-refactor-phase-0-click-ingress-stopgap.md`](plans/2026-07-24-v4-network-confirmed-capture-refactor-phase-0-click-ingress-stopgap.md) — completed execution entry; removes click-only waiting before network evidence work. Phase A awaits separate authorization.
5. [`plans/2026-07-18-v0-closeout-observation-final-verification.md`](plans/2026-07-18-v0-closeout-observation-final-verification.md) — blocked V0 observation and closeout checklist.
6. [`plans/2026-07-21-v0-verdict-gated-capture-repair.md`](plans/2026-07-21-v0-verdict-gated-capture-repair.md) — completed historical V3 repair and real-browser validation record.
7. [`plans/2026-07-21-v0-bilingual-user-interface.md`](plans/2026-07-21-v0-bilingual-user-interface.md) — approved but deferred post-V0 implementation plan.
8. [`plans/2026-07-20-v0-domestic-oj-capture-stabilization.md`](plans/2026-07-20-v0-domestic-oj-capture-stabilization.md) — earlier domestic-OJ repair implementation record.

The completed B3 lifecycle record is
[`plans/2026-07-27-v4-phase-b-b3-restart-safe-navigation-witness.md`](plans/2026-07-27-v4-phase-b-b3-restart-safe-navigation-witness.md).
It proves the browse-only witness. The B8 missing-E3 layer is closed at
`c26c578`; the terminal Phase B report remains at
`../../work/reports/v4-nowcoder-phase-b-terminal-closeout-2026-07-28.md`
(superseded only for the missing-E3 layer). NowCoder remains
`experimental`; promotion requires a separate reviewed decision.

Phase C-D is governed by the C0 readiness contract
(`../architecture.md` Phase C-D section; validator suite +
`scripts/validate-v4-adapter-readiness.mjs --all`). The C1 LeetCode
delta plan reaches terminal `V4_EXPERIMENTAL` at
[`plans/2026-07-30-v4-leetcode-network-capture-migration.md`](plans/2026-07-30-v4-leetcode-network-capture-migration.md)
with closeout evidence at
[`../../work/reports/v4-leetcode-c1-closeout-2026-07-30.md`](../../work/reports/v4-leetcode-c1-closeout-2026-07-30.md).
C2's independent AtCoder delta plan closes terminally `V4_BLOCKED`, with
authoritative evidence at
[`../../work/reports/v4-atcoder-c2-blocker-2026-08-02.md`](../../work/reports/v4-atcoder-c2-blocker-2026-08-02.md).
C3's independent Codeforces delta plan also closes terminally `V4_BLOCKED`,
with authoritative evidence at
[`../../work/reports/v4-codeforces-c3-blocker-2026-08-02.md`](../../work/reports/v4-codeforces-c3-blocker-2026-08-02.md).
C4's approved delta plan Revision 3 is
[`plans/2026-08-02-v4-luogu-network-capture-migration.md`](plans/2026-08-02-v4-luogu-network-capture-migration.md)
and closes terminally `V4_BLOCKED`, with evidence at
[`../../work/reports/v4-luogu-c4-blocker-2026-08-02.md`](../../work/reports/v4-luogu-c4-blocker-2026-08-02.md).
C5 closes Phase C isolation/scaffolding work, with evidence at
[`../../work/reports/v4-phase-c-c5-closeout-2026-08-02.md`](../../work/reports/v4-phase-c-c5-closeout-2026-08-02.md).
Phase D D1, D2, and D3 candidate engineering are complete (candidate
`509faf0e60532cf565a6a57aa796b96bc1053f38`; documentation-reconciled HEAD
`78ac9c73fbfe3359dab0044d82e52cc36abd7b12`). D1 evidence:
[`../../work/reports/v4-phase-d-d1-upgrade-reliability-2026-08-03.md`](../../work/reports/v4-phase-d-d1-upgrade-reliability-2026-08-03.md)
and
[`../../work/reports/v4-phase-d-d1-c-disposable-observation-2026-08-03.md`](../../work/reports/v4-phase-d-d1-c-disposable-observation-2026-08-03.md).
D2 evidence:
[`../../work/reports/v4-phase-d-d2-privacy-permission-audit-2026-08-03.md`](../../work/reports/v4-phase-d-d2-privacy-permission-audit-2026-08-03.md).
The standalone Phase D plan is
[`plans/2026-08-03-v4-phase-d-upgrade-restart-update-rollback-reliability.md`](plans/2026-08-03-v4-phase-d-upgrade-restart-update-rollback-reliability.md).
The D4 E3-confirmed race fix (implemented 2026-08-06) is superseded by the
D4 E3 candidate/E2 coordinator repair (Tasks 0-10, `a9515a8`,
[`plans/2026-08-06-v4-phase-d-d4-e3-candidate-coordinator-repair.md`](plans/2026-08-06-v4-phase-d-d4-e3-candidate-coordinator-repair.md)),
which replaced polling/storage-key revival with an exact restart-safe
coordinator. Observations 7 and 8 proved the E2 confirmation lands after any
bounded poll window; the 9th real observation (2026-08-09) FAILED with a new
root cause (stale historical result panel → candidate predating the submit;
real result deduped by identical verdict text), and a RED test plus plan
revision are required before further code changes.
On 2026-08-16 the user accepted `ISOLATED` as the replacement D4 minimum and
P0A C0 alignment completed through
[`plans/2026-08-16-v4-phase-d-d4-platform-specific-acceptance-rescue.md`](plans/2026-08-16-v4-phase-d-d4-platform-specific-acceptance-rescue.md)
and its template-derived
[`plans/2026-08-16-v4-leetcode-d4-readiness-contract-alignment.md`](plans/2026-08-16-v4-leetcode-d4-readiness-contract-alignment.md).
P1-P7 and their F1 repair history remain evidence for their own candidates.
The active repair entry is now
[`plans/2026-08-23-v4-phase-d-cross-project-capture-chain-reliability-repair.md`](plans/2026-08-23-v4-phase-d-cross-project-capture-chain-reliability-repair.md):
observer compatibility is frozen at `9cf7926`, and the repaired immutable
product candidate is `34916705712cac1ef2e5d8816cd8e40fa4e29ca7` with exact
D3 PASS, exact dist, receipt and preserved default database. Old-candidate
LeetCode and NowCoder READY-only lanes passed without action; new-candidate
READY-only remains separately gated. Development-only Sentry exception tooling
is governed independently by ADR 0003 and the
[`2026-08-24 plan`](plans/2026-08-24-development-only-sentry-error-tooling.md);
it does not amend the frozen extension candidate. D4, D5, real actions, formal
V0 observation, RC, release and V0.5 remain stopped. The total product target
is **Phase 7 / Public Beta hosted SaaS**.

## Completed Phase 0 records

Phase 0 is complete and accepted. These plans are evidence, not active work:

- [`plans/2026-07-11-phase-0a-e2e-data-safety.md`](plans/2026-07-11-phase-0a-e2e-data-safety.md)
- [`plans/2026-07-14-phase-0b1-capture-session-protocol.md`](plans/2026-07-14-phase-0b1-capture-session-protocol.md)
- [`plans/2026-07-14-phase-0b2-spa-queue-reliability.md`](plans/2026-07-14-phase-0b2-spa-queue-reliability.md)
- [`plans/2026-07-14-phase-0b3-localhost-credential.md`](plans/2026-07-14-phase-0b3-localhost-credential.md)
- [`plans/2026-07-14-phase-0b4-luogu-adapter-certification.md`](plans/2026-07-14-phase-0b4-luogu-adapter-certification.md) — BLOCKED (no public verdict DOM); Luogu remains experimental as a historical record
- [`plans/2026-07-14-phase-0c1-query-analytics-canonical-url.md`](plans/2026-07-14-phase-0c1-query-analytics-canonical-url.md)
- [`plans/2026-07-14-phase-0c2-manual-attempt-corrections.md`](plans/2026-07-14-phase-0c2-manual-attempt-corrections.md)
- [`plans/2026-07-15-phase-0d-engineering-quality-gates.md`](plans/2026-07-15-phase-0d-engineering-quality-gates.md) — Completed and fully verified on 2026-07-15; evidence: [`../../work/reports/phase-0d-engineering-gates.md`](../../work/reports/phase-0d-engineering-gates.md)
- [`plans/2026-07-16-phase-0-atcoder-production-certification.md`](plans/2026-07-16-phase-0-atcoder-production-certification.md) — T1–T8 complete; AtCoder sole production adapter; evidence: [`../../work/reports/phase-0-atcoder-certification.md`](../../work/reports/phase-0-atcoder-certification.md)
- [`plans/2026-07-11-phase-0-reliability-baseline.md`](plans/2026-07-11-phase-0-reliability-baseline.md) — aggregate Phase 0 record

Luogu's Phase 0B4 terminal BLOCKED result is historical adapter evidence; it
does not reopen or block Phase 0 because AtCoder satisfied the production
adapter gate.

## Capability portfolio status

These documents describe broader capability outcomes. They are not the current
line-by-line execution plan:

- [`plans/2026-07-11-phase-1-curriculum-resource-catalog.md`](plans/2026-07-11-phase-1-curriculum-resource-catalog.md) — V0 thin slice implemented; broader catalog pending.
- [`plans/2026-07-11-phase-2-goals-diagnosis-planning.md`](plans/2026-07-11-phase-2-goals-diagnosis-planning.md) — V0 thin slice implemented; broader planning modes pending.
- [`plans/2026-07-11-phase-3-evidence-mastery-review.md`](plans/2026-07-11-phase-3-evidence-mastery-review.md) — minimal V0 ability slice implemented; connected evidence and review pending.
- [`plans/2026-07-11-phase-4-practice-projects.md`](plans/2026-07-11-phase-4-practice-projects.md) — future editor-agnostic project practice and explicit engineering evidence; not started.
- [`plans/2026-07-11-phase-5-byok-ai-coach.md`](plans/2026-07-11-phase-5-byok-ai-coach.md) — V0 reflection experiment implemented; full provider/BYOK/quota layer pending.
- [`plans/2026-07-11-phase-6-pilot-calibration.md`](plans/2026-07-11-phase-6-pilot-calibration.md) — V0 observation pending; formal V1 pilot not started.
- [`plans/2026-07-13-phase-7-public-beta-cloud.md`](plans/2026-07-13-phase-7-public-beta-cloud.md) — total product target; entry gate not met.

Before implementing a future capability package, write a new atomic delta plan
against the then-current repository.

## Historical records

The following files describe earlier prototype milestones and are retained for design/implementation history. They do not override the active roadmap:

- `specs/2026-07-05-*`
- `specs/2026-07-06-*`
- `plans/2026-07-05-*`
- `plans/2026-07-06-*`

In particular, historical “Phase 2.x” and “Phase 3.0” labels refer to the verdict-capture prototype, not active roadmap Phase 2 (planning) or Phase 3 (evidence/ability/review).

## Current-state documentation

For claims about what exists and how it runs, use:

- [`../../README.md`](../../README.md)
- [`../architecture.md`](../architecture.md)
- [`../runbook.md`](../runbook.md)
- [`../../COMPLIANCE.md`](../../COMPLIANCE.md)

When a Phase changes implementation, update these current-state documents in the same work package.
