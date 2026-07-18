# Phase 4 Project Practice and Explicit Engineering Evidence Delivery Plan

**Status (2026-07-18):** Future V1 capability; not started. Its entry
dependencies are not complete. Do not execute this portfolio document until a
post-V0.5 atomic plan is written and approved.

> **For agentic workers:** Use `superpowers:brainstorming` to freeze the first
> project/evidence slice, `superpowers:writing-plans` for atomic tasks,
> `superpowers:test-driven-development` during implementation, and
> `superpowers:verification-before-completion` at the V1 gate.

**Goal:** Bridge isolated OJ work and software engineering through
editor-agnostic project tasks, explicit local build/test evidence, selected
code snapshots or Git diffs, meaningful milestones, and one evolving C++
project.

**Non-goals:** No editor plugin, workspace/file watcher, save/run/debug
footprint monitoring, terminal-history collection, keystroke tracking,
arbitrary repository scan, automatic commit, online IDE, or generic project
management suite.

**Dependencies:** Phase 1 provides stable node/task IDs; Phase 2 provides daily
tasks; Phase 3 accepts explicit run/test/project evidence and snapshot
references; Phase 0/V0.5 provide trustworthy OJ evidence where available.

## 1. Experience Contract

Direct OJ editing remains the lowest-friction path. Project practice is an
optional enhanced path that works with any editor or terminal because evidence
is submitted deliberately rather than observed continuously.

```text
Website recommends a project or implementation task
  → learner explicitly starts a training session
  → learner works with any editor/toolchain
  → learner explicitly records a build/test result
  → learner optionally selects a bounded code snapshot or Git diff
  → learner records a milestone and short reflection
  → Phase 3 validates and projects the evidence
```

The product never infers growth from edit frequency, time in an editor, number
of saves, cursor movement, debug duration, or command history. It judges only
inspectable task outcomes and later verification/transfer evidence.

## 2. First Project Slice

Ship one reviewed C++ command-line task tracker that grows through:

1. basic input/output and CRUD;
2. functions, types and module boundaries;
3. search, sort, indexing and queue/priority behavior;
4. file persistence and serialization;
5. tests, error handling, logging, build, Git and documentation;
6. a final run/test/explain/change-request assessment.

Add one unfamiliar change request so a familiar implementation is not mistaken
for transferable ability.

## 3. Planned Data Contracts

At Phase 4 kickoff, inspect merged migrations and assign the next available
prefix to a semantic `project_practice_evidence.sql` migration.

- extend `practice_tasks` with implementation, debugging, variant, review and
  project-milestone kinds while preserving stable IDs;
- `project_practice_sessions`: task, learner, explicit start/end, language,
  toolchain label and provenance;
- `explicit_run_results`: user-submitted build/test/check facts, exit/result
  category, bounded diagnostics and evidence source;
- `artifact_evidence`: user-selected snapshot/checksum/diff/test-summary/commit
  reference, purpose, capture mode and deletion state;
- `project_templates`, `learner_projects` and `project_milestones`;
- `rubric_assessments`: versioned 0–3 dimensions with cited evidence;
- `project_node_evidence`: explicit primary/supporting node links.

No table stores editor events, absolute workspace telemetry, terminal history,
keystrokes, save counts, or background file snapshots.

## 4. Privacy and Trust Contract

- Every evidence attachment is initiated and previewed by the learner.
- Default evidence is structured build/test status plus a short reflection;
  raw code is optional.
- A selected snapshot/diff is bounded by size, file type and explicit purpose.
- Reject `.env*`, keys, credentials, binary/build output and secret patterns.
- Never inherit/upload environment variables or execute commands supplied by a
  webpage.
- Git references are user-confirmed milestones; the product never commits or
  pushes automatically.
- Full/basic/minimal modes control evidence detail without penalizing the
  learner; missing optional evidence lowers confidence rather than blocking use.
- Local-first deterministic planning and manual evidence continue to work when
  AI or any future integration is disabled.

## 5. Work Packages

### 4.1 Explicit project-session and evidence contracts

- [ ] Define versioned project-session, run-result, artifact-reference and
  milestone schemas.
- [ ] Test manual-only, OJ-linked, build-only, test-backed, snapshot-backed,
  missing-evidence and corrected-evidence cases.
- [ ] Keep ambiguous OJ/project relationships separate until the learner
  explicitly confirms them.

### 4.2 Unified practice-task model

- [ ] Test OJ problem, minimal implementation, debugging exercise, variant,
  review and project milestone kinds.
- [ ] Reuse Phase 1 task IDs and node mappings; do not create a second planning
  identity.
- [ ] Make `/today`, `/training` and future `/projects` consume the same task
  contract.

### 4.3 Explicit build/test and artifact intake

- [ ] Accept a user-entered or explicitly imported build/test result with
  bounded diagnostics and provenance.
- [ ] Accept an optional selected snapshot, Git diff or milestone reference
  after preview and secret/path validation.
- [ ] Test oversized, secret-bearing, unsupported, deleted, corrected and
  offline evidence without scanning unselected files.

### 4.4 Project template and milestones

- [ ] Implement the C++ task-tracker template with dependency-checked,
  independently runnable milestones.
- [ ] Test resume, skip/replace, template upgrade, unfamiliar change request and
  completion.
- [ ] Map each milestone to primary/supporting capabilities and expected
  evidence.

### 4.5 Rubric, reflection and transfer

- [ ] Store user-confirmed milestones for start, first working result, tested
  result, refinement and retrospective.
- [ ] Test the 0–3 rubric for function, design, testing/boundaries,
  maintainability, robustness, explanation and transfer.
- [ ] Require minimum 2 in function, testing, integration and explanation; an
  average cannot hide a critical zero.
- [ ] Feed verified facts into Phase 3 replay; never mutate ability directly.

### 4.6 Product integration

- [ ] Add project-task status and explicit evidence actions to `/training` and
  a future `/projects` surface.
- [ ] Show provenance, uncertainty, correction and deletion controls for every
  evidence item.
- [ ] Add browser E2E fixtures using synthetic evidence; CI must not execute
  arbitrary user projects.

## 6. Verification

The future atomic plan must add focused domain, repository, API and Playwright
tests, then run the repository quality gate. A separate Windows manual check
must cover explicit evidence preview, secret rejection, missing compiler/test
result entry, snapshot deletion, Git milestone confirmation and offline use.

## 7. Exit Gate

- [ ] Direct OJ/manual learning remains fully usable without any editor
  integration.
- [ ] A learner can complete a project task using any editor, explicitly record
  build/test evidence, and see its provenance and uncertainty.
- [ ] No background process monitors files, saves, runs, debugging, commands,
  terminal history or keystrokes.
- [ ] No evidence contains unselected files, secrets or environment variables.
- [ ] Full/basic/minimal modes and delete/export controls work for explicit
  results and snapshots.
- [ ] Git history contains only learner-created or learner-confirmed milestones.
- [ ] The C++ project remains runnable/testable after each milestone and ends
  with one unfamiliar change request.
- [ ] Project evidence changes ability only through Phase 3 replayable
  contracts.
- [ ] The full future phase gate passes.

## 8. Risks and Controls

- **Evidence friction:** structured result entry is minimal; code attachment is
  optional and task-scoped.
- **Privacy:** explicit preview, bounded selection, secret rejection and local
  deletion controls.
- **False attribution:** learner confirmation, provenance and no silent merge.
- **Project familiarity bias:** unfamiliar change request and delayed transfer
  evidence.
- **Git noise:** milestone references only; no automatic save/run commits.
