# Capture Protocol V4 Phase B NowCoder Network Pilot Plan

> **Parent plan:**
> [V4 network-confirmed capture master](./2026-07-24-v4-network-confirmed-capture-refactor-master.md)
>
> **Required predecessor:**
> [Phase A evidence core and real extension E2E](./2026-07-24-v4-network-confirmed-capture-refactor-phase-a-evidence-core-extension-e2e.md)

**Status:** Proposed and externally gated. Do not execute real characterization
without a fresh, explicit user authorization for the exact NowCoder actions.

**Goal:** Characterize NowCoder's current submission protocol safely, implement
one evidence-backed experimental V4 adapter, prove the reported browse-only
negative flow, and observe the complete same-build capture chain.

**Maximum phase claim:** `NowCoder V4 experimental pilot observed`. This phase
cannot promote NowCoder to production because authenticated characterization is
non-certifying under the repository's existing evidence rules.

## Global Constraints

- The user performs every real submission. An agent may prepare diagnostics and
  inspect sanitized summaries only after authorization.
- Do not read or retain source code, request/response bodies, cookies, tokens,
  CSRF values, passwords, complete headers, account identity, or full problem
  statements.
- Do not guess endpoint, method, response fields, redirect, or business-success
  semantics before characterization.
- Do not enable requestBody unless the characterization proves a required safe
  scalar cannot be obtained from URL/page context/response/navigation.
- MAIN response summary is low trust and cannot create E2 without one unique E1.
- Every retained fixture records provenance, date, tier, sanitization, expected
  evidence, and whether it may satisfy a production gate.
- A missing or conflicting signal produces `BLOCKED`/`AMBIGUOUS`, not a relaxed
  matcher.
- Do not commit, push, or create a PR without explicit authorization.

## Required Real-World Outcomes

The phase must distinguish these outcomes:

| Flow | Required result |
|---|---|
| localhost resources -> NowCoder -> list -> problem, no submit | waiting remains 0 |
| exact UI hint without request | waiting remains 0 |
| exact request canceled or failed | waiting remains 0 |
| HTTP success but business rejection | waiting remains 0 |
| server confirmation with stable submission ID | waiting increases by 1 |
| matching final verdict | waiting returns to 0; one bundle finalizes |
| other/historical submission verdict | confirmed state unchanged |

---

### Task B0: Define the authorization and data-retention contract

**Objective:** Establish a written checkpoint describing exactly what the user
will do and exactly what the diagnostic tooling may retain.

**Files:**

- Create: `scripts/validate-v4-characterization-authorization.mjs`
- Create: `tests/unit/v4CharacterizationAuthorizationValidator.test.ts`
- Create when executing: `work/reports/v4-nowcoder-characterization-authorization.md`
- Modify: this plan with the authorization state only after user confirmation
- Modify: `COMPLIANCE.md` only if the final diagnostic boundary differs from
  current documented behavior

**Dependencies:** Phase A complete and independently reviewed.

**Write failing checks first:** Add a validator that fails when a characterization
report lacks date, scope, user-action ownership, forbidden-data declaration,
retention list, and stop conditions.

**Implementation boundary:**

- Identify the exact NowCoder hostname/page type and a low-risk problem chosen
  by the user.
- State that the user will type and submit code; the extension records no code.
- Authorize only the minimum number of submissions needed to observe one server
  confirmation and one final result.
- Negative browse-only observation requires no submission.
- Stop immediately if the diagnostic surface displays or persists forbidden
  data, or if the user withdraws authorization.

**Verification:**

```powershell
npx vitest run tests/unit/v4CharacterizationAuthorizationValidator.test.ts
node scripts/validate-v4-characterization-authorization.mjs work/reports/v4-nowcoder-characterization-authorization.md
```

**Completion standard:** Validator passes and the user explicitly approves the
scope in the conversation. A template or assumed approval does not pass.

**Explicit non-goals:** No browser action or fixture acquisition yet.

---

### Task B1: Define and test the safe Network Transcript schema

**Objective:** Make it impossible for the characterization output to retain raw
network or user content.

**Files:**

- Create: `tests/helpers/networkTranscriptContract.ts`
- Create: `scripts/validate-v4-network-transcript.mjs`
- Create: `tests/unit/v4NetworkTranscriptValidator.test.ts`
- Create: `tests/fixtures/nowcoder/network/README.md`

**Dependencies:** Task B0 contract drafted; no real data required.

**Write failing tests first:**

- Accept a synthetic transcript containing only platform, method, normalized
  path, resource type, status, normalized redirect path, top-level response
  field names, submission/status field name and scalar type, tab/frame/document
  relationship, timing relationship, and expected tier.
- Reject body, raw, response text, headers, cookie, authorization, token, csrf
  value, source code, username, account ID, email, full statement, and unknown
  fields.
- Reject credentials/query values not on an explicit scalar allowlist.
- Reject fixtures missing acquisition date, source, authentication status,
  sanitization flag, evidence tier, or production-gate eligibility.
- Reject a claim that authenticated characterization certifies production.

**Implementation boundary:**

- Use strict schemas and temporary repositories in validator tests.
- Field names may be retained; field values are retained only for explicitly
  approved stable IDs/status enums and only after type/length validation.
- Normalized paths strip user-specific and secret query values.

**Verification:**

```powershell
npx vitest run tests/unit/v4NetworkTranscriptValidator.test.ts
```

**Completion standard:** Valid synthetic fixture passes and every forbidden-data
probe fails for the intended reason.

**Explicit non-goals:** No live traffic and no NowCoder assumptions.

---

### Task B2: Build a characterization-only diagnostic mode

**Objective:** Observe protocol structure in memory and emit only schema-valid
safe transcript records.

**Files:**

- Create: `extension/src/characterization.ts`
- Create: `extension/src/characterizationStorage.ts`
- Create: `tests/unit/extensionCharacterization.test.ts`
- Modify: `extension/src/networkObserver.ts`
- Modify: `extension/src/mainWorldBridge.ts` only if response-summary inspection
  is required
- Modify: `extension/src/backgroundOrchestrator.ts`
- Modify: `extension/src/popup.ts` / `popup.html` for explicit opt-in and export
  if the reviewed design chooses a popup control

**Dependencies:** Task B1 green. Fresh user authorization still required before
real use.

**Write failing tests first:**

- Characterization is disabled by default and after extension reload.
- It is scoped to one platform and an explicit short expiry.
- Safe request lifecycle metadata is retained; body/header objects are not.
- A bounded response summary returns only top-level field names and approved
  scalar name/type pairs.
- Oversized, non-JSON, nested, malformed, or forbidden-key responses produce a
  safe rejection record with no raw excerpt.
- Export succeeds only through the strict transcript schema.
- Stopping characterization clears transient diagnostic state.

**Implementation boundary:**

- Keep characterization state in `chrome.storage.session`.
- Never print raw objects to console, including in exceptions.
- Use a short hard size cap before attempting a response summary; if the safe
  cap cannot be enforced, do not inspect the response and rely on redirect/
  navigation evidence.
- Do not enable generic requestBody.
- Diagnostic output is not consumed by the production state machine.

**Verification:**

```powershell
npx vitest run --config vitest.extension.config.ts tests/unit/extensionCharacterization.test.ts tests/unit/extensionMainWorldBridge.test.ts tests/unit/extensionNetworkObserver.test.ts
npm run extension:check
```

**Completion standard:** Independent privacy review confirms only transcript
schema values can leave the diagnostic function.

**Explicit non-goals:** Diagnostic mode cannot create E2, bundles, attempts, or
adapter readiness.

---

### Task B3: Acquire the browse-only negative transcript

**Objective:** Reproduce the user's navigation flow without submitting and prove
that no request-confirmed waiting state appears.

**Files:**

- Create after real observation: a dated safe fixture under
  `tests/fixtures/nowcoder/network/`
- Create: a dated report under `work/reports/`
- Modify: fixture README/index

**Dependencies:** Tasks B0-B2; exact build SHA recorded; user authorizes browser
observation but no submission is required.

**Write failing test first:** Add a fixture-driven test expecting zero E1/E2 for
the retained safe transcript before storing the real transcript.

**Implementation boundary:**

- Observe only `localhost resources -> NowCoder -> list -> one problem`.
- Do not click a submit control or trigger page-script submission.
- Record only safe navigation/request structure permitted by Task B1.
- Record popup counts before and after.
- If the old false-positive cannot be reproduced after Phase 0, report that
  honestly; do not fabricate the prior trigger.

**Verification:**

```powershell
node scripts/validate-v4-network-transcript.mjs tests/fixtures/nowcoder/network/<negative-fixture>.meta.json
npx vitest run --config vitest.extension.config.ts tests/unit/extensionNowCoderNetworkFixtures.test.ts
```

**Completion standard:** The safe fixture validates and the exact build keeps
waiting at zero throughout the no-submit flow.

**Explicit non-goals:** This negative observation does not reveal the submit
protocol.

---

### Task B4: Acquire one real server-confirmation chain

**Objective:** Let the user perform a fresh natural submission and retain the
minimum safe facts needed to design the adapter.

**Files:**

- Create after real observation: dated safe request/confirmation/navigation/
  verdict fixtures under `tests/fixtures/nowcoder/network/`
- Modify: fixture README/index
- Modify: dated characterization report

**Dependencies:** Task B3 and explicit user authorization for the fresh
submission.

**Write failing test first:** Define fixture expectations for an unknown protocol
as `BLOCKED` placeholders; do not write endpoint/field guesses.

**User action:** The user opens the authorized problem, enters their own code,
and triggers the natural NowCoder submission. The agent does not type, modify,
or submit code.

**Implementation boundary:** Retain only:

- platform;
- method;
- normalized URL path;
- resource type;
- status code;
- normalized redirect path;
- response top-level field names;
- submission ID field name and scalar type;
- verdict/status field name and scalar type;
- tab ID, frame ID, document ID;
- relative timing/order;
- whether each signal was observed from real user action.

If submission ID is not available without forbidden data, record that result and
stop. Do not broaden collection.

**Verification:**

```powershell
node scripts/validate-v4-network-transcript.mjs tests/fixtures/nowcoder/network/<submission-fixture>.meta.json
npx vitest run tests/unit/v4NetworkTranscriptValidator.test.ts
```

**Completion standard:** At least one schema-valid real chain identifies an
evidence-backed E1 and a stable server confirmation path, or the task ends
truthfully as `BLOCKED` with the missing signal named.

**Explicit non-goals:** Do not force login failures, rate limits, repeated
submissions, or unsafe rejected submissions merely to fill a matrix. Fake OJ
covers those branches.

---

### Task B5: Specify the NowCoder adapter policy from the transcript

**Objective:** Convert the characterized facts into a reviewed, deterministic
adapter contract before writing production logic.

**Files:**

- Modify: this plan with the actual characterized protocol facts
- Create: `docs/superpowers/specs/2026-07-24-v4-nowcoder-network-adapter-design.md`
- Modify: `extension/src/adapters/registry.ts` only after design review

**Dependencies:** Task B4 PASS; cannot proceed from a BLOCKED transcript.

**Write failing design checks first:** The design validator must reject missing
request matcher, business-success predicate, stable ID extractor, correlator
window, final-verdict identity rule, sanitization list, or fail-closed cases.

**Implementation boundary:** The design must state:

- exact host/path/method/resource type;
- whether request body is needed and why;
- E1 lifecycle acceptance/rejection;
- exact E2 signal combination;
- stable submission ID format;
- redirect/navigation/response-summary trust;
- E3 identity/verdict rule;
- timeout and ambiguity behavior;
- retained safe fields;
- every known unknown.

**Verification:** Independent architecture/privacy review against the real safe
fixture.

**Completion standard:** Review approves the policy with no guessed field or
fallback-to-nearest-request behavior.

**Explicit non-goals:** No implementation or status promotion.

---

### Task B6: Implement the NowCoder network adapter with TDD

**Objective:** Produce E1/E2/E3 evidence from only the reviewed NowCoder policy.

**Files:**

- Create/modify: `extension/src/adapters/nowcoder/network.ts`
- Modify: `extension/src/adapters/nowcoder/page.ts`
- Modify: `extension/src/adapters/nowcoder/verdict.ts`
- Modify: `extension/src/adapters/registry.ts`
- Create: `tests/unit/extensionNowCoderNetwork.test.ts`
- Create: `tests/unit/extensionNowCoderNetworkFixtures.test.ts`
- Modify: relevant domestic OJ tests

**Dependencies:** Task B5 approved.

**Write failing tests first:**

- Exact characterized request produces safe E1.
- Wrong host/path/method/resource type produces no E1.
- UI hint without request remains zero waiting.
- Canceled/error/4xx request never confirms.
- Characterized business rejection never confirms even if HTTP is 200.
- Characterized acceptance creates E2 with exact stable ID.
- Duplicate E2 is idempotent.
- Exact final verdict for the same ID creates E3.
- Historical/other-ID result cannot consume the confirmed submission.
- Multiple concurrent candidates remain AMBIGUOUS unless the characterized
  strong signal disambiguates them.
- Forged bridge summary without unique E1 fails.

**Implementation boundary:**

- Adapter returns Safe Evidence only.
- Use requestBody only if Task B5 explicitly approved one bounded scalar
  extraction; ignore code fields.
- Keep NowCoder V4 readiness `experimental`.
- Do not change other platform network modules.

**Verification:**

```powershell
npx vitest run --config vitest.extension.config.ts tests/unit/extensionNowCoderNetwork.test.ts tests/unit/extensionNowCoderNetworkFixtures.test.ts tests/unit/extensionSubmissionCorrelator.test.ts tests/unit/extensionCaptureStateMachine.test.ts
npm run extension:check
```

**Completion standard:** All characterized positive/negative cases and synthetic
failure/concurrency/forgery cases pass.

**Explicit non-goals:** No LeetCode/AtCoder/Codeforces/Luogu network changes.

---

### Task B7: Extend Fake OJ and real extension E2E for NowCoder

**Objective:** Prove the production NowCoder adapter in the exact unpacked
extension without external OJ traffic.

**Files:**

- Modify: `tests/extension-e2e/fakeOj.ts`
- Create: `tests/extension-e2e/capture-v4-nowcoder.spec.ts`
- Modify: safe synthetic fixture metadata

**Dependencies:** Task B6.

**Write failing E2E scenarios first:**

- list -> problem no submit: waiting 0;
- click hint only: waiting 0;
- characterized request + business failure: waiting 0;
- characterized confirmation: waiting 1;
- judging then matching final: waiting/outbox transition correctly;
- mismatched submission final: waiting remains 1;
- concurrent ambiguity: waiting 0;
- worker restart after E1 and after E2;
- final bundle ACK produces exactly one SQLite attempt/four events.

**Implementation boundary:** Fulfill only URLs represented by safe fixtures;
deny all real NowCoder network access in automated tests.

**Verification:**

```powershell
npm run extension:e2e -- tests/extension-e2e/capture-v4-nowcoder.spec.ts
```

**Completion standard:** The exact production dist passes every NowCoder Fake OJ
scenario and leaves temporary profile/database clean.

**Explicit non-goals:** Automated tests are not real observation.

---

### Task B8: Perform same-build real observation and close the pilot

**Objective:** Verify that the adapter behaves correctly in the user-authorized
real NowCoder flow without changing the implementation SHA between build and
observation.

**Files:**

- Create: dated real-observation report under `work/reports/`
- Modify: this plan with actual evidence
- Modify: current-state docs with the honest experimental result

**Dependencies:** Task B7 green; explicit user authorization; exact build SHA
recorded.

**Real observations:**

- Repeat browse-only list -> problem flow and verify waiting stays zero.
- User performs one fresh natural submission.
- Verify E1 does not increase waiting.
- Verify E2 increases waiting exactly once.
- Verify matching final E3 clears waiting and creates/delivers exactly one
  bundle.
- Verify popup outbox/quarantine/error state and local Training result.
- Record unmatched/ambiguous/false-positive/false-negative outcomes honestly.

**Implementation boundary:** Any blocking runtime fix invalidates the observation
SHA and requires rebuilt/repeated observation. Do not edit reports to simulate a
same-SHA run.

**Verification:**

```powershell
npm run lint
npm run typecheck
npm run extension:check
npm run e2e
npm run extension:e2e
npm run build
npm run quality:gate
$env:GIT_MASTER='1'; git diff --check
```

**Completion standard:**

- Browse-only waiting remains zero.
- Real server confirmation, not click, creates waiting.
- Exact final verdict consumes the same stable submission.
- Full automated gates pass on the observed implementation.
- Independent review has no blocker or important finding.
- Result is documented as `experimental pilot`, not production, RC, accepted,
  or released.

**Explicit non-goals:** No production promotion, other-platform migration,
replacement RC, V0 acceptance, or V0.5.

## Phase B Failure and Rollback

- If characterization cannot find a safe stable confirmation signal, mark
  NowCoder V4 `BLOCKED` and leave it fail-closed.
- If adapter behavior regresses, disable the NowCoder V4 adapter while
  preserving confirmed/outbox/quarantine data.
- Never restore click-created waiting.
- Delete diagnostic session state after export; retain only validated safe
  fixtures and reports.
- Do not remove a real attempt merely because characterization later changes;
  use the existing correction/voiding API only for proven erroneous records.

## Phase B Completion Gate

Phase B completes with either:

- `PASS`: a safe transcript, reviewed adapter, Fake OJ E2E, same-build real
  browse/submission observation, and full quality gate all pass; or
- `BLOCKED`: the exact missing safe E2/E3 signal is documented and NowCoder
  remains disabled for V4 capture.

Only after that terminal result may Phase C begin with a separate LeetCode delta
plan.
