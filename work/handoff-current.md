# Current Handoff

## Status (2026-08-28 D8-A-R stopped at R4; no READY or submission)

The user bound every future real OJ submission test to the already
remote-debugged Chrome profile identified as `yu`, authorized the D8-A-R
root-cause revision, and granted one new LeetCode `merge-two-sorted-lists`
action only after R4 passed. NowCoder and retries were prohibited.

R0-R3 passed. The frozen observation-tool hash is
`7C64947398D8C91D92D68BD95CC703750633AD3F908BA26365BD1891F6ECA80E`;
the acceptance-profile hash is
`64455AC1DE043D30C44395675D37654EED44F13B0ABF24C9FC01E31D1BEC61A9`.
Immutable product candidate
`0c23fcacf18d2fe4113d803504e638c1aab887d3`, its exact dist and candidate
receipt `4EDA9DDD...F9AEE` are unchanged. Sentry was unavailable because no
local read-only token/org/project was configured; Ponytail returned
`Lean already. Ship.` for the narrow R0-R3 revision.

R4 used new profile ID `d8ar-yu-leetcode-0c23fca` and a new disposable
database at `0/0/0`. It handed off the exact web-access proxy, kept official
Chrome alive, loaded the exact fixed-ID extension into `yu`, completed the
localhost Route H connection, validated READY/zero queues and wrote connection
receipt SHA-256
`7E3DFABFBA4DBC43FF020DAE79F455EED358C2B3CD4007FED073DA5C7FB0C410`.
After printing `CONNECTION_PREPARED=1`, however, the command remained live for
more than 90 seconds. It was interrupted and the proxy restored.

The code-level cause is the runner's use of private
`browser._connection.close()`, which closes Playwright client state but not the
underlying CDP WebSocket transport. R4 therefore failed its clean handback gate.
READY-only and R5 were not invoked; no OJ page, submit click or submission ran,
NowCoder was not opened, and the database stayed `0/0/0`. The server is stopped,
root DB pointer absent, port 3000 free, Chrome/CDP alive, proxy restored and the
default database unchanged. The exact extension remains installed in `yu`.

This D8-A-R authorization is consumed. The only possible next scope is a
separately approved offline lifecycle correction using the public CDP close
path plus a regression that proves both runner exit and original Chrome
survival, followed by new hashes. Any R4 or real action requires a new explicit
authorization. D4, RC, release, V0.5, push and PR remain stopped. Evidence:
`work/reports/v4-phase-d-d8ar-yu-chrome-r4-pre-action-stop-2026-08-28.md`.

## Prior status (2026-08-28 first Route H D8-A stopped before action; no submission)

The user authorized exactly one LeetCode `merge-two-sorted-lists` action
observation on immutable Route H candidate
`0c23fcacf18d2fe4113d803504e638c1aab887d3`, with at most one real submission,
an unconditional stop afterward, and no NowCoder lane. The runner reused the
D7 fixed profile, disposable database and bounded Route H connection receipt
and matched the exact dist, candidate receipt, observation-tool hash
`309B3772EF23D28699841F66648FEC107E5D62CE8694F083AF5E157157A22C35` and
acceptance-profile hash
`D8C348F13AE302166D0DDF4514FC5108CAAE39CBFA2D056A298A4CE4A6693225`.

The invocation failed closed before the observer entered any stage. It emitted
none of `OBSERVER_ARMED=1`, `BROWSE_ONLY=1`, `READY=1` or
`ACTION_AUTHORIZED=1`; it never requested a user action and performed no click
or submission. The schema 3 evidence reports `outcome=not_delivered`, empty
`stageHistory`, `finalStage=observer_capture_error` and
`ENVIRONMENT_BLOCKED / UNRESOLVED / observer_unexpected_failure`. The evidence
file is
`output/playwright/v4-observation/0c23fcacf18d-leetcode-d7-route-h-leetcode-ready-0c23fca-real-observation-failed.json`,
SHA-256 `A57D562042A3F1DFBCCF07F28787AE4BC3E4A3D19FE74B1C9D3FB907914A7F84`.

The LeetCode disposable database remained `0/0/0`; NowCoder was not started.
The localhost service is stopped, the root DB pointer is absent, port 3000 is
free, and the default database is unchanged. A cold first compile of
`/api/capture/status` is a plausible timing clue, not an adjudicated root cause.
Evidence report:
`work/reports/v4-phase-d-local-vault-d8a-leetcode-pre-action-stop-2026-08-28.md`.

This exact D8-A authorization is consumed. There is no automatic retry, D4 is
not delivered, and real actions, RC, release, V0.5, push and PR remain stopped.
The next possible work is offline/read-only diagnosis and a reviewed plan
amendment; any new real action requires a new explicit authorization.

## Prior status (2026-08-26 Route H D7 READY-only PASS; actions were unauthorized)

The user explicitly authorized D7 for immutable Route H candidate
`0c23fcacf18d2fe4113d803504e638c1aab887d3`. The two lanes ran sequentially
under the frozen exact dist, candidate receipt, observation-tool hash
`309B3772EF23D28699841F66648FEC107E5D62CE8694F083AF5E157157A22C35` and
acceptance-profile hash
`D8C348F13AE302166D0DDF4514FC5108CAAE39CBFA2D056A298A4CE4A6693225`.

LeetCode ran first with fresh identity
`d7-route-h-leetcode-ready-0c23fca`, target `merge-two-sorted-lists`. Its
localhost-only Route H connection preparation passed with DB `0/0/0`; the
subsequent real-site lane returned `OBSERVER_ARMED=1`, `BROWSE_ONLY=1`,
`READY=1`, `ACTION_AUTHORIZED=0`. Evidence is
`output/playwright/v4-observation/0c23fcacf18d-leetcode-d7-route-h-leetcode-ready-0c23fca-ready.json`,
SHA-256 `F1396D21859569EB952F410546D16D4A3D57904431FD84E09D211B1F6C1F0601`.
Its bounded connection receipt SHA-256 is
`031D87A20E6B54EB22230B79B3112C7CCCDD95ECC32793DCBE56FFA5D7892E55`.

Only after LeetCode passed, NowCoder ran with fresh identity
`d7-route-h-nowcoder-ready-0c23fca`, target `acm/contest/18839/1001`. Its
localhost-only preparation and real-site lane returned the same four markers
and DB `0/0/0`. Evidence is
`output/playwright/v4-observation/0c23fcacf18d-nowcoder-d7-route-h-nowcoder-ready-0c23fca-ready.json`,
SHA-256 `74A626BB5C7F0E7F04A1D782521E2F8BAFD829583664988A9CB7AE79C764A7C0`.
Its connection receipt SHA-256 is
`42882E744075B13225CF4A3B9680092A8F53648E3D721E38A6B699D817C75F55`.

Both evidence payloads are schema 3 `ready_only` / `browse_only`, retain
baseline and final DB `0/0/0`, and report no DOM, cookie, source-code, problem-
statement, response-body, header or query retention. No action authorization,
submit-control click, submission, capture event, training session or attempt
occurred. The root DB pointer was removed, localhost:3000 is free, and the
default database remains unchanged. Evidence report:
`work/reports/v4-phase-d-local-vault-d7-ready-only-2026-08-26.md`.

D7 completion does not deliver D4 and does not authorize D8. The next possible
action is a separate user decision on a tightly named real-action protocol.
RC, release, V0.5, push and PR remain stopped.

## Prior status (2026-08-25 Route H D6 PASS; D7 requires separate authorization)

The approved Route H installation-level Local Vault revision is offline-complete
through D6 on `feature/v1-followup`. Immutable product candidate
`0c23fcacf18d2fe4113d803504e638c1aab887d3` passed the exact candidate validator.
Its exact production extension is `.tmp/v4-route-h-exact-dist-0c23fca`; strict
receipt is `.tmp/v4-route-h-candidate-receipt-0c23fca.json`, receipt SHA-256
`4EDA9DDD9FFB4311EDEA32B0D60DFEA34D54D07766E1490C02DB4B04582F9AEE`.

The pre-freeze quality gate and candidate-bound quality gate both passed with
root unit `2599/1`, App E2E `24/24`, extension unit `1671/1671`, extension E2E
`55/1`, production build `20/20`, privacy `0 findings`, D4 acceptance-profile
PASS and adapter-readiness PASS. Candidate ancestry, cumulative Route H path
allowlist, HEAD identity, clean worktree and default-database preservation all
passed. The default database remains `479232` bytes, mtime
`2026-07-23T15:56:38.8411343Z`, SHA-256
`2485DBEA8E9C9CF2F073BC6C9BA4AA0A5261DC3744DDA7592A2890BC554666C3`.

Exact-dist hashes are:

- `manifest.json`:
  `DE980FDBBE42EE293C154435716FCE7B5AF384BFB435BACD774AFFD17FB76B8F`
- `background.js`:
  `30866672C557BFF1DB878988A81A12193A6FC36E4E7CAAEE87C45601A68452EB`
- `content.js`:
  `FF56222167EFB0904AC50F2175BFD24C1C2711E9966E879A8099427C16339D8D`
- `popup.js`:
  `2AA3FC47953AEC4505D89736DEA93F49E226BE817ADEEE024B1A35D917AB06E1`
- `main-world-bridge.js`:
  `4D89A80F0351295EE1C0CD173BE107080983868D18510D028854695EACEE3943`

Route H keeps Next.js as the sole SQLite owner and replaces visible pairing with
one localhost settings click, a 60-second single-use challenge and a hidden
256-bit installation capability. The raw value remains only in trusted
extension storage, while the app retains only its hash outside every Vault.
Restart, reload and Vault switch reuse the installation; reinstall rotates it
and requires one reconnect click. New capture provenance is `extension_local`;
historical paired/unpaired data remains historical and unchanged.

D5's two-step READY preparation contract is frozen with observation-tool hash
`309B3772EF23D28699841F66648FEC107E5D62CE8694F083AF5E157157A22C35` and
acceptance-profile hash
`D8C348F13AE302166D0DDF4514FC5108CAAE39CBFA2D056A298A4CE4A6693225`.
It first prepares a fresh fixed profile through localhost only, then requires
that exact profile and bounded receipt before any later authorized OJ
navigation. The runner never reads or emits the raw capability.

No OJ page, READY lane or real action ran during Route H D0-D6. Candidate
`34916705712cac1ef2e5d8816cd8e40fa4e29ca7` remains immutable historical
evidence for the superseded paired product and cannot certify Route H. The next
possible action is D7, but it requires a fresh explicit authorization bound to
the new candidate, exact dist, receipt and frozen tool/profile hashes. It must
run LeetCode first and stop on failure; only a passing first lane may proceed to
NowCoder. Real actions, D4 delivery adjudication, RC, release, push and PR remain
stopped. Evidence is
`work/reports/v4-phase-d-local-vault-d6-candidate-freeze-2026-08-25.md`.

## Prior status (2026-08-25 Route H D5 PASS; D6 candidate freeze is next)

The approved Route H installation-level Local Vault revision has completed D0
through D5 on `feature/v1-followup`. D0 froze the decision and threat boundary;
D1 proved the fixed-extension installation channel in official Chrome for
Testing; D2 added the dependency-free Local Vault launcher; D3 migrated new
capture provenance to `extension_local`; and D4 replaced visible pairing with
the one-click, 60-second challenge and hidden 256-bit installation capability.
The D4 product integration is commit `7dbbfc3`.

D5 now closes the offline READY preparation contract without granting D7. A
future separately authorized lane must first invoke the observation runner with
`--prepare-connection=true`. Preparation creates one fresh fixed profile, opens
only localhost settings, performs the Route H connection, proves its disposable
database is `0/0/0`, and writes a bounded connection receipt. The later READY
run must reuse that exact profile and receipt and match the candidate, all five
exact-dist hashes, candidate-receipt hash, extension ID, canonical profile,
database and Vault-config identities, installation-identity hash and capability
version before any OJ navigation is possible. Neither mode reads, copies or
emits the raw capability.

The observer now ignores only the current public Route H installation fields;
legacy `captureCredential`, `captureCredentialVersion` and `pairedAt` changes
fail closed. The D4 acceptance profile and validator encode the new preparation
contract, and the immutable-candidate validator classifies the complete Route H
change range from `6c0e1d7` so the approved phased commits cannot evade the
candidate path boundary. User-facing README, compliance, architecture and
runbook documents describe the same one-click lifecycle and reconnect path.

D5 focused validation passed `138/138`; lint, root typecheck, extension check
`1671/1671`, privacy audit `0 findings`, acceptance-profile validation and
adapter-readiness validation all pass. Frozen D5 observation-tool hash is
`309B3772EF23D28699841F66648FEC107E5D62CE8694F083AF5E157157A22C35`; acceptance
profile hash is
`D8C348F13AE302166D0DDF4514FC5108CAAE39CBFA2D056A298A4CE4A6693225`.
No OJ page, browser READY lane, real action, default SQLite migration, push or
PR ran. Evidence is
`work/reports/v4-phase-d-local-vault-d5-ready-contract-2026-08-25.md`.

Candidate `34916705712cac1ef2e5d8816cd8e40fa4e29ca7` remains immutable historical
evidence for the superseded paired product and cannot certify Route H. D6 is the
next and only authorized action: run the full offline gates, freeze a new
immutable candidate, exact dist and receipt, then stop. D7 LeetCode followed by
NowCoder READY-only still requires a fresh explicit authorization bound to the
new SHA and hashes; real actions, D4 delivery adjudication, RC, release, push and
PR remain stopped.

## Prior status (2026-08-25 Route H D3 PASS; D4 is next)

The user confirmed the product defaults that supersede the proposed two-stage
fresh-profile pairing repair: keep Next.js + localhost as the SQLite owner for
V0/V1; treat local host processes as inside the local trust boundary; allow a
Vault switch to restart the app; remove the user-visible pairing code and
long-lived bearer; select/create/switch Vault folders through a local OS picker
with an absolute-path CLI fallback; never auto-move or delete the current
database; and write new provenance as `extension_local` while preserving
historical `extension_unpaired` / `extension_paired` values.

The exact-Origin-only plan failed closed at P1 and has been superseded by the
approved Route H installation-level decision in
`docs/superpowers/plans/2026-08-24-v4-phase-d-local-vault-transport-decision-revision.md`.
The user accepts the narrower malicious-extension boundary. A hidden capability
is stored outside the Vault in the OS user configuration area, survives Vault
switches, and requires one local “连接扩展” click only after first install or
extension reinstall. D0–D6 offline implementation, verification and necessary
local commits are authorized; D1 remains a first-failure hard stop.

Route H D0 is complete: ADR 0004 and the Local Vault plan freeze the
installation-level capability, Vault-external hash metadata, extension-local
raw value, one-click reconnect after reinstall, automatic reuse across Vault
switches, exact sender validation and Origin-as-defense-only boundary. No Route
H production runtime, manifest, database schema or extension storage change ran
in D0 itself.

Route H D1 passed on official Chrome for Testing `151.0.7922.138` with two fresh
profiles, fixed target ID, a separately keyed attacker extension, two disposable
SQLite Vaults and a temporary Vault-external install record. The final gate was
`1 passed (12.1s)`: external messaging, exact sender/closed schema, 60-second
single-use challenge, expiry/replay/concurrency rejection, page-secret absence,
hash-only app persistence, Bearer-before-body `0/0/0`, sanitized Bundle `4/1/1`
plus idempotent replay, restart/reload, Vault switch, reinstall rotation, and
direct extension-to-extension rejection all passed. Chromium 138 was not used.
The default database was preserved. Evidence is
`work/reports/v4-phase-d-local-vault-route-h-d1-spike-2026-08-25.md`.

Route H D2 is complete. The dependency-free Local Vault core now creates,
validates, activates, switches and source-preservingly adopts real Vault
directories; rejects relative/link/junction/collision/unknown-version/integrity
failures; stores one atomic OS-config pointer; and launches Next.js through a
non-shell child only after the localhost:3000 stopped-service gate. Native
system pickers have explicit cancel/unavailable outcomes and never select cwd.
`/settings` is a read-only Vault status page with no runtime switch API. Focused
tests passed `17/17`; root unit `2590/1`, App E2E `24/24`, and build `20/20`
passed with the default database preserved. Evidence:
`work/reports/v4-phase-d-local-vault-d2-core-launcher-2026-08-25.md`.

Route H D3 is complete. Migration `0009` adds `extension_local` while preserving
populated historical paired/unpaired sessions, events, attempts and corrections;
drops only the two Vault-resident legacy authentication metadata tables; and
restores indexes and all foreign keys. Fresh, populated 0008, every historical
prefix, repeated apply, invalid FK rebuild, same-target, hash mismatch and
migration failure paths pass `27/27` with source databases unchanged. Lint,
typecheck and diff check pass; the default database remains unchanged. Evidence:
`work/reports/v4-phase-d-local-vault-d3-migration-adoption-2026-08-25.md`.

D3 is an intentionally non-releasable intermediate commit because legacy
pairing/capture-auth callers still expect the tables removed by `0009`. D4 must
now replace those callers with Vault-external Route H and remove the old API /
repository surface before any repository-wide product gate is claimed.

Candidate `34916705712cac1ef2e5d8816cd8e40fa4e29ca7` remains immutable historical
evidence for the paired product, but it cannot certify the revised contract.
Its READY-only authorization does not transfer to a future candidate. The next
required action is D4 Route H product integration and legacy pairing removal.
Real OJ browsing, actions, D7, RC, release, push, and PR remain stopped.

## Prior status (2026-08-24 new-candidate READY preflight blocked before browser launch)

The user explicitly authorized sequential new-candidate READY-only validation
for candidate `34916705712cac1ef2e5d8816cd8e40fa4e29ca7`, LeetCode first and
NowCoder second, with no action authorization and stop on first failure. Static
pre-execution reconciliation found an unsatisfiable harness precondition before
either live lane could safely start: `fixedProfilePath` rejects every existing
profile and creates a fresh empty profile, while the runner immediately requires
that same profile to be `extension_paired` before platform navigation. Commit
`9cf7926` deliberately removed the in-runner pairing path, and its focused test
requires both `pairExtension` and `/api/capture/pairing-codes` to remain absent.

Candidate, receipt, exact-dist, profile, and tool hashes all match the frozen
values. The intended LeetCode identity `p7f6-leetcode-ready-3491670`, its
database directory, evidence, and diagnostic do not exist; `.tmp/server-db-path.txt`
does not exist; port 3000 is free. No server, browser, OJ navigation, pairing,
database migration, click, submission, or retry ran, so neither lane identity
was consumed and NowCoder was not prepared. Default SQLite metadata remains
`479232` bytes / `2026-07-23T15:56:38.8411343Z`.

The safe next decision is whether to approve an observer-only plan revision
that separates fresh-profile local pairing/preparation from the read-only READY
preflight and binds the prepared profile/database identity in a bounded receipt.
Do not weaken READY to accept an unpaired extension and do not copy or reuse an
old profile or credential. Evidence:
`work/reports/v4-phase-d-p7f6-new-candidate-ready-preflight-blocker-2026-08-24.md`.
Real actions, D4 closeout, D5, RC, release, push, and PR remain unauthorized.

## Prior status (2026-08-24 candidate frozen; development Sentry committed; new READY pending)

The cross-project capture-chain repair is frozen at immutable product candidate
`34916705712cac1ef2e5d8816cd8e40fa4e29ca7`. Exact validation returned `V4
candidate commit PASS`: root `2550/1`, App E2E `25/25`, extension unit
`1660/1660`, extension E2E `54/1`, build `20/20`, privacy `0 findings`,
readiness PASS, and preserved default SQLite metadata. Exact dist is
`.tmp/p7f6-exact-dist-3491670`; receipt is
`.tmp/p7f6-candidate-receipt-3491670.json`. Observer compatibility is
separately frozen at `9cf79268840870398165974376a322095bcea602`, tool hash
`EB564C529595F5F168FE1300EBCA431340135F48C21AA132829A863C0F44DF19`.

Old-candidate LeetCode and NowCoder READY-only lanes passed with
`ACTION_AUTHORIZED=0` and DB `0/0/0`. The new candidate has not run either
READY-only lane; a new authorization must name candidate `3491670` and the
sequential LeetCode-then-NowCoder scope. Real actions remain unauthorized.

Commit `6c0e1d7` adds development-only Sentry exception tooling under ADR 0003.
It requires explicit local development flags, projects only a fixed exception
message plus bounded repository-relative stack coordinates, disables Replay,
logs, traces and request/user/capture data, and is inert in tests/production.
Focused tests pass `13/13`; the implementation commit's full quality gate was
root `2563/1`, App E2E `25/25`, extension `1660/1660`, extension E2E `54/1`,
build `20/20`. Current-thread Sentry issue inspection is still unavailable:
no authenticated MCP tool or read-scoped environment token is exposed. No test
event, issue mutation, push, PR or deployment occurred.

D4 is not delivered. D5, F1-F4, RC, release, formal V0 observation and V0.5
remain stopped.

## Prior status (2026-08-24 cross-project capture repair implemented; product candidate freeze in progress)

The approved cross-project capture-chain repair is implemented offline. The
product now has persistence-bound ingress ACKs, a bounded FIFO content retry
queue, re-entrant single-flight initialization, exact documentId-only recovery,
closed recovery status/errors, canonical endpoint enforcement/reset, Chrome 106
minimum capability, and `unlimitedStorage` without removing storage-rejection
handling. Unknown custom loopback endpoints remain blocked; no App API or
database migration was added.

The authoritative pre-freeze `npm run quality:gate` exited 0 with root
`2550/1`, App E2E `25/25`, extension unit `1660/1660`, extension E2E `54/1`,
and production static generation `20/20`. Lint, migration, curriculum,
typecheck, privacy (`0 findings`), adapter readiness, D4 acceptance profiles,
and exact source/dist parity pass. The default database remained exactly
`479232` bytes with mtime `2026-07-23T15:56:38.8411343Z`. A NowCoder
worker-restart test had treated a persisted `before_request` lifecycle as a
completed submit; its restart boundary now requires the completed 200 response
to be durable. The focused stress run passed `30/30` without widening the
five-second submit/status contract or adding unbounded status retries.

Observer compatibility is separately frozen at
`9cf79268840870398165974376a322095bcea602`; combined tool hash
`EB564C529595F5F168FE1300EBCA431340135F48C21AA132829A863C0F44DF19`, profile
hash `D35892A2FADDB8B8F4313684E96C261F6C256A3E9FEE79D34C5DB531678D6069`.
The product commit containing this paragraph is the intended single new
candidate; only the clean-worktree candidate validator and its external
receipt may certify its exact SHA/dist. New-candidate READY-only browsing must
remain stopped until the user grants a new authorization. Real actions, D4
closeout, D5, RC, release, push, and PR remain unauthorized.

Five pre-existing user-owned working-tree files remain intentionally outside
the product candidate: `AGENTS.md`, `README.md`, `docs/architecture.md`,
`docs/superpowers/README.md`, and the 2026-08-16 P7 failure-diagnostic plan.
They must not be staged, reverted, or used as candidate evidence.

## Prior status (2026-08-23 old-candidate READY proof passed; product repair gate opened)

The user approved the master repair plan at
`docs/superpowers/plans/2026-08-23-v4-phase-d-cross-project-capture-chain-reliability-repair.md`.
The observer now validates closed E0
data properties, canonical time, and safe document identity; it projects
same-target hints from distinct refresh documents as bounded presence `0 | 1`
and rejects a duplicate from the same document. RED was `2 failed / 49
passed`; final focused observer/diagnostic verification is `68/68`, with
typecheck, targeted lint, syntax, privacy `0 findings`, both contract
validators, and empty product-candidate isolation diff passing. Frozen tool
hash: `40FB0E40...CB775A9`; product candidate
`915a98d0317148d063a3fad0e1888cb7aa74e2da` is unchanged.

The user separately authorized the old-candidate READY-only proof. Fresh
LeetCode lane `p7f5-leetcode-ready-915a98d` and fresh NowCoder lane
`p7f5-nowcoder-ready-915a98d` both returned `OBSERVER_ARMED=1`,
`BROWSE_ONLY=1`, `READY=1`, and command-level `ACTION_AUTHORIZED=0`; both
disposable databases remained `0/0/0`. Both receipts bind candidate
`915a98d...`, tool hash `40FB0E40...CB775A9`, profile hash
`D35892A2...78D6069`, the same candidate receipt, and unchanged pre/final
exact-dist hashes. Evidence:
`output/playwright/v4-observation/915a98d03171-leetcode-p7f5-leetcode-ready-915a98d-ready.json`
and
`output/playwright/v4-observation/915a98d03171-nowcoder-p7f5-nowcoder-ready-915a98d-ready.json`.
No action authorization, click, or submission occurred, and both local
servers were stopped. A preliminary NowCoder CLI invocation was rejected by
local argument validation before browser/profile creation; after confirming
no artifacts and DB `0/0/0`, the only actual NowCoder network lane passed.

The old-candidate proof gate is complete, so the approved plan now permits
offline ACK/recovery/storage/endpoint/browser-capability implementation and a
new local candidate freeze. New-candidate READY-only browsing still requires
separate authorization. Real actions, D4 closeout, D5, RC, release, push, and
PR remain unauthorized.

## Status (2026-08-23 P7F4 diagnostic stopped after first browse-lane failure; user decision required)

The user authorized
`docs/superpowers/plans/2026-08-23-v4-phase-d-p7f3-observer-rejection-diagnostic.md`
and explicitly requested Sentry and Ponytail plugin use. Sentry read-only API
access was unavailable because no local token/org/project is configured; no
SDK or telemetry dependency was added. Ponytail full mode and its review pass
kept the change harness-only and dependency-free. RED was `2 failed / 64
passed`; GREEN and final focused verification are `66/66`, with typecheck,
targeted ESLint, three syntax checks, privacy `0 findings`, both contract
validators, and empty candidate-isolation production diff all passing. The
new frozen observation-tool hash is `9E3880AC...E89E8CB`; candidate
`915a98d0317148d063a3fad0e1888cb7aa74e2da`, exact dist, receipt, profile hash,
and five dist hashes remain unchanged.

The first authorized browse-only lane used fresh profile/database identity
`p7f4-leetcode-diagnostic-915a98d`, candidate `915a98d...`, one accepted
diagnostic refresh, and no `--authorize-action`. It failed closed before READY
with the new exact diagnostic root `e0_cardinality_exceeded` at `browse_only`;
authorized actions `0`, DB `0/0/0`, no click/submission/E2/delivery. Evidence:
`output/playwright/v4-observation/p7f4-leetcode-diagnostic-915a98d-storage-key-diagnostic.json`
and
`output/playwright/v4-observation/915a98d03171-leetcode-p7f4-leetcode-diagnostic-915a98d-real-observation-failed.json`.
The stop-on-first-failure rule prevented the NowCoder lane from starting.

Static tracing closes the root mismatch: production keeps one E0 per
`(platform, problem, document)` for 30 seconds; refresh creates a new document,
but the observer counts target E0 across documents and rejects `e0 > 1`. The
recommended next decision is an observer-only projection fix that validates
every hint but projects bounded presence (`0 | 1`), followed by RED/GREEN,
privacy/review, tool-hash refreeze, and two new browse-only lanes. This fix is
not authorized. Real actions, D4 closeout, P8, D5, RC, release, push, and PR
remain unauthorized.

## Prior status (2026-08-16 F1 complete; new candidate 915a98d frozen; both lanes READY; awaiting new single-action authorizations)

The user explicitly accepted `ISOLATED` as the replacement D4 minimum and
authorized P0A C0 readiness alignment. The canonical contract is Revision 4 of
`docs/superpowers/plans/2026-08-16-v4-phase-d-d4-platform-specific-acceptance-rescue.md`;
the template-derived C0 delta is
`docs/superpowers/plans/2026-08-16-v4-leetcode-d4-readiness-contract-alignment.md`.
The machine profile is `authorized_for_offline_work_only`; both platform
profiles are `authorized_offline`, LeetCode readiness is aligned to the
ActionEpoch/result-root policy, and LeetCode remains network-`experimental`.

P0A changed no `extension/src/**` production file. P1 then implemented the
LeetCode ActionEpoch/result-root branch with baseline-ID replay, multiple-action,
multiple-new-ID, crossed-corroboration, historical-panel, repeat-verdict, and
restart negatives. P1 verification passed: focused `248/248`, extension
`1615/1615`, extension E2E `53/1`, both contract CLIs, typecheck, targeted
ESLint, and privacy audit with `0 findings`. P2 then preserved the exact
NowCoder pilot with zero NowCoder production diff, focused `504/504`, extension
`1615/1615`, and extension E2E `53/1`. P3 then closed the observer contract:
LeetCode E2 requires exactly one result/check stable ID equal to the confirmed
`externalSubmissionId`; submit-only, mismatch, duplicate, and post-E2 identity
replacement fail closed through E3/ACK; the first terminal failure closes the
observation context exactly once; a required candidate receipt binds the
candidate SHA, dist path, and five artifact hashes and is revalidated at final
evidence; raw exception text never enters evidence. P3 verification passed:
observer `43/43`, typecheck, targeted ESLint, both syntax checks, privacy
`0 findings`, both contract CLIs, and diff-check; the final independent tool
review returned `APPROVE` with no HIGH/MEDIUM. P4 then reviewed all five
contracts (authority, readiness, observer, privacy, stop) and returned a
conditional PASS; Build ran the four required offline verifications (4/4
hashes match, focused `77/77`, both CLIs + privacy PASS, extension diff =
exactly six P1 LeetCode files), so the retained verdict is `APPROVE` with no
HIGH/MEDIUM and one deferred non-blocking advisory. P5 then froze the
immutable candidate `62e57096c29babe8370c3ad98f6bfe57a1a997f9`
(`feat(v4): implement LeetCode D4 result-root capture branch`, 15 files,
product-only diff) on parent `6e3fb6f`; the exact D3 validator exited `0`
(`V4 candidate commit PASS`) with root `2478/1`, app E2E `25/25`, extension
`1615/1615`, extension E2E `53/1`, build `20/20`, privacy `0 findings`,
readiness PASS; the exact dist is `.tmp/p5-exact-dist-62e5709` and the
default database metadata (`479232` / `2026-07-23T15:56:38`) is preserved.
Receipt: `work/reports/v4-phase-d-p5-candidate-freeze-2026-08-16.md`.
P6 then ran both READY-only lanes. The LeetCode lane passed on the frozen
tool (`READY=1`, DB `0/0/0`). The NowCoder lane first failed closed because
the candidate legitimately writes the approved session key `b3WitnessState`
outside the observer trigger allowlists; a bounded key-name-only diagnostic
pinned exactly that key, and the user authorized the full closed ignore-list
(trigger ∪ 16 local + 3 session ignored keys; values never read; unknown
keys still fail closed). The fix passed RED (`7 failed`) then GREEN (`60/60`
focused), privacy `0 findings`, both CLIs, and a focused review with no HIGH
findings; the tool hash was refrozen to `F0183DC7...D40911` (runner +
observer + diagnostic). The fresh NowCoder READY lane then passed with
`READY=1`, `ACTION_AUTHORIZED=0`, and DB `0/0/0`. P6 is complete for both
lanes. P7 then executed exactly one action per lane on the frozen candidate
with the refrozen tool hash. The LeetCode lane (`merge-two-sorted-lists`)
failed closed with the allowlisted capture error
`verdict_candidate_chronology_mismatch` (`PROFILE_UNRESOLVED`, browse_only,
DB `0/0/0`). The NowCoder lane (approved pilot) failed closed with
`observer_stage_rejected` (`OBSERVER_INVALID`, browse_only, DB `0/0/0`). No
retry occurred; both single-action authorizations are consumed. D4 is NOT
delivered and P8 closeout is therefore unmet. The user then authorized the
P7 failure diagnostic revision
(`docs/superpowers/plans/2026-08-16-v4-phase-d-p7-failure-diagnostic-revision.md`):
diagnosis confirmed H2 (LeetCode chronology guard on the stale pre-action
result panel) and H3 (NowCoder E1-before-E0 race on the click-only hint
path). The user approved the F1 product fix (visibility-seeded E0 + dedup).
The F1 chain invalidated candidate `62e5709` and froze the new immutable
candidate `915a98d0317148d063a3fad0e1888cb7aa74e2da` (D3 `V4 candidate
commit PASS`: root `2505/1`, app E2E `25/25`, extension `1622/1622`,
extension E2E `53/1`, build `20/20`, privacy `0 findings`, readiness PASS);
exact dist `.tmp/p7-f1-exact-dist-915a98d`; receipt
`.tmp/p7-f1-candidate-receipt-915a98d.json`. Both fresh READY lanes passed
(browse-only, DB `0/0/0`). New single-action authorizations (one per lane)
require a separate user decision. Any repair, new candidate, or
further live attempt requires a new reviewed plan revision and its own user
authorization. Live observation, D5/F1-F4, RC, release, push,
and PR remain separately gated and unauthorized.

The Route A sections below remain immutable historical facts for their own
runs. `NO_SAFE_DIRECT_WITNESS`, `WINDOW_CORRELATED_FACTS_AUXILIARY_ONLY`, and
`TASK26_LIVE_PROTOCOL_ASSUMPTION_UNPROVEN` are not erased or relabelled, but
their former future-acceptance semantics are superseded by the user-authorized
contract. Historical evidence cannot satisfy the new `ISOLATED` profile.

## Status (2026-08-14 section 14.34 `ROUTE_A_CLOSEOUT_APPROVE`; D4 incomplete; D5 stopped)

Route A is selected. Static audit confirms the protected product/candidate
diff from `aa1a572c3913b35dd3f0391f849dab66e79c56a2` is empty and the five
Task26 dist hashes are unchanged. D1-D2 remain complete; D3 remains an
immutable engineering candidate only. D4 is incomplete and currently
`D4_CAUSAL_DIAGNOSTIC_UNADJUDICABLE`, not PASS and not a currently proven
deterministic product failure. D5 remains stopped and unstarted.

The external diagnostic route is closed after independent
`NO_SAFE_DIRECT_WITNESS` with HIGH none and MEDIUM none. Window-correlated
facts remain `AUXILIARY_ONLY`; the strongest safe causal outcome is
`SUBMIT_BOUND_PROTOCOL_UNRESOLVED`. No further live retry is authorized. Every
earlier READY/action/authorization/next-live-action statement below is a
superseded historical checkpoint and grants no current authority.

The generation5 JSON remains unchanged as historical factual evidence. Its
`PRODUCT_FAIL` label is a superseded checkpoint interpretation; sections
14.33-14.34 are current authority: `NO_SAFE_DIRECT_WITNESS`,
`WINDOW_CORRELATED_FACTS_AUXILIARY_ONLY`, and
`TASK26_LIVE_PROTOCOL_ASSUMPTION_UNPROVEN`. Historical diagnostic/protocol
tools are `HISTORICAL_NON_AUTHORITATIVE_DO_NOT_EXECUTE`.

No file was restored, deleted, reset, cleaned, committed, or pushed. No test,
build, migration, browser, CDP, preflight, platform access, network
characterization, click, submission, or retry ran. The exact KEEP / RESTORE /
DELETE-UNTRACK / SEPARATE-UNRELATED recommendations and proposed commit split
are in plan section 14.34; `AGENTS.md` is included in KEEP so the next agent
receives the same stop state. These are recommendations only. Independent
review initially found the stale `AGENTS.md` live-next instruction as one HIGH;
after correction, all twelve questions passed with HIGH none and MEDIUM none.
Final verdict is `ROUTE_A_CLOSEOUT_APPROVE` for documentation closeout only;
it authorizes no cleanup, commit, live work, or Route B.

## Status (2026-08-14 section 14.33 `NO_SAFE_DIRECT_WITNESS`; D4 incomplete; D5 stopped)

Official CDP and Chromium source review found no complete privacy-safe,
non-temporal, browser-native join from the exact controlled CDP click to the
exact DOM click dispatch and then to one Network request. Chromium exposes an
internal input latency id, an EventDispatch duration, and a
ResourceSendRequest instant, but CDP does not return the input id and the trace
events do not share an explicit click-parent/request identity. `hasUserGesture`
is transient activation only; initiator/async stacks are code lineage; debugger
breakpoints perturb execution; tracing exposes raw URL/request/stack material;
page listeners, wrappers, and request-token injection mutate the target.

Plan section 14.33 records all 14 candidates and contains no
`DIRECT_FEASIBLE` result. Independent final review returned
`NO_SAFE_DIRECT_WITNESS`, with HIGH none and MEDIUM none. Window-correlated
facts are now permanently auxiliary and cannot yield
`E1_ACCEPTED` or a submit root cause. Their strongest safe result is
`SUBMIT_BOUND_PROTOCOL_UNRESOLVED`. The frozen candidate remains a D3
engineering candidate, while D4 is
`D4_CAUSAL_DIAGNOSTIC_UNADJUDICABLE`; D4 is incomplete and D5 stays stopped.
`TASK26_LIVE_PROTOCOL_ASSUMPTION_UNPROVEN` remains authoritative.

The new independent reviewer answered all fifteen required questions and
returned `NO_SAFE_DIRECT_WITNESS` (no HIGH; one MEDIUM status-drift note). The
existing uncommitted diagnostic/protocol scripts and tests are now explicitly
`HISTORICAL_NON_AUTHORITATIVE_DO_NOT_EXECUTE`: any remaining `E1_ACCEPTED`,
no-request, or metadata-root-cause label is superseded by section 14.33, cannot
mint evidence or authorize preflight/action, and was not edited or executed in
this round. The reviewer confirmed that clarification closes its initial
status-drift note.

This round is documentation/static-audit only. It did not modify probe/tests/
product/dist and did not run tests, Chromium, CDP, preflight, platform/network,
login, click, submit, re-freeze, or D5. Immediate Route A is to retain the
candidate and stop further retries. Route B is a future product-native causal
identity design requiring a new plan, RED/GREEN, privacy review, D3 re-freeze,
and new D4; it is not authorized now.

## Status (2026-08-14 §14.32 rooted-request contract REJECT; D4 incomplete; D5 stopped)

The proposed repair now requires every eligible action request to originate in
a directly observed post-arm/post-dispatch companion `onBeforeRequest` root.
Later lifecycle events can only extend their exact request-id lineage; stale
pre-dispatch roots are retained as stale and can never be repaired into action
candidates. Tuple HMAC is only a candidate key, with exact cardinality and
lineage required.

Production E1 evidence is a monotonic positive ledger. Directly witnessed E1
survives later E3/TTL removal; polling misses and equal arm/close snapshots are
only `E1_NOT_OBSERVED`. Negative production classifications are removed or
collapsed into `SUBMIT_BOUND_PROTOCOL_UNRESOLVED`. Quiescence covers known root
lifecycles and diagnostic-owned work only; production internal quiescence stays
unknown without an existing safe barrier.

Independent review confirms the R0 late-lifecycle and X->Y->X false-negative
attacks are closed, but returns **`REJECT / 1 HIGH / 0 MEDIUM`**. One same-tuple
background request in the non-atomic gate-to-click interval can be the only
post-dispatch root/page fact and direct production E1, satisfying cardinality,
lineage, and both HMAC joins even when the click emitted no submit. That can
falsely produce `E1_ACCEPTED` or terminal metadata attribution.

The next contract must either define a privacy-safe non-temporal direct
click-to-request witness or keep all window-correlated facts auxiliary and
terminally unresolved. Current future diagnostic utility is insufficient to
justify an action. This round remained documentation-only: no probe/product/
test change and no test, Chromium, preflight, platform, network, click,
submission, NowCoder, D3 re-freeze, or D5 ran. No offline implementation delta,
zero-click preflight, or action is authorized.

## Status (2026-08-14 §14.31 evidence-epoch contract REJECT; D4 incomplete; D5 stopped)

The two former capability HIGHs are under explicit threat-model revision, not
implementation expansion. Pre-attach history is now
`PRE_EPOCH_UNOBSERVED`; only an arm-time safe baseline, fresh HMAC epoch,
current exact workers/listeners/filter, and installed lifecycle witness can
start evidence. The proposed hard continuity property covers arm through
close, not Chromium launch through close. Pre-arm tokens/state are baseline
exclusions and cannot be positive evidence.

The former absolute zero-production-write requirement is replaced by
`DIAGNOSTIC_NON_MUTATING` plus `RELEVANT_STATE_DRIFT_FAIL_CLOSED`. The tool may
prove its own mutation surfaces absent and compare the same bounded,
privacy-approved production projection at arm/close; it must not claim that
production never wrote. Any relevant unexplained drift remains invalid.

Independent threat-model review agrees that full-launch worker purity and
absolute zero production writes are not necessary gates, but returns
**`REJECT / 2 HIGH / 0 MEDIUM`** for the proposed replacements. A pre-arm
request can deliver callbacks after dispatch and be confused with a same-tuple
action request unless it has a direct post-arm/post-dispatch `onBeforeRequest`
root. Separately, production E1 can appear and then be consumed by E3 or TTL,
so arm/close snapshot equality cannot prove “no E1”; async persistence can also
land after the final projection.

Any future contract must root every eligible request after dispatch, forbid
later lifecycle events from independently creating candidates, and leave no-E1
outcomes unresolved without a direct production transition witness and a
defined input-stop/queue-quiescence barrier. Privacy and D4 product hard gates
remain unchanged. This round changed documentation only: no probe code/test,
Chromium, preflight, page, login, network, click, submission, NowCoder, D5,
product edit, or re-freeze ran. No zero-click preflight may be proposed from
this revision; `TASK26_LIVE_PROTOCOL_ASSUMPTION_UNPROVEN` remains authoritative.

## Status (2026-08-14 §14.30 four-plane engineering GREEN; preflight REJECT; D4 incomplete; D5 stopped)

The historical audit fixed the status as
**`TASK26_LIVE_PROTOCOL_ASSUMPTION_UNPROVEN`**: C1 v6 proved a real GraphQL
delivery path, while Task26 proved exact-submit identity only in automated and
synthetic evidence. Exact submit remains a defensible anti-misattribution
design, but it is not proven to be a current authenticated-UI protocol fact.

The candidate-external diagnostic now contains a mechanically generated
same-filter passive MV3 companion, fixed frozen-worker read-only
`session.transientE1` projection, fresh 32-byte domain-separated HMAC joins,
a final-only reducer, a structural zero-click preflight runner, and a separate
unwired page-action module. Initial RED was the missing tool import; current
focused GREEN is `41/41`. Typecheck, targeted ESLint, both syntax checks,
privacy (`0 findings`), diff check, and protected-path isolation pass. Current
tool/action/test/declaration SHA-256 are `1D3971C0...CC19959`,
`809CB3EC...02A51F`, `AC01E683...2B356F`, and
`DBA9678D...A9BE85`.

Independent review remains **`REJECT / LIVE NOT AUTHORIZED / NO ACTION
REQUEST`**. Two HIGH evidence limitations cannot be safely represented as
facts: Playwright exposes the persistent context only after launch, leaving a
worker-lifecycle monitoring blind interval; and current Chrome APIs cannot
prove that the production worker made zero transient storage writes. The code
therefore deliberately sets both hard proof facts false and always returns
`DIAGNOSTIC_INVALID / preflight_proof_unavailable`; it does not mint a READY
proof. The earlier all-storage HMAC idea was withdrawn because reading
credential-bearing local storage would violate privacy. Do not run the real
zero-click preflight, open the platform, click, submit, retry, modify the
frozen candidate, or enter D5.

## Historical status (2026-08-13 generation5 LeetCode PRODUCT_FAIL; current interpretation superseded by sections 14.33-14.34)

Observer Revision 3 and the generation4 LeetCode-first identity delta are now
independently **`APPROVE`**, with no HIGH/MEDIUM. Generation4 RED/GREEN was
`96/100` -> `100/100`, then review repair `100/103` -> `103/103`;
typecheck/lint/syntax/privacy/diff/isolation pass. Current helper/runner/test/
declaration hashes are `A023F3D1...858DAC2C`, `32CA4C6C...BC2FC88C`,
`9665A610...DA77B096`, and `3ED3065E...2200753`.

Generation4 NowCoder is hard-rejected before any asset is created; it cannot
be enabled until LeetCode D4 PASS and a new amendment. Exactly one new
LeetCode generation4 profile/zero-row DB may now be prepared READY-only. If
login is needed, use that one fixed profile once and reuse it serially; do not
open a second profile or copy private login material. No click/submission is
authorized by this READY approval. D4 remains incomplete and D5 stopped.

The permitted LeetCode generation4 READY-only run is now complete. Receipt
`output/playwright/v4-observation/leetcode-readiness-1786566437035.json`
records generation4, `browse_only`, target/queue counts `0/0/0/0`, SQLite
`0/0/0`, fixed profile/database identities, the four approved tool hashes,
and the five unchanged dist hashes. No click/submission occurred; context and
server are closed and port 3000 is free. The next gate is one fresh
action-time authorization for at most one strict LeetCode click. NowCoder
remains closed; D4 incomplete and D5 stopped.

The subsequent single authorized generation4 LeetCode action consumed exactly
one strict click and stopped at
`output/playwright/v4-observation/leetcode-real-observation-failed-1786566841561.json`.
It is `OBSERVER_INVALID / observer_stage_rejected /
observer_transition_unadjudicable`: safe state remained `browse_only`, target
and extension counts stayed zero, and SQLite stayed `0/0/0`. Tool/dist and
lane identities did not drift. Runner, browser, and server are closed; locks
are zero and port 3000 is free. Do not retry, reset, replay, or prepare
NowCoder. Next: read-only callback/reducer adjudication and a minimal offline
RED if the evidence supports one. D4 remains incomplete; D5 stopped.

The deferred-replay evidence repair is now independently **`APPROVE`**, no
HIGH/MEDIUM. RED `103/104` became GREEN `105/105`; anchors `174/174` and all
focused type/lint/syntax/privacy/diff/isolation gates pass. Current hashes are
`F9FEA06A...93B63B`, `4FDCC35F...DB16F3`,
`983B8786...7EEB4`, and `2ED9635F...68D29`. It preserves only the safe
accepted prefix and first rejected transition without changing acceptance.
Generation4 remains consumed and cannot be retried. The next proposal is one
generation5 LeetCode-only, single-profile READY/action sequence; it is
`REVIEW REQUIRED`. NowCoder and D5 remain stopped.

Generation5 identity code is now independently **`APPROVE`**, no HIGH/MEDIUM:
focused `107/107`, anchors `174/174`, all focused gates green. Current hashes
are `48B65E4E...E1D2C1`, `CE157469...8F515`,
`6F0D0B33...6AD4F`, `E218D2A7...07CB2`. Only the separate LeetCode
generation5 READY-only invocation is next. NowCoder remains pre-asset rejected;
D4 incomplete, D5 stopped.

Generation5 READY succeeded, then its only strict click produced safe evidence
E0 `1` followed by E0 `0` with no E1/E2/E3/queue/DB progress. Product E0 is a
30-second TTL fact pruned to empty. At that checkpoint, independent
post-adjudication changed the historical lane result from the immutable
receipt's `OBSERVER_INVALID` to **`PRODUCT_FAIL`**
(`exact_submit_e1_missing_before_e0_lifecycle_end`). Sections 14.33-14.34 now
supersede its current causal interpretation because the exact click-generated
submit cannot be safely bound to E1. Record:
`work/reports/v4-phase-d-d4-leetcode-generation5-post-adjudication.json`.
Both D4 lanes are stopped; no retry/new generation/NowCoder/product edit/D3
re-freeze/D5 is authorized. Next: frozen-candidate exact-E1 causal review.

That causal review now excludes the two user-suspected environmental causes
for generation5: the lane used one fixed profile, one zero-row database, and
one exact frozen dist, so stale parallel DBs/extensions were not in its
observation boundary. Current public LeetCode.cn frontend assets still contain
`POST /problems/{slug}/submit/` and `/submissions/detail/{id}/v2/check/`,
exactly matching the frozen adapter, but public assets do not prove which
authenticated runtime branch generation5 executed and therefore do not
exclude GraphQL/other protocol branching. The compile-error screen is a
post-submit verdict and does not explain a missing E1. The remaining boundary
is the actual protocol branch plus Chrome `webRequest` listener delivery and
its optional `documentId`/safe metadata guards. Plan section 14.26 now
requires an offline-only exact REST/listener/restart/documentId/redirect/E0
deadline matrix. Independent plan review is **`APPROVE`** with no HIGH/MEDIUM
for that offline-only matrix; characterization, another live action, and any
product repair remain unauthorized. D4/D5 remain stopped.

The §14.26 offline matrix is now independently **`APPROVE`**, no HIGH/MEDIUM:
worker `353/353`, independent changed-file `184/184`, with type/lint/dist/
privacy (`0 findings`)/diff/isolation green. It proves the modeled exact REST,
document identity, restart, redirect, listener, and E0 deadline behavior, but
does not reveal generation5's actual authenticated branch or callback
metadata. No production, manifest, dist, observer/runner, DB, or candidate
file changed.

To avoid another login or submission, §14.27 proposes one no-click reopening
of the existing generation5 profile solely to identify allowlisted public
static asset filenames/hashes and closed protocol-symbol booleans. It forbids
cookies/storage/account/DOM text/editor/body/header/token access, starts no
local server or SQLite, cannot satisfy E1/D4, and cannot flow into a click.
Current verdict: **`REVIEW REQUIRED`**; do not open the profile yet.

Independent review rejected §14.27 because reopening a persistent profile
necessarily uses/writes browser session state and static-asset identity cannot
adjudicate runtime protocol branching. It will not be executed. §14.28 now
proposes the narrower useful diagnostic: one extension-free strict click in
the existing logged generation5 profile, with no localhost/DB and only bounded
in-memory counters for exact REST, GraphQL path, other owned POST, or none.
Chrome-internal session use is acknowledged; programmatic cookie/storage/
account/header/body/DOM/editor/profile access is forbidden. The receipt cannot
satisfy E1/D4. Current verdict is **`REVIEW REQUIRED`**; no browser/click yet.

Independent review rejected the first §14.28 draft because the earlier action
authorization was consumed, the click promise was not covered by a total
deadline, extension disabling was not executable, and ordinary traffic was
underspecified. The revised draft requires a new explicit authorization, one
monotonic 15-second `Promise.race`, mandatory `--disable-extensions` with all
extension-load arguments rejected, and filtering to POST xhr/fetch before URL
classification. No browser/click is authorized yet.

After the cross-origin terminal rule was closed, independent §14.28 plan
review returned **`APPROVE`**, no HIGH/MEDIUM. This authorizes only offline
tool RED/GREEN; browser launch and the one diagnostic click still require
independent code approval and a new explicit action-time authorization.

The §14.28 tool is now independently **`APPROVE`**, no HIGH/MEDIUM, at hashes
`8D6196D6...ED85F9`, `FE4EC5FF...0CFC7C4`, and
`09CDB3B8...4E9295`. Final RED `42/44` became GREEN `44/44`; type/lint/syntax/
privacy (`0 findings`)/diff/isolation pass. No browser/network/live ran. The
sole remaining gate is a new explicit authorization for one extension-disabled
diagnostic click in the existing generation5 profile and one total 15-second
window; it is not D4 evidence.

That paragraph is now historical. The repaired Windows CLI was independently
approved at final SHA
`E50B8153C0F64A88B889F70D73BF17C182E3820BB26B53ED158CB132A235E029`,
and exactly one later extension-disabled diagnostic action consumed the
authorization. Receipt
`output/playwright/v4-protocol-characterization/protocol-characterization.json`
(SHA-256 `58DBB9CC062DC1B386EF60154ACF41B9320E6765D9B6229155323F1BCA6AD0BE`)
records a completed strict click, REST `0`, GraphQL-path `0`, other-owned
`many`, cross-origin `many`, unsafe `0`, and terminal
**`protocol_characterization_invalid`**. No retry or second click is allowed.

The official-public-bundle follow-up found eight literal POST sites across
five of 66 JavaScript assets. Static categories include REST submit enqueue,
telemetry, upload signature, code formatting, and run-code enqueue; separate
chunks also expose GraphQL clients. This only proves public code presence and
cannot identify the authenticated generation5 runtime branch or bind either
`many` bucket to the submit. The compile-error UI is downstream verdict
evidence, not the missing-E1 cause. The lane's fixed profile, zero-row DB, and
exact frozen dist exclude parallel stale databases/extensions from its
observation boundary.

Historical checkpoint status: protocol characterization **`REJECT /
OBSERVER_INVALID`**; generation5 was **`PRODUCT_FAIL /
exact_submit_e1_missing_before_e0_lifecycle_end`**. Sections 14.33-14.34
supersede the current interpretation with
`D4_CAUSAL_DIAGNOSTIC_UNADJUDICABLE`; D4 is incomplete and D5
stopped. Do not retry, launch NowCoder, widen the adapter, modify production,
or re-freeze D3. The next action is evidence/document reconciliation only
unless a new independently reviewed design can obtain safe submit-bound
protocol/listener evidence without another submission.

Independent final review: **`APPROVE`**, no HIGH/MEDIUM. Current-byte gates:
protocol `52/52`, seven-file exact-E1/product anchors `330/330`, typecheck
PASS, privacy `0 findings`, diff-check PASS, and protected product/candidate
diff empty. Full build/quality, browser, server, migration, and further live
actions were not run.

## Historical status (superseded): Revision 3 approved; generation-4 identity was still REVIEW REQUIRED

The generation3 LeetCode diagnostic was re-adjudicated correctly: the fixed
`epoch_result_surface_unchanged` error does not delete the product epoch, so
the receipt is `OBSERVER_INVALID`, not proof of a product defect or platform
block. Observer Revision 3 is independently **`APPROVE`** with no HIGH/MEDIUM.
It records exact E2 plus only that diagnostic as `e2_surface_pending`, waits a
bounded `315000ms`, transitions exact E3 to a `30000ms` delivery deadline, and
requires the error to clear only at exact ACK with SQLite `+4/+1/+1`. Exact
duplicate callbacks are idempotent; duplicate durable effects and all prior
identity/order/privacy gates still reject.

RED/GREEN evidence is `89/94`, then Commander follow-up `93/96`, then final
observer `96/96`; frozen product anchors are `174/174` (`270/270` combined).
Typecheck, targeted lint, both syntax checks, privacy (`0 findings`),
diff-check and protected-path isolation pass. Current observer/runner/test/d.ts
hashes are `61316815...207C2DB`, `60A304A4...4E3259`,
`B3753D1E...23CB65C8`, and `5EFA489D...E9E6A0D5`. Frozen dist is unchanged;
D3 was not re-frozen. No live/browser/server/login/build/commit/push occurred.

The consumed generation3 LeetCode lane remains terminal and may not be reset
or reused. Plan section 14.23 proposes generation4, LeetCode first, so the user
is never asked to log into two new windows together. Only after a LeetCode PASS
would NowCoder be prepared. That identity delta is currently
**`REVIEW REQUIRED`** and authorizes no READY, browser, login, click, or
submission. D4 is incomplete and D5 remains stopped.

Both generation3 READY-only receipts are valid:
`leetcode-readiness-1786559426411.json` and
`nowcoder-readiness-1786559535694.json`. The user interactively logged into both
exact isolated profiles; no cookie/credential/token/account data was read or
copied. Repeated login windows were an orchestration inefficiency and are not a
future requirement.

The authorized LeetCode lane consumed one strict click and produced
`leetcode-real-observation-failed-1786560268026.json`:
`OBSERVER_INVALID / observer_capture_error / epoch_result_surface_unchanged`,
final `e2_confirmed`, target `1/1/1/0`, extension `1/0/0/0`, SQLite `0/0/0`.
E0/E1 convergence and E2 worked; no E3/POST/ACK followed. Compile Error remains
allowed and is not the rejection reason. Exact action processes and server are
stopped, port 3000 is free, and ordinary Chrome remains running. First-failure
stop means NowCoder action count is zero. Preserve all generation3 evidence;
no retry/reset/replay/new submission is authorized. D4 completion is
**`REJECT`**, D5 remains stopped, and the next engineering action requires a
new written revision and independent review.

The replacement observation batch is bound exclusively to
`d4-revision2-generation3`. Independent final review found no HIGH/MEDIUM
issues. Commander reran observer `89/89`, frozen product anchors `174/174`
(`263/263` combined), typecheck, targeted lint, both syntax checks, privacy
(`0 findings`), diff-check, and protected-path isolation; all passed. Current
observer/runner/test/d.ts hashes are `4E697F11...B1F57A`,
`72D14F40...5BF896A`, `3E3E11A4...946233`, and
`10301E92...A829C`. The five frozen Task 26 dist hashes remain unchanged.

Generation2 assets remain immutable historical evidence and are rejected by
the current runner; they must not be reset, reused, or copied into generation3.
The next permitted operation is sequential generation3 READY-only preparation
with new empty profiles and isolated zero-row databases. No click, submission,
cookie, credential, token, or account-data copy is permitted. This is not D4
PASS, D5, RC, acceptance, or release.

Latest action evidence: generation-2 LeetCode consumed exactly one authorized
strict click and ended
`OBSERVER_INVALID / observer_target_rejected` at `e1_provisional`; receipt:
`output/playwright/v4-observation/leetcode-real-observation-failed-1786555212760.json`.
It records target `1/1/1/0`, queues `0/0/0/0`, SQLite `0/0/0`, and unchanged
frozen dist hashes. The user's screenshot shows the platform reached final
`Compile Error`. This is a valid D4 verdict category, so compilation failure is
not the acceptance failure; the observer terminated first because the exact
network E1 preceded the bubble-phase diagnostic E0 for the same click.
Historical DB/profile assets and other extension versions were not loaded.

The observer-only repair is independently **`APPROVE`** with no HIGH/MEDIUM
findings. A private one-shot capability binds the strict dispatch to the exact
lane and admits only matching LeetCode E1-provisional -> E0-after-E1. Deferred
snapshots deterministically replay through E2/E3/ACK; only proven ACK can
supersede a click-promise error, and ACK evidence/context close are finalized
exactly once. Success receipts now contain only closed counts/basis/state and
no identity or timestamp. Gates: observer `88/88`, frozen product anchors
`174/174`, combined `262/262`, typecheck/lint/syntax/diff green, privacy `0
findings`, protected diff empty. Current hashes: observer `45948FE4...E2BE9ED`,
runner `72D14F40...5BF896A`, test `077E4D20...8ECD02`, d.ts
`1A51483E...59283E6`; five Task 26 dist hashes are unchanged.

The approval is observer-only. It does not convert the failed receipt into a
D4 PASS or authorize reuse/retry of the consumed generation-2 LeetCode
profile. NowCoder action count remains zero because the batch stopped on the
first failure. Preserve the LeetCode profile/database/receipt as terminal
evidence. The next live attempt requires a new isolated profile/database and a
new READY under these reviewed observer bytes; never copy cookies,
credentials, or account data. D4 remains incomplete and D5 remains stopped.

Latest fixed-lane environment audit and READY-only attempt: both documented
per-platform profile/database pairs were preflighted after migration, each
pointer resolved to its adjacent non-symbolic `training-platform.sqlite`, and
each database reported `0/0/0`. Fixed profile inspection found exactly one
`location=8` unpacked extension record per lane, pointing to the exact
`.tmp/task26-exact-dist-aa1a572`; historical profile/database directories were
not loaded by the fixed runner and remain cleanup debt only. The exact fixed
LeetCode lane then ran with `--ready-only=true --authorized-submit=false` and
failed before READY with safe receipt
`output/playwright/v4-observation/leetcode-real-observation-failed-1786548934476.json`.
It binds the fixed profile/database identities and byte-identical five dist
hashes, classifies `OBSERVER_INVALID / epoch_result_surface_unchanged`, and
records target `e0/e1/submit/status=0/0/0/0`, extension
`confirmed/tombstones/outbox/quarantine=1/0/0/0`, and final SQLite `0/0/0`.
No click, submission, or action authorization was consumed; server PIDs
`52296/45408` were stopped, port 3000 is free, and NowCoder READY was not
attempted.

Static immutable-runtime review of
`extension/src/backgroundOrchestrator.ts:871-906` and `:1207-1359` shows E2
persists `confirmedSubmissions` before E3, while successful E3 removes the matching confirmed record and adds
the tombstone/outbox delivery path. The safe interpretation is stale delayed
same-profile durable state from an earlier observer termination or prior E2,
not a proven product defect or new submit. It cannot be used as a READY
baseline and does not invalidate the approved callback-arrival observer repair.
That adjudication and its disposable observer/unit fixtures are recorded
below; the next gate is independent review of the Option B recommendation. No
profile/DB reset, live replay, READY retry, or new authorization is requested.
D4 remains incomplete and D5 stopped.

Read-only adjudication is now complete for the fixed LeetCode stale state. The
actual receipt exposes only `confirmed=1` and deliberately omits the safe
identity fields needed to bind that record to the prior target/submission;
opening live profile storage was out of scope. A disposable observer fixture
proves the bounded choices without touching the real profile: exact expected
key is `recovery_candidate`, key/target mismatch is `wrong_identity`, and
missing binding/error or any durable side effect is `stale_unbound`. The fresh
baseline reducer still rejects the error-bearing confirmed snapshot, so this
diagnostic does not relax D4 or replay E3/ACK. RED was `1 failed / 70 passed`
(71 total); GREEN is observer `71/71`. Static E2→E3→ACK mapping is recorded in
§14.15/report. Current recommendation is **Option B**: treat the profile as
terminal evidence and defer to a new isolated profile/database plus separately
authorized action. No browser,
reset, replay, READY retry, submission, or new authorization occurred.

Reviewer follow-up found and closed a MEDIUM harness ambiguity: only the exact
allowlisted error `epoch_result_surface_unchanged` may qualify a recovery
candidate; `epoch_started_missing`, network, and other allowlisted errors now
return `stale_unbound/capture_error_mismatch`. RED was `1 failed / 70 passed`
(71 total); GREEN is `71/71`. The real receipt has the exact result-surface
error but lacks identity fields, so the fixture candidate is not live evidence.
At the pre-review checkpoint, Option B was `REVIEW REQUIRED`; that historical
status is superseded by the independent final `APPROVE` below. No replay,
reset, READY retry, action, or new authorization occurred.

Independent final review (2026-08-13) reran the post-fix observer and gates:
observer `71/71`, typecheck/lint exit `0`, both observer syntax checks exit `0`,
privacy audit `0 findings`, `git diff --check` exit `0` with known LF/CRLF
warnings only, and protected-path diff empty. It matched the observer-only
hashes and all five frozen Task 26 dist hashes recorded in the Revision 2
report. The historical MEDIUM exact-error ambiguity is closed; H/M findings
are none. Final verdict: **`APPROVE` for Option B**. This is evidence-only and
does not grant current real authorization, reset/delete/replay the fixed
profile or DB, or complete D4/restart D5. The next step is a new written
real-observation plan, then a new profile/database READY preparation and fresh
action-time authorization. No direct submission is permitted.

Latest observer-only closeout: the authorized RED test reproduced the false
terminal on callback-arrival E1-before-E0 (`67 passed / 1 failed`, 68 total).
The repair now records E1-only as bounded `e1_provisional` with safe
`e1Status=provisional`; a matching E0 converges only when the internal
authoritative chronology is `e0 observedAt <= E1 receivedAt`. E0-after-E1,
E2-without-E0, identity conflicts, duplicate effects, legacy V3 paths, and
privacy violations remain fail-closed; unresolved page close is the fixed
`observer_provisional_timeout` reason. GREEN evidence is observer `70/70`,
the four frozen product anchor suites `174/174`, combined `244/244`,
typecheck/targeted lint/two syntax checks/diff-check exit `0`, privacy audit
`0 findings`, and an empty protected-path diff. The five Task 26 dist hashes
are byte-identical and the immutable product candidate remains unchanged.
This amendment has now received independent final `APPROVE` with no HIGH or
MEDIUM findings; no live retry, NowCoder submission, or D5 action occurred and
the previous consolidated authorization is expired.

The first independent review rejected one remaining parity gap: an unrelated
allowed callback between E1 and E0 could erase the persistent page's private
chronology metadata. A fake-Chrome RED test reproduced this as
`69 passed / 1 failed` (E0 expected `e0-before-e1`, received
`not-observed`). The entrypoint now carries that bounded metadata across every
allowed callback. GREEN is observer `70/70`, product anchors `174/174`,
combined `244/244`; typecheck, targeted lint, two syntax checks, privacy audit
`0 findings`, diff-check, and protected-path isolation pass. Serialized events
contain only safe target-order enums and no timestamps or raw request/document
fields. The independent final review reran observer `70/70` plus product
anchors `174/174` (`244/244` combined), found no HIGH or MEDIUM issue, and
matched the observer-only hashes and all five frozen dist hashes in the
Revision 2 report. Final verdict: **`APPROVE` for the provisional-E1 observer
amendment only**. This does not restore the expired authorization, authorize
live retry, NowCoder, or D5; D4 remains incomplete. The next action is to form
a new real-observation plan and obtain new explicit action-time authorization.
No direct submission is permitted from this approval.

Generation-2 observer-only amendment (2026-08-13) has now received independent
final review **`APPROVE`** with no HIGH or MEDIUM findings. The runner requires
exactly one closed generation token,
`d4-revision2-generation2`; missing, unknown, historical `d4-revision2`,
duplicate, cross-generation, wrong-platform, reuse-mismatch, and
symlink/junction paths fail closed. Only these future lane roots are allowed:

```text
.tmp/v4-live-observation-profiles/d4-revision2-generation2-leetcode
.tmp/v4-live-observation-profiles/d4-revision2-generation2-nowcoder
.tmp/v4-live-observation-db/d4-revision2-generation2-leetcode/server-db-path.txt
.tmp/v4-live-observation-db/d4-revision2-generation2-nowcoder/server-db-path.txt
```

Old `d4-revision2-*` paths remain readable historical evidence only. READY and
eventual action receipts bind this generation with profile/database SHA-256
identities; no raw paths or private platform fields are emitted. The written
next sequence remains sequential READY-only (LeetCode, then approved
NowCoder), with `--ready-only=true --authorized-submit=false`, no submission,
no click, no replay/reset/delete, and no current action authorization. A first
failure stops the sequence; any later action requires fresh action-time
authorization after an independent review.

Generation-2 evidence is RED `1 failed / 76 passed` (77 total), then GREEN
observer `77/77`; frozen product anchors are `174/174`, combined focused
`251/251`. Typecheck, targeted ESLint, both observer syntax checks, privacy
audit (`0 findings`), `git diff --check`, and protected-path diff all pass.
Current observer-only hashes are:

```text
scripts/v4-live-observation-observer.mjs  8B2D68B2C93274AF4F01667630F95EB125D352AE152E5AE35688D5F332C37D79
scripts/v4-live-observation.mjs          6859FB997C7F379B9C4B3CBABEA2DCF7EB62F160A9544532E59B2102BCCA4E46
tests/unit/v4LiveObservationObserver.test.ts 09AE1AC4CB595FE16D042AEA8F7B6C8C93E4397B9A928384982366C1B8D2DA70
tests/unit/v4LiveObservationObserver.d.ts E76687FC485200E3C7C3A2350042F60E593494071652FCE42DB3E0DE68DDCE14
```

Frozen Task 26 dist hashes remain unchanged:

```text
manifest.json        A85C3275D559BD46AAA034FEEA9B14EAFECFC6F56341713B2AFB8B024E2B3E64
background.js         9222BC90DB397B37499DE119482958BEAF1DD1A6E3136F7546A475676EC46C2D
content.js            8AC66A0B8B23AA2F5273D1687550226926A4D3791CBF1C1C3786B9D20FD785FC
popup.js              F863C9758EBF2FF464634D6FF986D3F296017C8A5A37D45A3692FB3F1B80240D
main-world-bridge.js  4D89A80F0351295EE1C0CD173BE107080983868D18510D028854695EACEE3943
```

Independent review reran observer `77/77`, frozen product anchors `174/174`,
and combined focused evidence `251/251`; it confirmed the corrected test SHA
`09AE1AC4CB595FE16D042AEA8F7B6C8C93E4397B9A928384982366C1B8D2DA70` against
`Get-FileHash`, with all observer-only hashes and five frozen Task 26 dist
hashes unchanged. Final verdict: **`APPROVE` for generation-2 observer-only
amendment and isolated preparation only**. It allows only new generation-2
profile/database preparation and sequential READY-only work. The user's
standing default action approval still requires each lane's own valid READY,
allows at most one action per lane, and stops the sequence at the first
failure; no cookies, credentials, or account data may be copied or exported.
This does not complete D4, restart D5, or constitute RC/release/user
acceptance; the immutable product candidate, extension source/runtime/
manifest/schema/build/adapter/dist, and default database remain unchanged.

The following older Revision 2 preparation and review paragraphs are retained
as historical evidence only. They are superseded by the LeetCode failure,
callback-arrival repair, and expired authorization above; no sentence below
grants a current READY retry, platform action, or submission.

The sole detailed Phase D plan now uses an invariant-based D4 acceptance
contract. Product candidate `aa1a572c3913b35dd3f0391f849dab66e79c56a2`
and its exact Task 26 dist remain immutable. The observation tool is versioned
separately and may be repaired under a strict harness-only allowlist without
forcing another D3 re-freeze. Legal E0/E1/E2 coalescence is accumulated as a
causal fact set; separate millisecond snapshots, callback count/order, and
manual popup screenshots are diagnostic rather than hard gates. Hard gates are
exact product/artifact identity, isolated browse-only baseline, one authorized
target action, exact causal binding, one final verdict (including Compile
Error), exactly one bundle/POST/ACK, SQLite `+4/+1/+1`, and final queues
`0/0/0` with no blocking diagnostic.

The remaining user-interaction budget is deliberately small: login in the
isolated windows if needed, then one consolidated action-time authorization
covering at most one named LeetCode submission and one exact approved-pilot
NowCoder submission. The Commander owns all setup, pairing, navigation,
observation, evidence, cleanup, and reporting; no screenshots or repeated
status messages are requested from the user. The fixed localhost origin means
the two READY checkpoints are prepared sequentially with fixed per-lane
profiles/databases and bounded receipts, then silently revalidated one at a
time after authorization; simultaneous live readiness is not claimed. The
harness-only implementation passes observer `67/67`, focused causal regression
`241/241`, typecheck,
targeted lint, syntax checks, privacy audit `0 findings`, diff check, candidate
isolation, and five frozen-hash rechecks. It accepts legal E0/E1/E2 coalescence
and the production consume-style E3/ACK chain while locking the E2 submission
key; contradictions, duplicate effects, legacy V3 click causality, and privacy
violations remain terminal. Independent code/privacy/scope review returned
`APPROVE` with no HIGH/MEDIUM findings for causal observer Revision 2. The
sequential READY runner amendment also received follow-up independent
`APPROVE` with no HIGH/MEDIUM findings. Final real D4 readiness preparation may
now begin on the unchanged candidate/dist, but no submission is authorized.
No new live action has occurred.

The exact `241/241` evidence is observer `67` plus frozen-product anchors
LeetCode adapter `105`, NowCoder network `28`, verdict candidate coordinator
`21`, and verdict candidate flow `20`; the Revision 2 report records both
reproducible commands.

Sequential preparation then produced a LeetCode READY receipt. The first
NowCoder READY attempt stopped fail-closed at browse-only with
`OBSERVER_INVALID / observer_storage_key_rejected`, queues and SQLite `0/0/0`,
and no submission. The cause is the known non-causal V4 `b3WitnessState`
navigation control key. A narrow observer-only rule now ignores that key name
without reading its value; unknown/credential/V3/mixed illegal keys remain
terminal. Follow-up independent review returned `APPROVE` with no HIGH/MEDIUM
findings and authorizes one NowCoder READY retry only, not a submission.

The retry succeeded. LeetCode and NowCoder now both have bounded READY receipts
at `output/playwright/v4-observation/leetcode-readiness-1786526390512.json`
and `output/playwright/v4-observation/nowcoder-readiness-1786527061654.json`.
Each records browse-only target `0/0/0/0`, queues `0/0/0`, SQLite `0/0/0`, and
identical frozen hashes. Both browsers are closed and port 3000 is free. The
next and only gate is one consolidated action-time authorization; no submission
has occurred.

The consolidated authorization was granted, but desktop window ownership could
not be safely bound and the outer runner timed out at browse-only. SQLite stayed
`0/0/0`, so no submission occurred and the action budget is unconsumed. A
closed runner mode now clicks exactly one fixed platform selector after READY
and closes after ACK without reading code/editor content. Independent follow-up
review is required before executing it.

Independent review approved that runner amendment with no HIGH/MEDIUM
findings. The one authorized LeetCode strict action then ended
`OBSERVER_INVALID / observer_transition_unadjudicable`: safe evidence shows one
exact submit E1, but E0/E2/delivery remained zero, all queues were zero, and
SQLite stayed `0/0/0`. Receipt:
`output/playwright/v4-observation/leetcode-real-observation-failed-1786528735567.json`.
The E1 consumes the LeetCode action budget; the consolidated authorization
expired, so NowCoder was not submitted. No retry occurred. D4 remains
incomplete and D5 is stopped.

Task 27 attempted the first fresh LeetCode observation on immutable candidate
`aa1a572c3913b35dd3f0391f849dab66e79c56a2`. The disposable profile and
zero-row database reached `OBSERVER_ARMED=1`, `BROWSE_ONLY=1`, and `READY=1`.
After explicit action-time authorization, the user manually submitted
`merge-two-sorted-lists` once and accidentally closed Chromium after the result
appeared. The observer terminated fail-closed with `observer_stage_rejected`;
its last accepted safe state remained browse-only with target E0/E1/submit/
status `0/0/0/0`, all extension queues zero, and SQLite `0/0/0`. All five
frozen hashes were unchanged. Evidence:
`output/playwright/v4-observation/leetcode-real-observation-failed-1786450433237.json`.
The dedicated server is stopped and port 3000 is free. No retry occurred.

The receipt contains no verdict classification and cannot attribute this
failure to `Compile Error`. Compile failures remain valid final training
outcomes and must not be filtered without a separate product decision and
causal evidence. The only next action is the harness-only RED/GREEN gate for
separated and coalesced E0/E1/E2 plus a bounded rejection receipt, followed by
independent code/privacy review. Production runtime, verdict taxonomy,
real-platform actions, D5, RC, acceptance, and release remain stopped.

### Historical Task 22/23 context

The superseded pre-Revision-5 immutable candidate was
`a911425a415db2ee374430ced62edcaa7b786866`. Its exact validator exited `0`:
root unit `2393/1`, app E2E `25/25`, extension unit `1587/1587`, extension E2E
`53/1`, production build `20/20`, privacy `0 findings`, readiness `PASS`, clean
pre/post identity, and preserved default-database metadata. The exact dist and
five hashes are frozen in
`work/reports/v4-phase-d-task22-nowcoder-repair-refreeze-2026-08-11.md`.

The candidate contains the reviewed exact `/acm/problem/list` reserved-route
repair and the test-only composite service-worker waiter repair. The latter
adds no retry or timeout and passed independent code review with no HIGH or
MEDIUM findings. D3 is complete. Fresh same-SHA final delivery was observed on this exact
candidate/dist: LeetCode `cn/741526004` and approved-pilot NowCoder
`84444687` each produced exactly one POST, four events, one session, one
attempt, ACK, and zero final waiting/outbox/quarantine. The blocked-platform
readiness/drift lane passed 292/292 without submissions. Independent F1 review
then rejected D4 completeness because contemporaneous browse-only, E1, and E2
stage states were not retained. Revision 3 is independently approved for a
bounded observation-harness remediation; D5 is stopped. Evidence:
`work/reports/v4-phase-d-task23-same-sha-observations-2026-08-11.md`. Nothing here is RC, acceptance, release, push,
PR, or deployment.

Task 24 Revision 3.2 first failed closed before submission when normal browse
activity changed raw `transientE1`. Revision 4 now counts only exact target E0
and submit/status E1 entries, keeps GraphQL noise and raw session cardinalities
out of evidence, and makes submit-like target mismatch terminal. Its final
observer suite passes 31/31 with typecheck, targeted ESLint, privacy audit `0
findings`, diff-check, and candidate isolation all green. Two independent
code/privacy reviews returned `APPROVE` with no HIGH or MEDIUM findings.
Candidate/runtime/dist remain unchanged. A fresh isolated LeetCode observation
is now the only next action; D4 and D5 are still incomplete.

That live action has now occurred once and failed. After explicit action-time
authorization, the user submitted intentionally empty code for
`merge-two-sorted-lists`; public submission `cn/741573842` returned Compile
Error. Popup state was waiting `1`, outbox/quarantine `0/0`, no successful
sync, and `epoch_started_missing`. The observer stopped with
`observer_stage_rejected`, SQLite remained `0/0/0`, and all five dist hashes
were unchanged. No retry or second submission occurred.

Static inspection proves the sufficient control-plane contradiction: STARTED
uses the exact submit request ID, while GraphQL-result E2 sends CONFIRMED using
the GraphQL request ID. Revision 5 is now review-required for a causal RED,
exact submit-ID binding, and a bounded failure-receipt correction. Production
implementation and further live runs are unauthorized. Any production repair
invalidates candidate `a911425...` and returns the work to D3 re-freeze before
both platform observations restart.

Revision 5 has since reached local GREEN without a live retry. The exact submit
request is now the sole epoch identity; check/result/GraphQL/submit wrappers
with terminal or conflicting state are excluded, GraphQL is corroboration
only, and both production confirmation branches use one persistence-before-
exact-delivery seam. The observer writes a bounded safe failure receipt.
Focused production/observer tests pass `261/261`, the observer suite passes
`32/32`, typecheck and targeted lint pass, and privacy audit reports `0
findings`. Independent code and privacy reviews are both `APPROVE` with no
HIGH/MEDIUM findings. Candidate `a911425...` remains historical and invalid
for further D4 observations. No platform retry is authorized before a new
immutable candidate and exact dist are frozen.

At the historical pre-Task27 checkpoint, Task 26 had re-frozen immutable candidate
`aa1a572c3913b35dd3f0391f849dab66e79c56a2`. Its exact validator exited `0`:
root `2430/1`, app E2E `25/25`, extension unit `1591/1591`, extension E2E
`53/1`, build `20/20`, privacy `0 findings`, readiness `PASS`, clean candidate
identity, and preserved default DB metadata. The exact dist is
`.tmp/task26-exact-dist-aa1a572`; hashes are recorded in
`work/reports/v4-phase-d-task26-exact-submit-refreeze-2026-08-11.md`.
No platform submission occurred during re-freeze. At that checkpoint the next
action was a fresh LeetCode observation; Task 27 and Acceptance Contract
Revision 2 above supersede that instruction. D4 and D5 remain incomplete.

### Superseded Task21 failure context

The immutable repaired candidate is
`4e7a47bfc22fece4aa60e4bab2f4223668be480b`. It adds strict content-runtime
coverage for the real LeetCode.cn `/submissions/<digits>/` route, derives
identity only from one visible leaf `a.cursor-text[href]`, and preserves an
armed epoch across SPA navigation only when post-navigation detection proves
the exact same platform/problem identity. Null, ambiguous, unsupported, and
cross-problem navigation remain fail-closed.

Its exact candidate validator exited `0`: root unit `2372/1`, app E2E `25/25`,
extension unit `1567/1567`, extension E2E `53/1`, production build `20/20`,
privacy `0 findings`, readiness `PASS`, stable pre/post-gate identity, and
preserved default-database metadata. Frozen dist hashes and the full receipt
are recorded in
`work/reports/v4-phase-d-task20-result-route-repair-refreeze-2026-08-10.md`.
Task 21 ran against the exact candidate/dist in one fresh paired extension and
isolated database. LeetCode passed exactly once: one POST, four events, one
session, one attempt, ACK, and zero waiting/outbox/quarantine. The blocked-
platform readiness/drift lane passed 284/284 without submissions. The approved
NowCoder pilot `acm/contest/18839/1001` failed after durable E2: the exact final
result document showed stable submission `84438785` and `答案正确`, but waiting
remained 1 with no E3 bundle, POST, ACK, or SQLite increment. The transient
E1-only popup state was not separately observed. D4 is incomplete and D5 has
not started. Evidence:
`work/reports/v4-phase-d-task21-same-sha-automated-observations-2026-08-10.md`.

The first unproven alias hypothesis was rejected by plan/code review and kept
only as a fail-closed lesson. The user then disabled capture and reopened the
exact result. Sanitized live evidence proves the real first divergence: global
navigation `/acm/problem/list` is incorrectly parsed as problem identity
`acm/problem/list`; together with the real pilot breadcrumb it makes the
unchanged exactly-one resolver return `null` before candidate emission.

The revised causal RED fails exactly 3 of 270 focused tests: navigation
`problem/list` conflicts with the pilot breadcrumb, DOM-only `problem/list` is
fabricated as a problem, and URL-only `problem/list` is fabricated as a
problem. Revised plan, code-boundary, and privacy reviews all returned
`APPROVE`; test-first implementation of exact reserved-route rejection is
complete. Focused tests pass 406/406 with typecheck, targeted lint, and privacy
audit `0 findings`. Post-implementation code and privacy reviews are both
`APPROVE`, with no HIGH or MEDIUM findings. This failure context does not
certify the new candidate.
Plan:
`docs/superpowers/plans/2026-08-10-v4-phase-d-d4-nowcoder-e3-identity-repair.md`.

Task 16 failed twice, including once with a fresh exact-dist extension and
fresh isolated database. Both new Accepted submissions produced zero capture
POSTs/rows and the fixed `epoch_target_delivery_failed` diagnostic. The
failure and causal RED are retained in
`work/reports/v4-phase-d-task16-leetcode-automated-observation-2026-08-10.md`.
The prior `f18eddf4...` candidate and both waiting states are historical only.

## Previous Status (2026-08-10 V4 Phase D Task 15 COMPLETE; Task 16 next)

Task 15 is engineering-complete on immutable candidate
`f18eddf4cb4d7dd24c439b2dea5917793839e6a2`. Its exact candidate validator
exited `0` with unit `2353/1`, app E2E `25/25`, extension unit `1549/1549`,
extension E2E `53/1`, production build `20/20`, privacy `0 findings`, readiness
`PASS`, stable candidate identity, and preserved default-database metadata.
The generated exact dist hashes are recorded in the Phase D master plan and
`work/reports/v4-phase-d-task15-candidate-refreeze-2026-08-10.md`. Port 3000
has no listener.

Task 16 is now the only next action. Before any platform action it must verify
HEAD lineage, confirm no runtime/dist drift, and recheck all five hashes. The
observation is a real-platform automated engineering observation, not a
natural user submission, D5 approval, RC, acceptance, or release.

The first Task 15 freeze commit
`0c263ccf2459b2dda7897ad899e0c3fd439876ec` is **invalid**: its exact
candidate validator exited `1` because root `npm test` recursively discovered
two ignored historical Git worktrees and their nested third-party tests. Those
worktrees have pre-existing dirty reports and were not reset, removed, or
modified. The causal RED passed 13 tests and failed 2; adding `.worktrees/**`
to root Vitest isolation plus classifying `vitest.config.ts` as a D3-owned path
now passes 15/15, typecheck, targeted ESLint, and diff-check. This is a test-
gate repair only; runtime, protocol, manifest, permissions, build artifacts,
migrations, and the default database are unchanged.

Focused code/privacy/plan re-review returned `APPROVE` with no findings and
confirmed the effective root test list contains no `.worktrees` entry without
excluding real root tests. A new candidate commit/SHA and fresh exact validator
run are now required. No dist hash from the failed candidate is valid evidence,
and Task 16 browser work has not started.

Tasks 13 and 14 are engineering-complete at `fe36f6b4770d3d929479464c03e8bea6dbb97ba9`
and `0f695ddfad6989e407424feff457d28d081d657b`. Task 15 pre-freeze gates now
pass on their clean documentation-reconciled lineage: the combined focused
suite is 507/507; privacy audit is `0 findings`; adapter readiness is `PASS`;
`extension:check` passes 47 files / 1549 tests plus production build/parity;
and exact-dist extension E2E passes 53 with 1 known harness skip. The default
database remains at the recorded 479232-byte / 2026-07-23T15:56:38.8411343Z
metadata baseline.

Independent code and privacy review returned `APPROVE` with no findings. Plan
review first returned `REJECT (HIGH)` for stale non-archived Task 14 status in
this handoff; those sections and the current E2E count were reconciled without
a runtime change, and plan re-review returned `APPROVE`. All three pre-candidate
verdicts are now `APPROVE`. The next commit freezes the new candidate tree
using only the D3-classified master plan and handoff paths. The candidate
validator must then rerun the complete quality gate and prove exact HEAD, clean
worktree, privacy/readiness, and database preservation before exact dist hashes
are recorded. Task 16 browser work has not started. This is not D4 delivery
evidence, D5 approval, RC, acceptance, or release.

## Previous Status (2026-08-10 V4 Phase D D4 Tasks 13-14 engineering COMPLETE; Task 15 next)

Task 14 is implemented at
`0f695ddfad6989e407424feff457d28d081d657b` and independently `APPROVE`
with no findings. New LeetCode verdict candidates carry an additive strict
`submitRequestId`; the coordinator binds only that exact lifecycle and
revalidates the complete identity, status, stable-submission, and chronology
tuple without a latest-by-time fallback. Legacy candidates remain readable
without a fabricated request ID, but a matching later E1 terminalizes a stale
pre-E1 candidate immediately without consuming confirmed state or suppressing
an armed candidate. Restart recovery re-reads authoritative storage after E3
recovery and replays only an exact unfinalized `CONFIRMED` to the original
tab/frame/document; it never fabricates `STARTED` or a baseline.

The Task 14 focused lane passed 228/228 tests, typecheck, targeted ESLint, and
diff-check. Identity-bearing historical verdict diagnostic patterns were
removed from the privacy allowlist; the reviewed fixed diagnostic enums are the
only accepted submit-epoch/coordinator values. Full extension gates, privacy
audit, build/dist, D3 candidate validation, and browser observation remain
deliberately unrun until Task 15. Task 15 must now run the complete gates and
independent code/privacy/plan reviews, then freeze and validate a new immutable
candidate SHA and exact dist hashes before Task 16. This is engineering
evidence only, not D4 delivery, D5 approval, RC, acceptance, or release.

Evidence: `work/reports/v4-phase-d-task14-exact-candidate-binding-2026-08-10.md`.

## Previous Status (2026-08-10 V4 Phase D D4 Task 13 engineering COMPLETE; Task 14 next)

Task 13 is implemented at
`fe36f6b4770d3d929479464c03e8bea6dbb97ba9` and independently `APPROVE` after
two review rounds. The former intentional RED is now a green regression. The
LeetCode runtime receives exact E1 `STARTED` and persisted-E2 `CONFIRMED`
controls, evaluates stable narrow DOM-node proof before legacy text dedupe, and
emits one request-bound candidate only after legal chronology is established.
Same-problem epochs are exclusive; bounded superseded markers also prevent
A/B, duplicate, out-of-order, and full-registry legacy escapes.

The approved Task 13-16 contract is in
`docs/superpowers/plans/2026-08-06-v4-phase-d-d4-e3-candidate-coordinator-repair.md`.
Task 12 evidence is recorded in
`work/reports/v4-phase-d-task12-plan-review-2026-08-10.md`; Task 13 evidence is
`work/reports/v4-phase-d-task13-submit-epoch-control-2026-08-10.md`.
It freezes exact tab/frame/document delivery, exact `submitRequestId`, stable
DOM node identity, a 32-entry/5-minute in-memory epoch bound, fixed no-identity
diagnostics through existing `lastCaptureError`, strict chronology, legacy
fail-closed compatibility, and no new permission/storage/API/SQLite/polling
surface. Task 15 must create and validate a new immutable candidate SHA and
exact dist hashes before Task 16.

The Phase D master plan now classifies the authorized LeetCode/NowCoder browser
actions as **real-platform automated engineering observations**. Their PASS is
not a natural user submission, user acceptance, RC, or release. D4 engineering
evidence must pass on one new candidate SHA before D5 F1-F4; after four
independent APPROVE verdicts, the process stops at the user's final acceptance
gate. Task 13's Commander-owned focused lane passed 338/338 tests, typecheck,
targeted ESLint, and diff-check. Full gates and dist remain deliberately
deferred to Task 15. Task 14 is the next sequential action.

## Status (2026-08-09 V4 Phase D D4 coordinator repair Tasks 0-10 complete; 9th observation FAILED)

The D4 E3 candidate/E2 coordinator repair (Tasks 0-10) is implemented,
committed, and gate-verified: implementation `a9515a8` (`fix(v4): surface
expired diagnostics and pin graphql coordination`), doc reconciliation
`a1aeda0`, base `3246713`. Gates: focused 4 files 105/105; full extension
unit suite 45 files / 1514 tests; `extension:check` exit 0; `extension:e2e`
53 passed / 1 known skip; privacy audit `0 findings`. Plan:
`docs/superpowers/plans/2026-08-06-v4-phase-d-d4-e3-candidate-coordinator-repair.md`.
This is not RC, acceptance, or release.

**The 9th real natural observation FAILED on 2026-08-09** (merge-two-sorted-
lists, `cn/741081653`, Accepted). The event-driven revival from the 8th
observation worked as designed — E2 WAS written (confirmedAt
08:43:52.814Z, record present without `finalizedAt`), E3 WAS recorded
(lastE3At 08:43:53.728Z, `transientUnmatchedE3` empty), and the new JSON-
array `candidateId` identity encoding held in the wild — but no bundle was
produced: popup waiting stayed 1, `captureOutbox` empty, no
`POST /api/capture/attempts` in the server log, SQLite
`capture_events=0 / training_sessions=0 / training_attempts=0`.

First divergent layer (per failure protocol): candidate creation in
`extension/src/contentRuntime.ts`. The LeetCode.cn SPA restored a historical
"Accepted" result panel for this previously-practiced problem; after a null
phase the runtime misread it as a genuine transition and emitted the
candidate at 08:43:49.309 — 2.3 s BEFORE the real submit E1 (08:43:51.614).
The real submission's result was also "Accepted", so the same-text dedupe
(`contentRuntime.ts` lines 206-211) suppressed the correct candidate
forever. The coordinator then failed closed by design
(`selectEligibleSubmitLifecycles` requires `received <= observed`; the only
candidate predates every submit lifecycle), leaving the candidate `pending`
until 5-minute TTL expiry, the confirmed record unfinalized, and delivery
never occurring.

Failure protocol was followed: no timeout increase, no polling, no chronology
weakening, no immediate patch, evidence exported. Required next step (not
yet authorized): a new RED test covering "repeat submission of the same
problem with a previous result panel on the page" must fail before any
production change; then this plan file must be revised and reviewed. One
failed observation does not authorize an architectural change.

## Previous Status (2026-08-06 V4 Phase D D4 E3-confirmed race fix implemented; delivery unverified)

The D4 E3-confirmed race fix is implemented and verified through automated
gates, but end-to-end delivery is NOT yet confirmed: real natural observations
7 and 8 on LeetCode.cn both failed closed. Plan:
`docs/superpowers/plans/2026-08-06-v4-phase-d-d4-e3-confirmed-race-fix.md`.

Evidence chain (same candidate `509faf0` build lineage, rebuilt
`extension/dist`):
- Observation 6 (next-permutation, `cn/740549003`, Wrong Answer/failed,
  `2026-08-06T10:53:01Z-10:53:03Z`) delivered one bundle to the local server
  (one `POST /api/capture/attempts` 200, one SQLite training attempt) — the
  baseline where E2 happened to be written before the verdict candidate.
- Observation 7 (longest-substring-without-repeating-characters, after
  reloading the rebuilt dist): popup waiting 5→6, sync-queued 0, quarantined 0,
  blocking reason exactly `verdict candidate unconfirmed:
  leetcode:longest-substring-without-repeating-characters` (the NEW
  diagnostic). The E2 confirmation WAS eventually written (waiting +1) but
  after the original 3 s poll window expired. No server request; no bundle.
- Observation 8 (reverse-integer, no extension reload, 20 s poll window):
  identical failure mode — waiting 6→7, blocking reason `verdict candidate
  unconfirmed: leetcode:reverse-integer`; E2 written after the 20 s window.
  No server request; no bundle. This proved window enlargement alone is not
  sufficient.

Final repair (implemented 2026-08-06, verified by gates only):
- Event-driven revival: `chrome.storage.onChanged` now reacts to
  `confirmedSubmissions` changes and re-schedules the pending verdict-candidate
  attempt immediately (pure helper `storageChangeRevivesVerdictCandidate`
  next to `shouldRetryLeetCodeVerdictCandidate`).
- Poll exhaustion no longer un-arms the pending recheck; the closed diagnostic
  (`lastCaptureError`) is still recorded on exhaustion. No new storage keys,
  no schema/migration/manifest change, no adapter policy change.
- Gates: `npm run typecheck` exit 0; focused
  `tests/unit/extensionLeetCodeVerdictRetry.test.ts` 7/7; eslint exit 0;
  `npm run extension:check` exit 0 (44 files / 1421 tests, MV3 build PASS,
  dist parity PASS); privacy audit 0 findings.
- A 9th real natural observation is still required to confirm end-to-end
  delivery (bundle → outbox → POST /api/capture/attempts → SQLite row).

This is not RC, acceptance, or release. D4 same-SHA observations and D5 F1-F4
still require separate user authorization.

## Previous Status (2026-08-04 V4 Phase D D3 candidate engineering complete)

V4 Phase D D1 engineering gates pass on the uncommitted working tree after the
user approved a one-time, non-precedential D1-U RED-provenance exception. The
focused D1-U matrix is `27/27` GREEN, exact production-dist D1-E is `5/5`,
D1-R passes, D1-X is `42 files / 1406 tests`, and the canonical quality gate
exited 0. This is an engineering-gate result, not D1 phase completion, RC,
acceptance, or release. Evidence:
`work/reports/v4-phase-d-d1-upgrade-reliability-2026-08-03.md`.

D1-C is complete after a user-authorized headed isolated Chromium observation
passed `5/5` and direct evidence inspection confirmed all lifecycle, hash,
API/ACK, SQLite, and preservation requirements. Evidence:
`work/reports/v4-phase-d-d1-c-disposable-observation-2026-08-03.md`. The earlier
Chrome `150.0.7871.187` real-profile debug remains excluded from D1-C evidence;
its residual development extension was subsequently removed and temporary tabs
were closed. No real OJ submission or default database edit/write occurred;
default DB metadata was read-only compared and unchanged. The independent final
D1 review returned `APPROVE` with no blocking or important findings. D1 phase is
complete. D2's first independent review returned `CHANGES REQUIRED`; the
remote-endpoint, current/legacy raw-error, AST/wrapper, manifest/dist link, and
fixture findings are now repaired after two review rounds with 35/35 audit
tests, 68/68 focused product privacy tests, 43 files / 1412 extension tests, and
`0 findings`. The final independent privacy review returned `APPROVE`, and the
canonical quality gate passed. D2 is complete. D3 candidate preflight then
completed under explicit user authorization. The implementation candidate is
commit `509faf0e60532cf565a6a57aa796b96bc1053f38`
(`feat(v4): harden Phase D capture reliability`); its final documentation
reconciliation is the current candidate HEAD. The final candidate gate is
bound to the full current HEAD SHA and is engineering evidence only, not RC,
acceptance, or release. No push or PR has occurred.

## Previous Status (2026-08-02 V4 Phase C C0-C5 engineering complete)

Phase C C5 is complete on `feature/v1-followup`. The new isolation suite proves
owner-only LeetCode/NowCoder request interpretation, platform-namespaced same
raw submission IDs, durable confirmed/outbox preservation, explicit terminal
readiness for every platform, and no production Fake OJ registry claim. The
orchestrator no longer accepts V3 submission-intent or V3 verdict-fallback
events; unsupported DOM candidates are dropped unless an adapter-owned V4 policy
emits E3. Initialization retains only legacy-key read/count/delete cleanup, and
completed historical bundles remain deliverable. Evidence:
`work/reports/v4-phase-c-c5-closeout-2026-08-02.md`.

## Previous Status (2026-08-02 Phase C C4 Luogu `V4_BLOCKED`)

Phase C C4 is terminally `V4_BLOCKED` on the uncommitted working tree of
`feature/v1-followup` at base HEAD
`a24e158448c3ccf3e1cde6e380e0c441eff87342`. Revision 3 was explicitly
approved. Its closed pre-storage Luogu pathname grammar passed before the
exact production extension observed one natural P1001 submission.

The sanitized transcript contains three lifecycle records for XHR
`POST /fe/api/problem/submit/P1001`, including HTTP 200, all in document
`0B0F2A7605D410D910DF94BF4E01ADAE`. The browser landed on numeric record path
`/record/290292547` in document `4BA4F019442B690633DAF065F40513C7`.
Navigation witnesses remained zero, and no redirect, lastRecordId request,
record request, or approved bridge bound the two documents. Tab/time/latest/
highest/account inference is forbidden, so no legal E2 exists and no Luogu
network adapter was implemented. Evidence:
`work/reports/v4-luogu-c4-blocker-2026-08-02.md`.

C5 cross-platform isolation and migration-scaffolding audit is the next
sequential task after terminal C4 gates agree. No commit or push has occurred.

## Previous Status (2026-08-02 Phase C C3 Codeforces `V4_BLOCKED`)

Phase C C3 is terminally `V4_BLOCKED` on the uncommitted working tree of
`feature/v1-followup` at base HEAD
`a24e158448c3ccf3e1cde6e380e0c441eff87342`. The user prepared their own
Codeforces submission on `/problemset/submit/`; after an immediate ready
handshake, the exact preflight production extension armed an authenticated
five-minute session with zero records. The user clicked the final Submit once,
the browser moved to `/problemset/status`, and the user confirmed the
submission entered the status page. The extension retained zero records and
zero navigation witnesses before explicit stop.

The blocker is structural: Codeforces uses a traditional main-frame form
navigation, Chrome's official `webRequest` contract omits `documentId` for
frame navigation, and the approved observer rejects missing document identity.
The landing path exposes neither stable numeric submission identity nor exact
contest/problem identity. Status-row/account/latest/highest/nearest-time/query
inference is forbidden. No Codeforces network adapter or fixture was created.
Authoritative evidence:
`work/reports/v4-codeforces-c3-blocker-2026-08-02.md`.

Terminal gates pass: focused 433/433, readiness 21/21 plus CLI PASS, frozen
AtCoder hashes 9/9, `extension:check` 39 files / 1,326 tests, and the full
nine-stage quality gate with 2,075 unit tests, 25 app E2E, 48 runnable
extension E2E, and production build. One Windows capability case and one known
extension harness case remain skipped.

C4 Luogu is now the next sequential wave. Its delta plan Revision 3 is at
`docs/superpowers/plans/2026-08-02-v4-luogu-network-capture-migration.md` and
is pending an independent `APPROVE` or `REJECT` verdict. The plan preserves
the historical public-DOM blocker, treats authenticated evidence as
non-certifying, and requires stable numeric record ID, exact problem identity,
and reviewed document continuity. No authenticated C4 characterization,
natural submission, privacy implementation, adapter implementation, fixture,
commit, or push has occurred. Revision 2's reviewer closed the original seven
findings but reported three remaining LOW observations while issuing
`APPROVED`; revision 3 closes those observations so the plan's explicit
zero-unresolved-finding approval contract remains enforceable.

## Previous Status (2026-08-02 Phase C C2 AtCoder `V4_BLOCKED`)

Phase C C2 is terminally `V4_BLOCKED` on the uncommitted working tree of
`feature/v1-followup` at base HEAD
`a24e158448c3ccf3e1cde6e380e0c441eff87342`. The already-open user Chrome ran
the exact preflight extension build. Two natural `abc001_1` submissions were
safely corroborated (`78058928` and `78059304`). During the ready-gated final
window, a live watcher remained active through the second submission, the page
navigated from `/contests/abc001/submit` to
`/contests/abc001/submissions/me`, and the extension retained exactly zero
records before the operator stopped the session.

The blocker is structural: Chrome's official `webRequest` contract omits
`documentId` for frame navigation, AtCoder uses a traditional `main_frame`
form submission, and the approved observer must reject missing document
identity. The landing path supplies no stable numeric submission identity.
Weakening correlation through body/query/DOM-row/tab/time inference is
forbidden. No AtCoder network adapter was implemented. Historical Phase 0 DOM
certification remains production-authoritative for its own scope and all nine
fixtures remain frozen. Terminal gates pass: focused 401/401, readiness CLI,
fixture hashes 9/9, full quality gate with 2,034 unit tests, 25 app E2E, 1,286
extension tests, 48 runnable extension E2E, and production build. One Windows
capability case and one known extension harness case remain skipped.
Authoritative blocker:
`work/reports/v4-atcoder-c2-blocker-2026-08-02.md`.

C2 remains terminally closed; C3 subsequently completed as documented above.

## Previous Status (2026-07-30 Phase C C1 LeetCode `V4_EXPERIMENTAL`)

Phase C C1 is terminally closed as `V4_EXPERIMENTAL` on the
uncommitted working tree of `feature/v1-followup` at base HEAD
`a24e158448c3ccf3e1cde6e380e0c441eff87342`. The user completed the
v6 retest in the already-open Qiu yu Chrome profile with the installed
production extension id `aljppcgkcdbeemppmokcbjgcjdhapakh`; no
replacement Chrome profile was opened.

The real v6 observation proves the full local chain for LeetCode:

- production digest
  `8e0df3af3be1a60da88e6362cadbe2f6883a9ecec6f0063c522ff85a3e8521bb`;
- adapter `v4-leetcode-network-6`;
- submission `cn/739108591`, problem `roman-to-integer`, verdict
  `Wrong Answer`;
- terminal extension state: zero confirmed submissions, one durable
  tombstone (`leetcode:cn/739108591`), and zero outbox, quarantine,
  unmatched-E3, ambiguity, endpoint-diagnostic, or capture-error
  residue;
- the disposable SQLite database contains exactly four capture events,
  one training session, and one non-voided automatic training attempt
  with `record_source=capture`, `provenance=extension_paired`, and
  `result=failed`.

The localhost hypothesis is disproved for this failure: the existing
profile retained `http://localhost:3000/*` permission, pairing and
capture were enabled, and v6 delivered through the local API into
SQLite. The actual defects were:

1. the original adapter was overfit to the legacy LeetCode
   `/problems/<slug>/submit/` plus
   `/submissions/detail/<id>/v2/check/` sequence, while the current UI
   uses trusted E0 plus completed `POST /graphql/` and exact
   `/submissions/api/{runtime|memory}_distribution/<id>/` requests;
2. v5 scoped `problemExternalId` as `cn/<slug>`, but the local API
   contract requires the plain problem slug;
3. repeated result evidence could refresh `confirmedAt` and recreate a
   finalized record, so v6 preserves first confirmation identity and
   time and suppresses tombstoned replay.

The final authoritative `npm run quality:gate` completed all nine
stages successfully: 94 unit-test files with 2,009 passing tests and
one Windows symlink-capability skip; 25 application E2E tests; 39
extension unit-test files with 1,261 passing tests; 48 extension E2E
tests with one documented Phase A service-worker harness skip; strict
lint, migrations, curriculum validation, typecheck, production
extension build/parity, and Next.js production build all passed.

Authoritative C1 closeout:
`work/reports/v4-leetcode-c1-closeout-2026-07-30.md`.

This is not a production-adapter promotion, RC, user acceptance of the
whole product, public release, or authorization to skip C2-C5.
LeetCode remains `experimental`. Phase C subsequently entered C2 AtCoder.
The user authorized characterization on 2026-07-31 and the derived
delta plan now lives at
`docs/superpowers/plans/2026-07-31-v4-atcoder-network-capture-migration.md`.
All nine historical AtCoder fixture hashes are frozen in that plan; the four
historical certification suites pass 171/171 and the readiness CLI passes.
C2 plan revision 2 is independently `APPROVED`; the pre-storage pathname
privacy prerequisite passes 331 focused tests and `extension:check` passes 39
files / 1,285 tests. Production-dist version/hashes are frozen in
`work/reports/v4-atcoder-c2-preflight-2026-07-31.md`. The same extension id was
reloaded in the already-open Chrome. These entry conditions are historical;
the C2 blocker above supersedes the former login-pending state. No C1/C2
commit or push has been made.

## Previous Status (2026-07-29 V4 NowCoder E3 ingress engineering PASS)

The Phase B B8 missing-E3 layer is repaired. The engineering block is
closed on a single uncommitted SHA through Tasks 0-6 of
`docs/superpowers/plans/2026-07-29-v4-nowcoder-e3-ingress-repair-and-retest.md`
with the closeout report at
`work/reports/v4-nowcoder-e3-ingress-repair-2026-07-29.md`.

- **Pure ingress coordinator** (`extension/src/contentIngress.ts`):
  pure URL gate synchronized with the existing E3 policy
  (no trailing slash), closed 7-input/5-effect reducer, bounded
  transient registry (max 100), closed `CONTENT_RUNTIME_READY`
  schema guard.
- **Idempotent content bootstrap** (`extension/src/contentBootstrap.ts`):
  three-state sentinel `installed | installing | inactive` so a
  second injection can reannounce but not double-install, and a
  capture-disabled install clears the sentinel.
- **Self-healing background injection**
  (`extension/src/background.ts`): registers
  `chrome.webNavigation.{onCommitted,onCompleted,onHistoryStateUpdated,onErrorOccurred}`,
  calls `chrome.scripting.executeScript` with `world: "ISOLATED"` and
  `target: { tabId, documentIds: [docId] }` whenever Chrome
  supplies a document id; `onStartup` and worker initialization
  invoke `reconcileOpenNowCoderResultTabs` to recover an already-open
  eligible result tab.
- **Closed control-plane persistence** (never enters capture state):
  `session.contentIngressReady` (max 20) records ready handshakes
  observed by Task 5 only; `session.contentIngressDiagnostics`
  (max 20) records `injection_failed` reason codes only.
- **Manifest deltas**: `scripting` and `webNavigation` permissions
  added; existing `content_scripts` matches and per-host
  `host_permissions` unchanged. No `<all_urls>`, no `tabs`, no
  `activeTab`, no `allFrames`.
- **Real-Chrome observation (Task 5)**: fresh extension profile,
  no characterization, no submit, direct navigation to
  `https://ac.nowcoder.com/acm/contest/view-submission?submissionId=84258557`
  observes exactly one `ready_record` and one unmatched E3 with the
  expected `externalSubmissionId`/`problemExternalId`/`verdict`.
  `confirmedSubmissions/outbox/quarantine` stay empty; default
  `training-platform.sqlite` metadata unchanged.
- **Real-Chrome full chain (Task 6)**: same SHA, paired with the
  disposable local app: E0 → submit → status → E2 confirmation
  (stable id `84258557`) → result page → ready handshake → E3 →
  bundle → one `POST /api/capture/attempts` delivery → one SQLite
  training attempt (+4 `capture_events`, +1 `training_session`,
  +1 `training_attempt`). A subsequent reload of the delivered
  result page does not duplicate the bundle or attempt.
- **Authoritative `npm run quality:gate`**: exited 0 on 2026-07-29
  (lint clean, disposable `db:migrate`, `curriculum:validate`
  12 nodes / 13 edges / 12 resources / 12 practice mappings /
  9 careers, `test` 92 files / 1919 passed / 1 pre-existing Windows
  `EPERM` skip, `typecheck`, `e2e` 25/25, `extension:check` clean
  with 38 files / 1191 tests, `extension:e2e` 47/47 on the second
  consecutive run, `build` PASS).
- **NowCoder remains `experimental`** for DOM and V4 network
  readiness. Adapter promotion is **not** authorized by this
  report and requires a separate reviewed decision.

The Phase B B8 `BLOCKED` verdict in
`work/reports/v4-nowcoder-phase-b-terminal-closeout-2026-07-28.md`
is superseded only for the missing-E3 layer; every other Phase B
outcome recorded there remains authoritative.

The current implementation commit on `feature/v1-followup` for the
missing-E3 ingress layer fix is
`c26c57859b9e330c42d2586c4fb1f0366d2186ea`. The Phase B terminal
state commit `7bac19413992e7a987a3891190223628fb5b0803` is preserved
as the historical BLOCKED closeout point. The missing-E3 layer
supersede is documented in
`work/reports/v4-nowcoder-phase-b-terminal-closeout-2026-07-29-supersede.md`.

## Status (2026-07-28 V4 Phase B terminal BLOCKED)

**V4 INFRASTRUCTURE ENGINEERING PASS (SCOPE-REDUCED) / FORMAL V0
OBSERVATION BLOCKED / PHASE B B0-B7 COMPLETE, B8 BLOCKED AT REAL E3 INGRESS.**

B3 is limited to the restart-safe NowCoder browse-only navigation witness.
Implementation commits `c208bc2` and `fdecf91`, observation evidence commit
`b2c6aec`, and the B3 lifecycle closeout recorded in
`work/reports/v4-nowcoder-b3-lifecycle-closeout-2026-07-28.md` produced and
verified the strict authenticated two-E0 fixture at
`tests/fixtures/nowcoder/network/nowcoder-browse-only-2026-07-27.json`.
The transcript validator, fixture test, real content-script/background/popup
lifecycle A-D tests, and final quality gate pass. A-D use CDP only to control
the Worker; the exact manifest routes run the production content script and
the popup performs the public status/export checks. The test-only Chromium
feature flag needed to keep a command-line-loaded unpacked extension reloadable
does not alter production extension behavior or user Chrome.

This does not certify NowCoder production, a release candidate, user
acceptance, public release, or authorize Phase C.

Phase B authorization B0, schema B1, and diagnostic-mode B2 are complete
and frozen at `6862f462978352fda7ab1e90639a5c1fbd960810`. B2 passed independent privacy
review after four iterative rounds. The diagnostic mode provides
NowCoder-only opt-in session-backed safe network characterization with
worker-restart fail-closed, exact B1-compatible export, and hard
production-path isolation. Authorization is recorded at
`work/reports/v4-nowcoder-characterization-authorization.md`.
The authorized B3 no-submit observation used that exact SHA and reached
localhost resources (connection refused), contest list, then the authorized
problem in one background tab. Waiting/outbox/quarantine remained zero and no
code or submit control was touched. It exported the strict two-E0 fixture and
cleared the diagnostic session. The later lifecycle closeout verifies A-D in
synthetic, production-path extension E2E without re-operating user Chrome; see
`work/reports/v4-nowcoder-b3-lifecycle-closeout-2026-07-28.md`.

- **B0 (authorization contract):** Authorization report validated by
  `scripts/validate-v4-characterization-authorization.mjs` and 7 tests.
  Exact NowCoder hostname required; non-NowCoder domains and templates
  rejected.
- **B1 (safe transcript schema):** Strict B1 `network_request_observed`,
  `submission_confirmed`, and `final_verdict_confirmed` contract with CLI
  validator; 129 tests. Rejects raw data, free-text metadata, unsafe
  source URLs, unknown evidence kinds, and characterization-derived
  production claims. Shared runtime-TS parser extracted to
  `extension/src/networkTranscriptContract.ts`.
- **B2 (diagnostic mode):** Files: `extension/src/characterization.ts`,
  `characterizationStorage.ts`, `characterizationIngress.ts`,
  `networkTranscriptContract.ts`; modified `background.ts`,
  `networkObserver.ts`, `popup.ts`, `popup.html`, `manifest.json`,
  `package.json`, `vitest.config.ts`. Tests: 64 characterization + 10
  background-integration tests. Key properties:
  - Disabled by default and after worker restart (`initialization` and
    `onStartup` call `stop()`).
  - Explicit opt-in via popup with hostname and authenticated state.
  - 5-minute TTL with alarm-driven proactive cleanup.
  - Synchronous `characterizationProductionGuard` prevents production
    observer from even scheduling NowCoder work.
  - Session-backed `blocksNowCoderProductionIngress` guards all
    production ingress including E0 hints, E1 webRequest, MAIN bridge,
    E3, and V3 verdicts; survives worker restart.
  - Recursive forbidden-key checks (full B1 alias set) in both
    production and characterization observers.
  - Export produces validated B1 `{ meta, evidence }` document
    downloadable via popup.
  - No response body, code, headers, cookies, tokens, or account
    data are ever retained.
  - Independent code-reviewer APPROVED with no blockers.
  - `npm run extension:check`: 32 files / 1055 tests PASS.

Phase A A0-A12 closeout is authoritative (see below). Phase B is terminally
`BLOCKED` after B0-B7 completed. B8 observed trusted E0, real E1/E2 with stable
ID `84258557`, and the matching public final verdict, but the real result
document emitted no E3; no bundle or SQLite attempt was created. Do not start
Phase C without fresh explicit authorization and a reviewed plan. The closeout
report is `work/reports/v4-nowcoder-phase-b-terminal-closeout-2026-07-28.md`.

---

## Previous Status (2026-07-24 V4 Phase A closeout A0-A12 complete)

**V4 INFRASTRUCTURE ENGINEERING PASS (SCOPE-REDUCED) / FORMAL V0
OBSERVATION BLOCKED.**

The user explicitly authorized re-opening A10-A12 on 2026-07-24 after
the A0-A9 interim closeout. Phase A is now the authoritative V4
infrastructure scope spanning Tasks A0-A12: the framework engineering
pass (evidence core, correlator, state machine, storage split,
observer, bridge, orchestrator, Fake OJ matrix, disposable DB
lifecycle, gate integration, plan reconciliation) is complete and
every authoritative gate command exits 0. The full E2->E3->real-popup-
pair->real-API->SQLite delivery probe and the worker-restart recovery
probe remain out of Phase A scope (scope-reduced A10 smoke test +
`test.skip` for the worker-restart harness limitation). Real platforms
remain `V4 uncharacterized`. Final closeout report:
`work/reports/phase-a-final-closeout.md`.

- **A0-A9 (interim closeout, 19 atomic commits):**
  - Phase 0 click-ingress stopgap: T0.1 docs + validator
    (`8321a07`); T0.2 RED tests (`fb2cc15`); T0.3 bounded E0 UI
    hints (`4b9cb2e`); T0.4 V3-to-V4 stopgap migration
    (`d683a7a`); T0.5 popup confirmed-only semantics (`6d8fe63`).
  - Phase A infrastructure: A0 webRequest spike GO (`7d6bf9e`);
    A1 safe evidence schemas (`8bdfe5d`); A2 adapter contracts
    (`9449c61`); A3 strict correlator (`03b56d0`); A4 capture
    state machine (`2ca2ffd`); A5 storage split (`2a27997`); A6
    webRequest observer (`64890b4`); A7 MAIN bridge (`68f0d4e`);
    A8 background orchestrator (`12ceb6d`); A9 Fake OJ matrix
    (`b3ec8cb`).

- **A10 (disposable SQLite lifecycle, `c8680e8` + review fixes
  `9b81784`):**
  - `tests/extension-e2e/database.ts` provides disposable directory,
    DB creation, migrations via `npm.cmd`, count readers, and
    default-DB snapshot / verify utilities with relative-path-based
    safe deletion under `.tmp/`.
  - `tests/extension-e2e/capture-v4-full-chain.spec.ts` proves the
    disposable DB + production extension artifact + scenario
    identity helpers + default-DB preservation.
  - `scripts/a10-bootstrap.mjs` is a reusable bootstrap helper for
    future webServer-based A11+ integrations (currently unused).
  - Independent review found 4 HIGH issues (path check prefix
    collision, stale path file teardown, missing `.tmp` mkdir,
    profile cleanup replacement); all fixed in `9b81784`.

- **A11 (gate integration, `9556890` + review fixes `6401e17`):**
  - `scripts/quality-gate.mjs` adds `extension:e2e` as stage 7; the
    frozen `QUALITY_GATE_STAGES` array is now 9 stages.
  - `tests/extension-e2e/capture-v4-network.spec.ts` marks the
    service-worker-restart scenario as `test.skip` with a docblock
    referencing the closeout report.
  - `.github/workflows/quality-gate.yml` is created as a local-only
    CI workflow with `permissions: contents: read`,
    `timeout-minutes: 20`, and the canonical `npm run quality:gate`.
  - `docs/runbook.md`, `docs/architecture.md`, `COMPLIANCE.md`
    document the new lane and its boundaries.
  - Independent review found 6 issues (HIGH workflow npm ci /
    permissions, MEDIUM triggers / timeout, LOW docs accuracy /
    incorrect comment); all fixed in `6401e17`.

- **A12 (closeout, `77e6f30` + review fixes `30f3d73`):**
  - This plan file is reconciled: every A0-A12 task has an
    execution result block with commit SHA, verification command,
    test counts, and review findings + fixes.
  - `work/reports/phase-a-final-closeout.md` is the dated Phase A
    closeout report. It supersedes
    `work/reports/v4-phase-a-closeout-2026-07-24.md` for the A0-A12
    scope but preserves the A0-A9 verdict unchanged.
  - Independent review found 4 issues (HIGH scope honesty in
    verdict, MEDIUM missing SHAs / commands + dev-server claim, LOW
    module list); all fixed in `30f3d73`. Phase A verdict adjusted
    from `PASS` to `PASS (scope-reduced)` to honor the A10 smoke
    test and the worker-restart `test.skip`.

- **Phase A quality gate (final, after A12 review fixes):**
  - `npm run lint` PASS
  - `npm run typecheck` PASS
  - `npm run db:migrate` (disposable) PASS
  - `npm run curriculum:validate` PASS
  - `npm run test` 80 files / 1528 passed / 1 skipped
  - `npm run e2e` 25 passed
  - `npm run extension:check` 30 files / 950 passed; MV3 build
    OK; dist parity OK
  - `npm run extension:e2e` 31 passed (1 known skip)
  - `npm run build` 20/20-page production build
  - `npm run quality:gate` EXIT 0

- **Phase A commit chronology (Phase 0 + Phase A closeout):**

  | Phase | Task | SHA | Subject |
  |-------|------|-----|---------|
  | P0 | T0.1 | `8321a07` | docs: V4 plans + reconcile authority |
  | P0 | T0.2 | `fb2cc15` | test: RED tests for click-only waiting |
  | P0 | T0.3 | `4b9cb2e` | feat: bounded E0 UI hints |
  | P0 | T0.4 | `d683a7a` | feat: V3-to-V4 stopgap migration |
  | P0 | T0.5 | `6d8fe63` | feat: popup confirmed-only |
  | PA | A0 | `7d6bf9e` | test: webRequest test path GO |
  | PA | A1 | `8bdfe5d` | feat: Safe Evidence schemas |
  | PA | A2 | `9449c61` | feat: adapter contract split |
  | PA | A3 | `03b56d0` | feat: strict Evidence Correlator |
  | PA | A4 | `2ca2ffd` | feat: pure Capture State Machine |
  | PA | A5 | `2a27997` | feat: storage split |
  | PA | A6 | `64890b4` | feat: webRequest observer |
  | PA | A7 | `68f0d4e` | feat: MAIN bridge |
  | PA | A8 | `12ceb6d` | feat: background orchestrator |
  | PA | A9 | `b3ec8cb` | test: Fake OJ matrix |
  | PA | A10 | `c8680e8` | test: A10 smoke + disposable DB |
  | PA | A10 fix | `9b81784` | fix: A10 path safety + profile cleanup |
  | PA | A11 | `9556890` | build: gate integration |
  | PA | A11 fix | `6401e17` | fix: A11 workflow + docs accuracy |
  | PA | A12 | `77e6f30` | docs: A12 plan + closeout report |
  | PA | A12 fix | `30f3d73` | docs: A12 verdict honesty + SHAs |

  21 commits total (5 Phase 0 + 10 Phase A task + 4 review fix +
  2 A12 docs).

## Previous Status (2026-07-24 A0-A9 interim closeout)

- Phase A Task A9 (Fake OJ matrix) is complete as the closeout seam.
  `tests/extension-e2e/{fakeOj,fakeOjScenarios,capture-v4-network.spec}.ts`
  cover 18 named scenarios + 3 cross-platform smoke tests; 28 of 29
  Playwright tests pass. The single remaining failure is a test-harness
  worker-restart seam (a known infrastructure limitation, not a production
  defect; the module docblock in `capture-v4-network.spec.ts` honestly
  documents this). The production-side `extension/src/mainWorldRelay.ts`
  was hardened with a recursive forbidden-key gate so the relay now
  refuses any forbidden raw field at any depth.
- Phase A Task A8 (background orchestrator) is complete.
  `extension/src/backgroundOrchestrator.ts` is a pure data plane: zero
  `chrome.*` calls, every side effect through the injected
  `ExtensionInitializationStorageSplit`. 9 input kinds (4 V3 event
  variants, V4 Safe Evidence, 4 A3 correlator outcomes plus
  `e0_recorded` / `e3_recorded` / `v3_submission_intent_recorded` /
  `user_action`); closed 4-effect union with `observedAt`; waiting only
  increments on `SUBMISSION_CONFIRMED`; E3-before-E2 retention parked by
  stable submission key with most-recent-wins; browser-restart recovery
  produces a bundle from confirmed submission + new E3 without requiring
  transientE1. `extension/src/captureStateMachine.ts` was made Chrome-
  bundleable in parallel: `node:crypto` / `Buffer` replaced with pure-JS
  SHA-256 (byte-identical to Node `createHash("sha256")` for the canonical
  A4 fixture `bundle_91b8a3600f18390ffdee270d325ddd1d92295484e6552dc4b8b5f866782ca7f2`)
  and a 4-byte big-endian uint32 length-prefix encoder.
- Phase A Task A7 (MAIN bridge) is complete. `mainWorldBridge.ts` provides
  the IIFE MAIN-world bridge (built as `extension/dist/main-world-bridge.js`
  via `extension/build.mjs`, gated to the four OJ hosts through
  `extension/manifest.json`'s `web_accessible_resources`).
  `mainWorldRelay.ts` is the ISOLATED-world relay that re-validates the
  summary through `parseMainBridgeSummary` and adds the recursive
  forbidden-key gate before emitting the `V4_FORWARD_BRIDGE` envelope.
  MAIN evidence alone can never confirm a submission; it must match one
  unique webRequest E1.
- Phase A Task A6 (webRequest observer) is complete. Five host-scoped
  Chrome webRequest lifecycle listeners cover leetcode/nowcoder/luogu/
  codeforces; AtCoder is explicitly excluded. Each detail is validated
  synchronously through `parseSafeEvidence`; forbidden raw fields produce
  `ignored corrupt_record`; missing documentId / invalid tab/frame produce
  `missing_document_id`; non-adapted hosts and unsafe URLs produce
  `non_adapted_host` / `normalize_endpoint_failed`. Lifecycle merging
  keeps the earliest `receivedAt` and the latest `apiTimeStamp`;
  `error_occurred` never carries a `statusCode`. `registerNetworkObserverListeners`
  is a pure dependency-injected helper that `extension/src/background.ts`
  routes through the existing serialized executor.
- A0-A5 are recorded historically in the Phase A plan file and the
  earlier handoff snapshots; A0 webRequest spike GO, A1 Safe Evidence, A2
  adapter contract split, A3 strict correlator, A4 capture state machine,
  A5 session/local storage split.
- Phase A closeout verification: `npm run typecheck` and `npm run lint`
  pass; `npm run extension:check` passes with 30 files / 950 tests
  across 26 unit + 4 dedicated E2E files; full Playwright suite reports
  28 of 29 tests passing. Independent final reviews for A4 (40 tests),
  A5 (39 tests), A6 (19 tests), A7 (57 tests), A8 (35 tests), A9 (29 tests)
  are all APPROVED with no blocker or important issue.
- Every real platform's `V4NetworkStatus` remains `uncharacterized`. No
  real OJ network capture path has been exercised; the Phase A closeout
  is a framework engineering pass, not a real-platform certification.
- Formal V0 observation, replacement-RC work, and V0.5 remain blocked
  until Phase B (or a separately authorized characterization) succeeds.
  requires explicit authorization.
  started and requires explicit authorization.
- Phase A Task A2 is complete. `extension/src/adapters/registry.ts` is the
  single registry source for platform identity, exact host ownership, existing
  DOM status, independent V4 network status, and adapter version. AtCoder alone
  remains DOM `production`; all five V4 network statuses remain
  `uncharacterized`, with no real network policy or matcher attached.
- The branded network-policy factory reparses every candidate return through the
  A1 Safe Evidence boundary and fails closed on invalid data or exceptions. A
  TypeScript-AST dependency graph rejects direct and transitive adapter imports
  into storage, outbox, transport, state, correlator, and background boundaries.
  Registry host ownership now gates existing page/result detectors while route-
  specific constraints remain narrow.
- A2 verification passes: focused 4 files / 327 tests, lint, typecheck, and final
  `extension:check` with 22 files / 692 tests, MV3 build, and dist parity.
  Independent final review is APPROVE with no blocker or important issue.
- Phase A Task A1 is complete. Strict Safe Evidence schemas now cover E0, E1
  lifecycle, E2, E3, ambiguity, and rejection records. The only exported
  raw-to-safe boundary returns a Zod-normalized plain object; request bodies,
  source code, headers, credentials, user identity, unsafe URLs, unknown fields,
  and malformed timestamps are rejected before state or persistence can use
  them.
- Every browser-document record requires tab/frame/document identity and
  background `receivedAt`. webRequest E1 evidence additionally requires Chrome
  `apiTimeStamp`; page timestamps remain non-authoritative. Final verdicts reuse
  the existing 12-value product taxonomy.
- A1 verification passes: focused 177/177 tests, lint, typecheck, and final
  `extension:check` with 21 files / 645 tests, MV3 build, and dist parity.
  Independent final review is APPROVE with no blocker or important issue.
- Phase A Task A0 is GO: bundled Chromium `138.0.7204.23` loaded exact
  production `extension/dist`; repeated fresh-profile runs recorded two
  Playwright-fulfilled exact POSTs and two MV3 markers across
  `stopped -> running`, with wrong method/path rejected.
- Final A0 network controls combine page-level default abort with worker-level
  no-proxy/DNS denial. One pre-fix synthetic GET reached an AtCoder denial-probe
  path because the system proxy bypassed DNS; no submission, body, credential,
  user data, or source code was involved. The failed run was not accepted, and
  two post-fix runs passed. Evidence:
  `work/reports/v4-phase-a-a0-webrequest-spike-2026-07-24.md`.

- A NowCoder browse-only false positive exposed the V3 architectural defect:
  a qualifying click can create active waiting state before any server-confirmed
  submission exists.
- The completed execution entry is
  `2026-07-24-v4-network-confirmed-capture-refactor-phase-0-click-ingress-stopgap.md`.
  Formal V0 observation is blocked until V4 reaches its required replacement
  candidate gates. V0.5 remains out of scope.
- Commit `2f4f5d895ea8d965fb64d19dc784ca5514480688` remains historical evidence for
  the repaired V3 LeetCode flow, not a current acceptance anchor.
- Clicks now create at most a bounded, alarm-expired E0 session hint. Waiting
  reads only validated confirmed submissions; Phase 0 has no E2 producer.
  Existing completed outbox/quarantine/pairing state remains preserved.
- Final gates: 70 unit files / 1046 passed / 1 Windows capability skip, 25 E2E,
  20 extension files / 468 passed, and 20/20-page production build. Independent
  review has no blocking or important runtime finding. Evidence:
  `work/reports/v4-phase-0-click-ingress-stopgap-2026-07-24.md`.

## Previous Status (2026-07-24 LeetCode natural submission validation)

- The previous exact-route repair was still incomplete. Current LeetCode.cn
  renders duplicate `console-result` verdict nodes, then may restore the
  problem URL while retaining the selected `submission-detail` result tab.
  Neither shape was covered by the legacy single-locator assumption.
- The LeetCode extractor now collapses identical visible panes, rejects
  conflicts, and accepts the restored problem URL only with a unique visible
  selected first-party detail tab containing a recognized final verdict.
  Transient chrome such as `提交详情`, unknown labels, and inactive tabs do not
  consume a pending intent.
- Authorized real-Chrome recovery against the user's existing
  `/problems/two-sum/submissions/737659968/` result produced
  `Time Limit Exceeded` / `partial`, received a matching ACK, and left active,
  outbox, quarantine, and unmatched counts at zero. No external OJ submission
  was made by the agent.
- On 2026-07-24 the user reloaded the final build from implementation commit
  `2f4f5d895ea8d965fb64d19dc784ca5514480688` and confirmed the same LeetCode
  case passes through a fresh natural submission. This closes the repair
  validation gate without fabricating formal observation sessions.
- A diagnostic build briefly classified the transient detail label as
  `Other Failure`. That locally created diagnostic attempt was immediately
  voided through the official API with an audit reason and is excluded from
  default Training, Coach, and Growth views.
- Adapter readiness is certification metadata, not a runtime switch.
  LeetCode remains `experimental`; changing it to `production` would not fix
  capture and would bypass the evidence gate. AtCoder remains the sole
  certified production adapter.
- `npm run quality:gate` exits 0: 68 unit files / 1039 passed / 1 Windows
  capability skip, 25 Playwright E2E, 19 extension files / 464 passed, lint,
  disposable migration, curriculum validation, typecheck, MV3 build/dist
  parity, and 20/20-page production build.
- Evidence:
  `work/reports/v0-leetcode-tle-semantic-result-repair-2026-07-23.md`.
  V0.5 was not merged or started.

## Status (2026-07-23 real Chrome extension-error closure)

**ENGINEERING PASS / REAL CHROME ERROR RETEST PASS: the result-route, verdict,
ACK, popup-feedback, and content-script lifecycle repairs are frozen by the
local implementation commit containing this handoff. The user observed the
repaired TLE flow clear pending state and all popup queues return to zero.
Authorized Chrome inspection then identified and closed the remaining red
extension-error indicator.**

- The final missing lifecycle fact was the URL. The user's real page was
  `/problems/two-sum/submissions/737484505/`, but exact-result routing only
  recognized `/submissions/detail/<id>/`. A new result document therefore saw
  the first-frame TLE as historical and left the background intent active.
- Strict LeetCode `.cn`/`.com` problem-scoped result routes are now exact. Tests
  reject missing or nonnumeric IDs, extra path/query/hash data, credentials,
  ports, and spoofed hosts.
- The earlier same-document SPA causality and platform-neutral verdict taxonomy
  remain intact. Trusted final states retain distinctions such as time, memory,
  output, runtime, compile, wrong-answer, judge/system, and other failure;
  pending text remains non-final and page-body scanning remains forbidden.
- An isolated unpacked-extension run exposed a second compatibility failure:
  `chrome.storage.local.setAccessLevel` is absent in some Chromium runtimes.
  Initialization now capability-checks it, while supported browsers still
  receive trusted-only storage access.
- Content and popup fire-and-forget Chrome promises now terminate at one error
  boundary. All content-script DOM, mutation, timer, and navigation callbacks
  share a lifecycle guard: an invalidated unpacked-extension context retires
  silently, while unrelated failures stay visible. Popup buttons show a short
  lighter pressed state and live `已触发：<操作>` feedback without claiming the
  server sync already succeeded.
- Authorized inspection found two real content-script errors, both `Uncaught
  Error: Extension context invalidated.` at `content.js:5390`, on LeetCode
  result IDs `737406436` and `737482394`. This explains why the service-worker
  console was empty. After rebuilding, the extension was reloaded, the two old
  entries cleared, and the existing LeetCode result page refreshed; the
  extension manager showed no new `Errors` button or entry.
- Synthetic unpacked-extension smoke PASS: initialization completed; submit
  changed active/outbox `0/0 → 1/0`; the exact TLE result changed it to `0/1`
  with verdict `Time Limit Exceeded`; popup pressed feedback was visible; no
  page, popup, or service-worker error was captured.
- `npm run extension:check` PASS after the lifecycle repair: 19 files / 456
  tests, typecheck, MV3 build, and dist parity. The final authoritative
  `npm run quality:gate` exits 0: 68 unit files / 1031 passed / 1 capability
  skip, 25 Playwright E2E, 19 extension files / 456 passed, lint,
  disposable migration, curriculum validation, typecheck, MV3 build/dist
  parity, and 20/20-page production build. Evidence:
  `work/reports/v0-leetcode-result-route-extension-error-repair-2026-07-23.md`.
- Owner Report 03 remains real repair QA, not formal same-SHA observation. The
  local implementation commit containing this handoff is the replacement-RC
  freeze point; it has not been pushed. V0 acceptance and V0.5 work have not
  occurred.

## Previous Status (2026-07-22 capture ACK P1 repair)

**BLOCKED: the V3 migration was observed to clear all 32 legacy events, but a
real submission exposed an ACK persistence bug and a high-frequency retry
storm. The client fix is implemented in the uncommitted worktree; repaired
Chrome verification remains mandatory before any RC or observation.**

- Branch/HEAD remain `feature/v1-followup` at
  `894162b264124eed7315a116cae73b8e11d717b8`; no replacement RC exists until
  the implementation is explicitly committed.
- New extension runtime creates only a local submission intent on an exact
  submit click. A new evidence-backed final verdict creates one atomic attempt
  bundle for `POST /api/capture/attempts`; page lifecycle activity is not a
  user-level queue item.
- Protocol V3 initialization was reloaded in the user's real Chrome and the
  popup/storage observation confirmed all 32 legacy `eventQueue` entries were
  removed. That migration result is complete and must not be repeated or
  confused with capture delivery validation.
- The same real run exposed one completed bundle stuck in `captureOutbox` while
  `/api/capture/attempts` returned HTTP 200. About 11,972 identical requests in
  about 260 seconds proved an infinite drain loop. Root cause: the success plan
  wrote unused `outbox`/`quarantine` storage keys instead of
  `captureOutbox`/`captureQuarantine`.
- The uncommitted fix maps success state to the real storage keys, validates the
  ACK bundle identity, adds bounded ACK-error backoff, and prevents concurrent
  drain re-entry. Quarantine retry now also persists only `captureOutbox` and
  `captureQuarantine`, resets all retry-blocking fields, and enters one
  single-flight drain. The authoritative `npm run quality:gate` exits 0: 67
  unit files / 1002 passed / 1 Windows capability skip, 25 Playwright E2E, and
  18 extension files / 429 passed after adding both required regression tests.
  The pre-test Commander baseline was 18 files / 427 tests; quarantine retry
  raised it to 428 and the stale-key upgrade fixture raised it to 429. The file
  count was never 20.
  Evidence: `work/reports/v0-capture-ack-repair-2026-07-22.md`. Real repaired
  Chrome closure has not yet been observed.
- V3 initialization now writes and preserves authoritative `captureOutbox` and
  `captureQuarantine` before deleting historical plain `outbox` and
  `quarantine` keys. It never reads or merges stale-key contents. A real-bundle
  upgrade fixture proves the retained bundle receives one matching ACK, clears
  the authoritative outbox, and produces zero requests on the next drain.
- No Worker is in flight. No commit or push was performed. Full bilingual UI
  implementation remains deferred.
- No Chrome action is authorized in this repair round. The remaining controlled
  gate is a separately authorized reload of the gate-passing `extension/dist`
  to verify that the existing outbox item receives one matching ACK and is
  removed without further timer requests.

## Last Frozen RC Status (2026-07-20)

**V0 domestic-OJ engineering and passive characterization frozen at replacement RC;
observation, final verification, and acceptance pending.**

- Last frozen implementationSha: `894162b264124eed7315a116cae73b8e11d717b8`. It has a confirmed ACK persistence defect and cannot proceed to observation or acceptance, but it remains the last frozen RC until an authorized repair commit creates a replacement. Superseded SHA `b5166320768355666a5c4ff3f466c29c240ea8cf` also must not anchor acceptance.
- Observation templates at `work/reports/v0-observation-owner.md` and `work/reports/v0-observation-participants.md` contain no sessions or participant windows.
- `work/reports/v0-exit-report.md` recorded `ACCEPT_CANDIDATE` before those required observations; treat it as a superseded premature record, not a valid candidate decision.
- Active plan: `docs/superpowers/plans/2026-07-21-v0-verdict-gated-capture-repair.md`. The closeout plan remains paused until this repair has a frozen replacement RC.
- V0 is **not** complete or accepted. After validated observations exist, F1–F4 must all approve the same implementation SHA and the user must explicitly accept it.
- Frozen stabilization RC: full quality gate PASS on 2026-07-18 after
  repairing the plan-completion row-ID regression and related known issues.
  Evidence: `work/reports/v0-engineering-gates.md` and
  `work/reports/v0-stabilization-2026-07-18.md`.
- Release-validator coverage: `tests/unit/v0ReportValidators.test.ts` contains
  21 real temporary-repository cases for the strict two-commit contract. The focused
  suite, lint, and typecheck pass.

## Workspace

- Branch: `feature/v1-followup`; immutable repaired candidate is
  `4e7a47bfc22fece4aa60e4bab2f4223668be480b`. Tasks 17-20 are complete and
  reviewed; Task 21 records LeetCode PASS, blocked-platform drift PASS, and
  NowCoder FAIL. D4 is incomplete. The worktree contains only the uncommitted
  Task21 report, blocked investigation plan, fail-closed test guard, and this
  handoff update; no production file changed.
  Candidate `f18eddf4cb4d7dd24c439b2dea5917793839e6a2` is historical after the
  runtime/manifest repair, and `22fa470d24724c15b5bdb2874e6817b599505f3c`
  never became a candidate because its explicit path-ownership preflight
  failed before the quality gate.
- Phase C closeout: the commit containing this handoff is the engineering
  freeze point; it is not a replacement RC and has not been pushed.
- Default database: preserved by the Phase C and D automated gates; the D1-C
  real-profile debug performed only a read-only metadata comparison and no
  default-database edit/write. The development extension residual was removed;
  the real-profile debug remains excluded from D1-C evidence.
- Observation-9 environment (2026-08-09): disposable SQLite
  `.tmp/observation-9/training-platform.sqlite` (migrated, 462848 bytes,
  all three capture tables empty). The verified observation service tree rooted
  at PID 48076 was stopped on 2026-08-10 and port 3000 is no longer listening;
  stdout remains `.tmp/observation-9/server.out.log`. No
  `POST /api/capture/attempts` ever reached it. Observation evidence retained
  for the failure record; no evidence file was deleted.
- Operator-only browser profiles and temporary test state remain excluded from
  the commit.

## Current Phase

- Phase 0: **complete and reconciled green on 2026-07-17.** AtCoder remains
  the sole certified production DOM adapter.
- V4 Phase C: **C0-C5 engineering-complete.** LeetCode and NowCoder are
  network-`experimental`; AtCoder, Codeforces, and Luogu are network-`blocked`.
- V4 Phase D: **D1 and D2 complete; historical D3 candidate engineering
  complete; D4 coordinator repair Tasks 0-10 complete; 9th observation FAILED;
  Task 12 plan gate APPROVED; Tasks 13 and 14 engineering COMPLETE and
  independently APPROVED; Task 15 initial re-freeze complete; Task 16 failed
  twice; Tasks 17-20 repair/review/re-freeze COMPLETE (2026-08-10); Task 21
  LeetCode and blocked-platform lanes PASS but approved-pilot NowCoder FAIL.** The 9th
  real observation (merge-two-sorted-lists,
  `cn/741081653`) confirmed E2 and E3 but produced no bundle: a stale
  historical "Accepted" result panel misclassified as a transition created a
  candidate predating the submit, and the real result's identical verdict text
  was deduped away. Coordinator failed closed by design. RED test + written
  plan revision and causal RED are now approved. Task 13 adds an exact
  LeetCode submit-epoch control plane and closes same-verdict repeat causality,
  including A/B exclusivity and the 32-entry capacity edge. Task 14 binds each
  new candidate to its exact persisted request identity and closes restart and
  legacy pre-E1 cleanup. Tasks 17-20 add the strict top-level result route and
  same-identity-only SPA epoch preservation on immutable candidate `4e7a47b`.
  The NowCoder false negative leaves waiting 1 after the exact final result
  document. Capture-disabled sanitized evidence proves `/acm/problem/list` is
  misclassified as a problem and causes resolver ambiguity before E3.
  D4 end-to-end engineering delivery remains unproven. D5 F1-F4 and final user
  acceptance remain blocked.
- V0 manual learning loop vertical slice: **implemented but not accepted.**
  Formal observation and replacement-RC work remain gated.

## Commit Chronology

### V4 Phase D Tasks 12-14 (2026-08-10)

- Task 12 reviewed RED and frozen repair contract:
  `1d6e9571c36fc3feb1ad0c99dd4f3ddd8393cfdb`.
- Task 13 submit-epoch control implementation:
  `fe36f6b4770d3d929479464c03e8bea6dbb97ba9`.
- Task 13 documentation closeout: `515a3ff`.
- Task 14 exact candidate binding implementation:
  `0f695ddfad6989e407424feff457d28d081d657b`.
- Task 14 documentation closeout:
  `23c81fa67f85c6e9396d39eadc446371b2f55e73`.

### V4 Phase D Tasks 15-20 (2026-08-10)

- Task 15 initial repaired candidate: `f18eddf4cb4d7dd24c439b2dea5917793839e6a2`;
  documentation closeout: `e4b863a98c43e95047e65d6ea339bf7b16cd8007`.
- Task 16 failure evidence and Task 17 approved causal RED: `42d45bb`.
- Task 18 top-level LeetCode result repair: `22fa470`.
- Task 20 exact candidate-path ownership repair and immutable candidate:
  `4e7a47bfc22fece4aa60e4bab2f4223668be480b`.

### Phase 0D (2026-07-15)

- Task 1 — strict lint gate and polling corrections: `b3c1993`, `d3a201f`, `e7c14b5`.
- Task 2 — migration upgrade matrix: `dca2236`.
- Task 3 — extension test/build/dist parity: `59a6ecc`.
- Task 4 — aggregate quality gate, Windows CI, and link-safe cleanup correction: `970a9bf`, `7cb6169`.
- Task 5 — operational docs/status reconciliation and unit-count correction: `cd66285`, `7394e22`.
- Task 6 — independent final verification evidence: `1e3c950`.
- Post-review evidence corrections: `71c6287`, `45b19a6`, `0ce73fb`. These corrections preserve that Task 4 and Task 6 used metadata-only `Get-Item`, while the later final review-work QA lane mistakenly used `Get-FileHash` once and then reverted to metadata-only comparison.

### Phase 0 AtCoder certification (2026-07-16 to 2026-07-17)

- Plan: `3c1cc61` (`docs: add AtCoder production certification plan`)
- T1 — public AtCoder DOM fixture corpus: `eda36a7` (`test: add AtCoder DOM fixture corpus for Phase 0 production certification`)
- T2 — platform-scoped fixture metadata core + AtCoder fixture corpus + plan record: `f6f77a6` (`test: extract platform-scoped fixture metadata core with Luogu compatibility wrapper`), `227a4ce` (`test: add AtCoder fixture metadata wrapper and extension fixture corpus`), `2902cec` (`docs: mark T2 complete in AtCoder production certification plan`)
- T3 — submission identity bridge + page-aware detection wiring + plan record: `41524c2` (`fix: resolve AtCoder submission identity`), `f78af2d` (`fix: wire page-aware problem detection`), `38ac1a8` (`docs: mark T3 complete in AtCoder certification plan`)
- T4 — scoped verdict isolation + plan record: `4357ffa` (`fix: scope AtCoder verdict detection`), `49545ea` (`docs: mark T4 complete in AtCoder certification plan`)
- T5 — capture lifecycle continuity + plan record: `fca0943` (`test: lock AtCoder capture continuity`), `63327f3` (`docs: mark T5 complete in AtCoder certification plan`)
- T6 — shared evaluator + AtCoder certification gate + plan record: `efe0716` (`refactor: share platform certification evaluator`), `8ccde10` (`test: certify public AtCoder adapter evidence`), `0b5074c` (`docs: mark T6 complete in AtCoder certification plan`)
- T7 — promotion to production + promotion guard artifact + pipeline E2E + plan record: `06fc306` (`feat: promote certified AtCoder adapter`), `e72cfc1` (`test: guard AtCoder certification artifact`), `41009d1` (`test: verify AtCoder capture pipeline`), `29f6075` (`docs: mark T7 complete in AtCoder certification plan`)
- T8 — authoritative gate run + documentation reconciliation: `7eddee1` (`docs: record Phase 0 AtCoder certification`), `3aaa7c5` (`docs: update adapter status guidance`), `62c3e83` (`docs: close Phase 0 product roadmap`), `a46896b` (`docs: mark T8 complete in AtCoder certification plan`)
- T8 agent/handoff reconciliation: `d7bebcc` (`docs: reconcile Phase 0 agent handoff`)
- F1–F4 final verification evidence and plan record: `ad6839ad443e99dd39a3b073ca38b1d2afd19944` (`docs: record Phase 0 final verification`)

## Accepted

- Phase 0D engineering gates (2026-07-15): lint, migration matrix, extension parity, aggregate quality gate, Windows CI, documentation, independent verification
- Phase 0 AtCoder production certification (2026-07-17): T1–T7 implemented and verified
- T8 authoritative Phase 0 gate (2026-07-17): `extension:check` and `quality:gate` both PASS with fresh counts above; default DB metadata unchanged; AtCoder sole production; Luogu experimental with SHA-identical BLOCKED evidence
- T8 documentation reconciliation (2026-07-17): 11 files updated, stale-claim audit passed, all docs consistently state Phase 0 green/completed
- F1–F4 final verification (2026-07-17): all four lanes (plan compliance, code quality/security, hands-on QA, scope/docs fidelity) independently **APPROVE** against commit `45cdd92a161f27622dbe5706a805eab523220910`. No blockers; no required fixes. Evidence recorded in `work/reports/phase-0-atcoder-certification.md#final-verification-f1` through `#final-verification-f4`.
- User acceptance (2026-07-17): the user explicitly accepted the Phase 0 verification result. Phase 0 is technically verified, documented, and accepted.

## In Flight

- D3 candidate `a911425a415db2ee374430ced62edcaa7b786866` and exact dist are
  frozen only as the failed Task 24 observation anchor. D4 retains historical
  final-delivery evidence but lacks authoritative contemporaneous stages, and
  the new LeetCode run failed on submit/GraphQL epoch identity. Revision 5
  review is required; no repair or retry is authorized. D5 has not started.

## Next Commander Action

1. Independently review Revision 5. Do not implement production changes or
   perform another platform submission before approval.
2. After approval, write the causal REDs first, repair only exact submit-ID
   binding plus the bounded harness failure receipt, and complete independent
   code/privacy review.
3. Because production repair invalidates `a911425...`, return to D3: create and
   validate a new immutable candidate, freeze exact dist/hashes, then restart
   LeetCode and approved-pilot NowCoder observations with separate fresh
   profiles/databases and action-time confirmations.
4. Run final readiness, privacy, and full quality commands; then rerun all four
   F1-F4 lanes from scratch and stop at the explicit final user acceptance gate.
5. Do not push, create a PR, deploy, label the work RC/accepted/released, resume
   formal V0 observation, or enter V0.5.

## Known Risks

- LeetCode and NowCoder are network-`experimental`; authenticated evidence
  does not certify either for production. AtCoder, Codeforces, and Luogu are
  network-`blocked` under their platform-specific identity constraints.
  AtCoder is still the sole production DOM adapter; LeetCode, Codeforces,
  NowCoder, and Luogu remain DOM-experimental.
- NowCoder remains experimental even though the exact approved pilot now has
  one same-SHA final delivery; required stage evidence is still incomplete.
  Generic `acm/problem/<id>` network support remains out
  of scope; global pilot-link precedence remains explicitly unsafe.
- Luogu production-adapter certification remains BLOCKED on missing public
  verdict DOM (historical record preserved in
  `work/reports/luogu-adapter-blocker.json`).
- The Windows file-symlink capability test may remain skipped under EPERM;
  mandatory junction safety tests must pass.
- The current extension E2E lane has 53 runnable passing tests and one known skipped
  service-worker-restart harness case; the skip is not production evidence.

## Generation-2 receipt identity repair (2026-08-13)

The first generation-2 LeetCode READY-only receipt reached browse-only READY
with `0/0/0`, but omitted `generation` because the runner read the
`projectObservationIdentity()` wrapper instead of its `.value`. Receipt
`output/playwright/v4-observation/leetcode-readiness-1786552707075.json` is
preserved as an invalid READY diagnostic and cannot authorize an action.

The observer-only fix adds a strict `projectObservationReceiptIdentity()` and
binds generation/profile/database identities on READY, ACK, and failure
receipts. RED was `3 failed / 75 passed (78 total)` and GREEN is observer
`78/78`; product anchors are `174/174`, combined focused `252/252`.
Typecheck, targeted lint, syntax, privacy (`0 findings`), diff check, and
protected-path isolation pass; dist hashes remain unchanged. Observer-only
hashes are:

```text
scripts/v4-live-observation-observer.mjs  7DF8EF7508D44B9F0E35920872BD9B8C84A849CA4CD0F267BA8EEAE1FCA511BE
scripts/v4-live-observation.mjs          FBD9834F5709AAF12167DA171E44A4D68C2954CFD75D57E007CBF72719498F61
tests/unit/v4LiveObservationObserver.test.ts 59FF98C2137E56FEA3B8F90E11462D2F38C3BC88DCA369C54B314631EE35631E
tests/unit/v4LiveObservationObserver.d.ts FC53651B490F18BFC789D0331EC12D30A2078A4AD5C840D1D1883AB28F8E6539
```

The focused gates above are observer-tool evidence only; no full quality gate,
build, extension E2E, or product release gate was rerun. The NowCoder lane was
not run, and no live server, browser, login, READY retry, action, click, or
submission occurred after the invalid receipt diagnosis.

The fixed LeetCode server/browser are closed and port 3000 is free. The
generation-2 NowCoder profile remains an un-opened empty ordinary directory;
do not delete or launch it from this checkpoint. The pre-hardening checkpoint
was **`REVIEW REQUIRED`**; that historical status is superseded by the
independent final review recorded in the hostile-wrapper section below. D4
remains incomplete and D5 stopped.

## Generation-2 hostile outer receipt-wrapper hardening (2026-08-13)

The observer audit found one MEDIUM limited to the observer helper: an outer
`ok` or `value` accessor could throw before the fixed rejection was returned.
RED added hostile outer getters with zero-read assertions, inherited fields,
hidden extra own keys, and non-data descriptors; the pre-fix result was
`3 failed / 78 passed` (`81`). The helper now checks the outer prototype,
exact own keys (`ok`, `value`), and own data descriptors before reading either
field. The inner exact-key/data-descriptor gate remains unchanged and no raw
exception is swallowed.

GREEN and focused gates:

```text
observer focused:       81/81 passed
frozen product anchors: 174/174 passed
combined focused total: 255/255 passed
npm run typecheck:       exit 0
targeted ESLint:         exit 0
node --check (2 scripts): exit 0
privacy audit:           PASS, 0 findings
git diff --check:        exit 0 (CRLF conversion warnings only)
protected product-path diff: empty
```

The prior identity-unwrapper hashes are historical: observer
`8B2D68B2C93274AF4F01667630F95EB125D352AE152E5AE35688D5F332C37D79`, runner
`6859FB997C7F379B9C4B3CBABEA2DCF7EB62F160A9544532E59B2102BCCA4E46`, test
`09AE1AC4CB595FE16D042AEA8F7B6C8C93E4397B9A928384982366C1B8D2DA70`, and
d.ts `E76687FC485200E3C7C3A2350042F60E593494071652FCE42DB3E0DE68DDCE14`.
Current observer-only hashes are:

```text
scripts/v4-live-observation-observer.mjs  B058734A363D593BDF9FCC70768B0BAC88D34E8281B742F26E810A94FC8EEF65
scripts/v4-live-observation.mjs           FBD9834F5709AAF12167DA171E44A4D68C2954CFD75D57E007CBF72719498F61
tests/unit/v4LiveObservationObserver.test.ts 306FE408DBE0C418223907F392DA3125E8D1973C3D9AD7FEE06F9F0F83366E31
tests/unit/v4LiveObservationObserver.d.ts FC53651B490F18BFC789D0331EC12D30A2078A4AD5C840D1D1883AB28F8E6539
```

The five frozen Task 26 dist hashes remain unchanged. The prior generation-2
LeetCode READY receipt remains an **INVALID READY diagnostic** and was not
amended; NowCoder was not run. No live/server/browser/READY or action work
occurred. Independent final review reran the current observer and frozen
product anchors: observer `81/81`, anchors `174/174`, combined focused
`255/255`, with no HIGH or MEDIUM findings. It confirmed that the current
observer-only SHA-256 values above and all five frozen dist hashes match the
reviewed evidence. Final verdict: **`APPROVE` for the receipt identity
observer-only repair and new generation-2 isolated READY-only preparation**.
This approval does not amend or rehabilitate the old invalid receipt, complete
D4, restart D5, or constitute RC/release. The user's standing action approval
still requires a valid READY for each lane, at most one action per lane, and
immediate stop on the first failure; cookies, credentials, and account data
must never be copied or exported. Runtime, manifest, schema, build, adapter,
dist, candidate, authorization, and D4/D5 state remain unchanged.
- Phase 1– and 5 capability portfolios contain implemented V0 thin
  slices but are not complete; Phase 4 and 6 are future. None is an
  active line-by-line implementation plan.
- Final review-work QA hash deviation (Phase 0D): a later final
  review-work QA lane once mistakenly invoked `Get-FileHash` on the
  default `training-platform.sqlite` during its initial state capture;
  the hash was discarded immediately, no write occurred, and default
  DB `Length` 73728 / `LastWriteTimeUtc` 2026-07-13T17:49:36.9126118Z
  remained unchanged.

## Generation-2 valid READY-only closeout (2026-08-13)

After independent approval of the receipt-identity repair, both new
generation-2 lanes reached valid READY sequentially with no action mode:

- LeetCode reused its generation-2 profile:
  `output/playwright/v4-observation/leetcode-readiness-1786554246043.json`.
- NowCoder used a freshly-created generation-2 profile after Commander removed
  the verified empty directory:
  `output/playwright/v4-observation/nowcoder-readiness-1786554388436.json`.

Both receipts bind `generation=d4-revision2-generation2`, exact profile/database
identities, and unchanged five frozen dist hashes. Both report
`ready/browse_only`, target `e0/e1/submit/status=0/0/0/0`, queues `0/0`, and
SQLite `0/0/0`. No click, submit, login, credential/cookie read, source-code
read, or problem-text read occurred. The old missing-generation LeetCode
receipt remains an invalid diagnostic and was not amended.

Both browser contexts and fixed-DB servers are closed; port 3000 is free. This
is sequential READY preparation only; D4 is not accepted, D5 remains stopped,
and a new action-time authorization is required before any real submission.
