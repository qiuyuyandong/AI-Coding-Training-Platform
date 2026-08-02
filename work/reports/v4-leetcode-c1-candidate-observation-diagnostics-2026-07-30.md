# V4 LeetCode C1 Candidate Observation Diagnostics — 2026-07-30

## Scope and authorization

The user performed two natural LeetCode.cn submissions in the visible
candidate-build browser profile. The extension retained no source code,
request/response body, headers, cookies, credentials, account identifiers, or
full problem statement. This report records only safe request classifications,
Chrome context identity, HTTP status, extension state, and disposable SQLite
counts.

## What was ruled out

The candidate observation harness established all of the following before
displaying `READY=1`:

- `http://localhost:3000/` responded successfully;
- the first pairing-code request and pairing exchange returned HTTP 200;
- the extension stored a pairing credential and reported capture enabled;
- the official `CHARACTERIZATION_STOP` runtime message was acknowledged;
- the production `webRequest` observer recorded a completed HTTP 200 passive
  LeetCode request;
- the disposable SQLite database existed and was readable.

Later HTTP 409 pairing responses came only from attempting to pair an already
paired installation. They were not localhost failures and did not explain the
missing capture.

## Candidate v1 observation

- The visible submission succeeded and navigated to LeetCode submission
  `739065807`.
- The production observer recorded the relevant POST only as generic
  endpoint key `problems`/`submit` and the subsequent GETs only as generic
  `status`.
- No exact `leetcode/submit/...` or `leetcode/check/...` E1 was retained.
- No E2, confirmed submission, outbox item, tombstone, quarantine item, or
  unmatched E3 was created.
- Disposable database deltas were zero:
  `capture_events=0`, `training_sessions=0`, `training_attempts=0`.

Candidate v2 removed query-string rejection while keeping exact pathname
matching.

## Candidate v2 observation

- Production build digest:
  `e003d986da4a9a437d7a5db27dce28a6c810938696c85bc99f3e9a02a6203e76`.
- Chrome document:
  `12A53B863C284FAE236355F9FCC42CEF`.
- Request `516`: POST, generic endpoint key `submit`, observed at
  `2026-07-30T10:28:07.381Z`.
- Request `526`: GET, generic endpoint key `status`, completed HTTP 200 at
  `2026-07-30T10:28:08.174Z`.
- Request `536`: GET, generic endpoint key `status`, completed HTTP 200 at
  `2026-07-30T10:28:09.112Z`.
- No exact adapter E1, E2, confirmed submission, outbox item, tombstone,
  quarantine item, or unmatched E3 was created.
- Disposable database remained:
  `capture_events=0`, `training_sessions=0`, `training_attempts=0`.

## Root cause

The original C1 adapter was derived from one successful characterization:
slash-bearing
`/problems/<slug>/submit/` and
`/submissions/detail/<id>/v2/check/`.
It encoded that sample as a stricter contract than the stable identity
requirements justified. Query removal in v2 did not solve the failure because
the real pathname itself still missed the slash-bearing exact regular
expression.

The shared coarse normalizer then classified the requests as generic
`submit` / `status` E1 records. Those records correctly could not satisfy the
LeetCode E2 policy, but there was no closed endpoint-drift diagnostic. The
result was a silent pre-E2 failure that Fake OJ could not reveal because Fake
OJ reused the single characterized pathname form.

The systemic defect is therefore not localhost availability. It is
single-sample path overfitting plus a missing disposition for owned
submit/status-like paths that fail an experimental adapter's exact matcher.

## Candidate v3 observation

- Production build digest:
  `dcbe000f8c710e6f68b4e4377347319bc88e7e9b83e9dbd096540105c1cac7cd`.
- The user intentionally performed two natural submissions: one incorrect
  verdict and one correct verdict.
- Both submission windows produced completed HTTP 200 GraphQL POST requests
  followed by generic `status` GET requests.
- No exact `leetcode/submit/...` or `leetcode/check/...` E1, E2, confirmed
  submission, outbox item, tombstone, quarantine item, or unmatched E3 was
  created.
- Disposable database remained:
  `capture_events=0`, `training_sessions=0`, `training_attempts=0`.
- The new endpoint diagnostic also remained empty. Its first implementation
  constrained pathname characters more narrowly than the existing safe
  characterization boundary, so it could still discard an owned path before
  recording it.

This observation disproves trailing-slash variance as the complete root cause.
It also shows that the current LeetCode page may submit through GraphQL while
using a separate status route. Because request bodies are forbidden, a GraphQL
operation name cannot be used as submission evidence. The safe path forward is
to characterize the status pathname and correlate it with the existing trusted
E0 click hint, not to inspect a GraphQL body.

## Corrective design

Candidate v4:

1. accepts the same closed submit/check route grammar with or without the
   final trailing slash;
2. aligns the diagnostic pathname sanitizer with the already reviewed
   characterization boundary, including bounded punctuation and
   percent-encoding while still excluding query, fragment, controls, doubled
   slash, and parent traversal;
3. keeps HTTPS exact-host ownership, POST/GET method, XHR resource type,
   problem-slug grammar, numeric submission-ID grammar, and context/time
   correlation unchanged;
4. writes unmatched owned submit/check/status-like completed requests only to
   bounded `session.leetcodeEndpointDiagnostics` (maximum 20);
5. retains only safe pathname and lifecycle metadata, never query or raw
   request material;
6. keeps diagnostics outside capture state, so they cannot produce E1, E2,
   E3, a bundle, or a readiness promotion;
7. requires every Phase C readiness record and delta-plan template to declare
   an endpoint-drift disposition.

## Candidate v4-v5 observations

- v4's bounded diagnostic exposed the exact current result-distribution route
  family and confirmed that a historical result page must remain insufficient
  without a recent trusted E0.
- v5 implemented the closed E0 + GraphQL + result-distribution chain.
  Submission `cn/739104265` reached E2/E3 and quarantine, proving localhost,
  permissions, pairing, the observer, and the content runtime were all
  healthy. Delivery was rejected because v5 emitted scoped
  `problemExternalId=cn/roman-to-integer`; the local LeetCode contract
  correctly requires the plain slug. Repeated result requests also exposed
  tombstone-only replay and confirmation-timestamp rewrite defects.

## Candidate v6 terminal observation

- Production build digest:
  `8e0df3af3be1a60da88e6362cadbe2f6883a9ecec6f0063c522ff85a3e8521bb`.
- Fresh natural submission: `cn/739108591`.
- Final verdict: `Wrong Answer`.
- One tombstone, zero confirmed records after finalization, zero outbox,
  quarantine, unmatched E3, ambiguity, endpoint diagnostic, or capture error.
- Successful delivery was recorded at `2026-07-30T14:04:21.608Z`.
- Disposable SQLite: 4 capture events, 1 session, 1 non-voided capture attempt
  for plain problem slug `roman-to-integer`.

## Current verdict

C1 is terminally `V4_EXPERIMENTAL`. The authenticated same-build v6 chain
passed; v1-v5 remain failed diagnostic candidates and regression evidence.
This is not production certification, an immutable candidate commit, RC,
acceptance, or release.
