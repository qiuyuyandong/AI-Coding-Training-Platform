# Phase 0B3 Localhost Credential Design

**Status:** Approved for implementation on 2026-07-14

**Outcome:** Only a deliberately paired Chrome extension installation can write capture events to the localhost application, and the owner can rotate or revoke that installation from `/settings`.

## Security boundary

0B3 protects the localhost HTTP ingestion boundary. It prevents an ordinary unpaired browser page or local HTTP client from presenting capture events as paired extension evidence. It does not protect against a process that can already read or modify the SQLite file, the Chrome profile, or this application's source/runtime. That stronger host-compromise boundary requires OS credentials and encrypted storage and is outside Pre-V0.

`installationId` remains a logical correlation identifier. Authorization comes from a separate 256-bit random bearer credential. `Origin` is defense in depth, not identity: explicit non-extension origins are rejected on extension endpoints, while a missing origin remains valid because browser/runtime behavior and non-browser diagnostics can omit it. Management mutations require an exact same-origin request.

Chrome's extension guidance supports cross-origin service-worker requests through declared host permissions and provides `storage.local.setAccessLevel({ accessLevel: "TRUSTED_CONTEXTS" })` to prevent content-script access. The credential therefore stays in the service worker/popup trust boundary and is never returned to a content script.

References:

- <https://developer.chrome.com/docs/extensions/develop/concepts/network-requests>
- <https://developer.chrome.com/docs/extensions/reference/api/storage/>
- <https://developer.chrome.com/docs/extensions/reference/api/webRequest>
- <https://nodejs.org/api/crypto.html>

## Pairing and lifecycle

1. `/settings` creates a one-time, 256-bit random pairing code valid for ten minutes.
2. The user pastes the code into the extension popup.
3. The service worker sends the code and its existing `installationId` to `POST /api/capture/pair`.
4. In one database transaction, the server consumes the code and creates or rotates the installation credential.
5. The response returns the new credential once. The service worker stores it in trusted-only `chrome.storage.local` and immediately retries its FIFO queue.
6. Capture requests use `Authorization: Bearer <credential>`. Missing, revoked, unknown, or installation-mismatched credentials receive the same `401` response.

For first pairing, an unscoped code may create a new installation but cannot rotate an existing one. Rotation starts from `/settings` and produces a code scoped to a named installation; successful exchange invalidates the previous credential atomically. Revocation immediately marks an installation revoked. A later explicit rotation code may reactivate it with a fresh credential.

The server stores only SHA-256 hashes of high-entropy pairing codes and credentials. Raw secrets are never logged or persisted by the application. SHA-256 is appropriate here because the inputs are random 256-bit secrets rather than human passwords.

## Data model and provenance

Migration `0004_capture_credentials.sql` preserves all Phase 0B1/0B2 rows while rebuilding the two provenance-constrained tables to accept:

- `extension_unpaired`: observed before the extension had a credential;
- `extension_paired`: observed after the service worker had a credential.

Existing queued unpaired events are not deleted or upgraded. Once pairing succeeds they may be delivered under an authenticated request but retain `extension_unpaired`, so historical evidence is not falsely promoted.

New tables:

- `capture_installations`: logical installation ID, credential hash/version, active or revoked state, creation/rotation/revocation/last-seen timestamps;
- `capture_pairing_codes`: code hash, optional target installation ID, expiry, consumption timestamp, and creation timestamp.

`training_sessions.ended_at` remains nullable. Session identity stays `(installationId, platform, problemExternalId)`; provenance is fixed by the session's first event and is not upgraded mid-session.

## HTTP contracts

All JSON mutation endpoints require `Content-Type: application/json` and reject bodies over 64 KiB before parsing.

| Endpoint | Caller and guard | Result |
|---|---|---|
| `POST /api/capture/pairing-codes` | exact same-origin settings request | creates a new or installation-scoped rotation code |
| `POST /api/capture/pair` | extension origin or absent origin; one-time code | returns one fresh credential |
| `POST /api/capture/installations/:id/revoke` | exact same-origin settings request | revokes the installation |
| `POST /api/capture/events` | extension origin or absent origin; bearer credential | authenticates installation, writes raw event, and projects it atomically |

Malformed JSON is `400`, unsupported media type is `415`, oversized body is `413`, explicit disallowed origin is `403`, authentication failure is `401`, and event identity/payload conflict remains `409`.

The capture route wraps credential authorization, raw-event insertion, deterministic projection, and `last_seen_at` update in one outer transaction. The existing event fingerprint continues to distinguish exact replay from a conflicting reuse of `eventId`.

## Extension behavior

At startup, the service worker restricts local storage to trusted extension contexts before reading or writing it. Content scripts no longer read `chrome.storage.local`; they request a narrow runtime context containing only `installationId`, `captureEnabled`, and the current provenance level.

The popup shows pairing state and accepts a pairing code. It never displays the long-lived credential. A `401` is an authentication block: the queue head is retained without consuming retry budget, draining stops, and the popup reports that pairing is required. A successful pairing clears the auth error and resumes delivery. Validation/conflict errors remain permanent; network/server errors keep their existing retry policy.

## Verification and failure conditions

0B3 fails if any of these are true:

- an unauthenticated, revoked, or installation-mismatched request writes a raw event;
- pairing code consumption or credential rotation is non-atomic;
- a content script can read the long-lived credential;
- `401` deletes queued evidence or consumes its retry cap;
- legacy unpaired events are promoted to paired provenance;
- migration loses existing sessions, attempts, or events;
- current capture replay/conflict and nullable-session-end guarantees regress.

