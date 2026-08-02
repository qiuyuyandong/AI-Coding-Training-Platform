# V4 LeetCode C1 Characterization — 2026-07-30

## Authorization and operator boundary

The user authorized extension V4 Phase C and performed the natural LeetCode.cn
submission in the visible isolated browser profile. The agent did not enter or
read credentials, source code, cookies, tokens, headers, request/response
bodies, or full problem text.

## Evidence

- Export:
  `tests/fixtures/leetcode/network/leetcode-characterization-2026-07-30.json`
- Metadata: authenticated, sanitized, non-production-eligible.
- Strict validator: `V4 network transcript fixture PASS`.
- Evidence count: 66 E1 lifecycle records.
- Recursive forbidden-field scan: zero findings.
- Exact chain:
  - submit request ID `840`, POST
    `/problems/add-two-numbers/submit/`, HTTP 200;
  - check request IDs `841` and `851`, GET
    `/submissions/detail/739040551/v2/check/`, HTTP 200.
- The same sanitized export also contains completed `POST /graphql/` witnesses
  plus exact
  `/submissions/api/{runtime|memory}_distribution/739040551/` paths. Those
  observations became relevant only after v3 proved the current UI no longer
  reliably emits the legacy submit/check pair. GraphQL bodies were never read.
- Submit and first check share tab `1352841282`, frame `0`, and document
  `8C588C1A68D0E6D2F798877E4292FB05`.

The export does not contain the final verdict, so this report does not claim a
specific verdict. The stable submission ID `739040551` is evidenced by the
allowlisted check path without response-body inspection.

## Result

Characterization was sufficient to implement both closed LeetCode E1/E2 route
families. The later v6 same-build delivery observation is recorded separately
in `work/reports/v4-leetcode-c1-closeout-2026-07-30.md`; this fixture remains
authenticated, non-production-eligible characterization rather than
production certification, user acceptance, RC, or release.
