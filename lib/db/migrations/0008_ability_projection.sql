-- 0008_ability_projection.sql
-- V0 minimal ability projection: current-state snapshot + append-only transitions.
-- Existing training_attempts and corrections are unchanged. No rows are auto-created
-- for legacy attempts; the projector handles missing mappings (Todo 14).

CREATE TABLE IF NOT EXISTS attempt_node_mappings (
  id TEXT PRIMARY KEY,
  attempt_id TEXT NOT NULL REFERENCES training_attempts(id),
  node_id TEXT NOT NULL REFERENCES knowledge_nodes(id),
  role TEXT NOT NULL CHECK (role IN ('primary', 'supporting')),
  mapping_reason TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE(attempt_id, node_id)
);

CREATE TABLE IF NOT EXISTS ability_snapshots (
  learner_id TEXT NOT NULL REFERENCES learner_profiles(id),
  node_id TEXT NOT NULL REFERENCES knowledge_nodes(id),
  visible_level TEXT NOT NULL CHECK (visible_level IN ('unassessed', 'L1', 'L2', 'L3', 'L4', 'L5')),
  confidence TEXT NOT NULL CHECK (confidence IN ('low', 'medium', 'high')),
  evidence_count INTEGER NOT NULL CHECK (evidence_count >= 0),
  stale INTEGER NOT NULL CHECK (stale IN (0, 1)),
  input_fingerprint TEXT NOT NULL,
  projection_version TEXT NOT NULL,
  as_of_time TEXT NOT NULL,
  PRIMARY KEY(learner_id, node_id)
);

CREATE TABLE IF NOT EXISTS ability_transitions (
  id TEXT PRIMARY KEY,
  learner_id TEXT NOT NULL REFERENCES learner_profiles(id),
  node_id TEXT NOT NULL REFERENCES knowledge_nodes(id),
  previous_level TEXT NOT NULL CHECK (previous_level IN ('unassessed', 'L1', 'L2', 'L3', 'L4', 'L5')),
  new_level TEXT NOT NULL CHECK (new_level IN ('unassessed', 'L1', 'L2', 'L3', 'L4', 'L5')),
  reason_codes_json TEXT NOT NULL,
  source_attempt_ids_json TEXT NOT NULL,
  source_attempt_revisions_json TEXT NOT NULL,
  input_fingerprint TEXT NOT NULL,
  projection_version TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE(learner_id, node_id, input_fingerprint, projection_version)
);

CREATE INDEX IF NOT EXISTS idx_attempt_node_mappings_attempt ON attempt_node_mappings(attempt_id);
CREATE INDEX IF NOT EXISTS idx_attempt_node_mappings_node ON attempt_node_mappings(node_id);
CREATE INDEX IF NOT EXISTS idx_ability_snapshots_learner ON ability_snapshots(learner_id);
CREATE INDEX IF NOT EXISTS idx_ability_transitions_learner ON ability_transitions(learner_id);
CREATE INDEX IF NOT EXISTS idx_ability_transitions_node ON ability_transitions(node_id);