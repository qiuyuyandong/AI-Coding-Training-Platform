# V4 AtCoder Network Capture Migration

**Status:** Terminal `V4_BLOCKED` on 2026-08-02. Revision 2 was independently
`APPROVED`, the pre-storage pathname privacy prerequisite and preflight gates
passed, and three bounded windows used the exact preflight build. Two natural
submissions were safely corroborated, but every real request produced zero
characterization records. Chrome's official `webRequest` contract explains
the result: `documentId` is absent for frame navigation, while AtCoder's
traditional form submission is a `main_frame` navigation and this plan
requires exact document identity. The landing `/submissions/me` path also has
no stable numeric submission identity. No network adapter was implemented;
the historical production DOM certification remains unchanged. Authoritative
blocker: `work/reports/v4-atcoder-c2-blocker-2026-08-02.md`.

**2026-08-02 characterization attempt note:** the first five-minute session
started at `2026-08-01T16:30:36.049Z` and expired at
`2026-08-01T16:35:36.049Z`. The user completed a natural submission, and the
post-expiry DOM list exposed only the safe anchors
`/contests/abc001/submissions/78058928` and
`/contests/abc001/tasks/abc001_1`; the extension had already cleared the
session before export, so these anchors are navigation corroboration only and
are not a network transcript or protocol evidence. A second session started at
`2026-08-01T16:40:50.563Z`; a live watcher observed zero records and no POST
before expiry, so it was not counted as a characterization attempt. No further
submission may be requested until the user gives an immediate `ready`
handshake. The operator must then arm the session, keep a live record watcher
running, and export as soon as a POST reaches response, redirect, or completed
lifecycle. This operational correction does not extend the five-minute TTL,
persist evidence outside `chrome.storage.session`, or change the approved
privacy boundary.

A third ready-gated session started at `2026-08-01T17:08:24.202Z`. The user
completed natural submission `/contests/abc001/submissions/78059304` for
`/contests/abc001/tasks/abc001_1` while the session was active and a live
watcher was polling. The page moved from `/contests/abc001/submit` to
`/contests/abc001/submissions/me`, but the session remained at zero records.
The operator stopped it before TTL expiry. This disproves delayed export as the
remaining cause and establishes the pre-storage `missing_document_id` blocker
for the real main-frame navigation shape.

**Parent plans:**

- [V4 network-confirmed capture master](./2026-07-24-v4-network-confirmed-capture-refactor-master.md)
- [Phase C-D platform migration](./2026-07-24-v4-network-confirmed-capture-refactor-phase-c-d-platform-migration-replacement-rc.md)
- [Phase C characterization control-plane generalization](./2026-07-30-v4-phase-c-characterization-control-plane-generalization.md)

## Review History

- 2026-07-31 independent review: `REJECT` before characterization.
- Blocking corrections in revision 2:
  - require a closed AtCoder contest-path grammar before pathname data may
    enter `chrome.storage.session`;
  - reject identity-bearing paths such as `/users/*` before storage rather
    than relying on export-time auditing;
  - define safe task identity sources and make missing task identity a terminal
    blocker alongside missing submission identity;
  - document the actual absolute timestamp fields, shared-control-plane
    dependency, exact build preflight, and five-platform regression scope.
- 2026-07-31 revision 2 final review: `APPROVE`; no remaining HIGH, MEDIUM, or
  LOW findings. Approved only the sequence privacy prerequisite, focused
  gates/receipt, then bounded characterization.

## Characterization

- Date and source: the actual capture date must be recorded when capture
  occurs. Use a user-authorized natural submission from the already-open Chrome
  profile. Reuse the installed extension and existing CDP connection; do not
  launch a replacement Chrome or copy profile data.
- Evidence tier: `authenticated-characterization`. A natural submission
  necessarily uses the user's authenticated AtCoder session, so this wave can
  reach at most V4 `experimental`. The historical public-DOM certification
  remains a separate production claim for the DOM adapter only.
- Safe fixture path:
  `tests/fixtures/atcoder/network/atcoder-characterization-<capture-date>.json`.
  The fixture must satisfy the existing closed network transcript contract and
  must not contain raw response/request bodies.
- Pre-storage pathname privacy gate: before any real AtCoder page is observed,
  the characterization observer must accept only ASCII, non-percent-encoded
  paths in this initial grammar:
  - `/contests` or `/contests/`;
  - `/contests/<contest>` or its trailing-slash form;
  - `/contests/<contest>/tasks/<task>` or its trailing-slash form;
  - `/contests/<contest>/submit` or its trailing-slash form;
  - `/contests/<contest>/submissions` or its trailing-slash form;
  - `/contests/<contest>/submissions/me` or its trailing-slash form;
  - `/contests/<contest>/submissions/<numeric-id>` or its trailing-slash form.
  `<contest>` is a closed `[A-Za-z0-9_-]{1,64}` scalar and `<task>` is a
  closed `[A-Za-z0-9_-]{1,128}` scalar. Empty or overlong scalars fail before
  storage. Every other pathname, including `/users/*`, `/settings/*`,
  `/login*`, `/oauth*`, `/account*`, and any future route, is rejected before
  session storage. A new path requires plan re-review before collection.
- Exact request matcher: **unknown until the fresh characterization is
  exported and reviewed**. A traditional submit form, redirect, submissions
  list, or status page is only a hypothesis and must not enter code or tests as
  an asserted protocol before observation.
- E2 server-confirmation policy: to be derived only from one exact, completed
  first-party request chain that exposes a stable numeric submission identity
  in an allowlisted path or redirect. HTTP success, a click, or navigation to
  `/submissions/me` alone is insufficient.
- Safe task identity policy: `problemExternalId` may come only from an observed
  exact task pathname, or from a trusted, visible, enabled exact submit control
  on `/contests/<contest>/tasks/<task>`. The latter creates a bounded short-lived
  E0 in the originating tab/frame/document. E0 to E1 must be strictly less than
  the existing `UI_HINT_TTL_MS = 30_000` milliseconds; the implementation must
  import that constant rather than define an AtCoder-specific timeout. E1 must
  share the originating tab/frame/document and exact contest/task. A
  same-request redirect may cross into the new result document only through the
  identical request ID and tab/frame; it cannot inherit from a nearest tab,
  row, account, or time-only guess. E3 must independently expose the same task
  through the certified same-contest task anchor. If the observed protocol
  cannot satisfy these constraints without a body field, C2 stops
  `V4_BLOCKED`.
- E3 final-verdict identity policy: the existing certified
  `#judge-status` taxonomy may provide final DOM evidence only on an exact
  `/contests/<contest>/submissions/<numeric-id>` page. E3 must match a durable
  E2 confirmation with the same contest, task, and submission identity.
- Retained allowlisted fields: method, exact pre-storage-approved pathname,
  resource type, lifecycle, HTTP status, pre-storage-approved redirect
  pathname, tab/frame/document identity, canonical UTC `receivedAt`, numeric
  Chrome `apiTimeStamp`, request ID, contest slug, task ID, numeric submission
  ID, and final verdict token. The current closed transcript contains absolute
  timestamps; it does not claim relative-time transformation.
- Forbidden data confirmation: no source code, editor contents, problem
  statement, form fields, request/response bodies, headers, Cookie,
  authorization, CSRF, account handle, language, execution time, memory, IP
  address, or full URL query/fragment.

## Historical Certification Preservation Baseline

The Phase 0 corpus under `tests/fixtures/atcoder/` is immutable during C2.
These SHA-256 values are the pre-C2 byte baseline:

| File | SHA-256 |
| --- | --- |
| `README.md` | `d1ce7e3704247e09b349a23a60658e0db70520307ded4bdda2ff378b35649d10` |
| `submission-abc164-e-wa.html` | `1182001a528718dfc6e2af65739fea1971fef9f727200c842959ee093ae9b35e` |
| `submission-abc164-e-wa.meta.json` | `d9cf15bda818939c8053a8af02086c732e2995e7deb50836ced8641f40a787a3` |
| `submission-abc443-d-tle.html` | `835acf5bc7727770a3613ff999ccb1d641c05cdacc32f6aba838ae750207e63e` |
| `submission-abc443-d-tle.meta.json` | `d94d811f0117fe0f51afdcd3dd37fe1c29228d07f61b4f07aa8df5bb19576ecb` |
| `submission-agc040-d-ac.html` | `018d413beb2e77cc738feae09091b48b118dc77c1924ad31530f14c7822e2fc8` |
| `submission-agc040-d-ac.meta.json` | `90c7c3542223f29ff4271c2f1dc2b972bc3c342a478f40c3ba53dfa2cdbeb6ba` |
| `task-agc040-d.html` | `7fda5e4da2cd35e4e3eac522e4ab64a79733cddaeb7e2dece73202adc1f947b5` |
| `task-agc040-d.meta.json` | `1b35179798f04899cf89b6151912e31c6c3f1a24ccd8cc83434e1dd1bd2ed75f` |

Any mismatch is a C2 blocker unless a separate fixture-correction plan is
reviewed and approved. C2 must not rewrite
`work/reports/atcoder-*.json` or the Phase 0 certification report.

## Scope

- Objective: characterize and implement a fail-closed AtCoder V4
  server-confirmed capture policy while preserving the independently certified
  DOM adapter and its evidence byte-for-byte.
- Files created after safe characterization:
  - `tests/fixtures/atcoder/network/atcoder-characterization-<capture-date>.json`
  - `docs/superpowers/specs/<capture-date>-v4-atcoder-network-adapter-design.md`
  - `extension/src/adapters/atcoder/network.ts`
  - `tests/unit/extensionAtCoderNetworkAdapter.test.ts`
  - `work/reports/v4-atcoder-c2-characterization-<capture-date>.md`
  - terminal C2 closeout or blocker report
- File created before opening the real characterization window:
  `work/reports/v4-atcoder-c2-preflight-<preflight-date>.md`. This immutable
  receipt records the reviewed plan revision, focused privacy commands/results,
  `extension:check` result, dist-parity result, manifest version, and SHA-256
  values for `extension/dist/{manifest.json,background.js,content.js}`. The
  later characterization report must reference this receipt and the exact same
  build hashes.
- Files that may be modified after plan approval but before characterization,
  solely for the pre-storage privacy prerequisite:
  - `extension/src/networkObserver.ts`
  - focused characterization/network-observer/background-integration tests
  - no platform production policy, readiness state, or capture state
- Files that may be modified after reviewed evidence:
  - `extension/src/adapters/registry.ts`
  - `extension/src/background.ts` only for an AtCoder-specific coordinator
  - `extension/src/networkObserver.ts` only if the exact matcher cannot be
    expressed through the existing adapter-policy boundary
  - focused extension unit and production-dist E2E files
  - the canonical readiness manifest and current status documentation
- Dependencies and authorization:
  - C1 LeetCode terminal `V4_EXPERIMENTAL`: satisfied.
  - User authorization to begin C2 characterization: satisfied 2026-07-31.
  - First independent review: `REJECT`; revision 2 final review: `APPROVE`.
  - Fresh safe characterization: pending.
  - The generalized characterization control plane exists only in the current
    uncommitted C0/C1 working tree. Before capture, its focused privacy tests,
    `npm run extension:check`, production `extension/dist` parity, manifest
    version, and SHA-256 values for manifest/background/content must be recorded
    in the pre-characterization receipt described above. The real AtCoder tab
    must not be opened until that persistent receipt exists.
- Explicit non-goals: no changes to LeetCode, NowCoder, Codeforces, or Luogu
  protocol behavior; no cloud capture; no account correlation; no production
  promotion based on authenticated evidence; no modification of historical
  AtCoder certification artifacts.

## Tests First

- Failing unit cases:
  - the characterization privacy gate accepts only the initial contest grammar
    and strips query/fragment before classification;
  - `/users/*`, account/settings/login paths, percent-encoded paths, hostile
    schemes/ports/credentials, overlong scalars, and future unknown paths never
    enter session storage or path-bearing diagnostics;
  - accept only the exact characterized AtCoder host/method/path/lifecycle
    sequence;
  - require a stable numeric submission ID and exact safely sourced
    contest/task identity;
  - require trusted E0 and E1 to share the originating tab/frame/document and
    enforce `UI_HINT_TTL_MS = 30_000` milliseconds exactly;
  - allow a document transition only through the same redirect request ID and
    tab/frame, followed by an exact same-contest task anchor at E3;
  - reject missing, duplicate, stale, crossed-document, crossed-contest, and
    crossed-task witnesses;
  - treat HTTP success without stable identity as insufficient;
  - recognize only exact final AtCoder verdict tokens after E2;
  - preserve first E2 chronology and finalized tombstone idempotency;
  - public historical submission pages never create E2;
  - reject cross-contest task anchors and hostile host/scheme/port variants;
  - record owned endpoint drift only as bounded path-only diagnostics.
- Fake OJ cases:
  - exact submit and confirmation success;
  - redirect carrying stable submission ID, if observed;
  - queue or judging followed by final;
  - direct final page after E2;
  - historical public result navigation without E1/E2;
  - duplicate confirmation and duplicate E3;
  - contest/task/submission identity mismatch;
  - HTTP business failure, 4xx, cancellation, and network error;
  - worker restart after E1 and after E2.
- Real extension E2E cases:
  - production `extension/dist` creates no waiting state from a click alone;
  - the characterized E1/E2 chain creates exactly one durable confirmation;
  - exact E3 finalizes once and creates one four-event bundle;
  - replay after tombstone cannot recreate a confirmed record;
  - existing Phase 0 public fixtures still produce the certified DOM outcomes.
- Real observation cases:
  - one user-owned natural submission with the same production build;
  - terminal extension state reconciles with the visible submission identity
    and verdict;
  - paired local API and disposable SQLite receive exactly one attempt;
  - no unmatched E3, ambiguity, quarantine, or endpoint-diagnostic residue.

## Implementation Boundary

- Shared modules that may be modified: only those listed in Scope and only
  after the characterization report demonstrates the exact missing behavior.
  The sole pre-characterization exception is the approved pre-storage privacy
  gate. Every shared change requires five-platform host-ownership, isolation,
  and fail-closed regressions for LeetCode, NowCoder, AtCoder, Codeforces, and
  Luogu, plus the frozen AtCoder DOM certification suites.
- Adapters and protocol-specific files that must not be touched:
  `extension/src/adapters/leetcode/**`,
  `extension/src/adapters/nowcoder/**`,
  `extension/src/adapters/codeforces/**`, and
  `extension/src/adapters/luogu/**`.
- The existing AtCoder DOM detector, selector `#judge-status`, public fixture
  corpus, promotion evaluator, certification verdict, and certification report
  are frozen.
- Forbidden inferences: no nearest-row guessing, no reuse of another
  platform's protocol, no stable ID inferred from timing/order alone, no
  account identity correlation, no parsing of response bodies or submitted
  form data, no click-only waiting, and no task identity inferred from a
  submission's account or position in a list.

## Failure Disposition

- Missing or ambiguous E1/E2/E3: fail closed, produce no durable confirmation
  or bundle, and retain only the already-approved bounded diagnostic category.
- Stable ID absent from allowlisted path/redirect fields: terminal
  `V4_BLOCKED` pending a separately reviewed scalar bridge. This plan does not
  authorize body inspection.
- Safe task identity absent from an exact observed task path or trusted
  same-document E0: terminal `V4_BLOCKED`. This plan does not authorize reading
  submitted form data to recover the task.
- Endpoint drift: an exact-host submit/status/submission-like request outside
  the characterized production matcher but inside the pre-storage contest
  grammar may create at most 20 session-only diagnostics containing method,
  approved pathname, status, lifecycle, request/document identity, and the
  declared timestamp fields. A path outside the privacy grammar may retain only
  a closed rejection reason and no original pathname. Query, fragment, body,
  headers, credentials, code, and account data are excluded, and diagnostics
  cannot enter capture state.
- Terminal readiness result: `experimental`, `blocked`, or `disabled`.
  `production` is forbidden in this authenticated C2 wave even though the
  independent historical DOM adapter remains production-certified.

## Execution Order and Stop Conditions

1. Obtain independent approval of revision 2. Required before any AtCoder
   browsing, characterization, or implementation.
2. Write failing privacy tests, implement only the pre-storage AtCoder contest
   pathname gate, and prove that identity-bearing/unknown paths cannot enter
   session storage or path-bearing diagnostics.
3. Run the focused characterization privacy suites and
   `npm run extension:check`; build exact `extension/dist`, verify parity, and
   create the persistent preflight receipt with manifest version plus
   manifest/background/content SHA-256 values. Stop unless the receipt exists.
4. Arm the generalized session-only characterization mode for `atcoder.jp` in
   the existing Chrome and export one sanitized natural-submission transcript.
5. Validate and manually audit the fixture for forbidden fields. Stop
   `V4_BLOCKED` if either stable submission ID or safe task identity is absent.
6. Write the protocol design from observed evidence and add failing tests.
7. Implement the smallest AtCoder-specific policy and coordinator.
8. Run focused tests, historical certification, extension gates, and aggregate
   quality gate.
9. Build the exact production artifact and conduct one fresh same-build real
   observation into a disposable local database.
10. Recompute all historical fixture hashes, update readiness/status documents,
   and publish an evidence-backed terminal C2 report.

Any new pathname returns to plan review before storage. Any protocol mismatch
after characterization returns to Step 4 only after a documented hypothesis or
diagnostic change. Repeated submissions without such a change are forbidden.

## Verification

```powershell
npx vitest run --no-file-parallelism `
  tests/unit/extensionCharacterization.test.ts `
  tests/unit/extensionNetworkObserver.test.ts `
  tests/unit/extensionCharacterizationBackgroundIntegration.test.ts `
  tests/unit/extensionAtcoderCertification.test.ts `
  tests/unit/extensionAtcoderCertificationBlocked.test.ts `
  tests/unit/extensionAtcoderPromotion.test.ts `
  tests/unit/extensionPlatforms.test.ts
npm run extension:check
Get-FileHash -Algorithm SHA256 `
  extension/dist/manifest.json, `
  extension/dist/background.js, `
  extension/dist/content.js
npm run extension:e2e
npm run quality:gate
node scripts/validate-v4-adapter-readiness.mjs --all
```

The exact transcript validator and focused AtCoder policy test commands must be
added after the fixture/design filenames exist. All historical fixture hashes
must match the baseline above after verification.

## Completion

- Actual terminal readiness result: `V4_BLOCKED`.
- Evidence report: `work/reports/v4-atcoder-c2-blocker-2026-08-02.md`.
- Review result: first review `REJECT`; revision 2 final review `APPROVE` with
  no remaining findings.
- Preflight receipt:
  `work/reports/v4-atcoder-c2-preflight-2026-07-31.md`.
- Terminal verification: focused 401/401; readiness CLI PASS; frozen fixture
  hashes 9/9; full quality gate PASS with 2,034 runnable unit tests, 25 app E2E,
  1,286 extension tests, 48 runnable extension E2E, and production build PASS.
  One Windows capability test and one documented extension harness case remain
  skipped.
- C2 authorizes C3 only after the terminal result, evidence, readiness
  manifest, historical hash comparison, and current handoff agree. C2 does not
  authorize an AtCoder retry; that requires a separately reviewed scalar
  bridge or an observable platform-protocol change.
