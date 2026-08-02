# V4 AtCoder C2 Characterization Preflight Receipt

**Recorded at:** 2026-07-31T10:14:48.448Z

**Branch:** `feature/v1-followup`

**Base HEAD:** `a24e158448c3ccf3e1cde6e380e0c441eff87342`

**Working tree:** uncommitted C0/C1/C2 changes; no staged files, no push

**Plan:** `docs/superpowers/plans/2026-07-31-v4-atcoder-network-capture-migration.md`, revision 2

## Independent Plan Review

- First independent review: `REJECT` with two HIGH findings, three MEDIUM
  findings, and one LOW finding. No real AtCoder page was opened.
- Revision 2 first re-review: `REJECT` with no HIGH findings and two MEDIUM
  reproducibility findings.
- Revision 2 final review: `APPROVE`; no remaining HIGH, MEDIUM, or LOW
  findings.
- Approved order: pre-storage privacy prerequisite, focused gates and this
  receipt, then one user-authorized characterization in the existing Chrome.
- The approval does not authorize an AtCoder network adapter, raw body/header
  access, production promotion, or inferred task/submission identity.

## Privacy Prerequisite

The production-built characterization observer now accepts AtCoder path data
only for the closed contest grammar reviewed in the plan. Identity-bearing,
unknown, percent-encoded, malformed, or overlong paths return
`normalize_endpoint_failed` before they can enter session storage or a
path-bearing diagnostic. Production network capture still excludes AtCoder;
this change affects only the opt-in characterization control plane.

RED evidence before implementation:

- `npx vitest run --config vitest.extension.config.ts tests/unit/extensionNetworkObserver.test.ts`
- Result: exit 1, 65 tests discovered, 24 failed in the new AtCoder privacy
  cases. Existing valid AtCoder paths also exposed the generalized
  control-plane `hostOwns` defect without enabling production capture.

GREEN focused evidence:

```powershell
npx vitest run --config vitest.extension.config.ts `
  tests/unit/extensionCharacterization.test.ts `
  tests/unit/extensionNetworkObserver.test.ts `
  tests/unit/extensionCharacterizationBackgroundIntegration.test.ts `
  tests/unit/extensionPopup.test.ts `
  tests/unit/extensionAdapterContract.test.ts `
  tests/unit/extensionPlatforms.test.ts
```

Result: exit 0; 6 files and 331 tests passed.

## Production Extension Gate

Command: `npm run extension:check`

- TypeScript typecheck: PASS.
- Extension tests: 39 files, 1,285 tests passed.
- Production extension build: PASS.
- Dist parity (`node scripts/check-extension-dist.mjs`): PASS, including one
  additional standalone parity invocation after the build.
- Manifest version: `0.1.0`.

Exact production artifact SHA-256 values:

| File | SHA-256 |
| --- | --- |
| `extension/dist/manifest.json` | `22b1fbeac7feac799c159d5a5d295700f7fef5a395c40f1a39168ea9e0293d08` |
| `extension/dist/background.js` | `75daa23fc0bf10b774524a95e0e78bcf3f365fabff65a84ff02f35a02c4e69ee` |
| `extension/dist/content.js` | `860d16264de663aec51f5848b97d6d445486438bae6ea9940607a59de05eb13d` |

The later characterization fixture/report must cite this receipt and these
same three hashes. A rebuild, source change affecting `extension/dist`, hash
mismatch, or unreviewed AtCoder pathname invalidates this receipt and requires
a new preflight before another real characterization window.

## Historical AtCoder Boundary

- Pre-C2 historical certification baseline: 4 files, 171/171 tests passed.
- All nine historical AtCoder fixture SHA-256 values match the frozen plan
  baseline.
- No historical fixture or AtCoder certification report was modified.
- Existing DOM status remains `production`; V4 network status remains
  `uncharacterized` at this preflight point.

## Authorization Boundary

This receipt permits only the next plan step: reload the same unpacked
production artifact in the already-open user Chrome, arm the bounded
session-only AtCoder characterization mode, and ask the user to perform one
natural submission. The user retains control of login, code, language, and the
submit action. The capture must stop `V4_BLOCKED` if the sanitized transcript
lacks either stable submission identity or safely sourced task identity.
