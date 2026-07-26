# V4 Phase A Final Closeout Report (2026-07-24)

**Scope:** Phase A Tasks A0-A12 (V4 evidence core + real extension E2E +
quality gate integration + closeout)
**Declared closeout at:** 2026-07-24
**Result:** `V4 infrastructure engineering PASS (scope-reduced)`:
A0-A12 are complete and every authoritative gate command exits 0, but
the full E2->E3->real-popup-pair->real-API->SQLite delivery probe and
the worker-restart scenario remain out of Phase A scope. See
section 7 for the explicit non-claims. Real platforms remain
`V4 uncharacterized`.

> This report supersedes `work/reports/v4-phase-a-closeout-2026-07-24.md`
> for the A0-A12 scope. The A0-A9 verdict in that interim report is
> preserved unchanged: A0-A9 still record `V4 infrastructure engineering
> PASS`. A10-A12 add the disposable SQLite lifecycle, the canonical
> quality gate integration, and the final closeout report.

## 1. Summary

Phase A is now the authoritative V4 infrastructure scope. Tasks A0-A12
were re-opened on user direction after the A0-A9 interim closeout:

- A0: production-dist webRequest test path
- A1: Safe Evidence schemas + raw-to-safe parser boundary
- A2: adapter contract split + AST dependency gate
- A3: strict evidence correlator with closed-tag-union outcomes
- A4: pure capture state machine (7-state model, deterministic SHA-256
  bundle id, additive V3 `submission_confirmed` action)
- A5: session/local storage split + recovery plan
- A6: production webRequest observer
- A7: optional low-trust MAIN bridge
- A8: background orchestrator + popup state wiring
- A9: Fake OJ matrix (29 Playwright tests; 31 spec + 1 webrequest spike
  after A11; 31 passed + 1 known skip)
- A10: disposable SQLite lifecycle + production extension E2E smoke
  test
- A11: canonical quality gate integration (the new `extension:e2e`
  lane is the 7th of 9 gate stages)
- A12: plan reconciliation + this final closeout report

A10-A12 are NOT platform characterizations. They complete the
framework engineering pass and the V4 Phase A closeout. Real
platform characterization remains Phase B (NowCoder pilot) and
Phase C-D (other platforms + replacement RC); both require fresh
explicit user authorization and are not in scope for Phase A.

## 2. Phase A commit chronology

Authoritative commit SHA at each task. All commits are on
`feature/v1-followup`.

| Task | Subject | SHA |
|------|---------|-----|
| T0.1 | docs(extension): add V4 plans + reconcile authority | `8321a07` |
| T0.2 | test(extension): add RED tests for click-only waiting | `fb2cc15` |
| T0.3 | feat(extension): add bounded E0 UI hints | `4b9cb2e` |
| T0.4 | feat(extension): add idempotent V3-to-V4 stopgap migration | `d683a7a` |
| T0.5 | feat(extension): make popup waiting semantics confirmed-only | `6d8fe63` |
| A0 | test(extension): prove production-dist webRequest test path | `7d6bf9e` |
| A1 | feat(extension): define strict Safe Evidence schemas | `8bdfe5d` |
| A2 | feat(extension): split adapter contracts and registry | `9449c61` |
| A3 | feat(extension): implement the strict Evidence Correlator | `03b56d0` |
| A4 | feat(extension): implement the pure Capture State Machine | `2ca2ffd` |
| A5 | feat(extension): split session and local storage | `2a27997` |
| A6 | feat(extension): add the production webRequest observer | `64890b4` |
| A7 | feat(extension): add the optional low-trust MAIN bridge | `68f0d4e` |
| A8 | feat(extension): wire background orchestration and popup | `12ceb6d` |
| A9 | test(extension): build the complete Fake OJ matrix | `b3ec8cb` |
| A10 | test(extension): add disposable DB + webServer (smoke) | `c8680e8` |
| A10 fix | fix(test): tighten A10 path safety + profile cleanup | `9b81784` |
| A11 | build(quality): integrate extension E2E lane into gate | `9556890` |
| A11 fix | fix(ci): tighten A11 workflow + docs accuracy | `6401e17` |

15 atomic task commits + 4 review-fix commits = 19 commits total for
the V4 Phase 0 + Phase A closeout.

## 3. Modules and tests added in Phase A

### Phase 0 stopgap (T0.1-T0.5)

- `extension/src/uiHint.ts` — bounded E0 UI hint module.
- `scripts/validate-v4-plan-authority.mjs` and
  `tests/unit/v4PlanAuthorityValidator.test.ts` — plan authority
  validator.
- Modifications to `extension/src/content.ts`,
  `extension/src/contentRuntime.ts`, `extension/src/installation.ts`,
  `extension/src/popup.ts`, `extension/src/popup.html`,
  `tests/unit/extensionSubmissionControl.test.ts`,
  `tests/unit/extensionContentRuntime.test.ts`,
  `tests/unit/extensionBackgroundMessages.test.ts`,
  `tests/unit/extensionPopup.test.ts`,
  `tests/unit/extensionInstallation.test.ts`.

### Phase A infrastructure (A0-A9)

- `extension/src/evidence.ts` — Safe Evidence discriminated union.
- `extension/src/adapters/{contract,registry,dom}.ts`,
  `extension/src/adapters/leetcode/verdict.ts`,
  `extension/src/adapters/luogu/verdict.ts` — adapter contract and
  registry split.
- `extension/src/submissionCorrelator.ts` — strict correlator.
- `extension/src/captureStateMachine.ts` — pure reducer (7-state
  model, SHA-256 bundle id, pure-JS implementation).
- `extension/src/transientEvidenceStorage.ts`,
  `extension/src/confirmedSubmissionStorage.ts`,
  `extension/src/confirmedSubmission.ts` — V4 storage split.
- `extension/src/networkObserver.ts` — production webRequest
  observer.
- `extension/src/mainWorldBridge.ts`,
  `extension/src/mainWorldRelay.ts` — MAIN-world bridge.
- `extension/src/backgroundOrchestrator.ts` — pure data plane.
- `extension/build.mjs` — standalone IIFE build for MAIN bridge.
- `tests/extension-e2e/fakeOj.ts`, `fakeOjScenarios.ts`,
  `capture-v4-network.spec.ts`, `webrequest-spike.spec.ts` — Fake
  OJ matrix.
- `tests/extension-e2e/fixtures.ts`, `servers.ts` — extension E2E
  test infrastructure (persistent context setup + Fake OJ route
  server + localhost API allowlist).
- `tests/fixtures/capture-v4/fake/{18-scenario}.json` — synthetic
  fixtures.
- `playwright.extension.config.ts` — extension E2E Playwright
  config.
- Modifications to `extension/src/background.ts`,
  `extension/src/attemptCapture.ts`, `extension/src/popup.ts`,
  `extension/src/popup.html`, `extension/src/installation.ts`,
  `extension/manifest.json`, `lib/capture/protocol.ts`,
  `lib/capture/attemptBundle.ts`, `lib/capture/events.ts`,
  `package.json`, `vitest.config.ts`, and the corresponding tests.

### Phase A10-A12 closeout (A10-A12)

- `tests/extension-e2e/database.ts` — disposable SQLite lifecycle
  helpers.
- `tests/extension-e2e/capture-v4-full-chain.spec.ts` — A10 smoke
  test (disposable DB + production artifact + scenario identity
  helpers + default-DB preservation).
- `tests/extension-e2e/global-setup.ts`,
  `tests/extension-e2e/global-teardown.ts` — disposable DB +
  extension profile teardown.
- `scripts/a10-bootstrap.mjs` — reusable bootstrap helper for
  future webServer-based A11+ integrations.
- `.github/workflows/quality-gate.yml` — local-only CI workflow
  that runs the canonical `npm run quality:gate`.
- `scripts/quality-gate.mjs` — added `extension:e2e` as stage 7.
- `tests/unit/qualityGate.test.ts` — updated stage-count assertion.
- `tests/extension-e2e/capture-v4-network.spec.ts` — added
  `test.skip` annotation for the worker-restart scenario.
- `docs/runbook.md`, `docs/architecture.md`, `COMPLIANCE.md` —
  reconciled with the actual implemented behavior.

## 4. Verification evidence

| Stage | Result |
|-------|--------|
| `npm run lint` (`--max-warnings=0`) | PASS |
| `npm run typecheck` | PASS |
| `npm run db:migrate` (disposable DB) | PASS |
| `npm run curriculum:validate` | PASS |
| `npm run test` | 80 files / 1528 passed / 1 skipped |
| `npm run e2e` (offline, extension-free) | 25 passed |
| `npm run extension:check` | 30 files / 950 passed; MV3 build OK; dist parity OK |
| `npm run extension:e2e` | 31 passed (1 known skip) |
| `npm run build` | 20/20-page production build |
| `npm run quality:gate` | EXIT 0 |
| `git diff --check` (no whitespace errors) | PASS |

All stages pass on Windows with bundled Chromium 138.0.7204.23.
The `extension:check` MV3 build produces `extension/dist/{background,
content, popup, main-world-bridge}.js` and the corresponding
sourcemaps.

## 5. Privacy and security boundary

- `parseSafeEvidence` (A1) rejects forbidden raw fields recursively
  (body / rawBody / responseBody / code / headers / requestHeaders /
  responseHeaders / extraHeaders / cookie / authorization / csrf /
  token / username / account at any depth, cycle-safe via WeakSet).
- `mainWorldBridge.ts` parser additionally rejects field count > 18,
  nested objects/arrays beyond schema, any A1-forbidden key, and
  unsafe URL-shaped endpoint keys.
- `mainWorldRelay.ts` re-runs the recursive forbidden-key gate before
  forwarding to background.
- No `any` / `as any` / `as unknown` / non-null assertion /
  `@ts-ignore` / `@ts-expect-error` in production code.
- The browser-restart path does not require a transient E1; the
  state machine reconstructs the synthetic E1 with
  `receivedAt = min(E3.receivedAt, confirmed.confirmedAt)`.
- `expireCaptureUiHints` alarm is re-established even on empty-diff
  prune via a `periodInMinutes: 1` fallback so the slot is never
  lost.

## 6. Independent review findings + fixes

### A10 review (HIGH)

- `startsWith` path check accepted sibling paths sharing the
  workspace prefix. Fixed in `9b81784` by replacing with a
  `relative()` check.
- Stale `.tmp/server-db-path.txt` could cause teardown to delete
  the wrong `.tmp` subtree. Fixed in `9b81784` by validating the
  path file basename + parent prefix.
- `.tmp/` was assumed to exist; `mkdtempSync` and `writeFileSync`
  would ENOENT on a clean checkout. Fixed in `9b81784` by adding
  `mkdirSync(..., { recursive: true })`.
- A0's `.tmp/playwright-extension` profile cleanup was replaced
  and the A10 test created a chromium profile that was not removed.
  Fixed in `9b81784` by restoring the profile walker in
  `global-teardown.ts`.

### A11 review (HIGH + MEDIUM + LOW)

- HIGH: workflow changed `npm ci` to `npm install` and moved
  `npx playwright install chromium` before dependency install.
  Fixed in `6401e17`.
- HIGH: workflow removed `permissions: contents: read`. Fixed in
  `6401e17`.
- MEDIUM: workflow narrowed triggers from `**` to `main,
  feature/**`. Fixed in `6401e17`.
- MEDIUM: workflow removed `timeout-minutes: 20`. Fixed in
  `6401e17`.
- LOW: docs still claimed `28 of 29 tests passing`. Fixed in
  `6401e17`.
- LOW: `quality-gate.mjs` had an incorrect comment about `build`
  chaining `extension:build` internally. Fixed in `6401e17`.

## 7. Explicit non-claims

- No real platform's `V4NetworkStatus` has been moved away from
  `uncharacterized`. AtCoder is the sole `production` DOM adapter;
  LeetCode, NowCoder, Codeforces, and Luogu remain `experimental`.
- No real OJ request, response, or page was observed during this
  Phase A closeout. The Fake OJ matrix drives synthetic-only
  fixtures.
- The A10 full-chain scope was reduced to a smoke test that proves
  the disposable SQLite lifecycle + production extension artifact +
  scenario identity helpers + default-DB preservation. The full
  orchestrated E2->E3 delivery probe (Fake OJ -> orchestrator ->
  real popup pair -> real API -> SQLite) is documented as a
  follow-on A13 (out of scope for Phase A).
- The service-worker-restart scenario is `test.skip`. It is a known
  test-harness limitation; the production orchestrator is
  unaffected. Adding an equivalent coverage requires a Playwright
  execution-context fix outside the scope of Phase A.
- V0 formal observation, replacement-RC work, and V0.5 remain
  blocked until Phase B (or a separately authorized characterization)
  succeeds.

## 8. Phase A closeout verdict

Phase A is `V4 infrastructure engineering PASS (scope-reduced)`:
the framework engineering pass (evidence core, correlator, state
machine, storage split, observer, bridge, orchestrator, Fake OJ
matrix, disposable DB lifecycle, gate integration, plan
reconciliation) is complete and every authoritative gate command
exits 0; the **full E2->E3->real-popup-pair->real-API->SQLite
delivery probe** and the **worker-restart recovery probe** remain
out of Phase A scope (scope-reduced A10 smoke test + `test.skip` for
the worker-restart harness limitation). Independent reviews for A10
and A11 found and fixed all Critical and Important findings; only
acknowledged Minor limitations remain.

The next explicit user decisions are:

- Phase B (NowCoder network pilot) requires fresh explicit
  authorization.
- A follow-on full-chain E2->E3 delivery probe (Fake OJ ->
  orchestrator -> real popup pair -> real API -> SQLite) plus a
  real worker-restart recovery probe is out of scope for Phase A and
  requires fresh explicit authorization if pursued.
- The replacement RC work remains blocked until V4 reaches the
  RC gates defined in the master plan section 19.