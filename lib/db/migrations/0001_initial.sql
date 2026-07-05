CREATE TABLE IF NOT EXISTS schema_migrations (
  id TEXT PRIMARY KEY,
  applied_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS problems (
  id TEXT PRIMARY KEY,
  platform TEXT NOT NULL,
  external_id TEXT NOT NULL,
  title TEXT NOT NULL,
  canonical_url TEXT NOT NULL,
  tags_json TEXT NOT NULL,
  difficulty TEXT NOT NULL,
  status TEXT NOT NULL,
  content_mode TEXT NOT NULL,
  training_mode TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(platform, external_id)
);

CREATE TABLE IF NOT EXISTS capture_events (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  platform TEXT NOT NULL,
  problem_external_id TEXT NOT NULL,
  problem_title TEXT NOT NULL,
  canonical_url TEXT NOT NULL,
  occurred_at TEXT NOT NULL,
  payload_json TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS training_attempts (
  id TEXT PRIMARY KEY,
  platform TEXT NOT NULL,
  problem_external_id TEXT NOT NULL,
  problem_title TEXT NOT NULL,
  canonical_url TEXT NOT NULL,
  started_at TEXT NOT NULL,
  ended_at TEXT,
  result TEXT NOT NULL,
  verdict TEXT,
  language TEXT,
  duration_minutes INTEGER,
  reflection TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);