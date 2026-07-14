# Agent Handoff Guide

This repository currently implements a local-first AI coding training prototype. It is on branch `feature/v1-followup`; Phase 0A, 0B1-0B3, 0B4 (BLOCKED), and 0C1-0C2 are implemented, while the active product roadmap still labels the codebase Pre-V0.

`IDEA.md` and `docs/superpowers/plans/2026-07-11-product-development-roadmap.md` define the future V0/V0.5/V1/Public Beta direction. `docs/decisions/0001-local-pilot-to-cloud-saas.md` accepts cloud SaaS as the eventual target but explicitly defers implementation until the Phase 7 gate.

## Current shape

- Next.js App Router application with SQLite persistence through `better-sqlite3`.
- Chrome MV3 extension source lives under `extension/src`; build output is generated under ignored `extension/dist`.
- Paired capture events enter through `POST /api/capture/events`; raw events and deterministic session/attempt projections are written in one transaction with content-sensitive replay safeguards.
- The Chrome extension detects supported problem pages and visible verdict text, including English verdict tokens plus Chinese verdict labels used by NowCoder/Luogu-style UIs. A formal `PLATFORM_ADAPTERS` registry in `extension/src/platforms.ts` declares each platform's readiness as `experimental`, `production`, or `disabled`. Currently all five platforms (LeetCode, NowCoder, Codeforces, AtCoder, Luogu) are `experimental`; no production adapter exists.
- `/training` supports automatic and manual attempts, optimistic corrections, correction history, and logical voiding. Capture identity fields remain immutable.
- `/training`, `/coach`, and `/growth` use active, non-voided attempts by default; Growth labels automatic and manual sources.
- A Luogu DOM fixture corpus lives under `tests/fixtures/luogu/` with an evidence-tier metadata system. The certification gate (`tests/unit/platformCertification.test.ts`) enforces that a platform may be promoted to `production` only when publicly verified verdict DOM exists. Because no public Luogu verdict page is accessible without authentication, the gate remains BLOCKED and the certification artifact (`work/reports/luogu-adapter-certification.json`) records the terminal blocked state.
- E2E database teardown uses `lstatSync`-based safe deletion (handles symlinks, junctions, and broken reparse points). One file-symlink capability test is skipped under EPERM; all mandatory junction tests pass.
- Playwright e2e smoke tests own the local browser QA server lifecycle through `playwright.config.ts`.

## Commands

Use these commands for verification:

```powershell
npm run db:migrate
npm run test
npm run typecheck
npm run e2e
npm run extension:build
npm run build
```

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

- Phase 0C2 completed on 2026-07-14 and is merged at `983e10a`.
- Phase 0B4 (Luogu adapter certification) executed on 2026-07-14 with BLOCKED terminal state. The certification gate confirmed no production adapter exists. The blocker artifact (`work/reports/luogu-adapter-blocker.json`) documents the missing public verdict DOM as the reason.
- Do not re-execute the completed 0A-0C2 and 0B4 atomic plans; they are retained as implementation records.
- Remaining Phase 0 work is Phase 0D engineering gates, including adding the documented lint command. Re-attempt production-adapter certification requires a publicly accessible Luogu page with verdict DOM or a new design decision to accept characterization-only evidence.
