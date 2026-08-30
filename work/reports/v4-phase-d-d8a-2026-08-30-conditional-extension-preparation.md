# V4 Phase D D8-A Conditional Exact-extension Preparation

Date: 2026-08-30

Branch: `feature/v1-followup`

HEAD: `e6b197bed7e9f40bcb2897fcdfb3e109fa05c701`

Product candidate: `0c23fcacf18d2fe4113d803504e638c1aab887d3`

Verdict: **conditional localhost-only preparation PASS; final exact binding
valid; bounded connection receipt rewritten; no OJ or action; D8-A remains
unconsumed**

## Authorization and implementation boundary

The user authorized one localhost-only conditional preparation in the current
`yu` Chrome. The existing runner was required to:

- call `Extensions.loadUnpacked` only if the fixed extension ID was completely
  absent;
- stop without changing extension state if any same-ID item existed but the
  unique/enabled/exact-path binding was invalid;
- complete only the bounded localhost Route H connection after a valid binding;
- allow a successful bounded connection-receipt rewrite; and
- never open an OJ page, execute an action, submit, or run NowCoder.

No product code, runner code, extension source, dependency or candidate artifact
was changed.

## Frozen preflight

The preflight matched:

- candidate receipt SHA-256
  `4EDA9DDD9FFB4311EDEA32B0D60DFEA34D54D07766E1490C02DB4B04582F9AEE`;
- observation-tool SHA-256
  `CE6D4CFC0FAD5B99A1EAD342FA7EE77D4AB5690E9EFF2FC2261EF702F17363DD`;
- acceptance-profile SHA-256
  `64455AC1DE043D30C44395675D37654EED44F13B0ABF24C9FC01E31D1BEC61A9`;
- `yu` profile-path SHA-256
  `C1CF71DEEA82DD059F08A27CEA2190CF26D040108C757527AB55870B46135242`;
- all five frozen exact-dist artifact hashes;
- disposable database `0/0/0`;
- default database SHA-256
  `2485DBEA8E9C9CF2F073BC6C9BA4AA0A5261DC3744DDA7592A2890BC554666C3`;
- Chrome PID `45404`, port 9222 and a READY web-access proxy; and
- free port 3000 with no root DB pointer.

The old connection receipt was byte-preserved in the same bounded directory
before execution. Its SHA-256 was
`C95CD887EC0DA69B86584C002C2A57BFF8C4895465C9C7D777F91D423644CBDA`.
This made failure restoration possible without broad filesystem mutation.

## Conditional preparation result

The exact proxy process handed off CDP. The runner was invoked once with
`--prepare-connection=true` and without action flags. It exited 0 after about
17.6 seconds with:

```text
CONNECTION_PREPARED=1
CONNECTION_RECEIPT=D:\Cowork\AI刷题训练平台\.tmp\v4-ready-connection-receipts\r4-ready-yu-leetcode-0c23fca.json
```

The preceding read-only diagnostic retained `exactIdUnique=false`. In the
reviewed runner, a zero fixed-ID count is the only branch that calls
`Extensions.loadUnpacked`; a non-zero same-ID state is not loaded or changed
and must pass unique/enabled/exact-path validation. This invocation completed
successfully, so it proves the final exact binding was valid and that an
existing invalid same-ID item was not modified. With no intervening extension
mutation by this agent, the result is consistent with the absent-ID load branch.
The runner intentionally retained no branch marker, so the load branch is not
claimed as a separate direct observation.

The localhost log contained only `/`, `/api/capture/status`, `/settings` and
the bounded `/api/capture/connect/*` handshake. The runner then checked the
extension popup READY state and confirmed unchanged zero database counts. It
did not enter the later OJ-observation branch.

## Receipt rewrite and stop proof

The new schema 1 bounded receipt passed exact candidate, platform, extension
ID, candidate-receipt, artifact-hash, connected-state and `0/0/0` checks. Its
SHA-256 is:

`54076AA16C16851B0B6C06467C18CF39D856A33B2B586821A773CF15A3F7412E`.

After that validation, the old receipt backup was removed, completing the
explicitly authorized rewrite. No backup or second receipt remains.

Final closure proved:

- Chrome PID `45404` and port 9222 survived;
- the web-access proxy returned to READY;
- localhost stopped and port 3000 is free;
- `.tmp/server-db-path.txt` is absent;
- no observation runner process remains;
- the disposable database remains exactly `0/0/0`;
- the candidate receipt and default database hashes are unchanged; and
- no new READY/action evidence, OJ navigation, action flag, click, submission
  or NowCoder run occurred.

`D8-A-2026-08-30-LC1` therefore remains authorized but unconsumed. Per the
unconditional stop boundary, Q1 or the real action may resume only after a new
explicit user continuation.

## Offline verification

The focused post-run gates passed:

- V4 D4 acceptance profiles;
- V4 adapter readiness;
- V4 plan authority;
- `tests/unit/v4PlanAuthorityValidator.test.ts` at `3/3`; and
- `git diff --check`.

Exactly one evidence file still matches the R4 identity. It is the unchanged
2026-08-29 READY-only evidence with SHA-256
`4ABB251B3656F75C3CFB83BA165BF980D430065F92B78780F092B73A459E84CC`.
No preparation evidence was relabelled as READY or action evidence.
