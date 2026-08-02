# V4 Phase C Characterization Control-Plane Generalization

**Status:** Authorized maintenance prerequisite for Phase C on 2026-07-30.
This plan repairs the shared characterization control plane only. It does not
implement or promote any platform adapter.

**Trigger:** C1 static review proved that the Phase B diagnostic is hard-coded
to NowCoder in `characterization.ts`, `networkObserver.ts`, `popup.ts`, and the
popup markup. As written, a LeetCode session cannot retain or export any
LeetCode request, and the generic endpoint normalizer collapses exact paths to
ambiguous labels such as `submit` or `status`.

## Objective

Allow one explicitly selected registry-owned platform/hostname to run in the
existing bounded, session-only, production-isolated characterization mode.
Export exact sanitized URL paths without query values, request/response bodies,
headers, credentials, code, identities, or full problem statements.

## Files

- Modify: `extension/src/characterization.ts`
- Modify: `extension/src/networkObserver.ts`
- Modify: `extension/src/background.ts`
- Modify: `extension/src/popup.ts`
- Modify: `extension/src/popup.html`
- Add: `scripts/v4-live-characterization.mjs`
- Modify: `.gitignore`
- Modify: `package.json`
- Modify focused characterization, network-observer, background-integration,
  and popup tests
- Modify Phase C/C1 plan execution notes after verification

## Tests First

- Reject a start hostname not owned by the registry.
- Collect only evidence whose platform owns the selected hostname.
- Preserve NowCoder B3 browse-only behavior.
- Export a platform-correct fixture name, source URL, and signal.
- Record exact path-only endpoint keys for non-NowCoder characterization.
- Never retain query values or fragments.
- Register characterization listeners only for registry-owned HTTPS hosts.
- Enable export for non-NowCoder sessions after at least one safe record,
  without requiring the NowCoder B3 witness.
- Keep production ingress isolated for the active platform only.

## Implementation Boundary

- The diagnostic remains opt-in, short-lived, bounded, and
  `chrome.storage.session`-only.
- The observer may retain method, exact normalized path, resource type, status,
  redirect path, tab/frame/document relationship, and relative timing only.
- No request/response body access, no headers, no cookies/tokens/CSRF, no code,
  no account identity, and no arbitrary hostname.
- NowCoder's existing B3/B4 exports and production-ingress guard remain
  backward-compatible.
- Platform network policies, readiness registry states, and production capture
  behavior are out of scope.

## Verification

```powershell
npx vitest run --config vitest.extension.config.ts \
  tests/unit/extensionCharacterization.test.ts \
  tests/unit/extensionNetworkObserver.test.ts \
  tests/unit/extensionCharacterizationBackgroundIntegration.test.ts \
  tests/unit/extensionPopup.test.ts
npm run extension:check
npm run extension:e2e
npm run extension:characterize -- --hostname=leetcode.cn
npm run quality:gate
```

## Completion

The maintenance task is complete only when the focused tests and authoritative
extension gates pass and a fresh profile can export one safe LeetCode
characterization document after a user-owned natural submission. That export
is evidence for C1 design work, not adapter readiness by itself.
