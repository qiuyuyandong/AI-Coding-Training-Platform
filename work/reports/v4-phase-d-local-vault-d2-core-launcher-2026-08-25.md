# V4 Phase D Local Vault D2 Core and Launcher Evidence

Date: 2026-08-25

Verdict: **PASS — D3 may start**

## Delivered behavior

- Added one dependency-free Local Vault core using Node standard library,
  existing `better-sqlite3`, Zod and the existing migration runner.
- A Vault is an existing empty real directory containing exactly
  `.ai-coding-training-vault.json` and `training-platform.sqlite` after
  creation. Descriptor and pointer schemas are closed and versioned.
- Every user path must be absolute. Validation rejects files in place of
  directories, non-regular descriptor/database files, symlinks, junctions,
  non-canonical traversal, unknown JSON fields/versions, malformed JSON,
  SQLite integrity failures and foreign-key failures.
- The active pointer uses the approved platform config directory and a
  same-directory exclusive temporary file plus rename. Reads re-resolve and
  revalidate the Vault instead of trusting the stored string.
- Existing database adoption copies into a unique target-local temporary file,
  checks the pre-migration copy hash, migrates only the copy, verifies SQLite
  integrity and every pre-existing table's row count, rechecks source
  size/mtime/hash, then activates the target. It rejects active SQLite
  sidecars and never moves or deletes the source.
- `npm run local`, `vault:create`, `vault:switch` and `vault:adopt` use one
  launcher. It provides native Windows/macOS/Linux picker routes without a new
  dependency, fails clearly to absolute CLI flags when unavailable, treats
  cancellation as a no-op, checks localhost:3000 before any switch, and starts
  Next.js through a non-shell child with only validated Vault environment.
- `/settings` is now a read-only Local Vault status surface. It exposes no
  running-process path mutation API. The obsolete visible pairing-code
  component and its UI/E2E tests were removed; pairing runtime routes remain
  intentionally untouched until D4.

## Verification

Focused tests:

```text
npx vitest run --no-file-parallelism tests/unit/localVault.test.ts tests/unit/localVaultSettings.test.tsx --reporter=verbose
2 files passed, 17 tests passed
```

Coverage includes empty creation, cancellation, absolute paths, atomic pointer
replacement and invalid-candidate preservation, collision, migration cleanup,
Vault/config junction rejection, unknown descriptor version,
source-preserving adoption and failure rollback, OS config roots, picker
fallback, real port occupation, blocked switch and successful stopped switch.

Repository gates:

```text
npm run lint       PASS
npm run typecheck  PASS
npm run test       115 files; 2590 passed / 1 capability skip
npm run e2e        24/24
npm run build      20/20
```

The build used `.tmp/d2-build-validation.sqlite`, which was deleted after the
run. Default database preservation:

- bytes: `479232`
- mtime UTC: `2026-07-23T15:56:38.8411343Z`
- SHA-256: `2485DBEA8E9C9CF2F073BC6C9BA4AA0A5261DC3744DDA7592A2890BC554666C3`

## Scope boundary

- No dependency was added.
- The desktop security-diff workbench could not create a scan record because
  its internal Python subprocess failed to decode the non-ASCII Windows user
  path with GBK; no `scanId` was issued and no automated verdict is claimed.
  A bounded manual diff review plus the three added rollback/junction tests
  found no actionable path traversal, destructive-source, shell-injection or
  secret-leak finding. The targeted secret scan returned zero matches.
- No production extension manifest, storage or capture transport changed.
- Migration `0009`, provenance `extension_local`, removal of credential tables
  and exhaustive every-prefix/fault-injection adoption proof remain D3.
- Route H challenge/Bearer product integration and deletion of legacy pairing
  APIs remain D4.
- D7, real OJ access/actions, RC, release, push and PR remain unauthorized.
