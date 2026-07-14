CREATE TABLE training_attempts_v4 (
  id TEXT PRIMARY KEY,
  capture_session_id TEXT REFERENCES training_sessions(id),
  submission_id TEXT UNIQUE,
  record_source TEXT NOT NULL CHECK (record_source IN ('capture', 'manual')),
  platform TEXT NOT NULL,
  problem_external_id TEXT NOT NULL,
  problem_title TEXT NOT NULL,
  canonical_url TEXT NOT NULL,
  started_at TEXT NOT NULL,
  ended_at TEXT,
  result TEXT NOT NULL CHECK (result IN ('draft', 'passed', 'failed', 'partial', 'stuck')),
  verdict TEXT,
  language TEXT,
  duration_minutes INTEGER,
  reflection TEXT,
  submission_event_id TEXT,
  verdict_event_id TEXT,
  revision INTEGER NOT NULL DEFAULT 1 CHECK (revision > 0),
  voided_at TEXT,
  void_reason TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CHECK (ended_at IS NULL OR ended_at >= started_at),
  CHECK (
    (record_source = 'capture' AND capture_session_id IS NOT NULL AND submission_id IS NOT NULL)
    OR
    (record_source = 'manual' AND capture_session_id IS NULL AND submission_id IS NULL
      AND submission_event_id IS NULL AND verdict_event_id IS NULL AND verdict IS NULL)
  ),
  CHECK (
    (voided_at IS NULL AND void_reason IS NULL)
    OR (voided_at IS NOT NULL AND void_reason IS NOT NULL)
  )
);

INSERT INTO training_attempts_v4 (
  id, capture_session_id, submission_id, record_source, platform,
  problem_external_id, problem_title, canonical_url, started_at, ended_at,
  result, verdict, language, duration_minutes, reflection, submission_event_id,
  verdict_event_id, revision, voided_at, void_reason, created_at, updated_at
)
SELECT
  id, capture_session_id, submission_id, 'capture', platform,
  problem_external_id, problem_title, canonical_url, started_at, ended_at,
  result, verdict, language, duration_minutes, reflection, submission_event_id,
  verdict_event_id, 1, NULL, NULL, created_at, updated_at
FROM training_attempts;

DROP TABLE training_attempts;
ALTER TABLE training_attempts_v4 RENAME TO training_attempts;

CREATE INDEX idx_training_attempts_session_time
  ON training_attempts(capture_session_id, started_at);
CREATE INDEX idx_training_attempts_problem_updated
  ON training_attempts(platform, problem_external_id, updated_at);
CREATE INDEX idx_training_attempts_active_updated
  ON training_attempts(voided_at, updated_at);

CREATE TABLE attempt_corrections (
  correction_id TEXT NOT NULL,
  attempt_id TEXT NOT NULL REFERENCES training_attempts(id),
  field_name TEXT NOT NULL CHECK (field_name IN (
    'result', 'language', 'durationMinutes', 'reflection',
    'startedAt', 'endedAt', 'voidedAt'
  )),
  old_value TEXT,
  new_value TEXT,
  reason TEXT NOT NULL CHECK (length(reason) BETWEEN 1 AND 500),
  corrected_at TEXT NOT NULL,
  resulting_revision INTEGER NOT NULL CHECK (resulting_revision > 1),
  PRIMARY KEY (correction_id, field_name)
);

CREATE INDEX idx_attempt_corrections_attempt_time
  ON attempt_corrections(attempt_id, corrected_at, correction_id);
