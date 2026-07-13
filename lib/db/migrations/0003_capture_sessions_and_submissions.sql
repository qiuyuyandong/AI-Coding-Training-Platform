DROP TABLE IF EXISTS training_attempts;
DROP TABLE IF EXISTS capture_events;
DROP TABLE IF EXISTS training_sessions;

CREATE TABLE training_sessions (
  id TEXT PRIMARY KEY,
  installation_id TEXT NOT NULL,
  platform TEXT NOT NULL,
  problem_external_id TEXT NOT NULL,
  problem_title TEXT NOT NULL,
  canonical_url TEXT NOT NULL,
  provenance_level TEXT NOT NULL CHECK (provenance_level = 'extension_unpaired'),
  started_at TEXT NOT NULL,
  ended_at TEXT,
  end_reason TEXT CHECK (end_reason IN ('pagehide', 'spa_navigation', 'capture_disabled')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CHECK ((ended_at IS NULL AND end_reason IS NULL) OR (ended_at IS NOT NULL AND end_reason IS NOT NULL))
);

CREATE TABLE capture_events (
  id TEXT PRIMARY KEY,
  schema_version INTEGER NOT NULL CHECK (schema_version = 2),
  type TEXT NOT NULL CHECK (type IN ('SESSION_STARTED', 'SUBMISSION_OBSERVED', 'VERDICT_OBSERVED', 'SESSION_ENDED')),
  capture_session_id TEXT NOT NULL,
  submission_id TEXT,
  installation_id TEXT NOT NULL,
  adapter_version TEXT NOT NULL,
  parser_version TEXT NOT NULL,
  page_origin TEXT NOT NULL,
  provenance_level TEXT NOT NULL CHECK (provenance_level = 'extension_unpaired'),
  platform TEXT NOT NULL,
  problem_external_id TEXT NOT NULL,
  problem_title TEXT NOT NULL,
  canonical_url TEXT NOT NULL,
  occurred_at TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  event_fingerprint TEXT NOT NULL,
  received_at TEXT NOT NULL,
  CHECK (
    (type IN ('SUBMISSION_OBSERVED', 'VERDICT_OBSERVED') AND submission_id IS NOT NULL)
    OR (type IN ('SESSION_STARTED', 'SESSION_ENDED') AND submission_id IS NULL)
  )
);

CREATE TABLE training_attempts (
  id TEXT PRIMARY KEY,
  capture_session_id TEXT NOT NULL REFERENCES training_sessions(id),
  submission_id TEXT NOT NULL UNIQUE,
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
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX idx_capture_events_session_time
  ON capture_events(capture_session_id, occurred_at);
CREATE INDEX idx_training_attempts_session_time
  ON training_attempts(capture_session_id, started_at);
CREATE INDEX idx_training_attempts_problem_updated
  ON training_attempts(platform, problem_external_id, updated_at);
CREATE INDEX idx_training_sessions_end
  ON training_sessions(ended_at, updated_at);
