# Phase 0D Engineering Gates Report

## Scope

Phase 0D closes the engineering-quality-gates package. It introduces an explicit strict lint gate, an every-prefix migration upgrade matrix, extension test/build/dist parity, one disposable aggregate quality gate that runs locally and on Windows CI, and the documentation that points every reader at the same safe command. Phase 0 itself remains BLOCKED on production-adapter certification; only Phase 0D's engineering-gates package is closed.

## Git Baseline

- Branch: `feature/v1-followup`
- Tip commit before Task 1: `7526ead` (`docs: align Phase 0 planning status`)
- Working tree at Task 5 takeover: `docs/superpowers/plans/2026-07-11-product-development-roadmap.md` marked `M` (line-ending-only normalized diff); `docs/superpowers/plans/2026-07-15-phase-0d-engineering-quality-gates.md` untracked; `.tmp/playwright` absent; default `training-platform.sqlite` present with `Length: 73728` and `LastWriteTimeUtc: 2026-07-13T17:49:36.9126118Z`.
- Phase 0D implementation commit history (Tasks 1-4):
  - `b3c1993` `chore: add strict lint gate` (Task 1 baseline)
  - `d3a201f` `fix: preserve attempt edits during polling` (Task 1 lint correction)
  - `e7c14b5` `test: tighten polling regression harness` (Task 1 lint correction)
  - `dca2236` `test: cover migration upgrade matrix` (Task 2)
  - `59a6ecc` `test: add extension parity gate` (Task 3)
  - `970a9bf` `ci: mirror Phase 0 quality gates` (Task 4 aggregate gate + Windows workflow)
  - `7cb6169` `fix: make quality gate cleanup link-safe` (Task 4 post-commit correction)

## Lint Gate

- Command: `npm run lint` → `eslint . --max-warnings=0`
- Configuration: `eslint.config.mjs` with `FlatCompat` over `next/core-web-vitals` and `next/typescript`; ignores `.next/**`, `.superpowers/**`, `.tmp/**`, `.worktrees/**`, `extension/dist/**`, `node_modules/**`, `test-results/**`.
- Acceptance: PASS with zero warnings; no disable comments, no ignored source paths, no downgraded rules, no Next.js lint disable.
- Evidence: strict lint gate installed by commit `b3c1993`; small fixes shipped in `d3a201f` and `e7c14b5` to keep `npm run lint` clean.

## Migration Matrix

- Coverage: fresh apply, idempotent replay, rollback on failure, and an every-prefix upgrade test that copies the first N repository migrations into a temp directory, applies them with `applyMigrations`, then re-applies against the full repository set.
- File: `tests/unit/migrations.test.ts`. Helpers added: `repositoryMigrationNames`, `copyMigrationPrefix`, `appliedMigrationIds`.
- Acceptance: PASS with six migration tests in the Task 2 scope — fresh/idempotent, every-prefix upgrade, rollback, V1 cutover, credential preservation, manual-correction preservation.
- Evidence: shipped in commit `dca2236` (`test: cover migration upgrade matrix`).

## Unit and Type Gates

- `npm run test`: 28 files, 235 tests passed, 1 explicit EPERM skip. The skip is the Windows file-symlink capability probe in `tests/unit/e2eDatabase.test.ts`; all mandatory junction tests pass.
- `npm run typecheck`: PASS (`tsc --noEmit` clean under strict TypeScript 5.8).
- Forbidden patterns audit: zero `any`, `as any`, `as unknown`, `@ts-ignore`, `@ts-expect-error`, non-null assertions, or `eslint-disable` introduced by Phase 0D.
- Evidence: Task 1 re-ran both adjacent gates after the lint fixes; Task 3 re-ran both before adding the extension parity check; Task 4 aggregate gate re-ran both as part of the lint → db:migrate → test → typecheck → e2e → extension:check → build chain.

## E2E Gate

- `npm run e2e`: 16 tests passed.
- Lifecycle: Playwright owns the server through `playwright.config.ts`, deletes and recreates `.tmp/playwright`, applies every repository migration, runs serially, then removes `.tmp/playwright` in global teardown.
- Database: `.tmp/playwright/training-platform.sqlite` is owned by Playwright exclusively. E2E teardown uses an `lstatSync`-based safe walker that handles symlinks, junctions, and broken reparse points without following their targets. A process already listening on port 3000 is treated as an error.
- Acceptance: 16 tests passed; `.tmp/playwright` absent after teardown.

## Extension Gate

- `npm run extension:check` chains `npm run typecheck` → `npm run extension:test` → `npm run extension:build` → `node scripts/check-extension-dist.mjs`.
- `npm run extension:test` runs `vitest run --config vitest.extension.config.ts`. Focused include list: `tests/unit/extension*.test.ts`, `tests/unit/luoguFixtureLoader.test.ts`, `tests/unit/platformCertification.test.ts`. Result: 11 files, 110 tests passed.
- `npm run extension:build` runs `node extension/build.mjs` and regenerates `background.js`, `background.js.map`, `content.js`, `content.js.map`, `manifest.json`, `popup.html`, `popup.js`, `popup.js.map` under `extension/dist`.
- `scripts/check-extension-dist.mjs` verifies every required output exists, that `manifest.json` (1078 bytes) and `popup.html` (1874 bytes) byte-match their sources, and that `git check-ignore extension/dist/content.js` exits 0.
- Acceptance: PASS; `git check-ignore -v extension/dist/content.js` resolves to `.gitignore:12:dist/` confirming `extension/dist/` stays ignored and unstaged.

## Production Build

- `npm run build` → `next build`.
- Result: PASS with successful compilation and 16/16 generated static pages.

## Default Database Preservation

- `TRAINING_DB_PATH` is set to a fresh OS-temporary path under `os.tmpdir()` by `scripts/quality-gate.mjs` for every subcommand; the runner never opens, hashes, or migrates the default `training-platform.sqlite`.
- Pre-run metadata (Task 4 Step 1, metadata-only `Get-Item`):
  - `Length`: 73728
  - `LastWriteTimeUtc`: `2026-07-13T17:49:36.9126118Z`
- Post-run metadata after `npm run quality:gate` (Task 4 Step 4):
  - `Length`: 73728
  - `LastWriteTimeUtc`: `2026-07-13T17:49:36.9126118Z`
- Equality: byte-equal (`Length` identical, `LastWriteTimeUtc` identical). The default database was never opened or hashed; only its directory entry was inspected.
- Cleanup verification: `.tmp/playwright` absent after E2E; all `ai-training-quality-gate-*` OS-temporary directories absent after the aggregate gate.

## Remaining Phase 0 Blocker

Phase 0 itself is not complete. No adapter is certified `production`. The Phase 0B4 Luogu certification gate returned BLOCKED because no fixture qualifies as `evidenceTier="verified-public-dom"`. The blocker artifact is `work/reports/luogu-adapter-blocker.json`. Re-attempting production-adapter certification requires a publicly accessible OJ page with verdict DOM or a new design decision that explicitly accepts characterization-only evidence. Phase 0D's `PASS` verdict below is strictly limited to the engineering-gates package; it does not close Phase 0.

## Verdict

**PASS** — limited to Phase 0D engineering gates only. Phase 0 remains BLOCKED on production-adapter certification.