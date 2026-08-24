# V4 Phase D Local Vault Route H D5 READY Contract Report

Date: 2026-08-25

Branch: `feature/v1-followup`

Scope: D5 offline READY preparation contract only

Verdict: PASS

## Result

Route H now has a closed two-step READY contract without transferring or
expanding any live-platform authorization. Preparation establishes one fresh
fixed Chrome profile and one empty disposable Vault through localhost only;
READY must later reuse and validate that exact prepared identity before an OJ
target can be opened.

This stage did not run the preparation mode, launch a browser, visit an OJ, or
authorize a click or submission. It changed and verified offline tooling,
machine contracts and documentation only.

## Preparation and receipt boundary

`scripts/v4-live-observation.mjs --prepare-connection=true` is the sole
preparation path. It:

- creates the canonical fresh fixed profile;
- loads the exact frozen extension dist;
- opens only `http://localhost:3000/settings`;
- clicks `连接扩展` once and validates the public extension capture state;
- requires `extension_local`, `connected`, an installation identity and
  capability version, an empty waiting/outbox/quarantine state, and disposable
  SQLite counts `0/0/0`;
- proves the expected Vault-external configuration file exists without opening
  or copying its secret-bearing content;
- writes a strict, bounded receipt below
  `.tmp/v4-ready-connection-receipts/`, closes Chrome and exits.

The receipt contains only candidate/platform/profile/database/Vault-config
identities, extension and installation identities, capability version,
candidate-receipt hash, five exact-dist hashes, zero database counts,
connection status and preparation time. Extra fields are rejected. The raw
capability is created and retained by the extension and is never read, copied,
logged or emitted by either observation mode.

The later READY run requires the pre-existing canonical profile and exact
receipt. Before navigation it revalidates every receipt binding against the
current candidate, exact dist, candidate receipt, profile, disposable database,
Vault config and extension public state. A mismatch fails closed.

## Observer and candidate boundary

- The observer ignores current public Route H keys such as `installationId`,
  `captureCapabilityVersion`, `captureConnectionStatus` and `connectedAt`.
- Legacy `captureCredential`, `captureCredentialVersion` and `pairedAt` are no
  longer ignored. Any legacy-key change is observable drift and fails closed.
- The D4 acceptance profile and validator now require the preparation contract
  and retain only `candidate_freeze` and `live_observation` as remaining gates.
- `extension/identity.json` participates in the observation-tool hash.
- Candidate validation now requires ancestry from
  `6c0e1d7e2184ac928f609cf94038aa00322f75e7` and classifies the complete
  `base..candidate` path set. This preserves the explicit whitelist across the
  approved D0-D6 phased commits instead of checking only the final commit.

## Documentation alignment

README, compliance, architecture and runbook documentation now describe the
same Route H behavior: no visible code, one local connection click after first
install or reinstall, automatic reuse across restart/reload/Vault switch, hash
only outside the Vault, raw capability only in trusted extension storage, and
an explicit reconnect path after a rejected capability.

## Verification evidence

- focused D5 suite: `6 files`, `138 passed / 138`;
- `npm run lint`: PASS;
- `npm run typecheck`: PASS;
- `npm run extension:check`: PASS, `53 files`, `1671/1671`, production dist
  parity PASS;
- `node scripts/audit-v4-extension-privacy.mjs`: PASS, `0 findings`;
- `node scripts/validate-v4-d4-acceptance-profiles.mjs --all`: PASS;
- `node scripts/validate-v4-adapter-readiness.mjs --all`: PASS;
- runner and observer syntax checks: PASS.

Frozen D5 observation-tool hash:

`309B3772EF23D28699841F66648FEC107E5D62CE8694F083AF5E157157A22C35`

Frozen D4 acceptance-profile hash:

`D8C348F13AE302166D0DDF4514FC5108CAAE39CBFA2D056A298A4CE4A6693225`

The default `training-platform.sqlite` remains `479232` bytes, with mtime
`2026-07-23T15:56:38.8411343Z` and SHA-256
`2485DBEA8E9C9CF2F073BC6C9BA4AA0A5261DC3744DDA7592A2890BC554666C3`.

## Stop gate

D5 is complete. D6 full offline gate and immutable Route H candidate freeze is
the next authorized phase. D7, OJ navigation, READY-only live lanes, real
actions, D4 delivery adjudication, RC, release, push and PR remain unauthorized.
