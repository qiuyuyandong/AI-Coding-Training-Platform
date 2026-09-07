ALTER TABLE learner_assessments ADD COLUMN idempotency_key TEXT;
CREATE UNIQUE INDEX idx_learner_assessments_idempotency
  ON learner_assessments(idempotency_key) WHERE idempotency_key IS NOT NULL;

CREATE TABLE project_session_completion_receipts (
  project_session_id TEXT PRIMARY KEY REFERENCES project_practice_sessions(id),
  input_fingerprint TEXT NOT NULL,
  result_json TEXT NOT NULL,
  completed_at TEXT NOT NULL
);
