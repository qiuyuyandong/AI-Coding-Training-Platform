CREATE TABLE ai_request_lifecycle (
  request_key TEXT PRIMARY KEY,
  learner_id TEXT NOT NULL REFERENCES learner_profiles(id),
  request_kind TEXT NOT NULL CHECK (request_kind IN ('coach_report', 'plan_proposal')),
  input_fingerprint TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending', 'completed')),
  quota_charged INTEGER NOT NULL CHECK (quota_charged IN (0, 1)),
  created_at TEXT NOT NULL,
  completed_at TEXT
);

INSERT INTO ai_request_lifecycle (
  request_key, learner_id, request_kind, input_fingerprint,
  status, quota_charged, created_at, completed_at
)
SELECT ledger.request_key, ledger.learner_id, ledger.request_kind, ledger.input_fingerprint,
  CASE WHEN audit.request_key IS NULL THEN 'pending' ELSE 'completed' END,
  1, ledger.created_at,
  CASE WHEN audit.request_key IS NULL THEN NULL ELSE audit.created_at END
FROM ai_quota_ledger ledger
LEFT JOIN ai_request_audit audit ON audit.request_key = ledger.request_key;

INSERT OR IGNORE INTO ai_request_lifecycle (
  request_key, learner_id, request_kind, input_fingerprint,
  status, quota_charged, created_at, completed_at
)
SELECT request_key, learner_id, request_kind, input_fingerprint,
  'completed', charged, created_at, created_at
FROM ai_request_audit;

INSERT OR IGNORE INTO ai_request_lifecycle (
  request_key, learner_id, request_kind, input_fingerprint,
  status, quota_charged, created_at, completed_at
)
SELECT request_key, learner_id, 'coach_report', input_fingerprint,
  'completed', 0, created_at, created_at
FROM ai_coach_reports;

INSERT OR IGNORE INTO ai_request_lifecycle (
  request_key, learner_id, request_kind, input_fingerprint,
  status, quota_charged, created_at, completed_at
)
SELECT request_key, learner_id, 'plan_proposal', input_fingerprint,
  'completed', 0, created_at, created_at
FROM ai_plan_change_proposals;

CREATE INDEX idx_ai_request_lifecycle_learner_status
  ON ai_request_lifecycle(learner_id, status, created_at);
