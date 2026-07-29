# V4 NowCoder E3 Ingress Repair — Closeout (2026-07-29)

**Date:** 2026-07-29
**Plan:** `docs/superpowers/plans/2026-07-29-v4-nowcoder-e3-ingress-repair-and-retest.md`
**Verdict:** `V4 NowCoder E3 ingress engineering PASS`. B8's `BLOCKED` is
**superseded** by this report for the missing-E3 layer only; the Phase B
terminal closeout verdict (`work/reports/v4-nowcoder-phase-b-terminal-closeout-2026-07-28.md`)
remains authoritative for every other Phase B outcome.

## Result

The blocker discovered in Phase B B8 ("the real result document did not run
the declarative content script; consequently no E3 was emitted") is fixed
end-to-end. Tasks 0-4 implement the engineering repair: a pure
content-ingress coordinator (`extension/src/contentIngress.ts`), an
idempotent per-document content bootstrap
(`extension/src/contentBootstrap.ts`), and background-side
`chrome.scripting.executeScript` + `chrome.webNavigation` self-healing
injection (`extension/src/background.ts:393-491`,
`extension/src/background.ts:758-784`). Tasks 5-6 prove the chain on the
production-built `extension/dist` through a fresh profile with no
characterization and through one full E0 → E1 → E2 → E3 → bundle →
`POST /api/capture/attempts` → SQLite training attempt lifecycle.

The same SHA exercises both Tasks 5 and 6; both tests pass against the
disposable SQLite owned by the Playwright global-setup harness, without
touching the default `training-platform.sqlite`.

## What changed (Task 0-4)

- `extension/manifest.json` adds `scripting` and `webNavigation`. The
  static `content_scripts` matches and the per-host `host_permissions`
  are unchanged.
- `extension/src/contentIngress.ts` (new, 554 lines) is the pure
  coordinator. It exports:
  - `isExactNowCoderResultUrl(url: URL)`: only accepts `https:`,
    `ac.nowcoder.com`, no credentials/port, exactly
    `/acm/contest/view-submission` (no trailing slash — synchronized
    with the existing E3 policy in
    `extension/src/adapters/nowcoder/network.ts:272-282`), no hash,
    exactly one `submissionId` query key matching `[0-9]{1,20}`.
  - `reduceIngress(state, input)`: closed 7-input / 5-effect union
    (`committed`, `completed`, `history_state`, `startup`, `ready`,
    `injection_result`, `cleanup` × `inject`, `ready_record`, `ignored`,
    `diagnostic`, `cleanup`). No `chrome.*`, no wall clock, no DOM,
    no I/O. Transient entries (committed, injected, ready) are bounded
    by count (max 100) and removed on `cleanup` input.
  - `isContentRuntimeReadyMessage(value)`: closed-value guard for the
    `CONTENT_RUNTIME_READY { type, schemaVersion: 1, purpose: "capture" }`
    envelope.
- `extension/src/contentBootstrap.ts` (new, 37 lines) is the
  isolated-world-only bootstrap. The sentinel uses a three-state
  lifecycle `installed | installing | inactive` so a second static or
  programmatic injection can reannounce readiness for a restarted worker
  but cannot install another capture runtime. If `install()` returns
  `false` (capture disabled), the sentinel is cleared and the state
  remains quiescent.
- `extension/src/content.ts` delegates its top-level startup to
  `bootstrapContentRuntime` and emits the closed
  `CONTENT_RUNTIME_READY` only when the current location passes
  `isExactNowCoderResultUrl`. The ready envelope has exactly three
  closed fields; the background never trusts a payload that is not
  shape-validated.
- `extension/src/background.ts` now:
  - imports `isContentRuntimeReadyMessage`,
    `isExactNowCoderResultUrl`, `reduceIngress`, `INITIAL_STATE` from
    the coordinator;
  - adds `ingressState: IngressCoordinatorState = INITIAL_STATE`;
  - routes every reducer effect through `applyContentIngress`;
  - persists `ready_record` and `injection_failed` reason codes to
    session-backed `contentIngressReady` and
    `contentIngressDiagnostics` (each capped at 20 entries, closed
    schema validated) so Tasks 5/6 can observe the closed control
    surface without leaking it into capture state;
  - registers four `chrome.webNavigation` listeners
    (`onCommitted`, `onCompleted`, `onHistoryStateUpdated`,
    `onErrorOccurred`) and an `onStartup`-driven already-open-tab
    `reconcileOpenNowCoderResultTabs`; programmatic injection uses
    `chrome.scripting.executeScript({ files: ["content.js"], world:
    "ISOLATED", injectImmediately: true, target: { tabId,
    documentIds: [docId] } })` whenever Chrome supplies a document
    id, otherwise falls back to `frameIds: [0]`;
  - accepts the closed ready message only when sender identity
    supplies `tab.id`, `frameId`, `documentId`, and the URL passes the
    pure coordinator gate; it never trusts page-derived metadata.

## Plan Tasks 0-4 (authoritative evidence)

| Task | Verdict | Evidence |
|---|---|---|
| 0 — freeze blocker + repo assertions | PASS | `tests/unit/extensionContentIngress.test.ts` (URL gate × 27 acceptance/rejection cases). Repository assertions of the exact manifest result route and the `CONTENT_RUNTIME_READY` not-entering-capture guarantee live in `tests/unit/extensionBackgroundMessages.test.ts`. |
| 1 — pure exact-route and injection decision model | PASS | `tests/unit/extensionContentIngress.test.ts` (69 tests). Pure reducer rules: top-frame only (`frameId === 0`), `tabId >= 0`, document identity preferred, transient registry bounded. No `chrome.*`, no DOM, no wall clock. |
| 2 — idempotent content bootstrap | PASS | `tests/unit/extensionContentBootstrap.test.ts` (4 tests). Three-state sentinel; second injection reannounces but does not reinstall. If `install()` returns false (capture disabled), the sentinel is cleared so a later enable can install cleanly. |
| 3 — exact-route self-healing injection | PASS | `npm run lint` clean; `npm run typecheck` clean; full extension unit suite 38 files / 1191 passed. The background only admits the closed ready envelope when sender identity is Chrome-owned and the URL passes the pure gate; static-ready suppresses the recovery call; injection failure is observable via `contentIngressDiagnostics`. |
| 4 — production-dist E2E around ingress | PASS | `npm run extension:check` clean (typecheck + extension unit tests + MV3 build + dist parity). `npm run extension:e2e` reports the existing B7 eight-scenario lane plus the new direct-result regression; see the closeout gate result below. |

## Real-Chrome observation evidence

The Tasks 5-6 user authorization was granted on 2026-07-29 and the
fresh-profile tests below were executed against the freshly rebuilt
production `extension/dist`. No real `ac.nowcoder.com` HTTP traffic
occurred — the bundled Chromium resolves `ac.nowcoder.com` through the
Playwright `context.route` interceptor, while the popup-pairing and
`POST /api/capture/attempts` paths travel through the local Next.js
server on `http://localhost:3000`.

**Task 5 evidence** — fresh extension profile, no characterization, no
pair, no submit. Direct navigation to
`https://ac.nowcoder.com/acm/contest/view-submission?submissionId=84258557`
(real known historical submission id):

- `chrome.storage.session.contentIngressReady` length **1** with shape
  `{ reason: "ready_record", tabId, frameId: 0, documentId: uuid }`.
- `chrome.storage.session.transientUnmatchedE3` length **1** with the
  strict `final_verdict_confirmed` evidence
  `{ externalSubmissionId: "84258557", problemExternalId:
  "acm/contest/18839/1001", verdict: "Wrong Answer", tier: "E3" }`.
- `confirmedSubmissions`, `captureOutbox`, `captureQuarantine` all empty.
- Page reload preserves the same single unmatched E3 (dedupe by document
  identity); no bundle, no API traffic, no SQLite attempt is created.
- Default `training-platform.sqlite` metadata is unchanged (length and
  `LastWriteTimeUtc` identical before and after).

**Task 6 evidence** — same SHA, fresh extension profile, paired with the
disposable local app:

- Browse list → problem (`/acm/contest/18839`, `/acm/contest/18839/1001`)
  with no submit leaves `等待判题` and `transientE1` at zero.
- Trusted `button.btn-submit` click produces exactly one E0 hint.
- Synthetic `nccommon/submit_cd` POST followed by
  `nccommon/status?submissionId=84258557` GET yields exactly one
  confirmed submission (`storageKey: "nowcoder:84258557"`).
- Browser-navigation to the result page with subsequent DOM mutation
  injects `.coder-cont-legend = "答案错误"`. The same `CONTENT_RUNTIME_READY`
  + final verdict produce one matching E3, one bundle, one
  `POST /api/capture/attempts` delivery, one SQLite training attempt,
  one training session, and four `capture_events` rows.
- A subsequent direct navigation to a mismatched
  `submissionId=99999999` produces only one unmatched E3 and
  never duplicates the original bundle.
- Reload of the already-delivered `submissionId=84258557` result page
  does not duplicate the bundle or the SQLite attempt.

## Authoritative verification

`npm run quality:gate` exited 0 on 2026-07-29:

- lint: PASS (zero warnings; new files clean);
- disposable `db:migrate`: PASS;
- `curriculum:validate`: PASS — 12 nodes / 13 edges / 12 resources /
  12 practice mappings / 9 career summaries;
- `test`: **92 files / 1919 passed / 1 skipped** (the pre-existing
  Windows `EPERM` file-symlink capability skip in
  `tests/unit/e2eDatabase.test.ts`);
- `typecheck`: PASS;
- `e2e`: **25/25 passed**;
- `extension:check`: PASS (`typecheck → extension:test → extension:build →
  scripts/check-extension-dist.mjs`; 38 files / 1191 tests pass and the
  MV3 bundle parity holds for the new entry points);
- `extension:e2e`: **47/47 passed** on the second consecutive run; one
  transient Playwright `beforeEach` timeout on the historical
  `HTTP 200 business rejection` Fake-OJ scenario (`tests/extension-e2e/capture-v4-network.spec.ts:683`)
  resolved on isolated rerun and is unrelated to this repair;
  Task 5 (`capture-v4-nowcoder-task5-real-observation.spec.ts`)
  and Task 6 (`capture-v4-nowcoder-task6-real-retest.spec.ts`)
  both pass on every isolated run.
- `build`: PASS.

`npm run extension:e2e -- tests/extension-e2e/capture-v4-nowcoder-task5-real-observation.spec.ts tests/extension-e2e/capture-v4-nowcoder-task6-real-retest.spec.ts`
exits 0 with both Task 5 and Task 6 green.

## Boundary

This closeout is **engineering evidence** for the missing-E3 ingress
layer that blocked Phase B B8. It is not a production promotion, RC,
acceptance, release, or V0 acceptance. NowCoder remains
`experimental`; promotion requires a separate reviewed decision
documented against broader real-platform evidence. The four real OJ
platforms other than AtCoder remain uncharacterized for V4 network
capture in this report.

No attempt was deleted to make this fix work. No Chrome state beyond
the throwaway fixtures listed below was modified. No push or PR was
executed. No new host permission or `<all_urls>` was added.

## Files

- new: `extension/src/contentIngress.ts`
- new: `extension/src/contentBootstrap.ts`
- new: `tests/unit/extensionContentIngress.test.ts`
- new: `tests/unit/extensionContentBootstrap.test.ts`
- new: `tests/extension-e2e/capture-v4-nowcoder-task5-real-observation.spec.ts`
- new: `tests/extension-e2e/capture-v4-nowcoder-task6-real-retest.spec.ts`
- modified: `extension/manifest.json` (added `scripting`,
  `webNavigation` permissions)
- modified: `extension/src/content.ts` (delegate to bootstrap; emit
  `CONTENT_RUNTIME_READY` only on exact result route)
- modified: `extension/src/background.ts` (coordinator + closed ready
  handler + `chrome.webNavigation` + self-healing
  `chrome.scripting.executeScript` + startup-time
  reconcileOpenNowCoderResultTabs)
- modified: `tests/unit/extensionBackgroundMessages.test.ts` (added
  manifest regression and ready-does-not-enter-capture assertions)
- modified: `tests/unit/extensionBackgroundOrchestrator.test.ts`
  (added `webNavigation`, `scripting`, `tabs` to the test
  `FakeChrome`)
- modified: `tests/extension-e2e/capture-v4-nowcoder.spec.ts` (added
  `direct exact result creates one unmatched E3 without delivery`
  scenario)
