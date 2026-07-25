# V0 Closeout and Editor-Agnostic Product Direction Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> `superpowers:test-driven-development` for validator behavior changes,
> `superpowers:requesting-code-review` before the RC checkpoint, and
> `neat-freak` only after observation, F1–F4, and explicit user acceptance.
> Steps use checkbox (`- [ ]`) syntax for tracking.

**Status:** Blocked by V4 — the reported click-only waiting defect invalidates
`2f4f5d895ea8d965fb64d19dc784ca5514480688` as a current acceptance anchor.
Do not resume formal observation until the V4 replacement-candidate gates pass.

**Goal:** Remove the planned VS Code behavior-footprint collector, retain
editor-agnostic project learning with explicit evidence, repair the V0 release
validators, and close V0 through one frozen implementation commit plus one
accepted-release commit.

**Architecture:** The browser extension remains the OJ capture adapter. Future
project learning accepts only user-initiated, editor-neutral evidence such as a
selected Git diff/code snapshot, explicit build/test result, milestone
reference, and reflection; it never monitors saves, keystrokes, debug actions,
terminal history, or arbitrary workspaces. V0 observations and F1–F4 all refer
to one immutable `implementationSha`; after acceptance, one final commit stores
the reports and reconciled status documents without a self-referential SHA
chain.

**Tech Stack:** Markdown/ADR product documents, Node.js ESM validators, Vitest,
strict TypeScript, Git, PowerShell, Next.js quality gates.

## Global Constraints

- Preserve the V0/V0.5/V1/Public Beta release names and Phase 0–7 capability
  numbering. Do not adopt a new V1.5/V2/V3 roadmap.
- Remove VS Code-specific product capture from all current/future authority
  documents. Historical third-party/package references are out of scope.
- Keep local project practice and explicit engineering evidence, but make every
  input editor-agnostic and user-initiated.
- Do not add a CLI helper, GitHub integration, file watcher, project scanner,
  external AI transfer, cloud sync, or new runtime capture implementation.
- Keep this closeout plan blocked while the separately authorized V4 plans
  change the Chrome MV3 OJ extension.
- Keep the 7-calendar-day owner observation and two 14-calendar-day participant
  observations. Never fabricate time spans or feedback.
- Successful closeout uses two commits: one RC implementation freeze and one
  final accepted V0 release. A blocking runtime fix invalidates the observation
  window and requires a new RC commit.
- Prefix every Git command with `$env:GIT_MASTER='1';`. Do not push or create a
  PR.

## File structure and responsibilities

- `IDEA.md`: canonical product definition; replace VS Code footprint capture
  with editor-neutral project learning and explicit evidence.
- `docs/superpowers/plans/2026-07-11-product-development-roadmap.md`: release
  slices, Phase portfolio, dependency graph, and Public Beta ingestion wording.
- `docs/superpowers/plans/2026-07-11-phase-3-evidence-mastery-review.md`: remove
  browser/VS Code session merge dependency; retain source-neutral evidence.
- `docs/superpowers/plans/2026-07-11-phase-4-practice-projects.md`: rewrite as
  Project Practice and Explicit Engineering Evidence.
- `docs/superpowers/plans/2026-07-11-phase-6-pilot-calibration.md`: make pilot
  packaging and evidence inspection editor-neutral.
- `docs/superpowers/plans/2026-07-13-phase-7-public-beta-cloud.md`: remove VS
  Code device ingestion/distribution; retain authenticated browser and future
  source-neutral explicit evidence ingestion.
- `docs/decisions/0001-local-pilot-to-cloud-saas.md`: reconcile the accepted
  architecture decision with editor-neutral project evidence.
- `README.md`, `AGENTS.md`, `docs/architecture.md`, `COMPLIANCE.md`,
  `docs/superpowers/README.md`, `work/handoff-current.md`: current-state and
  handoff reconciliation.
- `tests/unit/v0ReportValidators.test.ts`: executable two-commit release
  contract; real CLI tests using temporary Git repositories.
- `scripts/validate-v0-exit.mjs`: minimal validator behavior needed by those
  tests.
- `work/reports/v0-engineering-gates.md`: refreshed RC evidence.
- `work/reports/v0-observation-owner.md` and
  `work/reports/v0-observation-participants.md`: real-use reports tied to the RC
  SHA.
- `work/reports/v0-exit-report.md` and
  `work/reports/v0-final-verification.md`: final decision and F1–F4 evidence.

---

### Task 1: Reframe project learning without VS Code monitoring

**Files:** product/phase/ADR/current-state documents listed above; no runtime
source files.

**Produces:** one consistent contract named “Project Practice and Explicit
Engineering Evidence”.

- [x] Search all tracked project-owned documents for `VS Code`, `VSCode`,
  `vscode`, workspace monitoring, terminal history, and editor-event capture.
- [x] Rewrite Phase 4 so its only evidence inputs are explicit task/session
  selection, selected code snapshot or Git diff, explicit build/test result,
  milestone reference, reflection, and delayed/transfer verification.
- [x] Remove VS Code-specific dependencies and distribution/device wording from
  Phases 3, 6, and 7, the roadmap, IDEA, and ADR 0001.
- [x] Reconcile README, architecture, compliance, AGENTS, docs index, and
  handoff. Historical V0 exclusions may say “editor integration” but must not
  preserve VS Code as a future product dependency.
- [x] Verify no project-owned current/future authority document contains a VS
  Code product claim; dependency documentation under `node_modules` is ignored.

### Task 2: Specify the two-commit validator contract with failing tests

**Files:** create `tests/unit/v0ReportValidators.test.ts`; modify no production
validator behavior before RED is observed.

**Interfaces:** tests invoke `node scripts/validate-v0-exit.mjs --mode final`
inside temporary Git repositories. Required inputs are engineering, owner,
participants, exit, final-verification, `implementation-sha`, and optionally
`release-sha` after the final commit.

- [x] Add a valid fixture proving one RC implementation commit plus one final
  evidence/status commit passes.
- [x] Add failing fixtures for owner 6/7-day boundary, participant 13/14-day
  boundary, missing loop/friction/reason fields, one participant, mismatched
  implementation SHAs, non-APPROVE F1–F4, premature accepted docs, accepted-doc
  disagreement, and a forbidden source/schema/test/runtime path after the RC.
- [x] Run `npm run test -- tests/unit/v0ReportValidators.test.ts` and verify the
  suite is discovered but fails because `--mode final` is not implemented.

### Task 3: Implement and verify the two-commit validator

**Files:** modify `scripts/validate-v0-exit.mjs`; adjust observation validator
only if a failing test proves a shared contract defect.

**Produces:** final-mode validation with no `observationRecordSha`,
`releaseRecordSha`, `finalVerificationRecordSha`, or `acceptanceSha` embedded in
reports. All reports instead cite the same `implementationSha`.

- [x] Implement the smallest `final` mode needed to make the valid fixture pass.
- [x] Require engineering PASS, both observation reports PASS, F1–F4 APPROVE,
  exit decision `ACCEPT_V0`, accepted date, canonical accepted status, and V0.5
  as next action.
- [x] Require `release-sha` and verify it is a distinct descendant of the RC,
  equals clean `HEAD`, and has an exact named RC→release allowlist containing
  observation/exit/final-verification evidence plus the current authority docs
  that `neat-freak` may reconcile; reject all other paths.
- [x] Remove obsolete five-SHA candidate/accepted behavior and update CLI help.
- [x] Run the focused suite to GREEN, then run lint and typecheck.

### Task 4: Review, verify, and create the RC implementation commit

**Files:** all Task 1–3 files plus the existing stabilization code/tests and
reports already present in the dirty worktree.

- [x] Classify every dirty/untracked path and exclude databases, generated
  output, `.env*`, `.omo/evidence`, test results, and unrelated user data.
- [x] Run focused stabilization tests, validator tests, and
  `npm run quality:gate`; record actual counts and default-DB metadata-only
  preservation.
- [x] Request an independent code/plan review and resolve every blocking or
  important finding.
- [x] Update the active plan with the verified result. After the RC commit
  exists, regenerate the engineering report against its immutable SHA; include
  that report in the final evidence/status commit to avoid self-reference.
- [x] Stage only the classified RC scope and create the first commit. Record its
  40-character SHA as `implementationSha` in the observation templates.

### Task 5: Complete real owner and participant observations

**Blocked by calendar time and human evidence.** No agent may synthesize this
data.

- [ ] Record at least three effective owner sessions on distinct dates spanning
  at least seven calendar days, including one full
  map → plan → today → completion → next-decision loop.
- [ ] Record P1 and P2 separately, each spanning at least fourteen calendar
  days, with a completed loop, choice-friction answer, reason-comprehension
  answer, and dispositions for every observed failure.
- [ ] Ensure every session/window cites the unchanged `implementationSha`.
- [ ] Run both observation validators successfully. Any blocking runtime fix
  returns to Task 4 and restarts all observation windows.

### Task 6: F1–F4, explicit acceptance, neat-freak, and final release commit

**Files:** observation reports, exit/final-verification reports, canonical
status documents, and any documentation found stale by `neat-freak`; no runtime
source changes.

- [ ] Publish an exit decision only after Task 5 passes.
- [ ] Run F1 plan compliance, F2 code quality/security, F3 hands-on QA, and F4
  scope/docs/evidence fidelity against the same `implementationSha`; all four
  must APPROVE.
- [ ] Present the observation and F1–F4 evidence to the user and obtain explicit
  V0 acceptance.
- [ ] Run `neat-freak`: enumerate root/docs/Markdown/memory, reconcile every
  affected current-state document, update memory only through the authorized
  memory-extension note mechanism, and complete its self-checklist.
- [ ] Stage only the final reports/status/documentation scope and create the
  second commit.
- [ ] Run `validate-v0-exit.mjs --mode final` with both
  `implementationSha` and the final `releaseSha`; it must pass the two-commit
  content, status, SHA, and diff-allowlist contract.

## Completion criterion

V0 is complete only after both commits exist, the real observation durations
pass, F1–F4 all approve the frozen implementation, the user explicitly accepts
V0, `neat-freak` completes, and the final validator passes. Before that point
the project remains in V0 validation and V0.5 implementation must not start.
