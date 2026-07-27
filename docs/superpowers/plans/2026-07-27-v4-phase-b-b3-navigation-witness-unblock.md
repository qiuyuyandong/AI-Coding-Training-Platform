# V4 Phase B B3 Navigation Witness Unblock

**Status:** Approved for implementation on 2026-07-27. This plan unblocks only
the B3 browse-only negative transcript. It does not start B4 or infer any
NowCoder submission protocol.

## Problem

The authorized B3 observation kept waiting at zero but retained no E1 records.
The B1 transcript contract correctly rejects empty evidence, and an empty
diagnostic session cannot claim that a navigation occurred.

## Decision

Add a diagnostic-only E0 `navigation_witness` evidence kind. It proves that the
extension observed the exact authorized contest list then problem document while
retaining only Chrome document identity and a fixed page class.

- Do not add `webNavigation` permission.
- Do not retain raw URLs, paths, query strings, fragments, page text, code,
  headers, cookies, credentials, or account identity.
- The content script sends only a constant message. The background synchronously
  validates and classifies `MessageSender` before queuing work, so `sender.url`
  never enters a closure, storage, fixture, log, or error.
- E0 witnesses are transcript/diagnostic-only. They cannot reach the production
  evidence parser, state machine, confirmed storage, outbox, API, or SQLite.

## Exact Scope

The background accepts only main-frame sender URLs on `https://ac.nowcoder.com`
with no credentials, query, or fragment and one of:

- `/acm/contest/18839` (or trailing slash): `contest_list`
- `/acm/contest/18839/1001` (or trailing slash): `contest_problem`

The manifest match is limited to those two routes. The background, not the
content script, performs the classification.

## Export Gate

A browse-only negative export requires one active, unexpired session with:

1. zero E1 diagnostic records;
2. a `contest_list` witness followed by `contest_problem`;
3. the same tab, main frame, distinct document IDs; and
4. no duplicate or cross-session witness.

The export contains exactly those two E0 records and one E0 signal. Empty
sessions, direct problem loads, wrong order, cross-tab/frame, malformed sender,
expiry, reload, and stop fail closed.

## Implementation

1. Add strict E0 transcript evidence and tests while preserving E1/E2/E3 rules.
2. Add session-only bounded navigation witnesses and pure export pairing logic.
3. Add a constant content message and synchronous background sender classifier.
4. Extend popup export validation only as needed for the expanded strict schema.
5. Add contract, storage, content/background, fixture, and production-isolation
   tests, including invalid diagnostic-start regression coverage.
6. Run the extension gate and independent privacy review.

## Real Observation Gate

No existing B3 observation can be retroactively converted. After engineering
and review pass, obtain explicit commit authorization, commit the implementation
to establish an immutable SHA, rebuild the exact artifact, then obtain/confirm
authorization to repeat the browse-only observation. Only then may B3 be marked
PASS and B4 be considered.
