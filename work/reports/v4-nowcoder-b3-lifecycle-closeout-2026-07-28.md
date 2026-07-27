# NowCoder V4 Phase B B3 Lifecycle Closeout

**Verdict:** `PASS` for the NowCoder browse-only navigation witness and its MV3
worker-restart / extension-reload lifecycle coverage only.

## Scope and boundary

This closeout joins the already committed B3.1 restart-safe implementation and
the authenticated, browse-only two-E0 observation. It does not certify
NowCoder production capture, a release candidate, user acceptance, public
release, or B4. No new real-browser observation was performed in this work.

The existing real observation remains authoritative:

- implementation commits: `c208bc2`, `fdecf91`;
- observation evidence commit: `b2c6aec`;
- strict fixture: `tests/fixtures/nowcoder/network/nowcoder-browse-only-2026-07-27.json`;
- observation report: `work/reports/v4-nowcoder-b3-restart-safe-observation-2026-07-27.md`.

That fixture has exactly two authenticated main-frame E0 navigation witnesses,
in list then problem order, from one tab with distinct document IDs and zero
E1/E2/E3 records. It was not regenerated or altered here.

## Lifecycle evidence

`tests/extension-e2e/capture-v4-network.spec.ts` adds four production-path
black-box tests. CDP only stops and observes the MV3 Worker. The test pages are
synthetic responses at the manifest's exact NowCoder routes, so the built
production content script supplies the sender; background validates it; and
the real popup UI supplies start, status, export, and post-reload assertions.
No test writes B3 session storage directly.

| Scenario | Verified result |
| --- | --- |
| A: terminate at `armed` | Real list then problem ingress reaches popup `ready`. |
| B: terminate at `list_seen` | Real problem ingress reaches `ready`; popup exports. |
| C: terminate at `ready` | Popup wakes Worker, remains `ready`, and exports. |
| D: extension reload | Chrome extensions UI reload clears the session; a new popup disables export and cannot recover the old problem flow. |

Bundled Chromium 138 initially disabled command-line-loaded unpacked extensions
after reload under its `ExtensionDisableUnsupportedDeveloper` experiment. The
test-only launch argument `--disable-features=ExtensionDisableUnsupportedDeveloper`
removes that harness policy interference. It is not part of production source,
the manifest, extension runtime behavior, or the user's Chrome. The fixture
also wakes a cold Worker through the real popup if it has not started yet.

Focused A-D was repeated three times: **12 passed / 0 failed**.

## Gate evidence

`npm run quality:gate` exited 0 on 2026-07-28:

- lint, disposable migration, curriculum validation, and TypeScript: PASS;
- unit tests: 87 files, 1792 passed, 1 skipped;
- web E2E: 25 passed;
- extension check: 34 files, 1077 passed;
- extension E2E: 35 passed, 1 skipped;
- production build: 20 pages generated.

The single extension-E2E skip is the pre-existing Phase A worker-main-bridge
harness limitation. It is separate from B3 A-D, which all execute and pass.

## Privacy and fail-closed statement

No production extension code changed. The existing strict sender validation,
session-only B3 state, zero-network-record browse-only export rule, exact
two-E0 constraint, and post-export cleanup remain unchanged. This work did not
read cookies, credentials, page text, problem statements, or user code; it did
not invoke a submit control; and it did not access the user's Chrome.
