# V4 Phase D D8-A yu Chrome Root-cause Revision Report

Date: 2026-08-28

Branch: `feature/v1-followup`

Product candidate: `0c23fcacf18d2fe4113d803504e638c1aab887d3`

Verdict: R0-R3 PASS; R4 later failed closed before READY; R5 was not run

Execution continuation: R4 successfully prepared the exact extension and
bounded connection receipt in `yu`, but its CDP cleanup left the Node process
alive after `CONNECTION_PREPARED=1`. The hard gate stopped before READY or any
OJ action. See
`work/reports/v4-phase-d-d8ar-yu-chrome-r4-pre-action-stop-2026-08-28.md`.

Lifecycle resolution: the separately authorized minimum repair later passed
without OJ navigation or action; see
`work/reports/v4-phase-d-r4-cdp-lifecycle-repair-2026-08-29.md`.

## Authorization

The user requires every future real submission observation to use the currently
remote-debugged Chrome profile identified locally as `yu`. The user authorized
the offline root-cause revision and one new D8-A LeetCode
`merge-two-sorted-lists` action only after the revision gates pass. NowCoder is
outside scope.

The alias is bound to the current official Chrome profile-path SHA-256 only:

`C1CF71DEEA82DD059F08A27CEA2190CF26D040108C757527AB55870B46135242`

No account name, email, account ID, cookie, token, localStorage value, editor
content or problem statement enters the contract or evidence.

## Root-cause disposition

The first D8-A failed before any observer stage. Its server log showed the first
`/api/capture/status` compile taking about 24.6 seconds while the runner exited
after about 28.6 seconds. The old runner warmed only `/`, then launched the
extension whose startup connection probe depended on the cold status route and
a 20-second readiness window. This is the strongest current causal explanation
and remains graded `PROBABLE` until R4 proves the corrected sequence.

The top-level observation catch reduced every such failure to
`observer_unexpected_failure`. This diagnostic information loss is directly
confirmed and is fixed with a closed phase enum; no exception message or stack
is added to evidence.

The old fresh-profile browser contract also conflicted with the new user policy.
The live action contract now requires the current remote-debug Chrome, exact
profile hash, exact unpacked candidate extension ID/path and runner-owned tabs
only.

## Minimal implementation

- prewarm `/api/capture/status` with an unauthenticated exact-extension-origin
  request and require the expected 401 before extension probing;
- parse only the bounded two-line `DevToolsActivePort` document and accept only
  a loopback browser WebSocket;
- attach through the installed Playwright version and use Chrome's official
  `Extensions.getExtensions` / `Extensions.loadUnpacked` domain;
- reject an absent exact extension outside preparation, a duplicate ID, a
  wrong path, a disabled extension or a profile-hash mismatch;
- retain only the profile path hash and close only runner-created pages;
- require action authorization and the execution flag together, then click the
  unique visible exact `提交` button once after all READY markers;
- stop on ACK or one bounded timeout without closing the daily Chrome.

No dependency, product runtime, extension source or frozen exact-dist artifact
changed.

## Verification

RED:

```text
4 failed / 63 passed
```

The four failures were exactly the unimplemented CDP/profile/extension/failure-
phase/live-browser contracts.

GREEN:

```text
focused observation + contract + plan: 70/70
privacy focused: 47/47
syntax: PASS
targeted lint: PASS
typecheck: PASS
V4 extension privacy audit: PASS (0 findings)
acceptance profile validator: PASS
adapter readiness validator: PASS
```

A read-only compatibility check first confirmed that a second concurrent
browser-level connection is rejected with HTTP 403. After an explicit proxy
handoff, the same Chrome accepted the runner connection and reported:

```text
product=Chrome/151.0.7922.174
protocolVersion=1.3
contexts=1
Extensions.getExtensions=available
expected candidate extension=not installed
```

No extension was loaded by that read-only check, and the web-access proxy was
restored afterward.

## Frozen identities

- observation tool SHA-256:
  `7C64947398D8C91D92D68BD95CC703750633AD3F908BA26365BD1891F6ECA80E`;
- acceptance profile SHA-256:
  `64455AC1DE043D30C44395675D37654EED44F13B0ABF24C9FC01E31D1BEC61A9`;
- candidate receipt SHA-256:
  `4EDA9DDD9FFB4311EDEA32B0D60DFEA34D54D07766E1490C02DB4B04582F9AEE`;
- default database SHA-256:
  `2485DBEA8E9C9CF2F073BC6C9BA4AA0A5261DC3744DDA7592A2890BC554666C3`.

## Sentry and Ponytail

Sentry read-only querying was unavailable because no local
`SENTRY_AUTH_TOKEN`, organization or project is configured. No credential was
requested in chat, no event was sent and Sentry is not treated as a passed
gate.

Ponytail review found no new dependency, browser manager, account subsystem,
retry framework or general CDP abstraction. Verdict: `Lean already. Ship.`

## Stop gate

R4 is next: proxy handoff, localhost-only exact-extension preparation and READY
preflight on the `yu` Chrome with database `0/0/0`. Any R4 failure stops the
authorization before an OJ action. Only an R4 PASS permits the single R5
LeetCode action; NowCoder remains prohibited.
