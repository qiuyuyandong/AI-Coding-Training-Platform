# V4 Phase D Task 16 LeetCode automated engineering observation

Date: 2026-08-10  
Branch: `feature/v1-followup`  
Immutable implementation candidate: `f18eddf4cb4d7dd24c439b2dea5917793839e6a2`  
Documentation HEAD at entry: `e4b863a98c43e95047e65d6ea339bf7b16cd8007`

## Classification

This work is a real-platform automated engineering observation. It is not a
natural user submission, user acceptance, an RC, or a release.

## Frozen artifact preflight

Immediately before the platform action, the candidate-to-HEAD runtime diff was
empty and the production artifact hashes matched the Task 15 freeze:

```text
manifest.json         22B1FBEAC7FEAC799C159D5A5D295700F7FEF5A395C40F1A39168EA9E0293D08
background.js         4575A8BC67F4775D78AC5756DDED77B70FC905E2AE6953B90C3E9896369DCE7B
content.js            C68465D60D21F6B74A7A081ED6E053DC1FB968B93871A7EE3D7500ABD997CD3B
popup.js              3D164737873BB36A522300FC4B92829C419A3EAEC4CACDC0CF111A91497CF478
main-world-bridge.js   4D89A80F0351295EE1C0CD173BE107080983868D18510D028854695EACEE3943
```

The isolated service used
`.tmp/task16-leetcode/training-platform.sqlite`. Before the platform action it
contained zero `capture_events`, zero `training_sessions`, and zero
`training_attempts`. The extension paired successfully with that service.

## Aborted privacy preflight

An initial full-page diagnostic screenshot unintentionally included the visible
editor. It was not saved to the repository, parsed, copied, or used to choose
the submission. That preflight was explicitly aborted and is not counted as
Task 16 evidence. The subsequent attempt used only exact submit-control and
first-party verdict locators and did not inspect editor or problem text.

## Attempt 1 — failed, not D4 PASS

The automation opened the retained historical submission
`cn/741081653`, verified only its narrow first-party verdict value (`通过`),
and verified that one exact enabled `提交` button was present. It clicked that
button once. LeetCode navigated to the fresh submission
`cn/741314390`, whose narrow first-party verdict became `通过`.

The local delivery chain did not run:

```text
POST /api/capture/attempts: 0
capture_events:             0
training_sessions:          0
training_attempts:          0
```

The user-provided popup screenshot then reported these safe scalar states:

```text
capture enabled:  true
paired:           true
waiting:          2
outbox:           0
quarantine:       0
last sync:        none
last error:       epoch_target_delivery_failed
```

This proves that network confirmation reached durable E2 state, while the new
exact submit-epoch `STARTED`/`CONFIRMED` control could not reach a matching
content runtime. The absence of an outbox item, quarantine item, capture POST,
or SQLite projection means this attempt is a hard failure and must not be
reported as D4 delivery evidence.

No repeated submission was issued after the failure. The failed observation
environment and its zero-row database are retained. A clean retry requires an
exact-artifact content runtime loaded after the extension instance and a clean
extension/database observation baseline; it must not reuse these two waiting
records as PASS evidence.

## Attempt 2 — clean reproduction, failed, not D4 PASS

The old extension instance was disabled without deletion. A new instance
`pdpnfigfaonkljaofocndcmmnbmfeaab` was loaded from
`.tmp/task16-fresh-exact-dist`, whose five frozen files were individually
SHA-256-identical to `extension/dist`. The user confirmed it was the only
enabled capture extension. Its popup initially showed unpaired, waiting `0`,
outbox `0`, quarantine `0`, and no blocking diagnostic.

A second fresh service used
`.tmp/task16-leetcode-clean/training-platform.sqlite`. The new extension paired
successfully as installation
`installation_52624c85-a1be-4008-8692-f07c3f5f1fa2`; the three capture tables
were zero before the action. The LeetCode page was fully refreshed after the
new instance was loaded. Automation verified only residual first-party verdict
`Accepted` and one enabled exact submit button, then clicked once. LeetCode
created fresh submission `cn/741318477`, whose narrow verdict became
`Accepted`.

The clean service again received zero capture POSTs and retained zero capture
events, sessions, and attempts. The fresh-instance popup reported:

```text
capture enabled:  true
paired:           true
waiting:          1
outbox:           0
quarantine:       0
last sync:        none
last error:       epoch_target_delivery_failed
```

This second failure excludes stale extension storage, a duplicate active
instance, pairing, localhost, database contamination, and a missed page
refresh. The causal RED then exposed the complete defect chain: the real
top-level route lacks content-runtime manifest coverage and strict DOM-owned
problem identity, and `locationObserved()` unconditionally clears every armed
epoch during the same-document SPA result transition. The approved repair must
preserve an epoch only after strict post-navigation detection proves the same
platform/problem identity; all other navigation outcomes remain fail-closed.
No third submission is authorized until the revision-4 causal RED,
implementation, full gate, reviews, and new immutable-candidate freeze
complete.
