# V0 LeetCode TLE Semantic Result Repair (2026-07-23)

## Decision

**ENGINEERING PASS / BOUNDED REAL-CHROME RECOVERY PASS / FRESH SUBMISSION OBSERVATION PENDING.**

The extension now captures the current LeetCode.cn TLE surface even when the
site restores the problem URL after a result navigation. The user's stuck
intent was recovered against the existing real result, normalized to
`Time Limit Exceeded`, delivered once to the local app, and left active
intents, outbox, quarantine, and unmatched candidates at zero. This is strong
runtime evidence, but it is not a fresh natural click-to-final observation and
does not certify LeetCode as a production adapter.

## First-Principles Diagnosis

Capture is a causal join, not a page-text search. It requires:

1. one exact user submit intent;
2. a trusted result surface for the same installation, platform, and problem;
3. a final verdict observed after the intent;
4. one atomic bundle persisted before delivery;
5. a matching ACK before the bundle is removed.

The `experimental` registry value was not involved: readiness status is
evidence metadata and no detector branch checks it. Promoting LeetCode to
`production` would therefore change a label without repairing behavior.

Remote inspection of the user's real page found two DOM/lifecycle differences:

- the current result route exposed two identical visible
  `[data-e2e-locator="console-result"]` nodes instead of the legacy
  `submission-result` node;
- after a full navigation LeetCode restored
  `https://leetcode.cn/problems/two-sum/` while keeping the selected
  `#submission-detail_tab` result surface visible.

The semantic tab first displays generic chrome such as `提交详情` and only later
displays `超出时间限制`. Treating any unknown trusted text as `Other Failure`
would consume the intent too early. Conversely, accepting inactive or
conflicting panes would allow stale evidence.

## Repair

- Keep the legacy LeetCode verdict locator and add a semantic extractor for the
  observed current `console-result` panes.
- Collapse duplicate identical visible values; reject conflicting values
  instead of guessing.
- Accept the restored problem URL as exact-result-equivalent only when the
  unique detail tab is inside the official tabbar, visible, and selected.
- On the semantic-tab fallback, accept only a recognized final verdict.
  `提交详情`, pending text, unknown text, inactive tabs, and conflicting leaf
  values produce no candidate.
- Preserve the existing platform-neutral verdict taxonomy and atomic
  background identity/time/document checks. No page-body scan or LeetCode API
  access was added.

## Real-Chrome Evidence

Authorized inspection used the already-open real submission
`/problems/two-sum/submissions/737659968/`, whose visible verdict was
`超出时间限制`. It did not read cookies, credentials, hidden platform state,
account history, or submit new code.

An initial diagnostic build incorrectly consumed the transient `提交详情` label
as `Other Failure`. That diagnostic attempt was immediately voided through the
official local API with an audit reason; it remains only as voided history and
is excluded from normal Training, Coach, and Growth queries.

After adding the final-verdict guard, a bounded recovery recreated the original
stuck intent identity and navigated to the existing result. The complete local
pipeline produced:

- normalized verdict: `Time Limit Exceeded`;
- projected attempt result: `partial`;
- delivered attempt ID:
  `attempt_submission_recovery_f24dca09_b65c_457c_920e_2805f52bad5a`;
- final extension state: active `0`, outbox `0`, quarantine `0`, unmatched `0`;
- matching ACK recorded as the last delivered attempt.

This proves the real DOM extractor, result-surface recognition, background
matching, atomic API, ACK removal, and queue cleanup together. A fresh
user-driven submit on the final commit remains the formal observation gate.

## Verification

The regressions were introduced test-first:

- current duplicate `console-result` TLE panes;
- conflicting current panes;
- duplicate semantic-tab verdict leaves;
- conflicting semantic-tab leaves;
- transient `提交详情`;
- inactive semantic tab;
- stored intent to restored problem URL to exact TLE bundle.

The first aggregate run after adding the inactive-tab guard stopped at one
expected fixture failure because the older success fixture omitted the real
tabbar wrapper. The fixture was corrected to the observed DOM shape; the
focused 3-file / 261-test run and the complete rerun then passed. No failed
gate was treated as release evidence.

`npm run quality:gate` exited 0 after the repair:

- lint: PASS, zero warnings;
- disposable migration: PASS;
- curriculum validation: PASS, 12 nodes / 13 edges / 12 resources /
  12 practice mappings / 9 careers;
- unit tests: 68 files / 1039 passed / 1 Windows file-symlink capability skip;
- typecheck: PASS;
- Playwright E2E: 25 passed, AtCoder request audit `external=[]`;
- extension: 19 files / 464 passed; MV3 build and dist parity PASS;
- Next.js production build: PASS, 20/20 static pages generated;
- optional link-access report: absent and explicitly soft-skipped.

The Windows skip is the documented EPERM file-symlink capability probe; all
mandatory junction safety coverage passed.

## Product Boundary

- AtCoder remains the sole certified `production` adapter.
- LeetCode remains `experimental`; the new real TLE evidence should feed a
  future certification plan but does not satisfy one by itself.
- NowCoder, Codeforces, and Luogu were not changed by this LeetCode DOM repair.
- V0.5 was not merged into V0. Capture is an entry-level V0 dependency, while
  V0.5 has separate scope and acceptance gates; combining them would enlarge
  the unstable validation surface without fixing this causal join.
- No external OJ submission, push, release, V0 acceptance, or V0.5
  implementation was performed.
