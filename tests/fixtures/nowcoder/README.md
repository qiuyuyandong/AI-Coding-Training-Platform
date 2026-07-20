# NowCoder DOM Fixture Corpus — Authenticated Characterization

Acquired: 2026-07-20 for V0 domestic-OJ adapter characterization (Phase 0B4 follow-up).

**Status:** authenticated-characterization. NOT certifying. NOT production.

These fixtures were captured from a logged-in Chrome session on the user's
explicit authorization. They contain only the absolute minimum DOM needed to
exercise `detectProblemFromPage` and `detectVerdictFromDocument` for the
NowCoder ac.nowcoder.com view-submission and problem routes.

## Capture method

- Browser: user-authorized logged-in Chrome.
- Method: visible-DOM scrape with manual user authorization. No automated
  submission, no recorded flow, no retained source code.
- Sanitization: scripts, styles, forms, problem statements, submitted source,
  usernames, timestamps, language, memory, code length, and every other
  user-identifying field were stripped before writing.
- Source URL and submission ID are public and retained.

## Retained fixtures (1)

| # | Fixture | Evidence Tier | Purpose | Detected Platform/ExternalId |
|---|---------|---------------|---------|-------------------------------|
| 1 | `submission-84104369-ac` | authenticated-characterization | `detectProblemFromPage` + `detectVerdictFromDocument` | `nowcoder` / `acm/problem/319811` / Accepted |

The observed problem-page submit control is represented by an inline minimized
DOM case in `tests/unit/extensionDomesticOjAuth.test.ts`; it is not presented as
a verdict fixture because no verdict exists on that surface.

## Selector provenance

| Selector | Page | What it resolves |
|----------|------|------------------|
| `.coder-cont-legend` | NowCoder view-submission | Verdict container with `<span class="font-green">答案正确</span>` inside |
| `a[href="/acm/problem/<id>"]` | NowCoder view-submission | Unique first-party acm problem anchor for record-resolution |
| `button.btn-submit` | NowCoder problem page | Submit control with visible label "保存并提交" |

## Removed selectors (not evidence-backed)

The previously-registered `.result`, `.submission-result`, `.judge-result`
NowCoder selectors matched **zero** observed nodes during this capture; they
have been removed from the registry to keep it evidence-backed.

## Missing evidence

- Non-AC verdict for NowCoder: the only verdict observed during capture
  was "答案正确" (Accepted). The evidence-matrix report
  (`work/reports/v0-domestic-oj-authenticated-characterization-matrix.md`)
  records this honestly.

## Non-goals

- Production certification. authenticated-characterization is non-certifying
  by design; see `tests/helpers/platformFixtureMetadata.ts`.
- leetcode.com (English) NowCoder pages. This corpus is scoped to
  ac.nowcoder.com only.
