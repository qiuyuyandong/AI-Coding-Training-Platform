CREATE TABLE ai_coach_preferences (
  learner_id TEXT PRIMARY KEY REFERENCES learner_profiles(id),
  mode TEXT NOT NULL CHECK (mode IN ('disabled', 'on_demand')),
  allowed_context_json TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE ai_quota_ledger (
  id TEXT PRIMARY KEY,
  learner_id TEXT NOT NULL REFERENCES learner_profiles(id),
  request_kind TEXT NOT NULL CHECK (request_kind IN ('coach_report', 'plan_proposal')),
  request_key TEXT NOT NULL UNIQUE,
  units INTEGER NOT NULL CHECK (units = 1),
  created_at TEXT NOT NULL
);

CREATE TABLE ai_request_audit (
  id TEXT PRIMARY KEY,
  learner_id TEXT NOT NULL REFERENCES learner_profiles(id),
  request_kind TEXT NOT NULL CHECK (request_kind IN ('coach_report', 'plan_proposal')),
  request_key TEXT NOT NULL UNIQUE,
  mode TEXT NOT NULL CHECK (mode IN ('disabled', 'on_demand')),
  context_categories_json TEXT NOT NULL,
  provider_status TEXT NOT NULL CHECK (provider_status IN ('ai', 'fallback')),
  error_code TEXT,
  charged INTEGER NOT NULL CHECK (charged IN (0, 1)),
  created_at TEXT NOT NULL
);

CREATE TABLE ai_coach_reports (
  id TEXT PRIMARY KEY,
  learner_id TEXT NOT NULL REFERENCES learner_profiles(id),
  request_key TEXT NOT NULL UNIQUE,
  report_json TEXT NOT NULL,
  evidence_ids_json TEXT NOT NULL,
  provider_status TEXT NOT NULL CHECK (provider_status IN ('ai', 'fallback')),
  created_at TEXT NOT NULL,
  deleted_at TEXT
);

CREATE TABLE ai_plan_change_proposals (
  id TEXT PRIMARY KEY,
  learner_id TEXT NOT NULL REFERENCES learner_profiles(id),
  learning_plan_id TEXT NOT NULL REFERENCES learning_plans(id),
  before_daily_plan_id TEXT NOT NULL REFERENCES daily_plan_snapshots(id),
  request_key TEXT NOT NULL UNIQUE,
  proposal_json TEXT NOT NULL,
  evidence_ids_json TEXT NOT NULL,
  provider_status TEXT NOT NULL CHECK (provider_status IN ('ai', 'fallback')),
  status TEXT NOT NULL CHECK (status IN ('pending', 'accepted', 'rejected')),
  created_at TEXT NOT NULL,
  decided_at TEXT,
  successor_daily_plan_id TEXT REFERENCES daily_plan_snapshots(id)
);

CREATE INDEX idx_ai_reports_learner ON ai_coach_reports(learner_id, created_at);
CREATE INDEX idx_ai_proposals_learner ON ai_plan_change_proposals(learner_id, created_at);
CREATE INDEX idx_ai_quota_learner_day ON ai_quota_ledger(learner_id, created_at);
