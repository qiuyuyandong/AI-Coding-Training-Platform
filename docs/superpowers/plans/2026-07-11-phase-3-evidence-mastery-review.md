# Phase 3 Evidence, Ability, and Review Delivery Plan

**Status (2026-07-18):** Partially implemented. V0 provides conservative
manual-attempt mapping, correction-aware `unassessed`/L1/L2 projection, and
explanations. Full evidence events, code snapshots, L3–L5 verification, decay,
and review scheduling remain future V0.5/V1 work and need a fresh delta plan.

> **For agentic workers:** Use `superpowers:writing-plans` to expand the active slice, `superpowers:test-driven-development` during implementation, and `superpowers:verification-before-completion` at each release gate.

**Goal:** Replace verdict counting with an auditable model that classifies one training session, projects `unassessed + L1–L5` capability levels, schedules verification/review, and explains every change.

**Non-goals:** Do not claim universal mastery probabilities, infer independence from AC alone, log every keystroke, copy hidden tests, let AI determine levels, or train a knowledge-tracing model in V1.

**Dependencies:** Phase 0 provides trustworthy session/submission identity and provenance; Phase 1 provides stable node/task IDs; Phase 2 provides goals, effort boundaries and plan reasons.

## 1. Release Slices

### V0 thin slice

- manual training result and optional 30-second reflection;
- one primary node and limited supporting mappings;
- `unassessed + L1–L5` storage with conservative transitions;
- visible reason, confidence band and correction/dispute path;
- no code-based automatic classification yet.

### V0.5 connected slice

- one production OJ adapter;
- submission sequence, code snapshots, visible results and code diffs;
- five session outcomes and evidence-coverage levels;
- basic review/verification queue.

### V1 complete slice

- explicit project-session evidence with learner-confirmed OJ relationships;
- delayed, variant, alternative-solution, transfer and project evidence;
- confidence decay by knowledge type;
- full evidence timeline, user dispute flow and calibration metrics.

## 2. Four-Layer Semantics

```text
Raw facts
  → Training-session outcome
  → Capability projection
  → User-visible level and explanation
```

The layers must not share one overloaded status field.

### 2.1 Raw facts

Facts are append-only except for explicit correction/supersession events. Record when available:

- task, canonical problem, source platform, node and session/submission identity;
- target difficulty and first-seen/repeated/variant/transfer context;
- verdict/result sequence and visible test/score/runtime/memory/error fields;
- code snapshot reference and diff features;
- independent, hinted, solution-viewed or AI-assisted context;
- run/test/debug/project/Git milestone evidence;
- selected effort boundary, interruption and delay from previous related work;
- provenance, parser version and confidence for every inferred field.

Do not invent missing novelty, assistance, hidden-test or independence facts.

### 2.2 Evidence coverage

Coverage describes what was observed, not how capable the learner is:

| Coverage | Available evidence |
|---|---|
| E1 | final result only |
| E2 | submission times and verdict sequence |
| E3 | per-submission code snapshots and diffs |
| E4 | local run/test/debug plus assistance/reflection context |

Every conclusion carries coverage and confidence. E1 AC remains insufficient evidence for a high ability transition.

### 2.3 Five training-session outcomes

1. `independent_effective_completion` — credible independent solution evidence;
2. `assisted_effective_completion` — help was used but the session produced learning that can be re-verified;
3. `productive_struggle` — not complete, but tests/errors/code show meaningful progress;
4. `unproductive_trial_and_error` — repeated submissions without meaningful conceptual progress;
5. `insufficient_evidence` — data is missing, contradictory or abnormal.

No outcome is a personality judgment. A failed task can be productive; an AC can be insufficient evidence.

### 2.4 User-visible capability levels

`unassessed` is not a level.

| Level | Observable contract |
|---|---|
| L1 `initial_understanding` | recognizes and can explain basics with support |
| L2 `assisted_application` | completes familiar work with examples, hints or AI |
| L3 `independent_application` | independently completes a new target-level task |
| L4 `stable_mastery` | succeeds across time and variants and can debug effectively |
| L5 `transfer_integration` | transfers to projects/adjacent contexts and explains trade-offs |

Internal projections may retain a continuous estimate, confidence, stability, evidence count and target-career level. UI shows bands and reasons, not uncalibrated decimal precision.

## 3. Conservative Update Rules

- Time decreases confidence and may mark a node stale; time alone never lowers the visible level.
- A new performance failure can lower a level, but one ordinary failure does not.
- Level changes occur one step at a time unless a correction invalidates the underlying evidence.
- One task has one or at most two primary nodes; supporting nodes receive weak evidence and cannot reach L4 from support alone.
- Same-problem short-term repeats have sharply diminishing value.
- Delayed no-hint reimplementation, a materially different solution, complexity optimization and transfer/project use remain meaningful evidence.
- Self-report can change task selection and trigger diagnosis; it cannot directly set the system level.
- All thresholds and intervals are versioned experiments, not learning-science claims.

## 4. Planned Data Contracts

At Phase 3 kickoff, assign the next available migration prefix to `learning_evidence_ability_review.sql` after inspecting merged history.

Tables:

- `learning_evidence_events`: append-only facts, provenance, parser/schema version, confidence, correction link and idempotency key;
- `evidence_node_mappings`: explicit primary/supporting role, strength and mapping reason;
- `training_session_summaries`: derived five-outcome result, coverage level, classifier version, reason codes and source event range;
- `code_snapshot_refs`: dedicated snapshot locator, hash, language, size, retention state and capture purpose; no raw code in general analytics rows;
- `ability_snapshots`: node, visible level, internal estimate/confidence/stability/evidence count, target-career level, stale flag, projection version and as-of time;
- `ability_transitions`: previous/new level, evidence IDs, reason codes and user-visible explanation;
- `review_items`: due window, purpose (`refresh`, `variant`, `transfer`, `prerequisite_check`), priority, selected task and scheduler version;
- `learner_assessments`: self-rating/dispute, optional reason, linked system snapshot and resolution;
- `misconception_signals`: normalized error category with supporting evidence IDs and confidence.

Core modules:

- `lib/domain/evidence.ts`
- `lib/domain/ability.ts`
- `lib/domain/review.ts`
- `lib/services/trainingOutcomeClassifier.ts`
- `lib/services/abilityProjector.ts`
- `lib/services/reviewScheduler.ts`
- `lib/services/adaptivePracticeSelector.ts`
- `lib/services/evidenceExplanation.ts`
- matching repositories under `lib/repositories/`

Snapshot bytes use a dedicated local store in V0.5/V1 and an object-store adapter in Public Beta. Database rows contain hashes and references, not arbitrary workspace contents.

## 5. Work Packages

### 3.1 Append-only evidence and corrections

- [ ] Test manual records, captured OJ sessions, missing facts, replay, correction, supersession and primary/supporting mappings.
- [ ] Migrate legacy attempts as E1/low-confidence evidence without inventing independence or novelty.
- [ ] Add manual capture and a conditional short reflection for assisted, abnormal or unfinished sessions.
- [ ] Persist parser/schema versions and installation/source provenance.

### 3.2 Snapshot and diff contract

- [ ] Test snapshot hash/idempotency, language/size limits, allowed workspace/source, deletion, retention expiry and unavailable bytes.
- [ ] Store only event-time snapshots: run, submit, test, explicit checkpoint and final accepted version.
- [ ] Extract structural diff features separately from raw code so basic-analysis mode can discard snapshot bytes.
- [ ] Reject `.env`, secret-like files, paths outside the selected workspace and unsupported binary content.

### 3.3 Training outcome classifier

- [ ] Create table-driven fixtures for all five outcomes at E1–E4 coverage.
- [ ] Return outcome, confidence, reason codes and unresolved facts; never return a capability level.
- [ ] Treat code replacement, very rapid repeated changes and assistance as signals requiring context, not automatic cheating labels.
- [ ] Add user correction that appends an event and replays derived summaries.

### 3.4 Replayable ability projection

- [ ] Test every allowed `unassessed → L1 → … → L5` transition and conservative downward transitions.
- [ ] Prove supporting evidence, short-term repetition, self-report and E1 AC alone cannot create L4/L5.
- [ ] Prove advancing the clock changes confidence/stale state but not visible level.
- [ ] Persist projection version, evidence IDs and the exact reason for each transition.

### 3.5 Review and next-evidence scheduler

- [ ] Test refresh, next-day variant, longer-delay verification, transfer/project checks and prerequisite backtracking.
- [ ] Add one highest-information task at a time; never generate an unlimited same-form queue.
- [ ] Version knowledge-type decay and scheduling parameters.
- [ ] Merge due review with the current goal and effort boundary while preserving one primary daily task.

### 3.6 Explanation, dispute and product integration

- [ ] Add compact explanations to `/training`, `/today`, `/coach` and `/growth`.
- [ ] Let users inspect raw timeline, submission sequence, key code diffs, assistance facts and transition evidence.
- [ ] Let users submit an assessment/dispute; schedule verification or replay corrections without direct level editing.
- [ ] Track false mastery, wheel-spinning, over-practice, correction rate and coverage distribution for calibration.

## 6. Verification Commands

```powershell
npm run test -- tests/unit/trainingOutcomeClassifier.test.ts tests/unit/abilityProjector.test.ts tests/unit/reviewScheduler.test.ts tests/unit/adaptivePracticeSelector.test.ts tests/unit/evidenceExplanation.test.ts
npm run lint
npm run db:migrate
npm run test
npm run typecheck
npm run e2e
npm run extension:build
npm run build
```

All snapshot/AI/provider tests use fixtures and temporary stores; no real OJ, model or user workspace is contacted.

## 7. Exit Gate

- [ ] Replaying identical ordered events with the same versions produces identical summaries, levels, explanations and reviews.
- [ ] Replaying the same request 100 times creates one fact and no duplicate transition or review.
- [ ] Every level change cites valid evidence IDs and reason codes.
- [ ] E1 AC, self-report or supporting evidence alone cannot create L4/L5.
- [ ] Time passage can mark L4 stale but cannot silently turn it into L3.
- [ ] A delayed failure schedules diagnosis; only new performance evidence can reduce a level.
- [ ] Same-problem short-term repetition is discounted; delayed/different-solution evidence remains distinguishable.
- [ ] Users can correct facts, dispute a conclusion, delete snapshots and continue in minimal-record mode.
- [ ] `/today` still presents one primary task after review is introduced.
- [ ] Deterministic planning remains usable without AI.
- [ ] Full phase gate passes.

## 8. Risks and Controls

- **Pseudo-scientific precision:** version heuristics, show bands/evidence and calibrate only from observed outcomes.
- **Capture misattribution:** require Phase 0 identities/provenance and manual correction before automatic level updates.
- **Reflection friction:** ask only when evidence is assisted, abnormal, disputed or unfinished.
- **Raw-code overcollection:** event snapshots, workspace allowlist, dedicated retention and basic/minimal modes.
- **Classifier moralizing:** describe observed progress and uncertainty, never laziness, cheating or suitability.
- **Review overload:** one primary action, due windows and prerequisite-risk priority.
