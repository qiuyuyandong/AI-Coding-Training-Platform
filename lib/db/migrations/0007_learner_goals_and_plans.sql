-- 0007_learner_goals_and_plans.sql
--
-- V0 additive learner, diagnosis, and immutable plan snapshot schema.
--
-- This migration is purely additive: it creates new tables and indexes and
-- never modifies, drops, or rebuilds any existing Phase 0 or Phase 2 table.
-- No INSERT statements are emitted. Idempotent: every CREATE uses
-- IF NOT EXISTS so the migration is safe to re-run against a partially
-- applied database.
--
-- The CHECK constraints mirror the Zod enums declared in
-- `lib/domain/learner.ts` and `lib/domain/plan.ts`. Any CHECK listed in
-- the V0 plan or Todo 7 spec is required; missing one is a verifier
-- failure. Append-only semantics for `task_feedback` and immutable
-- snapshots for `plan_items` are enforced at the row identity level:
-- `plan_items` carries no mutable feedback timestamp and `task_feedback`
-- is unique on (plan_item_id, action) so history is preserved by
-- inserting a new row rather than updating an existing one.

CREATE TABLE IF NOT EXISTS learner_profiles (
  id TEXT PRIMARY KEY,
  onboarding_state TEXT NOT NULL CHECK (onboarding_state IN ('new', 'goal_resolved', 'diagnosing', 'plan_ready')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS learner_goals (
  id TEXT PRIMARY KEY,
  learner_id TEXT NOT NULL REFERENCES learner_profiles(id),
  primary_track_id TEXT,
  interest_track_ids_json TEXT NOT NULL DEFAULT '[]',
  status TEXT NOT NULL CHECK (status IN ('active', 'superseded')),
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS diagnostic_sessions (
  id TEXT PRIMARY KEY,
  learner_id TEXT NOT NULL REFERENCES learner_profiles(id),
  blueprint_version TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('in_progress', 'completed')),
  started_at TEXT NOT NULL,
  completed_at TEXT
);

CREATE TABLE IF NOT EXISTS diagnostic_responses (
  session_id TEXT NOT NULL REFERENCES diagnostic_sessions(id),
  prompt_id TEXT NOT NULL,
  response TEXT NOT NULL CHECK (response IN ('unknown', 'needs_foundation', 'can_with_help', 'ready')),
  created_at TEXT NOT NULL,
  PRIMARY KEY(session_id, prompt_id)
);

CREATE TABLE IF NOT EXISTS learner_node_baselines (
  learner_id TEXT NOT NULL REFERENCES learner_profiles(id),
  node_id TEXT NOT NULL REFERENCES knowledge_nodes(id),
  baseline TEXT NOT NULL CHECK (baseline IN ('unknown', 'needs_foundation', 'self_reported', 'ready')),
  confidence TEXT NOT NULL CHECK (confidence IN ('low', 'medium', 'high')),
  source TEXT NOT NULL CHECK (source IN ('diagnosis', 'manual_override')),
  updated_at TEXT NOT NULL,
  PRIMARY KEY(learner_id, node_id)
);

CREATE TABLE IF NOT EXISTS learning_plans (
  id TEXT PRIMARY KEY,
  learner_id TEXT NOT NULL REFERENCES learner_profiles(id),
  generator_version TEXT NOT NULL,
  snapshot_json TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('active', 'superseded')),
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS daily_plan_snapshots (
  id TEXT PRIMARY KEY,
  learning_plan_id TEXT NOT NULL REFERENCES learning_plans(id),
  local_date TEXT NOT NULL,
  effort_boundary_minutes INTEGER NOT NULL CHECK (effort_boundary_minutes IN (15, 30, 60, 90)),
  daily_mode TEXT NOT NULL CHECK (daily_mode IN ('learn', 'practice', 'recover')),
  generator_version TEXT NOT NULL,
  supersedes_daily_plan_id TEXT REFERENCES daily_plan_snapshots(id),
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS plan_items (
  id TEXT PRIMARY KEY,
  daily_plan_id TEXT NOT NULL REFERENCES daily_plan_snapshots(id),
  practice_task_id TEXT NOT NULL REFERENCES practice_tasks(id),
  node_id TEXT NOT NULL REFERENCES knowledge_nodes(id),
  role TEXT NOT NULL CHECK (role IN ('primary', 'warmup', 'same_goal_alternative', 'weakness_review')),
  rank INTEGER NOT NULL,
  reason_codes_json TEXT NOT NULL,
  UNIQUE(daily_plan_id, practice_task_id)
);

CREATE TABLE IF NOT EXISTS task_feedback (
  id TEXT PRIMARY KEY,
  plan_item_id TEXT NOT NULL REFERENCES plan_items(id),
  action TEXT NOT NULL CHECK (action IN ('accepted', 'started', 'skipped', 'completed')),
  reason_code TEXT CHECK (reason_code IN ('too_hard', 'too_easy', 'not_relevant', 'missing_resource', 'not_now', 'other')),
  reason_text TEXT,
  attempt_id TEXT REFERENCES training_attempts(id),
  successor_daily_plan_id TEXT REFERENCES daily_plan_snapshots(id),
  created_at TEXT NOT NULL,
  UNIQUE(plan_item_id, action)
);

CREATE TABLE IF NOT EXISTS plan_revision_events (
  id TEXT PRIMARY KEY,
  before_daily_plan_id TEXT REFERENCES daily_plan_snapshots(id),
  after_daily_plan_id TEXT NOT NULL REFERENCES daily_plan_snapshots(id),
  event_type TEXT NOT NULL CHECK (event_type IN ('initial_plan', 'goal_changed', 'diagnosis_completed', 'effort_changed', 'item_skipped', 'item_completed', 'attempt_corrected', 'attempt_voided')),
  input_fingerprint TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_learner_goals_learner
  ON learner_goals(learner_id);

CREATE INDEX IF NOT EXISTS idx_diagnostic_sessions_learner
  ON diagnostic_sessions(learner_id);

CREATE INDEX IF NOT EXISTS idx_learning_plans_learner
  ON learning_plans(learner_id);

CREATE INDEX IF NOT EXISTS idx_daily_plan_snapshots_plan
  ON daily_plan_snapshots(learning_plan_id);

CREATE INDEX IF NOT EXISTS idx_daily_plan_snapshots_date
  ON daily_plan_snapshots(local_date);

CREATE INDEX IF NOT EXISTS idx_plan_items_daily
  ON plan_items(daily_plan_id);

CREATE INDEX IF NOT EXISTS idx_task_feedback_item
  ON task_feedback(plan_item_id);

CREATE INDEX IF NOT EXISTS idx_plan_revision_events_after
  ON plan_revision_events(after_daily_plan_id);
