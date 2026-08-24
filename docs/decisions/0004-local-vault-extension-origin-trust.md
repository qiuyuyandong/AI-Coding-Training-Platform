# ADR 0004: Local Vault and Exact Extension-Origin Trust

- Status: Accepted for local V0/V1
- Date: 2026-08-24

## Context

The local pilot runs a Next.js application on localhost and stores learner data
in SQLite. Phase 0B3 protected capture writes with a visible pairing code and a
long-lived bearer credential held by the Chrome extension. That flow creates a
setup and recovery burden that does not improve the explicitly accepted local
host-compromise boundary: a process that can read the application source,
Chrome profile, SQLite file, or application runtime is already trusted for the
local V0/V1 product.

The browser boundary still needs to reject ordinary web pages and unrelated
extensions. Chrome supports a public manifest `key` that deterministically
fixes the unpacked extension ID. Whether Chrome sends the corresponding exact
`Origin` header for the required localhost service-worker requests is a factual
prerequisite and must be proven by the P1 real-Chrome spike before bearer
authentication is removed.

## Decision

For local V0/V1:

- the Next.js localhost process remains the only SQLite writer and transaction
  owner;
- the user selects a Local Vault directory through the local launcher, with an
  explicit absolute-path fallback when a graphical picker is unavailable;
- the launcher validates the Vault and passes its canonical database path only
  through the application child-process environment;
- changing Vaults requires stopping and restarting the local application; no
  browser API can hot-switch or choose an arbitrary filesystem path;
- an existing database can be adopted only by explicit copy, byte verification,
  migration and integrity validation, followed by atomic activation; the source
  database is never moved, deleted, overwritten, or migrated in place;
- the extension uses a public manifest `key` to obtain one frozen extension ID,
  and capture endpoints accept only the exact corresponding
  `chrome-extension://<id>` Origin;
- missing, `null`, malformed, web-page, localhost-page, wildcard, and other
  extension Origins fail closed before request-body parsing or database access;
- `installationId` remains a correlation and idempotency identifier, not an
  authorization credential;
- new capture evidence uses `extension_local`; historical
  `extension_unpaired` and `extension_paired` provenance remains unchanged;
- the visible pairing-code, bearer rotation and revocation product surfaces are
  removed after the P1 feasibility gate passes.

The manifest key is public identity configuration, not a secret or proof
against a hostile local process. Application source, Vault pointers, Chrome
profiles and SQLite files remain inside the accepted local trust boundary.

## Fail-closed feasibility gate

Before changing the production authentication path, an isolated Chrome MV3
spike must prove the same fixed ID and exact non-missing Origin across two fresh
profiles, extension reload, and browser restart for real localhost GET and JSON
POST requests. The spike opens no OJ page and writes no SQLite data. If this
gate fails, implementation stops and the user must choose a separately designed
one-click localhost handshake or Native Messaging boundary. Missing Origin,
wildcard CORS, copied credentials, or a silent return to visible pairing are not
permitted fallbacks.

## Vault ownership and safety

A Vault is a real, non-reparse local directory containing the application-owned
descriptor `.ai-coding-training-vault.json` and `training-platform.sqlite`.
Descriptor and active-Vault pointer files contain no token, OJ data, account
data, or database digest. They are written atomically and revalidated through
canonical paths on every launcher start. Conflicts, unknown versions, path
escape, symlinks, junctions, reparse points, invalid schemas, integrity errors,
or foreign-key errors fail closed.

## Consequences

Extension reload, browser restart, and uninstall/reinstall can reconnect to the
running local application without user-managed credentials. The local launcher
becomes the single product entrypoint and Vault switch boundary. Safe rollback
uses an unchanged source or another valid Vault with the corresponding older
application; no schema down migration is introduced.

## Phase 7 boundary

This ADR does not define cloud accounts, remote synchronization, server-side
authentication, multi-user authorization, deployment, or production service
monitoring. Those remain gated by the cloud Phase 7 architecture decision.
