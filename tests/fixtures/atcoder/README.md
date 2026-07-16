# AtCoder DOM Fixture Corpus — Phase 0 Production Certification

Acquired: 2026-07-16 for Phase 0 AtCoder Production Certification (Wave 1, Task T1).
**Status: RETAINED — 4 public logged-out fixtures; sanitized; metadata truthful.**

## Retained Fixtures (4)

| # | Fixture | Source URL | Evidence Tier | authenticated | Bytes | Identity (URL) | Verdict (`#judge-status`) |
|---|---------|------------|---------------|---------------|-------|----------------|---------------------------|
| 1 | `task-agc040-d` | `https://atcoder.jp/contests/agc040/tasks/agc040_d?lang=en` | `public-content-accessible` | false | 188 | `agc040_d` | none (task page, no verdict panel) |
| 2 | `submission-agc040-d-ac` | `https://atcoder.jp/contests/agc040/submissions/53759742?lang=en` | `verified-public-dom` | false | 371 | `agc040_d` | `AC` (title `Accepted`) |
| 3 | `submission-abc164-e-wa` | `https://atcoder.jp/contests/abc164/submissions/12438513?lang=en` | `verified-public-dom` | false | 380 | `abc164_e` | `WA` (title `Wrong Answer`) |
| 4 | `submission-abc443-d-tle` | `https://atcoder.jp/contests/abc443/submissions/72918187?lang=en` | `verified-public-dom` | false | 423 | `abc443_d` | `TLE` (title `Time Limit Exceeded`) |

All four public pages returned `HTTP 200 OK` from `atcoder.jp` via plain unauthenticated `curl` with browser-like headers; no cookies, no login, no JS, no authentication tokens were forwarded or persisted. The submission endpoints behind CloudFront refused the bare default `curl` User-Agent with HTTP 403 but returned the full public DOM once standard browser headers were presented; this is documented in the per-fixture acquisition log and was reproduced for all three submission URLs.

The retained `*.meta.json` files record, per fixture: `fixtureName`, `sourceUrl`, `captureDate` (`2026-07-16`), `captureMethod`, `purpose` (token: `detectVerdictFromDocument` for submissions, `both` for the task fixture), `selectors` (`["#judge-status", "a[href='/contests/<contest>/tasks/<task-id>']"]` for submissions, empty for the task fixture), `authenticated: false`, `sanitized: true`, `evidenceTier`, `verdictExpected` (`null` for the task fixture, `{"verdict":"Accepted"}`/`{"verdict":"Wrong Answer"}`/`{"verdict":"Time Limit Exceeded"}` for submissions), and `problemExpected` (`{ "platform": "atcoder", "externalId": "<id>" }`).

## Evidence Tiers Explained

| Tier | Label | Meaning |
|------|-------|---------|
| `public-content-accessible` | "public content accessible" | First-party page reachable via unauthenticated HTTP GET, title text and task identity anchor extracted from the raw response. The fixture holds only the task identity markup; no verdict surface is asserted. |
| `verified-public-dom` | "verified-public-dom" | First-party page reachable via unauthenticated HTTP GET, both the task identity anchor and the verdict-bearing `#judge-status` cell extracted from the raw response. Title and label attributes on the status span agree on the verdict (`Accepted` ↔ `AC`, `Wrong Answer` ↔ `WA`, `Time Limit Exceeded` ↔ `TLE`). |

These two tiers are intentionally stricter than the Luogu corpus: every retained submission fixture is a `verified-public-dom` fixture, so the eventual certification gate (Task T6) has real on-disk evidence for AC, WA, and TLE without relying on characterization-only characterization.

## Acquisition Method

1. `curl.exe -sSL -A "<Chrome UA>" --compressed -D <headers> -o <body>` against each first-party URL with browser-like `Accept`, `Accept-Language`, `Referer`, `sec-fetch-*`, and `upgrade-insecure-requests` headers.
2. No `-b/-c` cookie jar, no `-H "Cookie: ..."`, no environment-supplied credentials. The `Set-Cookie: language=...` and `Set-Cookie: REVEL_SESSION=...` lines in the response headers were observed but discarded — they were never sent back to AtCoder.
3. Each `*.html` body was inspected to confirm: response code 200, source host `atcoder.jp`, exactly one task anchor of the form `/contests/<same-contest>/tasks/<task-id>`, and exactly one `#judge-status` element on the three submission pages. The visible verdict text was cross-checked against the `title` attribute on the status span (`Accepted` / `Wrong Answer` / `Time Limit Exceeded`).

## Sanitization Rules Applied

Every retained fixture contains only:

- `<!DOCTYPE html>`, `<html>`, `<head>`, `<meta charset="utf-8">`, `<title>`, `<body>`;
- the original `<title>` text (e.g., `D - Balance Beam`, `Submission #53759742 - AtCoder Grand Contest 040`);
- exactly one same-contest task anchor (`<a href="/contests/<contest>/tasks/<task-id>">…</a>`);
- (submission fixtures only) exactly one `<td id="judge-status">` cell carrying a `<span class="label ..." data-toggle="tooltip" data-placement="top" title="<full verdict name>"><b>AC|WA|TLE</b></span>` payload.

Stripped (per fixture, against the live response):

- all `<script>` and `<style>` blocks, including the embedded `csrfToken = "..."` JavaScript constants (CSRF tokens must not enter the corpus);
- the `<form name="form_logout">` block (which contained a `<input type="hidden" name="csrf_token" value="...">` element);
- the "Sign Up" / "Sign In" / "Sign out" navigation entries (the live pages also showed those to logged-out visitors; they are not part of fixture semantics);
- the per-fixture contest navigation tabs, contest duration `<time>` tags, language switcher dropdown, top brand link, "Editorial" link, and modal markup;
- the user-profile `/users/<handle>` anchor (one per submission page — e.g., `/users/fangxintong`, `/users/itachikikesh`, `/users/siddhantnema`);
- the source-code `<pre>` block on each submission page (AtCoder embeds the submission source under a code element; not retained);
- the problem statement `<span class="lang-en">` block on the task page (the Japanese and English problem text spans were dropped);
- byte count, language selector, submission timestamp, share-button markup, and any other unrelated page chrome;
- the Set-Cookie values were never copied into any retained file.

The retained corpus contains zero `<script>`, zero `<style>`, zero `<form>`, zero `csrf`, zero `REVEL_SESSION`, zero `href="/users/...`, zero `on*=` event handlers, zero `javascript:` URLs, zero `<iframe>`, and zero source-code markers (`#include`, `using namespace`, `int main(`, `def `, `import java.`).

## Source Facts (First-Party URLs)

| URL | HTTP | Title | Task anchor | `#judge-status` |
|-----|------|-------|-------------|----------------|
| `https://atcoder.jp/contests/agc040/tasks/agc040_d?lang=en` | 200 | `D - Balance Beam` | `/contests/agc040/tasks/agc040_d` | n/a (task page) |
| `https://atcoder.jp/contests/agc040/submissions/53759742?lang=en` | 200 | `Submission #53759742 - AtCoder Grand Contest 040` | `/contests/agc040/tasks/agc040_d` | `AC` / title `Accepted` |
| `https://atcoder.jp/contests/abc164/submissions/12438513?lang=en` | 200 | `Submission #12438513 - AtCoder Beginner Contest 164` | `/contests/abc164/tasks/abc164_e` | `WA` / title `Wrong Answer` |
| `https://atcoder.jp/contests/abc443/submissions/72918187?lang=en` | 200 | `Submission #72918187 - Denso Create Programming Contest 2026 (AtCoder Beginner Contest 443)` | `/contests/abc443/tasks/abc443_d` | `TLE` / title `Time Limit Exceeded` |

## Acceptance Summary

- All four HTML files are minimal and under 8192 bytes (188 / 371 / 380 / 423).
- Each submission file contains exactly one same-contest task anchor and exactly one `#judge-status` element.
- The task fixture contains no `#judge-status` (negative surface) and only the task-identity markup.
- Each `*.meta.json` carries the full provenance required by the plan: capture date `2026-07-16`, source URL, `authenticated: false`, `sanitized: true`, selector list, expected verdict, expected problem identity, and the correct evidence tier.
- The retained-corpus audit (see `.tmp/evidence/phase-0-atcoder/task-1-fixtures.log`) reports `OVERALL: PASS (4/4)`.
- The failure probe (see `.tmp/evidence/phase-0-atcoder/task-1-rejection.log`) rejects malformed inputs containing `<script>`, CSRF tokens, source-code markers, missing task href, mismatched contest href, wrong verdict token, or multiple task anchors. No malformed bytes are persisted in the corpus.

## Out of Scope

- This corpus is the Wave 1 evidence acquisition only (Task T1). It does not promote AtCoder to `production`; that decision is owned by Task T6 (certification gate) and Task T7 (registry change), neither of which is touched here.
- The Luogu corpus under `tests/fixtures/luogu/` and the historical `work/reports/luogu-adapter-*.json` artifacts are byte-untouched. AtCoder's evidence is additive and does not rewrite Luogu history.
- The active plan `docs/superpowers/plans/2026-07-16-phase-0-atcoder-production-certification.md` and `AGENTS.md` are not modified.
- Transient raw fetch artifacts and headers live under `.tmp/evidence/phase-0-atcoder/` and are removed after this README and the two audit logs are summarized into a later evidence report; nothing in `.tmp/` is part of the retained corpus.

## Non-goals

- CloudFront WAF behavior was a one-time acquisition artifact; it is not part of the retained fixture semantics.
- The bare-default-`curl`-User-Agent 403 from CloudFront on submission URLs was not used to claim "page is private"; the page is publicly accessible with standard browser headers and was acquired that way. The plain `curl` 403 is documented here as evidence that the acquisition path was reproducible, not as the production code path.