-- codex-migration: foreign-keys-off
-- Route H: keep historical provenance values byte-for-byte and add the
-- installation-level local provenance. Authentication metadata moves out of
-- the Vault, so the pairing/installations tables are deliberately removed.

CREATE TABLE training_sessions_route_h (
  id TEXT PRIMARY KEY,
  installation_id TEXT NOT NULL,
  platform TEXT NOT NULL,
  problem_external_id TEXT NOT NULL,
  problem_title TEXT NOT NULL,
  canonical_url TEXT NOT NULL,
  provenance_level TEXT NOT NULL CHECK (provenance_level IN (
    'extension_unpaired', 'extension_paired', 'extension_local'
  )),
  started_at TEXT NOT NULL,
  ended_at TEXT,
  end_reason TEXT CHECK (end_reason IN ('pagehide', 'spa_navigation', 'capture_disabled')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CHECK ((ended_at IS NULL AND end_reason IS NULL) OR (ended_at IS NOT NULL AND end_reason IS NOT NULL))
);

INSERT INTO training_sessions_route_h (
  id, installation_id, platform, problem_external_id, problem_title,
  canonical_url, provenance_level, started_at, ended_at, end_reason,
  created_at, updated_at
)
SELECT
  id, installation_id, platform, problem_external_id, problem_title,
  canonical_url, provenance_level, started_at, ended_at, end_reason,
  created_at, updated_at
FROM training_sessions;

DROP TABLE training_sessions;
ALTER TABLE training_sessions_route_h RENAME TO training_sessions;

CREATE TABLE capture_events_route_h (
  id TEXT PRIMARY KEY,
  schema_version INTEGER NOT NULL CHECK (schema_version = 2),
  type TEXT NOT NULL CHECK (type IN ('SESSION_STARTED', 'SUBMISSION_OBSERVED', 'VERDICT_OBSERVED', 'SESSION_ENDED')),
  capture_session_id TEXT NOT NULL,
  submission_id TEXT,
  installation_id TEXT NOT NULL,
  adapter_version TEXT NOT NULL,
  parser_version TEXT NOT NULL,
  page_origin TEXT NOT NULL,
  provenance_level TEXT NOT NULL CHECK (provenance_level IN (
    'extension_unpaired', 'extension_paired', 'extension_local'
  )),
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

INSERT INTO capture_events_route_h (
  id, schema_version, type, capture_session_id, submission_id,
  installation_id, adapter_version, parser_version, page_origin,
  provenance_level, platform, problem_external_id, problem_title,
  canonical_url, occurred_at, payload_json, event_fingerprint, received_at
)
SELECT
  id, schema_version, type, capture_session_id, submission_id,
  installation_id, adapter_version, parser_version, page_origin,
  provenance_level, platform, problem_external_id, problem_title,
  canonical_url, occurred_at, payload_json, event_fingerprint, received_at
FROM capture_events;

DROP TABLE capture_events;
ALTER TABLE capture_events_route_h RENAME TO capture_events;

CREATE INDEX idx_capture_events_session_time
  ON capture_events(capture_session_id, occurred_at);
CREATE INDEX idx_training_sessions_end
  ON training_sessions(ended_at, updated_at);

DROP TABLE capture_pairing_codes;
DROP TABLE capture_installations;
