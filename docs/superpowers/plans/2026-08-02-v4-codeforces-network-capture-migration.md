# V4 Codeforces Network Capture Migration

**Status:** Terminal `V4_BLOCKED` on 2026-08-02. Revision 2 was independently
`APPROVED`; the privacy prerequisite and exact-build preflight passed. During
a ready-gated natural submission the browser moved from
`/problemset/submit/` to `/problemset/status`, while the extension retained
zero records and zero navigation witnesses. Chrome omits `documentId` for
frame navigation, and the landing path supplies neither stable numeric
submission identity nor exact contest/problem identity. No Codeforces network
adapter was implemented.

**Parent plans:**

- [V4 network-confirmed capture master](./2026-07-24-v4-network-confirmed-capture-refactor-master.md)
- [Phase C-D platform migration](./2026-07-24-v4-network-confirmed-capture-refactor-phase-c-d-platform-migration-replacement-rc.md)
- [Phase C characterization control-plane generalization](./2026-07-30-v4-phase-c-characterization-control-plane-generalization.md)

## Review Preparation History

- 2026-08-02 revision 1 authored from the C3 template, parent-plan boundary,
  current C0-C2 implementation, and public Codeforces route/API evidence.
- 2026-08-02 author-side audit found and corrected five review-readiness
  defects in revision 2:
  - replaced broad route-family prose with an exact bounded pre-storage
    pathname grammar;
  - declared the actual absolute `receivedAt` and numeric `apiTimeStamp`
    fields rather than incorrectly describing relative timestamps;
  - replaced prematurely fixed characterization dates with `<capture-date>`;
  - added a fixed preflight-receipt contract and invalidation conditions;
  - added the explicit independent-review decision checklist below.
- 2026-08-02 independent review: user verdict `APPROVE`; no HIGH, MEDIUM, or
  LOW findings were supplied. The privacy prerequisite may begin. Browser
  characterization and the user-owned natural submission remain gated by the
  exact-build preflight receipt.
- 2026-08-02 privacy prerequisite and preflight: PASS. RED produced 24 expected
  Codeforces privacy failures; GREEN passed 9 focused files / 432 tests,
  historical AtCoder certification 171/171, `extension:check` 39 files /
  1,325 tests, readiness validation, dist parity, and frozen fixture hashes
  9/9. Receipt:
  `work/reports/v4-codeforces-c3-preflight-2026-08-02.md`.
- 2026-08-02 bounded real observation: the user prepared and submitted their
  own Codeforces entry during an active zero-record window. The browser moved
  from `/problemset/submit/` to `/problemset/status`; the extension retained
  zero records and zero navigation witnesses before explicit stop. The user
  confirmed the successful transition. No transcript fixture was fabricated.
  Terminal evidence:
  `work/reports/v4-codeforces-c3-blocker-2026-08-02.md`.

An independent reviewer must issue one verdict against revision 2:

- `APPROVE`: no remaining HIGH, MEDIUM, or LOW findings, and the approved
  sequence is privacy prerequisite -> focused gates/receipt -> bounded
  characterization.
- `REJECT`: list every finding with severity, evidence, affected section, and
  required correction. No implementation or browsing may begin.

The review must explicitly decide whether:

1. the closed pathname grammar rejects every account-bearing or unreviewed
   route before storage;
2. the allowed absolute timestamps and document/request fields are sufficient
   and no hidden account correlator is introduced;
3. trusted E0 can supply problem identity only with exact reviewed document
   continuity and the fixed 30-second TTL;
4. missing stable submission ID, problem identity, or `documentId` remains a
   terminal blocker rather than permission for row/time/account inference;
5. the preflight, invalidation, five-platform regressions, real observation,
   and terminal-report requirements are reproducible.

## C3 Entry Gate

- C0 is an engineering PASS for the platform-delta template and readiness
  validator.
- C1 is terminal `V4_EXPERIMENTAL` for the authenticated LeetCode.cn wave.
- C2 is terminal `V4_BLOCKED`. The reviewed AtCoder observer failed closed
  because the main-frame submission did not expose `documentId`, the landing
  path did not expose a stable submission ID, and no legal replacement signal
  existed. The historical AtCoder DOM certification remains unchanged.
- The canonical C2 evidence is
  `work/reports/v4-atcoder-c2-blocker-2026-08-02.md`; the registry, readiness
  manifest, parent plans, and current handoff all name C3 Codeforces as the
  next wave.
- The current working tree is intentionally uncommitted and includes the
  authorized C0-C2 changes. This plan does not authorize a commit, push, PR,
  RC freeze, or unrelated cleanup.

The entry gate must be revalidated immediately before characterization:

```powershell
node scripts/validate-v4-adapter-readiness.mjs --all
npx vitest run --no-file-parallelism `
  tests/unit/v4AdapterReadinessValidator.test.ts `
  tests/unit/extensionAdapterContract.test.ts `
  tests/unit/extensionNetworkObserver.test.ts
$env:GIT_MASTER='1'; git diff --check
```

## Characterization

- Date and source: the actual capture date must be recorded when a user-owned
  natural Codeforces submission is performed on an exact production
  `extension/dist` build. Public, read-only reconnaissance on 2026-08-02
  established only route families and public object semantics; it did not
  establish the submit/confirmation protocol.
- Public evidence:
  - `https://codeforces.com/problemset/problem/4/A` exposes a Submit link to
    `/problemset/submit`; when unauthenticated, that route redirects to `/`.
  - Contest pages expose `/contest/<contest>/submit`,
    `/contest/<contest>/my`, and `/contest/<contest>/status`.
  - Public status rows use stable numeric submission links in both
    `/contest/<contest>/submission/<submission>` and
    `/problemset/submission/<contest>/<submission>` forms.
  - The official API documents `Submission.id`, `contestId`, `problem`, and
    `verdict`, including non-final `TESTING` and `SUBMITTED` values. Public API
    availability does not make account-handle correlation legal for this
    extension.
- Evidence tier: expected `authenticated-characterization`; this wave can
  therefore reach at most `V4_EXPERIMENTAL` unless a separate public
  production-certification contract is created and satisfied.
- Pre-storage pathname grammar: before any Codeforces page is opened with an
  active characterization session, `normalizeCharacterizationEndpointPath`
  must accept only exact HTTPS `codeforces.com`, no credentials, default port,
  no percent-encoding, no doubled slash, and one of these path forms with an
  optional single trailing slash:
  - `/problemset/problem/<contest>/<index>`;
  - `/contest/<contest>/problem/<index>`;
  - `/problemset/submit`;
  - `/contest/<contest>/submit`;
  - `/problemset/status`;
  - `/contest/<contest>/status`;
  - `/contest/<contest>/my`;
  - `/contest/<contest>/submission/<submission>`;
  - `/problemset/submission/<contest>/<submission>`.

  `<contest>` is `[1-9][0-9]{0,8}`, `<index>` is
  `[A-Za-z][A-Za-z0-9]{0,15}`, and `<submission>` is
  `[1-9][0-9]{0,18}`. Every other pathname, including `/submissions/<handle>`,
  `/profile/*`, `/settings/*`, `/enter*`, `/register*`, `/api/*`, `/blog/*`,
  `/group/*`, `/gym/*`, `/mashup/*`, `/data/*`, and any future route, is
  rejected before session storage. Query values and fragments are never
  retained. A new path requires plan re-review before collection.
- Safe fixture paths, to be created only from a validated export:
  - `tests/fixtures/codeforces/network/codeforces-characterization-<capture-date>.json`
  - `tests/fixtures/codeforces/network/codeforces-characterization-<capture-date>.meta.json`
  - `work/reports/v4-codeforces-c3-characterization-<capture-date>.md`
- Exact request matcher: unknown before the live transcript. Candidate route
  families listed above are allowlist inputs for privacy testing, not E1/E2
  claims. No matcher may be copied from LeetCode, NowCoder, or AtCoder.
- E2 server-confirmation policy: unknown before characterization. E2 requires
  one stable numeric submission ID and exact contest/problem identity sourced
  from an approved path, redirect, or separately reviewed closed scalar. HTTP
  success, navigation to a list, a new first row, or a nearby timestamp is
  insufficient.
- E3 final-verdict identity policy: an exact Codeforces submission result
  surface may supply a final verdict only after its numeric submission ID and
  contest/problem identity match one durable E2 confirmation. A status table
  row, global status poll, or another user's submission must never satisfy E3.
- Retained allowlisted fields: HTTP method; approved normalized pathname;
  resource type; lifecycle; HTTP status; approved normalized redirect
  pathname; stable numeric submission ID when present in an approved path or
  reviewed scalar; contest ID; problem index; final verdict token; request ID;
  tab/frame/document identity; canonical UTC `receivedAt`; and numeric Chrome
  `apiTimeStamp`. These are absolute timestamp fields already present in the
  shared control plane; this plan does not claim a relative-time transform.
- Forbidden data confirmation: source code; request/response bodies; form
  fields; file contents; language; headers; cookies; CSRF/ftaa/bfaa values;
  credentials; account handle or profile identity; query values; fragments;
  full problem statements; execution time; memory; test number; row position;
  and unrelated status-table contents.

## Scope

- Objective: characterize the current Codeforces submit-to-result protocol,
  implement the smallest Codeforces-only V4 network policy that can prove a
  stable submission identity without account or nearest-row inference, and
  finish C3 in exactly one terminal state: `V4_EXPERIMENTAL`, `V4_BLOCKED`,
  `V4_DISABLED`, or `V4_PRODUCTION` only under a separate certification gate.
- Files to create after the corresponding evidence exists:
  - the safe fixture and metadata files listed above;
  - `docs/superpowers/specs/2026-08-02-v4-codeforces-network-adapter-design.md`;
  - `extension/src/adapters/codeforces/network.ts`;
  - `extension/src/adapters/codeforces/verdict.ts` only if the observed result
    DOM proves the existing generic selectors unsafe or insufficient;
  - `tests/unit/extensionCodeforcesNetworkAdapter.test.ts`;
  - focused Codeforces production-dist cases in
    `tests/extension-e2e/capture-v4-network.spec.ts`;
  - dated preflight, observation, blocker/closeout reports under
    `work/reports/`.
- File created after plan approval and before the real characterization
  window: `work/reports/v4-codeforces-c3-preflight-<preflight-date>.md`. The
  receipt records the approved plan revision, focused privacy commands and
  counts, frozen AtCoder regression/hash result, `extension:check` and dist
  parity, manifest version, and SHA-256 values for
  `extension/dist/{manifest.json,background.js,content.js}`. A rebuild, source
  change affecting dist, hash mismatch, or newly allowlisted pathname
  invalidates the receipt and requires a new preflight.
- Files that may be modified only for evidence-backed behavior:
  - `extension/src/networkObserver.ts` for the pre-storage Codeforces pathname
    privacy gate before characterization;
  - `extension/src/background.ts` and pure orchestration/storage modules only
    after the transcript proves an otherwise-unsatisfied generic seam;
  - `extension/src/adapters/registry.ts` and
    `docs/superpowers/specs/v4-adapter-readiness.json` only when the terminal
    C3 result is evidenced;
  - parent plans, architecture, runbook, README, and current handoff only at
    the matching execution seam.
- Dependencies and authorization:
  - this plan must be independently reviewed first;
  - the user has authorized pursuing C3 and the C-series goal, but the user
    must personally perform any natural Codeforces submission;
  - the exact production build must be frozen before the live window;
  - no implementation beyond the privacy gate begins until a sanitized
    transcript proves the required signal.
- Explicit non-goals: no Luogu C4 implementation; no C5 cleanup; no API key;
  no account-handle discovery or retention; no public-status scraping; no
  source upload by the agent; no Codeforces Gym or private-group support unless
  separately characterized and reviewed; no DOM-production promotion; no
  commit, push, PR, replacement RC, V0 observation, or V0.5 work.

## Tests First

- Pre-storage privacy cases:
  - accept only exact HTTPS `codeforces.com`, with no credentials or port;
  - accept exactly the nine reviewed pathname forms and scalar bounds declared
    in Characterization;
  - reject percent-encoded ambiguity, doubled slashes, dot segments, unknown
    account-bearing routes, `/submissions/<handle>`, API paths, blogs, groups,
    gyms, mashups, and private-contest paths before retaining a pathname;
  - reject query values and fragments; a rejected path retains only a closed
    reason and never the original pathname;
  - prove the generalized LeetCode, NowCoder, AtCoder, and Luogu
    characterization behavior is unchanged.
- Failing adapter unit cases after characterization:
  - exact observed request/confirmation sequence;
  - stable numeric submission ID plus normalized contest/problem identity;
  - `problemset` and `contest` route equivalence only when the transcript
    proves both belong to the same submission;
  - cross-contest, cross-problem, cross-document, stale, duplicate, canceled,
    redirected-login, CSRF rejection, HTTP error, and rate-limit flows;
  - public status/result navigation without E1 never creates E2;
  - another user's row, latest row, nearest timestamp, or highest ID cannot be
    selected;
  - polling remains optional phase evidence and cannot change identity;
  - Codeforces final tokens map through the trusted taxonomy while queue,
    testing, running, pending judgement, and absent verdict remain non-final;
  - duplicate E2 preserves first confirmation chronology and tombstoned replay
    cannot recreate a confirmation.
- Fake OJ cases:
  - exact successful characterized chain;
  - direct stable-ID redirect if observed;
  - queue/testing to final and direct-final after E2;
  - repeated polling/list refresh;
  - two concurrent same-problem submissions with distinct IDs;
  - another-user and another-problem rows;
  - identity mismatch, duplicate E3, post-final replay, HTTP/business failure,
    cancellation, network error, and worker restart after E1/E2.
- Real extension E2E cases:
  - a trusted submit control produces E0 only and leaves waiting at zero;
  - the characterized production-dist network chain creates one durable
    confirmation with the exact numeric ID;
  - the matching result surface finalizes once into one four-event bundle;
  - replay and unrelated status rows create no second bundle;
  - other platform adapters retain their exact behavior and storage.
- Real observation cases:
  - one user-owned natural submission on the same production build;
  - visible Codeforces submission ID/problem/verdict agree with terminal
    extension state;
  - paired local API and disposable SQLite receive exactly one attempt;
  - outbox, quarantine, unmatched E3, ambiguity, diagnostics, and tombstones
    reconcile exactly as the terminal report states.

## Implementation Boundary

- The pre-characterization shared change is limited to a Codeforces-specific
  pathname grammar in `normalizeCharacterizationEndpointPath`, with focused
  privacy and five-platform isolation tests. It cannot create E1/E2/E3.
- After characterization, shared modules may change only when the report names
  the exact generic defect and tests prove the repair is platform-neutral.
- Codeforces protocol logic belongs under
  `extension/src/adapters/codeforces/**`; do not encode it as a permissive
  fallback in the shared observer.
- Do not modify `extension/src/adapters/leetcode/**`,
  `extension/src/adapters/nowcoder/**`, `extension/src/adapters/atcoder/**`, or
  `extension/src/adapters/luogu/**`.
- Preserve the frozen AtCoder certification corpus and C2 blocker, LeetCode C1
  terminal evidence, and NowCoder Phase B/B8 evidence.
- Every shared change requires five-platform host-ownership, isolation, and
  fail-closed regressions for LeetCode, NowCoder, AtCoder, Codeforces, and
  Luogu, plus the frozen AtCoder DOM certification suites and all nine fixture
  hashes.
- The official Codeforces API is reference evidence only in this wave. Calling
  `user.status` or `contest.status` with a handle would make account identity a
  correlator; that is forbidden. Polling a global status table and choosing a
  new/highest/nearest row is also forbidden.
- Do not read request bodies, response bodies, source files, form fields,
  headers, cookies, credentials, CSRF tokens, `ftaa`, `bfaa`, account labels,
  or hidden profile data. Do not add `webRequestBlocking`, `debugger`,
  `<all_urls>`, broad host permissions, remote code, analytics, or cloud sync.
- Clicks remain E0 only. Waiting begins only from a validated durable E2.

## Failure Disposition

- Missing or ambiguous E1/E2/E3: fail closed; create no durable confirmation,
  bundle, outbox item, or local API request.
- Missing stable numeric submission ID in an approved path/redirect: terminal
  `V4_BLOCKED` unless a separate reviewed scalar bridge is proposed. This plan
  does not authorize body parsing or row inference.
- Missing safely sourced contest/problem identity: terminal `V4_BLOCKED`.
  Trusted E0 may supply identity only when the reviewed protocol proves
  document continuity and a bounded correlation window.
- Missing `documentId`: fail closed. Any exception for a frame-navigation flow
  requires a separate design review; AtCoder's C2 failure must not be weakened
  indirectly through Codeforces work.
- Login redirect, CSRF rejection, anti-bot challenge, HTTP 4xx/5xx, rate limit,
  or business failure remains non-confirmed and cannot consume E0/E1.
- Endpoint drift: an exact-host request outside the approved pathname grammar
  retains only a closed `normalize_endpoint_failed`-style reason. Inside the
  approved grammar, at most 20 session-only diagnostics may retain method,
  approved pathname, status/lifecycle, request/document identity, and the
  declared absolute timestamp fields. Diagnostics cannot enter capture state.
  A new path requires plan review before storage; it is not dynamically
  allowlisted.
- Terminal status:
  - `V4_EXPERIMENTAL` only after same-build real extension and disposable
    SQLite observation succeeds;
  - `V4_BLOCKED` when the legal signal is absent or contradictory;
  - `V4_DISABLED` only by an explicit product decision;
  - `V4_PRODUCTION` is out of scope without a separate public certification
    contract.

## Execution Order and Stop Conditions

1. Obtain independent approval of revision 2. Stop before browser
   characterization or code changes if the verdict is not `APPROVE`.
2. Revalidate the C3 entry commands. Write failing Codeforces pathname privacy
   tests, implement only the pre-storage grammar, and rerun five-platform
   isolation plus the frozen AtCoder suites.
3. Run focused tests and `npm run extension:check`; build exact
   `extension/dist`, verify parity, and write the required preflight receipt.
   Stop unless the receipt records the approved revision, exact counts,
   manifest version, three artifact hashes, and frozen AtCoder evidence.
4. In the already authorized Chrome profile, start bounded session-only
   characterization for `codeforces.com`. Confirm the session is active for
   Codeforces and has zero pre-existing records.
5. The user performs one natural submission. Export exactly one sanitized
   transcript, stop characterization, and validate the fixture. Do not inspect
   raw bodies, source, credentials, or account identity.
6. Stop `V4_BLOCKED` if the transcript lacks a stable numeric submission ID,
   safe contest/problem identity, or document continuity. Otherwise write the
   adapter design and failing protocol tests from the observed sequence.
7. Implement the smallest Codeforces-specific policy and any separately
   justified shared seam. Run focused unit/Fake OJ/production-dist E2E tests.
8. Run `extension:check`, `extension:e2e`, readiness validation, and the full
   quality gate. Rebuild the exact production artifact.
9. Conduct one fresh same-build user submission paired to a disposable local
   database. Stop and return to the diagnosed step on any mismatch; do not
   repeat natural submissions without a changed hypothesis or build.
10. Record the terminal C3 report, update registry/readiness/parent plan/
    handoff consistently, and rerun the terminal gates. Only then may C4
    planning begin.

Any new pathname, response scalar, document-transition exception, Gym/group
scope, or account-shaped signal returns to plan review before collection or
implementation.

## Verification

```powershell
npx vitest run --no-file-parallelism `
  tests/unit/extensionCharacterization.test.ts `
  tests/unit/extensionNetworkObserver.test.ts `
  tests/unit/extensionCharacterizationBackgroundIntegration.test.ts `
  tests/unit/extensionAdapterContract.test.ts `
  tests/unit/extensionPlatforms.test.ts
npm run extension:check
Get-FileHash -Algorithm SHA256 `
  extension/dist/manifest.json, `
  extension/dist/background.js, `
  extension/dist/content.js
npm run extension:e2e
npm run quality:gate
node scripts/validate-v4-adapter-readiness.mjs --all
$env:GIT_MASTER='1'; git diff --check
```

After characterization, add the exact transcript-validator, adapter-unit, and
Codeforces production-dist commands and record their real counts. Checks not
run must be reported as `未运行`; no planned command may be inferred as PASS.

## Completion

- Actual terminal readiness result: `V4_BLOCKED`.
- Characterization fixture: not created because the active natural submission
  produced zero exportable records; reconstructing an empty transcript would
  fabricate evidence.
- Adapter design: not created because no legal E1/E2 protocol exists inside
  the approved boundary.
- Evidence reports:
  `work/reports/v4-codeforces-c3-characterization-2026-08-02.md` and
  `work/reports/v4-codeforces-c3-blocker-2026-08-02.md`.
- Real observation: one user-confirmed natural submission on the exact
  preflight build; `/problemset/submit/` -> `/problemset/status`, zero records,
  zero navigation witnesses, stopped before expiry.
- Review result: revision 2 independently `APPROVED` by the user on
  2026-08-02 with no supplied findings.
- Preflight result: PASS; exact artifact hashes and gate counts recorded in
  `work/reports/v4-codeforces-c3-preflight-2026-08-02.md`.
- Implementation result: no Codeforces network adapter. The registry and
  readiness manifest record `blocked`. Terminal gates pass: focused 433/433,
  readiness 21/21 plus CLI PASS, frozen AtCoder hashes 9/9,
  `extension:check` 1,326/1,326, and the full nine-stage quality gate with
  2,075 unit tests, 25 app E2E, 48 runnable extension E2E, and production
  build. One Windows capability case and one known extension harness case
  remain skipped.
- Git result: no commit, push, PR, RC, acceptance, or release is authorized by
  this plan.

C3 completes only when all terminal records agree on one evidence-backed
readiness result. A truthful `V4_BLOCKED` is a valid C3 completion; an
implemented or automatically passing adapter without same-build real
observation is only `candidate`, not terminal. C4 remains sequentially gated
and C5 cannot begin until C1-C4 all have terminal results.
