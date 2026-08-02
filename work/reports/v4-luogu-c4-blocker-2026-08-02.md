# V4 Luogu C4 Terminal Blocker - 2026-08-02

## Verdict

`V4_BLOCKED`

Luogu remains DOM-`experimental`. Its V4 network adapter is blocked and was
not implemented.

## Real observation

The exact production build frozen in
`work/reports/v4-luogu-c4-preflight-2026-08-02.md` observed one natural P1001
submission. The authenticated five-minute session began with zero records and
zero witnesses. After the user clicked Submit once, it exported three safe
lifecycle records for XHR `POST /fe/api/problem/submit/P1001`; one carried
HTTP 200. The browser subsequently landed on numeric record path
`/record/290292547`, while navigation witnesses remained zero.

The submit E1 document ID was
`0B0F2A7605D410D910DF94BF4E01ADAE`. Browser-owned frame state after export
reported current document ID `4BA4F019442B690633DAF065F40513C7`. No
redirect, `lastRecordId` request, record request, history witness, or approved
bridge linked these documents. The session was exported and stopped before
expiry.

## Root cause

The observation proves a successful task-scoped submit request and a stable
numeric landing identity, but it also proves that they belong to different
browser documents. The approved correlator requires browser-owned continuity;
it cannot join them using only the tab, nearest timestamp, landing order,
latest/highest numeric ID, account context, or unobserved response data.

HTTP 200 is E1 lifecycle evidence, not E2. The direct numeric landing is not
E2 because its identity is not legally bound to the submit E1. The historical
strict Luogu verdict extractor cannot repair missing durable confirmation
after the fact.

## Stop condition

C4 requires exact problem identity, stable numeric record identity, and legal
document continuity before E2. The observed protocol lacks the third element
inside the approved privacy boundary. C4 therefore ends `V4_BLOCKED`; no
Luogu network policy, Fake OJ protocol imitation, or same-tab/time exception
was implemented.

Another natural Luogu submission is not authorized unless a separately
reviewed browser-owned scalar continuity bridge or first-party protocol change
supplies the missing binding without bodies, query values, account context,
row order, or timing inference.

## Verification evidence at terminal-contract RED

- Sanitized transcript validator: PASS.
- Fixture validator plus network-observer suite: 2 files, 153/153 passed.
- Test-first terminal contract: 2 files, 70 discovered tests, 67 passed and
  3 failed only because the registry and readiness manifest still reported
  Luogu as uncharacterized/missing. Those failures are the expected RED
  before this terminal state update.
- Pre-characterization focused suites: 8 files, 579/579 passed.
- Pre-characterization `npm run extension:check`: 39 files, 1,372/1,372
  extension tests passed; typecheck, MV3 build, and dist parity passed.
- Frozen historical AtCoder fixture hashes: 9/9 matched.

Post-update terminal and full quality-gate results are recorded in the C4 plan
completion section and Phase C closeout evidence after they run; this report
does not pre-claim unrun checks.

## Terminal gate completion

- Focused terminal regression: 9 files, 517/517 passed.
- Readiness manifest unit contract: included above and CLI PASS.
- `npm run extension:check`: 40 files, 1,373/1,373 passed; typecheck,
  production MV3 build, and dist parity PASS.
- The first full gate attempt passed its first eight stages but the final
  Next.js build worker exited without a diagnostic during page-data
  collection. Immediate standalone `npm run build` passed, and a fresh full
  `npm run quality:gate` rerun passed all nine stages: 2,123 unit tests passed
  with one Windows symlink-capability skip, 25 app E2E passed, 1,373 extension
  tests passed, 48 extension E2E passed with one documented worker-harness
  skip, and the production build passed.
- C5 subsequently ran against this terminal state; its final Phase C counts
  are recorded in `work/reports/v4-phase-c-c5-closeout-2026-08-02.md`.
