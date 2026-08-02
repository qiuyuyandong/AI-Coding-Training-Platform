# V4 LeetCode Network Capture Migration

**Status:** `V4_EXPERIMENTAL` terminal result on the uncommitted
`feature/v1-followup` working tree. On 2026-07-30 candidate v6 captured the
user's fresh LeetCode.cn submission `cn/739108591` from the same production
build, finalized it once, delivered one four-event bundle to the paired local
API, and projected one SQLite training attempt with the matching `Wrong
Answer` verdict. The observation is authenticated and therefore cannot support
`V4_PRODUCTION`. Candidate diagnostics v1-v5 remain retained as root-cause and
regression evidence.

**Parent plan:**
[V4 network-confirmed capture master](./2026-07-24-v4-network-confirmed-capture-refactor-master.md)
[Phase C-D platform migration](./2026-07-24-v4-network-confirmed-capture-refactor-phase-c-d-platform-migration-replacement-rc.md)

## Characterization

- Date and source: 2026-07-30 user-authorized capture at
  `tests/fixtures/leetcode/network/leetcode-characterization-2026-07-30.json`;
  report at
  `work/reports/v4-leetcode-c1-characterization-2026-07-30.md`.
- Evidence tier: target `public-content-accessible` once a public
  submission is observed end-to-end without relying on a logged-in
  session; otherwise the wave is `authenticated-characterization` and
  can at most reach `experimental` V4 readiness per
  `tests/helpers/v4NetworkTranscriptContract.ts`.
- Safe fixture paths: existing
  `tests/fixtures/leetcode/submission-726110110-ac.html` +
  `.meta.json`; the new path/status-only characterization export will live as
  `tests/fixtures/leetcode/network/leetcode-characterization-<date>.json`.
  It is a strict `NetworkTranscriptDocument`, not a page-DOM HTML fixture.
- First characterized legacy matcher:
  `POST /problems/<slug>/submit[/]` followed by
  `GET /submissions/detail/<numeric-id>/(v2/)?check[/]`; the bracketed
  trailing slash is optional, while host, method, slug, numeric ID, and route
  segments remain closed. The first characterized slash-bearing pair was HTTP
  200. The
  pre-V4 click path wrote a pending intent on the exact
  `button[data-e2e-locator="console-submit-button"]` label `提交`, but
  V4 forbids click-only waiting.
- Legacy E2 server-confirmation policy: one completed HTTP 200 submit and one
  completed HTTP 200 check must share host scope, tab, frame, and document,
  and occur within 5 seconds. The check path supplies the stable ID. The
  existing diagnostic
  deliberately cannot read response bodies. It can establish E2 directly only
  when the stable ID is present in a safe redirect/navigation path. If the ID
  exists only in a response scalar, C1 must stop `V4_BLOCKED` pending a
  separately reviewed, closed-field scalar bridge; the transcript must not be
  widened to retain a raw body.
- Current GraphQL UI matcher and E2 policy: one recent trusted E0 from the
  exact visible LeetCode submit control, then one completed HTTP 200
  `POST /graphql/`, then one completed HTTP 200 exact
  `GET /submissions/api/{runtime|memory}_distribution/<numeric-id>[/]`.
  All three witnesses must share tab, frame, and Chrome document and fit the
  five-second window. The E0 supplies the plain problem slug, the exact result
  path supplies the namespaced stable submission ID, and GraphQL supplies only
  a network witness: its request body is never inspected. A historical result
  page has no recent E0 and fails closed.
- E3 final-verdict identity policy: existing first-party locators
  `[data-e2e-locator="submission-result"]` and
  `[data-e2e-locator="console-result"]` may be reused for the page-DOM
  verdict, but V4 E3 still requires an E1/E2 link to a stable
  submission identity. The duplicate-pane collapse and the detail-tab
  fallback in `extension/src/adapters/leetcode/verdict.ts` are DOM
  evidence only; they cannot satisfy V4 readiness on their own.
- Retained allowlisted fields: method, normalized path-derived endpoint key, stable
  submission ID scalar, problem slug, final verdict token, tab/frame/
  document identity, request lifecycle phase.
- Forbidden data confirmation: source code, cookies, authorization
  headers, CSRF tokens, full response bodies, code editor buffers,
  language, memory, time, usernames, timestamps. The existing 2026-07-20
  fixture already satisfies this discipline; new fixtures must too.

## Scope

- Objective: capture one fresh user-authorized LeetCode (`.cn` or `.com`)
  submission and use that evidence to author and verify the safe V4 network
  policy. The `.cn` same-build observation passed, so the registry is
  `experimental`; `production` remains out of scope and requires the
  independent public-DOM certification contract.
- Files to be created once capture is authorized:
  - `tests/fixtures/leetcode/network/leetcode-characterization-<date>.json`
    (path/status-only export sanitized per the B1 transcript contract)
  - `docs/superpowers/specs/2026-07-30-v4-leetcode-network-adapter-design.md`
    (request matcher, E2 predicate, E3 identity rule, retained fields,
    fail-closed cases, known unknowns)
  - `extension/src/adapters/leetcode/network.ts` (implementing the same
    `V4NetworkAdapterPolicyCandidate` contract shape as all V4 adapters;
    no protocol reuse from another OJ)
  - `tests/unit/extensionLeetCodeNetworkAdapter.test.ts`
  - focused production-dist cases in
    `tests/extension-e2e/capture-v4-network.spec.ts`
- Files that may be modified:
  - `extension/src/adapters/registry.ts` (status entry + hostOwnership)
    only after the safe fixtures and tests pass.
- Dependencies and authorization: satisfied for LeetCode.cn by the user's v6
  fresh natural submission in the already-open Qiu yu Chrome profile. The
  agent recorded only sanitized evidence; raw bodies, code, credentials, and
  full headers remain forbidden.
- Characterization capability boundary: request methods, exact HTTPS paths,
  status codes, redirect paths, tab/frame/document identity, and relative
  lifecycle order only. The absence of a stable ID in those fields is a
  truthful blocker, not permission to inspect raw responses.
- Explicit non-goals: no production promotion; no AtCoder, Codeforces,
  Luogu, or NowCoder protocol changes; no click-only reintroduction;
  no UI labels reused as V4 evidence.

## Tests First

- Failing unit cases:
  - LeetCode policy accepts only the characterized request matcher.
  - The current GraphQL/result-distribution chain requires a recent exact E0
    and same-document completed HTTP 200 witnesses.
  - A historical result page without that E0 cannot create E2.
  - The same route family accepts both trailing-slash forms and ignores query
    material without retaining it.
  - An owned submit/status-like route outside the exact matcher creates only a
    bounded path-only session diagnostic; it cannot create E1/E2.
  - Stable submission ID is rejected when missing, non-string, or empty.
  - Final verdict requires a recognized token in the 12-value
    taxonomy; `Other Failure` is not a final verdict.
  - Same problem slug + submission ID on `.cn` and `.com` produces
    distinct capture identities.
  - A forged bridge summary is rejected by the relay.
- Fake OJ cases:
  - LeetCode success JSON with stable submission ID.
  - LeetCode 302 redirect to exact result URL.
  - SPA result URL restored with selected submission-detail tab.
  - HTTP 200 business failure.
  - HTTP 4xx.
  - Cancellation/network error.
  - Judging then final.
  - Immediate final.
  - Duplicate submission ID (idempotent E2).
  - Repeated E2 preserves the first confirmation timestamp and rejects crossed
    problem identity.
  - A finalized tombstone suppresses post-final result-distribution replay even
    after the durable confirmed record is removed.
  - Identity mismatch between E1 and E3.
  - Forged MAIN bridge summary.
- Real extension E2E cases:
  - Production extension + Fake OJ GraphQL/result-distribution route produces
    one durable confirmation only after a trusted click.
  - Duplicate runtime/memory result requests do not rewrite confirmation time.
  - Final verdict produces one tombstone; post-final result requests cannot
    resurrect the confirmed record.
- Real observation cases (gated on user authorization):
  - PASS on candidate v6: user performed natural LeetCode.cn submission
    `cn/739108591`; bundle, ACK, SQLite projection, and `Wrong Answer` verdict
    match the observed page.

## Implementation Boundary

- Shared modules modified only for defects proven by real observation:
  `background.ts` integrates the LeetCode-specific E0/GraphQL/result
  coordinator; `confirmedSubmissionStorage.ts` and
  `backgroundOrchestrator.ts` preserve first-confirmation chronology, reject
  identity conflicts, and honor tombstone-only finalization. These are generic
  idempotency corrections covered by focused regression tests; no other
  platform protocol was changed.
- Adapters and protocol-specific files that must not be touched:
  - `extension/src/adapters/nowcoder/**` (independent protocol).
  - `extension/src/adapters/atcoder/**` and any AtCoder adapter
    additions; the Phase 0 production-DOM certification must not be
    invalidated by V4.
  - `extension/src/adapters/codeforces/**`, `luogu/**`.
- Forbidden inferences: no click-only waiting; no nearest-row guessing
  on status tables; no account identity correlation; no protocol reuse
  from NowCoder's design or the AtCoder/B3 fixtures; no logging of raw
  bodies, headers, code, or credentials.

## Failure Disposition

- Missing or ambiguous E1/E2/E3 fails closed. The successful same-build v6
  observation closes the `.cn` wave as `V4_EXPERIMENTAL`; a future protocol
  regression does not silently downgrade this evidence and must open a new
  reviewed repair wave.
- Endpoint drift: an exact-host XHR completed request whose path is
  submit/check/status-like but misses the adapter grammar is written only to
  bounded `session.leetcodeEndpointDiagnostics` (maximum 20). The record
  contains method, pathname, status, request/tab/frame/document identity, and
  observation time; query, fragment, bodies, headers, cookies, credentials,
  code, and problem statements are never retained. This diagnostic is not
  capture state and cannot satisfy E1/E2/E3.
- Terminal readiness result: `experimental`. `blocked` would have applied if
  characterization could not produce a stable submission ID; `disabled`
  remains available only through a separate product decision.

## Verification

```powershell
npm run extension:check
npm run extension:e2e
npm run quality:gate
node scripts/validate-v4-adapter-readiness.mjs --all
node --import tsx scripts/validate-v4-network-transcript.mjs \
  tests/fixtures/leetcode/network/<fixture>.meta.json
```

## Completion

- Actual terminal readiness result: `V4_EXPERIMENTAL` on the uncommitted
  production build with adapter `v4-leetcode-network-6`.
- Evidence reports:
  - `work/reports/v4-leetcode-c1-characterization-2026-07-30.md`
  - `work/reports/v4-leetcode-c1-candidate-observation-diagnostics-2026-07-30.md`
  - `work/reports/v4-leetcode-c1-closeout-2026-07-30.md`
- Real evidence: submission `cn/739108591`, one final tombstone, zero
  quarantine/unmatched/ambiguity records, one acknowledged delivery, four
  SQLite capture events, one session, and one non-voided training attempt.
- Final engineering gates: readiness CLI PASS; 20/20 readiness tests;
  2009/2009 runnable unit tests plus one host-capability skip; 25/25
  application E2E; 1261/1261 extension unit tests; 48/48 runnable extension
  E2E plus one known harness skip; production build PASS.
- Review boundary: C1 is not production certification, an immutable
  implementation commit, RC, user acceptance, release, or authorization to
  skip C2's independent characterization.
