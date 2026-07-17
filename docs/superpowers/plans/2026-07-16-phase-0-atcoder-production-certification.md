# Phase 0 AtCoder Production Certification - Work Plan

## TL;DR (For humans)

### What you'll get

- One truthfully certified production OJ adapter: **AtCoder**.
- Real, public, logged-out AtCoder DOM fixtures for AC, WA, and TLE verdicts, with provenance and strict sanitization.
- Correct problem identity on both AtCoder task URLs and public submission URLs, including direct-open submission pages.
- AtCoder verdict parsing limited to `#judge-status`, eliminating the current broad `td`/`body` false-positive surface.
- Platform-scoped certification artifacts that certify AtCoder without rewriting the historical Luogu BLOCKED record.
- A fresh full quality-gate result and reconciled Phase 0 documentation. Only after every gate is green may Phase 0 be marked complete and Phase 1 planning become eligible.

### Why this approach

The current blocker is not engineering quality: Phase 0D already passed. The only unchecked Phase 0 exit criterion is a production-ready adapter. Luogu cannot currently supply public verdict DOM, while AtCoder exposes stable, server-rendered, logged-out submission pages. Three first-party pages have already been independently observed:

- AC: `https://atcoder.jp/contests/agc040/submissions/53759742?lang=en` → task `agc040_d`, `#judge-status` = `AC`.
- WA: `https://atcoder.jp/contests/abc164/submissions/12438513?lang=en` → task `abc164_e`, `#judge-status` = `WA`.
- TLE: `https://atcoder.jp/contests/abc443/submissions/72918187?lang=en` → task `abc443_d`, `#judge-status` = `TLE`.

All three pages expose a task link of the form `/contests/<contest>/tasks/<task-id>` and advertise logged-out access. The plan therefore preserves the hard `verified-public-dom` standard instead of weakening it, but it refuses to certify selector parsing alone: the submission-page verdict must resolve to the exact task identity and remain in the same capture session.

### What it will NOT do

- It will not lower the public-DOM evidence standard, fabricate fixtures, use login cookies/tokens, copy source code or problem statements, or call an OJ from automated tests.
- It will not promote Luogu, LeetCode, Codeforces, or NowCoder.
- It will not modify or delete historical `tests/fixtures/luogu/**`, `work/reports/luogu-*`, or the historical Luogu gate verdict.
- It will not implement Phase 1 curriculum imports, migrations, pages, personalization, cloud, accounts, or AI-provider behavior.
- It will not start Phase 1 automatically. The maximum completion claim is: Phase 0 is green and the next Commander action is to write/approve the V0 vertical-slice plan.

### Effort / risk

- **Effort:** medium, 8 implementation/documentation tasks plus a 4-lane final verification wave.
- **Primary risks:** misattributing a submission-page verdict to the wrong task; broad selector false positives; accidentally converting historical Luogu evidence into current AtCoder evidence; nondeterministic network-dependent tests.
- **Risk controls:** exact task-link parsing, unique-match and contest-consistency checks, `#judge-status` isolation, static sanitized fixtures, deterministic artifacts, no network in tests, and an all-or-nothing production promotion gate.

### Decisions already made

- First production adapter: **AtCoder**.
- Test strategy: **TDD + full quality gate**.
- Plan authority: this file under `docs/superpowers/plans/` is the sole plan entry; `.omo/plans` is only the repository junction to this directory.
- Luogu remains experimental with its BLOCKED evidence preserved as historical truth.

## Scope

### In scope

1. Acquire and sanitize a small AtCoder fixture corpus from the exact public URLs listed above plus one public task page.
2. Extract a reusable fixture metadata core while preserving the existing Luogu helper API and corpus unchanged.
3. Add page-aware AtCoder identity detection for `/contests/<contest>/submissions/<numeric-id>` by parsing exactly one contest-consistent task link from the document.
4. Restrict AtCoder verdict detection to `#judge-status` and verify AC, WA, TLE, unknown/pending, and noisy-page behavior.
5. Verify task-page → submission-page lifecycle continuity and direct-open submission-page behavior in content-runtime unit tests.
6. Add a platform-scoped, on-disk AtCoder certification gate and deterministic AtCoder artifacts; retain the Luogu gate/artifacts.
7. Promote exactly AtCoder to `production` only after the real on-disk evidence gate certifies.
8. Add AtCoder capture-pipeline E2E coverage using local API/SQLite/UI only.
9. Run the complete quality gate, reconcile Phase 0 status, and record final evidence.

### Out of scope / Must NOT Have

- No authenticated fixture acquisition, cookies, CSRF values, account identifiers, source code, full problem statements, scripts, styles, event handlers, or unrelated page chrome in fixtures.
- No generic multi-platform browser automation framework, generic submission resolver, or certification class hierarchy. Generalize only shared fixture metadata/evaluation primitives needed by Luogu compatibility and AtCoder certification.
- No external HTTP request in Vitest, Playwright, extension tests, build, or `quality:gate`.
- No reliance on “last viewed problem”, globally recent attempts, title guessing, localStorage, cookies, hidden state, or submission ID lookup APIs for task identity.
- No overwrite of `work/reports/certification-gate-verdict.json`; it remains the historical Luogu BLOCKED gate artifact. AtCoder uses distinct artifact names.
- No changes to existing Luogu fixture bytes or `work/reports/luogu-adapter-blocker.json` / `work/reports/luogu-adapter-certification.json`.
- No Phase 1 feature implementation and no claim that V0 exists.

### Authoritative references

- `docs/superpowers/plans/2026-07-11-phase-0-reliability-baseline.md:111-128` — Phase 0 completion criteria; adapter production readiness is the only unchecked item.
- `docs/superpowers/plans/2026-07-11-product-development-roadmap.md:243-294` — acquire public verdict DOM, re-run certification, then plan the V0 slice.
- `docs/superpowers/plans/2026-07-11-phase-1-curriculum-resource-catalog.md:5-9` — Phase 1 import/UI work depends on a green Phase 0 exit gate.
- `extension/src/platforms.ts:16-58,73-176` — adapter registry, URL-only problem detection, broad AtCoder selectors, and shared verdict parser.
- `extension/src/content.ts:23-33` — browser document/location wiring.
- `extension/src/contentRuntime.ts:52-115` — lifecycle reconciliation, submission observation, and verdict publication.
- `extension/src/pageLifecycle.ts:24-68,90-96` — same problem is exactly `(platform, problemExternalId)`.
- `lib/services/canonicalProblemUrl.ts:15-58,96-102` — canonical AtCoder ID/URL contract.
- `tests/helpers/luoguFixtureMetadata.ts:5-150` — current evidence tiers and fixture validation.
- `tests/unit/platformCertification.test.ts:74-109,186-224` — existing Luogu gate and synthetic CERTIFIED precedent.
- `tests/unit/extensionPlatforms.test.ts:20-179` — current adapter behavior/status assertions.
- `tests/unit/extensionContentRuntime.test.ts` and `tests/unit/extensionPageLifecycle.test.ts` — content lifecycle regression surface.
- `tests/e2e/capture-luogu-problem.spec.ts:10-18,43-119` — pipeline-only E2E precedent and explicit DOM-detector boundary.
- `work/reports/phase-0d-engineering-gates.md:79-138` — latest authoritative engineering-gate evidence.

## Verification strategy

### Test strategy

- Use **failing-first TDD** for metadata, identity, verdict isolation, lifecycle continuity, certification, and registry promotion.
- Static fixtures are the only OJ inputs to automated tests. Network acquisition is a one-time evidence task and must finish before tests consume the corpus.
- Use temporary SQLite databases only. `npm run quality:gate` owns its OS-temporary database; Playwright owns `.tmp/playwright/training-platform.sqlite`.
- The default `training-platform.sqlite` may be inspected only with metadata-only `Get-Item` before/after the authoritative gate. Do not open, hash, migrate, seed, or copy it.

### Required fixture matrix

| Fixture | Public source | Purpose | Expected |
|---|---|---|---|
| `task-agc040-d` | `https://atcoder.jp/contests/agc040/tasks/agc040_d?lang=en` | public task URL identity + no-verdict negative | `atcoder/agc040_d`; verdict `null` |
| `submission-agc040-d-ac` | `https://atcoder.jp/contests/agc040/submissions/53759742?lang=en` | submission identity + verdict | `atcoder/agc040_d`; `Accepted` |
| `submission-abc164-e-wa` | `https://atcoder.jp/contests/abc164/submissions/12438513?lang=en` | submission identity + verdict | `atcoder/abc164_e`; `Wrong Answer` |
| `submission-abc443-d-tle` | `https://atcoder.jp/contests/abc443/submissions/72918187?lang=en` | submission identity + verdict | `atcoder/abc443_d`; `Time Limit Exceeded` |
| `submission-no-task-link` | derived only from a retained sanitized fixture by removing its task link | failure characterization; never certifying | problem `null`; no event attribution |
| `noisy-atcoder-page` | local synthetic test DOM only | false-positive regression; never certifying | unrelated `AC` outside `#judge-status` → verdict `null` |

The first four on-disk fixtures must be sourced from public first-party pages. The last two are test-only failure inputs and must be labelled non-certifying/characterization-derived; they cannot contribute to the gate.

### Artifact evidence paths

- Acquisition/provenance: `tests/fixtures/atcoder/README.md` and sibling `*.meta.json` files.
- Focused test logs: `.tmp/evidence/phase-0-atcoder/task-<n>-*.log` (temporary and removed after evidence is summarized).
- Gate artifacts:
  - `work/reports/atcoder-certification-gate-verdict.json`
  - `work/reports/atcoder-adapter-certification.json`
  - `work/reports/phase-0-atcoder-certification.md`
- Final status: `work/handoff-current.md` and the Phase 0 baseline/roadmap.

## Execution strategy

### Dependency waves

```text
Wave 1: T1 evidence acquisition
          ↓
Wave 2: T2 metadata core ───────┐
          ↓                     │
Wave 3: T3 identity bridge + T4 verdict isolation
          ↓                     │
Wave 4: T5 lifecycle flow       │
          ↓                     │
Wave 5: T6 certification gate ←─┘
          ↓
Wave 6: T7 promotion + pipeline E2E
          ↓
Wave 7: T8 full gate + docs/evidence
          ↓
Final verification wave F1-F4 in parallel
```

T3 and T4 may be implemented in parallel only after T2 lands because both consume the generic fixture contract. T5 depends on both. T6 must run while AtCoder is still `experimental` first, prove the on-disk evidence result is `CERTIFIED`, and then permit T7 to change the registry. No task may pre-stage the production status.

### Dirty-worktree discipline

- Before execution, classify `.omo/drafts/phase-0-atcoder-production-certification.md` and this plan as planning artifacts; preserve them.
- Record `git status --short --branch --untracked-files=all` and current HEAD. Do not discard or overwrite unrelated changes.
- Prefix every git command with `$env:GIT_MASTER='1';`.
- Do not push or create a PR. Commits are local atomic checkpoints only.

## Todos

### Wave 1 — Public evidence acquisition

- [x] **T1. Acquire and sanitize the AtCoder public fixture corpus**

  **Files:** create `tests/fixtures/atcoder/README.md`; create four public fixture pairs `task-agc040-d.{html,meta.json}`, `submission-agc040-d-ac.{html,meta.json}`, `submission-abc164-e-wa.{html,meta.json}`, `submission-abc443-d-tle.{html,meta.json}`.

  **References:** the exact live URLs and expectations in the Required fixture matrix; `docs/superpowers/plans/2026-07-14-phase-0b4-luogu-adapter-certification.md:89-166` for evidence-tier and sanitization precedent; `tests/fixtures/luogu/README.md:15-55` for truthful evidence classification.

  **Implementation:** fetch each URL read-only without credentials. Confirm HTTP success, a logged-out page, exactly one task link matching `/contests/<same-contest>/tasks/<task-id>`, and for submission fixtures one `#judge-status`. Store only a minimal root containing the task anchor and status cell/span; the task fixture stores only title/task identity markup. Strip all scripts, styles, metadata, forms, CSRF values, source code, usernames, timestamps, test-case tables, problem text, cookies/tokens, and unrelated navigation. Each public fixture must be under 8 KiB after sanitization. Metadata must record capture date `2026-07-16`, public source URL, `authenticated: false`, `sanitized: true`, exact selectors, expected problem/verdict, and `evidenceTier` (`public-content-accessible` for the task page; `verified-public-dom` for the three submission pages).

  **Acceptance:** all four HTML files are minimal and under 8 KiB; the three submission files contain one valid task anchor and one `#judge-status`; expected verdicts are AC/WA/TLE as listed; no forbidden content is present; the README names source, acquisition method, date, sanitization, and certification meaning.

  **QA — happy:** run a temporary read-only fixture audit script or focused test that prints fixture name, byte size, source host, task href, `#judge-status` text, and forbidden-pattern count to `.tmp/evidence/phase-0-atcoder/task-1-fixtures.log`; expect 4 fixtures, all source hosts `atcoder.jp`, sizes `<8192`, and zero forbidden-pattern matches.

  **QA — failure:** run the same validator against an in-memory or OS-temp fixture containing `<script>`, CSRF text, source code, or missing task href; expect rejection and a non-zero focused-test result. Do not add malformed content to the retained corpus. Evidence: `.tmp/evidence/phase-0-atcoder/task-1-rejection.log`.

  **Commit:** `test: add public AtCoder DOM fixtures`

### Wave 2 — Shared fixture contract

- [x] **T2. Extract a platform-scoped fixture metadata core without changing Luogu evidence**

  **Files:** create `tests/helpers/platformFixtureMetadata.ts`; update `tests/helpers/luoguFixtureMetadata.ts` into a compatibility wrapper preserving all existing export names/default Luogu directory; create `tests/helpers/atcoderFixtureMetadata.ts`; add/update `tests/unit/luoguFixtureLoader.test.ts`; create `tests/unit/extensionAtcoderFixtures.test.ts`.

  **References:** `tests/helpers/luoguFixtureMetadata.ts:5-150`; all current importers of that file; `lib/domain/source.ts` for the authoritative platform schema/type; `vitest.extension.config.ts` include behavior (`extension*.test.ts` is the new test naming convention).

  **Implementation:** move the single Zod schema/evidence-tier implementation to `platformFixtureMetadata.ts`. Parameterize parsing/loading by expected platform and fixtures directory. `problemExpected.platform` must use the authoritative Platform type; when non-null it must match the corpus platform. Keep Luogu's default paths and public API through a wrapper so existing tests and historical artifact semantics remain intact. AtCoder's wrapper fixes platform `atcoder` and directory `tests/fixtures/atcoder`. Do not duplicate the schema and do not edit any Luogu fixture/report.

  **Acceptance:** existing Luogu loader/certification tests pass unchanged in meaning; all current Luogu metadata parses; all AtCoder metadata parses; cross-platform metadata (for example `platform: luogu` in the AtCoder corpus) is rejected; certifying evidence still requires public DOM, non-null expected verdict, non-empty selector provenance, `authenticated: false`, and sanitization.

  **QA — happy:** `npx vitest run tests/unit/luoguFixtureLoader.test.ts tests/unit/extensionAtcoderFixtures.test.ts` exits 0 and writes `.tmp/evidence/phase-0-atcoder/task-2-focused.log`.

  **QA — failure:** focused tests parse an OS-temp AtCoder metadata object with mismatched `problemExpected.platform`, `authenticated: true`, or empty selectors on `verified-public-dom`; every case must throw a typed metadata error. Evidence: `.tmp/evidence/phase-0-atcoder/task-2-rejection.log`.

  **Commit:** `refactor: share platform fixture metadata`

### Wave 3 — Trustworthy page detection

- [x] **T3. Add an exact AtCoder submission-page identity bridge**

  **Files:** update `extension/src/platforms.ts`, `extension/src/content.ts`, `tests/unit/extensionPlatforms.test.ts`, and `tests/unit/extensionAtcoderFixtures.test.ts`.

  **References:** `extension/src/platforms.ts:60-136`; `extension/src/content.ts:23-30`; `lib/services/canonicalProblemUrl.ts:29-30,52-58,96-102`; `extension/src/pageLifecycle.ts:90-96`.

  **Implementation:** retain `detectProblemFromLocation(location, title)` as the URL-only function. Add `detectProblemFromPage(location, pageDocument)` and wire `content.ts` to it. It first uses URL-only task detection. For an AtCoder path matching exactly `/contests/<contest>/submissions/<numeric-id>` (optional trailing slash), inspect anchors whose href parses exactly as `/contests/<same-contest>/tasks/<task-id>`. Normalize task IDs through the existing canonical service. Return a problem only when exactly one unique, contest-consistent task identity exists; use the trimmed task-anchor text as title and canonical task URL as `canonicalUrl`. Zero matches, multiple distinct matches, nonnumeric submission IDs, host spoofing, contest mismatch, or invalid task IDs return `null`. Never use recent/global state or document title as a fallback.

  **Acceptance:** the three public submission fixtures resolve to `agc040_d`, `abc164_e`, and `abc443_d`; the task fixture still resolves through URL-only detection; canonical URLs point to `/tasks/<id>`; a direct submission page and a task page produce the same `(platform, externalId)`; malformed/mismatched/ambiguous fixtures return null.

  **QA — happy:** `npx vitest run tests/unit/extensionPlatforms.test.ts tests/unit/extensionAtcoderFixtures.test.ts` exits 0. Evidence: `.tmp/evidence/phase-0-atcoder/task-3-identity.log`.

  **QA — failure:** focused tests supply (a) no task anchor, (b) two different valid task anchors, (c) an anchor from another contest, and (d) an attacker-controlled host containing `atcoder.jp` as a substring; all must return null and emit no capture identity. Evidence: `.tmp/evidence/phase-0-atcoder/task-3-identity-rejection.log`.

  **Commit:** `fix: resolve AtCoder submission identity`

- [x] **T4. Isolate AtCoder verdict parsing to the real status element**

  **Files:** update `extension/src/platforms.ts`, `tests/unit/extensionPlatforms.test.ts`, and `tests/unit/extensionAtcoderFixtures.test.ts`.

  **References:** `extension/src/platforms.ts:33-37,138-176`; public fixture DOM showing `#judge-status`; existing verdict-token tests in `tests/unit/extensionPlatforms.test.ts:85-157`.

  **Implementation:** change only AtCoder's verdict selector list to `['#judge-status']`; do not scan all `td` or `body` content and do not alter other adapters in this task. Parse the status element's visible text through the existing normalized verdict function. Keep unknown/pending values (`WJ`, `Judging`) as `null` until a supported final verdict appears.

  **Acceptance:** full retained fixtures map AC → Accepted, WA → Wrong Answer, and TLE → Time Limit Exceeded; a document containing standalone `AC`, `WA`, or `TLE` outside `#judge-status` returns null; absent/empty/unknown status returns null; other adapters' existing tests remain green.

  **QA — happy:** `npx vitest run tests/unit/extensionPlatforms.test.ts tests/unit/extensionAtcoderFixtures.test.ts` exits 0. Evidence: `.tmp/evidence/phase-0-atcoder/task-4-verdict.log`.

  **QA — failure:** an in-memory document has `<td>AC</td><main>TLE</main>` but no `#judge-status`; expect null. A `#judge-status` containing `WJ` also returns null. Evidence: `.tmp/evidence/phase-0-atcoder/task-4-false-positive.log`.

  **Commit:** `fix: scope AtCoder verdict detection`

### Wave 4 — Runtime continuity

- [x] **T5. Lock the task-to-submission capture lifecycle and direct-open behavior**

  **Files:** update `tests/unit/extensionContentRuntime.test.ts` and, only if a discovered regression requires it, minimally update `extension/src/contentRuntime.ts` or `extension/src/pageLifecycle.ts`.

  **References:** `extension/src/contentRuntime.ts:52-115`; `extension/src/pageLifecycle.ts:24-68,90-96`; `extension/src/captureSession.ts:48-102`; existing same-problem/SPA tests.

  **Implementation:** use dependency-injected detected pages/verdicts; no browser network. Test the exact sequence: task page starts `atcoder/agc040_d`; submit click creates a submission ID; navigation to the public submission fixture resolves the same identity and must not end/restart the session; document mutation publishes Accepted against the existing submission ID. Also test a direct-open submission page: it starts the correct session and a visible verdict creates one submission ID. An unresolvable submission page must end/leave no active session before verdict evaluation and must never attribute the verdict to the previous task.

  **Acceptance:** same-identity task→submission navigation emits no `SESSION_ENDED`/new `SESSION_STARTED`; the verdict references the clicked submission ID; direct-open produces one session and one verdict-created submission; mismatched/unresolvable pages produce no wrongly attributed verdict; existing SPA/pagehide suppression semantics remain intact.

  **QA — happy:** `npx vitest run tests/unit/extensionContentRuntime.test.ts tests/unit/extensionPageLifecycle.test.ts tests/unit/extensionCaptureSession.test.ts` exits 0. Evidence: `.tmp/evidence/phase-0-atcoder/task-5-runtime.log`.

  **QA — failure:** simulate task `agc040_d` followed by a submission DOM linking `abc164_e`; expect the old session to end or detection to return null according to the page detector, and assert no verdict event carries `agc040_d` with the mismatched page's verdict. Evidence: `.tmp/evidence/phase-0-atcoder/task-5-misattribution.log`.

  **Commit:** `test: lock AtCoder capture continuity`

### Wave 5 — Certification decision

- [x] **T6. Add a deterministic, platform-scoped AtCoder certification gate**

  **Files:** create `tests/helpers/platformCertification.ts`; create `tests/unit/extensionAtcoderCertification.test.ts`; minimally refactor `tests/unit/platformCertification.test.ts` to consume the shared pure evaluator while retaining its Luogu output/path; create `work/reports/atcoder-certification-gate-verdict.json` in the CERTIFIED pre-promotion state.

  **References:** `tests/unit/platformCertification.test.ts:45-109,186-224`; `work/reports/certification-gate-verdict.json` as historical Luogu output; evidence rules in T2; AtCoder fixture matrix in this plan.

  **Implementation:** the pure evaluator accepts candidate platform, metadata, required verdict set, and deterministic gate source/date. AtCoder certification requires: at least one public task identity fixture; all three real `verified-public-dom` fixtures (Accepted, Wrong Answer, Time Limit Exceeded); source host `atcoder.jp`; `authenticated: false`; non-empty selector provenance containing `#judge-status`; matching AtCoder problem identity from the retained DOM; and successful detector outputs. Synthetic metadata proves BLOCKED paths but never satisfies the on-disk gate. The AtCoder test writes only `work/reports/atcoder-certification-gate-verdict.json`. Keep `work/reports/certification-gate-verdict.json` and all `luogu-*` files byte-unchanged.

  **Acceptance:** the on-disk AtCoder gate returns `CERTIFIED` before promotion with exact coverage counts and no blockers; removing any one required verdict, changing source host/authentication/selectors, or breaking task identity returns BLOCKED; the on-disk Luogu gate still returns BLOCKED and Luogu remains experimental; repeated test runs write byte-identical AtCoder artifacts.

  **QA — happy:** `npx vitest run tests/unit/platformCertification.test.ts tests/unit/extensionAtcoderCertification.test.ts` exits 0; PowerShell parses both artifacts and prints `Luogu=BLOCKED`, `AtCoder=CERTIFIED`. Evidence: `.tmp/evidence/phase-0-atcoder/task-6-gates.log`.

  **QA — failure:** run the pure evaluator with an in-memory copy missing the WA fixture and another marked authenticated; both return BLOCKED with precise reason codes and never alter disk artifacts. Evidence: `.tmp/evidence/phase-0-atcoder/task-6-blocked-cases.log`.

  **Commit:** `test: certify public AtCoder adapter evidence`

### Wave 6 — Conditional promotion and pipeline proof

- [x] **T7. Promote exactly AtCoder and verify the local capture pipeline**

  **Precondition:** T6's real on-disk artifact must read `gateVerdict: "CERTIFIED"`. If not, stop in BLOCKED state, write no registry change, and do not proceed to documentation closure.

  **Files:** update `extension/src/platforms.ts` (`atcoder.status` only); update `tests/unit/extensionPlatforms.test.ts`; update `tests/unit/extensionAtcoderCertification.test.ts`; create `tests/e2e/capture-atcoder-problem.spec.ts`; create `work/reports/atcoder-adapter-certification.json`.

  **References:** `extension/src/platforms.ts:16-58`; status assertions in `tests/unit/extensionPlatforms.test.ts:159-178`; pipeline precedent `tests/e2e/capture-luogu-problem.spec.ts:10-119`; capture DTO helpers in `tests/e2e/captureFixtures.ts`.

  **Implementation:** set only AtCoder to `production`. Update registry tests to require `getProductionPlatforms()` exactly `['atcoder']`; every other platform stays `experimental`. The AtCoder certification artifact records candidate, terminal state CERTIFIED, production status, fixture names/counts/source URLs, detector version, gate artifact path, and explicit preservation of Luogu BLOCKED history. Add one local-only E2E flow posting AtCoder session/submission/verdict events for `agc040_d`, then assert SQLite projection and `/training?platform=atcoder&externalId=agc040_d` show the exact identity/verdict. State clearly in the E2E comment that DOM parsing is proven by static unit fixtures, not Playwright external navigation.

  **Acceptance:** AtCoder is the sole production platform; Luogu and the other three remain experimental; AtCoder gate remains CERTIFIED after promotion; E2E projects one active AtCoder attempt with the correct submission ID and verdict; no external request occurs; certification artifact is deterministic and internally consistent.

  **QA — happy:** `npx vitest run tests/unit/extensionPlatforms.test.ts tests/unit/platformCertification.test.ts tests/unit/extensionAtcoderCertification.test.ts`; then `npm run e2e -- tests/e2e/capture-atcoder-problem.spec.ts`. Both exit 0. Evidence: `.tmp/evidence/phase-0-atcoder/task-7-promotion.log` and `task-7-e2e.log`.

  **QA — failure:** focused tests evaluate a temporary registry state with AtCoder production but missing/malformed certifying evidence; expect a hard failure. Assert `getProductionPlatforms()` never includes Luogu. Evidence: `.tmp/evidence/phase-0-atcoder/task-7-promotion-guard.log`.

  **Commit:** `feat: promote certified AtCoder adapter`

### Wave 7 — Authoritative gate and phase reconciliation

- [x] **T8. Run the full Phase 0 gate, record evidence, and reconcile phase truth**

  **Files:** create `work/reports/phase-0-atcoder-certification.md`; update `work/handoff-current.md`, `IDEA.md`, `README.md`, `AGENTS.md`, `docs/architecture.md`, `docs/runbook.md`, `docs/superpowers/README.md`, `docs/superpowers/plans/2026-07-11-phase-0-reliability-baseline.md`, and `docs/superpowers/plans/2026-07-11-product-development-roadmap.md`. Update no other current-state doc unless a concrete stale claim is found.

  **References:** Phase 0 exit gate and roadmap references under Scope; stale `IDEA.md:112,511-515`; current status paragraphs in README/architecture/AGENTS; `work/reports/phase-0d-engineering-gates.md:63-77,79-138` for safe evidence format.

  **Implementation:** before the authoritative run, record clean/expected worktree classification, current commit, absence of `.tmp/playwright`, ignored `extension/dist`, absence of stale quality-gate temp directories, and metadata-only default database `Length`/`LastWriteTimeUtc`. Run `npm run extension:check`, then `npm run quality:gate`. Record exact fresh counts, commands, cleanup, artifact consistency, and unchanged default-database metadata in the new report. Only after both pass and AtCoder artifacts say CERTIFIED/production: check the final Phase 0 adapter item, mark Phase 0 complete/green, update all “five experimental/no production adapter/Phase 0D remains” claims, preserve Luogu as experimental with a historical BLOCKED certification, and set the next action to writing/approving the V0 vertical-slice plan. Do not mark Phase 1 implemented or in progress.

  **Acceptance:** `extension:check` and `quality:gate` exit 0; default DB metadata and temp cleanup pass; AtCoder is exactly the sole production platform; Luogu historical files are byte-unchanged; all authoritative docs agree that Phase 0 is green and Phase 1 implementation has not started; `IDEA.md` no longer says Phase 0D remains; the final report distinguishes evidence acquisition, certification, promotion, engineering gate, and remaining product work.

  **QA — happy:** run the complete commands and a targeted stale-claim audit over all listed docs. Save transient logs under `.tmp/evidence/phase-0-atcoder/`, summarize exact results into `work/reports/phase-0-atcoder-certification.md`, then remove transient logs. `git diff --check` must pass. Evidence is the committed report itself.

  **QA — failure:** if any command fails, AtCoder gate changes to BLOCKED, DB metadata differs, temp cleanup fails, or docs disagree, leave Phase 0 BLOCKED/in progress, do not check the exit item, and record the exact blocker in the report/handoff. Never convert a failure into PASS by editing expected counts or weakening tests.

  **Commit:** `docs: close Phase 0 with AtCoder certification`

## Final verification wave

Run all four lanes in parallel **after T8**, against the same clean candidate commit. Every lane must independently return `APPROVE`; a summary or passing log is only a claim until the lane checks the exact assertion/artifact. If any lane rejects, fix the issue in a new atomic commit and rerun all affected lanes. Surface all four results and wait for the user's explicit okay before declaring the work complete.

- [ ] **F1 — Plan compliance audit**
  - Verify every T1-T8 acceptance item and Must-NOT-Have against the diff and artifacts.
  - Confirm AtCoder is the only production platform, Luogu evidence files are unchanged, Phase 1 product code is absent, and plan authority remains this file under `docs/superpowers/plans/`.
  - Evidence: `work/reports/phase-0-atcoder-certification.md#final-verification-f1`.

- [ ] **F2 — Code quality and security review**
  - Review strict TypeScript, parser boundaries, host/path spoofing, unique task-link selection, selector isolation, fixture sanitization, deterministic writes, and default DB safety.
  - Reject `any`, casts prohibited by AGENTS.md, broad `body`/`td` AtCoder verdict fallback, hidden/authenticated data, network tests, or silent error swallowing.
  - Evidence: `work/reports/phase-0-atcoder-certification.md#final-verification-f2`.

- [ ] **F3 — Hands-on QA**
  - Run focused fixture/identity/verdict/runtime/certification tests, AtCoder E2E, `extension:check`, and `quality:gate` from a clean state using disposable data.
  - Inspect exact gate artifacts and cleanup; do not open/hash the default DB.
  - Evidence: `work/reports/phase-0-atcoder-certification.md#final-verification-f3`.

- [ ] **F4 — Scope and documentation fidelity**
  - Compare IDEA, roadmap, baseline, README, architecture, runbook, Superpowers index, AGENTS, handoff, and reports for one consistent phase story.
  - Confirm the next action is V0 vertical-slice planning, not silent Phase 1 implementation, and cloud/local-first boundaries remain unchanged.
  - Evidence: `work/reports/phase-0-atcoder-certification.md#final-verification-f4`.

## Commit strategy

Local atomic commits, no push/PR:

1. `test: add public AtCoder DOM fixtures`
2. `refactor: share platform fixture metadata`
3. `fix: resolve AtCoder submission identity`
4. `fix: scope AtCoder verdict detection`
5. `test: lock AtCoder capture continuity`
6. `test: certify public AtCoder adapter evidence`
7. `feat: promote certified AtCoder adapter`
8. `docs: close Phase 0 with AtCoder certification`

Before every commit: inspect `git status`, `git diff`, and staged diff; stage only the task's files; prefix git commands with `$env:GIT_MASTER='1';`. Never amend failed commits, skip hooks, force-push, or include the default database, `extension/dist`, `.tmp`, test results, or unrelated user changes.

## Success criteria

The plan succeeds only when all statements below are simultaneously true:

1. The retained AtCoder corpus contains public, logged-out, sanitized AC/WA/TLE submission DOM plus a task identity fixture, with truthful metadata and no restricted content.
2. AtCoder submission pages resolve the exact canonical task identity from one contest-consistent task link; ambiguous/missing/mismatched pages resolve to null and cannot inherit a recent problem.
3. AtCoder verdict parsing reads only `#judge-status`; unrelated page text cannot produce a verdict.
4. Task→submission navigation preserves the capture session/submission ID for the same problem; direct-open submission pages are correctly attributed; mismatches never contaminate another attempt.
5. The real on-disk AtCoder gate is CERTIFIED and deterministic; synthetic evidence cannot certify; the Luogu gate remains BLOCKED and all historical Luogu evidence remains unchanged.
6. `getProductionPlatforms()` equals exactly `['atcoder']`; every other adapter remains experimental.
7. Focused tests, AtCoder E2E, `npm run extension:check`, and `npm run quality:gate` all pass using disposable data, with default database metadata unchanged and all temp output cleaned.
8. Phase 0 documentation is internally consistent and marks every exit criterion complete only after the evidence above exists.
9. No Phase 1 feature code is added. The handoff says Phase 0 is green and the next action is to write/approve the V0 vertical-slice plan.
10. F1-F4 all APPROVE and the user explicitly accepts the final verification results.
