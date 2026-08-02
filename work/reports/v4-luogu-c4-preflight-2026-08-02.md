# V4 Luogu C4 Characterization Preflight Receipt

**Recorded at:** 2026-08-02T09:48:02.9473522Z

**Local time:** 2026-08-02T17:48:02.9523535+08:00

**Branch:** `feature/v1-followup`

**Base HEAD:** `a24e158448c3ccf3e1cde6e380e0c441eff87342`

**Working tree:** authorized C0-C4 work is uncommitted; no staged files, push,
PR, RC, acceptance, or release

**Plan:**
`docs/superpowers/plans/2026-08-02-v4-luogu-network-capture-migration.md`,
Revision 3

## Independent Plan Review

- Exact user verdict: `APPROVE Revision 3` on 2026-08-02.
- Receipt:
  `work/reports/v4-luogu-c4-plan-revision-3-approval-2026-08-02.md`.
- Revision 3 has zero unresolved BLOCKER, HIGH, MEDIUM, or LOW findings.
- Approved order: privacy prerequisite, focused gates and this immutable
  receipt, then one bounded user-owned natural Luogu P1001 submission.

## Privacy Prerequisite

The characterization normalizer now accepts Luogu path data only for the five
reviewed route forms:

- `/problem/<pid>`;
- `/fe/api/problem/submit/<pid>`;
- `/fe/api/record/lastRecordId`;
- `/record/<record-id>`;
- `/record/list`.

It enforces exact HTTPS `www.luogu.com.cn`, no credentials or non-default
port, no percent encoding/doubled slash, closed problem-ID and numeric-record
bounds, and the plan's trailing-slash rules. Account, user, team, contest,
training, discussion, article, chat, admin, testcase-download, IDE, login,
register, unknown, malformed, overlong, unsafe-origin, and unapproved redirect
paths fail before session storage. Query values and fragments are not retained.
This changes only the opt-in characterization boundary; it creates no Luogu
E1/E2/E3 policy and does not change the registry.

RED command:

```powershell
npx vitest run --no-file-parallelism tests/unit/extensionNetworkObserver.test.ts
```

RED result: exit 1; 152 tests discovered, 121 passed and 31 failed. Every
failure was a new Luogu rejection or redirect-privacy assertion. All reviewed
positive paths and existing platform cases passed.

GREEN focused command:

```powershell
npx vitest run --no-file-parallelism `
  tests/unit/extensionCharacterization.test.ts `
  tests/unit/extensionNetworkObserver.test.ts `
  tests/unit/extensionCharacterizationBackgroundIntegration.test.ts `
  tests/unit/extensionAdapterContract.test.ts `
  tests/unit/extensionPlatforms.test.ts `
  tests/unit/extensionDomesticOjAuth.test.ts `
  tests/unit/luoguFixtureLoader.test.ts `
  tests/unit/platformCertification.test.ts
```

GREEN result: exit 0; 8 files and 579/579 tests passed.

## Production Extension Gate

Command: `npm run extension:check`

- TypeScript typecheck: PASS.
- Extension tests: 39 files, 1,372/1,372 passed.
- Shared `UI_HINT_TTL_MS = 30_000` coverage: PASS through the existing
  extension UI-hint suite; no Luogu-specific TTL or hint implementation was
  introduced.
- Production extension build: PASS.
- Dist parity: PASS inside `extension:check`.
- Standalone `node scripts/check-extension-dist.mjs`: exit 0.
- Manifest version: `0.1.0`.

Exact production artifact SHA-256 values:

| File | SHA-256 |
| --- | --- |
| `extension/dist/manifest.json` | `22b1fbeac7feac799c159d5a5d295700f7fef5a395c40f1a39168ea9e0293d08` |
| `extension/dist/background.js` | `25b95082bbdfbb480d1b17b913bd6e2ca746a93c9dbe0b1c33f06cce150b45f9` |
| `extension/dist/content.js` | `2e46ab79d2fe31853888aba919295caaf674055c96b0dc7c34ad64765070eef1` |

Any extension source change, rebuild, reload from another artifact, hash
mismatch, or new pathname invalidates this receipt and requires the complete
preflight plus a new receipt.

## Historical AtCoder Evidence

All nine files under `tests/fixtures/atcoder/` match the pre-C2 frozen SHA-256
table in the C2 plan: 9/9, zero mismatch. Historical AtCoder DOM production
certification remains authoritative for its own scope; C2 network readiness
remains `blocked`.

## Historical Luogu Evidence Baseline

No path below is modified in the C4 working-tree diff. These hashes freeze the
historical public-DOM blocker, public fixtures, authenticated non-certifying
fixtures, and certification reports before the real C4 window:

| File | SHA-256 |
| --- | --- |
| `tests/fixtures/luogu/authenticated/README.md` | `3347d1f93de16f813c432d53c019360927d0170a16da7b7a33d3d58d3884699f` |
| `tests/fixtures/luogu/authenticated/record-287272767-p1001-ce.html` | `039cd740e67b8e2896ec1c4b87e5f681f5ca8dabd70baba8d41e69aca21e5171` |
| `tests/fixtures/luogu/authenticated/record-287272767-p1001-ce.meta.json` | `22bd1cf8ec5d19df111c6f56b451a21f5628e93ab4f0532aed453a138760757b` |
| `tests/fixtures/luogu/authenticated/record-287273601-p1001-ac.html` | `aa6334766a358d9c955a9dfbfba7f4dce8c54c0af2fd4b73c36f6c9f9e7239bc` |
| `tests/fixtures/luogu/authenticated/record-287273601-p1001-ac.meta.json` | `1ae5d247d307c3c81b37e42c8778c908e71873a88b6d6efda1cbd71d8533db43` |
| `tests/fixtures/luogu/no-verdict-problem.html` | `c74622a60b5f3b535aaed9feb373c5cbf1c100c35819911b05d7ad7ef118e786` |
| `tests/fixtures/luogu/no-verdict-problem.meta.json` | `ba43f1f32a6b7b1d55368a9cb0c2b3485e1ac5ccfa91f7e69652b82382a9a2e7` |
| `tests/fixtures/luogu/problem-b3619.html` | `fd9b6275380a0e1dc07f42a326c5329e04948ecbb859f1e4a5a14d3b29c27b55` |
| `tests/fixtures/luogu/problem-b3619.meta.json` | `ab8653798ded83e5beaabcde1df504c4bce752b9836d6ce5a388270aa3db4c05` |
| `tests/fixtures/luogu/problem-cf-1a.html` | `00cd37cec87edce63810f307645aa41cdf46ef74f68313719ce280fbe9105b51` |
| `tests/fixtures/luogu/problem-cf-1a.meta.json` | `c9b31d8e2d3cfd3f2b13a2f741f17dc7e46186e7a0eda1c7845ec0bc50c6b95b` |
| `tests/fixtures/luogu/problem-p1001.html` | `c74622a60b5f3b535aaed9feb373c5cbf1c100c35819911b05d7ad7ef118e786` |
| `tests/fixtures/luogu/problem-p1001.meta.json` | `a6de22f151ab9fc365dc118febfdefd071bb161a91f1d1bde6b288e7ddc3f09c` |
| `tests/fixtures/luogu/readme.md` | `bdc3b36fdbe1290fdbbf6c3e3dcf9f3bd4638636ee875ea87149709b4bd0a49e` |
| `work/reports/luogu-adapter-blocker.json` | `ed5174160a084a3f26c4a2decc6d2b2643733c007c20a3a991a99d7d4561b566` |
| `work/reports/certification-gate-verdict.json` | `fb43595b6b7cebe528f33f0e7a8fbcf6c71244ad6c0c421ecc0d7b56986ae570` |
| `work/reports/luogu-adapter-certification.json` | `540862f2bbb6591d05851c2cb9ace88c596b0003bd25ef874872b777b023b8f9` |

## Other Entry Gates

- `node scripts/validate-v4-adapter-readiness.mjs --all`: PASS against the
  current four-record manifest; Luogu remains registry-`uncharacterized`.
- `git diff --check`: exit 0; only existing LF-to-CRLF warnings.
- LeetCode, NowCoder, AtCoder, and Codeforces adapter behavior/status were not
  changed by the Luogu privacy prerequisite.
- No application migration, app E2E, extension E2E, aggregate quality gate,
  or Next.js production build was run in this preflight; those are terminal C4
  checks after implementation or blocker closeout.
- The default SQLite database was not opened, hashed, migrated, or modified.

## Authorization Boundary

## Existing Chrome Reload and Clean Start

After this receipt's build hashes were frozen, the already-open user Chrome
was checked through its extension-management UI:

- extension ID: `aljppcgkcdbeemppmokcbjgcjdhapakh`;
- name: `Unified OJ Capture`;
- version: `0.1.0`;
- location: unpacked;
- exact load path: `D:\Cowork\AI刷题训练平台\extension\dist`;
- state after one reload: `ENABLED`;
- runtime warnings reported by the extension card: 0.

The agent-created background page reached exact
`https://www.luogu.com.cn/problem/P1001` and observed only a boolean logged-in
marker; no account identity or page content was retained. The existing
characterization session was explicitly stopped. The safe status response was
inactive with zero records and zero navigation witnesses. No new session was
armed yet, so the five-minute clock has not started.

The agent-created `chrome://extensions` management tab was closed. The P1001
tab remains open only for the user to prepare their own source and language.
The agent will close it after characterization.

This receipt authorizes only the next Revision 3 step: load this exact
production artifact in the existing user Chrome, verify the same extension
identity and hashes, arm a bounded session-only characterization for
`www.luogu.com.cn`, confirm a clean zero-record start, and ask the user to
perform one natural P1001 submission. The user controls login, source,
language, optimization flags, CAPTCHA, and the final Submit action.

The watcher may retain only approved path/lifecycle/status/document scalars.
It must not read or retain source, bodies, form fields, headers, cookies,
credentials, CSRF/CAPTCHA values, account identity, query values, full problem
text, language, optimization flags, testcase data, time, memory, or code
length. Stop `V4_BLOCKED` if the sanitized transcript lacks a stable numeric
record ID, exact problem identity, or browser-document continuity.
