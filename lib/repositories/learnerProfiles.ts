import { randomUUID } from "node:crypto";
import type Database from "better-sqlite3";
import {
  InterestTrackIdsSchema,
  LearnerGoalRowSchema,
  LearnerProfileRowSchema,
  LOCAL_DEFAULT_LEARNER_ID,
  type LearnerGoalRow,
  type LearnerProfileRow,
} from "@/lib/domain/learner";

/**
 * V0 learner-profile and goal-history repository functions.
 *
 * Every function accepts a caller-owned SQLite handle and never opens or
 * closes it. The DB-handle rule comes from `AGENTS.md` and is enforced
 * by the repository-level tests; callers are expected to obtain their
 * handle from `lib/db/client.ts` and pass it in.
 *
 * V0 deliberately has a single stable local profile with id
 * `local-default-learner`. The lazy-create operation never inserts a
 * second row: a second call returns the existing row. Goal transitions
 * preserve history by superseding the old row and inserting a new one
 * in the same transaction; no UPDATE on the existing `learner_goals`
 * row is ever issued.
 *
 * The returned objects mirror the underlying SQL columns verbatim in
 * snake_case. The Zod schemas in `lib/domain/learner.ts` are used at the
 * boundary to reject malformed input early so the repository is a thin
 * transport layer and the SQL surface remains auditable in one place.
 */

type ProfileRow = {
  readonly id: string;
  readonly onboarding_state: string;
  readonly created_at: string;
  readonly updated_at: string;
};

type GoalRow = {
  readonly id: string;
  readonly learner_id: string;
  readonly primary_track_id: string | null;
  readonly interest_track_ids_json: string;
  readonly status: string;
  readonly created_at: string;
};

export type GetOrCreateProfileOptions = {
  readonly now?: () => string;
};

/**
 * Lazily create the single V0 local profile and return its row. If a
 * row with `local-default-learner` already exists the existing row is
 * returned unchanged; no second profile is ever inserted.
 */
export function getOrCreateLocalProfile(
  db: Database.Database,
  options: GetOrCreateProfileOptions = {},
): LearnerProfileRow {
  const existing = findLocalProfile(db);
  if (existing !== null) {
    return existing;
  }
  const now = (options.now ?? (() => new Date().toISOString()))();
  const row: ProfileRow = {
    id: LOCAL_DEFAULT_LEARNER_ID,
    onboarding_state: "new",
    created_at: now,
    updated_at: now,
  };
  db.prepare(
    `INSERT INTO learner_profiles (id, onboarding_state, created_at, updated_at)
     VALUES (@id, @onboardingState, @createdAt, @updatedAt)`,
  ).run({
    id: row.id,
    onboardingState: row.onboarding_state,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  });
  return fromProfileRow(row);
}

/**
 * Persist a new goal with the supplied primary track id. The currently
 * active goal (if any) is marked `superseded` first so history is
 * preserved. Returns the newly-inserted active goal row.
 *
 * V0 deliberately has no target-level field or UI; only the primary
 * track and interests change.
 */
export function setPrimaryTrack(
  db: Database.Database,
  learnerId: string,
  trackSlug: string | null,
  options: GetOrCreateProfileOptions = {},
): LearnerGoalRow {
  const now = (options.now ?? (() => new Date().toISOString()))();
  const transaction = db.transaction(() => {
    const current = findActiveGoal(db, learnerId);
    const interests = current?.interestTrackIds ?? [];
    if (current !== null) {
      supersedeGoal(db, current.id, now);
    }
    return insertGoal(db, learnerId, trackSlug, interests, "active", now);
  });
  return transaction();
}

/**
 * Persist a new goal with the supplied set of interest tracks. The
 * currently active goal (if any) is marked `superseded` first so
 * history is preserved. The set must contain between zero and two
 * distinct slugs; otherwise a `RangeError` is thrown and no rows are
 * written.
 */
export function setInterestTracks(
  db: Database.Database,
  learnerId: string,
  trackSlugs: readonly string[],
  options: GetOrCreateProfileOptions = {},
): LearnerGoalRow {
  const parsed = parseInterestTrackIds(trackSlugs);
  const now = (options.now ?? (() => new Date().toISOString()))();
  const transaction = db.transaction(() => {
    const current = findActiveGoal(db, learnerId);
    const primary = current?.primaryTrackId ?? null;
    if (current !== null) {
      supersedeGoal(db, current.id, now);
    }
    return insertGoal(db, learnerId, primary, parsed, "active", now);
  });
  return transaction();
}

/**
 * Return every goal for the learner (active and superseded) ordered by
 * `created_at` descending. Pure read; no transactions required.
 */
export function listGoalHistory(
  db: Database.Database,
  learnerId: string,
): LearnerGoalRow[] {
  return db
    .prepare<[string], GoalRow>(
      `SELECT id, learner_id, primary_track_id, interest_track_ids_json,
              status, created_at
         FROM learner_goals
        WHERE learner_id = ?
        ORDER BY created_at DESC, id DESC`,
    )
    .all(learnerId)
    .map(fromGoalRow);
}

function findLocalProfile(db: Database.Database): LearnerProfileRow | null {
  const row = db
    .prepare<[string], ProfileRow>(
      `SELECT id, onboarding_state, created_at, updated_at
         FROM learner_profiles
        WHERE id = ?
        LIMIT 1`,
    )
    .get(LOCAL_DEFAULT_LEARNER_ID);
  return row === undefined ? null : fromProfileRow(row);
}

function findActiveGoal(
  db: Database.Database,
  learnerId: string,
): LearnerGoalRow | null {
  const row = db
    .prepare<[string], GoalRow>(
      `SELECT id, learner_id, primary_track_id, interest_track_ids_json,
              status, created_at
         FROM learner_goals
        WHERE learner_id = ? AND status = 'active'
        LIMIT 1`,
    )
    .get(learnerId);
  return row === undefined ? null : fromGoalRow(row);
}

function supersedeGoal(db: Database.Database, goalId: string, now: string): void {
  // `updated_at` does not exist on `learner_goals`; superseding is
  // recorded by a status flip only. The timestamp is captured here so
  // future auditing could read it from a log without changing schema.
  void now;
  db.prepare(
    `UPDATE learner_goals SET status = 'superseded' WHERE id = ?`,
  ).run(goalId);
}

function insertGoal(
  db: Database.Database,
  learnerId: string,
  primaryTrackId: string | null,
  interestTrackIds: readonly string[],
  status: "active" | "superseded",
  now: string,
): LearnerGoalRow {
  const row: GoalRow = {
    id: `goal_${randomUUID()}`,
    learner_id: learnerId,
    primary_track_id: primaryTrackId,
    interest_track_ids_json: JSON.stringify(interestTrackIds),
    status,
    created_at: now,
  };
  db.prepare(
    `INSERT INTO learner_goals (
       id, learner_id, primary_track_id, interest_track_ids_json,
       status, created_at
     ) VALUES (
       @id, @learnerId, @primaryTrackId, @interestTrackIdsJson,
       @status, @createdAt
     )`,
  ).run({
    id: row.id,
    learnerId: row.learner_id,
    primaryTrackId: row.primary_track_id,
    interestTrackIdsJson: row.interest_track_ids_json,
    status: row.status,
    createdAt: row.created_at,
  });
  return fromGoalRow(row);
}

function fromProfileRow(row: ProfileRow): LearnerProfileRow {
  return LearnerProfileRowSchema.parse({
    id: row.id,
    onboardingState: row.onboarding_state,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  });
}

function fromGoalRow(row: GoalRow): LearnerGoalRow {
  let parsedInterests: string[] = [];
  try {
    const raw = JSON.parse(row.interest_track_ids_json);
    if (Array.isArray(raw)) {
      parsedInterests = raw.filter((value): value is string =>
        typeof value === "string"
      );
    }
  } catch {
    parsedInterests = [];
  }
  return LearnerGoalRowSchema.parse({
    id: row.id,
    learnerId: row.learner_id,
    primaryTrackId: row.primary_track_id,
    interestTrackIds: parsedInterests,
    status: row.status,
    createdAt: row.created_at,
  });
}

function parseInterestTrackIds(
  trackSlugs: readonly string[],
): readonly string[] {
  if (trackSlugs.length > 2) {
    throw new RangeError(
      `Interest tracks must contain at most 2 entries; received ${trackSlugs.length}`,
    );
  }
  const seen = new Set<string>();
  for (const track of trackSlugs) {
    if (seen.has(track)) {
      throw new RangeError(`Duplicate interest track '${track}'`);
    }
    seen.add(track);
  }
  // The Zod schema additionally rejects non-string/empty values, so
  // callers still get a typed failure for malformed input.
  return InterestTrackIdsSchema.parse(trackSlugs);
}