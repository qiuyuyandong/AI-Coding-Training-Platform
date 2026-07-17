-- 0006_curriculum_catalog.sql
--
-- V0 additive curriculum catalog schema.
--
-- This migration is purely additive: it creates new tables and indexes and
-- never modifies, drops, or rebuilds any existing Phase 0 table. No INSERT
-- statements are emitted; the importer (Todo 3) is the only writer of
-- curriculum content. Idempotent: every CREATE uses IF NOT EXISTS so the
-- migration is safe to re-run against a partially applied database.
--
-- The CHECK constraints mirror the Zod enums that 0006 consumers will use
-- (lib/domain/curriculum.ts, lib/domain/resource.ts). Any CHECK listed in
-- the V0 plan is required; missing one is a verifier failure.

CREATE TABLE IF NOT EXISTS curriculum_packages (
  id TEXT PRIMARY KEY,
  track_slug TEXT NOT NULL,
  semantic_version TEXT NOT NULL,
  checksum TEXT NOT NULL,
  source_revision TEXT NOT NULL,
  installed_at TEXT NOT NULL,
  UNIQUE(track_slug, semantic_version)
);

CREATE TABLE IF NOT EXISTS career_tracks (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  summary TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('published', 'planned')),
  package_id TEXT NOT NULL REFERENCES curriculum_packages(id)
);

CREATE TABLE IF NOT EXISTS knowledge_nodes (
  id TEXT PRIMARY KEY,
  stable_id TEXT NOT NULL,
  title TEXT NOT NULL,
  outcome TEXT NOT NULL,
  rationale TEXT NOT NULL,
  order_index INTEGER NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('planned', 'draft', 'published', 'deprecated')),
  provenance_json TEXT NOT NULL,
  package_id TEXT NOT NULL REFERENCES curriculum_packages(id),
  UNIQUE(package_id, stable_id)
);

CREATE TABLE IF NOT EXISTS knowledge_edges (
  id TEXT PRIMARY KEY,
  from_node_id TEXT NOT NULL REFERENCES knowledge_nodes(id),
  to_node_id TEXT NOT NULL REFERENCES knowledge_nodes(id),
  edge_type TEXT NOT NULL CHECK (edge_type IN ('required_prerequisite', 'recommended_prerequisite')),
  UNIQUE(from_node_id, to_node_id, edge_type),
  CHECK (from_node_id <> to_node_id)
);

CREATE TABLE IF NOT EXISTS learning_resources (
  id TEXT PRIMARY KEY,
  stable_id TEXT NOT NULL,
  title TEXT NOT NULL,
  url TEXT NOT NULL,
  author TEXT NOT NULL,
  language TEXT NOT NULL CHECK (language IN ('en', 'zh-CN', 'multilingual')),
  cost TEXT NOT NULL CHECK (cost IN ('free', 'freemium', 'paid')),
  access TEXT NOT NULL CHECK (access IN ('open', 'registration', 'regional_restricted')),
  license_boundary TEXT NOT NULL CHECK (license_boundary IN ('official_public_docs', 'permissive_open', 'deep_link_only')),
  review_status TEXT NOT NULL CHECK (review_status IN ('draft', 'reviewed', 'broken', 'deprecated')),
  reviewed_at TEXT NOT NULL,
  stopping_guidance TEXT NOT NULL,
  package_id TEXT NOT NULL REFERENCES curriculum_packages(id)
);

CREATE TABLE IF NOT EXISTS canonical_problems (
  id TEXT PRIMARY KEY,
  stable_id TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS canonical_problem_sources (
  id TEXT PRIMARY KEY,
  canonical_problem_id TEXT NOT NULL REFERENCES canonical_problems(id),
  platform TEXT NOT NULL CHECK (platform IN ('leetcode', 'nowcoder', 'luogu', 'codeforces', 'atcoder', 'manual')),
  external_id TEXT NOT NULL,
  url TEXT NOT NULL,
  is_primary INTEGER NOT NULL CHECK (is_primary IN (0, 1)),
  UNIQUE(platform, external_id)
);

CREATE TABLE IF NOT EXISTS practice_tasks (
  id TEXT PRIMARY KEY,
  stable_id TEXT NOT NULL,
  canonical_problem_id TEXT NOT NULL REFERENCES canonical_problems(id),
  title TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('oj', 'manual_exercise')),
  difficulty_band TEXT NOT NULL CHECK (difficulty_band IN ('intro', 'easy', 'medium', 'hard')),
  package_id TEXT NOT NULL REFERENCES curriculum_packages(id)
);

CREATE TABLE IF NOT EXISTS node_resources (
  node_id TEXT NOT NULL REFERENCES knowledge_nodes(id),
  resource_id TEXT NOT NULL REFERENCES learning_resources(id),
  role TEXT NOT NULL CHECK (role IN ('primary')),
  sort_order INTEGER NOT NULL,
  PRIMARY KEY(node_id, resource_id)
);

CREATE TABLE IF NOT EXISTS node_practice_mappings (
  node_id TEXT NOT NULL REFERENCES knowledge_nodes(id),
  practice_task_id TEXT NOT NULL REFERENCES practice_tasks(id),
  measurement_role TEXT NOT NULL CHECK (measurement_role IN ('primary', 'supporting')),
  variant_family_id TEXT,
  sort_order INTEGER NOT NULL,
  PRIMARY KEY(node_id, practice_task_id)
);

CREATE INDEX IF NOT EXISTS idx_career_tracks_status
  ON career_tracks(status);

CREATE INDEX IF NOT EXISTS idx_knowledge_nodes_status_order
  ON knowledge_nodes(status, order_index);

CREATE INDEX IF NOT EXISTS idx_knowledge_nodes_package
  ON knowledge_nodes(package_id);

CREATE INDEX IF NOT EXISTS idx_knowledge_edges_from
  ON knowledge_edges(from_node_id);

CREATE INDEX IF NOT EXISTS idx_knowledge_edges_to
  ON knowledge_edges(to_node_id);

CREATE INDEX IF NOT EXISTS idx_learning_resources_status
  ON learning_resources(review_status);

CREATE INDEX IF NOT EXISTS idx_practice_tasks_package
  ON practice_tasks(package_id);

CREATE INDEX IF NOT EXISTS idx_node_resources_node
  ON node_resources(node_id);

CREATE INDEX IF NOT EXISTS idx_node_practice_node
  ON node_practice_mappings(node_id);