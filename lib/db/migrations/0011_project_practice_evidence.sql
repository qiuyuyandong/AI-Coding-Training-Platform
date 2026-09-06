-- codex-migration: foreign-keys-off

CREATE TABLE practice_tasks_v2 (
  id TEXT PRIMARY KEY,
  stable_id TEXT NOT NULL,
  canonical_problem_id TEXT NOT NULL REFERENCES canonical_problems(id),
  title TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('oj', 'manual_exercise', 'implementation', 'debugging', 'variant', 'review', 'project_milestone')),
  difficulty_band TEXT NOT NULL CHECK (difficulty_band IN ('intro', 'easy', 'medium', 'hard')),
  package_id TEXT NOT NULL REFERENCES curriculum_packages(id)
);

INSERT INTO practice_tasks_v2 (
  id, stable_id, canonical_problem_id, title, kind, difficulty_band, package_id
)
SELECT id, stable_id, canonical_problem_id, title, kind, difficulty_band, package_id
FROM practice_tasks;

DROP TABLE practice_tasks;
ALTER TABLE practice_tasks_v2 RENAME TO practice_tasks;
CREATE INDEX idx_practice_tasks_package ON practice_tasks(package_id);

CREATE TABLE project_templates (
  id TEXT PRIMARY KEY,
  stable_id TEXT NOT NULL,
  version TEXT NOT NULL,
  title TEXT NOT NULL,
  summary TEXT NOT NULL,
  language TEXT NOT NULL,
  definition_hash TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('draft', 'published', 'deprecated')),
  created_at TEXT NOT NULL,
  UNIQUE (stable_id, version)
);

CREATE TABLE project_template_milestones (
  id TEXT PRIMARY KEY,
  template_id TEXT NOT NULL REFERENCES project_templates(id),
  stable_id TEXT NOT NULL,
  title TEXT NOT NULL,
  outcome TEXT NOT NULL,
  order_index INTEGER NOT NULL,
  unfamiliar_change INTEGER NOT NULL CHECK (unfamiliar_change IN (0, 1)),
  rubric_version TEXT NOT NULL,
  UNIQUE (template_id, stable_id),
  UNIQUE (template_id, order_index)
);

CREATE TABLE project_milestone_nodes (
  template_milestone_id TEXT NOT NULL REFERENCES project_template_milestones(id),
  node_id TEXT NOT NULL REFERENCES knowledge_nodes(id),
  role TEXT NOT NULL CHECK (role IN ('primary', 'supporting')),
  PRIMARY KEY (template_milestone_id, node_id)
);

CREATE TABLE learner_projects (
  id TEXT PRIMARY KEY,
  learner_id TEXT NOT NULL REFERENCES learner_profiles(id),
  template_id TEXT NOT NULL REFERENCES project_templates(id),
  title TEXT NOT NULL,
  capture_mode TEXT NOT NULL CHECK (capture_mode IN ('full', 'basic', 'minimal')),
  status TEXT NOT NULL CHECK (status IN ('active', 'completed', 'archived')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE project_practice_sessions (
  id TEXT PRIMARY KEY,
  learner_project_id TEXT NOT NULL REFERENCES learner_projects(id),
  learner_id TEXT NOT NULL REFERENCES learner_profiles(id),
  template_milestone_id TEXT NOT NULL REFERENCES project_template_milestones(id),
  practice_task_id TEXT REFERENCES practice_tasks(id),
  language TEXT NOT NULL,
  toolchain_label TEXT,
  provenance_json TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('active', 'completed', 'cancelled')),
  started_at TEXT NOT NULL,
  ended_at TEXT
);

CREATE TABLE explicit_run_results (
  id TEXT PRIMARY KEY,
  project_session_id TEXT NOT NULL REFERENCES project_practice_sessions(id),
  kind TEXT NOT NULL CHECK (kind IN ('build', 'test', 'check')),
  result TEXT NOT NULL CHECK (result IN ('passed', 'failed', 'not_run')),
  exit_code INTEGER,
  diagnostics TEXT,
  provenance TEXT NOT NULL CHECK (provenance IN ('user_entered', 'explicit_import')),
  supersedes_result_id TEXT REFERENCES explicit_run_results(id),
  idempotency_key TEXT NOT NULL UNIQUE,
  recorded_at TEXT NOT NULL,
  CHECK (diagnostics IS NULL OR length(diagnostics) <= 4000)
);

CREATE TABLE artifact_evidence (
  id TEXT PRIMARY KEY,
  project_session_id TEXT NOT NULL REFERENCES project_practice_sessions(id),
  kind TEXT NOT NULL CHECK (kind IN ('snapshot', 'checksum', 'diff', 'test_summary', 'commit_reference')),
  purpose TEXT NOT NULL,
  capture_mode TEXT NOT NULL CHECK (capture_mode IN ('full', 'basic', 'minimal')),
  content_hash TEXT NOT NULL,
  byte_size INTEGER NOT NULL CHECK (byte_size >= 0),
  reference TEXT,
  preview_json TEXT NOT NULL,
  snapshot_ref_id TEXT REFERENCES code_snapshot_refs(id),
  idempotency_key TEXT NOT NULL UNIQUE,
  recorded_at TEXT NOT NULL,
  deleted_at TEXT
);

CREATE TABLE project_milestones (
  id TEXT PRIMARY KEY,
  learner_project_id TEXT NOT NULL REFERENCES learner_projects(id),
  template_milestone_id TEXT NOT NULL REFERENCES project_template_milestones(id),
  status TEXT NOT NULL CHECK (status IN ('started', 'working', 'tested', 'refined', 'retrospective', 'completed')),
  reflection TEXT,
  evidence_ids_json TEXT NOT NULL,
  confirmed_at TEXT NOT NULL,
  UNIQUE (learner_project_id, template_milestone_id, status)
);

CREATE TABLE rubric_assessments (
  id TEXT PRIMARY KEY,
  project_milestone_id TEXT NOT NULL REFERENCES project_milestones(id),
  rubric_version TEXT NOT NULL,
  function_score INTEGER NOT NULL CHECK (function_score BETWEEN 0 AND 3),
  design_score INTEGER NOT NULL CHECK (design_score BETWEEN 0 AND 3),
  testing_score INTEGER NOT NULL CHECK (testing_score BETWEEN 0 AND 3),
  integration_score INTEGER NOT NULL CHECK (integration_score BETWEEN 0 AND 3),
  maintainability_score INTEGER NOT NULL CHECK (maintainability_score BETWEEN 0 AND 3),
  robustness_score INTEGER NOT NULL CHECK (robustness_score BETWEEN 0 AND 3),
  explanation_score INTEGER NOT NULL CHECK (explanation_score BETWEEN 0 AND 3),
  transfer_score INTEGER NOT NULL CHECK (transfer_score BETWEEN 0 AND 3),
  evidence_ids_json TEXT NOT NULL,
  assessed_at TEXT NOT NULL,
  UNIQUE (project_milestone_id, rubric_version)
);

CREATE TABLE project_node_evidence (
  project_milestone_id TEXT NOT NULL REFERENCES project_milestones(id),
  node_id TEXT NOT NULL REFERENCES knowledge_nodes(id),
  role TEXT NOT NULL CHECK (role IN ('primary', 'supporting')),
  evidence_event_id TEXT NOT NULL REFERENCES learning_evidence_events(id),
  PRIMARY KEY (project_milestone_id, node_id, evidence_event_id)
);

CREATE INDEX idx_project_template_milestones_template ON project_template_milestones(template_id, order_index);
CREATE INDEX idx_learner_projects_learner ON learner_projects(learner_id, status, updated_at);
CREATE UNIQUE INDEX idx_learner_projects_one_active_template
  ON learner_projects(learner_id, template_id) WHERE status = 'active';
CREATE INDEX idx_project_sessions_project ON project_practice_sessions(learner_project_id, started_at);
CREATE INDEX idx_explicit_run_results_session ON explicit_run_results(project_session_id, recorded_at);
CREATE UNIQUE INDEX idx_explicit_run_results_single_superseder
  ON explicit_run_results(supersedes_result_id)
  WHERE supersedes_result_id IS NOT NULL;
CREATE INDEX idx_artifact_evidence_session ON artifact_evidence(project_session_id, recorded_at);
CREATE INDEX idx_project_milestones_project ON project_milestones(learner_project_id, confirmed_at);
