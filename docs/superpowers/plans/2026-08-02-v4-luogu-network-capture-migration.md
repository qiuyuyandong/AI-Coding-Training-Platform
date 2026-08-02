# V4 Luogu Network Capture Migration

**Status:** Revision 3 independently `APPROVED` on 2026-08-02 and executed to
terminal `V4_BLOCKED`. The privacy prerequisite, exact-build preflight, one
bounded natural P1001 characterization, sanitized transcript, and terminal
identity audit completed. The observed submit E1 and numeric record landing
belong to different browser documents with no approved continuity signal, so
no Luogu network adapter was implemented.

**Derived from:**

- [V4 platform network migration template](./templates/v4-platform-network-migration-template.md)
- [V4 network-confirmed capture master](./2026-07-24-v4-network-confirmed-capture-refactor-master.md)
- [Phase C-D platform migration](./2026-07-24-v4-network-confirmed-capture-refactor-phase-c-d-platform-migration-replacement-rc.md)
- [Phase C characterization control-plane generalization](./2026-07-30-v4-phase-c-characterization-control-plane-generalization.md)

## Revision History

- Revision 1 (2026-08-02): derived from the reviewed platform template after
  C3 reached its terminal result. Anonymous, read-only official-route
  reconnaissance established only the candidate pathname allowlist. Author
  self-review confirmed the UTF-8 verification wording and made build/hash
  invalidation an explicit stop condition. No authenticated browsing, natural
  submission, privacy-prerequisite implementation, adapter implementation, or
  fixture creation occurred while preparing this revision.
- Revision 2 (2026-08-02): independent review of revision 1 returned
  `CHANGES_REQUIRED` with two BLOCKER, one HIGH, two MEDIUM, and two LOW
  findings (full audit
  `work/reports/v4-luogu-c4-plan-revision-1-review-2026-08-02.md`). Author
  audit applied the following corrections while preserving the existing
  scope, ordering, and evidence discipline:
  - B1: explicitly named the pre-storage privacy test target as the Luogu
    block of `tests/unit/extensionNetworkObserver.test.ts`, mirroring the
    accepted AtCoder/Codeforces blocks; added a pre-characterization warning
    that the current `normalizeCharacterizationEndpointPath` accepts no
    Luogu paths and therefore the privacy prerequisite must close this gap
    before any authenticated session is armed.
  - B2: explicitly declared that the Luogu submit protocol shape (XHR with
    `documentId` vs. traditional form navigation without `documentId`) is
    unknown until a sanitized authenticated transcript exists, and that C2's
    and C3's form-navigation blockers are not pre-assumed. The submit-shaped
    `documentId` hypothesis is removed from the failure disposition and
    re-located as the leading characterization objective.
  - H1: bound the trusted E0 problem-hint window to the existing
    `UI_HINT_TTL_MS = 30_000` constant exported from
    `extension/src/uiHint.ts`, forbidding any Luogu-specific TTL constant;
    mirrored C2's `Safe task identity policy` wording.
  - M1: declared that the existing `luoguScenario` Fake OJ placeholder is
    preserved as a sanity scenario after characterization, and that new
    Luogu scenarios are added only after a sanitized transcript proves the
    real protocol, never copied from another platform's case.
  - M2: fixed the readiness manifest `luogu` record contract. The record
    must be appended **before** the terminal state is declared and must
    carry every required field from
    `tests/helpers/v4AdapterReadinessContract.cjs`. Until the registry
    flips Luogu out of `"uncharacterized"`, no record is required.
  - L1: provided both Windows (`Get-FileHash -Algorithm SHA256`) and POSIX
    (`sha256sum`) preflight hash commands, mirroring C3.
  - L2: collapsed the redundant `lastRecordId`-cannot-create-E2 wording into
    a single statement inside `Evidence and identity policy`, and
    referenced it from the review checklist, Fake OJ cases, and failure
    disposition.
- Revision 3 (2026-08-02): the user reported that an independent re-review of
  revision 2 closed B1, B2, H1, M1, M2, L1, and L2 and returned `APPROVED`,
  while still listing L3, L4, and L5 as non-blocking LOW observations. That
  verdict conflicted with this plan's explicit zero-LOW approval contract, so
  this revision closes all three without weakening the gate:
  - L3: splits verification into pre-characterization and post-transcript /
    terminal stages so no future report can infer unrun adapter or E2E checks;
  - L4: removes the speculative `adapters/luogu/verdict.ts` creation wording;
    the existing strict semantic extractor remains canonical, and any proven
    defect requires a separately reviewed design change;
  - L5: names `tests/unit/extensionLuoguNetworkAdapter.test.ts` explicitly in
    the post-transcript verification command while keeping transcript-derived
    validators conditional on real evidence.
- Approval (2026-08-02): the user issued the exact verdict `APPROVE Revision
  3` after revision 3 closed L3, L4, and L5. Approval receipt:
  `work/reports/v4-luogu-c4-plan-revision-3-approval-2026-08-02.md`.

## Independent Review Gate

An independent reviewer must issue exactly one verdict against this revision:

- `APPROVE`: no remaining HIGH, MEDIUM, or LOW findings, and the approved
  sequence is privacy prerequisite -> focused gates/preflight -> bounded
  characterization -> evidence-backed implementation or terminal blocker.
- `REJECT`: list every finding with severity, evidence, affected section, and
  required correction. No implementation or authenticated browsing may begin.

The review must explicitly decide whether:

1. the closed pathname grammar rejects account, team, contest, training,
   discussion, chat, download-testcase, admin, and unknown routes before
   session storage;
2. `/fe/api/record/lastRecordId` is admitted only as phase evidence and can
   never supply submission identity by name, response body, account context,
   latest-row, or timing inference (see the single statement in
   `Evidence and identity policy` below);
3. trusted E0 may carry a problem ID only from the exact reviewed problem
   document, expires after `UI_HINT_TTL_MS = 30_000` milliseconds imported
   from `extension/src/uiHint.ts`, and remains unable to create waiting or
   E2 by itself;
4. E2 requires a stable numeric record ID plus exact problem identity and
   reviewed browser-document continuity; a completed POST alone is
   insufficient;
5. the historical public-DOM blocker and authenticated AC/CE DOM fixtures
   remain unchanged and non-certifying;
6. preflight invalidation, five-platform regressions, real observation, and
   terminal-report requirements are reproducible.

## C4 Entry Gate

- C0 readiness/template infrastructure is an engineering PASS.
- C1 LeetCode is terminal `V4_EXPERIMENTAL`.
- C2 AtCoder is terminal `V4_BLOCKED`; historical AtCoder DOM production
  certification remains authoritative for its own scope.
- C3 Codeforces is terminal `V4_BLOCKED`. One exact-build, ready-gated natural
  submission moved from `/problemset/submit/` to `/problemset/status`, while
  the extension retained zero records and zero navigation witnesses. No
  Codeforces network adapter or fixture was created.
- C3 terminal gates pass: focused 433/433, readiness 21/21 plus CLI PASS,
  frozen AtCoder hashes 9/9, `extension:check` 1,326/1,326, and the nine-stage
  quality gate with 2,075 unit tests, 25 app E2E, 48 runnable extension E2E,
  and production build. One Windows capability case and one known extension
  harness case remain skipped.
- The canonical C3 evidence is
  `work/reports/v4-codeforces-c3-blocker-2026-08-02.md`.
- The current branch is `feature/v1-followup` at base HEAD
  `a24e158448c3ccf3e1cde6e380e0c441eff87342`, with the authorized C0-C3
  work intentionally uncommitted. This plan authorizes no commit, push, PR,
  RC freeze, V0 observation, or V0.5 work.

Immediately before the privacy prerequisite, rerun:

```powershell
node scripts/validate-v4-adapter-readiness.mjs --all
npx vitest run --no-file-parallelism `
  tests/unit/v4AdapterReadinessValidator.test.ts `
  tests/unit/extensionAdapterContract.test.ts `
  tests/unit/extensionNetworkObserver.test.ts
$env:GIT_MASTER='1'; git diff --check
```

## Characterization

### Existing evidence

- Public, anonymous, read-only reconnaissance on 2026-08-02 confirmed the
  official problem route `https://www.luogu.com.cn/problem/P1001`.
- The current official frontend config at `/_lfe/config` maps these route
  names and path templates:
  - `api.problem.submit` -> `/fe/api/problem/submit/{pid}`;
  - `api.record.get_last_record_id` -> `/fe/api/record/lastRecordId`;
  - `record.show` -> `/record/{id}`;
  - `record.list` -> `/record/list`.
- The public page loaded the current `columba` frontend family dated
  `20260730-2078`. Static route names establish only candidate path ownership;
  they do not prove method, lifecycle, response semantics, redirect order,
  stable identity correlation, or final-verdict behavior.
- Historical Phase 0B4 public-DOM certification remains `BLOCKED` because no
  public verdict DOM fixture exists. Preserve
  `work/reports/luogu-adapter-blocker.json` and the parent
  `tests/fixtures/luogu/` corpus byte-for-byte.
- The authenticated fixtures
  `record-287273601-p1001-ac` and `record-287272767-p1001-ce` prove only the
  existing strict record-page problem-anchor and semantic verdict extractor.
  They are non-certifying and cannot establish V4 E1/E2 chronology.

### Evidence target

- Date and source: actual capture date from one user-owned natural Luogu P1001
  submission on the exact production `extension/dist` preflight build.
- Evidence tier: expected `authenticated-characterization`; this wave can
  reach at most `V4_EXPERIMENTAL` unless a separate public certification
  contract is independently reviewed and satisfied.
- Safe fixture paths, only after a validated export exists:
  - `tests/fixtures/luogu/network/luogu-characterization-<capture-date>.json`;
  - `tests/fixtures/luogu/network/luogu-characterization-<capture-date>.meta.json`;
  - `work/reports/v4-luogu-c4-characterization-<capture-date>.md`.
- Exact request matcher: unknown until the authenticated transcript. The
  official route templates below are privacy allowlist inputs, not E1/E2
  claims.
- **Submit protocol shape is unknown.** Luogu may submit via an XHR POST on
  the existing `columba` frontend (Chrome supplies `documentId`) or via a
  traditional form navigation that is a `main_frame` request (Chrome omits
  `documentId`). The C2 AtCoder and C3 Codeforces form-navigation blockers
  are **not pre-assumed** for Luogu. The primary characterization objective
  is to record, in one sanitized transcript, whether the submit request
  carries `documentId` and whether the post-submit lifecycle exposes a
  stable numeric record ID in an allowlisted path, redirect, or closed
  scalar. No adapter implementation may be written before the transcript
  proves at least one of these signals; absence of both remains the leading
  `V4_BLOCKED` hypothesis, but it must be confirmed, not assumed.

### Pre-storage pathname grammar

**Pre-characterization privacy warning.** As of revision 2, the current
`normalizeCharacterizationEndpointPath` in `extension/src/networkObserver.ts`
contains an AtCoder block and a Codeforces block but **no Luogu block**. Any
`www.luogu.com.cn` URL therefore returns the raw `parsed.pathname` and would
enter the characterization session without any pre-storage filter. This is
an existing privacy gap. The privacy prerequisite below must close this gap
before any authenticated Luogu page is observed.

**Failing-test target.** The privacy prerequisite tests live in the new
Luogu block of `tests/unit/extensionNetworkObserver.test.ts`, alongside the
accepted AtCoder and Codeforces blocks. Each accepted form uses an
`it.each` happy-path assertion that the normalized pathname equals the
expected path and that the `outcome` reports `kind: "recorded"`. Each
rejected form uses an `it.each` rejection assertion that
`normalizeCharacterizationEndpointPath` returns `null` and that the
characterization outcome reports `kind: "ignored", reason:
"normalize_endpoint_failed"` without retaining the rejected pathname in
the JSON-serialized outcome. The five-platform regression covers Luogu plus
the other four platforms and asserts no leakage. The AtCoder, Codeforces,
LeetCode, and NowCoder pre-storage blocks remain unchanged.

Before any authenticated characterization session, update
`normalizeCharacterizationEndpointPath` so exact HTTPS
`www.luogu.com.cn`, no credentials, default port, no percent-encoding, no
doubled slash, no dot segment, and at most one optional trailing slash are
required. Accept only:

- `/problem/<pid>`;
- `/fe/api/problem/submit/<pid>` (no trailing slash unless a real official
  config revision is separately reviewed);
- `/fe/api/record/lastRecordId` (no trailing slash);
- `/record/<record-id>`;
- `/record/list`.

`<pid>` is 1-64 ASCII characters, begins with an ASCII letter or digit,
contains only `[A-Za-z0-9_-]`, and contains at least one decimal digit.
`<record-id>` is `[1-9][0-9]{0,19}`. Query values and fragments are never
retained. `/record/list` query keys and values are ignored; this path can never
create E2 or E3.

Reject every other route before storage, including `/user/*`, `/team/*`,
`/contest/*`, `/training/*`, `/discuss/*`, `/article/*`, `/chat/*`,
`/api/chat/*`, `/api/user/*`, `/judgement*`, `/admin*`,
`/fe/api/record/queryDownloadableTestcase/*`,
`/fe/api/record/downloadTestcase/*`, `/api/ide_submit`, account pages,
login/register paths, unknown API paths, malformed/overlong IDs, query-derived
identity, and any future path. A new path requires plan re-review.

### Evidence and identity policy

- Retained allowlisted fields: HTTP method; approved normalized pathname;
  resource type; lifecycle; HTTP status; approved normalized redirect
  pathname; stable numeric record ID only when present in an approved path or
  separately reviewed closed scalar; normalized problem ID; final verdict
  token; request ID; tab/frame/document identity; canonical UTC `receivedAt`;
  and numeric Chrome `apiTimeStamp`.
- Forbidden data: source code; request/response bodies; form values; uploaded
  files; language; O2 flag; CAPTCHA/interactive challenge values; headers;
  cookies; credentials; CSRF tokens; account/user/team identity; query values;
  fragments; full problem statements; execution time; memory; code length;
  testcase data; row position; unrelated records; IP address.
- `/fe/api/record/lastRecordId` is account-shaped phase evidence despite its
  path containing no account identifier. Its name, HTTP success, request
  timing, or hidden response body cannot create or select a stable record ID.
- E2 requires all of:
  1. one unique completed submit lifecycle on the exact problem ID;
  2. one stable numeric record ID from an approved redirect/path or separately
     reviewed closed scalar;
  3. exact problem identity matching the trusted source problem document;
  4. the document continuity actually proved by the transcript.
- Safe problem-identity policy: a trusted E0 problem hint may be carried
  only from the exact reviewed `/problem/<pid>` document and through the
  same shared UI-hint pipeline used by AtCoder and Codeforces. The hint
  window is bound to the existing `UI_HINT_TTL_MS = 30_000` constant
  exported by `extension/src/uiHint.ts`; the Luogu implementation must
  import this constant and may not introduce a Luogu-specific TTL. After
  `UI_HINT_TTL_MS` elapses since `hint.observedAt`, the hint may not
  contribute to E2. The hint can never create waiting or E2 by itself.
- If the result route is a same-document SPA transition, its stable
  `documentId` may be used only when the transcript proves equality. If the
  sanitized transcript shows the submit or confirmation lifecycle is a
  frame navigation and Chrome omits `documentId`, stop `V4_BLOCKED` unless a
  separately reviewed browser-owned continuity bridge exists. C2 AtCoder and
  C3 Codeforces terminal blockers are cited only as comparison evidence,
  never as a substitute for the Luogu transcript.
- E3 requires an exact `/record/<record-id>` surface whose unique first-party
  problem anchor matches the durable E2 problem and whose existing semantic
  extractor emits one final verdict. Direct/historical records without E2,
  conflicting anchors/rows, and pending/judging states never finalize.

## Scope

- Objective: characterize Luogu's current problem-submit-to-record protocol,
  implement the smallest Luogu-only V4 network policy that proves stable
  record and problem identity without account/latest-row inference, and close
  C4 in exactly one terminal state: `V4_EXPERIMENTAL`, `V4_BLOCKED`,
  `V4_DISABLED`, or `V4_PRODUCTION` only under a separate certification gate.
- Files created only after corresponding evidence exists:
  - network fixture/meta and reports named above;
  - `docs/superpowers/specs/2026-08-02-v4-luogu-network-adapter-design.md`;
  - `extension/src/adapters/luogu/network.ts`;
  - `tests/unit/extensionLuoguNetworkAdapter.test.ts`;
  - Luogu production-dist cases in
    `tests/extension-e2e/capture-v4-network.spec.ts`;
  - dated preflight, observation, blocker/closeout reports.
- File created after approval and before the real window:
  `work/reports/v4-luogu-c4-preflight-<date>.md`. It records the approved plan
  revision, privacy RED/GREEN counts, five-platform isolation, historical
  Luogu artifact/fixture hashes, frozen AtCoder hashes, readiness result,
  `extension:check`, dist parity, manifest version, and SHA-256 hashes for
  `extension/dist/{manifest.json,background.js,content.js}`. The hashes are
  produced with one of the following commands, chosen by host platform:
  - Windows PowerShell:
    ```powershell
    Get-FileHash -Algorithm SHA256 `
      extension/dist/manifest.json, `
      extension/dist/background.js, `
      extension/dist/content.js
    ```
  - POSIX (Linux/macOS):
    ```bash
    sha256sum extension/dist/manifest.json \
              extension/dist/background.js \
              extension/dist/content.js
    ```
  Any source change, rebuild, extension reload from a different artifact, or
  hash mismatch invalidates this receipt and requires all preflight gates plus
  a new receipt before an authenticated window may be armed.
- Files modified only at the evidenced seam:
  - `extension/src/networkObserver.ts` for the Luogu characterization privacy
    grammar before characterization;
  - Luogu adapter/registry and bounded pure orchestration/storage modules only
    after the transcript proves the need;
  - readiness, parent plans, architecture, runbook, README, and handoff only
    when terminal evidence exists.
  The existing strict semantic verdict extractor remains canonical. If fresh
  evidence proves a defect, stop and obtain separate review of the exact
  extractor/module change before modifying it or creating a new verdict
  module.
- Readiness manifest entry:
  `docs/superpowers/specs/v4-adapter-readiness.json` must receive a
  `luogu` record **before** any terminal readiness state other than
  `"disabled"` or `"uncharacterized"` is declared for Luogu. Until the
  registry flips Luogu out of `"uncharacterized"`, no `luogu` record is
  required and `node scripts/validate-v4-adapter-readiness.mjs --all`
  must continue to pass against the current four-record manifest. When
  the registry flips to `"experimental"` or `"blocked"`, the new record
  must carry every required field declared by
  `tests/helpers/v4AdapterReadinessContract.cjs`
  (`platform`, `status`, `characterization.{date,source,tier}`,
  `requestMatcher`, `e2Policy`, `e3Policy`, `privacyFields`,
  `fakeOjCases`, `realObservation`, `failureDisposition`,
  `endpointDriftDisposition`, `productionCertification`); the
  `characterization.source` and `realObservation` paths must point to
  repository files that exist at validation time.
- Dependencies and authorization:
  - independent approval of this exact revision;
  - exact production build and immutable preflight receipt;
  - the user personally logs in, supplies source/language, and clicks Submit;
  - no implementation beyond the privacy gate until a sanitized transcript
    proves the signal.
- Explicit non-goals: no C5 cleanup; no public-DOM promotion; no modification
  of historical Luogu fixtures/blocker; no account API; no CAPTCHA bypass; no
  source upload by the agent; no contest/team/training scope; no commit, push,
  PR, RC, V0 observation, or V0.5 work.

## Tests First

### Privacy prerequisite

- Accept only exact HTTPS `www.luogu.com.cn`, no credentials/non-default port.
- Accept exactly the five reviewed path forms and scalar bounds above.
- Reject percent/dot/double-slash ambiguity, account/team/contest/training/
  discussion/chat/admin/download/IDE/unknown routes, malformed IDs, and unsafe
  redirects before retaining a path.
- Prove LeetCode, NowCoder, AtCoder, Codeforces, and existing generic Luogu
  behavior is unchanged outside the characterization boundary.
- Assert that no Luogu-specific TTL constant is introduced and that the
  problem-hint TTL always equals `UI_HINT_TTL_MS = 30_000` from
  `extension/src/uiHint.ts`.

### Adapter unit cases after characterization

- Exact observed submit/confirmation/record sequence.
- Stable numeric record ID plus normalized problem identity.
- `lastRecordId` request without an independently sourced ID never creates
  E2 (per the `Evidence and identity policy` section).
- Direct record, record list, another record, highest/newest row, nearby time,
  and account context never create E2.
- Cross-problem, cross-document, stale, duplicate, canceled, CAPTCHA/login,
  HTTP/business failure, rate-limit, and endpoint-drift flows fail closed.
- Queue/testing/judging remains non-final; authenticated AC/CE plus current
  verdict taxonomy are used only after identity match.
- Duplicate E2 preserves first chronology; tombstoned replay cannot recreate
  confirmation.

### Fake OJ cases

- The existing `luoguScenario` placeholder in
  `tests/extension-e2e/fakeOjScenarios.ts` (URL
  `https://www.luogu.com.cn/__capture_v4_fake_oj__/submit`) is a
  Fake-OJ-router sanity scenario that the production
  `normalizeCharacterizationEndpointPath` is not required to admit. It is
  preserved verbatim and is never deleted; it serves as a regression
  reminder that the production observer does not see this path.
- After a sanitized authenticated transcript proves the real Luogu submit
  shape, add Luogu-only Fake OJ cases to the existing 18-scenario matrix
  in `tests/extension-e2e/fakeOjScenarios.ts` (or, if needed, a new spec
  in `tests/extension-e2e/capture-v4-network.spec.ts`). New cases must be
  derived from the Luogu transcript; copying another platform's case is
  forbidden. Each new case must declare its own `submitUrl`, `resultUrl`
  when relevant, `routePlans`, `expectedWebRequestCalls`,
  `expectedBridgeSummary`, `verificationMode`, and `expectedStorage`.
- Required scenario coverage at minimum:
  - exact successful characterized chain and direct numeric redirect if
    observed;
  - `lastRecordId` without numeric identity (per the single
    `Evidence and identity policy` statement), record-list refresh,
    another record, another problem, duplicate E3, post-final replay,
    HTTP/business failure, CAPTCHA rejection, cancellation, network
    error, and worker restart after E1/E2;
  - two concurrent same-problem submissions with distinct IDs cannot cross.

### Real extension E2E and observation

- Trusted Luogu anchor creates E0 only and waiting remains zero.
- Exact production-dist chain creates one durable confirmation only after the
  numeric record ID and matching problem are proven.
- Exact matching record surface finalizes one bundle; replay/unrelated records
  create no second bundle.
- Five-platform storage and behavior remain isolated.
- One fresh same-build user submission delivers exactly one paired bundle and
  one disposable SQLite attempt only on an implementation path. A blocker path
  creates none and records the exact missing signal.

## Implementation Boundary

- The only pre-characterization source change is a Luogu-specific branch in
  `normalizeCharacterizationEndpointPath` plus privacy/isolation tests. It
  cannot create E1/E2/E3 or change production matching.
- Luogu protocol code belongs under `extension/src/adapters/luogu/**`; do not
  encode it as a generic shared fallback.
- Shared modules may change only when the observation report names a concrete
  platform-neutral defect and new five-platform regressions prove isolation.
- Do not modify LeetCode, NowCoder, AtCoder, or Codeforces adapter modules.
- Preserve historical Luogu public and authenticated DOM corpora byte-for-byte,
  preserve the Phase 0B4 blocker, and preserve frozen AtCoder evidence.
- Do not read bodies, source, form fields, upload files, headers, cookies,
  credentials, CSRF/CAPTCHA values, account/team identity, query values,
  testcase data, full statements, language, O2, time, memory, or code length.
- Do not add `webRequestBlocking`, `debugger`, `<all_urls>`, `tabs`,
  `activeTab`, broad content matches, remote code, analytics, or cloud sync.
- Click remains E0 only. Waiting begins only from validated durable E2.

## Failure Disposition

- Missing or ambiguous E1/E2/E3: fail closed; create no durable confirmation,
  bundle, outbox item, or local API request.
- Missing stable numeric record ID in an approved path/redirect: terminal
  `V4_BLOCKED` unless a separately reviewed closed scalar bridge is proposed.
- Missing exact problem identity: terminal `V4_BLOCKED`.
- Missing `documentId` or unprovable cross-document continuity, when the
  transcript shows it: terminal `V4_BLOCKED`; do not weaken the C2/C3
  identity invariant. The pre-characterization state must not pre-declare
  this branch; the Luogu transcript is the only authoritative source.
- `/lastRecordId`, HTTP success, a record-list landing, a first/new/highest row,
  account context, or nearest time never confirms a submission (see the
  single `/fe/api/record/lastRecordId` statement in
  `Evidence and identity policy`).
- Endpoint drift: owned but unapproved routes retain only a closed reason, not
  their pathname. A new route requires review before collection.
- Login/CAPTCHA/CSRF/rate-limit/HTTP/business failure remains non-confirmed and
  cannot consume E0/E1.
- Terminal readiness:
  - `V4_EXPERIMENTAL` only after same-build extension plus disposable SQLite
    observation succeeds;
  - `V4_BLOCKED` when the legal signal is absent or contradictory;
  - `V4_DISABLED` only by explicit product decision;
  - `V4_PRODUCTION` is out of scope without separate public certification.

## Execution Order and Stop Conditions

1. Obtain independent approval of this revision. Stop on any unresolved
   finding.
2. Revalidate C4 entry gates. Write failing Luogu privacy tests, implement only
   the closed pre-storage grammar, and rerun five-platform plus historical
   Luogu/AtCoder isolation.
3. Run focused tests and `extension:check`; verify historical Luogu artifacts
   and fixtures plus frozen AtCoder hashes; write the exact preflight receipt.
4. In the existing authorized Chrome profile, prepare a Luogu P1001 submission
   before arming. Confirm authenticated session, exact production build, and a
   zero-record start.
5. The user clicks Submit once. A live watcher exports immediately after an
   approved submit/redirect/completion lifecycle. Stop before expiry.
6. Stop `V4_BLOCKED` if the transcript lacks stable numeric record ID, exact
   problem identity, or document continuity. Otherwise write the adapter
   design and failing protocol tests from the observed sequence.
7. Implement the smallest Luogu-specific policy and justified shared seam.
8. Run focused unit/Fake OJ/production-dist E2E, `extension:check`,
   `extension:e2e`, readiness validation, and the full quality gate.
9. On an implementation path, run one fresh same-build user submission paired
   to disposable SQLite. Do not repeat without a changed hypothesis/build.
10. Record terminal C4 result and reconcile registry, readiness, parent plans,
    reports, docs, historical hashes, and handoff. Only then may C5 begin.

Any new pathname, response scalar, cross-document exception, contest/team
scope, CAPTCHA handling, or account-shaped signal returns to independent plan
review before collection or implementation.

## Verification

### Before authenticated characterization

```powershell
npx vitest run --no-file-parallelism `
  tests/unit/extensionCharacterization.test.ts `
  tests/unit/extensionNetworkObserver.test.ts `
  tests/unit/extensionCharacterizationBackgroundIntegration.test.ts `
  tests/unit/extensionAdapterContract.test.ts `
  tests/unit/extensionPlatforms.test.ts `
  tests/unit/extensionDomesticOjAuth.test.ts `
  tests/unit/luoguFixtureLoader.test.ts `
  tests/unit/platformCertification.test.ts
npm run extension:check
node scripts/validate-v4-adapter-readiness.mjs --all
$env:GIT_MASTER='1'; git diff --check
```

### After a sanitized transcript exists and at terminal closeout

If the transcript supports implementation, first add its exact validator to
this command and to the adapter design; do not invent a validator before the
evidence format exists. The adapter unit file is fixed now and may not be
silently renamed:

```powershell
npx vitest run --no-file-parallelism `
  tests/unit/extensionLuoguNetworkAdapter.test.ts `
  tests/unit/extensionNetworkObserver.test.ts `
  tests/unit/extensionCharacterizationBackgroundIntegration.test.ts `
  tests/unit/extensionAdapterContract.test.ts `
  tests/unit/extensionPlatforms.test.ts `
  tests/unit/extensionDomesticOjAuth.test.ts `
  tests/unit/luoguFixtureLoader.test.ts `
  tests/unit/platformCertification.test.ts
npm run extension:check
npm run extension:e2e
npm run quality:gate
node scripts/validate-v4-adapter-readiness.mjs --all
$env:GIT_MASTER='1'; git diff --check
```

On a terminal blocker path where no adapter file legally exists, report the
adapter-unit command as `未运行（无适配器实现）` and run every other applicable
terminal command. Every unrun check must be stated explicitly; no planned
command may be inferred as PASS.

## Completion

- Actual terminal readiness result: `V4_BLOCKED`.
- Characterization fixture:
  `tests/fixtures/luogu/network/luogu-characterization-2026-08-02.json` plus
  its adjacent safe `.meta.json` file.
- Adapter design: not created because the transcript cannot support a legal
  E2 policy.
- Evidence reports:
  `work/reports/v4-luogu-c4-characterization-2026-08-02.md` and
  `work/reports/v4-luogu-c4-blocker-2026-08-02.md`.
- Real observation: one natural P1001 submission; three E1 lifecycle records
  for XHR `POST /fe/api/problem/submit/P1001`, one HTTP 200; landing record
  `290292547` occurred in a different browser document with zero navigation
  witnesses and no approved binding.
- Terminal verification: focused 517/517; `extension:check` 40 files and
  1,373/1,373; readiness and transcript validators PASS; full nine-stage gate
  PASS on rerun with 2,123 unit tests, 25 app E2E, 1,373 extension tests,
  48 runnable extension E2E, and production build. One Windows capability
  case and one known extension harness case remained skipped.
- Review result: Revision 3 independently `APPROVED` on 2026-08-02.
- Git result: no commit, push, PR, RC, acceptance, or release is authorized.

C4 completes only when all terminal records agree on one evidence-backed
readiness result. A truthful `V4_BLOCKED` is valid completion; a candidate
adapter without same-build real observation is not terminal. C5 cannot begin
until C4 is terminal.
