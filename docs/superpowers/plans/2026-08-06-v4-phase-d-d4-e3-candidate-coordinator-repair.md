# V4 Phase D D4 E3 Candidate/E2 Coordinator Repair Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` or `superpowers:executing-plans` to execute this plan task-by-task. Do not parallelize Tasks 2–7 because they modify shared data contracts and must remain sequentially reviewable.

**Status:** `EXECUTION AUTHORIZED — Tasks 0-10 COMPLETE; Task 11 observation FAILED; Task 12 causal RED and frozen repair contract APPROVED; Tasks 13-16 may execute sequentially`

**Date:** 2026-08-06

**Repository:** `qiuyuyandong/AI-Coding-Training-Platform`

**Base branch:** `feature/v1-followup`

**Base HEAD:** `1239f77b06fb56132437e5dd543265082408f132`

**Superseded implementation:** `051e6366735738d70031cb3b62518825c81fc06b`

**Suggested plan file:**

```text
docs/superpowers/plans/2026-08-06-v4-phase-d-d4-e3-candidate-coordinator-repair.md
```

## Goal

Replace the current LeetCode verdict-candidate polling/storage-key wake-up patch with an exact, restart-safe Candidate/E2 coordinator that:

1. preserves the real observation time of network and DOM evidence;
2. binds a verdict candidate to the exact latest submit lifecycle in the same tab, frame and document;
3. survives MV3 service-worker restart through bounded session storage;
4. produces exactly one E3 and one bundle after a matching E2 becomes available;
5. remains fail-closed on ambiguity, chronology errors, malformed evidence and stale candidates;
6. removes all retry timers and the `confirmedSubmissions` storage-change revival path.

## Architecture

Add a bounded `TransientVerdictCandidate` slice to existing transient session evidence. Candidate registration and E2 confirmation remain serialized through the existing background orchestrator, which continues to be the only mutation entry for capture state.

A pure coordinator joins candidates to the exact latest LeetCode submit lifecycle using platform, problem, tab, frame, document, submit ordering and `stableSubmissionId`. The orchestrator emits a resolution effect only when there is exactly one legal match. The background converts that resolution into adapter-owned E3 evidence and sends it back through the orchestrator for finalization.

No polling, timeout retry chain or broad storage-key listener participates in pairing.

## Tech Stack

* TypeScript 5.8
* Chrome Manifest V3 service worker
* `chrome.storage.session`
* Existing serialized executor
* Existing background orchestrator
* Vitest extension test lane
* Existing Safe Evidence and capture state machine
* Existing extension privacy audit

---

## Global Constraints

* Preserve the state-machine chronology invariant: never weaken or remove the rule that E3 must not precede E2.
* Do not “fix” chronology by assigning E3 the current time or using `max(candidate.observedAt, e2.confirmedAt)`.
* Correct the source timestamp semantics instead.
* Do not reintroduce click-derived pending submission intent.
* Do not inspect request or response bodies, GraphQL payloads, source code, headers, cookies, tokens or account identity.
* Do not change server APIs, SQLite schema, bundle schema or capture protocol.
* Do not modify NowCoder or other platform behavior.
* Do not add manifest permissions.
* A new session-only storage key is permitted only for bounded sanitized verdict candidates.
* Do not add a new local-storage key or migration.
* Keep all candidate state bounded by count and TTL.
* Do not amend, squash or rewrite `051e636` or `1239f77`; preserve them as historical evidence.
* Do not perform the ninth real observation until all automated and review gates in this plan pass.
* This work is D4 engineering repair, not RC, acceptance or release.

---

# 1. Confirmed Failure Model

The implementation must treat the following as established engineering defects.

## 1.1 Incorrect E2 timestamp semantics

The current LeetCode confirmation functions create E2 with the time at which the serialized executor eventually processes the confirmation:

```ts
receivedAt: input.now
```

This is processing time, not the observation time of the network evidence.

The correct E2 time is:

```ts
checkEvidence.receivedAt
```

for the check path, or:

```ts
resultEvidence.receivedAt
```

for the result-distribution path.

Executor backlog must never alter evidence chronology.

## 1.2 Adapter success is incorrectly treated as finalization success

The current candidate branch stops retrying as soon as the adapter returns an E3 object. It does not verify that the orchestrator generated a bundle or consumed the confirmed record.

The redesigned flow must let the orchestrator own candidate removal. A candidate may only be removed after:

* a bundle was generated; or
* an existing non-expired tombstone proves the submission was already finalized; or
* a specifically diagnosed terminal failure occurs.

## 1.3 Global singleton pending state is invalid

The following shape must be removed:

```ts
let pendingVerdictCandidateRecheck:
  (() => Promise<void>) | undefined;
```

The extension must support multiple independent candidates across tabs and documents.

## 1.4 Storage-key changes are not exact E2 signals

The following broad trigger must be removed:

```ts
Object.hasOwn(changes, "confirmedSubmissions")
```

Any update to the full array may be unrelated to the candidate. E2 confirmation must be propagated from the exact `e2_recorded` event that owns:

```ts
confirmation.evidence
confirmation.matchedSubmitRequestId
```

## 1.5 Problem-only matching is insufficient

Candidate lookup must not use only:

```text
platform + problemExternalId + unfinalized
```

It must identify the latest eligible submit lifecycle in the same:

```text
platform
tabId
frameId
documentId
problemExternalId
```

The candidate must wait when that latest submit is still pending, even if an older same-problem confirmed record exists.

---

# 2. Target File Map

## Create

```text
extension/src/verdictCandidateCoordinator.ts
tests/unit/extensionVerdictCandidateCoordinator.test.ts
tests/unit/extensionVerdictCandidateFlow.test.ts
docs/superpowers/plans/2026-08-06-v4-phase-d-d4-e3-candidate-coordinator-repair.md
```

## Modify

```text
extension/src/adapters/leetcode/network.ts
extension/src/background.ts
extension/src/backgroundOrchestrator.ts
extension/src/transientEvidenceStorage.ts
extension/src/storagePrivacy.ts
extension/src/installation.ts
extension/src/captureErrorPrivacy.ts

tests/unit/extensionLeetCodeNetworkAdapter.test.ts
tests/unit/extensionTransientEvidenceStorage.test.ts
tests/unit/extensionBackgroundOrchestrator.test.ts
tests/unit/extensionStoragePrivacy.test.ts
```

## Remove after replacement is green

From `extension/src/background.ts`:

```text
VERDICT_CANDIDATE_RETRY_DELAY_MS
MAX_VERDICT_CANDIDATE_RETRY_ATTEMPTS
pendingVerdictCandidateRecheck
tryOnce
recheck
attempts
setTimeout verdict retry path
confirmedSubmissions storage revival branch
direct lastCaptureError write for retry exhaustion
```

From `extension/src/adapters/leetcode/network.ts`:

```text
shouldRetryLeetCodeVerdictCandidate
storageChangeRevivesVerdictCandidate
```

Delete obsolete test file after its meaningful assertions have been moved:

```text
tests/unit/extensionLeetCodeVerdictRetry.test.ts
```

---

# Task 0: Freeze the repair baseline

**Objective:** Preserve the current failed experiment and create an isolated repair workspace.

## Steps

* [ ] Confirm current branch and HEAD.

```bash
git status --short
git branch --show-current
git rev-parse HEAD
git log -3 --oneline
```

Expected:

```text
branch: feature/v1-followup
HEAD: 1239f77b06fb56132437e5dd543265082408f132
working tree: clean
```

* [ ] Create an isolated worktree.

```bash
git worktree add .worktrees/d4-e3-coordinator-repair \
  -b fix/v4-d4-e3-candidate-coordinator \
  1239f77b06fb56132437e5dd543265082408f132
```

* [ ] Create this plan document in the new worktree.

* [ ] Record that the ninth observation is blocked.

```text
D4 status:
- root race: confirmed
- polling repair: disproven
- storage-event repair: cross-layer review failed
- real observation: blocked until coordinator repair passes
```

* [ ] Commit only the plan.

```bash
git add docs/superpowers/plans/2026-08-06-v4-phase-d-d4-e3-candidate-coordinator-repair.md
git commit -m "docs(v4): plan exact E3 candidate coordinator repair"
```

**Completion standard:** New worktree is clean and based exactly on `1239f77`.

---

# Task 1: Add the cross-layer RED tests first

**Files:**

```text
Create: tests/unit/extensionVerdictCandidateFlow.test.ts
Modify: tests/unit/extensionLeetCodeNetworkAdapter.test.ts
```

**Objective:** Reproduce the real defect without Chrome UI or live LeetCode.

## Required RED scenario

Use these timestamps:

```text
submit network evidence:       2026-08-06T11:20:00.000Z
check/result network evidence: 2026-08-06T11:20:02.500Z
candidate DOM observation:     2026-08-06T11:20:02.700Z
executor processing clock:     2026-08-06T11:20:03.065Z
```

The test must prove:

```text
E2.receivedAt = 11:20:02.500
not 11:20:03.065
```

Then simulate:

```text
candidate registered
→ no matching E2 yet
→ candidate retained in session
→ exact E2 event arrives
→ one resolution emitted
→ one E3 applied
→ one bundle generated
→ confirmed record removed
→ one tombstone retained
→ pending candidate removed
→ outbox count becomes 1
```

## Additional RED tests

* [ ] Candidate remains pending when the newest same-document submit lifecycle is still `pending`, even when an older same-problem confirmed record exists.
* [ ] An E2 from another tab does not resolve the candidate.
* [ ] An E2 from another document does not resolve the candidate.
* [ ] An E2 for another problem does not resolve the candidate.
* [ ] Two tabs may each retain and resolve one candidate.
* [ ] Candidate observed before the actual confirming network evidence fails chronology and produces no bundle.
* [ ] Duplicate resolution or duplicate E3 produces no second bundle.
* [ ] Restarting the orchestrator with the same session storage recovers and resolves the retained candidate.
* [ ] Invalid verdict text is rejected before candidate persistence.
* [ ] More than one legal latest submit candidate fails closed as ambiguity.

## Run RED tests

```bash
npx vitest run --config vitest.extension.config.ts \
  tests/unit/extensionVerdictCandidateFlow.test.ts \
  tests/unit/extensionLeetCodeNetworkAdapter.test.ts
```

Expected: FAIL for missing coordinator contracts and incorrect E2 timestamp.

Do not implement production code until the failures are observed and recorded.

* [ ] Commit RED tests.

```bash
git add tests/unit/extensionVerdictCandidateFlow.test.ts \
  tests/unit/extensionLeetCodeNetworkAdapter.test.ts
git commit -m "test(v4): reproduce late E2 candidate finalization race"
```

---

# Task 2: Correct LeetCode E2 evidence timestamps

**Files:**

```text
Modify: extension/src/adapters/leetcode/network.ts
Modify: extension/src/background.ts
Modify: tests/unit/extensionLeetCodeNetworkAdapter.test.ts
```

## Required contract change

Change:

```ts
export type LeetCodeConfirmationInput = Readonly<{
  checkEvidence: E1RequestObserved;
  submitCandidates: readonly E1RequestObserved[];
  now: string;
}>;
```

to:

```ts
export type LeetCodeConfirmationInput = Readonly<{
  checkEvidence: E1RequestObserved;
  submitCandidates: readonly E1RequestObserved[];
}>;
```

Change:

```ts
export type LeetCodeResultConfirmationInput = Readonly<{
  resultEvidence: E1RequestObserved;
  graphqlCandidates: readonly E1RequestObserved[];
  problemCandidates: readonly LeetCodeProblemCandidate[];
  now: string;
}>;
```

to:

```ts
export type LeetCodeResultConfirmationInput = Readonly<{
  resultEvidence: E1RequestObserved;
  graphqlCandidates: readonly E1RequestObserved[];
  problemCandidates: readonly LeetCodeProblemCandidate[];
}>;
```

For check confirmation:

```ts
receivedAt: check.receivedAt
```

For result confirmation:

```ts
receivedAt: result.receivedAt
```

Remove `now` from:

```text
selectLeetCodeConfirmation callers
selectLeetCodeResultConfirmation callers
submissionEvidence policy wrapper inputs
tests and fixtures
```

## Do not change

```text
E3.receivedAt
capture-state chronology checks
executor scheduling
network observer receivedAt behavior
```

## Verification

```bash
npx vitest run --config vitest.extension.config.ts \
  tests/unit/extensionLeetCodeNetworkAdapter.test.ts

npm run typecheck
```

Expected: focused adapter tests PASS.

* [ ] Commit.

```bash
git add extension/src/adapters/leetcode/network.ts \
  extension/src/background.ts \
  tests/unit/extensionLeetCodeNetworkAdapter.test.ts
git commit -m "fix(v4): preserve LeetCode network evidence timestamps"
```

---

# Task 3: Add bounded transient verdict-candidate storage

**Files:**

```text
Modify: extension/src/transientEvidenceStorage.ts
Modify: extension/src/storagePrivacy.ts
Modify: extension/src/installation.ts
Modify: extension/src/backgroundOrchestrator.ts
Modify: tests/unit/extensionTransientEvidenceStorage.test.ts
Modify: tests/unit/extensionStoragePrivacy.test.ts
```

## New session-only key

```text
transientVerdictCandidates
```

Add it to:

```text
APPROVED_SESSION_STORAGE_KEYS
background orchestrator SESSION_KEYS
installation session initialization/read keys
transient session read/write/prune keys
```

Do not add it to local storage.

## New type

```ts
export type TransientVerdictCandidate = Readonly<{
  schemaVersion: 1;
  tier: "E3";
  kind: "verdict_candidate";
  candidateId: string;
  platform: "leetcode";
  problemExternalId: string;
  verdict: string;
  observedAt: string;
  tabId: number;
  frameId: number;
  documentId: string;
  transitionEvidence:
    | "same_document_transition"
    | "exact_result_document";
  receivedAt: string;
}>;
```

`receivedAt` should equal the accepted candidate observation time. Do not add a second processing-time field.

## Bounds

```ts
export const VERDICT_CANDIDATE_TTL_MS =
  E1_LIFECYCLE_TTL_MS;

export const VERDICT_CANDIDATE_MAX_COUNT = 32;
```

Candidates must not outlive the E1 lifecycle they depend on.

## Candidate ID

Add one deterministic pure function:

```ts
export function verdictCandidateIdentity(
  candidate: Pick<
    TransientVerdictCandidate,
    | "platform"
    | "tabId"
    | "frameId"
    | "documentId"
    | "problemExternalId"
    | "observedAt"
  >,
): string {
  return [
    candidate.platform,
    String(candidate.tabId),
    String(candidate.frameId),
    candidate.documentId,
    candidate.problemExternalId,
    candidate.observedAt,
  ].join("\u001f");
}
```

Reject control characters in all identity strings before storage.

## Parser requirements

Accept only the exact keys listed in the type. Reject:

```text
url
pageUrl
body
headers
cookies
token
code
source
sourceCode
username
account
email
installationId
```

## Pruning behavior

`pruneTransientSessionEvidence` must:

* remove expired candidates;
* remove candidates whose timestamps are invalid or in the future;
* retain at most the newest 32 valid candidates;
* preserve all existing E0/E1/unmatched-E3 behavior.

## Required tests

* [ ] valid candidate round-trips;
* [ ] unknown field is rejected;
* [ ] malformed timestamp is rejected;
* [ ] control characters are rejected;
* [ ] forbidden raw fields are rejected;
* [ ] expiry at TTL boundary is deterministic;
* [ ] count is capped at 32;
* [ ] legacy storage without the new key reads as an empty candidate array;
* [ ] session prune retains unrelated existing slices.

## Verification

```bash
npx vitest run --config vitest.extension.config.ts \
  tests/unit/extensionTransientEvidenceStorage.test.ts \
  tests/unit/extensionStoragePrivacy.test.ts

npm run typecheck
```

* [ ] Commit.

```bash
git add extension/src/transientEvidenceStorage.ts \
  extension/src/storagePrivacy.ts \
  extension/src/installation.ts \
  extension/src/backgroundOrchestrator.ts \
  tests/unit/extensionTransientEvidenceStorage.test.ts \
  tests/unit/extensionStoragePrivacy.test.ts
git commit -m "feat(v4): persist bounded verdict candidates in session"
```

---

# Task 4: Implement the pure Candidate/E2 coordinator

**Files:**

```text
Create: extension/src/verdictCandidateCoordinator.ts
Create: tests/unit/extensionVerdictCandidateCoordinator.test.ts
```

## Public interfaces

```ts
export type VerdictCandidateResolution = Readonly<{
  candidateId: string;
  platform: "leetcode";
  problemExternalId: string;
  externalSubmissionId: string;
  verdict: string;
  observedAt: string;
  tabId: number;
  frameId: number;
  documentId: string;
}>;

export type VerdictCandidateTerminalReason =
  | "ambiguous_latest_submit"
  | "identity_mismatch"
  | "chronology_mismatch"
  | "expired";

export type VerdictCandidateTerminal = Readonly<{
  candidateId: string;
  platform: "leetcode";
  problemExternalId: string;
  reason: VerdictCandidateTerminalReason;
}>;

export type VerdictCandidateReconciliation = Readonly<{
  pending: readonly TransientVerdictCandidate[];
  resolutions: readonly VerdictCandidateResolution[];
  terminal: readonly VerdictCandidateTerminal[];
}>;

export function reconcileVerdictCandidates(input: Readonly<{
  candidates: readonly TransientVerdictCandidate[];
  requestLifecycles: readonly TransientE1Lifecycle[];
  confirmed: readonly ConfirmedSubmissionRecord[];
  now: string;
}>): VerdictCandidateReconciliation;
```

## Matching algorithm

For each candidate:

### Step A: Select eligible submit lifecycles

A lifecycle is eligible only when:

```text
platform === leetcode
tabId matches
frameId matches
documentId matches
endpointKey is the LeetCode submit endpoint for candidate.problemExternalId
method === POST
resourceType === xmlhttprequest
lifecycle === completed
statusCode === 200
submit receivedAt <= candidate observedAt
```

### Step B: Select the latest submit attempt

Sort eligible submits by:

1. `evidence.receivedAt`;
2. `evidence.apiTimeStamp`;
3. `evidence.requestId` only as deterministic tie ordering.

Only lifecycles at the latest timestamp/API timestamp are candidates.

* zero eligible submits → keep candidate pending;
* more than one distinct latest submit → terminal `ambiguous_latest_submit`;
* one latest submit with `outcome !== "matched"` → keep pending;
* one latest submit with `stableSubmissionId === null` → keep pending.

### Step C: Join the exact confirmed record

Find the record whose:

```text
storageKey === latestSubmit.stableSubmissionId
finalizedAt === undefined
platform === candidate.platform
problemExternalId === candidate.problemExternalId
```

* zero records → keep pending;
* more than one matching record → terminal ambiguity;
* identity mismatch → terminal `identity_mismatch`.

### Step D: Enforce evidence chronology

Require:

```text
candidate.observedAt >= confirmed.confirmedAt
```

Do not compare candidate time to executor processing time.

Failure → terminal `chronology_mismatch`.

### Step E: Emit exact resolution

Return one resolution containing the exact `externalSubmissionId`.

Do not construct E3 in this module. It is a correlation module, not an adapter.

## Required tests

* [ ] latest pending submit prevents stale older confirmed record from resolving;
* [ ] exact latest matched submit resolves;
* [ ] unrelated tab/frame/document/problem does not resolve;
* [ ] two latest equal candidates fail closed;
* [ ] candidate earlier than confirmed evidence fails chronology;
* [ ] candidate survives zero-match reconciliation;
* [ ] expiry produces terminal result;
* [ ] two independent tabs resolve independently;
* [ ] result ordering is deterministic.

## Verification

```bash
npx vitest run --config vitest.extension.config.ts \
  tests/unit/extensionVerdictCandidateCoordinator.test.ts

npm run typecheck
```

* [ ] Commit.

```bash
git add extension/src/verdictCandidateCoordinator.ts \
  tests/unit/extensionVerdictCandidateCoordinator.test.ts
git commit -m "feat(v4): add exact verdict candidate coordinator"
```

---

# Task 5: Integrate candidate ownership into the orchestrator

**Files:**

```text
Modify: extension/src/backgroundOrchestrator.ts
Modify: tests/unit/extensionBackgroundOrchestrator.test.ts
```

## New orchestrator event

```ts
| {
    readonly kind: "verdict_candidate_recorded";
    readonly candidate: TransientVerdictCandidate;
  }
```

Extend E3 event:

```ts
| {
    readonly kind: "e3_recorded";
    readonly evidence: E3FinalVerdictConfirmed;
    readonly candidateId?: string;
  }
```

## New orchestrator effect

Add:

```ts
readonly verdictCandidateResolutions:
  readonly VerdictCandidateResolution[];
```

Every effects constructor, including ignored/no-op effects, must populate it with `[]`.

## Candidate event behavior

`verdict_candidate_recorded` must:

1. read and prune transient state;
2. deduplicate by `candidateId`;
3. append the candidate, capped at 32;
4. run `reconcileVerdictCandidates`;
5. persist the returned pending set;
6. persist terminal diagnostics;
7. return exact resolutions in `verdictCandidateResolutions`.

## E2 event behavior

After `handleE2Recorded`:

1. persist the confirmed record;
2. mark the exact matched submit lifecycle;
3. run `reconcileVerdictCandidates` against the updated local and session state;
4. persist the pending result;
5. return resolutions.

This is the authoritative E2-driven wake-up. Do not schedule another storage read or timer.

## Installation/restart behavior

`orchestrator.install()` must reconcile:

```text
persisted transient candidates
persisted matched lifecycles
persisted confirmed submissions
```

This permits a service worker that stopped after candidate persistence or E2 persistence to resume safely.

## Candidate removal behavior

When `e3_recorded` includes `candidateId`:

* bundle generated → remove candidate;
* matching tombstone already exists → remove candidate as idempotent success;
* terminal mismatch/rejection → remove candidate and persist a closed diagnostic;
* never remove the candidate merely because an E3 object was constructed.

## Required orchestrator assertions

* [ ] candidate-only event changes session state but not waiting/outbox;
* [ ] E2 event returns one resolution for the matching candidate;
* [ ] E2 event does not resolve unrelated candidates;
* [ ] successful E3 consumes candidate and confirmed record;
* [ ] successful E3 adds one tombstone and one outbox item;
* [ ] duplicate E3 creates no second bundle;
* [ ] restart/install re-emits a recoverable resolution;
* [ ] terminal chronology removes only the offending candidate;
* [ ] two candidates do not overwrite one another;
* [ ] all writes remain routed through orchestrator persistence.

## Verification

```bash
npx vitest run --config vitest.extension.config.ts \
  tests/unit/extensionBackgroundOrchestrator.test.ts \
  tests/unit/extensionVerdictCandidateCoordinator.test.ts

npm run typecheck
```

* [ ] Commit.

```bash
git add extension/src/backgroundOrchestrator.ts \
  tests/unit/extensionBackgroundOrchestrator.test.ts
git commit -m "feat(v4): coordinate verdict candidates through orchestrator"
```

---

# Task 6: Add an adapter-owned E3 constructor

**Files:**

```text
Modify: extension/src/adapters/leetcode/network.ts
Modify: tests/unit/extensionLeetCodeNetworkAdapter.test.ts
```

## New helper

```ts
export function createLeetCodeFinalVerdictEvidence(
  input: Readonly<{
    problemExternalId: string;
    externalSubmissionId: string;
    verdictText: string;
    tabId: number;
    frameId: number;
    documentId: string;
    receivedAt: string;
  }>,
): E3FinalVerdictConfirmed | null;
```

It must validate:

* external ID format: `cn/<digits>` or `com/<digits>`;
* problem slug format;
* normalized final verdict;
* canonical UTC timestamp;
* non-negative tab/frame;
* non-empty document ID;
* no forbidden fields or control characters.

It must produce the same E3 identity convention currently used:

```ts
evidenceId:
  `e3_leetcode_${externalSubmissionId.replace("/", "_")}`
```

The existing policy `verdictEvidence` may delegate to this helper after its page-URL checks. Do not duplicate verdict normalization logic.

## Required tests

* [ ] valid `cn` and `com` evidence;
* [ ] invalid scope rejected;
* [ ] malformed submission ID rejected;
* [ ] pending/Other Failure verdict rejected;
* [ ] malformed time rejected;
* [ ] control-character identity rejected;
* [ ] output remains Safe Evidence parseable.

## Verification

```bash
npx vitest run --config vitest.extension.config.ts \
  tests/unit/extensionLeetCodeNetworkAdapter.test.ts

npm run typecheck
```

* [ ] Commit.

```bash
git add extension/src/adapters/leetcode/network.ts \
  tests/unit/extensionLeetCodeNetworkAdapter.test.ts
git commit -m "refactor(v4): construct LeetCode E3 from exact resolution"
```

---

# Task 7: Replace the background retry patch

**Files:**

```text
Modify: extension/src/background.ts
Modify: tests/unit/extensionVerdictCandidateFlow.test.ts
Delete: tests/unit/extensionLeetCodeVerdictRetry.test.ts
```

## Candidate intake

For a LeetCode candidate:

1. validate sender URL, tab, frame and document;
2. normalize problem identity;
3. normalize verdict before persistence;
4. create `TransientVerdictCandidate`;
5. call:

```ts
applyOrchestratorEvent({
  kind: "verdict_candidate_recorded",
  candidate,
});
```

Do not read `confirmedSubmissions` directly in the message branch.

## Resolution processing

After every orchestrator event has been persisted, process:

```ts
effects.verdictCandidateResolutions
```

For each resolution:

```ts
const e3 = createLeetCodeFinalVerdictEvidence({
  problemExternalId: resolution.problemExternalId,
  externalSubmissionId: resolution.externalSubmissionId,
  verdictText: resolution.verdict,
  tabId: resolution.tabId,
  frameId: resolution.frameId,
  documentId: resolution.documentId,
  receivedAt: resolution.observedAt,
});
```

If E3 is valid:

```ts
await applyOrchestratorEvent({
  kind: "e3_recorded",
  evidence: e3,
  candidateId: resolution.candidateId,
});
```

The recursion is bounded because `e3_recorded` must return no further candidate resolution for the same candidate.

If E3 construction unexpectedly fails, submit a terminal candidate-resolution event or orchestrator diagnostic. Do not silently return.

## Remove completely

```text
all verdict retry constants
all verdict retry timers
all attempt counters
pendingVerdictCandidateRecheck
storageChangeRevivesVerdictCandidate import and listener branch
shouldRetryLeetCodeVerdictCandidate import
direct trustedLocalStorage.set({ lastCaptureError })
problem-only confirmedSubmissions scan
```

The remaining `captureEnabled` cache-invalidating storage listener may remain.

## Required flow tests

* [ ] candidate before E2 completes exactly one bundle;
* [ ] E2 before candidate completes exactly one bundle;
* [ ] unrelated E2 leaves candidate pending;
* [ ] two tabs complete independently;
* [ ] no `setTimeout` is needed;
* [ ] no storage-change event is needed;
* [ ] service-worker reconstruction completes retained candidate;
* [ ] adapter construction failure is diagnosed;
* [ ] successful flow clears waiting after outbox creation;
* [ ] duplicate signals remain idempotent.

## Verification

```bash
npx vitest run --config vitest.extension.config.ts \
  tests/unit/extensionVerdictCandidateFlow.test.ts \
  tests/unit/extensionVerdictCandidateCoordinator.test.ts \
  tests/unit/extensionBackgroundOrchestrator.test.ts \
  tests/unit/extensionLeetCodeNetworkAdapter.test.ts

npm run typecheck
```

* [ ] Commit.

```bash
git add extension/src/background.ts \
  tests/unit/extensionVerdictCandidateFlow.test.ts \
  tests/unit/extensionLeetCodeVerdictRetry.test.ts
git commit -m "fix(v4): replace E3 polling with exact E2 coordination"
```

---

# Task 8: Add closed diagnostics through the orchestrator

**Files:**

```text
Modify: extension/src/captureErrorPrivacy.ts
Modify: extension/src/backgroundOrchestrator.ts
Modify: tests/unit/extensionBackgroundOrchestrator.test.ts
```

## Diagnostic format

Use one bounded format:

```text
verdict candidate blocked: leetcode:<slug>:<reason>
```

Allowed reasons:

```text
ambiguous
chronology
expired
identity
adapter
```

Allowlist pattern:

```ts
/^verdict candidate blocked: leetcode:[a-z0-9-]{1,128}:(ambiguous|chronology|expired|identity|adapter)$/u
```

All candidate diagnostics must be written through orchestrator persistence so:

* cached snapshot is updated;
* popup observes the same authoritative state;
* no direct local-storage write bypass remains.

Do not include:

```text
submission ID
document ID
tab ID
URL
verdict text
request ID
timestamps
```

in `lastCaptureError`.

Detailed identities may remain only in sanitized session diagnostics if already permitted by the transient diagnostic contract.

## Required tests

* [ ] each allowed reason survives privacy sanitization;
* [ ] unknown reason is replaced with the safe fallback;
* [ ] slash/space/control-character slug is rejected;
* [ ] orchestrator snapshot immediately exposes the error;
* [ ] no stale cached snapshot hides a newly persisted error.

## Verification

```bash
npx vitest run --config vitest.extension.config.ts \
  tests/unit/extensionBackgroundOrchestrator.test.ts

npm run typecheck
```

* [ ] Commit.

```bash
git add extension/src/captureErrorPrivacy.ts \
  extension/src/backgroundOrchestrator.ts \
  tests/unit/extensionBackgroundOrchestrator.test.ts
git commit -m "fix(v4): surface candidate failures through orchestrator"
```

---

# Task 9: Run full engineering gates

Run in this order.

## Focused tests

```bash
npx vitest run --config vitest.extension.config.ts \
  tests/unit/extensionVerdictCandidateCoordinator.test.ts \
  tests/unit/extensionVerdictCandidateFlow.test.ts \
  tests/unit/extensionLeetCodeNetworkAdapter.test.ts \
  tests/unit/extensionTransientEvidenceStorage.test.ts \
  tests/unit/extensionBackgroundOrchestrator.test.ts \
  tests/unit/extensionStoragePrivacy.test.ts
```

Expected: all PASS.

## Type and lint

```bash
npm run typecheck

npx eslint \
  extension/src/adapters/leetcode/network.ts \
  extension/src/background.ts \
  extension/src/backgroundOrchestrator.ts \
  extension/src/verdictCandidateCoordinator.ts \
  extension/src/transientEvidenceStorage.ts \
  extension/src/storagePrivacy.ts \
  extension/src/installation.ts \
  extension/src/captureErrorPrivacy.ts \
  tests/unit/extensionVerdictCandidateCoordinator.test.ts \
  tests/unit/extensionVerdictCandidateFlow.test.ts \
  tests/unit/extensionLeetCodeNetworkAdapter.test.ts \
  tests/unit/extensionTransientEvidenceStorage.test.ts \
  tests/unit/extensionBackgroundOrchestrator.test.ts \
  tests/unit/extensionStoragePrivacy.test.ts \
  --max-warnings=0
```

Expected: exit 0.

## Full extension gate

```bash
npm run extension:check
```

Expected:

```text
typecheck PASS
extension unit tests PASS
MV3 build PASS
dist parity PASS
```

## Extension E2E

```bash
npm run extension:e2e
```

Expected: exit 0.

## Privacy audit

```bash
node scripts/audit-v4-extension-privacy.mjs
```

Expected:

```text
0 findings
```

## Static removal audit

```bash
git grep -n \
  -e "pendingVerdictCandidateRecheck" \
  -e "shouldRetryLeetCodeVerdictCandidate" \
  -e "storageChangeRevivesVerdictCandidate" \
  -e "MAX_VERDICT_CANDIDATE_RETRY_ATTEMPTS" \
  -e "VERDICT_CANDIDATE_RETRY_DELAY_MS"
```

Expected: no production-code matches.

Check remaining candidate handler for direct confirmed scan:

```bash
git grep -n "confirmedSubmissionIds" extension/src/background.ts
```

Expected: no match in the candidate message branch.

## Final diff review

```bash
git diff 1239f77b06fb56132437e5dd543265082408f132...HEAD --stat
git diff 1239f77b06fb56132437e5dd543265082408f132...HEAD
git status --short
```

Required review questions:

* Is any timer still used for verdict pairing?
* Does any storage listener revive candidates?
* Can an old same-problem confirmed record consume a newer candidate?
* Can two tabs overwrite one another?
* Can executor delay change evidence timestamps?
* Can a candidate disappear before E3 finalization is proven?
* Does Worker restart retain enough state?
* Can any candidate field leak raw URL, code, token or account data?
* Is every terminal path observable and fail-closed?

## Review gate

Perform one focused code review after implementation is complete. Do not repeatedly invoke multiple overlapping reviewers during each task.

Reviewer scope:

```text
timestamp semantics
exact submit/E2/candidate identity
candidate persistence and pruning
orchestrator mutation ownership
idempotency
restart recovery
privacy
test adequacy
```

No commit may be called “verified” until all commands above have recorded exit 0.

### Review gate disposition (2026-08-07)

One focused review returned `REQUEST-CHANGES` on the Task 7-9 combined diff. User
authorized fixing all HIGH/MEDIUM findings before re-verification. Disposition:

1. **HIGH — TTL-pruned candidates vanished without a terminal diagnostic.**
   Fixed. `terminalDiagnosticForRemovedCandidates` reconciles every candidate
   removed by the TTL prune exactly once in all three orchestrator paths
   (`installImpl`, `applyImpl`, `pruneOrchestratorSessionImpl`) and persists the
   closed `verdict candidate blocked: leetcode:<slug>:expired` diagnostic
   through `localWrites` before the candidate is dropped. Covered by three new
   tests in `tests/unit/extensionBackgroundOrchestrator.test.ts`.
2. **MEDIUM — intake rejections were silent.** Judged **not applicable** after
   user consultation: both silent returns in the LeetCode candidate message
   branch (`background.ts` `normalizeLeetCodeProblemIdentity === null` and the
   taxonomy rejection `createLeetCodeTransientVerdictCandidate === null`) are
   *input filters* at the same trust tier as the sender URL/tab/frame/document
   validation that precedes them, not candidate terminal paths. The diagnostic
   contract in this plan is frozen to
   `verdict candidate blocked: leetcode:<slug>:(ambiguous|chronology|expired|identity|adapter)`
   (see `extension/src/captureErrorPrivacy.ts`), and `verdict_candidate_blocked`
   requires a persisted `candidateId`, which cannot exist before intake succeeds.
   The `problemIdentity === null` case additionally has no slug at all, so no
   compliant diagnostic shape exists. Forcing a diagnostic would (a) extend the
   frozen allowlist and the privacy audit, and (b) write storage influenced by
   an unverified DOM verdict text — exactly what the taxonomy guard exists to
   prevent. No change made.
3. **MEDIUM — GraphQL regression lacked a full-chain unit test.** Fixed. Added
   `graphql result-distribution full chain: E2 from the adapter drives one
   bundle` to `tests/unit/extensionVerdictCandidateFlow.test.ts`: it reproduces
   `applyLeetCodeResultConfirmation` against orchestrator-retained transient
   state, drives the E2 through `selectLeetCodeResultConfirmation`, and asserts
   resolution, E3 finalization, one bundle, one tombstone, and no retained
   candidate.

Re-verification after the fixes: see Task 9 gates above; all exit 0, plus
`npm run extension:e2e` passed to completion.

### Second review-gate disposition (2026-08-07)

A second independent review returned `REQUEST-CHANGES` with one BLOCKER, two
HIGH, and one MEDIUM finding on the Task 7-9 re-verification diff. User
authorized fixing all findings before re-verification. Disposition:

1. **BLOCKER — candidateId used a control character.** `verdictCandidateIdentity`
   joined identity fields with `\u001f` (0x1F), but `parseVerdictCandidate`
   rejects control characters `[\\x00-\\x1f\\x7f]` in the identity strings it
   validates (candidateId is among them). A session write/read round-trip of
   an adapter-produced candidate therefore always re-parsed it as corrupt and
   dropped the pending candidate. Fixed: `verdictCandidateIdentity` now emits
   `JSON.stringify([...])` of the same identity fields — printable, free of
   control characters, deterministic, and collision-free — without relaxing
   the parser's control-character rejection. Proven first as a failing RED
   test (`adapter-produced candidate survives a session write/read round trip`
   in `tests/unit/extensionVerdictCandidateFlow.test.ts`), then green; the
   pinned identity expectation in
   `tests/unit/extensionTransientEvidenceStorage.test.ts` was updated to the
   JSON encoding.
2. **HIGH — `lastCaptureError` write/remove concurrence loss.** `applyLocalDiff`
   and `applyOrchestratorPersistence` apply writes first, then removals, so a
   fresh closed diagnostic write combined with a same-key removal for
   `lastCaptureError` could be net-deleted. Sources of those removals:
   `computeInitializationDiff` honoring `shouldRemoveLastCaptureError` (a
   stale unsanitizable stored error), and the clear user actions
   (`CLEAR_CAPTURE_OUTBOX` / `CLEAR_CAPTURE_QUARANTINE`) that transition the
   key to `undefined`. Fixed with a pure helper
   `dropRemovalsOverwrittenByWrites`: a non-undefined write to a key wins over
   a same-key removal (an `undefined` write is itself a deletion intent and
   does not cancel the removal). Wired into `installImpl` and `applyImpl`;
   both now derive `nextLocal` and expose `persistence.localRemovals` from the
   resolved final diff. Two regression tests added to
   `tests/unit/extensionBackgroundOrchestrator.test.ts`: install keeps a fresh
   diagnostic over a plan-driven removal, and apply keeps a fresh diagnostic
   over a concurrent clear-event removal.
3. **HIGH — the `graphql` endpoint bound too broadly.** `selectEligibleSubmitLifecycles`
   treated ANY same-document POST `/graphql` (the endpoint carries no problem
   identity) as an eligible submit lifecycle, so an unrelated newer graph
   POST could shadow a matching completed lifecycle whose E2 had already
   marked a specific graph lifecycle `matched`. Fixed: a `graphql` lifecycle
   participates only when it is already matched to the confirmed E2
   (`outcome === "matched"` with a stable submission id); unmatched graph
   POSTs can no longer outrank the real submit on `receivedAt` ordering.
   A competing-graph regression test added to
   `tests/unit/extensionVerdictCandidateCoordinator.test.ts` proves an
   unrelated newer graph POST never shadows the matched submit.
4. **MEDIUM — prune returned state before the diagnostic write.** In
   `pruneOrchestratorSessionImpl`, `state` was derived from `priorLocal`
   before the TTL-expiry diagnostic was applied to local, so the popup would
   only see a `lastCaptureError` on the next refresh even though the prune
   already persisted it. Fixed: apply `localWrites` to `priorLocal` first,
   then derive `state` from the final diff. The existing prune-surface test
   now also asserts `effects.state.lastCaptureError === <diagnostic>`.

Re-verification after round two fixes: typecheck exit 0; ESLint on the four
changed files exit 0; focused orchestrator/coordinator/storage/flow suite
105/105; full extension unit suite 45 files / 1514 tests; `npm run
extension:check` exit 0; `node scripts/audit-v4-extension-privacy.mjs`
`0 findings`; `npm run extension:e2e` 53 passed / 1 known skip, exit 0.

## Task 10 execution result (2026-08-08)

Round-two fixes and this plan were committed in one coherent commit:

```text
a9515a8ad5afd25120246bb69d26d6379995905e
fix(v4): surface expired diagnostics and pin graphql coordination
```

- Base SHA: `3246713` (merge of Task 7-9 verdict candidate coordinator repair)
- Implementation SHA: `a9515a8` (this commit)
- Documentation SHA: `a9515a8` (plan + disposition recorded in the same commit)
- Test counts: focused 4 files 105/105; full extension unit suite
  45 files / 1514 tests; `npm run extension:e2e` 53 passed / 1 known skip
- Build result: `npm run extension:check` exit 0, production `extension/dist`
  rebuilt; `git diff --check` exit 0
- Privacy audit: `node scripts/audit-v4-extension-privacy.mjs` → `0 findings`
- Working-tree status: clean
- No push, no PR, no RC marker, no D4 acceptance performed.

---

# Task 10: Commit candidate engineering result

After all gates pass:

```bash
git status --short
git log --oneline 1239f77..HEAD
```

Create one final reconciliation commit only if generated artifacts or documentation changed:

```bash
git add -A
git commit -m "docs(v4): reconcile D4 E3 coordinator repair"
```

Record:

```text
base SHA
implementation SHA
documentation SHA
test counts
build result
privacy audit result
working-tree status
```

Do not push, open a PR, mark RC or mark D4 accepted without explicit authorization.

---

# Task 11 execution result (2026-08-09)

**FAILED: 9th real observation (merge-two-sorted-lists, `cn/741081653`,
Accepted).** E2 and E3 were confirmed, but no bundle was generated and no
server delivery occurred. Failure protocol was followed: no timeout increase,
no polling added, no chronology weakening, no patch without a new RED test.

Evidence (sanitized boundary evidence, exported 2026-08-09):

```text
candidate:
  problemExternalId: merge-two-sorted-lists
  observedAt: 2026-08-09T08:43:49.309Z   <- stale; PREDATES the submit E1
  tabId: 1454626896, frameId: 0
  documentId: B71E6B4E5A438816D0DC95856E482127
  transitionEvidence: same_document_transition
  verdict: Accepted
  (candidateId is the new JSON-array encoding - D4 identity fix held in the wild)

latest submit lifecycle (matched):
  receivedAt: 2026-08-09T08:43:51.614Z   POST leetcode/submit/cn/merge-two-sorted-lists
  outcome: matched
  stableSubmissionId: leetcode:cn/741081653

E2:
  externalSubmissionId: cn/741081653
  confirmedAt: 2026-08-09T08:43:52.814Z  (record present, NO finalizedAt)
  matched graphql lifecycles at 08:43:52.813Z / 08:43:53.812Z / 08:43:53.836Z

E3:
  externalSubmissionId: cn/741081653
  lastE3At: 2026-08-09T08:43:53.728Z
  transientUnmatchedE3: [] (empty)

coordinator:
  candidate pending (no resolution, no terminal reason)
  transientAmbiguityDiagnostics: [] (empty)

finalization:
  confirmed consumed: false
  tombstone created: none
  outbox delta: 0  (captureOutbox: [])
  POST /api/capture/attempts: NONE in server log
  SQLite: capture_events=0, training_sessions=0, training_attempts=0
```

**First divergent layer (per failure protocol): candidate creation in
`extension/src/contentRuntime.ts`.** The LeetCode.cn SPA restored a historical
"Accepted" result panel for this problem (the user had previously practiced
it); after a null phase the runtime misread that stale panel as a genuine
transition and emitted the candidate at 08:43:49.309 — 2.3 s BEFORE the real
submit E1 (08:43:51.614). When the new submission's result arrived, it was
also "Accepted", so the same-text dedupe at `contentRuntime.ts` lines
206-211 (`last.verdict === snapshot.verdict` → no candidate) suppressed the
correct candidate forever.

The coordinator then correctly failed closed by design: with the only
candidate predating every eligible submit lifecycle,
`selectEligibleSubmitLifecycles` (verdictCandidateCoordinator.ts line 192,
`received > observed → skip`) yields an empty eligible set, so the candidate
stays `pending` until the 5-minute `VERDICT_CANDIDATE_TTL_MS` expiry; the
confirmed record is never finalized; waiting stays 1; no bundle, no outbox
delta, no POST, no SQLite row.

**Observed mechanisms (both verified against code):**
1. Stale historical result panels can be misclassified as post-submit
   transitions (`contentRuntime.ts` null-phase + same-text dedupe interplay).
2. A same-text repeat verdict (Accepted after Accepted) is deduped and never
   creates the correct candidate for the new submission.

**Authoritative root cause after Task 12:** the content runtime has no trusted
submit epoch. A verdict string plus a generic DOM mutation cannot distinguish
"the SPA restored an old panel" from "the exact new submission rendered the
same verdict again." Removing the same-text dedupe would therefore replace a
missed capture with false candidates. The repair must add a network-anchored
E1/E2 control plane and a scoped result-surface transition while preserving
the coordinator chronology invariant.

**Required next step:** Task 12 has now reproduced the defect with one focused
RED and frozen a written repair design below. Production changes remain
unauthorized until this revision passes review. The failed ninth observation
remains immutable historical evidence.

---

# Task 11: Ninth real observation protocol

This task is authorized only after Tasks 0–10 pass.

## Preparation

* [ ] Start the local server.
* [ ] Confirm pairing is valid.
* [ ] Confirm SQLite baseline row count.
* [ ] Confirm server log baseline.
* [ ] Build extension from the final implementation SHA.

```bash
npm run extension:build
node scripts/check-extension-dist.mjs
git rev-parse HEAD
```

* [ ] Reload the exact rebuilt `extension/dist`.
* [ ] Record the loaded build SHA.
* [ ] Before submission, record:

```text
waiting count
outbox count
quarantine count
lastCaptureError
lastSuccessfulCaptureAt
SQLite row count
```

## Submission

Use a fresh LeetCode problem that has no retained unfinalized confirmed record.

Do not reuse a problem involved in observations 1–8 for this first proof.

Perform one natural submission.

## Required evidence

Capture sanitized evidence for:

```text
candidate:
  problemExternalId
  observedAt
  tabId
  frameId
  documentId

latest submit lifecycle:
  receivedAt
  requestId
  outcome
  stableSubmissionId

E2:
  problemExternalId
  externalSubmissionId
  receivedAt

coordinator:
  candidateId
  resolution count
  terminal reason, if any

E3:
  externalSubmissionId
  receivedAt

finalization:
  confirmed consumed
  tombstone created
  outbox delta
```

Do not capture code, request body, response body, headers, cookies or token material.

## PASS criteria

All must hold:

```text
popup waiting returns to baseline
outbox does not remain stuck
one new POST /api/capture/attempts
HTTP 200
one new non-voided SQLite row
one matching tombstone
no retained candidate
no unmatched E3
no candidate blocking error
no duplicate bundle
```

## Failure handling

If the observation fails:

* do not increase any timeout;
* do not add polling;
* do not weaken chronology;
* do not immediately patch based only on popup count;
* export the sanitized boundary evidence above;
* identify the first layer whose input/output diverges;
* return to a new RED test before changing production code.

One failed observation does not authorize a new architectural change without an updated written plan.

---

# Explicit Non-Goals

This repair does not:

* change NowCoder behavior;
* enable Codeforces, AtCoder or Luogu production capture;
* change bundle or API schemas;
* change SQLite;
* add request-body access;
* add host permissions;
* restore click-derived submission intent;
* redesign the entire capture system;
* alter the state-machine chronology invariant;
* convert the D3 candidate into an RC;
* constitute D4 acceptance;
* authorize D5;
* authorize release.

---

# Completion Definition

Engineering repair is complete only when:

```text
E2 timestamps represent network evidence time
candidate state is bounded and session-persistent
new LeetCode candidates bind the exact armed submit requestId
legacy candidates remain fail-closed under the existing compatibility path
no polling or storage-key wake-up remains
multiple tabs are independent
stale same-problem records cannot consume new candidates
restart recovery is tested
orchestrator owns all candidate mutations
E3 removal depends on finalization outcome
focused tests pass
extension:check passes
extension:e2e passes
privacy audit reports 0 findings
working tree is clean
```

D4 observation may be closed only after the subsequent real observation also satisfies the end-to-end PASS criteria.

Until then, status remains:

```text
D4 E3 coordinator repair:
engineering implementation pending / engineering candidate only

Not RC
Not acceptance
Not release
```

---

# Task 12: Same-verdict residual-panel RED and plan revision

**Execution date:** 2026-08-09

**Authority:** add one focused RED test and revise this plan only. Do not
modify `extension/src/**`, build or reload the extension, start a real
observation, change SQLite/browser/extension state, commit, or push.

## Task 12.1 — Baseline and reproduced RED

The clean starting point was
`9cbac5919aafea130c34b248171d96eaadaf4596` on
`feature/v1-followup`. Before adding the regression, the exact focused command
passed `6/6`:

```powershell
npx vitest run --config vitest.extension.config.ts tests/unit/extensionContentRuntime.test.ts
```

The original symptom-level test was:

```text
RED: emits a new candidate when a same-problem repeat submission keeps the historical verdict text
```

It models the observation-9 first divergence:

```text
null phase
→ residual Accepted panel emits one historical pre-E1 candidate
→ real submit E1 occurs
→ the real result surface renders Accepted again without a visible null verdict
→ require one distinct post-E1 candidate
```

Its first focused result was:

```text
Test Files  1 failed (1)
Tests       1 failed | 6 passed (7)
Assertion   expected [] to have a length of 1 but got +0
Location    tests/unit/extensionContentRuntime.test.ts:149
```

Two independent reviews rejected that symptom-only RED because deleting the
same-text dedupe would have made it green without proving E1/E2 causality. The
test was therefore revised before any production change. It now requires:

```text
historical Accepted on stable DOM node A
→ exact STARTED(request-2), which alone captures node A as baseline
→ duplicate STARTED is idempotent
→ generic same-node mutation emits nothing
→ CONFIRMED(unrelated-request) emits nothing
→ same Accepted rendered on distinct stable DOM node B after E1
→ pre-E2 DOM observation emits nothing but retains the transition proof
→ exact CONFIRMED(request-2) emits one request-bound candidate whose fresh
  observedAt is not earlier than confirmedAt
→ duplicate CONFIRMED emits nothing
```

The revised focused command still reports `6 passed / 1 intentional RED`.
The failure is now the absence of the reviewed submit-epoch control plane at
`tests/unit/extensionContentRuntime.test.ts:41`, rather than a permissive
expectation that every duplicate mutation emit a candidate. This RED cannot
be satisfied by removing the legacy text dedupe alone.

## Task 12.2 — Frozen repair contract for review

### Trusted submit epoch control plane

Add two closed internal messages for LeetCode only:

```text
LEETCODE_SUBMIT_EPOCH_STARTED
  schemaVersion: 1
  platform: leetcode
  problemExternalId
  submitRequestId
  receivedAt

LEETCODE_SUBMIT_EPOCH_CONFIRMED
  schemaVersion: 1
  platform: leetcode
  problemExternalId
  submitRequestId
  confirmedAt
```

The production webRequest path sends `STARTED` only after the existing adapter
has accepted a LeetCode submit E1 with lifecycle `before_request`. The exact E2
path sends `CONFIRMED` using `matchedSubmitRequestId`. Both messages target the
exact Chrome `tabId`, `frameId`, and `documentId` through
`chrome.tabs.sendMessage`; those routing identities are not duplicated into
the payload.

The payload may contain only the scalars above. It must never contain a URL,
request/response body, headers, code, cookies, tokens, account identity, or
raw transcript material. No new manifest permission, persistent storage key,
server/API field, SQLite column, timer, polling path, or click-derived intent
is permitted.

`STARTED` is the only event allowed to create an epoch or take a baseline.
`CONFIRMED` may only mark an existing exact epoch and may never synthesize an
epoch or baseline. Delivery order is not trusted:

* `CONFIRMED` without the exact live `STARTED` epoch fails closed;
* exact duplicate `STARTED` and `CONFIRMED` messages are idempotent;
* the same `submitRequestId` with a different problem identity or timestamp is
  a terminal control-message conflict and never replaces prior state;
* `confirmedAt` must be greater than or equal to the epoch `receivedAt`;
* malformed timestamps, unknown fields, and conflicting identities fail
  closed before DOM observation;
* target delivery failure never falls back to tab-only, frame-only, another
  document, or broadcast delivery.

### Content-runtime arming and DOM proof

For each exact submit request, the content runtime keeps only bounded,
ephemeral state. The per-document epoch registry has an explicit maximum of
`32` entries and a TTL of `5 minutes` measured from the accepted E1
`receivedAt`. Expired entries are removed lazily only while handling an
existing control message, a current MutationObserver batch, or a page lifecycle
event; no timer or polling is added. An unexpired full registry rejects a new
epoch with the fixed `epoch_capacity_exceeded` diagnostic rather than evicting
or guessing. Navigation/document invalidation clears the registry. Emitted
epochs retain only their bounded emitted marker until TTL so replay cannot
emit twice.

```text
submitRequestId
problemExternalId
E1 receivedAt
optional E2 confirmedAt
baseline normalized verdict
baseline local DOM result-surface identity
whether a null phase was observed
whether one candidate was already emitted
```

DOM result-surface identity is only the stable in-memory reference of the
actual `Element`/DOM node returned by the existing narrow LeetCode verdict
locator or selected submission-detail result surface. It is never a parser
DTO, snapshot/wrapper object, serialized value, generic body node, or a newly
allocated object created on each observation. The node reference is never
serialized, persisted, logged, or sent to the background.

`STARTED` records the baseline but emits no candidate and creates no waiting
state. `CONFIRMED` marks the same request and performs a fresh DOM observation.
The runtime may emit exactly one candidate for that request only when E2 is
confirmed and at least one of these is true:

1. a meaningful null transition occurred after E1 (a non-null baseline/result
   surface became null or disappeared; null-to-null is not evidence);
2. the normalized verdict changed after E1;
3. the stable narrow result-surface DOM node reference changed after E1.

The candidate `observedAt` is the real time of that fresh DOM observation. It
must not be copied from E1/E2, replaced with executor time, or calculated with
`max(...)`. If E2 arrives after the DOM transition, the E2-triggered fresh
observation may emit only when the saved post-E1 transition proof exists. If
no legal transition exists, the epoch remains fail-closed until the existing
TTL; arbitrary body mutations are never sufficient.

Once an exact epoch is armed, legacy verdict-text-only or DOM-text-only dedupe
must not run before the request-bound transition evaluation. The invariant is
`same problem + same verdict + different submitRequestId != duplicate`. The
legacy passive path may keep its existing dedupe, but it cannot suppress an
armed request from constructing a request-bound candidate.

Duplicate `STARTED`, duplicate `CONFIRMED`, repeated MutationObserver batches,
and worker reconciliation may not emit a second candidate for the same
request. A page/document change invalidates the local epoch instead of
re-binding it.

### Exact candidate/coordinator binding

Add `submitRequestId` to new LeetCode verdict candidates and include it in the
candidate identity and strict session parser. Existing session candidates
without this additive field remain accepted only by the legacy fail-closed
compatibility path until TTL; they may not be silently assigned a requestId.

For a new armed candidate, the coordinator must select the lifecycle whose
`requestId === candidate.submitRequestId`, then revalidate platform, problem,
tab, frame, document, method, endpoint, lifecycle, status and stable submission
identity. It must not fall back to latest-by-time or problem-only matching.
The existing requirements that submit E1 precede the candidate and E2
`confirmedAt <= candidate.observedAt` remain unchanged.

A historical candidate followed by an otherwise matching later E1 is
terminal `chronology_mismatch` as soon as that later lifecycle is visible; it
must not remain pending for five minutes. That terminal cleanup cannot consume
the later confirmed record or suppress a separately armed post-E1 candidate.

### Restart and failure behavior

Service-worker initialization replays `CONFIRMED` only for an unfinalized
record that still has its exact matched E1 and exact live document. The
content runtime may use its surviving E1 baseline; if the baseline was lost,
it fails closed with a bounded `epoch_baseline_missing` diagnostic and never
fabricates a baseline from the already-final DOM.

An explicit internal sentinel distinguishes `baseline_not_captured` from a
legitimately observed null verdict. A null baseline is data; a missing baseline
is a terminal recovery failure.

Closed diagnostics use no new storage key and carry no identity. The content
handler returns a fixed enum response to the exact `chrome.tabs.sendMessage`
caller; background maps it through the existing orchestrator-owned
`lastCaptureError` lifecycle. The allowed fixed reasons are:

```text
epoch_control_malformed
epoch_target_delivery_failed
epoch_started_missing
epoch_baseline_missing
epoch_identity_conflict
epoch_timestamp_conflict
epoch_capacity_exceeded
epoch_result_surface_unchanged
verdict_candidate_adapter_rejected
verdict_candidate_chronology_mismatch
```

No diagnostic value may contain or interpolate URL, `submitRequestId`, tab,
frame, document, problem, verdict, payload, code, headers, cookies, token, or
account data. Task 13/14 must update the strict parser/allowlist and tests for
these fixed values only. Existing bounded `lastCaptureError` overwrite and
clear behavior remains authoritative; the content epoch registry itself is
never persisted or displayed. None of these diagnostics authorizes retry
polling, timestamp rewriting, or a broader DOM selector.

## Task 12.3 — Subsequent task boundaries

* **Task 13:** implement the two control messages, exact Chrome targeting,
  content-runtime arming, narrow DOM surface identity, and their unit tests.
  Tests must cover exact and wrong request IDs, duplicate/conflicting control
  messages, E2-before-E1, timestamp inversion, generic mutations, node versus
  DTO identity, capacity/TTL cleanup, navigation invalidation, and background
  delivery to the exact tab/frame/document with no fallback.
* **Task 14:** implement additive `submitRequestId`, exact coordinator binding,
  stale pre-E1 terminal cleanup, upgrade compatibility, flow and restart tests.
* **Task 15:** run focused suites, full extension gates, privacy audit and one
  independent code, privacy, and plan review; repair only findings inside this
  approved design. Because Tasks 13/14 change runtime and protocol code, Task
  15 must then re-enter the D3 freeze boundary under the already recorded user
  authorization: create a new immutable implementation-candidate commit, run
  `scripts/validate-v4-candidate.mjs --candidate <new-sha>`, build the exact
  `extension/dist`, and record SHA-256 hashes for `manifest.json`,
  `background.js`, `content.js`, `popup.js`, and `main-world-bridge.js` when
  present. Any later runtime, manifest, permission, migration, build-script,
  protocol, or dist change invalidates the candidate and returns to repair and
  re-freeze before Task 16.
* **Task 16:** execute one real LeetCode automated engineering observation for
  residual `Accepted` → new `Accepted` delivery.

Tasks 13–16 remain unauthorized until both the project-GPT supplemental review
and the local authoritative reviewer approve this revised contract.

## Task 12.4 — Task 16 browser and evidence contract

Task 16 uses the existing Chrome profile named `yu`. Before it starts, the
user only needs to close ordinary Chrome instances that hold that profile and
confirm it is available; the agent performs the browser submission and all
pre/post evidence checks. Login expiry, CAPTCHA/2FA, profile lock, or an
unavailable submit control is a hard stop for user assistance—credentials may
not be read, copied, exported, or bypassed.

The automation uses the exact rebuilt `extension/dist`, verifies that exactly
one capture extension instance is active, proves that the loaded dist was built
from Task 15's new immutable candidate SHA, rechecks the recorded artifact
hashes before the first submission, and prefers the retained accepted
solution for `merge-two-sorted-lists`. It must not save a HAR, export browser
state, inspect or record editor code, or capture cookies/tokens. The run is
classified as a **real-platform automated engineering observation**. A PASS
may close D4 engineering delivery evidence, but it is not a natural user
submission, user acceptance, RC, or release.

## Task 12 review gate and stop state

Review must explicitly approve or reject:

```text
trusted E1/E2 causality
exact requestId binding
narrow local-only DOM surface identity
candidate and restart bounds
pre-E1 terminal cleanup
privacy/permission boundary
unchanged chronology invariant
automated-observation evidence classification
```

The approved terminal Task 12 state is:

```text
Task 12 RED: REPRODUCED
Task 12 plan revision: APPROVED
Tasks 13-16: AUTHORIZED WITHIN THE FROZEN CONTRACT
D4 end-to-end delivery: UNPROVEN
Not RC / Not acceptance / Not release
```

### First review disposition (2026-08-10)

The side-panel project GPT supplemental review returned `REJECT`. It approved
exact request binding, chronology cleanup, restart fail-closed behavior,
privacy/permission scope, and the automated-observation/final-acceptance split,
but required three contract corrections: explicit E1/E2 ordering/duplicate/
conflict rules, stable real DOM-node identity rather than generic object
identity, and an invariant preventing legacy text dedupe from suppressing an
armed request.

The independent local repository reviewer also returned `REJECT`. It found the
original RED could be satisfied unsafely, the master Phase D plan still
conflicted with automated observation evidence, the content epoch registry had
no executable bound, and closed diagnostics had no strict privacy-preserving
channel. The revised RED and this contract address all four findings. No
production file changed before or during these revisions. At that historical
checkpoint, second review was required before Task 13 authorization; the final
disposition below now controls.

### Final review disposition (2026-08-10)

The side-panel project GPT supplemental re-review returned `APPROVE` based on
the supplied local contract and explicitly closed its three earlier blockers:
E1/E2 ordering and conflict semantics, stable real DOM-node identity, and
requestId evaluation before legacy text dedupe. It also approved the bounded
epoch registry, fixed no-identity diagnostics, causal RED, and the separation
between real-platform automated engineering observation and final user
acceptance. This is supplemental evidence; it did not replace local repository
inspection.

The independent local reviewer then inspected the latest real diff and current
production code. Its first re-review found two further HIGH gaps: the RED did
not assert `observedAt >= confirmedAt`, and Task 15 did not explicitly re-enter
the D3 immutable-candidate freeze before Task 16. Both were corrected without
production changes. The final local re-review returned `APPROVE`, citing the
new assertion, candidate validator/freeze/hash contract, and Task 16 loaded-
artifact proof. It authorizes Tasks 13-16 only inside this frozen contract.

At that Task 12 checkpoint, Task 13 became the next sequential action. D4 real-
platform engineering delivery, D5 F1-F4, final user acceptance, RC, and release
remain unproven or pending as applicable.

## Task 13 implementation closeout (2026-08-10)

Task 13 is engineering-complete at implementation commit
`fe36f6b4770d3d929479464c03e8bea6dbb97ba9` (`fix(v4): bind repeated
verdicts to submit epochs`). The implementation adds the strict LeetCode-only
`STARTED` / `CONFIRMED` control plane, exact one-shot tab/frame/document
delivery, a bounded in-document epoch registry, stable narrow DOM `Element`
identity, request-bound runtime candidates, and fixed identity-free diagnostics
through the existing orchestrator-owned `lastCaptureError` path.

The first independent implementation review returned `REJECT` with three
blocking findings: same-document A/B epochs could share one DOM proof; the
exact Chrome delivery path lacked behavior-level regression evidence; and the
production adapter-to-runtime `Element` identity plus DTO/wrapper rejection was
not tested. All three were repaired. The Commander then found one additional
capacity-edge causal escape: a 33rd E1 rejection could leave an older epoch or
the legacy path able to consume the new result. The final implementation marks
same-problem predecessors `superseded` before capacity rejection and keeps any
unexpired marker authoritative over legacy evaluation until TTL or navigation
cleanup. Duplicate old `STARTED` messages cannot resurrect a superseded epoch.

The second independent exact-diff review returned `APPROVE`. Commander-owned
verification after the final capacity repair recorded:

```text
focused Task 13 / adjacent suite: 7 files, 338/338 passed
renamed regression test:          1 file, 7/7 passed
npm run typecheck:                exit 0
targeted ESLint:                  exit 0
git diff --check:                 exit 0 (CRLF conversion warnings only)
```

No full `extension:check`, extension E2E, production build, privacy audit,
candidate validation, browser observation, migration, or database operation was
run in Task 13. No `extension/dist` was generated. Those gates remain assigned
to Task 15 after Task 14 completes. Task 13 is not D4 delivery evidence, D5,
RC, acceptance, or release. Task 14 is now the next sequential action: persist
the additive request identity, bind it exactly in the coordinator, preserve
legacy fail-closed compatibility, and close restart/pre-E1 cleanup behavior.

## Task 14 implementation closeout (2026-08-10)

Task 14 is engineering-complete at implementation commit
`0f695ddfad6989e407424feff457d28d081d657b` (`fix(v4): bind verdict
candidates to exact submits`). New armed verdict candidates persist an additive
`submitRequestId` in their strict session identity; legacy candidates without
the field remain readable without being assigned a fabricated request ID.

The coordinator now binds armed candidates only to the exact request lifecycle
and revalidates the complete platform/problem/tab/frame/document/method/
endpoint/lifecycle/status/stable-submission/chronology tuple. It never falls
back to latest-by-time. A historical request-unbound candidate is terminalized
as soon as a matching later E1 proves the chronology inversion; that cleanup
does not consume the confirmed record or suppress an independent armed
candidate. Worker initialization reads local confirmed/tombstone state and
session E1 state afresh after candidate recovery, then replays only the unique
exact unfinalized `CONFIRMED` control to the original tab/frame/document. It
never fabricates `STARTED` or a DOM baseline.

The strict capture-error allowlist now accepts only the reviewed fixed,
identity-free submit-epoch/coordinator reasons. Both historical verdict-
candidate patterns that embedded a problem slug were removed. The independent
exact-diff review returned `APPROVE` with no blocking or non-blocking findings,
including explicit confirmation that an arrived but not-yet-eligible exact
lifecycle remains fail-closed pending and cannot fall back to another request.

Commander-owned verification recorded:

```text
focused Task 14 suite: 6 files, 228/228 passed
npm run typecheck:      exit 0
targeted ESLint:        exit 0
git diff --check:       exit 0 (CRLF conversion warnings only)
```

No full `extension:check`, extension E2E, production build, privacy audit,
candidate validation, browser observation, migration, or database operation was
run in Task 14. Task 14 is not D4 delivery evidence, D5, RC, acceptance, or
release. Task 15 is now the only authorized next action: execute the focused
and full gates plus independent code/privacy/plan reviews, repair only within
the frozen design, then create and validate a new immutable D3 candidate SHA
and record exact production-dist hashes before Task 16.
