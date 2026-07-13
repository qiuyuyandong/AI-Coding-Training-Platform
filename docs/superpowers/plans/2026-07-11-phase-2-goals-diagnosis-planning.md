# Phase 2 Goals, Diagnosis, and Deterministic Planning Delivery Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:brainstorming to validate the onboarding flow, superpowers:writing-plans for atomic tasks, and superpowers:test-driven-development during implementation.

**Goal:** Turn the static curriculum graph into a personal, explainable route that gives the learner one useful task today without requiring an AI key.

**Non-goals:** No probabilistic mastery model, spaced-repetition tuning, project assessment, AI-authored curriculum, or deep task catalogs for the nine career directions.

**Dependency:** Phase 1 graph, resources, and mappings pass their exit gate.

## User Experience Contract

- The learner first browses the career map, then may choose one primary direction plus one or two interests, or say “I am not sure.”
- Diagnosis is short, resumable, and admits uncertainty; it does not pretend to be an exam-grade assessment.
- Diagnosis produces a suggested start that the learner may adjust on the graph; later evidence continues to correct it.
- On each visit the learner selects exactly one effort boundary: 15, 30, 60, or 90 minutes.
- `/today` shows one primary task, why it was chosen, its learning outcome, and a user-selected effort boundary.
- At most three alternatives appear only after expansion.
- Skipping or replacing offers an optional lightweight reason and changes ranking; it never punishes streaks.
- The planner selects one daily mode: learn, review, practice, build, or recover. Phase 2 initially supports learn/practice/recover and leaves review/build candidates for Phase 3/4.
- Large multi-day changes are represented as reviewable plan revisions; Phase 5 may let AI propose them, but deterministic validation remains here.
- Missing a day shrinks/replans future work instead of moving the entire backlog into tomorrow.
- No predicted completion time or comparison with an “expected” duration is shown.

## Planned Data Contracts

At Phase 2 kickoff, assign the next available four-digit migration prefix to the semantic suffix `learner_goals_and_plans.sql` after inspecting merged history.

Tables:

- `learner_profiles`: local pilot profile and onboarding state, using a stable learner ID so public migration does not depend on singleton semantics;
- `learner_goals`: optional primary track, up to two interests, target level, horizon, status, created/changed timestamps;
- `diagnostic_sessions` and `diagnostic_responses`;
- `learner_node_baselines`: `unknown`, `self_reported`, `needs_foundation`, or `ready`, plus low/medium/high confidence; this is explicitly not mastery;
- `learning_plans`: long-term and stage snapshots with generator version;
- `daily_plan_snapshots`: local date, selected effort boundary, daily mode, generator version, and source plan;
- `plan_items`: stable Phase 1 task ID, node, role (`primary`, `warmup`, `same_goal_alternative`, `weakness_review`, `optional_project`), rank, reason code, status, and source plan;
- `task_feedback`: accepted, started, completed, skipped, and skip reason.
- `plan_revision_events`: before/after plan reference, typed operations, validation result and user decision.

Core types and services:

- `lib/domain/learner.ts`
- `lib/domain/plan.ts`
- `lib/services/prerequisiteAnalysis.ts`
- `lib/services/diagnosticAssessment.ts`
- `lib/services/candidateTaskSelector.ts`
- `lib/services/planGenerator.ts`

## Work Packages

### 2.1 Profile and goal lifecycle

- [ ] Test and implement stable local profile creation, optional primary/interest goals, route version binding, and history preservation.
- [ ] Add repositories and APIs with Zod validation; a goal change creates a new plan snapshot instead of rewriting history.
- [ ] Add a career-map-first `/plan` goal setup flow that can be skipped.

### 2.2 Resumable starting diagnosis

- [ ] Define a small diagnostic blueprint spanning C++, debugging/tools, and core data structures.
- [ ] Test selection, resume, unknown/skip responses, and uncertainty output.
- [ ] Store raw responses separately from derived diagnostic conclusions.
- [ ] Never mark mastery from self-report alone.
- [ ] Let the learner accept or move the suggested graph start, recording the override without changing public prerequisite edges.

### 2.3 Prerequisite gap analysis

- [ ] Write pure-service tests for prerequisite closure, blocked nodes, already-evidenced nodes, unknown regions, and route changes.
- [ ] Produce reason-coded gaps such as `missing_prerequisite`, `needs_diagnostic`, and `ready_for_practice`.
- [ ] Keep graph traversal deterministic and independent of UI/database handles.

### 2.4 Candidate ranking and plan generation

- [ ] Test ranking fixtures covering readiness, goal relevance, novelty, skip feedback, available resources, effort boundary, recovery after inactivity, and excessive repetition.
- [ ] Generate long-term milestones, a current stage, a daily mode, and today candidates from explicit rules.
- [ ] Persist the rule version and reason codes so a recommendation can be reproduced.
- [ ] Limit alternatives to three semantic roles: lightweight warm-up, same-goal different task, and known-weakness review; an optional project role becomes eligible in Phase 4.

### 2.5 `/today` and full `/plan`

- [ ] Implement the one-primary-task screen, 15/30/60/90-minute selector, daily mode, expandable alternatives, learning outcome, and recommendation reason.
- [ ] Implement plan overview with primary/interest goals, current stage, prerequisites, upcoming nodes and a local graph window without turning the home page into a dashboard wall.
- [ ] Add accept/start/skip/complete interactions and Playwright coverage.

### 2.6 Replanning and fallback behavior

- [ ] Test replanning after goal change, diagnosis/manual-start update, effort change, skip feedback, a missed day, missing resource, and no eligible task.
- [ ] Provide a safe fallback task and explicit explanation when evidence is insufficient.
- [ ] Validate typed plan revisions against prerequisite, effort, workload and recovery rules, and require confirmation before activation.
- [ ] Document rule ordering and how future Phase 3 evidence will replace temporary diagnostic assumptions.

## Verification Commands

```powershell
npm run test -- tests/unit/diagnosticAssessment.test.ts tests/unit/prerequisiteAnalysis.test.ts tests/unit/candidateTaskSelector.test.ts tests/unit/planGenerator.test.ts
npm run lint
npm run db:migrate
npm run test
npm run typecheck
npm run e2e
npm run extension:build
npm run build
```

## Exit Gate

- [ ] A new local user can choose or defer a goal, finish or resume diagnosis, and reach `/today`.
- [ ] The user can retain one primary direction plus no more than two interests, or remain undecided on the common foundation route.
- [ ] The planner works with no network and no AI key.
- [ ] The same graph/profile/evidence snapshot and planner version produce the same primary task and reasons.
- [ ] `/today` shows exactly one default task and no more than three on-demand alternatives.
- [ ] Every task states `why this`, `what it trains`, and the selected 15/30/60/90-minute effort boundary; no expected-duration comparison is present.
- [ ] The same-day plan can be quickly replaced, while a multi-day revision shows a diff and cannot violate prerequisites or the effort budget.
- [ ] Missing one day does not create an unbounded next-day backlog.
- [ ] `blocked`, `planned`, and nodes without reviewed resources are never selected as ordinary ready tasks.
- [ ] A skip, completion, or goal change produces a new auditable plan decision without deleting history.
- [ ] Unknown knowledge produces diagnosis or foundation work, not a confident mastery claim.
- [ ] Full phase gate passes.

## Risks and Controls

- **Choice overload:** enforce one primary task and measure alternative expansion rather than adding a large recommendation feed.
- **Shallow diagnosis:** preserve uncertainty and schedule evidence collection instead of lengthening onboarding indefinitely.
- **Planner opacity:** persist reason codes, inputs, and generator version.
- **Premature personalization:** rules use only available evidence; missing data remains unknown.
