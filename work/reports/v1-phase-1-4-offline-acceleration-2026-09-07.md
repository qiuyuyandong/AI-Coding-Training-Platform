# V1 Phase 1-4 Offline Acceleration Report

## Result

The code-only Phase 1-4 acceleration is implemented in the working tree. It
extends the existing curriculum, learner, plan, attempt and ability identities;
it does not create a parallel learning model.

- Phase 1: `/resources` exposes the installed reviewed catalog with access,
  cost, language, license boundary and stopping guidance.
- Phase 2: daily plans accept learn/review/practice/build/recover modes. Due
  review merges into at most one slot and preserves one primary task.
- Phase 3: migrations `0010` and `0013` add append-only facts, E1-E4 summaries,
  snapshot references, reviews, assessments and evidence-cited transitions.
  The deterministic projector makes L3-L5 reachable through independent,
  delayed/variant and unfamiliar-project evidence while discounting same-task
  short repeats. Replaying one unchanged evidence set cannot advance again.
- Phase 4: migrations `0011` and `0012` add shared project task kinds, one
  six-milestone C++ task-tracker template, explicit/correctable run results,
  selected artifacts, local content-addressed full snapshots, metadata-only
  basic/minimal modes, deletion/export, milestone history, rubric assessment,
  session replacement and automatic next-milestone creation.

The user-visible routes are `/resources`, `/evidence`, `/projects`, plus
evidence summaries in `/training`, `/coach` and `/growth` and five modes in
`/today`.

## Trust and privacy behavior

The project path never scans an editor, repository, workspace or terminal. It
accepts only learner-entered result facts and explicitly pasted artifacts.
Artifact intake rejects parent/absolute paths, `.env` and key files,
unsupported extensions, content over 64 KiB and secret-like values. Export
omits retained bytes and local absolute paths. Self-ratings and disputes are
pending context and cannot set ability directly.

## Validation evidence

All commands ran without a real browser or OJ:

- `npm run lint`: PASS.
- disposable `npm run db:migrate`: PASS through migration `0013`.
- `npm run curriculum:validate`: PASS, 12 nodes / 13 edges / 12 resources /
  12 practice mappings / 9 careers.
- `npm run typecheck`: PASS.
- `npm run test`: PASS, 120 test files, 2623 tests passed, 1 pre-existing
  Windows file-symlink capability test skipped under EPERM. A subsequently
  added 6-case review-scheduler file also passes independently.
- disposable `npm run build`: PASS, 22 pages generated and all new API/page
  routes compiled.

Focused evidence added for all five training outcomes, due-review selection,
self-assessment isolation, L3-L5 progression, same-task repeat discount,
staleness without level loss, consecutive-failure one-step reduction,
unchanged replay idempotency, project correction, six-stage progression,
rubric threshold, session replacement, snapshot storage/deletion and database
upgrade prefixes.

## Deliberately unproven

No Playwright, Chrome, extension E2E, READY-only lane, OJ page, click,
submission, real compiler/workspace project, external AI provider or pilot user
was used. The implementation is therefore code-complete for this offline plan,
but its browser UX, real toolchain workflow, heuristic calibration and release
acceptance remain unproven. Phase 1 also retains the current 12-resource corpus;
broader editorial expansion remains content work.

## Git state at report time

Branch `feature/v1-followup`, HEAD `90aec3c`. The branch was already 33 commits
ahead of `origin/feature/v1-followup`. This acceleration is uncommitted. The
working tree also contains pre-existing unrelated documentation edits and two
untracked Route H reports. Nothing was pushed and no PR was created.
