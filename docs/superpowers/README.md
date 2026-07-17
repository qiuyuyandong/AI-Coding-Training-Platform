# Superpowers Documentation Index

> **Status (2026-07-18):** **V0 exit candidate; F1-F4 final verification and user acceptance pending.** Engineering gates PASS at implementationSha `d6c0f14aafb663c8746ad5e30d968508d539ec07`; observationRecordSha `5a0e0a0f12a0fcf24683564fb5146087a9c59c9f`. See `work/reports/v0-exit-report.md` for the full SHA chain, decision and limitations. V0 is not declared complete or accepted until F1-F4 all APPROVE and the user explicitly accepts the V0 verification.

This directory contains both active product planning and historical implementation records. Phase numbers were reused during early prototype work, so use this index before executing a plan.

## Active product authority

1. [`../../IDEA.md`](../../IDEA.md) — product definition, adopted decisions, V0/V0.5/V1/Public Beta scope.
2. [`plans/2026-07-11-product-development-roadmap.md`](plans/2026-07-11-product-development-roadmap.md) — active release/Phase map and exit gates.
3. Phase 0 implementation records completed through AtCoder certification:
   - [`plans/2026-07-11-phase-0a-e2e-data-safety.md`](plans/2026-07-11-phase-0a-e2e-data-safety.md)
   - [`plans/2026-07-14-phase-0b1-capture-session-protocol.md`](plans/2026-07-14-phase-0b1-capture-session-protocol.md)
   - [`plans/2026-07-14-phase-0b2-spa-queue-reliability.md`](plans/2026-07-14-phase-0b2-spa-queue-reliability.md)
   - [`plans/2026-07-14-phase-0b3-localhost-credential.md`](plans/2026-07-14-phase-0b3-localhost-credential.md)
   - [`plans/2026-07-14-phase-0b4-luogu-adapter-certification.md`](plans/2026-07-14-phase-0b4-luogu-adapter-certification.md) — BLOCKED (no public verdict DOM); Luogu remains experimental as a historical record
   - [`plans/2026-07-14-phase-0c1-query-analytics-canonical-url.md`](plans/2026-07-14-phase-0c1-query-analytics-canonical-url.md)
   - [`plans/2026-07-14-phase-0c2-manual-attempt-corrections.md`](plans/2026-07-14-phase-0c2-manual-attempt-corrections.md)
   - [`plans/2026-07-15-phase-0d-engineering-quality-gates.md`](plans/2026-07-15-phase-0d-engineering-quality-gates.md) — Completed and fully verified on 2026-07-15; evidence: [`../../work/reports/phase-0d-engineering-gates.md`](../../work/reports/phase-0d-engineering-gates.md)
   - [`plans/2026-07-16-phase-0-atcoder-production-certification.md`](plans/2026-07-16-phase-0-atcoder-production-certification.md) — T1–T8 complete; AtCoder sole production adapter; evidence: [`../../work/reports/phase-0-atcoder-certification.md`](../../work/reports/phase-0-atcoder-certification.md)
4. Active remaining and future capability plans:
   - [`plans/2026-07-11-phase-0-reliability-baseline.md`](plans/2026-07-11-phase-0-reliability-baseline.md) — Phase 0 complete on 2026-07-17; AtCoder is the sole production adapter. Luogu BLOCKED record retained as historical evidence.
   - [`plans/2026-07-11-phase-1-curriculum-resource-catalog.md`](plans/2026-07-11-phase-1-curriculum-resource-catalog.md)
   - [`plans/2026-07-11-phase-2-goals-diagnosis-planning.md`](plans/2026-07-11-phase-2-goals-diagnosis-planning.md)
   - [`plans/2026-07-11-phase-3-evidence-mastery-review.md`](plans/2026-07-11-phase-3-evidence-mastery-review.md)
   - [`plans/2026-07-11-phase-4-practice-projects.md`](plans/2026-07-11-phase-4-practice-projects.md)
   - [`plans/2026-07-11-phase-5-byok-ai-coach.md`](plans/2026-07-11-phase-5-byok-ai-coach.md)
   - [`plans/2026-07-11-phase-6-pilot-calibration.md`](plans/2026-07-11-phase-6-pilot-calibration.md)
   - [`plans/2026-07-13-phase-7-public-beta-cloud.md`](plans/2026-07-13-phase-7-public-beta-cloud.md)

Phase 0A through 0C2, Phase 0D, Phase 0B4 (BLOCKED), and Phase 0 AtCoder production certification (T1–T8) are implemented and retained as execution records. Phase 0 is complete and green on 2026-07-17. Before implementing another capability package, write a new atomic plan against the then-current repository rather than treating a completed plan or delivery overview as line-by-line instructions.

## Historical records

The following files describe earlier prototype milestones and are retained for design/implementation history. They do not override the active roadmap:

- `specs/2026-07-05-*`
- `specs/2026-07-06-*`
- `plans/2026-07-05-*`
- `plans/2026-07-06-*`

In particular, historical “Phase 2.x” and “Phase 3.0” labels refer to the verdict-capture prototype, not active roadmap Phase 2 (planning) or Phase 3 (evidence/ability/review).

## Current-state documentation

The product plan is intentionally ahead of the code. For claims about what exists and how it runs, use:

- [`../../README.md`](../../README.md)
- [`../architecture.md`](../architecture.md)
- [`../runbook.md`](../runbook.md)
- [`../../COMPLIANCE.md`](../../COMPLIANCE.md)

When a Phase changes implementation, update these current-state documents in the same work package.
