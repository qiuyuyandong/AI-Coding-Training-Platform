# ADR 0004: Local Vault and Installation-Bound Hidden Capability

- Status: Accepted for local V0/V1
- Date: 2026-08-24
- Amended: 2026-08-25 after the exact-Origin P1 stop

## Context

The local pilot runs a Next.js application on localhost and stores learner data
in SQLite. Phase 0B3 protected capture writes with a visible pairing code and a
long-lived bearer credential held by the Chrome extension. The user approved a
Local Vault product model without a visible code, but the first exact-Origin
design failed its real-browser gate: Chromium 138 omitted `Origin` on the
service-worker GET while sending it on JSON POST.

Later protocol research established a stronger limitation. Current Chromium
allows an extension with target host access to set or replace `Origin`,
including on POST. Exact Origin remains useful against ordinary web pages, but
it is not sufficient authentication against another extension that can target
localhost. The user accepts the narrower boundary and selected Route H rather
than Native Messaging.

## Decision

For local V0/V1:

- the Next.js localhost process remains the only SQLite writer and transaction
  owner;
- the user selects and switches a Local Vault through the local launcher;
- an existing database is adopted only by explicit copy, byte verification,
  migration and integrity validation; the source is never moved, deleted,
  overwritten or migrated in place;
- capture authentication remains localhost HTTP bearer authentication, but the
  bearer is created by one hidden, user-initiated connection handshake instead
  of a displayed pairing code;
- the capability belongs to the local application installation, not to a Vault;
  switching Vaults automatically preserves the connection;
- extension uninstall/reinstall removes the extension-side capability and
  requires one new local “连接扩展” click;
- Native Messaging is not introduced.

## Hidden connection protocol

The settings page exposes one `连接扩展` or `重新连接` button. A click:

1. creates an in-memory, cryptographically random challenge with a maximum
   60-second TTL;
2. sends a closed external-message request to the fixed extension ID;
3. lets the extension validate the exact localhost sender URL and message
   schema, generate a 256-bit capability, and complete the challenge directly
   with the localhost application;
4. lets the application atomically consume the challenge once and persist only
   a password-hash representation of the capability;
5. stores the raw capability only in `chrome.storage.local` after successful
   completion.

The page never receives the raw capability. Expired, replayed, malformed,
parallel-loser or unknown challenges fail closed. Reconnecting atomically
replaces the previous installation credential. A crash between server
completion and extension persistence is recovered by clicking reconnect; it
does not expose or copy the credential.

The manifest declares `externally_connectable.matches` only for the canonical
localhost application page and does not grant another extension ID. The
extension validates `sender.url` independently because the manifest match is
not the complete protocol check.

## Installation-level authentication state

The application stores authentication metadata outside every Vault in the
platform user-config directory, next to but separate from the active-Vault
pointer:

- `capture-installation.json` contains a schema version, installation ID,
  credential version, password hash, and bounded timestamps;
- it contains no raw capability, Vault path, Vault ID, OJ data, learner data or
  database digest;
- it is written through a same-directory temporary file and atomic rename;
- the launcher and application revalidate its schema and safe file type before
  use.

The raw capability exists only in extension-local storage and the HTTP
`Authorization: Bearer` request header. It is never written to SQLite, Vault
metadata, logs, reports, URLs or repository files.

## Capture request boundary

`POST /api/capture/attempts`, the compatibility events route, and the
authenticated status route require the valid bearer before opening SQLite or
parsing a capture body. Host, method, content type, size, CORS and exact
extension Origin remain fail-closed defense in depth, but documentation and
code must not label Origin as authentication.

The old pairing-code routes and UI are removed. Existing credential hashing,
constant-time verification, installation identity, rotation semantics,
outbox/retry behavior and transactional capture ingest are reused where their
contracts still fit.

New capture evidence uses `extension_local`. Historical
`extension_unpaired` and `extension_paired` provenance remains unchanged.
Legacy credential rows are removed from Vault databases by a forward migration
only after installation-level authentication is implemented and migration
fixtures prove history preservation.

## Threat boundary

This design must block:

- ordinary web pages calling capture APIs without the capability;
- other extensions directly messaging the fixed extension when their IDs are
  not allowed;
- requests with missing, malformed, stale, replayed or incorrect capability;
- arbitrary Origin, wildcard CORS and visible/copyable authorization codes.

This design does not claim to block:

- an extension that already has localhost host access and can actively inject
  or control the local application page;
- a process that can read Chrome storage, the application config directory,
  application memory, source code, Vault files or SQLite;
- a compromised browser or operating system.

These exclusions are the narrower malicious-extension boundary explicitly
accepted by the user. A future requirement to resist them must use a separately
approved Native Messaging design.

## Required feasibility gate

Before Vault, database or production capture changes, a real Chrome 151
localhost spike must prove:

- fixed-ID page-to-extension external messaging;
- rejection of a different extension ID;
- exact sender URL validation;
- 60-second expiry, single consumption, replay rejection and concurrent
  winner/loser behavior;
- a successful bearer POST into a disposable SQLite database;
- wrong or missing capability leaves database counts at `0/0/0`;
- restart, reload, fresh profile and uninstall/reinstall behavior matches this
  ADR.

The spike opens no OJ page and never touches the default database. Failure is a
hard stop before later phases.

## Consequences

Route H keeps the existing HTTP ingest and most credential/recovery machinery,
adds one local click after install or reinstall, and avoids Native Host
installation. Vault switching remains automatic because authentication state
is installation-scoped.

The trade-off is explicit: exact Origin is no longer advertised as extension
identity, and a sufficiently privileged malicious extension remains outside
the promised boundary.

## Phase 7 boundary

This ADR does not define cloud accounts, remote synchronization, server-side
multi-user authentication, deployment, production monitoring, real OJ actions,
release, push or PR. Those remain separately gated.
