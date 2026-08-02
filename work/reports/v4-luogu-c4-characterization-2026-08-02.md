# V4 Luogu C4 Characterization - 2026-08-02

## Result

`SANITIZED E1 TRANSCRIPT EXPORTED - TERMINAL CONTINUITY BLOCKER OBSERVED`

The user completed one natural Luogu P1001 submission while the exact
preflight production extension ran an authenticated, session-only Luogu
characterization window. The extension retained three lifecycle records for
one XHR `POST /fe/api/problem/submit/P1001`; one record carried HTTP status
200. The browser then landed on `/record/290292547` in a different browser
document. No retained redirect, `lastRecordId` request, record request,
navigation witness, or approved bridge bound that numeric record ID to the
submit E1.

This report is characterization evidence, not an adapter design, readiness
promotion, production certification, RC, acceptance, or release.

## Exact build and window

- Existing Chrome profile; installed extension id
  `aljppcgkcdbeemppmokcbjgcjdhapakh`.
- Manifest name `Unified OJ Capture`, version `0.1.0`; enabled with zero
  runtime warnings and explicitly reloaded before characterization.
- Preflight production artifact hashes:
  - `manifest.json`:
    `22b1fbeac7feac799c159d5a5d295700f7fef5a395c40f1a39168ea9e0293d08`;
  - `background.js`:
    `25b95082bbdfbb480d1b17b913bd6e2ca746a93c9dbe0b1c33f06cce150b45f9`;
  - `content.js`:
    `2e46ab79d2fe31853888aba919295caaf674055c96b0dc7c34ad64765070eef1`.
- Ready-gated window started at `2026-08-02T13:11:06.706Z` and was due to
  expire at `2026-08-02T13:16:06.706Z`.
- Immediately after arming: active `luogu` session, authenticated flag true,
  zero records, and zero navigation witnesses.
- The user prepared P1001, language, and source before the final window. The
  agent never read or modified language or source and never clicked Submit.
- The user clicked the final Submit control exactly once.
- Records changed from zero to one at `2026-08-02T13:11:52.309Z`, then to
  three at `2026-08-02T13:11:53.335Z`. The page pathname became
  `/record/290292547` at `2026-08-02T13:11:54.351Z`. Witnesses stayed zero.
- Export and stop both succeeded before expiry.

## Sanitized transcript

The exact exported fixture is
`tests/fixtures/luogu/network/luogu-characterization-2026-08-02.json`; its
safe observation metadata is adjacent in the `.meta.json` file.

All three entries share request ID `8116`, E1 document ID
`0B0F2A7605D410D910DF94BF4E01ADAE`, method `POST`, resource type
`xmlhttprequest`, and endpoint `/fe/api/problem/submit/P1001`. Their recorded
times are `2026-08-02T13:11:52.383Z`, `2026-08-02T13:11:52.379Z`, and
`2026-08-02T13:11:51.799Z`; the middle entry carries status 200.

Immediately after export and stop, browser-owned
`chrome.webNavigation.getFrame` state reported the outermost active frame at
origin `https://www.luogu.com.cn`, path `/record/290292547`, with current
document ID `4BA4F019442B690633DAF065F40513C7`. That ID differs from the E1
document ID. The numeric record ID is therefore corroborated only as the
landing pathname and is intentionally absent from the network transcript.

## Privacy boundary

No source code, form value, language, request or response body, header,
cookie, credential, CSRF value, account identifier, query value, fragment,
full problem statement, verdict, record-row content, execution time, memory,
test number, or IP address entered repository evidence. The only login signal
was a minimal boolean checked before arming. No identity was inferred from
latest/highest row, account, tab proximity, or timing.

The authoritative terminal disposition is
`work/reports/v4-luogu-c4-blocker-2026-08-02.md`.
