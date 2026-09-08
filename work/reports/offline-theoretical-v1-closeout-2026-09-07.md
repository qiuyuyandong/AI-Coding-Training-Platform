# Local V1 offline theoretical-ready closeout (2026-09-07)

> Superseded for current readiness: an independent review reproduced additional
> defects in snapshot sharing, AI post-provider persistence, Vault portability,
> diagnosis, relay handshake recovery, and gate enforcement. Use
> `work/reports/offline-theoretical-v1-independent-repair-2026-09-08.md` for the
> current verdict. The evidence below remains historical for its own checkpoint.

## Verdict

`theoretical-ready` only.

The audit started from `662f121f24aabd720792b9f9d2ed70e83c4d2ab3`, did
not treat its prior quality-gate result as sufficient evidence, and reproduced
several defects before repairing them. Local application behavior, synthetic
browser flows, observer compatibility, optional AI contracts, and Vault
operations now pass their offline gates. This does not establish
`runtime-validated` or `release-ready` status.

No real OJ, `yu` Chrome profile, real AI provider, user compiler workspace,
clean Windows machine, pilot, RC, deployment, release, or PR was used.

## Confirmed defects repaired

1. AI report and proposal requests with the same `requestKey` could race into
   unique-key failures. A completed key could also be reused with changed
   evidence, and a failed result replay lost its original error code. Requests
   are now fingerprinted, same-process concurrent calls across separate SQLite
   connections coalesce, changed inputs conflict, and exact success or failure
   replay creates no second call, debit, report, or proposal.
2. OpenAI-compatible base paths such as `/v1`, nested `/api/v1`, and a complete
   `/chat/completions/` endpoint were composed incorrectly. Timeout covered
   only a cooperative fetch, not an ignored AbortSignal or a hanging body read.
   The shared adapter now owns URL composition and a whole-operation timeout;
   the legacy reflection experiment uses that same helper.
3. Authorized code context could be loaded before it was needed, and provider
   output had no explicit boundary against echoing a key, raw system prompt,
   absolute path, or shared code. Context is now read only when both stored
   consent and the current request authorize it. Unsafe generated text and
   forged evidence references fail closed to the deterministic fallback and
   are not persisted.
4. A Windows restore failure after the replacement evidence directory had been
   installed could fail to rename the old directory back over the live path.
   Rollback now restores the database first, reconciles the original owned
   snapshot bytes into the evidence store, removes replacement-only files, and
   validates references before cleanup.
5. Several local V1 mutation routes lacked complete replay/conflict semantics,
   bounded route IDs, or correct 404/409 responses. Project start, run evidence,
   session completion, replacement, assessments, reviews, and export now have
   the tested contracts. The evidence UI preserves one assessment key across a
   network retry and exposes explicit assessment/review network failure status.
6. The new standalone Playwright acceptance spec was initially collected by
   root Vitest. The first complete gate therefore stopped after 2681 passing
   tests. The acceptance directory is now excluded from Vitest and remains
   executable only through its own Playwright configuration.

Ponytail kept the changes on the existing service and storage paths: one shared
provider adapter, two small idempotency migrations, the existing project and
review repositories, the existing Vault swap, and one isolated acceptance
harness. No parallel identity, graph, planner, snapshot root, provider client,
installer, telemetry uploader, or cloud architecture was added.

## Acceptance evidence matrix

| Requirement | Code path | Evidence | Result or gap |
| --- | --- | --- | --- |
| AI concurrent same-key requests create one report/proposal and one debit | AI coach service, migration `0016_ai_request_idempotency.sql` | AI service 19/19; concurrent calls use two SQLite connections | PASS for the single-process local server; a future multi-process deployment is outside V1 and would need a DB lease |
| Changed input, failure retry, quota and deterministic response | AI fingerprints, quota/audit/report/proposal tables | exact counts plus changed-evidence conflicts and preserved `transport_error` replay | PASS offline |
| Compatible URL, timeout and abnormal response | shared OpenAI-compatible adapter and reflection compatibility | adapter 5/5; four URL variants in AI suite; ignored AbortSignal and hanging body covered | PASS with fake fetch; real provider pending |
| Code consent, citations and sensitive output | AI context projection and structured validators | consent pair, forged ID, injection-field exclusion, API-key/path/prompt/code echo cases | PASS offline; real provider pending |
| Full-mode backup and restore | Local Vault plus existing snapshot store | Vault 10/10; snapshot bytes/hash/reference round trip and safety-backup reversal | PASS offline |
| Restore failure at each swap boundary | Local Vault rollback | injection after live DB, replacement DB, live evidence, replacement evidence and final validation | PASS offline; clean Windows stopped-process run pending |
| Project/evidence/assessment/review/export/replacement API contracts | named routes, repositories, migrations `0017_local_v1_api_idempotency.sql` | route 6/6, component 2/2, project service 10/10 | PASS offline |
| Fresh manual loop and six-stage project without direct fact mutation | `/today`, `/evidence`, `/projects`, public APIs | standalone bundled Chromium 1/1; fresh temp DB; 1 attempt, evidence, completed review, 6 sessions, 6 summaries and 6 completion receipts | PASS offline; human usability/pilot pending |
| Historical migration prefixes | migration runner through `0017` | migration 7/7 and Local Vault prefix 5/5 | PASS offline |
| Default DB and frozen extension | temporary roots and candidate diff | exact before/after metadata and zero candidate-product diff | PASS |

## Verification evidence

Focused gates:

- AI, adapter, Vault, project, API, component and migration suites: 64/64;
  the same final versions also passed inside the complete gate.
- Standalone fresh-database bundled-Chromium acceptance:
  `npm run e2e:acceptance` — 1/1 passed in 1.7 minutes, including build and
  server lifecycle; no `/api/ai/` or external-origin request; temporary root
  absent after teardown.
- ESLint and strict TypeScript checks passed before the full gate.

The repaired final `npm run quality:gate` exited `0`:

- ESLint: PASS with zero warnings.
- Disposable migration through `0017_local_v1_api_idempotency.sql`: PASS.
- Curriculum: 12 nodes, 13 edges, 12 resources, 12 practice mappings, and 9
  careers.
- Root Vitest: 129 files, 2681 passed, 1 skipped. The skip is the documented
  Windows file-symlink capability probe (`EPERM`); mandatory junction and
  rollback coverage passed.
- TypeScript: PASS under repository strict rules.
- Application Playwright: 25/25 passed.
- Extension unit/build/parity: 1671/1671 passed.
- Extension bundled-Chromium Fake OJ E2E: 55 passed, 1 known
  service-worker-restart harness skip.
- Final Next.js production build: PASS; 28 static/dynamic pages emitted.

The default `training-platform.sqlite` remained byte-for-byte and metadata
identical before and after the full gate:

- Length: `479232` bytes.
- Last write UTC: `2026-07-23T15:56:38.8411343Z`.
- SHA-256: `2485DBEA8E9C9CF2F073BC6C9BA4AA0A5261DC3744DDA7592A2890BC554666C3`.

## Frozen Route H boundary

- Product candidate remains
  `ee0e1f5a2332fdeaf743e6fcfcadb0d799f869f0`.
- `extension/src`, `extension/manifest.json`, and `extension/identity.json`
  have no diff from that candidate.
- Combined observation-tool hash remains
  `08E9199BA12C3846464086E2D3DD0D13A145284449EDF361CBF26CF95CCEA23D`.
- No R5, READY, click, submission, or real-browser action ran.

## Remaining gaps

- `runtime-validated`: real `yu` Chrome/OJ, a real OpenAI-compatible provider,
  a clean stopped-process Windows restore/diagnose run, and a real compiler
  workspace remain independently gated.
- The one Windows file-symlink capability probe remains skipped on this host;
  the required junction and ordinary-file defenses passed.
- Human pilot usability, RC acceptance, packaging, deployment, and release are
  not tested and remain `release-ready` work.

The only reasonable next action is a review of this pushed
`theoretical-ready` checkpoint. Any runtime protocol must be separately named
and authorized; it is not implied by this report.
