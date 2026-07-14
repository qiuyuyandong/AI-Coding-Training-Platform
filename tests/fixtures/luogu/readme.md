# Luogu DOM Fixture Corpus — Partial

Acquired: 2026-07-14 for Phase 0B4 Luogu Adapter Certification (Task 0).
**Status: PARTIAL/BLOCKED — verdict fixtures omitted per Commander hard rule.**

## Retained Fixtures (4)

| # | Fixture | Evidence Tier | authenticated | Purpose |
|---|---------|--------------|---------------|---------|
| 1 | `problem-p1001` | public-content-accessible | false | `detectProblemFromLocation` → luogu/P1001 |
| 2 | `problem-b3619` | public-content-accessible | false | `detectProblemFromLocation` → luogu/B3619 |
| 3 | `problem-cf-1a` | public-content-accessible | false | `detectProblemFromLocation` → luogu/CF_1A (letter-prefix variant) |
| 4 | `no-verdict-problem` | characterization-derived | false | `detectVerdictFromDocument` → null (negative) |

## Evidence Tiers Explained

| Tier | Label | Meaning |
|------|-------|---------|
| `public-content-accessible` | "public content accessible" | Problem page URL was reachable via public HTTP (Jina Reader API returned HTTP 200 with valid title). Title text was extracted from the API response. However, raw DOM was NOT observed — these are title-only fixtures. `authenticated: false` means no login was required to access the page; it does NOT mean the DOM was verified. |
| `characterization-derived` | "characterization-derived" | Fixture was derived from structural knowledge (e.g., "problem pages do not contain verdict panels") rather than from captured DOM. No DOM was observed. Not `verified-against-public-DOM`. |

## Omitted Fixtures

The following 8 verdict fixtures were omitted per the Commander hard rule (public DOM unavailable → do not fabricate):

- `verdict-accepted` — requires live DOM with `.status` containing "Accepted"
- `verdict-accepted-chinese` — requires live DOM with `.status` containing "答案正确"
- `verdict-wa` — requires live DOM with `.status` containing "Wrong Answer"
- `verdict-re` — requires live DOM with `.status` containing "Runtime Error"
- `verdict-tle` — requires live DOM with `.status` containing "Time Limit Exceeded"
- `verdict-mle` — requires live DOM with `.status` containing "内存超限"
- `verdict-ce` — requires live DOM with `.status` containing "编译错误"
- `verdict-partial` — requires live DOM with `.status` containing "部分通过"

All Luogu record pages (`luogu.com.cn/record/*`) require authentication. No public verdict DOM surface was found.

## Source Facts (Jina Reader API)

| URL | Jina HTTP | Title Extracted |
|-----|-----------|----------------|
| `luogu.com.cn/problem/P1001` | 200 | "P1001 A+B Problem" |
| `luogu.com.cn/problem/B3619` | 200 | "B3619 10 进制转 x 进制" |
| `luogu.com.cn/problem/CF_1A` | 200 | "CF1A Theatre Square" |
| `luogu.com.cn/problem/AT_abc001_a` | 200 (404 page) | "Error - 洛谷" (not found) |
| `luogu.com.cn/record/list?pid=P1001` | 200 (login wall) | "登录账号" (login required) |

## Sanitization

All retained fixtures contain only a `<title>` element — the only markup confirmed by the Jina response. No invented wrappers, body content, selectors, scripts, styles, or personal data.

## Remaining Blocker

**Production certification is BLOCKED** for verdict surfaces. Verdict DOM fixtures cannot be certified without public DOM evidence from a Luogu record page. The plan's Step 0.4 fallback path (`authenticated: true` characterization fixtures) was invoked but the Commander rejected it — fabricated fixtures are not permitted even with truthful metadata. Verdict certification requires either:
- A publicly accessible Luogu record page with visible verdict DOM; or
- A design decision to accept characterization-only verdict detection without DOM fixture coverage.

## Non-goals

- AT_abc001_a was not found (Luogu 404). Replaced with CF_1A.
- CDP was unavailable (Chrome remote debugging not enabled). No browser tabs were created.
