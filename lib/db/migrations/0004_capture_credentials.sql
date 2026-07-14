CREATE TABLE training_sessions_v3 (
  id TEXT PRIMARY KEY,
  installation_id TEXT NOT NULL,
  platform TEXT NOT NULL,
  problem_external_id TEXT NOT NULL,
  problem_title TEXT NOT NULL,
  canonical_url TEXT NOT NULL,
  provenance_level TEXT NOT NULL CHECK (provenance_level IN ('extension_unpaired', 'extension_paired')),
  started_at TEXT NOT NULL,
  ended_at TEXT,
  end_reason TEXT CHECK (end_reason IN ('pagehide', 'spa_navigation', 'capture_disabled')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CHECK ((ended_at IS NULL AND end_reason IS NULL) OR (ended_at IS NOT NULL AND end_reason IS NOT NULL))
);

INSERT INTO training_sessions_v3 SELECT * FROM training_sessions;

CREATE TABLE capture_events_v3 (
  id TEXT PRIMARY KEY,
  schema_version INTEGER NOT NULL CHECK (schema_version = 2),
  type TEXT NOT NULL CHECK (type IN ('SESSION_STARTED', 'SUBMISSION_OBSERVED', 'VERDICT_OBSERVED', 'SESSION_ENDED')),
  capture_session_id TEXT NOT NULL,
  submission_id TEXT,
  installation_id TEXT NOT NULL,
  adapter_version TEXT NOT NULL,
  parser_version TEXT NOT NULL,
  page_origin TEXT NOT NULL,
  provenance_level TEXT NOT NULL CHECK (provenance_level IN ('extension_unpaired', 'extension_paired')),
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

INSERT INTO capture_events_v3 SELECT * FROM capture_events;

CREATE TABLE training_attempts_v3 (
  id TEXT PRIMARY KEY,
  capture_session_id TEXT NOT NULL REFERENCES training_sessions_v3(id),
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

INSERT INTO training_attempts_v3 SELECT * FROM training_attempts;

DROP TABLE training_attempts;
DROP TABLE capture_events;
DROP TABLE training_sessions;

ALTER TABLE training_sessions_v3 RENAME TO training_sessions;
ALTER TABLE capture_events_v3 RENAME TO capture_events;
ALTER TABLE training_attempts_v3 RENAME TO training_attempts;

CREATE INDEX idx_capture_events_session_time
  ON capture_events(capture_session_id, occurred_at);
CREATE INDEX idx_training_attempts_session_time
  ON training_attempts(capture_session_id, started_at);
CREATE INDEX idx_training_attempts_problem_updated
  ON training_attempts(platform, problem_external_id, updated_at);
CREATE INDEX idx_training_sessions_end
  ON training_sessions(ended_at, updated_at);

CREATE TABLE capture_installations (
  installation_id TEXT PRIMARY KEY,
  credential_hash TEXT NOT NULL UNIQUE CHECK (length(credential_hash) = 64),
  credential_version INTEGER NOT NULL CHECK (credential_version > 0),
  status TEXT NOT NULL CHECK (status IN ('active', 'revoked')),
  created_at TEXT NOT NULL,
  rotated_at TEXT,
  revoked_at TEXT,
  last_seen_at TEXT,
  CHECK (
    (status = 'active' AND revoked_at IS NULL)
    OR (status = 'revoked' AND revoked_at IS NOT NULL)
  )
);

CREATE TABLE capture_pairing_codes (
  id TEXT PRIMARY KEY,
  code_hash TEXT NOT NULL UNIQUE CHECK (length(code_hash) = 64),
  target_installation_id TEXT REFERENCES capture_installations(installation_id),
  expires_at TEXT NOT NULL,
  consumed_at TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX idx_capture_pairing_codes_expiry
  ON capture_pairing_codes(expires_at, consumed_at);
CREATE INDEX idx_capture_installations_status
  ON capture_installations(status, last_seen_at);
