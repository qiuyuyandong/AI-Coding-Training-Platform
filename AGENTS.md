# Agent Handoff Guide

This project is a local-first AI coding training platform. It is currently on branch `feature/v1-followup` with Phase 3.0 Verdict Capture Loop hardening implemented.

## Current shape

- Next.js App Router application with SQLite persistence through `better-sqlite3`.
- Chrome MV3 extension source lives under `extension/src`; build output is generated under ignored `extension/dist`.
- Capture events enter through `POST /api/capture/events`, are stored locally, and are materialized into `training_attempts` with verdict replay/idempotency safeguards.
- The Chrome extension detects supported problem pages and visible verdict text, including English verdict tokens plus Chinese verdict labels used by NowCoder/Luogu-style UIs.
- `/training` shows capture and problem-specific attempt status; `/coach` and `/growth` read local attempts and render deterministic insights.
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

For browser smoke QA, prefer `npm run e2e`. Do not start a separate long-running `npm run dev` or `npm run start` shell unless you are doing manual interactive debugging.

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

## Useful docs

- `README.md` — quick start and user-facing feature overview.
- `COMPLIANCE.md` — privacy and platform-boundary rules.
- `DESIGN.md` — UI style rules for the quiet slate/white command-center interface.
- `docs/architecture.md` — current code/data flow.
- `docs/runbook.md` — setup, QA commands, and troubleshooting.
