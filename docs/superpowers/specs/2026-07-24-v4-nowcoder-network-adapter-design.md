# V4 NowCoder Experimental Network Adapter Design

**Status:** approved for experimental implementation from the authenticated
fixture `nowcoder-submission-chain-2026-07-28.json`.

**Maximum claim:** NowCoder V4 experimental pilot. This design cannot promote
NowCoder to production.

## Request matcher

- Exact host: `ac.nowcoder.com`
- Submit E1: `POST /nccommon/submit_cd`, resource type
  `xmlhttprequest`
- Confirmation E1: `GET /nccommon/status`, resource type
  `xmlhttprequest`
- Other hosts, paths, methods, resource types, redirects, errors, canceled
  requests, and non-200 completion states do not confirm a submission.

## Business-success predicate

HTTP 200 from `/nccommon/submit_cd` is necessary but never sufficient. E2
requires exactly one completed 200 submit E1 in the same tab, frame, and
document followed within 5 seconds by one completed 200 status E1. The status
URL must contain exactly one `submissionId` query field whose value is a
1-20-digit decimal string.

The other observed status query fields (`_`, `subTagId`, `tagId`) are not read
or retained. A business rejection, canceled/error request, malformed ID,
missing status poll, multiple eligible submit candidates, crossed document, or
expired window remains unconfirmed.

## Stable ID extractor

- Field: `submissionId`
- Type: decimal string
- Grammar: `^[0-9]{1,20}$`
- Source: query field on the exact `/nccommon/status` request
- Request and response bodies are not required and remain forbidden.

## Problem identity

The experimental pilot recognizes the exact characterized problem route
`/acm/contest/18839/1001` as
`acm/contest/18839/1001`. An E0 hint may provide this identity but cannot
create waiting. The E0, submit E1, and status E1 must share tab/frame/document
identity.

## Correlator window

The status confirmation must occur no earlier than the submit completion and no
later than 5 seconds afterward. Zero candidates produce no match. More than one
eligible submit or problem candidate produces ambiguity and waiting remains
zero. There is no nearest-request fallback.

## E2 signal

E2 requires the full business-success predicate above. It references the status
E1, records the stable submission ID, and records the exact problem identity.
Duplicate E2 for the same `nowcoder:<submissionId>` is idempotent.

## Final-verdict identity rule

E3 requires:

- exact host `ac.nowcoder.com`;
- exact path `/acm/contest/view-submission`;
- exactly one `submissionId` query field matching the confirmed ID;
- the same problem identity resolved from one exact
  `/acm/contest/18839/1001` anchor;
- one visible `.coder-cont-legend` candidate normalized by the existing closed
  verdict taxonomy.

Historical or other-ID pages cannot consume confirmed state. Judging or unknown
text is not final.

## Retained safe fields

Only platform, exact normalized endpoint key, method, resource type, status
code, request ID, tab/frame/document identity, timestamps, problem identity,
stable submission ID, and normalized final verdict are retained.

Forbidden data includes request/response bodies, raw URL query strings, headers,
cookies, authorization, CSRF values, tokens, credentials, source code, account
identity, complete statement text, and unrestricted DOM text.

## Fail-closed cases

- UI hint without both characterized requests
- submit request without a valid status request
- status request without exactly one preceding submit candidate
- non-200, redirect, canceled, or errored lifecycle
- malformed, duplicate, missing, or oversized `submissionId`
- tab/frame/document mismatch
- confirmation outside the 5-second window
- multiple candidates
- forged bridge summary without unique E1
- final verdict with a missing, different, or malformed ID
- verdict page with zero or multiple problem identities

## Known unknowns

- Authenticated characterization is non-certifying.
- Failure payloads and response bodies were deliberately not inspected.
- The pilot supports only the characterized contest problem route.
- Rate limits, login failures, and repeated real submissions were not forced.
- NowCoder remains `experimental`; all uncharacterized routes remain
  fail-closed.
