# V4 Phase D P5 candidate freeze receipt (2026-08-16)

## Outcome

P5 candidate freeze is complete. One immutable product-owned candidate was
committed, the exact D3 validator passed on that candidate, the exact
production dist was frozen, and the default database metadata is preserved.

## Frozen identity

- Branch: `feature/v1-followup`
- Documentation/harness parent commit: `6e3fb6f`
  (`feat(v4): record D4 acceptance authority and observer contract tooling`,
  21 files; observation tooling, acceptance profiles, plans, and docs)
- **Immutable candidate commit: `62e57096c29babe8370c3ad98f6bfe57a1a997f9`**
  (`feat(v4): implement LeetCode D4 result-root capture branch`, 15 files,
  single parent, product-owned diff only)
- Candidate isolation: the candidate diff contains exactly the six P1
  LeetCode product sources, the candidate validator, and eight focused
  extension unit suites; zero NowCoder production files; zero
  observation/harness files.
- Candidate commit was HEAD with a clean worktree for the entire D3 run; the
  validator replayed identity checks after the gate and they still passed.

## Exact D3 validator

Command:

```text
node scripts/validate-v4-candidate.mjs --candidate 62e57096c29babe8370c3ad98f6bfe57a1a997f9
```

Exit: `0` — `V4 candidate commit PASS`.

Quality-gate stages (real output, inside the validator):

```text
lint                 PASS (eslint . --max-warnings=0)
db:migrate           PASS
curriculum:validate  PASS (checksum 555d17a5ed7f42b92fedead8c4eef29eda59633b7bc59ae08b86c0f029b05689)
root unit            107 files / 2478 passed / 1 skipped
typecheck            PASS
app E2E              25 passed
extension:check      48 files / 1615 passed; production build and dist parity PASS
extension:e2e        53 passed / 1 known harness skip
build                20/20 static pages; production build PASS
privacy audit        PASS, 0 findings (inside validator state)
readiness            PASS (inside validator state)
```

## Exact dist

The production build from the candidate commit was frozen under
`.tmp/p5-exact-dist-62e5709`. Artifact SHA-256 values:

```text
manifest.json         A85C3275D559BD46AAA034FEEA9B14EAFECFC6F56341713B2AFB8B024E2B3E64
background.js         E187758177B9AE2F6F4159CAEE53AB4E993C31533A7F98AAC8F2F1AC058126EC
content.js            A4EB98D59D76682B51B977997FF6C164BA4F9F05DE792AF16B95ED6788D0D697
popup.js              649FE6BCADE7EB92C39619302D1BE94D914FB54869AE8571A18EA2B333A95F9A
main-world-bridge.js  4D89A80F0351295EE1C0CD173BE107080983868D18510D028854695EACEE3943
```

`popup.html` (informational, not part of the five-hash contract):
`CEB804A75C9245F639AC80AA05A9C225F01FE736461881A08563D22EFACCE5BE`.

## Default database preservation

```text
Length           479232  (before and after, identical)
LastWriteTimeUtc 2026-07-23T15:56:38  (before and after, identical)
```

The validator's own `database.metadata-preserved` and
`database.baseline-matches-before` checks passed. The gate runs under an
OS-temporary database; the default SQLite file was not opened for writing.

## Boundaries

- No platform, browser-live, network, READY, or action work occurred.
- The observation tooling and acceptance profiles were committed in the
  separate parent commit `6e3fb6f` and were NOT part of the candidate diff;
  their SHA-256 values from plan section 16 remain unchanged.
- This receipt does not authorize P6 READY-only preflight, P7 platform
  observations, D4 closeout, D5, F1-F4, RC, release, push, or PR.
