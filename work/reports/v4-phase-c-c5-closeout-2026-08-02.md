# V4 Phase C C5 Closeout - 2026-08-02

## Verdict

`PHASE C C0-C5 ENGINEERING COMPLETE`

This is an engineering closeout, not an RC, product acceptance, production
promotion, or release. Phase D remains separately gated.

## Terminal platform matrix

| Platform | DOM status | V4 network status |
|---|---|---|
| LeetCode | experimental | experimental |
| NowCoder | experimental | experimental |
| AtCoder | production | blocked |
| Codeforces | experimental | blocked |
| Luogu | experimental | blocked |

C1 completed a same-build LeetCode.cn delivery and disposable-SQLite
projection. C2 and C3 were blocked by their observed main-frame navigation
identity gaps. C4 was blocked because the observed Luogu P1001 submit E1 and
numeric record landing had different browser document IDs with no approved
continuity signal. Those honest blockers are terminal results, not failures to
complete the platform waves.

## C5 engineering result

- Added `tests/unit/extensionV4Isolation.test.ts` test-first. Its RED run had
  4 passing tests and 1 expected failure naming the reachable V3 event and
  pending-intent write locations.
- Owner-only request interpretation is pinned for the LeetCode and NowCoder
  policies; each rejects the other's request shape.
- Identical raw submission ID `42` produces distinct durable keys
  `leetcode:42` and `nowcoder:42`.
- Initialization preserves confirmed records and existing outbox state
  independently of adapter readiness metadata.
- Removed `v3_submission_intent_recorded` and `v3_verdict_observed` from the
  orchestrator event union and handlers. Unsupported DOM verdict candidates
  are dropped unless an adapter-owned V4 policy emits E3.
- Upgrade initialization retains only the required legacy
  `pendingSubmissionIntents` read/count/delete boundary. It no longer places
  an empty pending-intent property in the initialization plan, and the runtime
  has no pending-intent write or consume event.
- Historical completed bundles and their V3 `submit_clicked` parsing remain
  compatible. The `platforms.ts` compatibility exports remain because active
  call sites still depend on them; removing them now would violate the C5
  boundary.
- Production registry source contains no Fake OJ adapter/status claim.

## Verification

- Isolation RED: 1 file, 5 discovered; 4 passed and 1 expected failure.
- Isolation GREEN: 5/5 passed.
- Focused C5 regression: 6 files, 86/86 passed.
- Readiness + plan authority + isolation: 3 files, 30/30 passed.
- `node scripts/validate-v4-adapter-readiness.mjs --all`: PASS.
- Stale-symbol audit in both `extension/src` and built JavaScript:
  `v3_submission_intent_recorded` 0; `SUBMISSION_INTENT_OBSERVED` 0.
  Remaining `pendingSubmissionIntents` occurrences are migration-only
  read/count/delete references; no property write remains.
- Standalone `npm run extension:check`: typecheck PASS; 41 files and
  1,376/1,376 tests passed; MV3 build and dist parity PASS.
- Standalone `npm run extension:e2e`: 48 passed; 1 documented
  service-worker-restart harness case skipped.
- Final `npm run quality:gate`: all nine stages PASS:
  - strict lint PASS;
  - disposable database migration PASS;
  - curriculum validation PASS: 12 nodes, 13 edges, 12 resources, 12 practice
    mappings, 9 careers;
  - unit tests: 96 files, 2,126 passed, 1 Windows file-symlink capability case
    skipped under EPERM;
  - typecheck PASS;
  - application E2E: 25 passed;
  - extension check: 41 files, 1,376/1,376 passed; production MV3 build and
    dist parity PASS;
  - extension E2E: 48 passed, 1 documented harness skip;
  - Next.js production build PASS.
- `git diff --check`: exit 0; only configured LF-to-CRLF notices appeared.

Final built artifact hashes after C5 (not the earlier C4 observation build):

- `extension/dist/manifest.json`:
  `22b1fbeac7feac799c159d5a5d295700f7fef5a395c40f1a39168ea9e0293d08`;
- `extension/dist/background.js`:
  `6aac4b3df1c7b09ae4d6c762750527638458e67cb566805a925f637e8d99e7c4`;
- `extension/dist/content.js`:
  `0c0f87f75e23070e29d06db6d2dc3ccadaa62a1e64d61d327b3785594b010b88`.

## Git and release boundary

- Branch: `feature/v1-followup`.
- Base HEAD: `a24e158448c3ccf3e1cde6e380e0c441eff87342`.
- Working tree: uncommitted and not clean; the branch is 16 commits ahead of
  its upstream before these changes.
- No commit, push, PR, RC freeze, acceptance, or release was performed.
- Existing `.tmp` evidence/test directories were not deleted or rewritten.

## Next gate

The only sequential engineering next step is Phase D Task D1, beginning with
the migration/restart/update/rollback matrix in the approved Phase C-D plan.
It must not be treated as already authorized by this Phase C closeout. V0.5
and public release remain out of scope.
