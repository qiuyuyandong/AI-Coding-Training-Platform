# Offline theoretical-ready independent repair

Status: implemented and offline-verified on `codex/offline-theoretical-v1`; `theoretical-ready` only.

## Objective

Repair the independently reproduced offline defects at checkpoint `c1d4cd7`, add evidence-bearing regression coverage, and re-evaluate `theoretical-ready` without using real Chrome/OJ/provider/workspace/Windows environments. Preserve the default database and frozen extension candidate `ee0e1f5`.

## Locked product semantics

- AI quota is consumed once when a provider request is actually launched. A later persistence failure does not refund quota. The same request key must never call or charge the provider twice and must recover to a deterministic durable `persistence_error` fallback. Reusing the key with different input is always a conflict.
- Vault backups include only active, database-referenced full snapshots. Soft-deleted and orphan files are excluded. Backup databases use location-neutral snapshot references and restore rewrites them to the destination Vault.
- AI provider endpoints must be public HTTPS. HTTP, credentials in URLs, loopback, private, link-local, unspecified, CGNAT, multicast/reserved IPv4 literals, and IPv6 ULA/link-local/unspecified/loopback literals are rejected. Operator-supplied public hostnames remain supported without DNS lookup or pinning.

## Implementation sequence

1. Preserve the clean baseline and record minimum reproductions for shared snapshot deletion, AI post-provider persistence failure, orphan/corrupt Vault snapshots, cross-path restore, malformed relay upgrade, and endpoint filtering.
2. Fix evidence deletion at the shared service boundary. Soft-delete database rows while retaining the full snapshot locator required by schema; remove the content-addressed file only when no other active reference exists, and restore it if the database transaction fails.
3. Add migration `0018_ai_request_lifecycle.sql`. Reserve request identity and quota atomically before provider launch, recover unfinished same-input requests without another provider call or charge, and persist a deterministic `persistence_error` result/audit. Reject changed input before quota checks.
4. Make Vault backups copy only validated active snapshots, normalize snapshot locators inside the backup database, rewrite locators for the destination before the restore swap, and make diagnosis verify location, name, bytes/hash, and unexpected managed snapshot files without exposing paths.
5. Reset relay handshake ownership when an upgrade fails and tighten the existing OpenAI-compatible endpoint guard to the locked public-HTTPS policy.
6. Add fresh acceptance to the canonical quality gate and update active status/runbook/architecture/compliance/closeout documents using only new observed counts.

## Verification

- Focused Vitest: project evidence, AI coach/OpenAI adapter, Vault operations, relay, migrations, and quality-gate contract.
- Fresh `npm run e2e:acceptance` from its owned temporary database/Vault with no external traffic.
- One complete `npm run quality:gate`, now including fresh acceptance, with all data under owned temporary directories.
- Before/after metadata-only comparison of the default `training-platform.sqlite`; exact diff check for frozen candidate product paths; `git diff --check`.

## Delivery boundary

Commit only the verified repair, tests, plan, and evidence/status documentation, then push only `codex/offline-theoretical-v1`. Do not create a PR, merge, release, deploy, or start any runtime-validation protocol. The maximum verdict is `theoretical-ready`.

## Execution result

The review reproduced and repaired all six planned defect classes. Shared
content-addressed full snapshots now survive until their last active reference
is deleted. Migration `0018_ai_request_lifecycle.sql` makes provider launch,
one-time quota charging, post-provider persistence recovery, and changed-input
conflicts durable. Vault backup now rejects corrupt active references, excludes
deleted/orphan snapshots, stores location-neutral references, and rewrites and
validates them before a destination restore swap. Diagnosis distinguishes
missing, corrupt, and unreferenced files without emitting paths. The relay
releases its one-client slot after a malformed upgrade. Provider URLs are
limited to syntactically public HTTPS, including correct treatment of
IPv4-mapped IPv6 literals.

The canonical gate now has ten stages and requires fresh local-V1 acceptance.
The final run exited `0`: root Vitest `2707 passed / 1 skipped`, App E2E
`25/25`, fresh acceptance `1/1`, extension `1671/1671`, extension E2E
`55 passed / 1 skipped`, and production build `28/28`. The default database
remained `479232` bytes with UTC mtime `2026-07-23T15:56:38.8411343Z` and
SHA-256 `2485DBEA8E9C9CF2F073BC6C9BA4AA0A5261DC3744DDA7592A2890BC554666C3`.
Ports 3000 and 3010 were free after teardown, owned Playwright roots were
removed, and the frozen extension product paths have zero diff from
`ee0e1f5a2332fdeaf743e6fcfcadb0d799f869f0`.

One root test remains skipped because this Windows host cannot create file
symlinks without Developer Mode/administrator capability; mandatory junction
tests pass. One extension E2E worker-restart seam remains the documented
harness skip. No real Chrome, OJ, provider, compiler workspace, clean Windows
restore, pilot, PR, release, or deployment validation ran.
