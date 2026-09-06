CREATE TABLE evidence_ability_transitions (
  id TEXT PRIMARY KEY,
  learner_id TEXT NOT NULL REFERENCES learner_profiles(id),
  node_id TEXT NOT NULL REFERENCES knowledge_nodes(id),
  previous_level TEXT NOT NULL CHECK (previous_level IN ('unassessed', 'L1', 'L2', 'L3', 'L4', 'L5')),
  new_level TEXT NOT NULL CHECK (new_level IN ('unassessed', 'L1', 'L2', 'L3', 'L4', 'L5')),
  reason_codes_json TEXT NOT NULL,
  source_summary_ids_json TEXT NOT NULL,
  source_evidence_ids_json TEXT NOT NULL,
  input_fingerprint TEXT NOT NULL,
  projection_version TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE (learner_id, node_id, input_fingerprint, projection_version)
);

CREATE INDEX idx_evidence_ability_transitions_node
  ON evidence_ability_transitions(learner_id, node_id, created_at);
