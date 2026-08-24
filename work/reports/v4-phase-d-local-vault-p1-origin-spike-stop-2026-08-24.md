# V4 Phase D Local Vault P1 Origin Spike Stop — 2026-08-24

## Verdict

`P1_FAIL_CLOSED_EXACT_ORIGIN_GET_UNSATISFIED`

The fixed manifest key produced the expected Chrome extension ID and a real
service-worker JSON POST reached the localhost probe through the exact-Origin
allow branch. A real GET from the same worker returned `403`; the probe emits
that status only when the request Origin is not exactly the frozen extension
Origin. The approved contract requires both GET and JSON POST to carry the exact
non-missing Origin, so execution stopped on the first fresh profile.

P2–P6 did not start. No fallback was selected.

## Frozen spike identity

- Public identity file: `extension/identity.json`
- Expected extension ID: `oldmkbngfokmhlkjmlichccmbebipmei`
- Exact Origin: `chrome-extension://oldmkbngfokmhlkjmlichccmbebipmei`
- Identity file SHA-256:
  `8C699DD97C63A9C2301EEF63415A6C0132078B6EFCA256AEF91D08162118A3EE`

The file contains only a public RSA SubjectPublicKeyInfo value and derived
identity. It contains no private key, credential, token, OJ data, or user data.

## Executed checks

1. `npm run extension:build` — PASS. This produced the ordinary ignored
   production dist from the unchanged production manifest.
2. `npx vitest run --no-file-parallelism tests/unit/extensionIdentity.test.ts`
   — PASS, `11/11`.
3. `npm run typecheck` — PASS after correcting spike-only type declarations.
4. `npx playwright test --config playwright.origin-spike.config.ts` — FAIL,
   `0/1`, on the first fresh profile:
   - service-worker URL host: exact frozen ID;
   - `chrome.runtime.id`: exact frozen ID;
   - real localhost JSON POST: `200`;
   - real localhost GET: `403`, expected `200`.

An earlier harness attempt failed before Chrome launch because Windows rejected
the initial recursive directory-copy API. The harness was changed to copy the
flat production dist file-by-file. That pre-browser harness error is not the P1
product verdict; the later real-Chrome GET result is.

## Lifecycle scope and stop behavior

The first fresh-profile result is sufficient to violate the approved P1 gate.
Browser restart, extension reload and the second fresh profile were deliberately
not run after the failure. No request accepted missing Origin, no wildcard CORS
header was emitted, and the existing bearer/pairing implementation was not
removed or bypassed.

The test copied `extension/dist` into an OS-temporary directory and injected the
public key only into that temporary manifest. The `finally` cleanup removed the
temporary dist and profile. `extension/manifest.json` has no diff from HEAD.

## Safety evidence

- No Next.js process was started.
- The probe listened only on `127.0.0.1:3000` and was closed; post-run listener
  count on port 3000 is zero.
- No OJ page or OJ endpoint was opened.
- `.tmp/server-db-path.txt` is absent; no disposable or default SQLite database
  was created, migrated, or opened by the spike.
- Default database remains:
  - size `479232` bytes;
  - mtime UTC `2026-07-23T15:56:38.8411343Z`;
  - SHA-256
    `2485DBEA8E9C9CF2F073BC6C9BA4AA0A5261DC3744DDA7592A2890BC554666C3`.
- Existing user-owned Sentry and handoff working-tree changes were neither
  reverted nor staged.

## Evidence asset hashes

| Asset | SHA-256 |
|---|---|
| `lib/extension/identity.ts` | `F919A82435BC1E1A42ADD2DF2A35FB17853CB0CAFA345C595DFA9EDD3EB8890A` |
| `lib/http/extensionOrigin.ts` | `D6DBDA687951042C5D69CEC78C86C0CBCE94D34B0F1A8E2FC67965C0C9AA439B` |
| `playwright.origin-spike.config.ts` | `06064A45F9554FD5906F59CC4DE6936F741CF115C0F221955F2DFA63B030A6A6` |
| `tests/unit/extensionIdentity.test.ts` | `5167EEFE378F2C9CF3B625C92B88278F1A48A05584C126212900993DC2401051` |
| `tests/extension-e2e/capture-local-origin-spike.spec.ts` | `FBEBB5F636BCC2F0BA5D855A76DE8037E899F87DAA2123A93733F3E0C9D6B360` |

## Required user decision

The exact-Origin-only design is closed under its approved contract. The next
work must be a new design and plan for one of the two named fallbacks:

1. a hidden one-click localhost handshake that preserves the local Next.js
   architecture and removes manual code copy/paste while retaining a bounded
   secret; or
2. Chrome Native Messaging with an installed native host and stronger extension
   identity at the cost of packaging and installation complexity.

Accepting missing Origin, widening CORS, silently restoring visible pairing,
or letting the extension write the Vault directly is not authorized.
