# V0 Domestic OJ Capture Stabilization Plan

**Status:** Active — engineering repair, passive authenticated characterization,
review, and automated gates complete; replacement RC freeze and real-use
observation remain pending.

**Goal:** Repair the shallow RC acceptance failures by moving every V0 OJ
practice link to mainland-accessible platforms, making LeetCode.cn, Luogu and
NowCoder capture routing precise, separating transport delivery from a real
training attempt in the extension UI, and simplifying pairing language.

**Release boundary:** This is a blocking V0 RC repair, not V0.5. AtCoder remains
the sole `production` adapter. Domestic adapters remain `experimental`; an
authenticated, sanitized characterization fixture never satisfies the public
DOM certification gate. Runtime changes invalidate implementation SHA
`b5166320768355666a5c4ff3f466c29c240ea8cf` and require a new RC plus restarted
observation windows.

## Constraints

- Do not read cookies, tokens, passwords, hidden data, submitted source code or
  full commercial problem statements.
- Do not bypass login. Authenticated DOM may be recorded only with user
  authorization, after strict sanitization, and only as characterization.
- Do not remove the existing AtCoder/legacy adapters or relax production
  certification.
- Replace OJ practice links only; keep cppreference, GDB and Git learning
  resources.
- Preserve capture-event and database schema compatibility unless a failing
  test proves that a compatible implementation is impossible.
- Do not delete or migrate historical user attempts merely to normalize URLs.
- Do not commit or push without explicit user authorization.

## Tasks

### 1. Establish platform evidence gates

- [x] Record a per-platform matrix for problem, submit/judging and final-verdict
  pages for LeetCode.cn, Luogu and NowCoder.
- [x] Store only strictly sanitized, user-authorized DOM fixtures with an
  authenticated-characterization evidence tier.
- [x] Keep each platform's verdict capture BLOCKED until fixture detector tests
  pass; never guess selectors.
- [x] Require a Luogu record fixture to contain one unique public problem link;
  otherwise record-page identity returns `null`.

### 2. Implement deterministic domestic URL contracts

- [x] Make `platform=leetcode` canonical URLs deterministically use
  `https://leetcode.cn/problems/<slug>/`; preserve legacy `.com` capture
  compatibility but stop recommending it.
- [x] Namespace NowCoder identities as `practice/<id>` and
  `acm/problem/<id>`, with exact deterministic canonical hosts.
- [x] Restrict Luogu identity to `/problem/<id>` and evidence-backed
  `/record/<id>` resolution.
- [x] Add only the required exact hosts and narrow content-script paths to the
  MV3 manifest; pure routing code must still enforce exact origins and paths.
- [x] Cover exact, variant, unsupported and spoofed URLs with unit tests.

Luogu `/problem/<id>` is strict. `/record/<id>` now resolves only on an exact
first-party route with one unique, visible, bounded `/problem/<id>` anchor from
the authenticated-characterization fixture; URL-only record detection remains
`null`.

### 3. Tighten submit and verdict detection

- [x] Replace arbitrary clicked-text matching with evidence-backed,
  platform-specific submit controls on supported problem routes.
- [x] Remove broad `body` verdict fallbacks from experimental adapters.
- [x] Emit verdicts only from narrow, fixture-backed nodes; unmatched DOM emits
  no server event and broad body scanning remains forbidden.
- [x] Preserve session lifecycle events while ensuring login, registration and
  unrelated pages emit nothing.

### 4. Make queue and projection status understandable

- [x] Parse the existing successful capture response into a typed ACK carrying
  optional `attemptId` and `attemptStatus`.
- [x] Store last delivered event type/id/time and materialization outcome.
- [x] Explicitly remove stale delivery errors after a successful ACK.
- [x] Render Chinese popup labels for pending events, last delivered event,
  attempt creation and blocking reason; refresh on storage changes.
- [x] Never describe a session event as a successful submission.

### 5. Simplify pairing UX

- [x] Hide raw `credential vN` labels from the popup and settings UI.
- [x] Present first pairing as “已配对” and later targeted rotations as
  “凭证已轮换”, retaining the backend version and rotation contract.
- [x] Keep new-installation, targeted-rotation and revoke actions distinct.

### 6. Publish curriculum package 1.0.1

- [x] Curate eleven public, C++-capable, learning-goal-matched problems across
  LeetCode.cn, Luogu and NowCoder; retain the manual Git exercise.
- [x] Remove all foreign OJ URLs from V0 practice mappings while preserving the
  twelve nodes/resources/tasks and thirteen edges.
- [x] Update package semver, source revision and checksum; keep 1.0.0 and 1.0.1
  importable together, with the newest installation active.
- [x] Replace hard-coded AtCoder fallback wording with platform-neutral text.
- [x] Run package validation and the real mainland-local link check.

The real link check was executed and remains conservatively BLOCKED: 17/24
URLs pass, while all seven LeetCode.cn pages return HTTP 200 but include the
`请登录` marker. The checker deliberately does not treat SEO metadata or a
problem preview as proof that the rendered page is usable without login.
`work/reports/v0-domestic-oj-link-access-check.json` preserves the exact result;
there are zero duplicate final URLs.

### 7. Verify in layers

- [x] Unit-test route/canonical contracts, sanitized DOM detectors, false-submit
  guards, ACK/error handling, popup presentation and package invariants.
- [x] Use existing direct-POST E2E infrastructure to prove all three platform
  identities materialize into `/training`; do not mislabel this as detector E2E.
- [x] Run focused checks, `npm run extension:check`, then the authoritative
  disposable-database `npm run quality:gate`.
- [x] Complete the authorized passive matrix without submitting: inspect problem
  controls and existing LeetCode.cn AC, NowCoder AC, and Luogu AC/Compile Error
  result DOM. User-performed new submissions and transitions remain outside
  agent scope and are not claimed as observed.

Fresh uncommitted-worktree gate evidence: `npm run quality:gate` passes with
65 unit files / 1008 passed / 1 capability skip, 24 Playwright E2E tests, 18
extension files / 457 passed, strict lint, disposable migration, curriculum
validation, typecheck, extension build/parity and production Next.js build.
Independent review is APPROVED after manifest reachability and hidden-title
privacy fixes. No agent submission was performed.

### 8. Reconcile release evidence

- [x] Update current-state docs and reports without claiming domestic adapters
  are production or accepted.
- [ ] Create a new RC only when explicitly authorized to commit; update every
  observation template to the new immutable implementation SHA.
- [ ] Restart owner and participant observation windows from the new RC.

## Completion criterion

Shared reliability changes and curriculum localization may complete
independently, but “three domestic platforms support automatic verdict capture”
may be claimed only when all three authenticated-characterization fixture gates,
detector tests and real hands-on checks pass. Missing account/DOM evidence is a
real BLOCKED state, not permission to invent selectors. V0 remains in validation
until the restarted observations, same-SHA F1–F4, explicit user acceptance and
the final two-commit validator all pass.
