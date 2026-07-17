请注意，将一切plan写入docs\superpowers\plans，将其作为plan的唯一入口。
如果其他机制有执行或写入plan的需要，则将该机制的plan mklink到superpowers\plans。（如.omo的plan）

# Agent Handoff Guide

This repository currently implements a local-first AI coding training prototype. It is on branch `feature/v1-followup`; Phase 0A, 0B1-0B3, 0B4 (BLOCKED), 0C1-0C2, 0D, and the Phase 0 AtCoder production certification (T1–T8) are implemented. Phase 0 is complete and reconciled green on 2026-07-17; AtCoder is the sole certified production adapter. The active product roadmap still labels the codebase Pre-V0.

`IDEA.md` and `docs/superpowers/plans/2026-07-11-product-development-roadmap.md` define the future V0/V0.5/V1/Public Beta direction. `docs/decisions/0001-local-pilot-to-cloud-saas.md` accepts cloud SaaS as the eventual target but explicitly defers implementation until the Phase 7 gate.

## Current shape

- Next.js App Router application with SQLite persistence through `better-sqlite3`.
- Chrome MV3 extension source lives under `extension/src`; build output is generated under ignored `extension/dist`.
- Paired capture events enter through `POST /api/capture/events`; raw events and deterministic session/attempt projections are written in one transaction with content-sensitive replay safeguards.
- The Chrome extension detects supported problem pages and visible verdict text, including English verdict tokens plus Chinese verdict labels used by NowCoder/Luogu-style UIs. A formal `PLATFORM_ADAPTERS` registry in `extension/src/platforms.ts` declares each platform's readiness as `experimental`, `production`, or `disabled`. AtCoder is `production` (certified 2026-07-17); LeetCode, NowCoder, Codeforces, and Luogu remain `experimental`.
- `/training` supports automatic and manual attempts, optimistic corrections, correction history, and logical voiding. Capture identity fields remain immutable.
- `/training`, `/coach`, and `/growth` use active, non-voided attempts by default; Growth labels automatic and manual sources.
- A Luogu DOM fixture corpus lives under `tests/fixtures/luogu/` with an evidence-tier metadata system. The certification gate (`tests/unit/platformCertification.test.ts`) enforces that a platform may be promoted to `production` only when publicly verified verdict DOM exists. Because no public Luogu verdict page is accessible without authentication, the gate remains BLOCKED and the certification artifact (`work/reports/luogu-adapter-certification.json`) records the terminal blocked state.
- E2E database teardown uses `lstatSync`-based safe deletion (handles symlinks, junctions, and broken reparse points). One file-symlink capability test is skipped under EPERM; all mandatory junction tests pass.
- Playwright e2e smoke tests own the local browser QA server lifecycle through `playwright.config.ts`.

## Commands

Use these commands for verification:

```powershell
npm run lint
npm run db:migrate
npm run test
npm run typecheck
npm run e2e
npm run extension:check
npm run build
npm run quality:gate
```

`npm run lint` runs the strict ESLint flat config. `npm run extension:check` chains typecheck, focused extension tests, the MV3 build, and the `extension/dist` parity/ignore check. `npm run quality:gate` runs the seven commands above in this exact order under an OS-temporary database and is the safe single verification.

For browser smoke QA, Playwright owns the server lifecycle; do not start a separate long-running server. Its prepare/teardown flow creates and removes `.tmp/playwright/training-platform.sqlite` and refuses to reuse a server on port 3000. For other migration or build checks, set `TRAINING_DB_PATH` to a disposable path when the default database must remain untouched.

## Git discipline

- Do not commit unless the user explicitly asks or the active handoff task already includes committing.
- When running git commands in this repository, prefix the command with `$env:GIT_MASTER='1';`.
- Never push or create PRs unless explicitly requested.

## Type and implementation rules

- Keep TypeScript strict. Do not use `any`, `as any`, `as unknown`, `@ts-ignore`, `@ts-expect-error`, or non-null assertions.
- Keep Coach and Growth logic in pure service modules under `lib/services/**`; pages should call services and render their outputs.
- Keep pages that read SQLite as server components and close database handles in `finally` blocks.
- Keep polling panels as small client components using `useEffect`, `useState`, `fetch(..., { cache: "no-store" })`, and a 5-second interval.

## Local-first boundaries

- Do not read cookies, session tokens, hidden platform data, localStorage tokens, passwords, or full commercial problem statements.
- Do not add external LLM, analytics, sync, or third-party API calls for attempts, verdicts, code, reflections, or capture data without a new explicit design decision.
- Capture and analysis remain local-only by default.

These are current implementation boundaries, not a permanent rejection of the approved cloud target. Future implementation must follow the active Phase plan and ADR; do not introduce cloud/AI behavior merely because it appears in the product vision.

## Useful docs

- `README.md` — quick start and user-facing feature overview.
- `COMPLIANCE.md` — privacy and platform-boundary rules.
- `DESIGN.md` — UI style rules for the quiet slate/white command-center interface.
- `docs/architecture.md` — current code/data flow.
- `docs/runbook.md` — setup, QA commands, and troubleshooting.

## Current handoff

- Phase 0D engineering gates executed on 2026-07-15 and completed/verified. Authoritative commit chronology:
  - Task 1 (strict lint gate and polling corrections): `b3c1993`, `d3a201f`, `e7c14b5`.
  - Task 2 (migration upgrade matrix): `dca2236`.
  - Task 3 (extension test/build/dist parity): `59a6ecc`.
  - Task 4 (aggregate quality gate, Windows CI, and link-safe cleanup correction): `970a9bf`, `7cb6169`.
  - Task 5 (operational docs/status reconciliation and unit-count correction): `cd66285`, `7394e22`.
  - Task 6 (independent final verification evidence): `1e3c950`.
  - Post-review evidence corrections: `71c6287`, `45b19a6`, `0ce73fb`. The authoritative Task 4 and Task 6 database-preservation checks used metadata-only `Get-Item`; a later final review-work QA lane mistakenly invoked `Get-FileHash` once, discarded the hash, made no write, and confirmed the same `Length` and `LastWriteTimeUtc`.
  Phase 0D plan: `docs/superpowers/plans/2026-07-15-phase-0d-engineering-quality-gates.md`. Evidence: `work/reports/phase-0d-engineering-gates.md`. Current Commander state: `work/handoff-current.md`.
- Phase 0C2 completed on 2026-07-14 and is merged at `983e10a`.
- Phase 0B4 (Luogu adapter certification) executed on 2026-07-14 with BLOCKED terminal state. The Luogu certification gate confirmed no production adapter existed at that time. The blocker artifact (`work/reports/luogu-adapter-blocker.json`) documents the missing public verdict DOM as the reason. Re-attempting Luogu production-adapter certification requires a publicly accessible Luogu page with verdict DOM or a new design decision to accept characterization-only evidence.
- Phase 0 AtCoder production certification (T1–T8) executed on 2026-07-16 to 2026-07-17 and completed. AtCoder is the sole production adapter. Phase 0 is green. Phase 1 / V0 implementation has not started; the next action is writing/approving a V0 vertical-slice plan. Do not re-execute the completed 0A-0C2, 0B4, and AtCoder T1–T8 plans; they are retained as implementation records. Do not start Phase 1 until a new V0 plan is written and approved.
