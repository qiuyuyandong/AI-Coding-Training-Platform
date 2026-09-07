CREATE TABLE pilot_support_preferences (
  learner_id TEXT PRIMARY KEY REFERENCES learner_profiles(id),
  metrics_enabled INTEGER NOT NULL CHECK (metrics_enabled IN (0, 1)),
  updated_at TEXT NOT NULL
);

CREATE TABLE pilot_support_events (
  id TEXT PRIMARY KEY,
  learner_id TEXT NOT NULL REFERENCES learner_profiles(id),
  event_type TEXT NOT NULL CHECK (event_type IN (
    'app_started', 'backup_completed', 'restore_completed',
    'diagnosis_run', 'feedback_exported'
  )),
  metric_value INTEGER NOT NULL CHECK (metric_value >= 0),
  occurred_at TEXT NOT NULL
);

CREATE INDEX idx_pilot_support_events_learner
  ON pilot_support_events(learner_id, event_type, occurred_at);
