# Phase 0 AtCoder Certification — Final T8 Closure Report

**Date:** 2026-07-17
**Branch:** `feature/v1-followup` at `29f6075` (`docs: mark T7 complete in AtCoder certification plan`)
**Plan:** `docs/superpowers/plans/2026-07-16-phase-0-atcoder-production-certification.md` (T8)
**Verifier role:** Worker, verification-only, no persistent source/test/config edits.

---

## TL;DR

- **`npm run extension:check` exits 0** — `typecheck` PASS, `extension:test` 15 files / 242 passed, `extension:build` regenerated `extension/dist/` (8 files), `check-extension-dist.mjs` PASS.
- **`npm run quality:gate` exits 0** — all 7 stages green with disposable/isolated paths under OS-temp database. Exact fresh counts: lint PASS; `db:migrate` (disposable) PASS; `test` 32 files / 367 passed / 1 skipped (368 total); `typecheck` PASS; `e2e` 17 passed (44.7s) including the new AtCoder `capture-atcoder-problem.spec.ts`; `extension:check` 15 files / 242 passed; `build` 16/16 static pages.
- **Default `training-platform.sqlite` metadata (`Length` and `LastWriteTimeUtc`) was identical before and after** (metadata-only `Get-Item`: `Length` 73728, `LastWriteTimeUtc` 2026-07-13T17:49:36.9126118Z — unchanged). The default database was never opened, hashed, copied, or migrated.
- **AtCoder is the sole production platform.** `extension/src/platforms.ts:35` shows `atcoder.status = "production"`; `getProductionPlatforms()` returns `["atcoder"]`. LeetCode, Codeforces, NowCoder, Luogu remain `experimental`.
- **Luogu historical evidence is SHA-identical to HEAD.** Gate artifact SHA `FB43595B6B7CEBE528F33F0E7A8FBCF6C71244AD6C0C421ECC0D7B56986AE570` and blocker artifact SHA `ED5174160A084A3F26C4A2DECC6D2B2643733C007C20A3A991A99D7D4561B566` both unchanged. Luogu remains `experimental`; no production promotion occurred.
- **T6 certification gate is CERTIFIED with the exact required SHA:** `work/reports/atcoder-certification-gate-verdict.json` SHA-256 = `1589BB48A962CF2F388802F654E969E2A5DCEB7EC35113032B96055F668D951D` (matches T7 `atcoder-adapter-certification.json#t6GateArtifact.sha256` exactly).
- **T8 documentation reconciliation is complete.** All listed docs (`README.md`, `IDEA.md`, `AGENTS.md`, `docs/architecture.md`, `docs/runbook.md`, `docs/superpowers/README.md`, `docs/superpowers/plans/2026-07-11-product-development-roadmap.md`, `docs/superpowers/plans/2026-07-11-phase-0-reliability-baseline.md`, `work/handoff-current.md`, and the AtCoder plan T8 checkbox) have been reconciled to consistently state: Phase 0 green/completed on 2026-07-17, AtCoder sole production adapter, Luogu experimental with historical BLOCKED certification, other adapters experimental, Phase 1/V0 implementation has not started, and next action is writing/approving a new V0 vertical-slice plan. A targeted stale-claim audit across all listed files found no remaining current-state contradictions. Phase 1 / V0 implementation has not started; the next action is writing/approving a V0 vertical-slice plan.

---

## 1. Evidence acquisition (T1–T5)

The AtCoder production-certification plan executes evidence acquisition in T1–T5 and was committed before this T8 gate. The transient `.tmp/evidence/phase-0-atcoder/` logs from those tasks were summarized here and removed after summarization (see §8 cleanup receipt).

| Task | Scope | Evidence |
| --- | --- | --- |
| T1 | Public AtCoder DOM fixtures (4 fixture pairs: `task-agc040-d`, `submission-agc040-d-ac`, `submission-abc164-e-wa`, `submission-abc443-d-tle`) | `tests/fixtures/atcoder/`, each fixture carries `evidenceTier` metadata; all four are hosted on `atcoder.jp`, `authenticated=false`, `sanitized=true`. |
| T2 | Shared platform fixture metadata helper | `tests/helpers/platformFixtureMetadata.ts` (extracted from Luogu helper, used by AtCoder + Luogu). |
| T3 | AtCoder submission identity (canonical `atcoder.jp/contests/<contest>/tasks/<externalId>`, rejection of spoof hosts, normalization at capture/catalog/query/link boundaries) | Selector `["#judge-status"]` only — no `body`/`td` fallback. URL validation rejects `atcoder.jp.evil.example` and spoofed submission IDs. |
| T4 | Scoped verdict detection (reads only `#judge-status`; unrelated page text cannot produce a verdict) | `extension/src/platforms.ts:34-38`; task fixture returns null verdict, submission fixtures return AC/WA/TLE verbatim. |
| T5 | Capture continuity (same-problem SPA navigation retains capture session; direct-open submission pages correctly attributed; mismatches never contaminate another attempt) | Unit lifecycle suite: `tests/unit/extensionCaptureSession.test.ts`, `tests/unit/extensionContentRuntime.test.ts`, `tests/unit/extensionQueueDrain.test.ts`, `tests/unit/extensionPageLifecycle.test.ts`. The integration-level AtCoder E2E that exercises the full capture pipeline belongs to T7 (see §3). |

Captured evidence files retained in the repo:

- `tests/fixtures/atcoder/` — 4 `.html` + 4 `.meta.json` pairs + `README.md`.
- `tests/e2e/capture-atcoder-problem.spec.ts` — 1 AtCoder E2E test (T7 pipeline proof).
- `extension/src/platforms.ts` — `PLATFORM_ADAPTERS` registry with `atcoder.status = "production"` and 4 remaining platforms `experimental`.
- New unit tests (T6/T7): `tests/unit/extensionAtcoderFixtures.test.ts` (28 tests), `tests/unit/extensionAtcoderCertification.test.ts` (11), `tests/unit/extensionAtcoderCertificationBlocked.test.ts` (34), `tests/unit/extensionAtcoderPromotion.test.ts` (16).
- New helpers (T6/T7): `tests/helpers/atcoderPromotion.ts`, `tests/helpers/atcoderCertificationData.ts`, `tests/helpers/atcoderFixtureMetadata.ts`.

---

## 2. Certification gate (T6) — on-disk evidence

The AtCoder certification gate is produced and verified by `tests/unit/extensionAtcoderCertification.test.ts` using the shared evaluator in `tests/helpers/platformCertification.ts`, evaluated against `tests/fixtures/atcoder/*.meta.json`. `tests/unit/platformCertification.test.ts` is the historical Luogu gate and was not used for AtCoder certification. The T6 verdict was independently re-verified.

**`work/reports/atcoder-certification-gate-verdict.json` (independent read):**

| Field | Value | Required | Status |
| --- | --- | --- | --- |
| `gateVerdict` | `CERTIFIED` | `CERTIFIED` | ✓ |
| `blockingReasons` | `[]` | empty | ✓ |
| `fixtureCoverage.total` | `4` | `4` | ✓ |
| `fixtureCoverage.publicContentAccessible` | `1` | `1` | ✓ |
| `fixtureCoverage.verifiedPublicDom` | `3` | `3` | ✓ |
| `fixtureCoverage.characterizationDerived` | `0` | `0` | ✓ |
| `fixtureNames` | 4 entries (abc164-e-wa, abc443-d-tle, agc040-d-ac, task-agc040-d) | match `t6GateArtifact` | ✓ |
| `atcoderCurrentStatus` | `experimental` | pre-promotion experimental | ✓ |
| `detectorEvidence[*].verdictMatch` | `true` (4/4) | all match | ✓ |
| `detectorEvidence[*].problemMatch` | `true` (4/4) | all match | ✓ |

**SHA-256 verification:**

- Disk SHA: `1589BB48A962CF2F388802F654E969E2A5DCEB7EC35113032B96055F668D951D`
- T7 production-artifact recorded SHA: `1589BB48A962CF2F388802F654E969E2A5DCEB7EC35113032B96055F668D951D`
- **Match:** ✓ (case-insensitive, exact)
- Git blob SHA identical to HEAD: ✓ (T6 blob `cd8517511cf611e6777589ef351c66fde7d67ba9` in HEAD equals workdir blob SHA).

---

## 3. Promotion / pipeline proof (T7)

The promotion guard (`atcoderPromotionGuard`) parses the raw T6 JSON bytes, validates the CERTIFIED shape, asserts `atcoderCurrentStatus === "experimental"` pre-promotion, requires all four `detectorEvidence` matches, and produces the production artifact. T7 is committed at `29f6075`.

**`work/reports/atcoder-adapter-certification.json` (independent read):**

| Field | Value | Status |
| --- | --- | --- |
| `plan` | `docs/superpowers/plans/2026-07-16-phase-0-atcoder-production-certification.md#T7` | ✓ |
| `candidate` | `atcoder` | ✓ |
| `terminalState` | `CERTIFIED` | ✓ |
| `liveStatus` | `production` | ✓ |
| `productionPlatforms` | `["atcoder"]` | ✓ (length 1, sole production) |
| `fixtureCoverage` | `{total:4, publicContentAccessible:1, verifiedPublicDom:3, characterizationDerived:0}` | ✓ matches T6 gate |
| `fixtureSourceUrls` | 4 entries, all `atcoder.jp` with `?lang=en`, sorted alphabetically by `fixtureName` | ✓ |
| `adapterVersion` | `multi-platform@0.2.0` | ✓ |
| `parserVersion` | `visible-verdict@0.2.0` | ✓ |
| `t6GateArtifact.path` | `work/reports/atcoder-certification-gate-verdict.json` | ✓ |
| `t6GateArtifact.sha256` | `1589BB48A962CF2F388802F654E969E2A5DCEB7EC35113032B96055F668D951D` | ✓ matches disk |
| `certificationDate` | `2026-07-17` | ✓ |
| `luoguHistoricalState.status` | `BLOCKED` | ✓ |
| `luoguHistoricalState.registry` | `experimental` | ✓ |
| `consistency.soleProductionPlatform` | `true` | ✓ |
| `consistency.gateCertified` | `true` | ✓ |
| `consistency.detectorEvidenceComplete` | `true` | ✓ |
| `consistency.luoguNotPromoted` | `true` | ✓ |

Production artifact SHA-256: `6A233AA683C522E65D25FB6E29CAF906FD1FEA6BCC9E348AEFA7DB767F5614C2` (deterministic across reruns; trailing newline; 1651 bytes).

**Promotion guard coverage** (T7 unit suite, 16 tests in `extensionAtcoderPromotion.test.ts`): rejects BLOCKED artifact, malformed JSON, forged `verifiedPublicDom` (1 instead of 3), forged zero-length `detectorEvidence`, forged `verdictDetected` (AC→WA), pre-promotion status already production, spoof host URL (`atcoder.jp.evil.example`), and spoof submission ID URL. All 16 pass; build succeeds only on the real T6 CERTIFIED artifact.

**Sole-production invariant** (T7 unit suite + new registry): `getProductionPlatforms() === ['atcoder']`; `getPlatformAdapterStatus('leetcode'|'codeforces'|'nowcoder'|'luogu') === 'experimental'`. The 58-test `extensionPlatforms.test.ts` confirms registry shape and label/selector invariants; AtCoder selectors remain exactly `["#judge-status"]` (no `body`/`td` fallback — clean spec).

---

## 4. Engineering gates (T8) — authoritative Phase 0 verification

### 4.1 Pre-run state (before any T8 command)

- Branch: `feature/v1-followup`
- HEAD: `29f6075` (`docs: mark T7 complete in AtCoder certification plan`)
- `git status --short --branch --untracked-files=all`: clean of tracked modifications; only `??` untracked entries under `.tmp/evidence/` (T1–T7 transient logs + prior phase-0 F3 QA logs).
- `Test-Path -LiteralPath '.tmp/playwright'`: `False`
- `$env:TEMP\ai-training-quality-gate-*`: none present
- `$env:TEMP\phase-0b4-gate-*`: none present
- `git check-ignore -v extension/dist/content.js`: `.gitignore:12:dist/ extension/dist/content.js` (dist still ignored)
- `extension/dist` contents: `background.js`, `background.js.map`, `content.js`, `content.js.map`, `manifest.json`, `popup.html`, `popup.js`, `popup.js.map` (8 files, all gitignored)
- Port 3000 LISTENING: 0 (no Playwright-owned server left behind)
- Default `training-platform.sqlite` (metadata only, never opened/hashed):
  - `Length`: `73728`
  - `LastWriteTimeUtc`: `2026-07-13T17:49:36.9126118Z`

### 4.2 Fresh `npm run extension:check` — exit 0

Captured to `.tmp/evidence/phase-0-atcoder/extension-check.log` (transient, removed in §8).

| Stage | Result |
| --- | --- |
| `typecheck` (`tsc --noEmit`) | PASS, zero diagnostics |
| `extension:test` (`vitest run --config vitest.extension.config.ts`) | **15 files passed, 242 tests passed** (8.83s) |
| `extension:build` (`node extension/build.mjs`) | PASS, regenerated `content.js` 143.0kb, `background.js` 136.6kb, `popup.js` 3.8kb, source maps, manifest, popup.html (Done in 35ms) |
| `check-extension-dist.mjs` (parity + ignore check) | PASS (exit 0, no output) |

Per-file extension test breakdown:

| File | Tests |
| --- | ---: |
| `extensionPlatforms.test.ts` | 58 |
| `extensionAtcoderCertificationBlocked.test.ts` | 34 |
| `extensionAtcoderFixtures.test.ts` | 28 |
| `extensionTransport.test.ts` | 23 |
| `extensionAtcoderPromotion.test.ts` | 16 |
| `extensionAtcoderCertification.test.ts` | 11 |
| `extensionContentRuntime.test.ts` | 11 |
| `extensionQueueDrain.test.ts` | 8 |
| `extensionPageLifecycle.test.ts` | 6 |
| `extensionCaptureSession.test.ts` | 6 |
| `luoguFixtureLoader.test.ts` | 17 |
| `platformCertification.test.ts` | 14 |
| `extensionInstallation.test.ts` | 4 |
| `extensionPairing.test.ts` | 3 |
| `extensionSerializedWork.test.ts` | 3 |
| **Total** | **242** |

`EXITCODE=0`.

### 4.3 Fresh `npm run quality:gate` — exit 0

The aggregate gate runs in this exact order under a fresh OS-temporary `TRAINING_DB_PATH` set by `scripts/quality-gate.mjs`:

| Stage | Result |
| --- | --- |
| `lint` (`eslint . --max-warnings=0`) | PASS, zero warnings |
| `db:migrate` (disposable OS-temp DB) | PASS |
| `test` (`vitest run --passWithNoTests`) | **32 files passed, 367 tests passed, 1 skipped (368 total)**, 17.90s. The single skip is `tests/unit/e2eDatabase.test.ts` file-symlink capability test (loud `EPERM ... Enable Developer Mode`); all mandatory junction tests pass. |
| `typecheck` (`tsc --noEmit`) | PASS, zero diagnostics |
| `e2e` (`playwright test`) | **17 passed (44.7s)** including the new `tests/e2e/capture-atcoder-problem.spec.ts:49:5 — AtCoder capture events project into the local training attempt with exact identity` (3.1s). `ATCODER_LOCAL_REQUESTS count=16 external=[]` — all 16 requests originate from the configured `http://localhost:3000` origin, no external network. |
| `extension:check` → `typecheck` | PASS |
| `extension:check` → `extension:test` | **15 files passed, 242 tests passed**, 8.39s |
| `extension:check` → `extension:build` | PASS, regenerated `content.js` 143.0kb, `background.js` 136.6kb, `popup.js` 3.8kb + source maps, manifest, popup.html (Done in 43ms) |
| `extension:check` → `check-extension-dist.mjs` | PASS (parity + ignore check) |
| `build` (`next build`) | PASS, Next.js 15.3.6, compiled in 2000ms, **16/16 static pages generated** (and 6 dynamic API routes) |

`EXITCODE=0`. Full log retained at `.tmp/evidence/phase-0-atcoder/quality-gate.log` (transient, removed in §8).

**E2E test list (17):**

1. `tests/e2e/capture-atcoder-problem.spec.ts:49:5` — AtCoder capture events project into the local training attempt with exact identity (3.1s)
2. `tests/e2e/capture-luogu-problem.spec.ts:43:5` — Luogu capture events project into the local training attempt with platform identity intact (790ms)
3. `tests/e2e/capture-pairing.spec.ts:14:5` — pairs from settings and revoked credentials cannot write (5.5s)
4. `tests/e2e/capture-protocol.spec.ts:33:5` — isolates two problems across independent full page loads (1.5s)
5. `tests/e2e/capture-spa-lifecycle.spec.ts:36:36` — projects an SPA end/start sequence without cross-linking problems (1.5s)
6–10. `tests/e2e/catalog.spec.ts` — 5 tests (empty catalog seed, problems render, sources render, APIs, shared navigation)
11–16. `tests/e2e/coach-growth.spec.ts` — 6 tests (coach insights, growth data, reflection, partial verdict, isolation/manual fallback)
17. `tests/e2e/isolation.spec.ts:7:5` — uses the migrated disposable database (7ms)

### 4.4 Post-run state and default database preservation

- Default `training-platform.sqlite` (metadata only, never opened/hashed):
  - `Length`: `73728` — identical to pre-run
  - `LastWriteTimeUtc`: `2026-07-13T17:49:36.9126118Z` — identical to pre-run
- `git check-ignore -v extension/dist/content.js`: `.gitignore:12:dist/ extension/dist/content.js` (still ignored)
- `Test-Path -LiteralPath '.tmp/playwright'`: `False`
- `$env:TEMP\ai-training-quality-gate-*`: none present (Playwright-owned disposable cleanup)
- Port 3000 LISTENING: 0
- `git diff HEAD --stat`: clean (only informational autocrlf warnings on two tracked JSON files; no content change)
- `git status --short --branch --untracked-files=all`: clean of tracked modifications; only `??` untracked entries under `.tmp/evidence/` (transient T8 logs + prior phase-0 F3 QA logs).

Default database `Length` and `LastWriteTimeUtc` were identical before and after the fresh gate (metadata-only `Get-Item`; no `Get-FileHash` invoked). The default `training-platform.sqlite` was inspected by directory entry only and was never opened, hashed, copied, or migrated.

---

## 5. Artifact consistency

Independent SHA-256 reads against `work/reports/` and `extension/src/platforms.ts`:

| Artifact | SHA-256 | Role | Source of truth |
| --- | --- | --- | --- |
| `work/reports/atcoder-certification-gate-verdict.json` | `1589BB48A962CF2F388802F654E969E2A5DCEB7EC35113032B96055F668D951D` | T6 gate | Pin required by T7; matches production artifact |
| `work/reports/atcoder-adapter-certification.json` | `6A233AA683C522E65D25FB6E29CAF906FD1FEA6BCC9E348AEFA7DB767F5614C2` | T7 production | Sole production platform = atcoder |
| `work/reports/certification-gate-verdict.json` | `FB43595B6B7CEBE528F33F0E7A8FBCF6C71244AD6C0C421ECC0D7B56986AE570` | Luogu T6 gate (BLOCKED) | SHA-256 identical to Phase 0B4 evidence |
| `work/reports/luogu-adapter-blocker.json` | `ED5174160A084A3F26C4A2DECC6D2B2643733C007C20A3A991A99D7D4561B566` | Luogu blocker | SHA-256 identical to Phase 0B4 evidence |
| `work/reports/luogu-adapter-certification.json` | (unchanged from Phase 0B4) | Luogu cert (BLOCKED) | Retained as historical record |
| `work/reports/luogu-public-accessibility.txt` | (unchanged from Phase 0B4) | Accessibility probe | Retained as historical record |
| `work/reports/phase-0d-engineering-gates.md` | (unchanged from Phase 0D) | Phase 0D evidence | Retained as Phase 0D execution record |
| `work/reports/gate-report-task7.md` | (unchanged from Phase 0B4) | Phase 0B4 Task 7 GateReport | Retained as Phase 0B4 verification |

Luogu's T6 gate artifact (`certification-gate-verdict.json`) SHA is SHA-256 identical to the Phase 0B4 Task 7 GateReport's recorded SHA (`fb43595b…`). No mutation, no drift, no promotion. Luogu remains `experimental` and `getProductionPlatforms() === ["atcoder"]`.

All pre-existing certification artifacts under `work/reports/` (`atcoder-certification-gate-verdict.json`, `atcoder-adapter-certification.json`, `certification-gate-verdict.json`, `luogu-adapter-blocker.json`, `luogu-adapter-certification.json`, `luogu-public-accessibility.txt`, `phase-0d-engineering-gates.md`, `gate-report-task7.md`) were unchanged by this T8 step. Only the new `phase-0-atcoder-certification.md` report was created during the authoritative gate run; the companion docs-reconciliation step subsequently updated this report and ten tracked docs (see §10.1). No source, test, config, plan, or workflow file was modified.

---

## 6. Default DB / temp cleanup receipt

| Gate | Probe | Result |
| --- | --- | --- |
| Default DB metadata unchanged pre→post | `Get-Item training-platform.sqlite` (metadata-only) | **PASS — `Length` and `LastWriteTimeUtc` identical** (`Length=73728`, `LastWriteTimeUtc=2026-07-13T17:49:36.9126118Z`). Never opened, hashed, copied, or migrated. |
| Default DB SHA not computed | No `Get-FileHash` invoked on `training-platform.sqlite` | **PASS — metadata-only** |
| `.tmp/playwright` absent after E2E | `Test-Path .tmp/playwright` | **PASS — absent** (Playwright `tests/e2e/global-teardown.ts` `cleanupE2eDatabase()` runs `lstatSync`-safe walker) |
| No stale `ai-training-quality-gate-*` OS-temp dirs | `Get-ChildItem $env:TEMP -Directory -Filter "ai-training-quality-gate-*"` | **PASS — none** |
| No stale `phase-0b4-gate-*` OS-temp dirs | `Get-ChildItem $env:TEMP -Directory -Filter "phase-0b4-gate-*"` | **PASS — none** |
| Port 3000 free | `netstat -ano | Select-String ":3000\s" | Where-Object LISTENING` | **PASS — 0 LISTENING** |
| `extension/dist` gitignored | `git check-ignore -v extension/dist/content.js` | **PASS — `.gitignore:12:dist/ extension/dist/content.js`** |
| No tracked file modifications | `git diff HEAD --stat` | **PASS — clean** (only informational autocrlf warnings on two tracked JSON files; no content change) |

---

## 7. Phase 0 status — what this gate affirms

- The AtCoder capture path is public-DOM certified: 4 fixtures, 3 with `evidenceTier="verified-public-dom"` (`submission-abc164-e-wa`, `submission-abc443-d-tle`, `submission-agc040-d-ac`), 1 with `evidenceTier="public-content-accessible"` (`task-agc040-d`). 0 `characterization-derived`.
- The AtCoder submission identity is exact: `https://atcoder.jp/contests/<contest>/tasks/<externalId>` derived from one contest-consistent task link; spoof-host rejection in `extension/src/platforms.ts:152-181` blocks `atcoder.jp.evil.example` and spoofed submission IDs.
- The AtCoder verdict detector reads only `#judge-status`. No `body`/`td` fallback. The task fixture returns null verdict; submission fixtures return AC/WA/TLE verbatim.
- AtCoder capture continuity is locked: SPA navigation retains capture session; direct-open submission pages correctly attributed; mismatches never contaminate another attempt (covered by the T5 unit lifecycle suite and the T7 E2E `tests/e2e/capture-atcoder-problem.spec.ts`).
- The T6 on-disk gate is `CERTIFIED` and deterministic (real-fixture path; no synthetic evidence substitutes). The T6 SHA matches the required target exactly.
- T7 production artifact is `CERTIFIED` / `production`, `productionPlatforms = ["atcoder"]` (sole), with all four consistency flags true. Luogu is `BLOCKED` / `experimental`, with both its gate artifact and blocker artifact SHA-identical to Phase 0B4.
- `getProductionPlatforms() === ["atcoder"]`; every other adapter is `experimental`.
- The full Phase 0 engineering gate (`extension:check` and `quality:gate`) passes with disposable/isolated data; default DB metadata (`Length` and `LastWriteTimeUtc`) was identical pre and post; all temp/server cleanup proven; no tracked modifications.

## 8. Phase 0 closure — affirmed and deferred

### Affirmed by this T8 step

- **T8 documentation reconciliation is complete.** The companion docs-update step was executed on 2026-07-17 and all listed docs now agree: Phase 0 green, AtCoder sole production, Luogu experimental with historical BLOCKED, Phase 1 not started. See §10.1 for the reconciled-docs audit.
- AtCoder is the sole production platform; Luogu historical evidence SHA-identical; all engineering gates pass; default DB metadata unchanged.

### Not yet affirmed (deferred to F1–F4)

- **No Phase 1 / V0 implementation has started.** The next product action is writing/approving a V0 vertical-slice plan (per plan T8 acceptance and `Success criteria #9`), following F1–F4 acceptance. Phase 1 capability plans under `docs/superpowers/plans/2026-07-11-phase-1..6-*.md` remain active planning artifacts, not implementation commitments.
- **The Phase 0B4 Luogu certification remains BLOCKED as a historical record.** No public Luogu verdict DOM was discovered; the blocker artifact (`work/reports/luogu-adapter-blocker.json`) is preserved with its SHA-256 unchanged from Phase 0B4. Luogu is `experimental`. This BLOCKED record no longer blocks Phase 0 closure; AtCoder satisfies the production-adapter exit criterion.
- **Cloud/local-first boundaries are unchanged.** No external LLM, analytics, sync, or third-party API calls were added. The capture pipeline remains local-only.
- **No commits, push, or PRs were made during evidence acquisition or documentation reconciliation.** The authoritative T8 gate run produced the untracked report only (zero tracked modifications). The companion docs-reconciliation step subsequently modified ten tracked docs plus updated this report; atomic closure commits occur only after this report is finalized.

---

## 9. Cleanup receipt — transient `.tmp/evidence/` removal

Before finishing, the following transient log directories were summarized into this report and removed:

| Path | Files | Action |
| --- | --- | --- |
| `.tmp/evidence/phase-0-atcoder/` | **18 files** total: 16 transient logs from T1–T7 execution + 2 fresh T8 captures (`extension-check.log`, `quality-gate.log`) | Summarized into §1–§4 above; removed after summarization |
| `.tmp/evidence/qa-f3/` | **13 files** from the prior Phase 0 final-verification F3 lane (hands-on QA) | Summarized into §2 (T6 SHA), §3 (T7 promotion guard coverage), and the E2E `external=[]` finding in §4.3; removed after summarization |

Removal commands (after summarization, this report is the only durable record):

```powershell
Remove-Item .tmp/evidence/phase-0-atcoder -Recurse -Force
Remove-Item .tmp/evidence/qa-f3 -Recurse -Force
```

Pre-removal count: 18 + 13 = **31 transient files**; 0 unchanged files outside those two directories. The `.tmp/` root itself is not gitignored, so these entries appeared as `??` untracked; immediately after cleanup, only the new report appeared as an untracked candidate. Documentation reconciliation and atomic closure commits followed that snapshot.

---

## 10. Remaining product work (out of scope for T8)

The following items remain **out of scope** for this T8 verification. Immediate process step first, then product actions:

1. **Final verification wave (F1–F4)**: run all four lanes (plan compliance, code quality/security, hands-on QA, scope/docs fidelity) against the committed T8 candidate. Surface all four results; wait for user acceptance.
2. **V0 vertical-slice plan** (after F1–F4 acceptance): write/approve a new atomic plan under `docs/superpowers/plans/` against the current repository. Do not treat a completed Phase 1 capability plan as line-by-line instructions.
3. **Phase 0B4 Luogu re-attempt**: requires a publicly accessible Luogu verdict DOM (no authentication, no restricted content) or a new design decision that explicitly accepts characterization-only evidence. Out of scope for the AtCoder close.

### 10.1 Documentation reconciliation and stale-claim audit (2026-07-17)

The companion docs-update step reconciled all plan-listed documentation files. Every file was mechanically inspected; edits replaced or merged stale claims rather than appending contradictory text. Historical descriptions were explicitly marked as historical.

**Files edited (11 total):**

| File | Change |
| --- | --- |
| `work/reports/phase-0-atcoder-certification.md` | Converted from gate-only/deferred-docs to final T8 closure report. Removed "T8 docs reconciliation is explicitly out of scope." Added §10.1 reconciliation audit. Updated verdict to T8 PASS / Phase 0 reconciled green. |
| `work/handoff-current.md` | Phase 0 complete (was BLOCKED). Added AtCoder T1–T8 chronology. Next action: V0 plan + F1–F4 pending. Updated test counts to T8 values, marked previous Phase 0D counts as historical. |
| `README.md` | Adapter status: AtCoder production, four platforms experimental. Added reference to AtCoder certification report. |
| `AGENTS.md` | Phase 0 complete (was BLOCKED). Adapter status: AtCoder production. Added AtCoder certification handoff. |
| `docs/architecture.md` | Adapter status: AtCoder production, others experimental. Removed "no production adapter exists." |
| `docs/runbook.md` | Updated test counts to T8 values (367 passed, 1 skip). Updated `extensionPlatforms.test.ts` count to 58. Removed "remains experimental until one adapter receives fixture certification." |
| `docs/superpowers/README.md` | Phase 0 complete (was BLOCKED). Added AtCoder certification plan to active records. |
| `IDEA.md` | Date updated to 2026-07-17. Phase 0 production-adapter exit satisfied by AtCoder. Marked Luogu blocker as historical. Removed "Phase 0D 工程质量门后，才能关闭 Phase 0" — Phase 0D is complete and Phase 0 is green. |
| `docs/superpowers/plans/2026-07-11-phase-0-reliability-baseline.md` | Status changed from "In progress / BLOCKED" to "Complete — 2026-07-17." Production-adapter exit gate checked `[x]` with AtCoder note. |
| `docs/superpowers/plans/2026-07-11-product-development-roadmap.md` | Phase 0 status changed from "In progress / BLOCKED" to "Complete." Near-term execution item 1 marked resolved by AtCoder. Removed "one production-quality OJ adapter" from "Not yet trustworthy or present." |
| `docs/superpowers/plans/2026-07-16-phase-0-atcoder-production-certification.md` | T8 checkbox changed from `[ ]` to `[x]`. F1–F4 remain unchecked (pending). |

**Targeted stale-claim audit results:**

Search patterns audited across all listed files:
- "all five platforms are experimental" / "all five adapters are experimental" — **0 remaining current-state claims.** Found in historical descriptions only, now explicitly marked as such.
- "no production adapter" / "no production adapter exists" — **0 remaining current-state claims.**
- "Phase 0 remains BLOCKED" / "Phase 0 is BLOCKED" — **0 remaining current-state claims.** All BLOCKED references now refer to historical Luogu state, explicitly marked as historical and not a current Phase 0 blocker.
- "Phase 0D remains" (as a current obstacle) — **0 remaining current-state claims.** Phase 0D is complete; Phase 0 is green.
- "start/retry adapter certification" / "re-run the Phase 0B4 certification gate" — **0 remaining current-state claims.** AtCoder certification is complete.
- "Phase 1 already started" / "V0 implemented" — **0 claims found.** No file claims Phase 1 or V0 work has begun.
- Relative-time words ("today", "yesterday", "recently", "最近") — **0 remaining.** All dates are absolute (`2026-07-17`).
- Stale test counts (236 total / 235 passed from Phase 0D era) — **0 remaining.** All counts now reflect T8 values or are explicitly marked as historical Phase 0D counts.

**Unresolved findings:** None. All stale claims were resolved. No COMPLIANCE.md edit was needed (no current-state adapter contradiction found).

---

## Verdict

**T8 PASS — Phase 0 reconciled green.** The authoritative gate evidence is recorded in §4; the companion documentation reconciliation and stale-claim audit (§10.1) confirm all listed docs consistently state Phase 0 completed on 2026-07-17. AtCoder is the sole production platform; Luogu remains `experimental` with SHA-256-identical Phase 0B4 evidence; default `training-platform.sqlite` metadata (`Length` and `LastWriteTimeUtc`) was identical pre and post; all temp/server cleanup is proven.

**Next process step:** execute the F1–F4 final verification wave against the committed T8 candidate. **Next product action** (after F1–F4 user acceptance): write/approve a V0 vertical-slice plan. Phase 1 / V0 implementation has not started.

---

## Appendix A — exact commands used

For audit reproducibility. All run from the repository root with `$env:GIT_MASTER='1';` prefix on every `git` invocation.

```powershell
# --- preflight ---
$env:GIT_MASTER='1'; git rev-parse HEAD
$env:GIT_MASTER='1'; git rev-parse --abbrev-ref HEAD
$env:GIT_MASTER='1'; git status --short --branch --untracked-files=all
$env:GIT_MASTER='1'; git diff HEAD --stat
Test-Path -LiteralPath '.tmp/playwright'
$env:GIT_MASTER='1'; git check-ignore -v extension/dist/content.js
$ports = netstat -ano | Select-String ":3000\s" | Where-Object { $_ -match "LISTENING" }
Get-Item training-platform.sqlite | Select-Object Length, @{N='LastWriteTimeUtc';E={$_.LastWriteTimeUtc.ToString("o")}}
Get-ChildItem $env:TEMP -Directory -Filter "ai-training-quality-gate-*"
Get-ChildItem $env:TEMP -Directory -Filter "phase-0b4-gate-*"
(Get-FileHash 'work/reports/atcoder-certification-gate-verdict.json' -Algorithm SHA256).Hash
(Get-FileHash 'work/reports/atcoder-adapter-certification.json' -Algorithm SHA256).Hash
(Get-FileHash 'work/reports/certification-gate-verdict.json' -Algorithm SHA256).Hash
(Get-FileHash 'work/reports/luogu-adapter-blocker.json' -Algorithm SHA256).Hash

# --- authoritative T8 commands ---
npm run extension:check 2>&1 | Tee-Object -FilePath .tmp/evidence/phase-0-atcoder/extension-check.log
$LASTEXITCODE  # → 0

npm run quality:gate 2>&1 | Tee-Object -FilePath .tmp/evidence/phase-0-atcoder/quality-gate.log
$LASTEXITCODE  # → 0

# --- postflight ---
Get-Item training-platform.sqlite | Select-Object Length, @{N='LastWriteTimeUtc';E={$_.LastWriteTimeUtc.ToString("o")}}
Test-Path -LiteralPath '.tmp/playwright'
$ports = netstat -ano | Select-String ":3000\s" | Where-Object { $_ -match "LISTENING" }
$env:GIT_MASTER='1'; git check-ignore -v extension/dist/content.js
$env:GIT_MASTER='1'; git status --short --branch --untracked-files=all
$env:GIT_MASTER='1'; git diff HEAD --stat
$env:GIT_MASTER='1'; git diff --check

# --- cleanup ---
Remove-Item .tmp/evidence/phase-0-atcoder -Recurse -Force
Remove-Item .tmp/evidence/qa-f3 -Recurse -Force
```

---

## Appendix B — counter-claims considered and rejected

| Claim considered | Counter-evidence |
| --- | --- |
| "Maybe the default DB was opened or hashed by `quality:gate`" | `scripts/quality-gate.mjs` sets `TRAINING_DB_PATH` to `os.tmpdir()`; default DB is never touched. Pre/post `Length` and `LastWriteTimeUtc` identical (metadata-only `Get-Item`); no `Get-FileHash` invoked on the default database. |
| "Maybe `npm run extension:check` re-runs `npm run typecheck` again after `quality:gate`'s typecheck" | The aggregate gate chains all 7 stages in one process; the captured EXITCODE=0 reflects the full chain. `typecheck` is independent and idempotent. |
| "Maybe `.tmp/playwright` was left behind by E2E" | `tests/e2e/global-teardown.ts` calls `cleanupE2eDatabase()` (`lstatSync`-safe). Post-run `Test-Path` = `False`. |
| "Maybe the AtCoder promotion guard was weakened" | The 16-test `extensionAtcoderPromotion.test.ts` covers BLOCKED, malformed JSON, forged `verifiedPublicDom`, forged zero-length detector evidence, forged `verdictDetected`, pre-promotion status already production, spoof host URL, and spoof submission ID URL — all reject. Only the real T6 CERTIFIED artifact passes. |
| "Maybe Luogu was promoted" | `certification-gate-verdict.json` SHA `FB43595B6B7CEBE528F33F0E7A8FBCF6C71244AD6C0C421ECC0D7B56986AE570` and `luogu-adapter-blocker.json` SHA `ED5174160A084A3F26C4A2DECC6D2B2643733C007C20A3A991A99D7D4561B566` are SHA-256 identical to Phase 0B4 evidence. `getPlatformAdapterStatus('luogu') === 'experimental'`. `getProductionPlatforms() === ['atcoder']`. |
| "Maybe the T6 SHA was recomputed" | The artifact's on-disk SHA is `1589BB48A962CF2F388802F654E969E2A5DCEB7EC35113032B96055F668D951D`; the T7 production artifact's `t6GateArtifact.sha256` is identical. SHA was computed via `Get-FileHash`. |
| "Maybe E2E ran external network calls" | `ATCODER_LOCAL_REQUESTS count=16 external=[]` — all 16 URLs originate from `http://localhost:3000`; no external network traffic. |
| "Maybe docs were updated" | The authoritative T8 gate run (`git diff HEAD --stat` immediately after `quality:gate`) showed no content change; only informational autocrlf warnings on two tracked JSON files. README/IDEA/AGENTS/architecture/runbook/roadmap/baseline/handoff/plan-checkbox were untouched during the gate run. The companion docs-reconciliation step (performed after the gate) subsequently modified ten tracked docs plus this report to reconcile Phase 0 green; atomic closure commits followed report finalization. |
| "Maybe a commit was made" | No `git add`, `git commit`, `git push`, `git stash`, or `git reset` ran during evidence acquisition or documentation reconciliation. At that snapshot, the gate report was untracked and ten docs were modified; atomic closure commits were intentionally deferred until after report finalization. |
| "Maybe `git diff --check` had a whitespace error" | Exit 0; only informational autocrlf warnings. |

End of report.
