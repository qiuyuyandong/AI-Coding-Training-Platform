# Superpowers Documentation Index

> **Status (2026-07-18):** **V0 validation.** Phase 0 is complete; the V0
> functional slice and stabilization fixes are implemented and pass the full
> worktree quality gate. V0 is not complete because real-use observations,
> same-SHA F1–F4 verification, and explicit user acceptance are pending.

The only active execution plan is
[`plans/2026-07-18-v0-closeout-observation-final-verification.md`](plans/2026-07-18-v0-closeout-observation-final-verification.md).
The completed stabilization package is recorded in
[`plans/2026-07-18-v0-stabilization-known-issues.md`](plans/2026-07-18-v0-stabilization-known-issues.md)
with worktree evidence at
[`../../work/reports/v0-stabilization-2026-07-18.md`](../../work/reports/v0-stabilization-2026-07-18.md).

This directory contains both active product planning and historical implementation records. Phase numbers were reused during early prototype work, so use this index before executing a plan.

## Current authority and target hierarchy

1. [`../../IDEA.md`](../../IDEA.md) — product definition, adopted decisions, V0/V0.5/V1/Public Beta scope.
2. [`plans/2026-07-11-product-development-roadmap.md`](plans/2026-07-11-product-development-roadmap.md) — active release/Phase map and exit gates.
3. [`plans/2026-07-18-v0-closeout-observation-final-verification.md`](plans/2026-07-18-v0-closeout-observation-final-verification.md) — the only active execution checklist.

Immediate target: accepted V0. Next target: V0.5 connected OJ/basic evidence.
Then: V1 integrated local pilot. Total product target: **Phase 7 / Public Beta
hosted SaaS**.

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
