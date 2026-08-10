# V4 Phase D D4 Task 12 Plan Review Closeout

## Verdict

`APPROVE` — Task 12 is closed. Tasks 13-16 may execute sequentially only
inside the frozen contract in
`docs/superpowers/plans/2026-08-06-v4-phase-d-d4-e3-candidate-coordinator-repair.md`.

This approval authorizes engineering implementation and evidence work. It is
not D4 delivery PASS, D5 approval, natural user submission evidence, user
acceptance, RC, or release.

## Local baseline

- Branch: `feature/v1-followup`
- Task 12 base HEAD: `9cbac5919aafea130c34b248171d96eaadaf4596`
- Initial dirty paths: the Task 12 unit test and D4 repair plan only
- Production source changes during Task 12: none
- Observation-9 dev server: verified as the repository `npm run dev` process
  tree rooted at PID `48076`, with child PID `51524` listening on port 3000;
  the verified tree was stopped and port 3000 no longer listened
- Observation evidence deletion: none

## RED evolution

The initial symptom-only RED reproduced `6 passed / 1 failed` at the old
same-text dedupe assertion. Both reviewers rejected it because removing the
dedupe would have made the test green without proving causality.

The revised RED models:

```text
historical Accepted on DOM node A
→ exact STARTED(request-2)
→ duplicate STARTED is idempotent
→ same-node mutation emits nothing
→ unrelated CONFIRMED emits nothing
→ same Accepted on distinct DOM node B after E1
→ pre-E2 observation retains proof but emits nothing
→ exact CONFIRMED(request-2) emits exactly one request-bound candidate
→ candidate observedAt >= confirmedAt
→ duplicate CONFIRMED emits nothing
```

Final Task 12 focused command:

```powershell
.\node_modules\.bin\vitest.cmd run --config vitest.extension.config.ts tests/unit/extensionContentRuntime.test.ts --reporter=verbose
```

Result: `1` test file intentionally failed; `6` tests passed and `1`
intentional RED failed. The exact failure is
`expected the reviewed submit-epoch control plane` at
`tests/unit/extensionContentRuntime.test.ts:41`. This is expected because Task
13 has not implemented `controlMessageReceived` yet.

## Review history

The side-panel project GPT supplemental review was explicitly told that GitHub
may lag and that supplied local facts control. Its first verdict was `REJECT`
for incomplete E1/E2 ordering/conflict semantics, ambiguous generic object
identity, and missing armed-epoch-before-text-dedupe ordering. After the
contract revisions, its second verdict was `APPROVE`. This is supplemental
evidence, not the authoritative local engineering gate.

The independent local reviewer inspected the real repository, plans, test,
production code, Git diff, and status. Its first verdict was `REJECT` for:

1. the permissive symptom-only RED;
2. conflict between automated Task 16 and master-plan natural-submission text;
3. missing executable epoch capacity/TTL/cleanup rules;
4. missing privacy-preserving diagnostic channel;
5. missing `observedAt >= confirmedAt` assertion;
6. missing explicit D3 immutable-candidate re-freeze before Task 16.

All six findings were corrected in tests and plans without production changes.
The final local verdict was `APPROVE`, explicitly authorizing Tasks 13-16 only
within the frozen contract.

## Frozen boundaries

- E1 `STARTED` alone creates an epoch and baseline; E2 `CONFIRMED` never does.
- Exact `submitRequestId`, tab, frame, and document routing; no fallback.
- Stable narrow LeetCode DOM-node identity only; no DTO/object-reference trick.
- `32` in-memory epochs, `5 minute` E1 TTL, lazy cleanup, fail-closed capacity.
- Fixed no-identity diagnostics through existing `lastCaptureError`; no new
  key, permission, API/SQLite field, timer, polling, or raw-data surface.
- Existing chronology invariant remains; legacy candidates remain fail closed.
- Task 15 must create a new immutable candidate SHA, run the candidate
  validator, build exact dist, and record required hashes before Task 16.
- LeetCode/NowCoder browser actions are real-platform automated engineering
  observations, distinct from natural submission, user acceptance, RC, and
  release.

## Verification evidence

- `npm run typecheck`: exit `0`
- `.\node_modules\.bin\eslint.cmd tests/unit/extensionContentRuntime.test.ts`:
  exit `0`
- focused Vitest command above: expected exit `1`, `6 passed / 1 intentional
  RED`; no unexpected failure
- `$env:GIT_MASTER='1'; git diff --check`: exit `0`
- Full `quality:gate`, `extension:check`, `extension:e2e`, build, privacy audit,
  readiness, and candidate validator: not run for Task 12 because the approved
  test intentionally remains RED until Task 13; Task 15 owns those gates

## Next action

Execute Task 13 test-first, obtain independent review, and create its local
commit. Do not push, create a PR, deploy, call the result RC/accepted/released,
or enter V0.5.
