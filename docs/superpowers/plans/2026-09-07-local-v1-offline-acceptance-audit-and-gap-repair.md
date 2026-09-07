# Local V1 Offline Acceptance Audit and Gap Repair

**Status:** completed with an offline `theoretical-ready` result.

**Baseline:** branch `codex/offline-theoretical-v1`, commit
`662f121f24aabd720792b9f9d2ed70e83c4d2ab3`, clean worktree at audit start.

## Goal

Independently verify the acceptance requirements of
`2026-09-07-offline-theoretical-v1-hardening-ai-operations.md`, reproduce and
repair offline defects, and replace broad quality-gate claims with exact code
and test evidence. The maximum possible verdict is `theoretical-ready`.

## Fixed boundaries

- Use only temporary databases, temporary Vaults, injected fake `fetch`, Fake
  OJ, and bundled Chromium.
- Do not connect to the `yu` Chrome profile, a real OJ, a real model provider,
  a user compiler workspace, or a release environment.
- Preserve the default database and the frozen extension candidate
  `ee0e1f5a2332fdeaf743e6fcfcadb0d799f869f0`.
- Reuse the existing evidence, plan, AI adapter, Local Vault, and observer
  chains. Do not add a parallel identity, planner, storage root, provider
  client, installer, telemetry path, or cloud feature.
- Product behavior, authorization scope, and retention defaults stay fixed.
  Only a required change to one of those contracts stops for user input.

## Acceptance matrix and execution order

| Requirement | Code path to inspect | Required evidence | Initial status |
| --- | --- | --- | --- |
| AI request-key concurrency, input conflict, retry, quota, and single report/proposal | `aiCoachService`, migration 0014, AI routes | concurrent service/API tests with fake fetch and persisted row counts | audit required |
| OpenAI-compatible URL, timeout, malformed responses, context consent, references, and output privacy | shared adapter, reflection compatibility, AI projection | URL/parser/timeout tests plus exact serialized request/DB/log scans | partial evidence; audit required |
| Full-snapshot backup/restore and rollback at each replacement boundary | `vault/operations`, snapshot store, migration 0015 | temporary full-mode snapshot round trip, fault injection, safety-backup restore | partial evidence; audit required |
| Project/evidence/assessment/review/export/replacement route contracts | existing API routes and transaction services | same-origin, schema bounds, 404, replay/idempotency, injected-failure, and user feedback tests | partial evidence; audit required |
| Fresh-database manual training to evidence/review/today plan | public pages and APIs | one isolated browser flow; direct SQL only for initial immutable fixture installation, never for the behavior under test | not proven end to end |
| Fresh-database six-stage project | `/projects` and project APIs | public browser/API actions for all six milestones; no direct mutation of project facts | partial evidence; fresh-isolation audit required |
| Default DB and frozen extension remain unchanged | quality-gate isolation and Git diff | before/after length, timestamp and SHA-256; zero candidate diff | previously proven; recheck required |

## Method

1. Trace each shared implementation end to end and enumerate existing tests.
2. For each uncovered invariant, first write a minimal test that fails for the
   concrete reason. Classify it as confirmed defect, test-evidence gap, or
   real-environment-only gap.
3. Repair confirmed defects at the narrowest shared boundary. Prefer database
   constraints, transactions, and existing helpers over new abstractions.
4. Add focused unit/route/component tests. Add fresh-database bundled-Chromium
   flows that exercise product pages/APIs rather than directly changing the
   state being accepted.
5. Run focused gates, then one complete `npm run quality:gate`. If it fails,
   fix the reproducible cause and rerun the affected focused gate and the full
   gate.
6. Update the closeout report with an evidence matrix that marks untested
   requirements as gaps. Commit and push only
   `codex/offline-theoretical-v1`; create no PR, release, or deployment.

## Expected deliverables

- This plan and a revised evidence-backed closeout report.
- Minimal fixes and regression tests for every confirmed offline defect.
- Exact focused/full gate results and default-database/candidate preservation
  evidence.
- A final separation between confirmed fixes, remaining offline coverage gaps,
  and independent real-environment validation tasks.

## Execution result

The audit reproduced and repaired four defect groups: AI request races and
non-deterministic replay, Windows evidence-directory rollback failure, missing
mutation-API idempotency/status contracts, and accidental Vitest collection of
the standalone Playwright acceptance suite. The fixes stayed inside the shared
AI adapter, existing project/evidence repositories, Local Vault root, and
current browser harness.

| Acceptance requirement | Final code path | Test evidence | Remaining gap |
| --- | --- | --- | --- |
| AI request-key concurrency, changed-input conflict, failure replay, quota and single result | `lib/services/aiCoachService.ts`, migration `0016` | `aiCoachService.test.ts`: 19/19, including two SQLite connections, reports and proposals | Cross-process coordination is not exercised because the local V1 server has one application process; a future multi-process deployment would require a database lease |
| Compatible URL, whole-response timeout, malformed response, consent, citations and sensitive output | `openAiCompatible.ts`, `reflectionExperiment.ts`, AI validation projection | `openAiCompatible.test.ts`: 5/5; AI suite covers four URL shapes, forged IDs, prompt projection, code consent and output rejection | Real provider wire compatibility remains runtime validation |
| Full snapshot backup/restore and failure rollback | `lib/vault/operations.ts`, existing snapshot store | `vaultOperations.test.ts`: 10/10, including safety-backup reversal and five injected swap boundaries | Clean Windows host/real stopped application remains runtime validation |
| Mutation API same-origin, bounds, 404, replay/conflict and UI error feedback | project/evidence/assessment/review/export/replacement routes and repositories; migrations `0017` | `localV1ApiContracts.test.ts`: 6/6; `evidenceActions.test.tsx`: 2/2; project service: 10/10 | No known offline gap in the named routes |
| Fresh manual training to evidence/review/today plan and six-stage project | public `/today`, `/evidence`, `/projects` pages and their APIs | standalone bundled-Chromium acceptance: 1/1; product facts are created only through page/API behavior | Human usability and real workspace interaction remain runtime/pilot validation |
| Historical-prefix migration compatibility | migration runner through `0017` | `migrations.test.ts`: 7/7 and `localVaultMigration.test.ts`: 5/5 | None found offline |
| Default DB and frozen extension preservation | temporary test roots and unchanged candidate paths | before/after DB length, mtime and SHA-256 identical; zero product diff from `ee0e1f5` | None found offline |

The final `npm run quality:gate` passed after the collection-boundary repair:
129 root test files, 2681 passed and one documented Windows symlink-capability
skip; application E2E 25/25; extension 1671/1671; extension Fake OJ E2E 55
passed and one known harness skip; production build emitted 28 pages. The
standalone acceptance run passed 1/1 and removed its temporary database and
Vault directory at teardown.
