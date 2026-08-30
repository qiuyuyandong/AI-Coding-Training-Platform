# V4 Phase D D8-A Extension-binding Read-only Diagnostic

Date: 2026-08-30

Branch: `feature/v1-followup`

HEAD: `e6b197bed7e9f40bcb2897fcdfb3e109fa05c701`

Product candidate: `0c23fcacf18d2fe4113d803504e638c1aab887d3`

Verdict: **read-only diagnostic complete; fixed-ID uniqueness false; no
mutation; D8-A action remains unconsumed**

## Authorization

The user separately authorized one localhost-only exact-extension binding
read-only diagnostic. The diagnostic could retain only three booleans:

1. whether the fixed extension ID appeared exactly once;
2. whether that unique item was enabled; and
3. whether that unique item's path equalled the frozen exact dist.

Extension state changes, receipt/storage writes, localhost, OJ navigation,
actions and NowCoder were prohibited. The operation had to stop immediately
after the single read.

## Execution

Before the read:

- Chrome PID `45404` and port 9222 were alive;
- web-access proxy was READY;
- port 3000 was free;
- the root DB pointer was absent;
- no observation runner was active.

The exact proxy process handed off the CDP channel. A direct Playwright client
connected and created only a browser-level CDP session. It did not create a
page. The session called `Extensions.getExtensions` once, filtered only for the
already-frozen extension ID and retained no other extension metadata.

## Retained result

```json
{
  "exactIdUnique": false,
  "enabled": false,
  "exactPath": false
}
```

The latter two values were computed as conjunctive results whose first
condition was `exactIdUnique`. Therefore, when uniqueness is false:

- `enabled=false` does not independently prove that an existing item is
  disabled;
- `exactPath=false` does not independently prove path drift; and
- the evidence intentionally does not distinguish zero fixed-ID entries from
  multiple entries.

No actual path, count, other extension ID/name/state or profile/account value
was retained or output.

## Stop and preservation proof

- the browser-level CDP session detached;
- the direct Playwright client closed;
- Chrome PID `45404` survived;
- web-access proxy returned to READY;
- `Extensions.loadUnpacked` did not run;
- no extension was loaded, enabled, disabled, removed or replaced;
- no candidate receipt, connection receipt or storage value was written;
- no localhost server, action runner or OJ page ran;
- no click, submission or NowCoder lane ran;
- no new action evidence was written;
- the disposable database remained `0/0/0`;
- the default database remained unchanged.

`D8-A-2026-08-30-LC1` remains authorized and unconsumed.

## Next decision

The minimum safe next scope is a separately authorized conditional
localhost-only exact-extension preparation:

- load the frozen exact dist only if the fixed ID is absent;
- if any fixed-ID entry already exists but binding remains invalid, fail closed
  without changing it; and
- explicitly decide whether a successful preparation may rewrite the bounded
  connection receipt.

Q1 and the action runner must not resume before that authorization. D4
aggregation, additional actions, RC, release, V0.5, push and PR remain
unauthorized.
