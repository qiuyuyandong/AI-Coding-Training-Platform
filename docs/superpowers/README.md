# Superpowers Documentation Index

> **Status (2026-07-28):** **V4 Phase 0 click-ingress stopgap, Phase A
> A0-A12, and Phase B B0-B7 are complete; B8 is terminally BLOCKED.** A
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
It proves the browse-only witness. The terminal Phase B result is recorded in
`../../work/reports/v4-nowcoder-phase-b-terminal-closeout-2026-07-28.md`.

Phase C is not authorized by the Phase B BLOCKED result. Formal V0 observation
remains blocked; V0.5 stays out of scope.
The total product target is **Phase 7 / Public Beta hosted SaaS**.

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
