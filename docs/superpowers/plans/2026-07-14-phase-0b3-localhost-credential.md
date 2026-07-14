# Phase 0B3 Localhost Credential Implementation Plan

**Status:** Completed and verified on 2026-07-14; retained as an implementation record.

> **Execution:** Use `superpowers:executing-plans`. Implement the four tasks in order, run each task's focused verification, inspect the diff, and commit it independently. Use `superpowers:verification-before-completion` before the final gate.

**Goal:** Add deliberate localhost extension pairing, trusted provenance, rotation/revocation, and hardened capture request boundaries without losing queued or persisted evidence.

**Architecture:** SQLite owns hashed credentials and one-time pairing codes. Next.js routes enforce request shape/origin and bind the bearer credential to the event's logical installation. Chrome's service worker exclusively stores and sends the credential; content scripts receive only a narrow runtime context.

**Scope controls:** Preserve all 0B1/0B2 rows; keep `SESSION_ENDED` optional; keep `installationId` non-authoritative; do not add accounts, cookies, OS keychains, cloud sync, external calls, or platform-content access.

---

## Task 1: Credential domain, provenance, and preserving migration

**Files:**

- Create `lib/db/migrations/0004_capture_credentials.sql`
- Create `lib/domain/captureCredential.ts`
- Create `lib/repositories/captureInstallations.ts`
- Create `lib/services/captureCredentials.ts`
- Modify `lib/capture/protocol.ts`
- Modify `lib/domain/training.ts`
- Modify `extension/src/installation.ts`
- Modify `extension/src/captureSession.ts`
- Modify affected unit fixtures
- Add `tests/unit/captureCredentials.test.ts`
- Extend `tests/unit/migrations.test.ts`, `tests/unit/extensionInstallation.test.ts`, and `tests/unit/extensionCaptureSession.test.ts`

**Steps:**

1. Add failing tests for 256-bit secret generation/hashing, code expiry/one-time use, new pairing, targeted rotation, revocation, installation mismatch, and preserved migration rows.
2. Expand provenance schemas to `extension_unpaired | extension_paired`; make runtime/session provenance explicit.
3. Add the preserving table rebuild and credential tables with constraints/indexes.
4. Implement repositories and a transactional credential service with injectable clock/secret generation for deterministic tests.
5. Run `npm run test -- tests/unit/captureCredentials.test.ts tests/unit/migrations.test.ts tests/unit/extensionInstallation.test.ts tests/unit/extensionCaptureSession.test.ts` and `npm run typecheck`.
6. Commit `feat: add capture credential domain`.

## Task 2: Hardened pairing and authenticated capture APIs

**Files:**

- Create `lib/http/captureRequest.ts`
- Create `app/api/capture/pair/route.ts`
- Create `app/api/capture/pairing-codes/route.ts`
- Create `app/api/capture/installations/[id]/revoke/route.ts`
- Modify `app/api/capture/events/route.ts`
- Modify `lib/services/captureMaterializer.ts` only as needed for the outer transaction
- Add `tests/unit/captureRequest.test.ts`
- Extend `tests/unit/captureApi.test.ts`

**Steps:**

1. Add failing tests for media type, 64 KiB cap, malformed JSON, origin policy, missing/revoked/mismatched bearer credentials, exact replay, payload conflict, pairing exchange, rotation, and revocation.
2. Implement bounded JSON parsing and separate same-origin management vs extension-origin guards.
3. Implement pairing-code and revocation routes without returning or logging stored hashes.
4. Authenticate capture events and keep authorization, raw write, projection, and last-seen update inside one outer transaction.
5. Run `npm run test -- tests/unit/captureRequest.test.ts tests/unit/captureApi.test.ts tests/unit/captureCredentials.test.ts` and `npm run typecheck`.
6. Commit `feat: authenticate localhost capture api`.

## Task 3: Trusted extension storage, pairing, and queue recovery

**Files:**

- Modify `extension/src/background.ts`
- Modify `extension/src/content.ts`
- Modify `extension/src/installation.ts`
- Modify `extension/src/transport.ts`
- Modify `extension/src/queueDrain.ts`
- Modify `extension/src/popup.html`
- Modify `extension/src/popup.ts`
- Modify `extension/src/popup.css` if present
- Add `extension/src/pairing.ts`
- Extend extension unit tests

**Steps:**

1. Add failing pure tests for pairing response parsing/storage plans, paired runtime provenance, authorization headers, and `401` queue retention without retry increment.
2. Restrict `chrome.storage.local` to `TRUSTED_CONTEXTS` before initialization and remove content-script storage reads.
3. Add a service-worker pairing message that exchanges the code, persists the returned credential, clears auth errors, and schedules a flush without exposing the credential to the content script.
4. Send bearer credentials during capture. Treat `401` as a stable auth block; preserve FIFO order and retry budget.
5. Add popup pairing state/form and keep the raw long-lived credential hidden.
6. Run focused extension unit tests, `npm run typecheck`, and `npm run extension:build`.
7. Commit `feat: pair extension with local capture`.

## Task 4: Settings, browser proof, docs, and release gate

**Files:**

- Create `app/settings/page.tsx`
- Create `app/settings/CapturePairingSettings.tsx`
- Modify `app/layout.tsx`
- Add/modify Playwright specs and authenticated capture fixtures
- Modify `README.md`, `COMPLIANCE.md`, `docs/architecture.md`, and `docs/runbook.md`

**Steps:**

1. Add the server settings page with a narrow client control for new code, targeted rotation code, and revocation; close the SQLite handle in `finally`.
2. Update E2E fixtures to pair a logical installation before capture. Add a user-visible settings test and an API isolation test proving revoked/mismatched credentials cannot write.
3. Document pairing, rotation, revocation, origin/body limits, trusted/unpaired provenance, queue recovery, and the explicit host-compromise limitation.
4. Run focused settings/API E2E against a disposable database and inspect it for zero unauthenticated writes.
5. Run the full gate separately: `npm run db:migrate`, `npm run test`, `npm run typecheck`, `npm run e2e`, `npm run extension:build`, and `npm run build`. Hash the default database before/after E2E.
6. Inspect `git diff`, forbidden TypeScript escape hatches, and `git status`.
7. Commit `test: verify localhost capture pairing`.

## Fast self-review record

- **Threat-model correction:** Origin alone is spoofable and is not authentication; the bearer credential is authoritative.
- **Rotation correction:** The settings page issues a targeted one-time code; it never attempts to write Chrome storage directly.
- **Queue correction:** `401` must block and retain, not follow permanent-error deletion or capped server retry behavior.
- **Provenance correction:** authenticated delivery does not retroactively upgrade an event captured before pairing.
- **Migration correction:** 0004 rebuilds constrained tables by copy and rename and preserves sessions/events/attempts.
- **Scope correction:** host filesystem compromise, accounts, OS keychains, TLS, and cloud credentials remain outside 0B3.

