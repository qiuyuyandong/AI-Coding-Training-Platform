# V4 Phase D D4 E3 Candidate/E2 Coordinator Repair Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` or `superpowers:executing-plans` to execute this plan task-by-task. Do not parallelize Tasks 2–7 because they modify shared data contracts and must remain sequentially reviewable.

**Status:** `PROPOSED — BLOCKED BEFORE REAL OBSERVATION`

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
matching uses the exact latest submit lifecycle
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
