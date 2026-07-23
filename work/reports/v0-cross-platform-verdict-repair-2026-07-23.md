# V0 Cross-Platform Verdict Foundation Repair (2026-07-23)

> Followed by
> `work/reports/v0-leetcode-result-route-extension-error-repair-2026-07-23.md`.
> The screenshot later proved the real problem-scoped result URL was still
> outside exact routing; retain this report as the verdict-taxonomy and
> same-document SPA repair record, not the current handoff.

## Decision

**ENGINEERING PASS / REAL CHROME RETEST PENDING.**

The user reloaded the previous LeetCode-only repair and observed that a real
submission ending in `超出时间限制` still produced no completed error attempt and
left one item in `等待判题`. This report records the subsequent uncommitted
foundation repair. It does not freeze a replacement RC, claim real-browser
success, start formal observation, or authorize V0.5.

## Corrected Root Cause

The previous diagnosis (“one missing Chinese alias”) was incomplete:

1. `超出时间限制` was already recognized by the parser. The real lifecycle can
   change from a problem route to a result route while Chrome retains the same
   document. Content runtime classified that route as `exact_result_document`,
   but background storage intentionally rejected exact-result candidates whose
   `documentId` equalled the submit document. The system rejected its own
   same-document SPA evidence and left the intent active.
2. The verdict parser had a closed label list. Any non-empty new wording inside
   a trusted verdict node returned the same `null` as absent/pending evidence,
   so a platform copy change could leave a real submission waiting.
3. Stale-intent expiry ran only during extension initialization. The existing
   24-hour expiry rule was not periodically applied in a long-lived browser.

## Repair

- Preserve a local submit-causality witness across same-problem SPA navigation.
  Same-runtime result routes emit `same_document_transition`; genuinely new
  documents retain `exact_result_document` and its different-document guard.
- Keep the safety boundary at platform adapters: only narrow registered result
  selectors or semantic extractors provide verdict text; no page body scan was
  added.
- Normalize trusted-region text through one cross-platform taxonomy:
  `Accepted`, `Partially Accepted`, time/memory/output/idleness limits,
  `Runtime Error`, `Wrong Answer`, `Presentation Error`, `Compile Error`,
  `Judge Error`, and `Other Failure`.
- Treat waiting, judging, running, queue, compiling, testing, and submitted
  labels as pending. Treat a non-empty, non-pending, non-narrative label in a
  trusted verdict region as `Other Failure`, preventing wording drift from
  becoming an infinite wait.
- Expand the atomic bundle whitelist and centralize result projection. Existing
  semantics remain: resource/runtime failures are `partial`; judge/system
  failures are `stuck`; other failures are `failed`.
- Version the changed evidence as `atomic-bundle-verdict@0.2.0`.
- Run pending expiry from the minute maintenance alarm before outbox delivery.

Two distinct real submit clicks remain two raw attempts. A newer unresolved
submit for the same problem supersedes an older unresolved intent because no
platform-independent identifier can safely associate multiple simultaneous
same-problem verdicts. This repair does not deduplicate completed attempts or
invent platform submission IDs.

## Test-Driven Evidence

The added regressions first failed against the prior implementation and then
passed after the repair. They prove:

- LeetCode.cn `超出时间限制` normalizes to `Time Limit Exceeded`;
- `执行出错` has the same `Runtime Error` meaning in another adapter's trusted
  result region rather than being hard-coded to one platform;
- pending labels remain non-final;
- an unknown non-empty trusted final label becomes `Other Failure` while body
  text and narrative summaries remain non-evidence;
- output-limit and judge/system errors retain useful category distinctions;
- a LeetCode submit and TLE result in the same Chrome document emits
  `same_document_transition`, consumes the intent, and produces one atomic
  outbox bundle;
- the server bundle schema accepts the expanded taxonomy and projects judge
  errors to `stuck` and unknown final failures to `failed`.

## Verification

Commands run against the current uncommitted worktree:

| Command | Result |
| --- | --- |
| `npx vitest run --config vitest.extension.config.ts tests/unit/extensionPlatforms.test.ts tests/unit/extensionContentRuntime.test.ts tests/unit/extensionBackgroundMessages.test.ts` | PASS: 3 files / 125 tests |
| `npx vitest run tests/unit/captureAttemptBundle.test.ts tests/unit/captureEvents.test.ts` | PASS: 2 files / 24 tests |
| `npm run typecheck` | PASS |
| `npm run extension:check` | PASS: 18 files / 439 tests, MV3 build and dist parity |
| `npm run quality:gate` | PASS: exit 0 |

The authoritative quality gate completed in 201.9 seconds:

- lint: PASS with zero warnings;
- disposable database migration: PASS;
- curriculum validation: PASS, 12 nodes / 13 edges / 12 resources / 12
  practice mappings / 9 careers;
- unit tests: 67 files / 1014 passed / 1 Windows file-symlink capability skip;
- typecheck: PASS;
- Playwright: 25 passed; AtCoder request audit `external=[]`;
- extension: 18 files / 439 passed; MV3 build and dist parity PASS;
- Next.js production build: PASS, 20/20 static pages generated;
- optional link-access report: absent, explicitly soft-skipped by the gate.

## Git And Product Boundary

- Branch: `feature/v1-followup`.
- Baseline HEAD: `894162b264124eed7315a116cae73b8e11d717b8`.
- State: uncommitted dirty worktree; no replacement RC exists.
- Real Chrome with this repaired build: not yet observed.
- Not performed: external OJ submission by an agent, user acceptance, commit,
  push, formal V0 observation, F1-F4, release, or V0.5 work.
