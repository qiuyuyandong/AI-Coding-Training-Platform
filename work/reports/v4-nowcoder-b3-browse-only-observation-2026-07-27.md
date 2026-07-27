# NowCoder V4 B3 Browse-Only Observation

**Date:** 2026-07-27

**Result:** `BLOCKED` — the authorized no-submit navigation completed with
waiting at zero, but worker-restart fail-closed cleanup prevented the required
strict two-E0 export.

## Authorized Scope

- Platform and page: `https://ac.nowcoder.com/acm/contest/18839/1001`
- Action: one browse-only observation; no submit control was clicked and no code
  was entered, changed, read, or submitted.
- Retention boundary: no request/response body, header, cookie, token, account
  identity, source code, or problem statement was retained.

## Build Identity

- Git HEAD / extension source SHA:
  `6862f462978352fda7ab1e90639a5c1fbd960810`
- Source state at reload: committed extension source; no extension source file
  changed between this SHA's build and the observation.
- Reloaded extension artifact hashes:
  - `extension/dist/background.js` SHA-256:
    `0F888E45CFEE379730DC012D617BE5625D20626E201CCFF35508141D8B9207CB`
  - `extension/dist/content.js` SHA-256:
    `84549508C587AE60E0C5BEEB7ACAED601AC75412CAAD52868E8A3464A0BEE243`
  - `extension/dist/popup.js` SHA-256:
    `FA8734E9BCED8E775840D1B98A2ACB0A9B9637AF7F7196F224C38393E7C3701A`

## Observation

1. The unpacked `Unified OJ Capture` extension was reloaded from the build of
   the SHA above. CDP used only three newly created background tabs
   (extensions manager, popup, and navigation); all were closed afterwards.
2. Popup diagnostic mode was explicitly started for `ac.nowcoder.com` with the
   authenticated-characterization checkbox enabled. Before navigation it showed
   waiting `0`, outbox `0`, quarantine `0`, and retained records `0/100`.
3. The navigation tab first opened `http://localhost:3000/resources`; Chrome
   returned `ERR_CONNECTION_REFUSED`. This created no waiting state.
4. The same main-frame tab then reached exactly `/acm/contest/18839`, followed
   by exactly `/acm/contest/18839/1001`. No submit control or code interaction
   occurred.
5. After the problem navigation, popup still displayed waiting `0`, outbox `0`,
   and quarantine `0`, but diagnostic mode was no longer enabled and export was
   disabled. No fixture was downloaded.

## Blocking Evidence

The B3 flow proves the negative waiting outcome within the authorized path, but
cannot produce the required retained fixture:

- During list-to-problem navigation the MV3 worker restarted/initialized. The
  B2 fail-closed initialization rule cleared the active session, so the E0 list
  witness could not persist to pair with the problem witness.
- The resulting popup state had no active session and disabled export. This is
  stricter than retaining a partial session, but prevents the B3 export gate.

No fixture, test, or adapter policy was fabricated. B4-B8 must not proceed
until a reviewed design reconciles fail-closed restart behavior with the
two-E0 export requirement, followed by a new immutable build and fresh explicit
browse-only authorization.
