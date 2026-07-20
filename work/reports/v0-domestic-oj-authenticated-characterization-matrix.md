# V0 Domestic-OJ Authenticated-Characterization Evidence Matrix

**Date:** 2026-07-20
**Scope:** LeetCode.cn, NowCoder (ac.nowcoder.com), Luogu (www.luogu.com.cn)
**Evidence tier:** `authenticated-characterization` (non-certifying)
**Capture method:** User-authorized logged-in Chrome session; visible-DOM scrape; user-authorized sanitization.
**Plan:** `docs/superpowers/plans/2026-07-20-v0-domestic-oj-capture-stabilization.md`

---

## What this report IS

- An evidence-based platform × page surface × observed selector/extractor ×
  missing-verdict matrix for the three supported domestic OJ adapters
  (LeetCode.cn, NowCoder ac, Luogu).
- A diff between **passive detection** (the extension's content script
  reading currently-rendered DOM in a user session) and **future
  user-performed submissions** (which the agent never made and never
  will, on principle, in this slice).

## What this report IS NOT

- NOT a production certification. Every domestic-OJ adapter remains
  `experimental` in `extension/src/platforms.ts`. `AtCoder` is the sole
  `production` adapter as of 2026-07-17.
- NOT a hands-on AC + non-AC matrix. The user-authorized browser inspection
  produced NO new submissions. No form submission, no editor buffer,
  no source code was ever recorded by the agent. The evidence below is
  exclusively from existing pages opened by the agent in new background tabs
  after the user authorized read-only inspection.
- NOT a release-candidate freeze. This slice supersedes the V0 RC at
  `b5166320768355666a5c4ff3f466c29c240ea8cf`; the new RC is not yet
  frozen.

---

## 1. Privacy and capture discipline (asserted up-front)

| Sanitization aspect                          | Retained in fixture | Excluded from fixture / never observed |
|---------------------------------------------|---------------------|----------------------------------------|
| Cookies / tokens                            | No                  | Yes                                    |
| Login credentials / session material       | No                  | Yes (browser state was used but never read or persisted) |
| Submitted source code                       | No                  | Yes                                    |
| Full commercial problem statement           | No                  | Yes                                    |
| Account identity (username / handle / link) | No                  | Yes                                    |
| Submission timestamp / language / memory / code length | No   | Yes                                    |
| User-link / nav / sign-in / chrome          | No                  | Yes                                    |
| Forms / scripts / styles / CSRF tokens      | No                  | Yes                                    |
| Source URL (public page URL)                | Yes (record/submission identifiers are public) | —                          |
| Public submission / record ID               | Yes (no cookies needed to view it publicly) | —                |

**Capture protocol:** the user retained an existing signed-in Chrome session
and granted the agent a short read-only visible-DOM inspection. The agent
opened the documented pages in new background tabs. The agent did not perform
any submission. The agent did not copy any source code. The agent did
not capture any problem statement. The agent only wrote the minimum
DOM needed to exercise `detectProblemFromPage` and
`detectVerdictFromDocument` under the `authenticated-characterization`
evidence tier — which is **non-certifying** by definition (see
`tests/helpers/platformFixtureMetadata.ts`).

---

## 2. Platform × Page Surface × Detection Matrix

| Platform | Page Type | URL Pattern | DOM Surface | Selector / Extractor | What's observed | Detected Verdict | Detected Identity |
|----------|-----------|-------------|-------------|---------------------|------------------|------------------|--------------------|
| LeetCode.cn | Problem page | `/problems/<slug>/description/` | `<button data-e2e-locator="console-submit-button">提交</button>` | Label exactly `提交` (allowed label), `e2e-locator="console-submit-button"` evidence (inline DOM in test, not a corpus fixture) | Submit button | — | `leetcode` / `/problems/<slug>/` (URL-only) |
| LeetCode.cn | Submission page (public) | `/submissions/detail/<digits>/` | Unique anchor `<a href="/problems/<slug>/">…</a>` + verdict node `<div data-e2e-locator="submission-result">通过</div>` | Anchor: `/problems/<slug>/` first-party match. Verdict: `[data-e2e-locator="submission-result"]` narrow wrapper | AC verdict token `通过` (whitespace-delimited) | `Accepted` | `leetcode` / `find-the-prefix-common-array-of-two-arrays` (from unique anchor + `problemTitle` = trimmed anchor text) |
| NowCoder | ACM problem page | `/acm/problem/<id>` | `<button class="btn-submit">保存并提交</button>` | Label exactly `保存并提交` (allowed label), `btn-submit` class evidence (inline DOM in test) | Submit button | — | `nowcoder` / `acm/problem/<id>` (URL-only) |
| NowCoder | ACM view-submission (public) | `/acm/contest/view-submission?submissionId=<digits>` | Unique anchor `<a href="/acm/problem/<id>">…</a>` + verdict container `<div class="coder-cont-legend">运行状态:<span class="font-green">答案正确</span></div>` | Anchor: `/acm/problem/<id>` first-party match. Verdict: `.coder-cont-legend` narrow container | AC verdict container `<span class="font-green">答案正确</span>` | `Accepted` | `nowcoder` / `acm/problem/319811` (from unique anchor + `problemTitle` = anchor text) |
| Luogu | Problem page (`/problem/<id>#ide`) | `/problem/<id>` | `<a href="javascript:void 0" class="title"><span class="icon">…</span><span class="text">提交</span></a>` | Anchor `<a class="title">` with inner `<span class="text">` whose text normalizes to exact `提交`. Platform-specific anchor promotion scoped to Luogu only. | Submit anchor (label reads 提交 from inner span) | — | `luogu` / `<id>` (URL-only) |
| Luogu | Record page (public) | `/record/<digits>` | Unique anchor `<a href="/problem/<id>">…</a>` + semantic row with leaf text exactly `评测状态` + verdict sibling span with token like `Accepted` or `Compile Error` | Anchor: `/problem/<id>` first-party match. Verdict: semantic extractor `extractLuoguRecordRowText` keyed by exact `评测状态` (no CJK substring CJK substring leak; wrap shape: leaf + closest div/tr/li/section). | `Accepted` or `Compile Error` verdict text | `Accepted` / `Compile Error` (one fixture each) | `luogu` / `P1001` (from unique anchor + `problemTitle` = anchor text) |
| AtCoder | Submission page (production) | `/contests/<contest>/submissions/<digits>` | `#judge-status` cell + unique `/contests/<contest>/tasks/<task>` anchor | `#judge-status` | `AC`/`WA`/`TLE` etc. (production adapter) | various | `atcoder` (production) |

---

## 3. Existing Verdict Coverage Matrix (per platform, per verdict class)

The capture protocol was a user-authorized visible-DOM read of existing pages
opened by the agent in background tabs. The agent
did not perform a fresh submission on any platform. This is the contract
for what can be claimed "observed today" without making a submission.

| Platform | Accepted (AC) | Wrong Answer (WA) | Time Limit Exceeded (TLE) | Memory Limit Exceeded (MLE) | Runtime Error (RE) | Compile Error (CE) | Partially Accepted (PA) |
|----------|---------------|-------------------|--------------------------|-----------------------------|--------------------|--------------------|--------------------------|
| LeetCode.cn | ✅ OBSERVED (public submission) | ❌ NOT OBSERVED | ❌ NOT OBSERVED | ❌ NOT OBSERVED | ❌ NOT OBSERVED | ❌ NOT OBSERVED | ❌ NOT OBSERVED |
| NowCoder (ac) | ✅ OBSERVED (public view-submission) | ❌ NOT OBSERVED | ❌ NOT OBSERVED | ❌ NOT OBSERVED | ❌ NOT OBSERVED | ❌ NOT OBSERVED | ❌ NOT OBSERVED |
| Luogu | ✅ OBSERVED (public record 287273601) | ❌ NOT OBSERVED | ❌ NOT OBSERVED | ❌ NOT OBSERVED | ❌ NOT OBSERVED | ✅ OBSERVED (public record 287272767) | ❌ NOT OBSERVED |
| AtCoder (production, pre-existing) | ✅ certified | ✅ certified | ✅ certified | — | — | — | — |

**Why the "not observed" cells matter:** any future claim that an
adapter is "production-ready" for capturing, e.g., a `Wrong Answer`
event on a domestic OJ must be backed by a new authenticated-characterization
fixture (or, ideally, a verified-public-DOM fixture) — not by inference
from the AC evidence. Production certification requires, at minimum,
non-AC coverage too. The user's account had no own submission data
for this capture, and the agent did not fabricate fixtures for
non-observed verdicts.

**Why hands-on non-AC evidence will require a separate session:**
a future user-performed submission cycle (not part of this slice) is
the only honest path to non-AC authentic-characterization fixtures for
LeetCode / NowCoder. The agent's discipline is to NOT submit on the
user's behalf and to NOT script non-AC verdicts via private APIs.

---

## 4. Adapter Status

`extension/src/platforms.ts::PLATFORM_ADAPTERS` retains the following
post-this-slice state (read directly from the source):

| Platform   | Status        | Adapter selectors / extractor                | Allowed submit labels         |
|------------|---------------|----------------------------------------------|--------------------------------|
| leetcode   | experimental | `[data-e2e-locator="submission-result"]`     | `submit`, `提交`               |
| codeforces | experimental | `.status-cell`, `td.status-small`, `.verdict-accepted` | `submit`                |
| atcoder    | **production** | `#judge-status`                            | `submit`, `提出`              |
| nowcoder   | experimental | `.coder-cont-legend` (+ `[data-…]` etc legacy removed) | `提交`, `保存并提交` |
| luogu      | experimental | semantic `extractLuoguRecordRowText` extractor (no CSS selector) | `提交` (anchored `<a class="title">`) |

No platform was promoted to `production` by this slice. `getProductionPlatforms()`
still returns `["atcoder"]`.

---

## 5. Why this slice is NOT a replacement release candidate

This slice:

- Adds `authenticated-characterization` to the fixture metadata schema
  (a deliberately non-certifying tier).
- Replaces the unspecific NowCoder `.result` / `.submission-result` /
  `.judge-result` selectors with the evidence-backed `.coder-cont-legend`
  container; those legacy selectors matched zero observed nodes.
- Replaces the unspecific Luogu `.status` / `.record-status` /
  `.submission-status` selectors with the semantic
  `extractLuoguRecordRowText` extractor; those legacy selectors
  matched zero observed nodes.
- Adds `detectProblemFromPage` support for three record/submission
  routes with strict URL + exactly-one first-party anchor + spoof
  rejection (LeetCode `/submissions/detail/`, NowCoder
  `view-submission?submissionId=`, Luogu `/record/`).
- Adds the LeetCode Chinese `提交` label, the NowCoder `保存并提交`
  label, and the Luogu platform-specific `<a class="title">` anchor
  promotion — all evidence-backed, all narrow.

Per the active plan, these runtime changes invalidate implementation
SHA `b5166320768355666a5c4ff3f466c29c240ea8cf`. A new RC is required
with an explicit user-authorized commit, owner/participant observation
windows restarted, and same-SHA F1–F4 re-executed. None of those
gates are part of this slice.

---

## 6. References

- Plan: `docs/superpowers/plans/2026-07-20-v0-domestic-oj-capture-stabilization.md`
- Fixture corpus:
  - `tests/fixtures/leetcode/{README.md, submission-726110110-ac.{html,meta.json}}`
  - `tests/fixtures/nowcoder/{README.md, submission-84104369-ac.{html,meta.json}}`
  - `tests/fixtures/luogu/authenticated/{README.md, record-287273601-p1001-ac.{html,meta.json}, record-287272767-p1001-ce.{html,meta.json}}`
- Source code:
  - `extension/src/platforms.ts` (`PLATFORM_ADAPTERS`, `DOMESTIC_ROUTES`,
    `detectProblemFromDomesticSubmissionPage`, `extractLuoguRecordRowText`,
    `verdictFromText`, `containsStandaloneChineseToken`)
  - `extension/src/submissionControl.ts` (`SUBMIT_LABELS_BY_PLATFORM`,
    `isExactSubmitControl` Luogu anchor promotion)
  - `tests/helpers/platformFixtureMetadata.ts`
    (`NONCERTIFYING_EVIDENCE_TIERS`, `ALL_EVIDENCE_TIERS`,
    `isNoncertifyingEvidence`, `authenticated-characterization` schema rule)
- Focused tests: `tests/unit/extensionDomesticOjAuth.test.ts` (133 tests)

---

## 7. Verification and review

Latest uncommitted-worktree evidence on 2026-07-20:

- `npm run quality:gate` — PASS: 65 unit files / 1008 passed / 1 Windows
  file-symlink capability skip; 24 Playwright E2E; 18 extension files / 457
  passed; strict lint, disposable migration, curriculum validation, typecheck,
  extension build/parity, and production Next.js build passed.
- Independent code review — APPROVED after fixing content-script reachability
  for LeetCode.cn/NowCoder result routes and rejecting hidden, ambiguous,
  overlong, nested, or control-bearing problem-title anchors.
- `git diff --check` — PASS; line-ending conversion notices are warnings, not
  content errors.

The Playwright domestic-platform tests use direct local capture events and do
not load the unpacked extension. Detector behavior is proven by the sanitized
fixture suites and manifest-to-runtime unit contracts, while true user-driven
submission transitions remain unobserved.
