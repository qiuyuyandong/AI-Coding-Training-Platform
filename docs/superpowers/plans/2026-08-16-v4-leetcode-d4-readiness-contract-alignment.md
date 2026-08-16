# V4 LeetCode D4 Readiness Contract Alignment

**Status:** `P0A CONTRACT ALIGNMENT COMPLETE — P1 LATER COMPLETED IN PARENT PLAN; LEETCODE REMAINS EXPERIMENTAL; CANDIDATE FREEZE, LIVE, AND D5 NOT AUTHORIZED`

**Date:** 2026-08-16

## Characterization

- Date and source: 2026-07-30,
  `work/reports/v4-leetcode-c1-characterization-2026-07-30.md`.
- Evidence tier: authenticated characterization; readiness remains
  `experimental`.
- Safe fixture paths: existing sanitized LeetCode authenticated fixtures only;
  no new fixture or raw transcript is created by this contract alignment.
- Exact request matcher: preserve the implemented legacy exact REST submit/check
  chain. For the P1 target result-root branch, require one trusted visible exact submit
  ActionEpoch and pre-action baseline, followed by one exact owned-host
  result-distribution GET carrying a new stable numeric submission ID. REST
  submit and GraphQL may corroborate but are not required; conflicts fail
  closed.
- E2 target policy: one same-document bounded ActionEpoch, a
  zero/fresh result baseline, no competing action/submission, and exactly one
  new result-distribution ID bound to the exact host/problem within five
  seconds. Baseline, historical, crossed, conflicting, or multiple IDs reject.
- E3 final-verdict identity policy: unchanged; one trusted final verdict must
  match the exact durable namespaced LeetCode confirmation and changed final
  result surface.
- Retained allowlisted fields: method, normalized path-derived endpoint key,
  HTTP status, stable submission ID, problem slug, final verdict, and opaque
  request/tab/frame/document identity in memory.
- Forbidden data confirmation: no request/response body, headers, cookies,
  credentials, source code, problem text, account identity, or raw transcript.

## Scope

- Objective: complete the accepted rescue plan's P0A C0 alignment by making
  readiness, architecture, D4 profile, validator, and tests describe the same
  P1 target result-root policy without claiming it is already fully enforced by
  current runtime.
- Files: `docs/superpowers/specs/v4-adapter-readiness.json`,
  `docs/superpowers/specs/v4-d4-acceptance-profiles.json`,
  `docs/superpowers/specs/2026-07-30-v4-leetcode-network-adapter-design.md`,
  `docs/architecture.md`, the two profile/readiness validators and focused
  tests, and the parent rescue plan.
- Dependencies and authorization: the user explicitly accepted `ISOLATED` as
  the replacement D4 minimum on 2026-08-16. Authorization covers this P0A
  contract alignment only.
- Explicit non-goals: no production runtime change, candidate freeze, build,
  real platform action, observation retry, D5, F1-F4, RC, release, push, or PR.

## Tests First

- Failing unit cases: lock the exact LeetCode readiness matcher/E2 policy;
  reject draft profile status, non-`ISOLATED` causal grade, readiness
  misalignment, missing authorization source, top-level contract drift, and
  removal of remaining authorization gates.
- Fake OJ cases: not run or modified in P0A.
- Real extension E2E cases: not run in P0A.
- Real observation cases: forbidden in P0A.

## Implementation Boundary

- Shared modules that may be modified and the reviewed defect that justifies
  it: no production module. The defect is contract drift between the accepted
  D4 profile, current adapter behavior, and GraphQL-required readiness prose.
- Adapters and protocol-specific files that must not be touched: all
  `extension/src/**` files remain unchanged by P0A.
- Forbidden inferences: no latest/highest-row selection, time-only/window-only
  acceptance, account correlation, historical result reuse, cross-platform
  protocol reuse, or reclassification of historical Route A evidence.

## Failure Disposition

- Missing or ambiguous E1/E2/E3: fail closed under the parent rescue plan's
  `PROFILE_UNRESOLVED`, `PRODUCT_FAIL`, or observer/platform failure taxonomy;
  this documentation alignment produces no runtime verdict.
- Endpoint drift: preserve bounded path-only diagnostics and closed rejection;
  a generic endpoint key cannot satisfy readiness.
- Terminal readiness result: LeetCode remains network-`experimental`.

## Verification

P0A runs only contract-focused checks:

```powershell
node scripts/validate-v4-adapter-readiness.mjs --all
node scripts/validate-v4-d4-acceptance-profiles.mjs --all
npm exec vitest run -- --no-file-parallelism tests/unit/v4AdapterReadinessValidator.test.ts tests/unit/v4D4AcceptanceProfileValidator.test.ts
npm run typecheck
npm exec eslint -- scripts/validate-v4-d4-acceptance-profiles.mjs tests/unit/v4AdapterReadinessValidator.test.ts tests/unit/v4D4AcceptanceProfileValidator.test.ts --max-warnings=0
```

The template's broader `extension:check`, `extension:e2e`, and `quality:gate`
remain P1/P5 evidence and are not run or claimed by this contract-only step.

## Completion

- Actual terminal readiness result: unchanged, `experimental`.
- Evidence report: this plan and the parent rescue plan's P0A record.
- Review result: contract-focused validation PASS: readiness CLI PASS, D4
  profile CLI PASS, focused tests `34/34`, typecheck PASS, and targeted ESLint
  PASS with zero warnings. P1 was not started in this P0A step; it later
  completed under the accepted parent plan's separate offline package. Candidate
  freeze, live action, D5, and release remain unauthorized.
