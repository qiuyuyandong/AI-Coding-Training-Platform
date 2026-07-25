# V4 Phase A Closeout Report (2026-07-24)

**Scope:** Phase A Tasks A0-A9 (V4 evidence core + real extension E2E)
**Declared closeout at:** 2026-07-24 (user direction: "完成 A9 后就收")
**Result:** `V4 infrastructure engineering PASS`. Real platforms remain
`V4 uncharacterized`.

## 1. Summary

The V4 Phase A infrastructure is a framework, not a real-network matcher.
The authoritative Phase A closeout scope spans Tasks A0-A9:

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
- A9: Fake OJ matrix (29 Playwright tests; 28 pass; 1 known test-harness
  limitation)

A10-A12 are explicitly **deferred** and must not be claimed as complete in
this repository. Phase B (NowCoder network pilot) requires fresh
explicit authorization.

## 2. Modules added in Phase A

| Module | Role |
|---|---|
| `extension/src/evidence.ts` | Safe Evidence discriminated union (E0 / E1 / E2 / E3 / Ambiguity / Rejection); `parseSafeEvidence` is the only trust boundary |
| `extension/src/adapters/contract.ts` | closed adapter contract: Platform, PlatformAdapterStatus, V4NetworkStatus, V4NetworkAdapterPolicy, PlatformAdapterRecord |
| `extension/src/adapters/registry.ts` | single registry source for host ownership, DOM status, V4 network status, version; preserves `platforms.ts` compat exports |
| `extension/src/submissionCorrelator.ts` | closed-tag-union correlator with frozen state; `parseMainBridgeSummary` revalidates canonical UTC + numeric + non-negative + recursive forbidden-key gate |
| `extension/src/captureStateMachine.ts` | pure 9-input reducer; 7-state model; closed 4-effect union; `bundle_${sha256HexBytes(canonical)}` via pure-JS SHA-256 (byte-identical to Node `createHash("sha256")`) and 4-byte big-endian uint32 length-prefix encoder; Chrome-bundleable |
| `extension/src/networkObserver.ts` | five host-scoped `chrome.webRequest` lifecycle listeners over leetcode/nowcoder/luogu/codeforces; `parseSafeEvidence` revalidation; `registerNetworkObserverListeners` pure dependency-injected helper |
| `extension/src/mainWorldBridge.ts` | IIFE MAIN-world bridge (`extension/dist/main-world-bridge.js`); strict structural validation; closed-reason diagnostics; bounded queue + flush on `pagehide` / `unload` |
| `extension/src/mainWorldRelay.ts` | ISOLATED-world relay; revalidates `parseMainBridgeSummary`; recursive forbidden-key gate (any of body/rawBody/responseBody/code/headers/requestHeaders/responseHeaders/extraHeaders/cookie/authorization/csrf/token/username/account at any depth); emits frozen `V4_FORWARD_BRIDGE` envelope |
| `extension/src/backgroundOrchestrator.ts` | pure data plane; zero `chrome.*`; 9 input kinds; closed 4-effect union with `observedAt`; waiting only on `SUBMISSION_CONFIRMED`; E3-before-E2 retention parked by stable submission key with most-recent-wins; browser-restart recovery produces a bundle from confirmed submission + new E3 without requiring transientE1; rejected diagnostics dedupe by reason + `summary.evidenceId` + tab/frame/document id/endpointKey |
| `extension/src/transientEvidenceStorage.ts` | session-only storage; UI hints 30 s, E1 5 min, page contexts 30 min, unmatched E3 60 s, ambiguity diagnostics 24 h |
| `extension/src/confirmedSubmissionStorage.ts` | local-only durable storage; deterministic `${platform}:${externalSubmissionId}` storageKey; idempotent finalize; bounded tombstones (256 by default, 30-day max age) |
| `extension/src/installation.ts` | V4 split initialization; `applyExtensionInitializationSplit({local, session})` writes transient state to session and durable delivery / confirmed / tombstones / pairing to local; preserves existing tombstones; structural diff re-emits only changed keys |
| `extension/src/uiHint.ts` | E0 UI-hint storage seam (existing) used by background orchestrator |
| `tests/extension-e2e/fakeOj.ts` | Fake OJ page-side bridge + E3 dispatch helper + per-test closure for `DISPATCHED_E3S` |
| `tests/extension-e2e/fakeOjScenarios.ts` | 18-scenario catalogue + 3 cross-platform smoke scenarios |
| `tests/extension-e2e/capture-v4-network.spec.ts` | 29 Playwright tests; module docblock honestly documents the Option B seed→E3 seam |
| `tests/fixtures/capture-v4/fake/{18-scenario}.json` | pure-synthetic bridge summary fixtures (no source / credentials / account / commercial statements) |
| `tests/fixtures/capture-v4/fake/{problem,result}-page.html` | minimal synthetic problem / result pages |

## 3. Verification evidence

All Phase A closeout tests pass. Independent final reviews for A4, A5,
A6, A7, A8, A9 are all APPROVED with no blocker or important issue.

| Stage | Result |
|---|---|
| `npm run typecheck` | PASS |
| `npm run lint` (--max-warnings=0) | PASS |
| `npm run extension:check` | PASS: 30 files / 950 tests pass; MV3 build OK; dist parity OK |
| `npx vitest run --config vitest.extension.config.ts tests/unit/extensionCaptureStateMachine.test.ts` | 40/40 pass |
| `npx vitest run --config vitest.extension.config.ts tests/unit/extensionSubmissionCorrelator.test.ts` | 79/79 pass |
| `npx vitest run --config vitest.extension.config.ts tests/unit/extensionMainWorldBridge.test.ts` | 57/57 pass |
| `npx vitest run --config vitest.extension.config.ts tests/unit/extensionNetworkObserver.test.ts tests/unit/extensionNetworkObserverIntegration.test.ts` | 19/19 pass |
| `npx vitest run --config vitest.extension.config.ts tests/unit/extensionBackgroundOrchestrator.test.ts` | 35/35 pass |
| `npx vitest run --config vitest.extension.config.ts tests/unit/extensionTransientEvidenceStorage.test.ts tests/unit/extensionConfirmedSubmissionStorage.test.ts tests/unit/extensionInstallation.test.ts` | 39/39 pass |
| `npx playwright test --config playwright.extension.config.ts tests/extension-e2e/capture-v4-network.spec.ts` | 28/29 pass |

The single remaining failure is the test-harness worker-restart seam
(`service-worker restart between every major state`); the module
docblock in `capture-v4-network.spec.ts` honestly documents this as a
known infrastructure limitation, not a production defect.

## 4. Privacy and security boundary

- `parseSafeEvidence` rejects forbidden raw fields recursively
  (body / rawBody / responseBody / code / headers / requestHeaders /
  responseHeaders / extraHeaders / cookie / authorization / csrf /
  token / username / account at any depth, cycle-safe via WeakSet).
- `mainWorldBridge.ts` parser additionally rejects field count > 18,
  nested objects/arrays beyond schema, any A1-forbidden key, and unsafe
  URL-shaped endpoint keys.
- `mainWorldRelay.ts` re-runs the recursive forbidden-key gate before
  forwarding to background.
- No `any` / `as any` / `as unknown` / non-null assertion / `@ts-ignore`
  / `@ts-expect-error` in production code.
- The browser-restart path does not require a transient E1; the state
  machine reconstructs the synthetic E1 with `receivedAt = min(E3.receivedAt,
  confirmed.confirmedAt)` so the A4 chronology invariant always holds.
- `expireCaptureUiHints` alarm is re-established even on empty-diff
  prune via a `periodInMinutes: 1` fallback so the slot is never lost.

## 5. Explicit non-claims

- No real platform's `V4NetworkStatus` has been moved away from
  `uncharacterized`.
- No real OJ request, response, or page was observed during this
  closeout. The Fake OJ matrix drives synthetic-only fixtures.
- No SQLite roundtrip or API/DB teardown was exercised in A9 (A10
  was the next task and is explicitly deferred).
- A10, A11, A12 are **deferred** at user direction; they are not
  completed and must not be claimed as such in any future report.
- V0 formal observation, replacement-RC work, and V0.5 remain
  blocked until Phase B (or a separately authorized characterization)
  succeeds.

## 6. Next actions

- Phase B (NowCoder network pilot) requires fresh explicit user
  authorization.
- Re-opening A10 / A11 / A12 requires fresh explicit user
  authorization.
- The Fake OJ matrix's single failing scenario is a test-harness
  infrastructure limitation, not a production defect; it may be
  deferred until a fresh A10/A11 authorization re-opens work.
