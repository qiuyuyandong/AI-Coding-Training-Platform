# Phase 6 Windows Pilot, Portability, and Calibration Delivery Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:brainstorming to approve the pilot protocol, superpowers:writing-plans for atomic tasks, and superpowers:verification-before-completion for every release candidate.

**Goal:** Enable 5–10 nearby learners to install, use, inspect, back up, restore, and evaluate the V1 pilot for four continuous weeks, then calibrate product heuristics and decide readiness for the already-planned Public Beta work.

**Non-goals:** No public launch, production cloud migration, payment, social system, covert telemetry, growth campaign, or claim that a 5–10 person pilot scientifically validates mastery theory.

**Dependency:** Phases 0–5 satisfy their V1 slices, including browser/VS Code capture, evidence inspection and AI-disabled fallback. Earlier one- and two-week V0/V0.5 trials have already happened; this is the formal four-week calibration.

## Pilot Boundaries

- Audience: the owner, beginner classmates, and roommates using mostly Windows laptops and mainland-China networks.
- Duration: one setup rehearsal plus four full usage weeks.
- Personal data remains in the pilot deployment and is not silently uploaded to a new analytics service. Feedback is generated, previewed, and explicitly shared by the participant.
- Full/basic/minimal capture modes remain available; changing mode does not penalize the learner, only changes evidence confidence.
- Feedback is privacy-minimized and may be pseudonymous; never promise true anonymity for a 5–10 person known cohort.
- Every parameter change has a version and effective date; never rewrite historical projections silently.
- Installation pain is product data. Do not hide it by manually repairing every laptop without recording the cause.

## Planned Data Contracts

At Phase 6 kickoff, add a migration with semantic suffix `pilot_support.sql` only if existing event tables cannot represent the required local measurements; assign its prefix from merged history at that time.

Possible local-only tables:

- `app_usage_events`: launch, today-viewed, effort-boundary selected, task-started/completed/replaced/skipped, plan revised, backup/restore outcome—no raw code/content;
- `model_parameter_versions`: planner/mastery/review parameter set, rationale, effective date;
- `feedback_exports`: generated time, included categories, schema version, checksum, never automatic upload;
- `data_backup_history`: backup path label, schema/app version, checksum, result.
- `pilot_measurements`: participant-local aggregate for weekly effective sessions, core-plan completion, stage goals, verifiable node changes, recommendation comprehension and connector correction rate.

Release and support modules:

- `lib/data/backup.ts`
- `lib/data/restore.ts`
- `lib/data/feedbackExport.ts`
- `lib/services/localUsageMetrics.ts`
- `scripts/windows/setup.ps1`
- `scripts/windows/start.ps1`
- `scripts/windows/diagnose.ps1`
- `docs/pilot/windows-setup.md`
- `docs/pilot/participant-guide.md`
- `docs/pilot/support-runbook.md`

## Work Packages

### 6.1 Backup, restore, and migration rehearsal

- [ ] Test consistent SQLite backup, manifest/checksum, schema/app compatibility, interrupted backup, invalid archive, restore dry-run, and rollback to the pre-restore database.
- [ ] Add user-triggered backup/export and restore with an automatic safety backup.
- [ ] Rehearse upgrade and restore using a copy of realistic data, never the only user database.

### 6.2 Windows setup and launcher

- [ ] Build a repeatable PowerShell setup/start/diagnose path for supported Windows versions and document Node/browser prerequisites.
- [ ] Produce the browser and VS Code extension packages and verify Chrome/Edge/VS Code installation steps.
- [ ] Test clean install, upgrade, uninstall-with-data-preservation, occupied port, missing browser/compiler/editor, restricted execution policy, and domestic dependency access.
- [ ] Defer Electron/installer work until setup observation proves scripts are insufficient.

### 6.3 Local diagnostics and support bundle

- [ ] Add a local diagnostics screen/command for app version, schema version, content package version, provider enabled state, extension reachability, and recent non-sensitive errors.
- [ ] Redact keys, paths, code, reflections, problem content, and personal identifiers.
- [ ] Create a support runbook that starts with read-only checks and protects the database before repair.

### 6.4 Manual feedback export and metrics

- [ ] Define a versioned, inspectable JSON feedback package containing aggregate friction and learning signals only; label it privacy-minimized/pseudonymous rather than anonymous.
- [ ] Let participants deselect categories and preview every field before export.
- [ ] Calculate time-to-first-task, weekly effective sessions, core-plan completion, starts/completions/replacements/skips, review lateness, verified node changes, transfer/project evidence, wheel-spinning, over-practice, connector corrections, recommendation comprehension and resource failures locally.
- [ ] Never add an upload endpoint or background analytics call.

### 6.5 Four-week pilot operation

- [ ] Recruit 5–10 participants with recorded consent and baseline skill/goal notes stored outside product data as appropriate.
- [ ] Run setup observation, week-1 friction interview, weekly lightweight check-in, one recommendation/level-explanation check, and final restore rehearsal/interview.
- [ ] Triage issues by data loss/security, blocked training, wrong recommendation, friction, and cosmetic priority.
- [ ] Freeze feature expansion during the pilot except for critical fixes and version every behavior change.

### 6.6 Calibration and Public Beta readiness decision

- [ ] Compare planner reasons with user actions, review outcomes, delayed retention, transfer, and project evidence.
- [ ] Tune only parameters supported by repeated observations; label small-sample changes as heuristic.
- [ ] Publish a pilot report with failures, limitations, parameter changes, product-hypothesis results and unresolved risks.
- [ ] Decide among: repeat V1 calibration, improve packaging/content/capture, or activate the Phase 7 Public Beta implementation plan. Cloud is the target direction, but a failed pilot blocks premature rollout.

## Verification Commands

Before every pilot release candidate:

```powershell
npm run test -- tests/unit/backup.test.ts tests/unit/restore.test.ts tests/unit/feedbackExport.test.ts tests/unit/localUsageMetrics.test.ts
npm run lint
npm run db:migrate
npm run test
npm run typecheck
npm run e2e
npm run extension:build
npm run build
```

Also execute the documented clean-Windows install, upgrade, backup, restore, occupied-port, and offline-provider manual checklist; these cannot be replaced by unit tests.

## Exit Gate

- [ ] At least 5 participants start; the target is at least 4 completing the full four-week observation.
- [ ] At least 4 of the first 5 clean installations succeed using the guide without source-code edits.
- [ ] There is zero unrecoverable training-data loss.
- [ ] Every participant completes one verified backup; completing participants perform one successful restore rehearsal.
- [ ] For each completing participant, record the composite experiment: weekly effective sessions, 60%–70% core-plan completion band, one stage goal, one verifiable node change and whether the user understood the reason. Report results separately rather than hiding them in one average.
- [ ] At least 60% of completing participants have three effective sessions in at least three of four weeks; interpret this as a release signal, not scientific proof.
- [ ] Median post-setup time from opening the app to starting the primary task is measured and is no more than three minutes.
- [ ] Feedback exports are explicit, previewable, redacted, and contain no key, raw code, reflection text, full problem statement, absolute local path or unrelated workspace data.
- [ ] Every calibration change has a version, rationale, before/after evidence, and rollback path.
- [ ] Critical data/security defects are zero at pilot close; unresolved lower-severity issues are documented.
- [ ] A written readiness decision either activates Phase 7 or records the exact V1 evidence gaps that block it.

## Risks and Controls

- **Small-sample overfitting:** treat results as usability and heuristic evidence, not universal learning science.
- **Windows setup burden:** observe first, then choose scripts, packaged runtime, or installer based on evidence.
- **Support damaging data:** backup before repair, read-only diagnosis first, and tested restore rollback.
- **Covert telemetry drift:** no unannounced analytics destination; participant controls every feedback export and pilot consent.
- **Feature churn during observation:** release freeze and versioned critical fixes preserve interpretability.
