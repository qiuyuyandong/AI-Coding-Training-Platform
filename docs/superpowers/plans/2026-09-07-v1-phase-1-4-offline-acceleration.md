# V1 Phase 1-4 Offline Acceleration Plan

**Status:** offline implementation complete on 2026-09-07; browser, real-OJ,
pilot, release and cloud validation remain outside this plan.

**Goal:** Complete the code-only work that connects the existing curriculum and
daily-plan slices to replayable evidence, review scheduling, and explicit
project practice. Real Chrome, OJ, READY-only, release, push, and cloud work are
outside this plan.

## Existing foundation to reuse

- Phase 1: versioned curriculum package, stable node/task IDs, resources, map.
- Phase 2: local learner, diagnosis, immutable daily plans, one primary task.
- Phase 3 V0 slice: attempt mappings, ability snapshots/transitions and replay.
- Phase 0/V4: trustworthy capture identities and append-only attempts.

These are extended in place. No second graph, task, attempt, or learner identity
is introduced.

## Stage A - Phase 3 evidence and review

1. Add the append-only learning-evidence, session-summary, snapshot-reference,
   review-item, learner-assessment, and misconception tables.
2. Add strict domain contracts and thin repositories.
3. Add one deterministic five-outcome classifier and one bounded review
   scheduler.
4. Add a transactional service that replays one attempt into evidence,
   summary, and at most one open review item.
5. Add fixture-only focused tests; do not contact an OJ or external model.

## Stage B - Phase 4 explicit project practice

1. Extend the shared practice-task kind contract for implementation, debugging,
   variant, review, and project milestones.
2. Add project template/session/run-result/artifact/milestone/rubric tables and
   strict domain contracts.
3. Add explicit evidence intake with size, type, secret, and path validation.
4. Add a minimal `/projects` surface and APIs for start, evidence, milestones,
   correction, and deletion.
5. Feed project facts into the Phase 3 evidence service without mutating ability
   directly.

## Stage C - Product integration and reconciliation

1. Merge due review into deterministic planning while preserving one primary
   task and at most three alternatives.
2. Surface outcome, evidence, uncertainty, review, correction, and deletion in
   Training, Today, Coach, Growth, and Projects where the data exists.
3. Reconcile the Phase 1-4 plans, roadmap, architecture, runbook, compliance,
   README, and handoff with actual implementation evidence.
4. Run offline migrations, focused tests, lint, typecheck, build, and the safe
   quality gate. Browser lanes that launch Chrome remain explicitly skipped.

## Stop line

Stop only when a remaining requirement cannot be implemented meaningfully
without a real browser/OJ observation, a real external AI provider, pilot-user
input, or a cloud architecture decision. Record those as validation or later
phase gaps rather than simulating proof.

## Implementation record

- Stage A delivered migrations `0010` and `0013`, append-only evidence,
  five-outcome classification, E1-E4 coverage, L1-L5 evidence projection,
  one-step downward correction, staleness, bounded reviews, self-assessment and
  dispute records, an Evidence page, and review integration with daily plans.
- Stage B delivered migrations `0011` and `0012`, the shared practice kinds,
  a six-milestone C++ task-tracker template, explicit run/test corrections,
  bounded artifacts, full/basic/minimal capture, local snapshot retention,
  deletion/export, 0-3 rubric gates, session replacement, milestone
  progression, and project-to-ability replay.
- Stage C added Resources, Evidence and Projects routes, five daily modes,
  Training/Coach/Growth evidence summaries, and retained one primary daily
  task while merging one highest-priority due review.

Offline validation passed: lint; disposable migrations; curriculum validation
(`12` nodes, `13` edges, `12` reviewed resources, `12` mappings, `9` careers);
TypeScript; production build with `22` pages; the full Vitest suite
(`120` files, `2623` passed, `1` pre-existing Windows symlink capability skip);
and `6` additional focused review-scheduler cases added afterward.
No Playwright, Chrome, extension E2E, READY-only lane, OJ page, click, submission
or external model was run. Those remain runtime evidence gaps rather than code
implementation gaps.
