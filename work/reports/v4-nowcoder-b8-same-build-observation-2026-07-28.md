# NowCoder V4 B8 Same-Build Real Observation

**Date:** 2026-07-28
**Observed implementation:** `05555ef`
**Verdict:** `BLOCKED`

## Safe observed facts

- Exact extension path: `extension/dist`; unpacked extension ID
  `aljppcgkcdbeemppmokcbjgcjdhapakh`.
- Browse-only list/problem navigation kept confirmed, outbox, quarantine, and
  disposable SQLite counts at zero.
- A trusted visible `button.btn-submit` labelled `保存并提交` generated one E0.
- The exact real network sequence generated one confirmed E2:
  `POST nowcoder/submit` 200 -> `GET nowcoder/status` 200, same
  tab/frame/document, stable submission ID `84258557`.
- The exact public result URL for that ID showed final verdict `答案错误`.
- No request/response body, headers, cookie, token, credential, account
  identity, source-code readback, or full problem statement was retained.

## Blocker

The real result document did not run the declarative content script, so the
visible final verdict never became E3. This remained true after:

1. direct result navigation and page reload;
2. MV3 worker/extension reload with confirmed state preserved;
3. stopping the CDP proxy, ordinary address-bar navigation, and ordinary
   `Ctrl+R`;
4. extension disable/enable recovery.

The exact fail-closed terminal state was:

- confirmed submissions: 1;
- tombstones: 0;
- outbox: 0;
- quarantine: 0;
- ambiguity diagnostics: 0;
- unmatched E3: 0;
- disposable SQLite: 0 capture events, 0 training sessions, 0 training
  attempts.

No manual/fabricated E3 was injected and no second result was written to the
local product.

## Channel recovery facts

The original CDP proxy process was terminated by exact PID and replaced.
Chrome displayed stacked `Allow remote debugging` prompts; the explicitly
authorized Allow controls were invoked, after which the replacement proxy
served targets normally. No `about:blank` page was intentionally opened during
the recovery sequence. The proxy remains running; disposable browser tabs were
closed, leaving only the user's result and remote-debugging tabs.

## Scope conclusion

B8 does not satisfy the same-build full-chain completion standard. B0-B7 remain
complete, and automated production-dist coverage still proves the synthetic
E0/E1/E2/E3/API/SQLite path, but the real NowCoder pilot is terminally
`BLOCKED`. NowCoder remains experimental and must not be promoted, accepted, or
released.

The post-observation `npm run quality:gate` exited 0: 1844 unit tests passed
with 1 host-capability skip, 25 application E2E tests passed, 1116 extension
tests passed, 43 extension E2E tests passed with 1 documented historical skip,
and the production build succeeded. These automated gates do not replace the
missing real E3.
