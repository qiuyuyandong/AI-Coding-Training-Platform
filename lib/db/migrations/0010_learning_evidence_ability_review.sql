CREATE TABLE IF NOT EXISTS learning_evidence_events (
  id TEXT PRIMARY KEY,
  learner_id TEXT NOT NULL REFERENCES learner_profiles(id),
  source_type TEXT NOT NULL CHECK (source_type IN ('attempt', 'project')),
  source_id TEXT NOT NULL,
  event_type TEXT NOT NULL CHECK (event_type IN ('result', 'assistance', 'snapshot', 'run', 'test', 'reflection', 'correction', 'milestone')),
  occurred_at TEXT NOT NULL,
  facts_json TEXT NOT NULL,
  provenance_json TEXT NOT NULL,
  schema_version TEXT NOT NULL,
  parser_version TEXT NOT NULL,
  confidence TEXT NOT NULL CHECK (confidence IN ('low', 'medium', 'high')),
  supersedes_event_id TEXT REFERENCES learning_evidence_events(id),
  idempotency_key TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS evidence_node_mappings (
  evidence_event_id TEXT NOT NULL REFERENCES learning_evidence_events(id),
  node_id TEXT NOT NULL REFERENCES knowledge_nodes(id),
  role TEXT NOT NULL CHECK (role IN ('primary', 'supporting')),
  strength INTEGER NOT NULL CHECK (strength BETWEEN 1 AND 100),
  mapping_reason TEXT NOT NULL,
  PRIMARY KEY (evidence_event_id, node_id)
);

CREATE TABLE IF NOT EXISTS training_session_summaries (
  id TEXT PRIMARY KEY,
  learner_id TEXT NOT NULL REFERENCES learner_profiles(id),
  source_type TEXT NOT NULL CHECK (source_type IN ('attempt', 'project')),
  source_id TEXT NOT NULL,
  outcome TEXT NOT NULL CHECK (outcome IN ('independent_effective_completion', 'assisted_effective_completion', 'productive_struggle', 'unproductive_trial_and_error', 'insufficient_evidence')),
  coverage_level TEXT NOT NULL CHECK (coverage_level IN ('E1', 'E2', 'E3', 'E4')),
  confidence TEXT NOT NULL CHECK (confidence IN ('low', 'medium', 'high')),
  reason_codes_json TEXT NOT NULL,
  unresolved_facts_json TEXT NOT NULL,
  evidence_event_ids_json TEXT NOT NULL,
  classifier_version TEXT NOT NULL,
  input_fingerprint TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE (learner_id, source_type, source_id, classifier_version, input_fingerprint)
);

CREATE TABLE IF NOT EXISTS code_snapshot_refs (
  id TEXT PRIMARY KEY,
  learner_id TEXT NOT NULL REFERENCES learner_profiles(id),
  source_type TEXT NOT NULL CHECK (source_type IN ('attempt', 'project')),
  source_id TEXT NOT NULL,
  event_kind TEXT NOT NULL CHECK (event_kind IN ('run', 'submit', 'test', 'checkpoint', 'accepted')),
  capture_mode TEXT NOT NULL CHECK (capture_mode IN ('full', 'basic', 'minimal')),
  content_hash TEXT NOT NULL,
  language TEXT,
  byte_size INTEGER NOT NULL CHECK (byte_size >= 0),
  storage_path TEXT,
  diff_features_json TEXT NOT NULL,
  captured_at TEXT NOT NULL,
  retention_expires_at TEXT,
  deleted_at TEXT,
  idempotency_key TEXT NOT NULL UNIQUE,
  CHECK ((capture_mode = 'full' AND storage_path IS NOT NULL) OR (capture_mode <> 'full' AND storage_path IS NULL))
);

CREATE TABLE IF NOT EXISTS review_items (
  id TEXT PRIMARY KEY,
  learner_id TEXT NOT NULL REFERENCES learner_profiles(id),
  node_id TEXT NOT NULL REFERENCES knowledge_nodes(id),
  purpose TEXT NOT NULL CHECK (purpose IN ('refresh', 'variant', 'transfer', 'prerequisite_check')),
  due_at TEXT NOT NULL,
  priority INTEGER NOT NULL CHECK (priority BETWEEN 0 AND 100),
  selected_practice_task_id TEXT REFERENCES practice_tasks(id),
  scheduler_version TEXT NOT NULL,
  source_summary_id TEXT NOT NULL REFERENCES training_session_summaries(id),
  reason_codes_json TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('open', 'completed', 'cancelled')),
  created_at TEXT NOT NULL,
  completed_at TEXT
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_review_items_open_source_node
  ON review_items(source_summary_id, node_id, purpose) WHERE status = 'open';

CREATE TABLE IF NOT EXISTS learner_assessments (
  id TEXT PRIMARY KEY,
  learner_id TEXT NOT NULL REFERENCES learner_profiles(id),
  node_id TEXT NOT NULL REFERENCES knowledge_nodes(id),
  kind TEXT NOT NULL CHECK (kind IN ('self_rating', 'dispute')),
  rating TEXT CHECK (rating IN ('unassessed', 'L1', 'L2', 'L3', 'L4', 'L5')),
  reason TEXT,
  ability_input_fingerprint TEXT,
  resolution TEXT NOT NULL CHECK (resolution IN ('pending_verification', 'accepted_as_context', 'resolved_by_evidence')),
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS misconception_signals (
  id TEXT PRIMARY KEY,
  learner_id TEXT NOT NULL REFERENCES learner_profiles(id),
  source_summary_id TEXT NOT NULL REFERENCES training_session_summaries(id),
  category TEXT NOT NULL,
  evidence_event_ids_json TEXT NOT NULL,
  confidence TEXT NOT NULL CHECK (confidence IN ('low', 'medium', 'high')),
  created_at TEXT NOT NULL,
  UNIQUE (source_summary_id, category)
);

CREATE INDEX IF NOT EXISTS idx_learning_evidence_source ON learning_evidence_events(learner_id, source_type, source_id, occurred_at);
CREATE INDEX IF NOT EXISTS idx_evidence_node_mappings_node ON evidence_node_mappings(node_id, role);
CREATE INDEX IF NOT EXISTS idx_training_summaries_source ON training_session_summaries(learner_id, source_type, source_id, created_at);
CREATE INDEX IF NOT EXISTS idx_snapshot_refs_source ON code_snapshot_refs(learner_id, source_type, source_id, captured_at);
CREATE INDEX IF NOT EXISTS idx_review_items_due ON review_items(learner_id, status, due_at, priority);
CREATE INDEX IF NOT EXISTS idx_learner_assessments_node ON learner_assessments(learner_id, node_id, created_at);
