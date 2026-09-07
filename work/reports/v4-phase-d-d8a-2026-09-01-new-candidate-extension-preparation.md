# V4 Phase D D8-A New-candidate Exact-extension Replacement Preparation

Date: 2026-09-01

Branch: `feature/v1-followup`

Documentation HEAD: `90aec3c85e053c39ab58e058b763f86dce036a81`

Immutable product candidate: `ee0e1f5a2332fdeaf743e6fcfcadb0d799f869f0`

Verdict: **PASS — old exact extension uninstalled, new exact extension loaded
under the same fixed ID, localhost Route H connection prepared, no OJ or
action**

## Authorization boundary

The user authorized one replacement in the current `yu` Chrome: uninstall the
unique enabled fixed-ID extension only when its canonical path exactly matched
`.tmp/v4-route-h-exact-dist-0c23fca`, then load only
`.tmp/v4-route-h-exact-dist-ee0e1f5`. Installation identity and capability
rotation were allowed, but extension ID rotation was forbidden.

The same authorization allowed localhost-only connection preparation and one
new bounded connection receipt. It did not authorize READY, an OJ page,
observer arm, action flags, a click, submission, NowCoder, D4 aggregation, RC,
release, push or PR.

## Frozen preflight

The exact candidate receipt remained SHA-256
`A46B79F64F4A9373D134EA918D67959BBECDD89172B7EB37B4DC7E4706188E7C`.
All five exact-dist artifacts matched the refreeze receipt: manifest
`DE980FDB...F76B8F`, background `0311DEF0...A83264`, content
`FF562221...39D8D`, popup `2AA3FC47...B06E1`, and main-world bridge
`4D89A80F...EE3943`. The observation-tool hash remained
`CE6D4CFC...363DD`; the acceptance-profile hash remained
`64455AC1...C61A9`; and the current `yu` profile matched its frozen path hash.

The new R5 profile ID, receipt and database identity were all absent before
execution. Port 3000 was free, the root DB pointer was absent, and the default
database hash was `2485DBEA...4666C3`.

## Exact extension replacement

After the web-access proxy handed off its exclusive CDP connection, a single
bounded replacement session retained only closed booleans. It proved the fixed
ID was unique, enabled and canonically bound to the old exact dist before
modification. It then called `Extensions.uninstall` once, observed the fixed ID
become absent, called `Extensions.loadUnpacked` once with only the new exact
dist, and required the returned ID and final unique binding to remain
`oldmkbngfokmhlkjmlichccmbebipmei`.

All replacement predicates passed. The first session nevertheless exited 1
because its post-close liveness check used Chrome's unavailable
`/json/version` HTTP endpoint. That endpoint had already returned 404 during
preflight and was not a valid liveness witness. No replacement was retried. An
immediate read-only CDP reconnection instead proved the original Chrome was
alive with one context and that the final fixed-ID binding was unique, enabled
and exactly bound to the new dist. PID `45404` and port 9222 also remained live.

The old exact-dist directory remains immutable historical evidence on disk; it
is no longer the installed binding.

## Localhost-only connection preparation

Fresh identity `r5-ready-yu-leetcode-ee0e1f5` was migrated at exactly `0/0/0`.
The existing observation runner was invoked once with
`--prepare-connection=true`, the new candidate/receipt/dist/hashes, current
`yu` CDP binding and no action or execution flags. It opened only localhost
root/status/settings/connect routes and the extension popup, then exited 0:

```text
CONNECTION_PREPARED=1
CONNECTION_RECEIPT=D:\Cowork\AI刷题训练平台\.tmp\v4-ready-connection-receipts\r5-ready-yu-leetcode-ee0e1f5.json
```

The schema-1 receipt passed its exact candidate, candidate-receipt, platform,
fixed extension ID, five artifact hashes, connected state, Vault-config
existence and zero-database checks. Receipt SHA-256 is
`F6EA6D1899D1D3D2E551EADB79DA1950FE1A777E14600076944ABF075A9A3A5F`.
Installation identity and capability version both changed relative to the old
receipt, as explicitly allowed; no raw installation identity, capability,
credential or extension storage was retained in this evidence.

## Stop proof

The runner returned before the OJ branch. No READY/action evidence file exists
for the new candidate/profile, no observer was armed, and no OJ page, action
authorization, click, submission or NowCoder run occurred.

After preparation, localhost stopped, port 3000 became free, the root DB
pointer was deleted, and the web-access proxy returned to READY. Chrome PID
`45404` and port 9222 survived. The new database remains `0/0/0`; the old
connection receipt remains byte-identical at SHA-256 `54076AA1...F7412E`; the
candidate receipt remains byte-identical; and the default database remains
479232 bytes at `2026-07-23T15:56:38.8411343Z`, SHA-256
`2485DBEA...4666C3`.

The task stopped at connection preparation. Any new-candidate READY-only run
requires a separate explicit authorization and must reuse the R5 identity,
zero database and bounded receipt above.

## Offline closeout verification

After browser and localhost cleanup, all focused contract gates exited 0:

- V4 D4 acceptance profiles PASS;
- V4 adapter readiness PASS;
- V4 plan authority PASS;
- plan-authority unit tests `3/3`; and
- `git diff --check` PASS.

No product source, extension source, runner, candidate artifact or dependency
was changed. The plan, handoff and this evidence report are intentionally
uncommitted; no push or PR was performed.
