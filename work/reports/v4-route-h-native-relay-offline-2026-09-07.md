# Route H native relay offline report (2026-09-07)

## Verdict

`theoretical-ready` only. No current-account Chrome, OJ page, READY lane,
click, submission, or capture database action was used.

## Frozen product boundary

- Product candidate: `ee0e1f5a2332fdeaf743e6fcfcadb0d799f869f0`.
- `extension/src`, `extension/manifest.json`, and `extension/identity.json`
  have no diff from that candidate.
- The relay is observer tooling only. `ws` is a development dependency and is
  not imported by the application or extension production code.

## Transport contract

- Default: `--cdp-transport=playwright` (also used when the flag is omitted).
- Opt-in fallback: `--cdp-transport=native-relay` and an explicit
  `--cdp-active-port-file`.
- Local endpoint: `127.0.0.1`, operating-system selected port, random 192-bit
  path, one client, 1 MiB frame cap, 5 second upstream handshake cap.
- The relay forwards CDP text frames without inspecting or logging payloads.
  It closes only its two WebSocket connections and does not signal the browser
  process.

## Offline evidence

- Fake upstream tests cover bidirectional forwarding, a rejected second
  client, frame limits, handshake timeout, loopback endpoint validation, and
  payload-free logs.
- A bundled headless Chromium test connects Playwright through the relay,
  creates and closes a synthetic page, disconnects Playwright, then proves the
  original Chromium `/json/version` endpoint and process remain alive.
- Focused result: 60/60 tests passed (observer contract plus relay suites).
- TypeScript and ESLint passed.

Observation-tool SHA-256 after this change:
`08E9199BA12C3846464086E2D3DD0D13A145284449EDF361CBF26CF95CCEA23D`.

This hash is not a runtime-validation receipt. Any future Route H preparation
or observation remains separately gated and must calculate and bind the tool
hash again from the committed files.
