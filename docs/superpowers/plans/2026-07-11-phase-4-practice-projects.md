# Phase 4 VS Code Workspace, Practice, and Projects Delivery Plan

> **For agentic workers:** Use `superpowers:brainstorming` to freeze the first workspace/project slice, `superpowers:writing-plans` for atomic tasks, `superpowers:test-driven-development` during implementation, and `superpowers:verification-before-completion` at the V1 gate.

**Goal:** Bridge isolated OJ work and software engineering by adding an optional VS Code training workspace, local run/test evidence, minimal implementations and one continuously evolving C++ project.

**Non-goals:** Do not create an online IDE, monitor every terminal command or keystroke, scan arbitrary repositories, execute untrusted commands sent by a webpage, support every editor, or build a generic project-management suite.

**Dependencies:** Phase 0 provides session identity and authenticated ingestion; Phase 1 provides stable node/task IDs; Phase 2 provides daily tasks; Phase 3 accepts run/test/project evidence and snapshot references.

## 1. Experience Contract

Direct OJ editing remains a fully supported low-friction path. VS Code is an enhanced path for users who want local compilation, testing, debugging, file organization and Git habits.

```text
Website recommends a task
  → create/open a folder in the selected training workspace
  → VS Code extension reads system-generated problem metadata
  → learner writes, runs, tests and debugs locally
  → browser extension captures the original OJ submission
  → shared session/correlation ID merges both timelines
  → accepted solution may create a user-confirmed Git milestone
```

No step requires copying a commercial full problem statement into the workspace. Metadata stores the source link, task ID, node mappings and permitted local instructions.

## 2. First Workspace and Project Slice

Training workspace example:

```text
ai-training-workspace/
├─ problems/
│  └─ luogu/P1001/
│     ├─ solution.cpp
│     ├─ tests/
│     ├─ notes.md
│     └─ training-task.json
├─ projects/
│  └─ cpp-task-tracker/
└─ .ai-training/
   └─ local-cache/
```

Ship one reviewed project template: a C++ command-line task tracker that grows through:

1. basic input/output and CRUD;
2. functions, types and module boundaries;
3. search, sort, indexing and queue/priority behavior;
4. file persistence and serialization;
5. tests, error handling, logging, build, Git and documentation;
6. a final run/test/explain/change-request assessment.

Add one unfamiliar follow-up task or change request so success in a familiar project is not mistaken for transfer.

## 3. Planned Data Contracts

At Phase 4 kickoff, assign the next available migration prefix to `workspace_practice_projects.sql` after inspecting merged history.

Tables:

- extend `practice_tasks` with minimal implementation, debugging, variant, review and project-milestone kinds while preserving stable IDs;
- `training_workspaces`: stable local identifier, display name, consented root reference, extension version and status; do not send absolute paths to analytics/AI;
- `workspace_sessions`: task, correlation ID, start/end, language/toolchain and provenance;
- `local_run_events`: compile/test/debug/checkpoint facts, exit/result category, bounded output summary and snapshot reference;
- `session_correlations`: browser OJ session ↔ VS Code workspace session, match reason, confidence and correction history;
- `project_templates`, `learner_projects` and `project_milestones`;
- `artifact_evidence`: snapshot/checksum/test-summary/commit references and verification source;
- `rubric_assessments`: 0–3 dimension scores, evidence references, assessor and version;
- `project_node_evidence`: explicit primary/supporting node links.

VS Code extension source is planned under `vscode-extension/` with its own package/build/test configuration. Shared event schemas live in a small TypeScript package or dependency-free module consumed by app, browser extension and VS Code extension; the atomic plan must choose the exact layout after the repository structure is inspected.

## 4. Security and Privacy Contract

- The user selects one training root; the extension rejects files outside it.
- Default capture is event-based: explicit run, test, submit, checkpoint and final states—not every edit or keypress.
- Ignore `.git`, `.env*`, keys, binary files, build outputs and configurable secret patterns.
- The extension runs only generated/allowlisted task commands and shows the command before first execution.
- Apply process timeout, output-size limit and cancellation; do not inherit or upload environment variables.
- Direct arbitrary terminal history is never collected.
- Git commits are user-confirmed milestones; no automatic commit per save/run.
- Full/basic/minimal capture modes from Phase 3 apply equally to VS Code.

## 5. Work Packages

### 4.1 Shared training-session protocol

- [ ] Define versioned task, workspace-session, run-event and correlation schemas.
- [ ] Test browser-only, VS-Code-only, matched, ambiguous, late-arriving and corrected correlations.
- [ ] Use explicit correlation IDs whenever the website creates a workspace; heuristics are fallback and never silently merge ambiguous sessions.

### 4.2 VS Code extension foundation

- [ ] Scaffold commands for selecting a workspace, creating/opening a task and showing capture status.
- [ ] Store auth tokens through VS Code SecretStorage, not settings JSON or workspace files.
- [ ] Test workspace allowlist, ignored files, offline queue, replay, version mismatch and user pause.
- [ ] Provide a visible “recording active” state and one-click disable/delete path.

### 4.3 Controlled run/test/debug events

- [ ] Generate language/toolchain tasks for the first C++ slice and require confirmation before first run.
- [ ] Capture compile category, exit status, test summary, bounded diagnostics and event-time snapshot reference.
- [ ] Record debug-session start/end only; do not record arbitrary inspected values by default.
- [ ] Test timeout, cancellation, missing compiler, oversized output, offline upload and unsupported workspace.

### 4.4 Unified practice-task model

- [ ] Test OJ problem, minimal implementation, debugging exercise, variant, review and project milestone kinds.
- [ ] Reuse Phase 1 stable task IDs and node mappings; do not introduce a second planning identity.
- [ ] Make `/today`, `/training` and workspace metadata consume the same task contract.

### 4.5 Project template and milestone engine

- [ ] Implement the C++ task-tracker template with dependency-checked milestones and a runnable state after each milestone.
- [ ] Test resume, skip/replace, template upgrade, unfamiliar change request and completion.
- [ ] Map each milestone to primary/supporting capabilities and expected evidence.

### 4.6 Git milestones and rubric assessment

- [ ] Offer user-confirmed milestones for start, first working solution, accepted result, optimization and retrospective.
- [ ] Store commit hashes/references; do not require pushing to a remote repository.
- [ ] Test the 0–3 rubric for function, decomposition/design, testing/debugging/boundaries, efficiency, maintainability, robustness/security, tools/docs, explanation and transfer.
- [ ] Require minimum 2 in function, testing, integration and explanation; an average cannot hide a critical zero.

### 4.7 Product integration

- [ ] Add workspace status and launch actions to `/training` and `/projects`.
- [ ] Merge OJ/local timelines and expose uncertain correlations for correction.
- [ ] Feed verified run/test/project facts into Phase 3, never directly mutate ability levels.
- [ ] Add E2E/extension integration fixtures without launching arbitrary user code in CI.

## 6. Verification Commands

The atomic plan adds exact VS Code scripts; the V1 gate will include at least:

```powershell
npm run test
npm run typecheck
npm run e2e
npm run extension:build
npm run vscode-extension:test
npm run vscode-extension:build
npm run build
```

Run a separate documented Windows manual check for workspace selection, missing compiler, offline queue, OJ correlation, snapshot deletion and Git milestone confirmation.

## 7. Exit Gate

- [ ] A learner can continue using direct OJ editing without installing VS Code integration.
- [ ] A selected-workspace learner can create a task, run/test it, submit on the original OJ and see one merged timeline.
- [ ] Ambiguous browser/local sessions remain separate until corrected.
- [ ] No event includes a workspace-external file, secret, environment variable or full terminal history.
- [ ] Full/basic/minimal modes and delete/export controls work for local events and snapshots.
- [ ] Git history contains only user-confirmed milestones.
- [ ] The C++ project remains runnable/testable after each milestone and ends with one unfamiliar change request.
- [ ] Critical rubric dimensions each reach 2 before project completion evidence is emitted.
- [ ] Project evidence changes ability only through Phase 3's replayable contracts.
- [ ] Full phase gate passes.

## 8. Risks and Controls

- **Installation burden:** VS Code is optional; direct OJ/manual capture remains functional.
- **Local execution risk:** generated allowlisted commands, confirmation, timeout, bounded output and cancellation.
- **Workspace privacy:** one selected root, ignored secrets, event snapshots and visible capture state.
- **False session merge:** explicit correlation IDs, confidence, correction and no silent ambiguous merge.
- **Project familiarity bias:** one unfamiliar change request plus separate transfer evidence.
- **Git noise:** user-confirmed milestones, not save-by-save automation.
