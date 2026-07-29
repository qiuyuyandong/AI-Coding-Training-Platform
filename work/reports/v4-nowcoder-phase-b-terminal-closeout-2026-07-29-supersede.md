# NowCoder V4 Phase B Terminal Closeout — B8 Missing-E3 Layer Supersede

**Date:** 2026-07-29
**Supersedes:** `work/reports/v4-nowcoder-phase-b-terminal-closeout-2026-07-28.md`
**for the missing-E3 ingress layer only.**
**Superseding report:** `work/reports/v4-nowcoder-e3-ingress-repair-2026-07-29.md`
**Implementing commit:** `c26c578 feat(v4): repair NowCoder E3 ingress through pure
coordinator + self-healing MV3 injection`

## Purpose

This document records the precise, scoped supersede relationship between the
2026-07-28 Phase B terminal closeout verdict and the 2026-07-29 E3 ingress
repair. It does **not** rewrite the historical closeout; the original 2026-07-28
verdict remains authoritative for everything except the missing-E3 ingress
layer. It also does **not** authorize any NowCoder production promotion, RC,
V0 acceptance, or V0.5 work.

## Supersede Scope (narrow)

| Phase B dimension | 2026-07-28 verdict | 2026-07-29 verdict | Authoritative evidence |
|---|---|---|---|
| B0 authorization | PASS | PASS (unchanged) | `work/reports/v4-nowcoder-characterization-authorization.md` |
| B1 schema | PASS | PASS (unchanged) | `extension/src/networkTranscriptContract.ts` |
| B2 diagnostic mode | PASS | PASS (unchanged) | B2 module + privacy review APPROVED 2026-07-27 |
| B3 browse-only witness | PASS | PASS (unchanged) | `work/reports/v4-nowcoder-b3-lifecycle-closeout-2026-07-28.md` |
| B4 characterization | PASS | PASS (unchanged) | `work/reports/v4-nowcoder-b4-submission-characterization-2026-07-28.md` |
| B5 design | PASS | PASS (unchanged) | `docs/superpowers/plans/2026-07-26-v4-nowcoder-network-adapter-design.md` |
| B6 strict adapter | PASS | PASS (unchanged) | `extension/src/adapters/nowcoder/network.ts` |
| B7 production-dist synthetic | PASS | PASS (unchanged) | `05555ef` |
| **B8 missing-E3 ingress layer** | **BLOCKED** | **engineering PASS (superseded)** | `work/reports/v4-nowcoder-e3-ingress-repair-2026-07-29.md` + `c26c578` |
| **B8 same-build real observation** | **BLOCKED** | **engineering PASS + real-Chrome observation PASS (superseded)** | Tasks 5/6 in `c26c578` |
| **NowCoder adapter readiness** | `experimental` | **`experimental` (unchanged)** | `extension/src/adapters/registry.ts` line 60-61 |
| **Production promotion authorization** | none | none — **requires separate reviewed decision** | this report |

## Engineering Fix (c26c578)

The B8 blocker was structurally upstream of E3 parsing and correlation: the
real NowCoder result document did not run the declarative content script, so
no verdict candidate reached the background worker. The repair adds three
closed surfaces and one closed control-plane persistence pair:

1. **Pure ingress coordinator** — `extension/src/contentIngress.ts`
   (closed 7-input / 5-effect reducer; exact URL gate synchronized with the
   existing `readResultPageSubmissionId` in
   `extension/src/adapters/nowcoder/network.ts:272-282`; bounded 100-entry
   transient registry; closed `CONTENT_RUNTIME_READY` value guard; no
   `chrome.*`, no DOM, no wall clock, no I/O).
2. **Idempotent content bootstrap** — `extension/src/contentBootstrap.ts`
   (three-state sentinel `installed | installing | inactive`; second
   injection reannounces readiness but cannot install a duplicate runtime;
   capture-disabled install clears the sentinel).
3. **Self-healing background injection** — `extension/src/background.ts`
   (four `chrome.webNavigation` listeners plus `reconcileOpenNowCoderResultTabs`
   at worker initialization and `chrome.runtime.onStartup`; programmatic
   `chrome.scripting.executeScript({ world: "ISOLATED", files: ["content.js"],
   injectImmediately: true, target: { tabId, documentIds: [docId] } })` with
   `frameIds: [0]` fallback).
4. **Closed control-plane persistence** — `session.contentIngressReady`
   (max 20, `ready_record` only) and `session.contentIngressDiagnostics`
   (max 20, `injection_failed` reason codes only). Neither key enters capture
   state.

`extension/manifest.json` adds `scripting` and `webNavigation` permissions;
existing `content_scripts` matches and per-host `host_permissions` remain
unchanged. No `<all_urls>`, no `tabs`, no `activeTab`, no `allFrames`, no
MAIN-world execution.

## Real-Chrome Observation Evidence

Both Tasks 5 and 6 executed on the production-built `extension/dist` rebuilt
from `c26c578`. The bundled Chromium resolves `ac.nowcoder.com` through the
Playwright `context.route` interceptor; the popup-pairing and
`POST /api/capture/attempts` paths travel through the local Next.js server on
`http://localhost:3000`.

- **Task 5 (no characterization, no submit, direct historical result
  navigation):** `https://ac.nowcoder.com/acm/contest/view-submission?submissionId=84258557`
  observes exactly one `contentIngressReady` (`{ reason: "ready_record",
  frameId: 0, documentId: uuid }`), exactly one unmatched E3
  (`externalSubmissionId: "84258557"`,
  `problemExternalId: "acm/contest/18839/1001"`, `verdict: "Wrong Answer"`),
  empty `confirmedSubmissions / outbox / quarantine`, default
  `training-platform.sqlite` metadata unchanged.
- **Task 6 (same SHA, paired with disposable local app):** trusted
  `button.btn-submit` click → synthetic `nccommon/submit_cd` POST →
  `nccommon/status?submissionId=84258557` GET → one E2 (`storageKey:
  "nowcoder:84258557"`) → browser-navigation to result page with
  `.coder-cont-legend = "答案错误"` DOM mutation → one E3 → one bundle →
  one `POST /api/capture/attempts` → one SQLite training attempt → one
  training session → four `capture_events` rows. A subsequent direct
  navigation to a mismatched `submissionId=99999999` produces only one
  unmatched E3 and never duplicates the original bundle. Reload of the
  delivered `submissionId=84258557` result page does not duplicate the
  bundle or SQLite attempt.

`npm run quality:gate` exited 0 on 2026-07-29 with lint PASS, disposable
`db:migrate` PASS, `curriculum:validate` PASS, `test` 92 files / 1919
passed / 1 pre-existing Windows `EPERM` skip, `typecheck` PASS, `e2e`
25/25 passed, `extension:check` PASS (38 files / 1191 tests, MV3 build
416.7 kB background / 205.6 kB content), `extension:e2e` 47/47 on the second
consecutive run (Task 5 and Task 6 specs both green on every isolated run),
`build` PASS.

## Boundary Carried Forward

- **NowCoder remains `experimental`** for DOM and V4 network readiness.
  The `experimental` field in `extension/src/adapters/registry.ts` is
  unchanged.
- **Production promotion is NOT authorized by this report or by `c26c578`.**
  Promotion requires a separate reviewed decision per the Master Plan §22
  ("RC re-freeze conditions") and §19 ("Adapter readiness") boundaries.
- The four other real OJ platforms (LeetCode, AtCoder, Codeforces, Luogu)
  remain uncharacterized for V4 network capture in this report's scope.
- No push, no PR, no real `ac.nowcoder.com` HTTP traffic outside the
  bundled Chromium route interceptor, no default-database mutation, no
  attempt was deleted.

## Repository State at Supersede

- **Branch:** `feature/v1-followup`
- **Ahead of `origin/feature/v1-followup`:** 15 commits
- **Worktree:** clean except for unrelated untracked `.local/` workspace
  state
- **Authoritative implementation SHA for the missing-E3 layer fix:**
  `c26c57859b9e330c42d2586c4fb1f0366d2186ea`
- **Phase B terminal closeout SHA (historical, BLOCKED at 2026-07-28):**
  `7bac19413992e7a987a3891190223628fb5b0803`
- **Phase B observation production build SHA (historical):**
  `05555ef test(v4): prove NowCoder production-dist full chain`

## Why a Separate Document

The 2026-07-28 terminal closeout remains historically accurate: it closed
Phase B as `BLOCKED` based on the real-Chrome observation evidence available
at that time. Rewriting that file would silently invalidate its historical
truth value. This supersede document records the precise dimension on which
the verdict evolved and the dimension on which it did not, preserving both
historical accuracy and current truth.