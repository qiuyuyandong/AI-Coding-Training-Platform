-- codex-migration: foreign-keys-off

CREATE TABLE daily_plan_snapshots_v2 (
  id TEXT PRIMARY KEY,
  learning_plan_id TEXT NOT NULL REFERENCES learning_plans(id),
  local_date TEXT NOT NULL,
  effort_boundary_minutes INTEGER NOT NULL CHECK (effort_boundary_minutes IN (15, 30, 60, 90)),
  daily_mode TEXT NOT NULL CHECK (daily_mode IN ('learn', 'review', 'practice', 'build', 'recover')),
  generator_version TEXT NOT NULL,
  supersedes_daily_plan_id TEXT REFERENCES daily_plan_snapshots_v2(id),
  created_at TEXT NOT NULL
);

CREATE TABLE plan_items_v2 (
  id TEXT PRIMARY KEY,
  daily_plan_id TEXT NOT NULL REFERENCES daily_plan_snapshots_v2(id),
  practice_task_id TEXT NOT NULL REFERENCES practice_tasks(id),
  node_id TEXT NOT NULL REFERENCES knowledge_nodes(id),
  role TEXT NOT NULL CHECK (role IN ('primary', 'warmup', 'same_goal_alternative', 'weakness_review')),
  rank INTEGER NOT NULL,
  reason_codes_json TEXT NOT NULL,
  UNIQUE(daily_plan_id, practice_task_id)
);

CREATE TABLE task_feedback_v2 (
  id TEXT PRIMARY KEY,
  plan_item_id TEXT NOT NULL REFERENCES plan_items_v2(id),
  action TEXT NOT NULL CHECK (action IN ('accepted', 'started', 'skipped', 'completed')),
  reason_code TEXT CHECK (reason_code IN ('too_hard', 'too_easy', 'not_relevant', 'missing_resource', 'not_now', 'other')),
  reason_text TEXT,
  attempt_id TEXT REFERENCES training_attempts(id),
  successor_daily_plan_id TEXT REFERENCES daily_plan_snapshots_v2(id),
  created_at TEXT NOT NULL,
  UNIQUE(plan_item_id, action)
);

CREATE TABLE plan_revision_events_v2 (
  id TEXT PRIMARY KEY,
  before_daily_plan_id TEXT REFERENCES daily_plan_snapshots_v2(id),
  after_daily_plan_id TEXT NOT NULL REFERENCES daily_plan_snapshots_v2(id),
  event_type TEXT NOT NULL CHECK (event_type IN ('initial_plan', 'goal_changed', 'diagnosis_completed', 'effort_changed', 'mode_changed', 'item_skipped', 'item_completed', 'attempt_corrected', 'attempt_voided')),
  input_fingerprint TEXT NOT NULL,
  created_at TEXT NOT NULL
);

INSERT INTO daily_plan_snapshots_v2 SELECT * FROM daily_plan_snapshots;
INSERT INTO plan_items_v2 SELECT * FROM plan_items;
INSERT INTO task_feedback_v2 SELECT * FROM task_feedback;
INSERT INTO plan_revision_events_v2 SELECT * FROM plan_revision_events;

DROP TABLE task_feedback;
DROP TABLE plan_revision_events;
DROP TABLE plan_items;
DROP TABLE daily_plan_snapshots;

ALTER TABLE daily_plan_snapshots_v2 RENAME TO daily_plan_snapshots;
ALTER TABLE plan_items_v2 RENAME TO plan_items;
ALTER TABLE task_feedback_v2 RENAME TO task_feedback;
ALTER TABLE plan_revision_events_v2 RENAME TO plan_revision_events;

CREATE INDEX idx_daily_plan_snapshots_plan ON daily_plan_snapshots(learning_plan_id);
CREATE INDEX idx_daily_plan_snapshots_date ON daily_plan_snapshots(local_date);
CREATE INDEX idx_plan_items_daily ON plan_items(daily_plan_id);
CREATE INDEX idx_task_feedback_item ON task_feedback(plan_item_id);
CREATE INDEX idx_plan_revision_events_after ON plan_revision_events(after_daily_plan_id);
