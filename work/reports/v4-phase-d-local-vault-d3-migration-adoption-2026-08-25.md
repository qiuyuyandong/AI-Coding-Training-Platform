# V4 Phase D Local Vault D3 Migration and Adoption Evidence

Date: 2026-08-25

Verdict: **PASS — D4 may start**

## Delivered schema behavior

- Added `0009_local_vault_extension_origin.sql` without modifying migrations
  0001–0008.
- Rebuilt `training_sessions` and `capture_events` with the closed provenance
  set `extension_unpaired | extension_paired | extension_local`.
- Historical rows are copied with explicit columns; populated 0008 fixtures
  prove complete row equality for sessions, events, attempts and corrections.
- Existing attempt foreign keys still target `training_sessions`; required
  indexes are restored; `PRAGMA quick_check` and `foreign_key_check` pass.
- `capture_pairing_codes` is dropped before `capture_installations`. These
  tables contain obsolete authentication metadata only; learning rows and
  historical provenance are not rewritten.
- The domain schema accepts `extension_local` while retaining both historical
  values.

The existing migration runner gained one narrow, explicit file marker for
parent-table rebuilds. A marked migration temporarily disables FK enforcement
outside its transaction, performs the rebuild and a complete
`foreign_key_check` inside the transaction, and restores the caller's FK state
in `finally`. An injected invalid rebuild proves rollback and FK restoration.

## Adoption proof

The D2 copy-adoption service now exposes a copy injection seam used only for
fault proof. Its real path remains `copyFileSync(..., COPYFILE_EXCL)`. Row-count
preservation excludes only the two intentionally removed authentication tables.

The focused matrix covers:

- fresh apply and repeated apply;
- populated 0008 → 0009 with exact historical row preservation;
- every historical prefix 0001 through 0008 copied, migrated and activated;
- source/target collision rejection;
- copy hash mismatch cleanup;
- migration failure rollback from D2;
- source size/mtime/SHA-256 equality on every successful and failed path;
- target `quick_check`, `foreign_key_check` and full migration identity.

## Verification

```text
npx vitest run --no-file-parallelism \
  tests/unit/migrations.test.ts \
  tests/unit/localVaultMigration.test.ts \
  tests/unit/localVault.test.ts --reporter=verbose

3 files passed; 27/27 tests passed
npm run lint       PASS
npm run typecheck  PASS
git diff --check   PASS
```

Default database preservation:

- bytes: `479232`
- mtime UTC: `2026-07-23T15:56:38.8411343Z`
- SHA-256: `2485DBEA8E9C9CF2F073BC6C9BA4AA0A5261DC3744DDA7592A2890BC554666C3`

## Transitional boundary

This phase deliberately does not claim the repository-wide product gate:
`0009` removes the legacy Vault authentication tables while the old pairing
and capture-auth runtime is still present at this intermediate commit. D4 is
the immediately required replacement phase: install the Vault-external Route H
record and Bearer routes, remove legacy API/repository callers, and restore the
full product gate. This is not a releasable or runnable capture candidate by
itself.

D7, real OJ access/actions, RC, release, push and PR remain unauthorized.
