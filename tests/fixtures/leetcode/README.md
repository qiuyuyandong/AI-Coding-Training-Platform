# LeetCode.cn DOM Fixture Corpus — Authenticated Characterization

Acquired: 2026-07-20 for V0 domestic-OJ adapter characterization (Phase 0B4 follow-up).

**Status:** authenticated-characterization. NOT certifying. NOT production.

These fixtures were captured from a logged-in Chrome session on the user's
explicit authorization. They contain only the absolute minimum DOM needed to
exercise `detectProblemFromPage` and `detectVerdictFromDocument` for the
LeetCode.cn submission and problem routes. They never satisfy the public-DOM
certification gate.

## Capture method

- Browser: user-authorized logged-in Chrome (cookies present in the live
  session, intentionally never captured to disk).
- Method: visible-DOM scrape with manual user authorization. No automated
  submission, no recorded flow, no retained source code.
- Sanitization: scripts, styles, forms, problem statements, submitted source,
  usernames, timestamps, language, memory, code length, and every other
  user-identifying field were stripped before writing.
- Source URL and submission ID are public and retained.

## Retained fixtures (1)

| # | Fixture | Evidence Tier | Purpose | Detected Platform/ExternalId |
|---|---------|---------------|---------|-------------------------------|
| 1 | `submission-726110110-ac` | authenticated-characterization | `detectProblemFromPage` + `detectVerdictFromDocument` | `leetcode` / `find-the-prefix-common-array-of-two-arrays` / Accepted |

The observed problem-page submit control is represented by an inline minimized
DOM case in `tests/unit/extensionDomesticOjAuth.test.ts`; it is not presented as
a verdict fixture because no verdict exists on that surface.

## Selector provenance

| Selector | Page | What it resolves |
|----------|------|------------------|
| `[data-e2e-locator="submission-result"]` | LeetCode.cn submission detail | Final-verdict node (e.g. "通过", "Wrong Answer") |
| `a[href="/problems/<slug>/"]` | LeetCode.cn submission detail | Unique first-party problem anchor for record-resolution |
| `button[data-e2e-locator="console-submit-button"]` | LeetCode.cn problem page | Submit control with visible label "提交" |

## Missing evidence

- Non-AC verdict (Wrong Answer / Time Limit Exceeded / Memory Limit
  Exceeded / Runtime Error / Compile Error) for LeetCode.cn: no own non-AC
  verdict evidence was observed during this capture session. The
  evidence-matrix report (`work/reports/v0-domestic-oj-authenticated-characterization-matrix.md`)
  records this honestly. Do not infer, fabricate or import non-AC
  fixtures.
- The user explicitly approved only the public submission and the problem
  page; no submit attempt, no form submission, no editor buffer, no
  verdict transition was recorded.

## Non-goals

- Production certification. authenticated-characterization is non-certifying
  by design; see `tests/helpers/platformFixtureMetadata.ts`.
- AtCoder/Codeforces/NowCoder/Luogu behaviour. This corpus is scoped to
  LeetCode.cn only.
