# V4 Phase D D4 Acceptance Contract Revision 2

## Result

The sole detailed Phase D plan now evaluates D4 through causal identity and
end-to-end durable invariants instead of requiring Chrome to expose every E1
and E2 transient as a separate observer callback/screenshot. This is an
acceptance-method correction only. Product candidate
`aa1a572c3913b35dd3f0391f849dab66e79c56a2` and its frozen Task 26 dist remain
unchanged. D4 is not yet complete, D5 is stopped, and this is not RC,
acceptance, or release.

## Why the old method stalled

The old D4 gate mixed two different questions:

1. did the product complete one correctly attributed local capture journey;
2. did an external observer happen to sample every millisecond intermediate
   state in separately delivered storage callbacks?

The second question became a hard prerequisite for the first. Task 27 showed
the consequence: the observer rejected a state transition and retained only
the preceding browse-only snapshot, so it could not adjudicate the production
flow or explain the rejected snapshot. Repeatedly changing the product
candidate to satisfy an observation-timing assumption would increase risk and
operator burden without improving the capture contract.

## External engineering basis

- Chrome Storage documents `onChanged` as responding when one or more items
  change. It does not define callback count as a business-stage clock:
  <https://developer.chrome.com/docs/extensions/reference/api/storage>.
- Google SRE separates black-box symptoms from white-box causes and describes
  production probes/canaries as structured production validation. D4 should
  make the observable product journey authoritative and use intermediate
  instrumentation for diagnosis:
  <https://sre.google/sre-book/monitoring-distributed-systems/> and
  <https://sre.google/sre-book/testing-reliability/>.
- W3C Trace Context and OpenTelemetry use stable propagated identity and a
  causal graph to correlate one distributed operation:
  <https://www.w3.org/TR/trace-context/> and
  <https://opentelemetry.io/docs/specs/otel/overview/>.
- AWS recommends explicit request identity plus idempotency so repeated or late
  delivery retains one logical side effect and remains auditable:
  <https://aws.amazon.com/builders-library/making-retries-safe-with-idempotent-APIs/>.

## Hard gates retained

Each active platform still requires:

- exact immutable product SHA and identical five pre/post dist hashes;
- fresh profile, paired extension, isolated zero-row database, and a direct
  browse-only no-side-effect baseline;
- one authorized exact target action and no second submission;
- unambiguous submit -> E2 -> E3 platform/problem/submission causality;
- one closed final verdict. `Compile Error` is valid because D4 verifies
  capture correctness, not solution correctness;
- one four-event bundle, one HTTP 200 POST, and one ACK;
- SQLite delta `+4 capture_events / +1 session / +1 non-voided attempt`, exact
  four-event sequence, `submission_confirmed` action, matching safe identities,
  and nondecreasing chronology;
- final waiting/outbox/quarantine `0/0/0` and no blocking diagnostic;
- unchanged blocked-platform readiness/drift without real blocked-platform
  submissions; and
- unchanged privacy boundary: no source code, problem statement, body,
  headers, cookies, token, account, raw request identity, or database path in
  the report.

## Requirements deliberately removed as hard gates

- E1 and E2 need not be captured as separate screenshots/snapshots.
- Storage callback count or adjacency is not business-stage evidence.
- Legal E0+E1, E1+E2, or E0+E1+E2 coalescence is not a failure.
- The user is not responsible for popup screenshots, timestamps, queue counts,
  or repeated progress messages.

No missing fact may be invented. A report labels evidence `direct`,
`coalesced`, `contract-implied`, or `not-observed`. Contract implication is
allowed only when an exact-candidate regression proves that the later durable
fact cannot exist without the prerequisite production guard.

## Product/tool separation

The D3 product candidate and the D4 observation tool now have separate
identities. A harness-only commit may touch only the dedicated observer
runner/helper, focused tests, and status documents. It must pass focused
regression, typecheck, targeted lint, privacy audit, syntax checks, diff check,
candidate-isolation diff, and independent code/privacy review. It records its
own SHA/hashes and does not invalidate the frozen product candidate.

Runtime, manifest, permission, schema, build, adapter-policy, or dist changes
still invalidate D4 evidence and return the work to D3.

## User-interaction budget

The next D4 execution asks the user only to log in if needed and then provide
one consolidated action-time authorization after both exact lanes are READY.
That authorization permits at most one LeetCode submission and one exact
approved-pilot NowCoder submission, expires on any environment/identity drift
or first failure, and never permits a silent retry. The Commander owns every
other setup, observation, cleanup, and reporting step.

Immediately before each action the Commander silently revalidates READY,
target, hashes, profile, and database. This does not create another user prompt.
After a successful lane there is no repeat; after the first classified failure
the consolidated authorization expires.

Operational clarification: the fixed localhost origin permits only one live
lane at a time. Readiness is therefore sequential and durable, not
simultaneous: a fixed per-platform disposable profile/database reaches
browse-only `0/0/0`, emits a bounded `ready` receipt, and closes without a
submission. Once both receipts exist, action-time execution reopens the same
profile/database one lane at a time and silently revalidates READY before the
authorized click. A changed profile, database, target, or hash invalidates the
batch authorization.

The executable setup is closed: for each platform, create the fixed lane
directory, run `npm run db:migrate` with `TRAINING_DB_PATH` set to its
`training-platform.sqlite`, write that resolved path plus one newline to the
adjacent `server-db-path.txt`, and start `npm run dev` with the same database
environment. The runner derives that fixed pointer by default and validates
the pointer/canonical path before any SQLite open. External/default databases,
cross-lane paths, symlinks, and junctions are rejected before row access.

## Harness implementation and RED/GREEN evidence

Only the dedicated observer helper/runner, focused observer tests/declarations,
and status documents changed. The reducer now treats each callback as a
cumulative causal fact set and derives the furthest proven invariant instead
of returning after one stage. Both LeetCode and NowCoder accept separated and
coalesced `E0/E1/E2` forms and exact repeated callbacks idempotently.

The GREEN implementation retains the immutable E2 submission key across the
production E3 consume shape: production removes the confirmed record and
matched transient E1 while adding the same-key tombstone and one outbox item.
ACK then requires the retained tombstone, drained outbox, success marker, and
exact isolated-database delta `+4/+1/+1`. This corrects only the observer
fixture; it does not change the frozen runtime contract.

Fail-closed tests retain rejection of identity replacement, stable-field or
chronology conflict, multiple durable records, E3 before locked E2 identity,
mismatched tombstone, wrong target, old V3 `submit_clicked`, unknown keys,
hostile getters, unsafe errors, malformed database paths, and post-ACK
mutation. Every terminal observer reason now produces a bounded fixed-reason
receipt with only target/queue/database counts. Stage evidence labels
direct/coalesced/not-observed facts. Exact submission-ID binding that cannot be
safely re-exported remains `contract-implied` by the frozen candidate's
exact-submit regression, never by time, URL recency, GraphQL, or popup text.
The exact citations are
`tests/unit/extensionLeetCodeNetworkAdapter.test.ts:442` (GraphQL/result E2
uses the exact-submit delivery seam), `:536` (zero/two exact submit identities
reject), and `:562` (crossed/inverted candidates reject without GraphQL
fallback); NowCoder crossed-document and missing-problem identity rejection is
anchored at `tests/unit/extensionNowCoderNetwork.test.ts:180`.

Failure evidence now carries the closed Revision 2 classification
`OBSERVER_INVALID`. The former generic internal transition reason is emitted
with fixed diagnosis `observer_transition_unadjudicable`; it is no longer used
as the lane's final classification. A future directly proven product
contradiction still requires explicit `PRODUCT_FAIL` adjudication rather than
being inferred from an observer transition.

RED before implementation was `33 passed / 5 failed`. Final pre-review
evidence is:

```text
observer suite:             67/67 passed
focused causal regression: 241/241 passed
npm run typecheck:          exit 0
targeted ESLint:            exit 0
node --check (2 scripts):   exit 0
privacy audit:              PASS, 0 findings
git diff --check:           exit 0 (CRLF conversion warnings only)
```

The exact reproducible `241/241` composition is observer `67`, plus four
frozen-product anchors `174`: LeetCode adapter `105`, NowCoder network `28`,
verdict candidate coordinator `21`, and verdict candidate flow `20`:

```powershell
npm test -- tests/unit/v4LiveObservationObserver.test.ts
npx vitest run --config vitest.extension.config.ts --no-file-parallelism tests/unit/extensionLeetCodeNetworkAdapter.test.ts tests/unit/extensionNowCoderNetwork.test.ts tests/unit/extensionVerdictCandidateCoordinator.test.ts tests/unit/extensionVerdictCandidateFlow.test.ts
```

Candidate-isolation diff against `aa1a572...` is empty for `extension/src`,
manifest, build, schema/database, production E2E, and candidate validator.
Because this work is intentionally uncommitted, the exact harness/test dirty
diff identity is Git blob hash
`57e24e9dfcb8dcfb90583230f7503fdb2ac72871`. Observer file hashes are:

```text
scripts/v4-live-observation-observer.mjs  3A679EA41EAA00E21BC50F6CC4299A7B85DC330148F5FBD359AC10C4C7E46C23
scripts/v4-live-observation.mjs           9DFC06B70E1127A9D234B459BA61D4C1278FB538DA77BB612EF5023729EC411B
```

The five Task 26 hashes were recomputed byte-identical:

```text
manifest.json        A85C3275D559BD46AAA034FEEA9B14EAFECFC6F56341713B2AFB8B024E2B3E64
background.js        9222BC90DB397B37499DE119482958BEAF1DD1A6E3136F7546A475676EC46C2D
content.js           8AC66A0B8B23AA2F5273D1687550226926A4D3791CBF1C1C3786B9D20FD785FC
popup.js             F863C9758EBF2FF464634D6FF986D3F296017C8A5A37D45A3692FB3F1B80240D
main-world-bridge.js  4D89A80F0351295EE1C0CD173BE107080983868D18510D028854695EACEE3943
```

## Historical independent review and verdict (superseded)

The following `APPROVE` statements are historical snapshots for the earlier
Revision 2 causal observer and sequential-READY runner. They are superseded by
the later LeetCode failure, the E1-provisional repair, and the subsequent
persistent-entrypoint parity review. They do not authorize a current action.

Independent code/privacy/scope review returned **`APPROVE`** with no HIGH or
MEDIUM findings for the causal observer Revision 2. Follow-up review of the
sequential READY runner amendment also returned **`APPROVE`** with no HIGH or
MEDIUM findings after independently rechecking observer `59/59`, product
anchors `174/174`, path-before-access/mutation ordering, fixed lane identities,
and all gates/hashes below. The prior review independently rechecked observer
`52/52`, product causal anchors
`181/181`, privacy `0 findings`, typecheck, syntax, targeted lint,
diff-check, candidate-path isolation, the two observer hashes, tool/test patch
hash, and all five frozen dist hashes. It confirmed that D4 hard product gates
were not lowered, old V3 click paths and wrong/crossed identity remain
ineligible, duplicate/replayed delivery remains terminal, and this compliant
observer-only change does not trigger D3 re-freeze.

Historical verdict at that time: **APPROVE for sequential READY preparation only.** D4 itself
is not complete, and no real submission is authorized. No production code,
candidate, dist, platform state, or user data changed, and no live submission
occurred. The historical next action at that time was to prepare both exact
lanes to READY and then ask
for the single consolidated action-time authorization defined by section 10.6.
That historical preparation authorization is expired after the later LeetCode
failure; the current state is no live retry and independent review required.

Preparation update: LeetCode produced a valid READY receipt. The first
NowCoder preparation stopped safely at browse-only with
`OBSERVER_INVALID / observer_storage_key_rejected`, all extension queues and
SQLite `0/0/0`, and no submission. Static diagnosis identified only the known
V4 B3 control key emitted by ordinary navigation. The observer now ignores
that one key name without reading its value or treating it as evidence; unknown,
credential, V3, and mixed illegal keys remain terminal. This narrow amendment
received follow-up independent **APPROVE** with no HIGH/MEDIUM findings. One
NowCoder READY retry was authorized at that historical point; it is superseded
and no current retry or submission is authorized.

READY closeout: the approved retry produced
`output/playwright/v4-observation/nowcoder-readiness-1786527061654.json`; the
LeetCode receipt is
`output/playwright/v4-observation/leetcode-readiness-1786526390512.json`.
Both record `outcome=ready`, `finalStage=browse_only`, target counts
`0/0/0/0`, queues `0/0/0`, SQLite `0/0/0`, and identical pre/final Task 26
hashes. LeetCode profile/database identities are
`179279b529ccdb5483c1bba3202e3af2a26c4dfbc114e3e0286937a703184212` /
`fc1a8e401dc10e24eeefa09ac7dabd1728505d9711944ae7c85f697f46f6f58a`;
NowCoder identities are
`925504138caec696db3222e8f8f89e2075298606d7df4bae64d5bebdbc4e1aef` /
`19032c7aa4d79f5d3ac133f55b5362e73787a51e56bd1b7906f74c9637dbb770`.
Port 3000 is free and both lane browsers are closed. No submission occurred.
The next gate was the one consolidated action-time authorization; that
historical gate is now expired and cannot be reused.

Action update: consolidated authorization was granted, but the first desktop
control attempt could not safely bind the Chromium window and its outer runner
wait timed out at browse-only. SQLite remained `0/0/0`; no submission or
platform side effect occurred. A closed runner-only action mode now performs
one strict fixed-selector click only after READY and closes after ACK. It does
not inspect code/editor content and rejects READY-only/action conflicts or
unknown modes. This amendment was `REVIEW REQUIRED` before executing the then-
valid authorization; that authorization is now expired and cannot be executed.

Final action outcome: independent review approved the closed action runner with
no HIGH/MEDIUM findings. The single authorized LeetCode action produced
`output/playwright/v4-observation/leetcode-real-observation-failed-1786528735567.json`.
The receipt binds the frozen target/profile/database/dist and records the fixed
runner selector, `attempted=true`, `clickCompleted=false`, exact submit E1 `1`,
E0/E2/delivery `0`, queues `0/0/0`, and SQLite `0/0/0`. It classifies
`OBSERVER_INVALID / observer_transition_unadjudicable`; this is not a product
failure and not D4 PASS. The observed submit E1 consumes the LeetCode action
budget. Per the first-failure expiry rule, NowCoder was not submitted and no
retry occurred. Both lane browsers are closed and both databases remain
`0/0/0`. D4 and D5 remain stopped.

### Observer repair RED (2026-08-12)

Before changing the reducer, a focused RED test was added for callback-arrival
ordering. It supplies a baseline, an exact target E1 with no E0, a same-target
E0 whose `observedAt` is equal to the E1 `receivedAt`, an E0 after E1, and E2
without E0. The required contract is that E1-only is a bounded provisional
fact, E0-after-E1 and E2-without-E0 fail closed, and repeated callbacks are
idempotent. The pre-repair observer rejected the first E1-only snapshot as a
terminal transition:

```text
npx vitest run --no-file-parallelism tests/unit/v4LiveObservationObserver.test.ts
Test Files  1 failed (1)
Tests       1 failed | 67 passed (68)
Failure     Revision 2 RED/GREEN keeps callback-arrival E1 provisional until an earlier E0 converges
Assertion   expected provisional.ok to be true; received false
Location    tests/unit/v4LiveObservationObserver.test.ts:873
```

This is the intended RED evidence for the observer-only repair. No production
extension, immutable candidate, exact dist, browser submission, or database
was changed by this RED step.

### Observer callback-arrival repair GREEN closeout — pre-parity (2026-08-12)

The observer-only repair is now GREEN. The final focused observer suite has 69
tests: the original legal coalescence, duplicate, identity, privacy, V3, and
delivery cases plus the LeetCode and NowCoder E1-provisional convergence cases.
The four frozen product anchor suites remain unchanged at 174 tests. The exact
focused total is therefore 243/243:

```text
observer: 69/69 passed
LeetCode adapter: 105/105 passed
NowCoder network: 28/28 passed
verdict coordinator: 21/21 passed
verdict flow: 20/20 passed
combined: 243/243 passed
```

Commands actually run after implementation:

```powershell
npx vitest run --no-file-parallelism tests/unit/v4LiveObservationObserver.test.ts
npx vitest run --config vitest.extension.config.ts --no-file-parallelism tests/unit/extensionLeetCodeNetworkAdapter.test.ts tests/unit/extensionNowCoderNetwork.test.ts tests/unit/extensionVerdictCandidateCoordinator.test.ts tests/unit/extensionVerdictCandidateFlow.test.ts
npm run typecheck
npx eslint scripts/v4-live-observation-observer.mjs scripts/v4-live-observation.mjs tests/unit/v4LiveObservationObserver.test.ts
node --check scripts/v4-live-observation-observer.mjs
node --check scripts/v4-live-observation.mjs
node scripts/audit-v4-extension-privacy.mjs
git diff --check
git diff --name-only -- extension/src extension/manifest.json extension/dist lib/db app/api/capture package.json package-lock.json next.config.ts tsconfig.json
```

All commands exited zero; privacy audit reported `0 findings`; protected-path
diff output was empty. `git diff --check` emitted only the repository's known
LF/CRLF conversion warnings. No full quality gate, build, extension E2E, or
real-browser submission was run in this observer-only repair.

The current observer-only file hashes are:

```text
scripts/v4-live-observation-observer.mjs  D7C6F151988D3CB83A5F9011F0ED796D86606D78089636547F431AC3B81B51E6
scripts/v4-live-observation.mjs           4E55FD3C609E59663A1317EE3020872642F1E1ADC9A82E07F323661B355B730D
tests/unit/v4LiveObservationObserver.test.ts 414A17E70517DD73C4C3727C1F74C5AD044DC502EE546E3EF04D577F1960A084
tests/unit/v4LiveObservationObserver.d.ts A941529438017BA687FB7BCFF24DE94FFCAD2C18FEF00A37491BCC008A3A37F1
```

The five immutable Task 26 dist hashes remain byte-identical:

```text
manifest.json        A85C3275D559BD46AAA034FEEA9B14EAFECFC6F56341713B2AFB8B024E2B3E64
background.js        9222BC90DB397B37499DE119482958BEAF1DD1A6E3136F7546A475676EC46C2D
content.js           8AC66A0B8B23AA2F5273D1687550226926A4D3791CBF1C1C3786B9D20FD785FC
popup.js             F863C9758EBF2FF464634D6FF986D3F296017C8A5A37D45A3692FB3F1B80240D
main-world-bridge.js 4D89A80F0351295EE1C0CD173BE107080983868D18510D028854695EACEE3943
```

The change remains limited to the observer helper/runner, observer tests and
declaration, and status documents. Production runtime, manifest, schema,
build, adapter, package files, candidate `aa1a572c3913b35dd3f0391f849dab66e79c56a2`,
dist, database, and platform state are unchanged. The previously granted
LeetCode/NowCoder action authorization is expired after the failed LeetCode
attempt; no live retry, no NowCoder submission, and no D5 action occurred.
This pre-parity closeout was `REVIEW REQUIRED` pending an independent review;
it is retained as a historical snapshot and is superseded by the parity
review below. It was not D4 platform acceptance, RC, release, or user
acceptance.

### Persistent observer fake-Chrome parity follow-up (2026-08-12)

Independent review identified one additional observer-only gap: the persistent
page lost its private chronology metadata after an unrelated allowed callback
between the E1 and E0 callbacks. A matching E0 then projected
`targetOrder=not-observed` instead of `e0-before-e1`. The RED parity test
inserted an allowed `contentIngressReady` callback between E1 and E0 and
confirmed the failure:

```text
npx vitest run --no-file-parallelism tests/unit/v4LiveObservationObserver.test.ts
Test Files  1 failed (1)
Tests       1 failed | 69 passed (70)
Failure     keeps persistent fake-Chrome E1 arrival provisional and converges only on causal E0
Assertion   expected targetOrder e0-before-e1; received not-observed
Location    tests/unit/v4LiveObservationObserver.test.ts:1744
```

The persistent entrypoint now carries the bounded internal chronology metadata
across every allowed callback and attaches it after each projected batch. The
fake-Chrome test proves E1-only is nonterminal/provisional, an intervening
allowed callback does not erase the causal fact, a matching E0 emits only the
safe enum `e0-before-e1` and converges through the reducer, and an E0-after-E1
emits `e0-after-e1` and is rejected by the reducer. Serialized fake-Chrome
events contain no raw timestamps, request IDs, document IDs, or other private
fields.

GREEN evidence after the parity fix:

```text
observer focused:       70/70 passed
product causal anchors: 174/174 passed
combined focused total: 244/244 passed
npm run typecheck:       exit 0
targeted ESLint:         exit 0
node --check (2 scripts): exit 0
privacy audit:           PASS, 0 findings
git diff --check:        exit 0 (only CRLF conversion warnings)
protected-path diff:     empty
Task 26 dist hashes:     byte-identical
```

Commands actually run for this follow-up were the focused observer suite, the
four frozen product anchor suites, `npm run typecheck`, targeted ESLint on the
observer helper/runner/test, `node --check` on both observer scripts,
`node scripts/audit-v4-extension-privacy.mjs`, `git diff --check`, and a
protected-path `git diff --name-only` check. No full quality gate, build,
extension E2E, live browser, or real submission was run.

Latest observer-only hashes:

```text
scripts/v4-live-observation-observer.mjs  3B2DD9F7B91F46A89B47B6946EF416EBD172027C660F8EE121039C12E432C2B0
scripts/v4-live-observation.mjs           4E55FD3C609E59663A1317EE3020872642F1E1ADC9A82E07F323661B355B730D
tests/unit/v4LiveObservationObserver.test.ts 2A81DE7690B29ABDA4C7B760896DAB8B4C4999BCCE16107A1127CEDD7569920E
tests/unit/v4LiveObservationObserver.d.ts A941529438017BA687FB7BCFF24DE94FFCAD2C18FEF00A37491BCC008A3A37F1
```

The independent final review of this parity repair reran the focused observer
suite and all four frozen product anchor suites: observer `70/70`, anchors
`174/174`, combined `244/244`, with no HIGH or MEDIUM findings. It independently
matched the observer-only hashes above and the five frozen Task 26 dist hashes
(`A85C3275D559BD46AAA034FEEA9B14EAFECFC6F56341713B2AFB8B024E2B3E64`,
`9222BC90DB397B37499DE119482958BEAF1DD1A6E3136F7546A475676EC46C2D`,
`8AC66A0B8B23AA2F5273D1687550226926A4D3791CBF1C1C3786B9D20FD785FC`,
`F863C9758EBF2FF464634D6FF986D3F296017C8A5A37D45A3692FB3F1B80240D`,
`4D89A80F0351295EE1C0CD173BE107080983868D18510D028854695EACEE3943`).
Final reviewer verdict: **`APPROVE` for the provisional-E1
observer amendment only**. This approval does not restore the expired
LeetCode/NowCoder action authorization, authorize a live retry or a NowCoder
submission, or restart D5; D4 remains incomplete. The next action is to form a
new real-observation plan and obtain new explicit action-time authorization;
the frozen candidate cannot be submitted directly from this review.

## Fixed-lane environment audit and stale confirmation discovery (2026-08-12)

The follow-up was limited to environment isolation and READY-only preparation;
no platform action was authorized. Both fixed lanes were preflighted with the
documented profile/database pairing. The LeetCode pointer resolved to its
adjacent `.tmp/v4-live-observation-db/d4-revision2-leetcode/training-platform.sqlite`
and the NowCoder pointer to its own adjacent database; both files and pointer
files were non-symbolic, migrations completed, and each database reported
`capture_events=0`, `training_sessions=0`, `training_attempts=0`. The fixed
profiles each contained one `location=8` unpacked extension record pointing to
`.tmp/task26-exact-dist-aa1a572`. Historical `.tmp` profile/database
directories still exist but are not enumerated or loaded by the fixed runner;
they are cleanup debt only.

The exact fixed LeetCode lane then ran `--ready-only=true
--authorized-submit=false` and failed before READY. Receipt:
`output/playwright/v4-observation/leetcode-real-observation-failed-1786548934476.json`.
It binds profile identity
`179279b529ccdb5483c1bba3202e3af2a26c4dfbc114e3e0286937a703184212`, database
identity `fc1a8e401dc10e24eeefa09ac7dabd1728505d9711944ae7c85f697f46f6f58a`,
and identical pre/final hashes for all five immutable dist artifacts. The safe
classification is `OBSERVER_INVALID` with fixed error
`epoch_result_surface_unchanged`; target counts are `e0=0/e1=0/submit=0/status=0`,
extension counts are `confirmed=1/tombstones=0/outbox=0/quarantine=0`, and the
final database remains `0/0/0`. No click or submission occurred and no action
authorization was consumed. Server PIDs `52296/45408` were verified stopped,
port 3000 is free, and NowCoder READY was not attempted.

The evidence supports stale same-profile durable state, not a product defect.
Static inspection of the immutable orchestrator (`extension/src/backgroundOrchestrator.ts:871-906`
and `:1207-1359`) confirms that E2 persistence creates a confirmed record
before E3; successful E3 handling removes that record and creates the matching
tombstone/outbox delivery path. Thus
`confirmed=1` with no tombstone/outbox and SQLite `0/0/0` is consistent with a
previous E2 that did not reach E3 or delayed state after an earlier observer
termination. It does not prove a new submit, cannot satisfy a browse-only
READY baseline, and does not explain or invalidate the callback-arrival
E1-before-E0 observer repair. No product/runtime/dist change is inferred.

The next safe engineering action is a written, read-only adjudication of this
already-confirmed record: preserve the fixed profile, database, receipt, and
exact dist; review only safe identity/chronology/count evidence; and use
disposable observer/unit fixtures to determine whether a matching E3 can be
replayed without a new platform action. Any recovery replay, profile/database
reset, or new READY/action attempt requires a plan revision and independent
review `APPROVE`, followed by fresh explicit action-time authorization. No new
authorization is requested by this checkpoint; D4 remains incomplete and D5
stopped.

## Read-only identity/chronology adjudication (2026-08-12)

No browser, platform navigation, profile reset, database reset, E3 replay,
READY retry, or action occurred. The bounded receipt contains only the safe
count `confirmed=1`; it intentionally omits the allowlisted confirmed identity
fields (`platform`, `problemExternalId`, `externalSubmissionId`, `storageKey`,
`confirmedAt`, `lastE3At`). The actual fixed profile therefore cannot be
bound to the prior target/submission without opening the profile's live
storage, which is outside this read-only no-browser/raw-LevelDB checkpoint.

A pure observer-only adjudicator and focused fixtures characterize the safe
decision boundary without touching production code or the real profile. The
RED run was:

```text
npx vitest run --no-file-parallelism tests/unit/v4LiveObservationObserver.test.ts
Tests 1 failed | 70 passed (71 total)
Failure: adjudicateConfirmedRecovery was not a function
```

After implementation, GREEN is `71/71`. Given a safe projected snapshot with
one unfinalized confirmed record, zero queues/tombstones/quarantine, zero-count
DB, and allowlisted `epoch_result_surface_unchanged`, the helper returns:

```text
exact expected key       -> recovery_candidate / exact_prior_lane_identity
submission-key mismatch  -> wrong_identity / submission_key_mismatch
target mismatch          -> wrong_identity / target_identity_mismatch
no expected key           -> stale_unbound / prior_lane_identity_unavailable
no capture error          -> stale_unbound / capture_error_unavailable
side effect present      -> stale_unbound / durable_side_effect_present
```

The normal fresh-baseline reducer still rejects the same error-bearing
confirmed snapshot as `observer_capture_error`; the helper is diagnostic and
does not authorize or construct E3/ACK. The fixture's `recovery_candidate`
result must not be mistaken for live evidence because the actual receipt lacks
the expected key.

Static immutable-path review maps E2 persistence to
`extension/src/backgroundOrchestrator.ts:871-906`, exact matching E3 consume
plus tombstone/outbox construction to `:1207-1359`, and successful ACK/outbox
clear to `extension/src/outboxDrain.ts:140-154`. A confirmed record can thus
remain after E2 if E3 was not observed; `confirmed=1` with no tombstone/outbox
and DB `0/0/0` does not prove a new submission or a product defect.

Current recommendation is **Option B — terminal profile evidence; defer to a
new isolated profile/database and separately authorized action**. This is
`REVIEW REQUIRED` pending independent review. Preserve all existing evidence;
do not reset/delete/replay/retry/submit. No new authorization is requested.
Observer-only hashes after the fixture are:

```text
scripts/v4-live-observation-observer.mjs  2928636445E52AA54C5B048CEE92A31020FB83A0D53D08161FAFD437CE4BF803
tests/unit/v4LiveObservationObserver.test.ts 61B57C69A8E05D0FB0663C794895ED355ACFBEE6D4F7A0E6A0DEB68E04831708
tests/unit/v4LiveObservationObserver.d.ts B61E0F632274C758B6B0551D3EAD750C3404FD8B50CBCC379BE1D7918982FFBA
```

Verification for this harness-only step: observer `71/71`, typecheck exit `0`,
targeted lint exit `0`, both observer syntax checks exit `0`, privacy audit
`0 findings`, protected-path diff empty, and `git diff --check` exit `0` with
known LF/CRLF warnings. The four product anchor suites were not rerun in this
read-only adjudication; their prior recorded `174/174` remains historical
evidence, not a new count.

## Exact capture-error gate follow-up (2026-08-12)

Independent review found a MEDIUM harness ambiguity: the adjudicator accepted
any allowlisted capture error as sufficient for `recovery_candidate` when an
expected submission key was supplied. A RED fixture using
`epoch_started_missing` reproduced the over-acceptance:

```text
npx vitest run --no-file-parallelism tests/unit/v4LiveObservationObserver.test.ts
Tests 1 failed | 70 passed (71 total)
Expected stale_unbound/capture_error_mismatch; received recovery_candidate
```

The GREEN fix makes the recovery gate exact: only
`epoch_result_surface_unchanged` plus an exact expected prior-lane submission
key can yield `recovery_candidate`. `epoch_started_missing`, network errors,
and other general allowlisted errors yield `stale_unbound` with fixed reason
`capture_error_mismatch`. The helper remains diagnostic-only, never replays
E3/ACK, and the fresh baseline remains fail-closed. GREEN is observer `71/71`.

The real receipt does carry the exact result-surface error, but it does not
carry the identity fields needed to provide the expected key; the fixture's
candidate is therefore not live recovery evidence. At the pre-review
checkpoint Option B was `REVIEW REQUIRED`; the profile remains terminal
evidence, with a later new isolated profile/database and separately reviewed/
authorized action. No replay, reset, READY retry, action, or new authorization
occurred.

Latest observer-only hashes:

```text
scripts/v4-live-observation-observer.mjs  2928636445E52AA54C5B048CEE92A31020FB83A0D53D08161FAFD437CE4BF803
tests/unit/v4LiveObservationObserver.test.ts 61B57C69A8E05D0FB0663C794895ED355ACFBEE6D4F7A0E6A0DEB68E04831708
tests/unit/v4LiveObservationObserver.d.ts B61E0F632274C758B6B0551D3EAD750C3404FD8B50CBCC379BE1D7918982FFBA
```

## Independent final review and Option B verdict (2026-08-13)

The independent reviewer reran the post-fix observer and gates: observer
`71/71`, typecheck exit `0`, targeted lint exit `0`, both observer syntax
checks exit `0`, privacy audit `0 findings`, `git diff --check` exit `0`
(known LF/CRLF warnings only), and protected-path diff empty. The reviewer
matched the three observer-only hashes above and all five immutable Task 26
dist hashes:

```text
manifest.json        A85C3275D559BD46AAA034FEEA9B14EAFECFC6F56341713B2AFB8B024E2B3E64
background.js        9222BC90DB397B37499DE119482958BEAF1DD1A6E3136F7546A475676EC46C2D
content.js           8AC66A0B8B23AA2F5273D1687550226926A4D3791CBF1C1C3786B9D20FD785FC
popup.js             F863C9758EBF2FF464634D6FF986D3F296017C8A5A37D45A3692FB3F1B80240D
main-world-bridge.js 4D89A80F0351295EE1C0CD173BE107080983868D18510D028854695EACEE3943
```

The historical MEDIUM exact-error ambiguity is closed; the final review found
no HIGH or MEDIUM findings and returned **`APPROVE` for Option B**. This is an
observer/evidence disposition only: it grants no current real authorization,
does not reset/delete/replay the fixed profile or database, and does not
complete D4 or restart D5. The next step is a new written real-observation
plan, then a new profile/database READY preparation followed by fresh
action-time authorization. No direct submission is permitted from this
approval.

## New-generation fixed identity support (2026-08-13)

This observer-only amendment implements the next Option B step without
opening or mutating the historical fixed lanes. The only accepted generation
is the explicit closed token `d4-revision2-generation2`; missing, unknown,
historical `d4-revision2`, duplicate, wrong-platform, cross-generation,
reuse-mismatch, and symlink/junction paths fail closed. The runner now requires
exactly one `--generation=d4-revision2-generation2`, validates generation-aware
profile/database roots before any database read or browser launch, and binds
that generation with the existing profile/database SHA-256 identities in both
READY and eventual action receipts. Old `d4-revision2-*` paths remain
readable historical evidence only and cannot satisfy the new plan.

Future paths are restricted to:

```text
.tmp/v4-live-observation-profiles/d4-revision2-generation2-leetcode
.tmp/v4-live-observation-profiles/d4-revision2-generation2-nowcoder
.tmp/v4-live-observation-db/d4-revision2-generation2-leetcode/server-db-path.txt
.tmp/v4-live-observation-db/d4-revision2-generation2-nowcoder/server-db-path.txt
.tmp/v4-live-observation-db/d4-revision2-generation2-leetcode/training-platform.sqlite
.tmp/v4-live-observation-db/d4-revision2-generation2-nowcoder/training-platform.sqlite
```

The written next observation remains sequential READY-only: LeetCode
`leetcode.cn/problems/merge-two-sorted-lists/`, then the approved NowCoder
`ac.nowcoder.com/acm/contest/18839/1001`, both with exact dist
`.tmp/task26-exact-dist-aa1a572` and its unchanged five frozen hashes. No
profile/database was created, no server/browser was started, and no READY,
click, submission, replay, reset, deletion, or action authorization occurred.
The first future failure or identity mismatch must stop the sequence. A later
reviewed action-time authorization can cover at most one merged action per
lane; all prior authorization is expired.

RED/GREEN evidence:

```text
RED: npx vitest run --no-file-parallelism tests/unit/v4LiveObservationObserver.test.ts
     1 failed / 76 passed (77 total); runner lacked generation binding.
GREEN: same command, 77/77 passed.
Product anchors: npx vitest run --config vitest.extension.config.ts --no-file-parallelism \
  tests/unit/extensionLeetCodeNetworkAdapter.test.ts \
  tests/unit/extensionNowCoderNetwork.test.ts \
  tests/unit/extensionVerdictCandidateCoordinator.test.ts \
  tests/unit/extensionVerdictCandidateFlow.test.ts
  174/174 passed; combined focused 251/251.
npm run typecheck: exit 0
targeted ESLint (observer/runner/test): exit 0
node --check scripts/v4-live-observation-observer.mjs: exit 0
node --check scripts/v4-live-observation.mjs: exit 0
node scripts/audit-v4-extension-privacy.mjs: PASS, 0 findings
git diff --check: exit 0 (known CRLF conversion warnings only)
protected-path diff: empty
```

Current observer-only hashes:

```text
scripts/v4-live-observation-observer.mjs  8B2D68B2C93274AF4F01667630F95EB125D352AE152E5AE35688D5F332C37D79
scripts/v4-live-observation.mjs          6859FB997C7F379B9C4B3CBABEA2DCF7EB62F160A9544532E59B2102BCCA4E46
tests/unit/v4LiveObservationObserver.test.ts 09AE1AC4CB595FE16D042AEA8F7B6C8C93E4397B9A928384982366C1B8D2DA70
tests/unit/v4LiveObservationObserver.d.ts E76687FC485200E3C7C3A2350042F60E593494071652FCE42DB3E0DE68DDCE14
```

The five immutable Task 26 dist hashes remain exactly those recorded in the
independent Option B review: manifest
`A85C3275D559BD46AAA034FEEA9B14EAFECFC6F56341713B2AFB8B024E2B3E64`,
background
`9222BC90DB397B37499DE119482958BEAF1DD1A6E3136F7546A475676EC46C2D`,
content
`8AC66A0B8B23AA2F5273D1687550226926A4D3791CBF1C1C3786B9D20FD785FC`,
popup
`F863C9758EBF2FF464634D6FF986D3F296017C8A5A37D45A3692FB3F1B80240D`, and
bridge
`4D89A80F0351295EE1C0CD173BE107080983868D18510D028854695EACEE3943`.

Independent review has now rerun this generation-2 amendment and returned
**`APPROVE`** with no HIGH or MEDIUM findings: observer `77/77`, frozen product
anchors `174/174`, and combined focused evidence `251/251`. The reviewer also
confirmed the corrected test SHA
`09AE1AC4CB595FE16D042AEA8F7B6C8C93E4397B9A928384982366C1B8D2DA70` against
`Get-FileHash`; all observer-only hashes and the five frozen Task 26 dist
hashes remain unchanged. The approval is limited to the generation-2
observer-only amendment and isolated profile/database preparation. It is not
D4 product acceptance, RC, release, or an unconditional live-action grant.
The user's standing default action approval still requires a valid READY for
each lane, at most one action per lane, and immediate stop on the first
failure; no cookies, credentials, or account data may be copied or exported.
The immutable candidate, extension source/runtime/manifest/schema/build/
adapter/dist, default database, and historical evidence remain unchanged; D4
is incomplete and D5 remains stopped.

## Generation-2 READY receipt identity repair (2026-08-13)

The first generation-2 LeetCode READY-only receipt is retained as an invalid
diagnostic because `generation` was omitted: the runner read the
`projectObservationIdentity()` wrapper instead of its `.value`. It cannot
authorize or support an action and remains unchanged.

The observer-only repair adds `projectObservationReceiptIdentity()` and makes
the runner consume the validated `.value` for generation/profile/database
identities on READY, ACK, and failure paths. Outer/missing/undefined/unknown
generation fields, accessor identities, and malformed SHA-256 values fail
closed.

RED was `3 failed / 75 passed (78 total)`; GREEN is observer `78/78`, frozen
product anchors `174/174`, combined focused `252/252`. Typecheck, targeted
lint, syntax, privacy (`0 findings`), diff check, and protected-path isolation
pass. The fixed LeetCode server/browser are closed and port 3000 is free; the
NowCoder generation-2 profile was not opened. No login, click, submit, or
action authorization occurred after diagnosis. Pre-hardening checkpoint verdict:
The pre-hardening checkpoint was **`REVIEW REQUIRED`**; that historical status
is superseded by the independent final review recorded in the hostile-wrapper
section below. D4 remains incomplete and D5 stopped.

## Hostile outer receipt-wrapper hardening (2026-08-13)

The independent observer audit found one observer-only MEDIUM in the new
identity projector: an outer `ok` or `value` accessor could throw before the
fixed rejection was returned. RED added separate hostile outer getters and
asserted zero getter reads, plus inherited fields, hidden extra own keys, and
non-data descriptors. The pre-fix run was `3 failed / 78 passed` (`81`).

The helper now performs an exact own data-descriptor gate before reading the
outer wrapper: prototype must be `Object.prototype` or `null`, own keys must
be exactly `ok` and `value`, and both descriptors must be data descriptors.
The inner exact-key/data-descriptor gate remains unchanged; no catch swallows
raw exceptions. GREEN and focused gates are:

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

The preceding identity-unwrapper hashes are historical: observer
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

The five immutable Task 26 dist hashes remain unchanged. The earlier
generation-2 LeetCode READY receipt is still an **INVALID READY diagnostic**
and was not amended; NowCoder was not run. No live/server/browser/READY or
action work occurred. Independent final review reran the current observer and
frozen product anchors: observer `81/81`, anchors `174/174`, combined focused
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

## Generation-2 valid READY-only closeout (2026-08-13)

Following the independent approval of the receipt-identity repair, both
generation-2 lanes reached valid READY sequentially with
`--ready-only=true --authorized-submit=false`; no click or submit occurred.

LeetCode reused its generation-2 profile and produced
`output/playwright/v4-observation/leetcode-readiness-1786554246043.json`.
The receipt has `generation=d4-revision2-generation2`, outcome `ready`, final
stage `browse_only`, target counts `0/0/0/0`, queues `0/0`, SQLite `0/0/0`,
profile/database identities, and byte-identical pre/final frozen dist hashes.

Commander removed the previously verified empty NowCoder profile. A first-use
generation-2 profile then produced
`output/playwright/v4-observation/nowcoder-readiness-1786554388436.json` with
the same generation binding, `ready/browse_only`, target `0/0/0/0`, queues
`0/0`, SQLite `0/0/0`, and identical five dist hashes. No credentials,
cookies, source code, or problem statement were read or exported.

Both runner browser contexts and fixed-DB local servers were closed; port 3000
is free. The old missing-generation receipt remains an invalid diagnostic and
was not amended. Current result is valid READY preparation only, not D4
acceptance: action-time authorization is still required before any single
per-lane submit, and D5 remains stopped.

## Generation-2 authorized LeetCode failure and strict-click chronology repair (2026-08-13)

The first authorized generation-2 LeetCode action consumed one fixed runner
click and produced
`output/playwright/v4-observation/leetcode-real-observation-failed-1786555212760.json`.
It is `OBSERVER_INVALID / observer_target_rejected`, final stage
`e1_provisional`, target `e0/e1/submit/status=1/1/1/0`, queues `0/0/0/0`, and
SQLite `0/0/0`; it binds generation/profile/database and unchanged frozen dist
hashes. The user-supplied screenshot corroborates that the platform reached a
final `Compile Error`, but screenshots are diagnostic and cannot satisfy D4.
The runner/browser/server were stopped and port 3000 was freed. No NowCoder
action occurred.

Static product evidence rules out an unsupported verdict: `Compile Error` is
in `FINAL_CAPTURE_VERDICTS`, and the frozen LeetCode anchor suite contains its
request-bound E3 flow. The failure occurred earlier because the exact network
E1 can be dispatched by the page before the document bubble-phase click hint
records E0. Historical databases and multiple extension versions were not
loaded by the fixed runner and did not cause this failure.

Observer RED/GREEN and independent review closed both the chronology false
terminal and a newly found success-receipt privacy issue. The reviewed runner
uses a one-shot lane-bound `dispatch_started` capability and deterministic
deferred snapshot replay. Only exact LeetCode E1-provisional plus one matching
E0-after-E1 consumes it; ACK is required to supersede a click promise error.
ACK finalization is shared and exactly once. Successful stage history now
contains only closed counts/basis/state, and the top-level success timestamp was
removed. Wrong target/identity, E2-before-E0, missing ACK, duplicate/forged
context, V3 paths, queue/DB drift, and privacy violations remain fail-closed.

Final evidence: observer `88/88`, product anchors `174/174`, combined
`262/262`; typecheck, targeted lint, two syntax checks, privacy (`0 findings`),
diff check, and protected-path isolation all pass. Current hashes are observer
`45948FE4E9864815F07E13233200C99BA8732C46865C0CCDF38908504E2BE9ED`, runner
`72D14F40772BD8036CF1C5B6303C3F7CB8184122E51251F6732ED56CE5BF896A`, test
`077E4D202D667741FC04711D895C05CA3791E23040743B770240DA5BC08ECD02`, and d.ts
`1A51483E63630C49406405EBDE4B1A901C927D0FD3605C001EC1CA2A859283E6`.
All five Task 26 dist hashes remain byte-identical.

Independent final verdict: **`APPROVE`**, no HIGH/MEDIUM findings, limited to
this observer-only amendment. The failed LeetCode action remains consumed and
its profile/DB/receipt are terminal evidence; it is not D4 PASS. D4 is
incomplete and D5 stopped. The next live lane must use a new isolated identity
and obtain a fresh READY under the reviewed observer; no cookie, credential, or
account-data copy is permitted.

## Generation-3 isolated replacement identity amendment (2026-08-13)

Generation2 LeetCode remains consumed terminal evidence, while generation2
NowCoder READY was produced under predecessor observer bytes. The coherent
replacement batch therefore uses only `d4-revision2-generation3` and the exact
per-platform profile/database/pointer roots recorded in plan section 14.20.
The current runner rejects generation2 and every missing, unknown, duplicate,
cross-generation, cross-platform, cross-root, reuse-mismatched, symlink, or
junction identity. Historical assets were not deleted or modified.

RED was observer `88/89`: generation3 was the sole rejected case. GREEN is
observer `89/89`; frozen product anchors are `174/174`, combined `263/263`.
Commander reran `npm run typecheck`, targeted ESLint for the observer/runner/
test, both `node --check` commands, `node scripts/audit-v4-extension-privacy.mjs`,
`git diff --check`, and the protected-path comparison against
`aa1a572c3913b35dd3f0391f849dab66e79c56a2`; all exit `0`, privacy reports
`0 findings`, and the protected product diff is empty. Current SHA-256:

```text
scripts/v4-live-observation-observer.mjs  4E697F1114D4306BACE167A55D23D3623C34940155FB94D51839ABD526B1F57A
scripts/v4-live-observation.mjs           72D14F40772BD8036CF1C5B6303C3F7CB8184122E51251F6732ED56CE5BF896A
tests/unit/v4LiveObservationObserver.test.ts 3E3E11A47BC5350C14F1E983BF34B2C9E1E2C0FDFAF615F1C43BED29D7946233
tests/unit/v4LiveObservationObserver.d.ts 10301E9243DC6C39370B96E7ED93454EDD2C6F7F59F98605DB690D9B65DA829C
```

The Task 26 dist hashes remain `A85C3275...`, `9222BC90...`, `8AC66A0B...`,
`F863C975...`, and `4D89A80F...`. Independent final review returned
**`APPROVE`** with no HIGH/MEDIUM findings. Approval is limited to isolated
generation3 READY-only preparation. It does not authorize a click/submission,
complete D4, restart D5, or alter the frozen candidate/dist.

## Generation-3 READY and real LeetCode terminal evidence (2026-08-13)

READY-only succeeded for both isolated lanes:
`leetcode-readiness-1786559426411.json` and
`nowcoder-readiness-1786559535694.json`. Both receipts are generation3,
`ready/browse_only`, target/queue/SQLite zero, profile/database bound, and
byte-identical to the five Task 26 dist hashes. The user interactively logged
into the two exact profiles; no private login material was inspected or copied.

The authorized LeetCode lane then consumed exactly one strict click. Failure
receipt `leetcode-real-observation-failed-1786560268026.json` records
`OBSERVER_INVALID / observer_capture_error / epoch_result_surface_unchanged`,
final stage `e2_confirmed`, target `1/1/1/0`, extension `1/0/0/0`, and SQLite
`0/0/0`. The action was attempted and click-completed. E0/E1 convergence and
E2 confirmation therefore succeeded under the repaired chronology, but no E3,
POST, ACK, session, or attempt followed. Compile Error is still an accepted D4
verdict category; the missing fresh result-surface epoch is the actual terminal
condition.

The exact runner, Chromium children, and listener were stopped, port 3000 is
free, and normal Chrome was not touched. The first-failure rule prevented any
NowCoder action. Current verdict is **`REJECT` for D4 completion**: preserve the
generation3 evidence and require a new plan revision plus independent review
before any retry or further real submission. D5 remains stopped.

## Generation-4 LeetCode-first identity closeout (2026-08-13)

Generation4 is independently **`APPROVE`**, no HIGH/MEDIUM, for LeetCode
READY-only preparation. The runner accepts only
`d4-revision2-generation4`, rejects generation3 before opening historical
assets, and rejects generation4 NowCoder before any DB/profile/output/browser
creation. Four exactly-once expected SHA arguments bind helper, runner,
focused test and declarations before browser launch and before every receipt.
Tool drift produces a non-recursive bounded receipt with five frozen-dist
pre/final hashes or fixed `distIdentityRejected`.

RED/GREEN was `96/100` -> `100/100`, then independent-review follow-up
`100/103` -> `103/103`. Typecheck, targeted lint, syntax, privacy (`0
findings`), diff check and protected-path isolation pass. Current hashes:

```text
observer A023F3D18CAA1CD051C3B94E6EB2763AEAEDF2C82D8B1E6AF592B689858DAC2C
runner   32CA4C6CA9E50974A017A651FC9937B79D0D893AD40912E2F066E877BC2FC88C
test     9665A6103B1056B2D09CD4C2383BCFA08B18ED2924EB6D8C876F27AADA77B096
d.ts     3ED3065EF8BA2FA1C99DBED23AA05F9D9CFB9F11DE8BCBA02D0882D862200753
```

No live/browser/server/login/build/commit/push occurred during implementation.
Approval permits one new LeetCode generation4 READY-only lane; NowCoder remains
closed until LeetCode D4 PASS and a new amendment. D4 is incomplete, D5 stopped.

## Revision 3 recoverable diagnostic observer closeout (2026-08-13)

Static audit corrected the initial hypothesis. The closed
`epoch_result_surface_unchanged` diagnostic is persisted as
`lastCaptureError`, but it does not delete the exact submit epoch; a later
legal verdict or narrow-Element transition may still emit the request-bound
candidate until the five-minute epoch TTL. The generation3 receipt therefore
proves `OBSERVER_INVALID`, not `PRODUCT_FAIL` or `PLATFORM_BLOCKED`. The final
Compile Error screenshot is not submission-identity evidence.

Plan section 14.22 was independently reviewed and corrected before code. The
observer now accepts only exact E2 plus that single diagnostic as
`e2_surface_pending`, permits it through the production E3/outbox shape, and
requires it to be absent at exact ACK with SQLite `+4/+1/+1`. Every other
error, wrong order/identity, diagnostic disappearance or replacement,
duplicate durable side effect, queue/DB drift, V3 input, hostile accessor, and
privacy violation remains fail-closed. Exact repeated observation callbacks
remain idempotent.

An authorized pending lane starts a pure/injected `315000ms` surface deadline
at the first accepted E2-plus-diagnostic fact. Exact E3 changes this to one
`30000ms` delivery deadline; ACK cancels it. READY-only starts neither timer.
Timeout writes one fixed bounded `OBSERVER_INVALID` receipt, closes the
runner-owned context, makes late callbacks inert, and never restores the
already-consumed action authorization.

Evidence:

```text
first RED: 89 passed / 5 failed (94 total)
Commander follow-up RED: 93 passed / 3 failed (96 total)
GREEN observer: 96/96
frozen product anchors: 174/174
combined focused: 270/270
npm run typecheck: exit 0
targeted ESLint: exit 0
node --check (observer and runner): exit 0
privacy audit: PASS, 0 findings
git diff --check: exit 0 (line-ending warnings only)
protected product-path diff: empty
```

Current SHA-256:

```text
observer  613168151501618A0D3AB8B97581150504ACBC620D089EF0229967B45207C2DB
runner    60A304A4BAD9925C652361AE1C727E1FFAD9B0AF4EEBF02C677682703A4E3259
test      B3753D1E0111C25E358CC56CD6F44294FC98402258E8A9D15B77580223CB65C8
d.ts      5EFA489DBD9D38DEB1F59E67F99DE76541F047F609E865060608ADB8E9E6A0D5
```

Independent final code review is **`APPROVE`**, with no HIGH/MEDIUM. Runtime,
manifest, schema, build, adapter, frozen candidate and dist were not modified;
D3 is unchanged. This does not turn the historical failure into D4 PASS. No
live/server/browser/login/build/commit/push occurred. The next proposal is the
section 14.23 generation4 LeetCode-first isolated identity delta, currently
`REVIEW REQUIRED`; no new READY or action is authorized yet.

## Generation4 LeetCode READY-only closeout (2026-08-13)

The one approved LeetCode lane reached `READY` in
`output/playwright/v4-observation/leetcode-readiness-1786566437035.json`.
The safe receipt records generation `d4-revision2-generation4`, final stage
`browse_only`, target and queue counts `0/0/0/0`, SQLite `0/0/0`, profile
identity `cd9f7b7375829a54b577531dcb27704679b6066f3cdc686465fcc1b01689c256`,
and database identity
`8e3fefb38129aca9d12089953b1c0accea29131d80bb58b8d85765d183e6fa54`.
Pre/final observer-tool hashes match the independent APPROVE and all five
pre/final frozen dist hashes match Task 26. No authorized-action field, click,
submission, cookie read, credential copy, source-code read, or problem-text
read occurred. The context and server closed normally; port 3000 is free.

Verdict: **`READY` only**. This is not D4 PASS. One new action-time
authorization is required before the exact strict LeetCode click. NowCoder is
still rejected before asset creation; D5 remains stopped.

## Generation4 LeetCode single-action closeout (2026-08-13)

The exact READY lane consumed one strict click and produced
`output/playwright/v4-observation/leetcode-real-observation-failed-1786566841561.json`.
Classification is `OBSERVER_INVALID`; fixed reason/diagnosis is
`observer_stage_rejected / observer_transition_unadjudicable`. The action
evidence records `runner_strict_click`, attempted/completed true, exactly one
strict selector dispatch. Safe final evidence remained `browse_only`, target
`0/0/0/0`, confirmed/tombstones/outbox/quarantine `0/0/0/0`, and SQLite
`0/0/0`. No E3, POST, or ACK occurred. Four tool and five dist hashes and the
READY profile/database identities remained exact.

All owned processes are closed, database locks are zero, and port 3000 is
free. The first-failure rule forbids retry and NowCoder. The evidence is too
weak to classify a product or platform failure; the next step is read-only
callback/reducer adjudication followed, if justified, by a reviewed offline
RED. No runtime/dist change or D3 re-freeze is authorized.

## Deferred-replay evidence repair closeout (2026-08-13)

The observer-only repair preserves immutable safe accepted-prefix evidence,
the first rejected index, and a bounded transition projection; the runner no
longer substitutes the last deferred snapshot. Acceptance, authorization,
deadlines, duplicates, and ACK `+4/+1/+1` are unchanged. RED `103/104` became
GREEN `105/105`; product anchors `174/174`, typecheck/lint/syntax/privacy
(`0 findings`)/diff/isolation pass. Independent review: **`APPROVE`**, no
HIGH/MEDIUM. Final hashes are `F9FEA06A...93B63B`,
`4FDCC35F...DB16F3`, `983B8786...7EEB4`, and
`2ED9635F...68D29`. No live/build/product/dist/D3 operation occurred.

Generation4 remains terminal. A generation5 LeetCode-only single-profile
identity delta is `REVIEW REQUIRED`; no new browser/action or NowCoder work is
authorized by this closeout.

## Generation5 identity implementation closeout (2026-08-13)

The single-profile generation5 identity delta is independently **`APPROVE`**,
no HIGH/MEDIUM. RED `105/106` became GREEN `107/107`; anchors `174/174` and
type/lint/syntax/privacy (`0 findings`)/diff/isolation pass. Hashes:
`48B65E4E...E1D2C1`, `CE157469...8F515`,
`6F0D0B33...6AD4F`, `E218D2A7...07CB2`. Generation1-4 and NowCoder reject
before asset access. Only LeetCode generation5 READY-only is permitted next;
no action or D4 PASS is implied.

## Generation5 exact-E1 causal review (2026-08-13 historical checkpoint; current interpretation superseded by sections 14.33-14.34)

At this historical checkpoint the generation5 lane was classified terminal
**`PRODUCT_FAIL`**. Public first-party
LeetCode.cn frontend assets currently implement `submitV2` as an authenticated
`POST /problems/{slug}/submit/` followed by
`GET /submissions/detail/{submissionId}/v2/check/`; those path shapes exactly
match the frozen adapter and prove that the REST path remains present in the
public bundle. They do not prove which authenticated runtime branch the
generation5 session used and do not exclude account/experiment branching,
GraphQL, or another actual submit path. Public asset SHA256 values are
`7486C2C6...9417275`, `F298FEB1...C9C280`, and
`58DC074C...949795`. The inspection used no login, cookies, account state,
code, or problem text.

The displayed compile error still does not explain the missing E1: it is a
post-submit verdict, not E1 evidence or a substitute for request identity. The
generation5 fixed profile/database and exact tool/dist identity also exclude
the multiple-extension/multiple-database hypothesis for that lane.

The unresolved boundary is the actual authenticated protocol branch plus
Chrome `webRequest`: the frozen observer requires
a nonempty optional `documentId` and other safe request metadata before it
records E1, while the failure receipt cannot distinguish no listener callback
from a callback ignored for missing/invalid metadata. No product relaxation is
authorized. The next task is the offline-only listener/restart/documentId/
redirect/E0-deadline matrix in plan section 14.26, followed by independent
review. Another live submission, characterization extension, product edit,
D3 re-freeze, NowCoder, D5, RC, and release remain stopped.

Independent plan review: **`APPROVE`**, no HIGH/MEDIUM, for the offline-only
matrix. This is not approval for characterization, another live submission,
or a production repair.

## Exact-E1 offline matrix closeout (2026-08-13)

Independent review: **`APPROVE`**, no HIGH/MEDIUM. Four focused test files add
the exact REST lifecycle, missing/empty document identity, fresh-observer
restart, E0 deadline, five-listener, and source/dist manifest-parity matrix.
Worker focused result is `353/353`; independent changed-file result is
`184/184`. Typecheck, targeted lint, dist check, privacy (`0 findings`),
diff-check, and protected isolation pass. Production source, manifest, dist,
observer/runner, frozen candidate, and databases were not changed.

The matrix does not identify the generation5 authenticated runtime branch or
Chrome callback metadata. Plan section 14.27 therefore proposes a no-click,
same-profile, public-static-asset identity audit before considering any new
submission. That proposal is **`REVIEW REQUIRED`** and cannot satisfy D4.

Independent review rejected that asset-audit proposal: persistent-profile
session use/writes contradicted its no-touch claim, and static assets could not
adjudicate the runtime branch. It is superseded and will not run.

Plan section 14.28 instead proposes one extension-free, no-localhost/no-DB
strict diagnostic click in the existing logged profile. Program code may only
classify request method/resource type/URL in memory into bounded exact-REST,
GraphQL-path, other-owned-POST, unsafe, or none counters; it may not read or
export cookies, storage, account state, headers, bodies, DOM/editor content,
profile files, URLs, queries, IDs, verdicts, or timestamps. The proposal is
**`REVIEW REQUIRED`** and cannot satisfy E1/D4.

Independent review rejected the first §14.28 draft: prior click approval was
consumed, the window did not bound a hanging click, extension disabling was
not enforced, and normal traffic handling was underspecified. The revision
requires a new exact action-time authorization, one monotonic 15-second total
deadline, mandatory extension-disabled launch with extension-load arguments
rejected, and POST xhr/fetch filtering before closed URL categorization. It
remains **`REVIEW REQUIRED`**; no browser/click is authorized.

Final §14.28 plan review: **`APPROVE`**, no HIGH/MEDIUM, after making every
cross-origin candidate POST terminal-invalid and adding its required matrix.
This approves only offline tool RED/GREEN, not browser launch or click.

The final §14.28 tool code review is **`APPROVE`**, no HIGH/MEDIUM. Stable
hashes are `8D6196D6...ED85F9`, `FE4EC5FF...0CFC7C4`, and
`09CDB3B8...4E9295`; final RED `42/44` became GREEN `44/44`. Typecheck,
targeted lint, syntax, privacy (`0 findings`), diff-check, and protected
isolation pass. No browser/network/live ran. A new explicit action-time
authorization is still required before the one extension-disabled diagnostic
click; the result cannot satisfy D4.

## Protocol characterization post-adjudication (2026-08-13)

The preceding no-live statement is a historical tool-review checkpoint. One
later extension-disabled action consumed the characterization authorization
and wrote
`output/playwright/v4-protocol-characterization/protocol-characterization.json`
(SHA-256 `58DBB9CC062DC1B386EF60154ACF41B9320E6765D9B6229155323F1BCA6AD0BE`).
The receipt records one completed strict click, REST `0`, GraphQL-path `0`,
other-owned `many`, cross-origin `many`, unsafe `0`, and the required terminal
classification **`protocol_characterization_invalid`**. It has no submit
binding, ordering, request identity, URL/path, operation, or response facts;
therefore it cannot exclude REST or GraphQL and cannot satisfy E1 or D4.

The follow-up official-public-bundle audit used no login or private profile
state. Across 66 declared JavaScript assets it found eight literal POST sites
in five assets: two REST-submit call sites, three telemetry sites, and three
other sites (upload signature, code formatting, and run-code enqueue). The
public bundle also contains GraphQL clients. This proves only that multiple
public POST families coexist and that the exact REST submit/check builders
remain present; it does not identify the authenticated generation5 branch or
associate the receipt's `many` counters with the click.

This was the historical checkpoint adjudication for the evidence then
available; sections 14.33-14.34 supersede its current causal interpretation:

- public static audit: **`APPROVE`** as bounded, non-D4 evidence;
- protocol receipt: **`REJECT / OBSERVER_INVALID`**;
- historical generation5 checkpoint: **`PRODUCT_FAIL /
  exact_submit_e1_missing_before_e0_lifecycle_end`**;
- product patch, endpoint relaxation, D3 re-freeze, retry, NowCoder, and D5:
  **`REJECT`**.

The screenshot's compile error is a downstream verdict, not the cause of
missing E1. One fixed generation5 profile, one zero-row database, and one exact
frozen dist were used, so parallel stale databases/extensions are excluded for
this lane. No additional live action is warranted by the present evidence.

Independent final review returned **`APPROVE`** with no HIGH/MEDIUM findings.
Current-byte verification is protocol focused `52/52`, seven-file exact-E1
and product anchors `330/330`, typecheck PASS, privacy audit `0 findings`,
diff-check PASS, and protected product/candidate diff empty. No full build,
full quality gate, server, migration, browser, or further live action ran.
## Submit-bound E1 causal probe closeout (2026-08-14)

The new candidate-external diagnostic reached RED/GREEN only as a
contract-level pure/injectable reducer. RED was the expected import failure
before `scripts/v4-e1-causal-diagnostic.mjs` existed; GREEN is `22/22` focused
tests. Typecheck, targeted ESLint, syntax, privacy (`0 findings`), diff check,
and protected production/candidate isolation pass. A fixed CLI invocation
without an injected live boundary exits `1` and writes no receipt.

Tool/test/declaration SHA-256 identities are respectively
`261568AED227E90FD9BE341B63C16C53C29E7ECDF785F03E5EC9964A7435E2E1`,
`FFF578EB8959FF94C406B381DE44A32A803AAA79FD151435B1D8DC6B5819CB5F`,
and `A72E000065D33EC3E9515D9993FB09184307CE66B7B750221FF0DFA55D91B039`.

The executable same-filter MV3 probe, production-worker CDP read-only
`transientE1` projector, bidirectional one-to-one HMAC binding, and zero-click
preflight do not exist. Consequently this tool cannot adjudicate real browser
callback delivery or production E1 persistence. Verdict: **`REJECT`** for
live use; no action-time authorization may be requested. No browser, server,
network, database, click, submission, build, commit, or push ran in this work.

Independent final review confirmed **`REJECT`** with 4 HIGH and 1 MEDIUM:
the executable same-filter/production-worker/preflight boundary is absent;
the implemented SHA-based opaque identity is not the specified ephemeral
domain-separated HMAC join and the page plane unrealistically receives a
Chrome-only request id; arbitrary injected working-tree functions plus a
shadow endpoint classifier cannot prove frozen production execution; and the
reducer can return A/B/E1 classifications without stable worker/listener
facts. Receipt privacy and product-path isolation pass, but they do not repair
the missing causal evidence. No live diagnostic is warranted.

## Evidence-epoch contract revision (2026-08-14)

Plan §14.31 replaces two absolute, currently unobservable preflight properties
with epoch-scoped properties that match the causal diagnostic objective.
`FULL_LAUNCH_NO_WORKER_REPLACEMENT_PROVEN` becomes
`EPOCH_WORKER_CONTINUITY_PROVEN`; all history before worker witnesses and the
safe baseline is labelled `PRE_EPOCH_UNOBSERVED` and cannot enter evidence.
`ZERO_PRODUCTION_TRANSIENT_STORAGE_WRITES_PROVEN` is split into the hard
source/capability property `DIAGNOSTIC_NON_MUTATING` and the observed epoch
property `RELEVANT_STATE_DRIFT_FAIL_CLOSED`.

Arm occurs only after exact dist/worker/listener/filter/projection identity,
fresh HMAC creation, relevant baseline, installed lifecycle monitoring, and
structural absence of action capability. The baseline's opaque E1 tokens are
exclusions, never positive evidence. All action evidence must be post-arm,
post-dispatch, absent from baseline, bound to the exact arm workers, and close
both domain-separated one-to-one HMAC joins. Worker change or unexplained
relevant state drift during the epoch is terminal invalid.

Threat-model result before independent review: a pre-attach worker cannot
produce a later affirmative conclusion without crossing the fresh key,
baseline exclusion, exact joins, and epoch worker identity. An unobservable
production `X -> Y -> X` transition with no retained relevant or action-bound
effect cannot change a classification; if it leaves a relevant effect, the
drift or join gates observe it or fail closed. The revised properties do not
weaken D4 delivery, identity, privacy, exactly-once, database, POST, ACK, or
queue gates.

Current status is **`REVIEW REQUIRED / LIVE NOT AUTHORIZED`**. This update is
documentation and threat-model work only: no probe implementation, Chromium,
zero-click preflight, platform access, login, click, submission, NowCoder, D5,
or D3 re-freeze occurred.

Independent threat-model review returned **`REJECT`**, with **2 HIGH / 0
MEDIUM**. It agreed that full-launch no-replacement and absolute zero production
writes are not necessary safety properties, but found two concrete defects in
the replacement contract:

- a pre-arm request can receive lifecycle callbacks after dispatch and be
  confused with a same-tuple action request unless every candidate is rooted
  in a directly observed post-arm, post-dispatch companion `onBeforeRequest`;
- arm/close equality can hide an action E1 that was persisted and then consumed
  by E3 or pruned by TTL, or a persistence callback that lands after the final
  projection. It therefore cannot prove a negative E1 conclusion.

The next contract revision must require post-dispatch request roots, forbid
later lifecycle callbacks from independently creating candidates, and keep all
no-E1 outcomes unresolved without an approved direct production transition
witness plus a defined input-stop/queue-quiescence/final-projection barrier.
Privacy and the D4 product hard gates remain unchanged. No zero-click preflight
or action is authorized, and `TASK26_LIVE_PROTOCOL_ASSUMPTION_UNPROVEN`
remains authoritative.

## Rooted-request / positive-ledger contract revision (2026-08-14)

Plan §14.32 addresses the two §14.31 HIGH findings without reintroducing an
absolute negative proof. The action contract now has a monotonic epoch and
dispatch state machine. Only a companion `onBeforeRequest` directly observed
after arm and dispatch can create a root; redirect/response/completion/error
events may extend only their exact request-id lineage. Pre-arm/pre-dispatch
roots remain bounded stale lineages so late completion cannot be repaired into
an action candidate. Tuple HMAC is explicitly only a candidate key; exact
one-to-one cardinality and lineage are mandatory.

Production E1 becomes an external monotonic positive ledger. A directly
sampled action-bound E1 remains witnessed after E3 consumption or TTL prune.
Polling misses and arm/close equality yield `E1_NOT_OBSERVED`, never absence.
The classification set is reduced to `E1_ACCEPTED`, unique-root frozen-guard
incompatibility, protocol unresolved, and diagnostic invalid. Prior no-request
and ingress-absent names are removed.

Quiescence is limited to known root lifecycles and diagnostic-owned queues;
production internal quiescence is `UNKNOWN` without an existing safe product
barrier. The normative R0/R1 and X->Y->X traces are recorded in §14.32. This
documentation-only revision preserves every D4 product gate and awaits a new
independent threat-model review. No implementation, test, browser, preflight,
platform, network, click, or submission ran.

Independent §14.32 review returned **`REJECT`**, with **1 HIGH / 0 MEDIUM**.
It confirms R0/R1 late lifecycle contamination and X->Y->X negative inference
are closed. The remaining attack is positive misattribution in the non-atomic
gate-to-click interval: one same-tuple background request can be the only legal
post-dispatch page/root fact and direct production E1, satisfying both joins
and cardinality even when the click did not produce submit. The contract would
then overstate `E1_ACCEPTED` or metadata incompatibility.

The contract must either add a non-temporal direct click-to-request witness or
keep all such window-correlated facts auxiliary and terminally unresolved.
Until then, offline implementation delta, zero-click preflight, and real action
are rejected. The reviewer judges a future action under the current contract
not worth consuming because its strongest positive result is still not safely
click-attributable.

## Section 14.33 browser-native causal witness audit (2026-08-14)

The official CDP/Chromium static audit found no privacy-safe, non-temporal,
browser-native identity that joins the exact controlled CDP click invocation
to the exact DOM `click` dispatch and then to one Network request. Chromium has
three useful but disconnected substrates: an internal input latency trace id,
an `EventDispatch` duration, and a `ResourceSendRequest` instant event. CDP
does not return the input trace id; EventDispatch does not expose that id or a
request-child id; ResourceSendRequest does not expose an EventDispatch parent.
Timeline nesting is same-thread interval containment, not a request-carried
causal edge.

`hasUserGesture` is only transient-user-activation corroboration.
Initiator/async stacks are code or async lineage, not one click invocation.
Debugger/DOM breakpoints pause and perturb execution. Passive page listeners,
fetch/XHR wrappers, and request token/header/query injection mutate the page or
request. Tracing additionally exposes raw URL/request/stack material and has no
field-level mode that returns only the desired causal relation.

The 14-candidate matrix in plan section 14.33 contains no `DIRECT_FEASIBLE`
entry. The strongest candidate, synchronous same-thread EventDispatch /
ResourceSendRequest containment, remains auxiliary because the exact input and
target joins are absent. Promise/await/timer/animation-frame/worker paths are
unresolved without an invocation-specific async identity.

The external causal route is therefore closed as
`WINDOW_CORRELATED_FACTS_AUXILIARY_ONLY`. Such facts cannot produce
`E1_ACCEPTED` or submit root-cause classifications; their strongest safe result
is `SUBMIT_BOUND_PROTOCOL_UNRESOLVED`. The candidate is retained as an immutable
D3 engineering candidate but D4 is classified
`D4_CAUSAL_DIAGNOSTIC_UNADJUDICABLE`; D4 remains incomplete, D5 remains stopped,
and `TASK26_LIVE_PROTOCOL_ASSUMPTION_UNPROVEN` remains authoritative.

Existing uncommitted diagnostic/protocol scripts and tests are explicitly
`HISTORICAL_NON_AUTHORITATIVE_DO_NOT_EXECUTE`. Their remaining
`E1_ACCEPTED`, `ACTION_WITH_NO_SUBMIT_BOUND_REQUEST`, or metadata-root-cause
labels are superseded by section 14.33 and cannot mint evidence, support a
preflight, or justify an action. They were not modified or run in this round.

No code/test/product/dist change, test command, Chromium/CDP run, preflight,
platform/network access, click, submission, re-freeze, or D5 work occurred.
At the contract-author checkpoint, independent section 14.33 review was still
pending; the final result is recorded below.

The new independent reviewer subsequently returned
**`NO_SAFE_DIRECT_WITNESS`** after answering all fifteen required questions.
It reported no HIGH and one MEDIUM status-drift finding concerning the obsolete
positive labels still present in the historical working-tree scripts. The
explicit historical/non-authoritative/do-not-execute rule above addresses that
finding without violating this round's no-code/no-test boundary. The reviewer
then confirmed the MEDIUM closed. Final findings are **HIGH: none; MEDIUM:
none**. Final verdict: **`NO_SAFE_DIRECT_WITNESS`**.

## Section 14.34 Route A closeout (2026-08-14)

Route A is selected. Static audit confirms an empty protected-product diff
from `aa1a572c3913b35dd3f0391f849dab66e79c56a2` and unchanged Task26 dist
hashes. D1-D2 remain complete; D3 remains an immutable engineering candidate,
not an RC/accepted/released build. D4 is incomplete and currently
`D4_CAUSAL_DIAGNOSTIC_UNADJUDICABLE`, not PASS and not a currently proven
deterministic product failure. D5 remains stopped and unstarted.

The external diagnostic route is closed: section 14.33 independent review
returned `NO_SAFE_DIRECT_WITNESS`, HIGH none and MEDIUM none. Window-correlated
facts are `AUXILIARY_ONLY`, and their strongest safe causal outcome is
`SUBMIT_BOUND_PROTOCOL_UNRESOLVED`. No further live retry is authorized. Every
earlier READY/action/authorization/next-live-action statement in this report is
a superseded historical checkpoint and grants no current authority.

The generation5 JSON is retained unchanged as historical factual evidence of
one strict click, E0 `1 -> 0`, no accepted E1/E2/E3/delivery, and database
`0/0/0`; its `PRODUCT_FAIL` label is the superseded checkpoint
interpretation. Sections 14.33-14.34 govern the current interpretation:
`NO_SAFE_DIRECT_WITNESS`, `WINDOW_CORRELATED_FACTS_AUXILIARY_ONLY`, and
`TASK26_LIVE_PROTOCOL_ASSUMPTION_UNPROVEN`.

Recommended disposition, not executed: KEEP `AGENTS.md`, the current
plan/report/handoff, and historical JSON; RESTORE the tracked live-observer deltas only in a later
authorized cleanup; DELETE-UNTRACK the superseded untracked causal/protocol
experiments only in that cleanup; keep the four offline regression-test deltas
and NowCoder/Task23 documentation SEPARATE-UNRELATED; keep ignored private
profiles/databases/receipts local and untouched. The still-executable
`extension:observe` package command is forbidden for current D4 use; any
mechanical tombstone is a separate reviewed change.

No cleanup, restore, deletion, test, typecheck, lint, build, migration, E2E,
browser, CDP, preflight, platform/network access, click, submission, commit,
push, or PR occurred. Independent review first found and then closed one HIGH
stale-live-next conflict in `AGENTS.md`. Its final twelve-item re-review found
HIGH none and MEDIUM none. Final verdict: **`ROUTE_A_CLOSEOUT_APPROVE`** for
this documentation closeout only; no cleanup, commit, live work, or Route B is
authorized.
