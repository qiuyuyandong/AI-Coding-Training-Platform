# V4 LeetCode Network Adapter Design

**Status:** Candidate v6 reached `V4_EXPERIMENTAL` after a successful
same-build natural LeetCode.cn observation on 2026-07-30. The current policy
supports both the first characterized legacy submit/check chain and the
observed GraphQL/result-distribution chain. Authenticated evidence caps this
adapter at experimental readiness; production certification remains absent.

## Characterized chain

The safe fixture
`tests/fixtures/leetcode/network/leetcode-characterization-2026-07-30.json`
contains 66 E1 lifecycle records and passes the strict transcript validator.
The first legacy submission chain was:

1. `POST /problems/add-two-numbers/submit/`
2. HTTP 200 for that request
3. `GET /submissions/detail/739040551/v2/check/`
4. HTTP 200 for the check request

The exact matcher treats only the final trailing slash as optional:
`/problems/<slug>/submit[/]` and
`/submissions/detail/<numeric-id>/(v2/)?check[/]`. Query material is ignored
and never retained. No other route segment is widened.

The stable submission ID is present in the safe check path. No response body,
request body, header, cookie, credential, account identifier, source code, or
full problem statement was read or retained.

The current UI chain observed in v6 is:

1. one recent trusted E0 from the exact visible LeetCode submit control;
2. completed HTTP 200 `POST /graphql/`;
3. completed HTTP 200
   `GET /submissions/api/runtime_distribution/<numeric-id>/` or the exact
   memory-distribution sibling.

GraphQL is treated only as an opaque network witness. Its request body is not
read, and GraphQL alone cannot create E2. The trusted E0 supplies the problem
slug and the exact result path supplies the numeric submission ID.

## Identity

- Host scope is explicit: `leetcode.cn` becomes `cn`; `leetcode.com` becomes
  `com`.
- E1 submit key: `leetcode/submit/<scope>/<problem-slug>`.
- E1 check key: `leetcode/check/<scope>/<numeric-submission-id>`.
- E2 external submission ID: `<scope>/<numeric-submission-id>`.
- E2 problem ID: `<problem-slug>` (plain slug required by the local capture
  API contract).
- The host scope prevents `.cn` and `.com` numeric ID collisions.

## E2 policy

An E2 may be created only when:

- the check lifecycle is `completed`, HTTP 200, GET, and XHR;
- exactly one completed HTTP 200 submit candidate exists;
- submit and check have the same host scope, tab, frame, and Chrome document;
- submit precedes check by no more than 5 seconds; and
- both normalized endpoint keys pass the closed grammar.

Zero candidates, failed requests, crossed host/document identity, and expired
windows produce no E2. Multiple candidates are ambiguous and fail closed.

For the current UI, E2 may instead be created only when exactly one recent
trusted same-document problem hint precedes a completed same-document GraphQL
POST and an exact completed result-distribution GET within 5 seconds. Opening
a historical result page has no such E0 and therefore cannot create E2.

### 2026-08-16 authorized D4 result-root amendment

The user-authorized D4 `ISOLATED` target contract supersedes the
GraphQL-required sentence above for P1 offline work. One trusted same-document ActionEpoch,
a zero/fresh pre-action result baseline, no competing action or submission,
and exactly one new completed result-distribution lifecycle with a stable
numeric ID may create E2 within five seconds. Exact REST submit and GraphQL
requests are optional corroboration; absence does not fail an otherwise exact
chain, while identity conflict or multiple eligible roots fail closed. This is
intervention-bounded evidence, not `DIRECT` click-to-request causality.
P1 now implements and proves this contract offline: the runtime rejects
baseline-ID replay, multiple ActionEpochs, multiple new IDs, crossed
corroboration, and unchanged historical surfaces while coalescing duplicate
callbacks for one stable ID. This does not promote LeetCode beyond
network-`experimental` or establish a live D4 PASS.

## E3 policy

A visible trusted LeetCode verdict candidate may create E3 only when:

- its sender URL is owned by the same LeetCode host scope and exact problem;
- the final verdict maps to the trusted taxonomy and is not `Other Failure`;
- durable storage contains exactly one unfinalized LeetCode confirmation for
  the same namespaced problem; and
- its external submission ID belongs to the same host scope.

Zero or multiple durable candidates, crossed host/problem identity, pending
text, and unknown failures produce no E3. A historical page cannot create E2.

## Privacy boundary

Retained fields are limited to method, normalized path-derived endpoint key,
HTTP status, request lifecycle, tab/frame/document IDs, request ID, stable
numeric submission ID, problem slug, and final verdict. Recursive forbidden-key
checks reject raw bodies, code, headers, credentials, account identifiers, and
full problem statements before evidence normalization.

## Endpoint-drift disposition

An owned HTTPS LeetCode XHR that completes on a submit/check/status-like path
but does not match the exact adapter grammar cannot enter Safe Evidence.
Instead, the background writes a control-plane record to
`session.leetcodeEndpointDiagnostics`, capped at 20 entries and deduplicated
by request ID. It retains only adapter version, reason, `.cn`/`.com` scope,
method, pathname, HTTP status, request/tab/frame/document identity, and
observation time. Query, fragment, body, headers, cookies, credentials, code,
and DOM are absent. This closes the former silent fallback where generic
`submit` / `status` E1 records concealed matcher drift.

## Idempotency and chronology

- Repeated runtime/memory result requests for the same problem/submission keep
  the first durable `confirmedAt`; they do not move E2 after an already
  observed E3.
- The same submission ID with another problem is `identity_conflict` and fails
  closed.
- An unexpired finalization tombstone prevents a repeated result request from
  recreating a confirmed submission even after the finalized durable record
  has been removed.

## Known limits

- The evidence tier is `authenticated-characterization`; it can support only
  `experimental` readiness.
- The observed chain is LeetCode.cn. LeetCode.com uses the same closed path
  grammar but still needs its own real observation before any `.com` claim.
- Same-build v6 bundle, ACK, SQLite projection, and duplicate suppression pass
  for LeetCode.cn submission `cn/739108591`.
- v1-v5 remain diagnostic evidence for endpoint overfitting, GraphQL protocol
  drift, scoped problem-slug rejection, and replay/chronology defects.
- LeetCode.com still lacks its own real observation.
- Authenticated characterization cannot support `V4_PRODUCTION`.
