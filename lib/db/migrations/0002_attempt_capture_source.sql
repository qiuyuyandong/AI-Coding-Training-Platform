ALTER TABLE training_attempts ADD COLUMN source_event_id TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_training_attempts_source_event_id
  ON training_attempts(source_event_id)
  WHERE source_event_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_training_attempts_problem_open
  ON training_attempts(platform, problem_external_id, result, updated_at);