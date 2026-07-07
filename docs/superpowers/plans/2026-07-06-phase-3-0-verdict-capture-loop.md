# Phase 3.0 Verdict Capture Loop Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the browser extension emit real verdict events so local attempts move from draft to passed/failed/partial/stuck and Coach/Growth become usable with real training data.

**Architecture:** Keep capture detection in `extension/src/platforms.ts` as pure platform logic and keep `extension/src/content.ts` as the browser wiring layer. Keep server materialization unchanged except for richer verdict classification at the capture boundary.

**Tech Stack:** TypeScript, Chrome MV3 content scripts/background service worker, Zod, Next.js API routes, SQLite via `better-sqlite3`, Vitest, Playwright.

---

### Task 1: Verdict classification

**Files:**
- Modify: `lib/capture/events.ts`
- Modify: `tests/unit/captureEvents.test.ts`

- [x] Add failing tests proving accepted verdicts pass, wrong-answer/compile verdicts fail, runtime/time/memory/partial verdicts become `partial`, and explicit payload `result` overrides text classification.
- [x] Implement a pure classifier in `submissionEventToAttemptUpdate` with no type assertions and no `any`.
- [x] Run `npm run test -- tests/unit/captureEvents.test.ts` and expect all capture event tests to pass.

### Task 2: Platform DOM verdict detection

**Files:**
- Modify: `extension/src/platforms.ts`
- Modify: `tests/unit/extensionPlatforms.test.ts`

- [x] Add failing jsdom tests for LeetCode, Codeforces, AtCoder, NowCoder, and Luogu visible verdict text detection.
- [x] Export `detectVerdictFromDocument(platform, document)` returning `{ verdict } | null`.
- [x] Run `npm run test -- tests/unit/extensionPlatforms.test.ts` and expect platform tests to pass.

### Task 3: Content-script event loop

**Files:**
- Modify: `extension/src/content.ts`
- Modify: `extension/manifest.json`

- [x] Wire initial `PAGE_DETECTED`, a lightweight `MutationObserver` verdict watcher, a submit-click `SUBMISSION_DETECTED` signal, and a `pagehide` `TRAINING_ENDED` signal.
- [x] Use `crypto.randomUUID()` with a Math.random fallback for event IDs.
- [x] Broaden LeetCode manifest matches to problem description/submission paths while preserving current supported hosts.
- [x] Run `npm run extension:build` and expect content/background/popup bundles to emit.

### Task 4: Materialization regression

**Files:**
- Modify: `tests/unit/captureMaterializer.test.ts`
- Modify only if needed: `lib/services/captureMaterializer.ts`

- [x] Add a regression proving partial verdict events update an open draft to `partial`.
- [x] Run `npm run test -- tests/unit/captureMaterializer.test.ts` and expect materializer tests to pass.

### Task 5: Full verification and readiness reassessment

**Files:**
- No source edits expected.

- [x] Run `npm run db:migrate`.
- [x] Run `npm run test`.
- [x] Run `npm run typecheck`.
- [x] Run `npm run e2e`.
- [x] Run `npm run extension:build`.
- [x] Run `npm run build`.
- [x] Report whether the product is now realistically usable and list remaining blockers.

---

## Self-review

- Spec coverage: The plan covers verdict classification, DOM detection, content-script emission, materializer regression, and full verification.
- Placeholder scan: No TBD/TODO placeholders remain.
- Type consistency: `CaptureEvent.payload.verdict`, optional `payload.result`, and existing `AttemptResult` values are the only server-side contract additions.

## Completion note

Completed on 2026-07-07. Full verification passed: `npm run db:migrate`, `npm run test`, `npm run typecheck`, `npm run e2e`, `npm run extension:build`, and `npm run build`.
