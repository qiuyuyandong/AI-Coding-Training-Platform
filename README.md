# AI Coding Training Platform

V1 is a unified OJ entry and local training memory system.

It provides:

- unified problem metadata search;
- deep links to original OJ problem pages;
- a Chrome extension that detects user-visible training events;
- local capture APIs;
- local attempts, Coach, and Growth pages.

V1 does not mirror LeetCode, NowCoder, Luogu, or similar full problem statements by default.

## Project Docs

- `docs/architecture.md` explains the current app, extension, API, SQLite, and Coach/Growth flow.
- `docs/runbook.md` contains setup, verification, and troubleshooting steps.
- `DESIGN.md` defines the quiet slate/white UI system used by app pages and panels.
- `COMPLIANCE.md` documents local-first privacy and platform-boundary rules.

## Commands

```powershell
npm install
npm run dev
npm run typecheck
npm run test
npm run e2e
npm run extension:build
npm run build
```

`npm run e2e` uses Playwright `webServer` to start and stop the local Next.js server automatically. Do not start a separate long-running `npm run dev` or `npm run start` shell for this smoke QA path.

## Browser Extension

Build the Chrome MV3 extension:

```powershell
npm run extension:build
```

Load `extension/dist` as an unpacked extension in Chrome. Keep the local app running at `http://localhost:3000` so the extension can post capture events to `/api/capture/events`.

## Training Records Loop

Phase 2.2 turns captured browser events into local training attempts:

- `/training?platform=leetcode&externalId=two-sum` opens the original problem and shows capture plus attempt status;
- `/api/capture/events` stores extension events and materializes the matching local attempt;
- `/api/attempts/recent` returns recent attempts for the training workspace;
- `/coach` and `/growth` read the same local attempts to show empty-state or rule-based feedback.

Run migrations before exercising the loop:

```powershell
npm run db:migrate
npm run dev
```

## Coach and Growth Insights

Phase 2.3 keeps coaching local and deterministic:

- `/coach` reads recent local attempts and renders summary, evidence-backed signals, and next-step recommendations;
- `/growth` renders local result distribution, completion/pass rates, and recent activity;
- insights are computed from SQLite attempts only, with no external model or network call.
