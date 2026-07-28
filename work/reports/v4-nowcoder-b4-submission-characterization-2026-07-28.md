# NowCoder V4 B4 Submission Characterization

**Date:** 2026-07-28

**Build SHA:** `5cf9429acb533983e80b8b8b90d2792412cfc445`

**Result:** `PASS` for B4 authenticated characterization. This is not
production certification, adapter promotion, release acceptance, or B8
same-build observation.

## Authorized observation

- Host: `ac.nowcoder.com`
- Browse route: `/acm/contest/18839` then `/acm/contest/18839/1001`
- Authentication: user completed the interactive login
- Real submissions: exactly one
- Source handling: the agent supplied a minimal 42-character program without
  reading user code or the problem statement
- Diagnostic export: 14 safe B1 records; strict validator passed

## Safe observed chain

1. The exact visible enabled control labelled `保存并提交` triggered the real
   user-authorized submission.
2. `POST /nccommon/submit_cd` completed with HTTP 200.
3. About 1.4 seconds later, `GET /nccommon/status` completed with HTTP 200 in
   the same tab, frame, and browser document.
4. The status request exposed query field names `_`, `subTagId`,
   `submissionId`, and `tagId`. Only the allowlisted numeric
   `submissionId=84257292` scalar was retained; every other query value was
   discarded.
5. The public result route
   `/acm/contest/view-submission?submissionId=84257292` showed one final
   allowlisted verdict, `答案错误`, and linked back to the authorized problem
   path `/acm/contest/18839/1001`.

## Evidence-backed policy facts

- Submit request: exact host `ac.nowcoder.com`, path
  `/nccommon/submit_cd`, method `POST`, resource type `xmlhttprequest`.
- Server-confirmation request: exact host `ac.nowcoder.com`, path
  `/nccommon/status`, method `GET`, resource type `xmlhttprequest`.
- Stable identity: required query field `submissionId`, decimal string with
  1-20 digits.
- Problem identity: exact authorized page path
  `acm/contest/18839/1001`.
- Final identity: exact public result route with the same `submissionId`.
- Final verdict surface: one visible `.coder-cont-legend` containing one
  recognized final verdict.
- Request body, response body, headers, cookies, credentials, tokens, source
  code, account identity, and full problem statement are unnecessary and were
  not retained.

## Fail-closed interpretation

- `POST /nccommon/submit_cd` alone never creates E2.
- HTTP 200 alone never creates E2.
- E2 requires one unique preceding submit E1 in the same tab/frame/document
  and a following successful `/nccommon/status` request with one valid
  `submissionId`.
- Missing, malformed, multiple, stale, crossed-document, canceled, errored, or
  non-200 signals remain unconfirmed.
- A result page with another ID cannot consume the confirmed submission.

## Validation

```text
node scripts/validate-v4-network-transcript.mjs tests/fixtures/nowcoder/network/nowcoder-submission-chain-2026-07-28.json
V4 network transcript fixture PASS
```

The raw characterization download remains outside the repository. The retained
fixture contains only the two relevant E1 records and the derived E2.
