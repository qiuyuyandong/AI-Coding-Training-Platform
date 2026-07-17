import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";
import { afterEach, describe, expect, it } from "vitest";
import {
  LOCAL_DEFAULT_LEARNER_ID,
  type LearnerNodeBaselineRow,
} from "@/lib/domain/learner";
import {
  completeDiagnosticSession,
  findCurrentSession,
  listBaselines,
  recordDiagnosticResponse,
  startDiagnosticSession,
  upsertBaseline,
} from "@/lib/repositories/diagnosis";
import {
  getOrCreateLocalProfile,
  listGoalHistory,
  setInterestTracks,
  setPrimaryTrack,
} from "@/lib/repositories/learnerProfiles";
import {
  appendFeedback,
  createDailySnapshot,
  createLearningPlan,
  findActivePlan,
  findLatestDailySnapshot,
  insertPlanItem,
  listPlanItems,
  recordRevisionEvent,
  supersedePlan,
} from "@/lib/repositories/plans";

/**
 * V0 learner/plan repository tests.
 *
 * The 0007 learner-and-plan migration is owned by Todo 7 of the same
 * plan; it is not yet committed when this task lands. The tests below
 * therefore build the equivalent schema directly via `db.exec(...)` so
 * the repository contracts can be locked in parallel. Once Todo 7
 * lands, the schema bootstrap here is byte-equivalent to the
 * migration's CREATE TABLE statements, and the repository tests
 * continue to pass against the real migration.
 */

const tempDirs: string[] = [];
const tempDatabases: Database.Database[] = [];

function openSchema(): Database.Database {
  const directory = mkdtempSync(join(tmpdir(), "learner-repo-"));
  tempDirs.push(directory);
  const db = new Database(join(directory, "schema.sqlite"));
  tempDatabases.push(db);
  db.pragma("foreign_keys = ON");
  db.exec(SCHEMA_SQL);
  return db;
}

function fixedClock(timestamp: string): () => string {
  return () => timestamp;
}

const SCHEMA_SQL = `
  CREATE TABLE learner_profiles (
    id TEXT PRIMARY KEY,
    onboarding_state TEXT NOT NULL CHECK (onboarding_state IN
      ('new', 'goal_resolved', 'diagnosing', 'plan_ready')),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE learner_goals (
    id TEXT PRIMARY KEY,
    learner_id TEXT NOT NULL REFERENCES learner_profiles(id),
    primary_track_id TEXT,
    interest_track_ids_json TEXT NOT NULL DEFAULT '[]'
      CHECK (json_valid(interest_track_ids_json)),
    status TEXT NOT NULL CHECK (status IN ('active', 'superseded')),
    created_at TEXT NOT NULL
  );

  CREATE TABLE diagnostic_sessions (
    id TEXT PRIMARY KEY,
    learner_id TEXT NOT NULL REFERENCES learner_profiles(id),
    blueprint_version TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('in_progress', 'completed')),
    started_at TEXT NOT NULL,
    completed_at TEXT
  );

  CREATE TABLE diagnostic_responses (
    session_id TEXT NOT NULL REFERENCES diagnostic_sessions(id),
    prompt_id TEXT NOT NULL,
    response TEXT NOT NULL CHECK (response IN
      ('unknown', 'needs_foundation', 'can_with_help', 'ready')),
    created_at TEXT NOT NULL,
    PRIMARY KEY(session_id, prompt_id)
  );

  CREATE TABLE learner_node_baselines (
    learner_id TEXT NOT NULL REFERENCES learner_profiles(id),
    node_id TEXT NOT NULL,
    baseline TEXT NOT NULL CHECK (baseline IN
      ('unknown', 'needs_foundation', 'self_reported', 'ready')),
    confidence TEXT NOT NULL CHECK (confidence IN ('low', 'medium', 'high')),
    source TEXT NOT NULL CHECK (source IN ('diagnosis', 'manual_override')),
    updated_at TEXT NOT NULL,
    PRIMARY KEY(learner_id, node_id)
  );

  CREATE TABLE learning_plans (
    id TEXT PRIMARY KEY,
    learner_id TEXT NOT NULL REFERENCES learner_profiles(id),
    generator_version TEXT NOT NULL,
    snapshot_json TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('active', 'superseded')),
    created_at TEXT NOT NULL
  );

  CREATE TABLE daily_plan_snapshots (
    id TEXT PRIMARY KEY,
    learning_plan_id TEXT NOT NULL REFERENCES learning_plans(id),
    local_date TEXT NOT NULL,
    effort_boundary_minutes INTEGER NOT NULL CHECK (effort_boundary_minutes IN
      (15, 30, 60, 90)),
    daily_mode TEXT NOT NULL CHECK (daily_mode IN ('learn', 'practice', 'recover')),
    generator_version TEXT NOT NULL,
    supersedes_daily_plan_id TEXT,
    created_at TEXT NOT NULL
  );

  CREATE TABLE plan_items (
    id TEXT PRIMARY KEY,
    daily_plan_id TEXT NOT NULL REFERENCES daily_plan_snapshots(id),
    practice_task_id TEXT NOT NULL,
    node_id TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN
      ('primary', 'warmup', 'same_goal_alternative', 'weakness_review')),
    rank INTEGER NOT NULL,
    reason_codes_json TEXT NOT NULL
  );

  CREATE TABLE task_feedback (
    id TEXT PRIMARY KEY,
    plan_item_id TEXT NOT NULL REFERENCES plan_items(id),
    action TEXT NOT NULL CHECK (action IN
      ('accepted', 'started', 'skipped', 'completed')),
    reason_code TEXT CHECK (reason_code IN
      ('too_hard', 'too_easy', 'not_relevant', 'missing_resource', 'not_now', 'other')),
    reason_text TEXT,
    attempt_id TEXT,
    successor_daily_plan_id TEXT,
    created_at TEXT NOT NULL,
    UNIQUE(plan_item_id, action)
  );

  CREATE TABLE plan_revision_events (
    id TEXT PRIMARY KEY,
    before_daily_plan_id TEXT,
    after_daily_plan_id TEXT NOT NULL,
    event_type TEXT NOT NULL CHECK (event_type IN
      ('initial_plan', 'goal_changed', 'diagnosis_completed',
       'effort_changed', 'item_skipped', 'item_completed',
       'attempt_corrected', 'attempt_voided')),
    input_fingerprint TEXT NOT NULL,
    created_at TEXT NOT NULL
  );
`;

afterEach(() => {
  for (const db of tempDatabases.splice(0)) {
    try {
      db.close();
    } catch {
      // Already closed by the test body.
    }
  }
  for (const directory of tempDirs.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe("getOrCreateLocalProfile", () => {
  it("lazily creates exactly one profile with the stable V0 id", () => {
    const db = openSchema();

    const first = getOrCreateLocalProfile(db, { now: fixedClock("2026-07-17T00:00:00.000Z") });

    expect(first.id).toBe(LOCAL_DEFAULT_LEARNER_ID);
    expect(first.onboardingState).toBe("new");

    const rowCount = db
      .prepare<[], { readonly count: number }>(
        "SELECT COUNT(*) AS count FROM learner_profiles",
      )
      .get();
    expect(rowCount?.count).toBe(1);
  });

  it("returns the same id and does not insert a second profile on a repeat call", () => {
    const db = openSchema();

    const first = getOrCreateLocalProfile(db, { now: fixedClock("2026-07-17T00:00:00.000Z") });
    const second = getOrCreateLocalProfile(db, { now: fixedClock("2026-07-17T00:00:30.000Z") });

    expect(second.id).toBe(first.id);
    expect(second.createdAt).toBe(first.createdAt);

    const rowCount = db
      .prepare<[], { readonly count: number }>(
        "SELECT COUNT(*) AS count FROM learner_profiles",
      )
      .get();
    expect(rowCount?.count).toBe(1);
  });

  it("does not open or close the database passed in by the caller", () => {
    const db = openSchema();
    expect(db.open).toBe(true);

    getOrCreateLocalProfile(db);

    expect(db.open).toBe(true);
  });
});

describe("setPrimaryTrack", () => {
  it("keeps the prior row as superseded and creates a new active row", () => {
    const db = openSchema();
    const learnerId = LOCAL_DEFAULT_LEARNER_ID;
    getOrCreateLocalProfile(db, { now: fixedClock("2026-07-17T00:00:00.000Z") });

    setPrimaryTrack(db, learnerId, null, { now: fixedClock("2026-07-17T00:00:01.000Z") });
    setPrimaryTrack(db, learnerId, "systems-software", {
      now: fixedClock("2026-07-17T00:00:02.000Z"),
    });

    const goals = listGoalHistory(db, learnerId);
    expect(goals).toHaveLength(2);
    expect(goals[0]?.primaryTrackId).toBe("systems-software");
    expect(goals[0]?.status).toBe("active");
    expect(goals[1]?.primaryTrackId).toBeNull();
    expect(goals[1]?.status).toBe("superseded");

    expect(goals[0]?.createdAt > (goals[1]?.createdAt ?? "")).toBe(true);
  });

  it("preserves interest track ids when only the primary track changes", () => {
    const db = openSchema();
    const learnerId = LOCAL_DEFAULT_LEARNER_ID;
    getOrCreateLocalProfile(db, { now: fixedClock("2026-07-17T00:00:00.000Z") });

    setInterestTracks(db, learnerId, ["backend-server", "security"], {
      now: fixedClock("2026-07-17T00:00:01.000Z"),
    });
    setPrimaryTrack(db, learnerId, "systems-software", {
      now: fixedClock("2026-07-17T00:00:02.000Z"),
    });

    const goals = listGoalHistory(db, learnerId);
    const active = goals.find((goal) => goal.status === "active");
    expect(active?.primaryTrackId).toBe("systems-software");
    expect(active?.interestTrackIds).toEqual(["backend-server", "security"]);
  });
});

describe("setInterestTracks", () => {
  it("rejects more than two distinct tracks with a RangeError", () => {
    const db = openSchema();
    const learnerId = LOCAL_DEFAULT_LEARNER_ID;
    getOrCreateLocalProfile(db, { now: fixedClock("2026-07-17T00:00:00.000Z") });

    expect(() =>
      setInterestTracks(db, learnerId, ["backend-server", "security", "frontend-web"], {
        now: fixedClock("2026-07-17T00:00:01.000Z"),
      }),
    ).toThrow(RangeError);

    expect(listGoalHistory(db, learnerId)).toHaveLength(0);
  });

  it("rejects duplicate tracks with a RangeError", () => {
    const db = openSchema();
    const learnerId = LOCAL_DEFAULT_LEARNER_ID;
    getOrCreateLocalProfile(db, { now: fixedClock("2026-07-17T00:00:00.000Z") });

    expect(() =>
      setInterestTracks(db, learnerId, ["backend-server", "backend-server"], {
        now: fixedClock("2026-07-17T00:00:01.000Z"),
      }),
    ).toThrow(RangeError);

    expect(listGoalHistory(db, learnerId)).toHaveLength(0);
  });

  it("accepts the zero-to-two distinct track range and supersedes prior goal rows", () => {
    const db = openSchema();
    const learnerId = LOCAL_DEFAULT_LEARNER_ID;
    getOrCreateLocalProfile(db, { now: fixedClock("2026-07-17T00:00:00.000Z") });

    const zero = setInterestTracks(db, learnerId, [], {
      now: fixedClock("2026-07-17T00:00:01.000Z"),
    });
    expect(zero.interestTrackIds).toEqual([]);

    const two = setInterestTracks(db, learnerId, ["backend-server", "security"], {
      now: fixedClock("2026-07-17T00:00:02.000Z"),
    });
    expect(two.interestTrackIds).toEqual(["backend-server", "security"]);

    const history = listGoalHistory(db, learnerId);
    expect(history).toHaveLength(2);
    expect(history[0]?.status).toBe("active");
    expect(history[1]?.status).toBe("superseded");
  });
});

describe("diagnostic session lifecycle", () => {
  it("starts a session, records responses, and completes the session", () => {
    const db = openSchema();
    const learnerId = LOCAL_DEFAULT_LEARNER_ID;
    getOrCreateLocalProfile(db, { now: fixedClock("2026-07-17T00:00:00.000Z") });

    const session = startDiagnosticSession(db, learnerId, "v0-diagnosis-1", {
      now: fixedClock("2026-07-17T00:00:01.000Z"),
    });
    expect(session.status).toBe("in_progress");
    expect(session.completedAt).toBeNull();

    recordDiagnosticResponse(
      db,
      session.id,
      "cpp-basics",
      "ready",
      { now: fixedClock("2026-07-17T00:00:02.000Z") },
    );

    const completed = completeDiagnosticSession(db, session.id, {
      now: fixedClock("2026-07-17T00:00:03.000Z"),
    });
    expect(completed.status).toBe("completed");
    expect(completed.completedAt).toBe("2026-07-17T00:00:03.000Z");

    expect(findCurrentSession(db, learnerId)).toBeNull();
  });

  it("overwrites a previous response for the same (session_id, prompt_id)", () => {
    const db = openSchema();
    const learnerId = LOCAL_DEFAULT_LEARNER_ID;
    getOrCreateLocalProfile(db, { now: fixedClock("2026-07-17T00:00:00.000Z") });

    const session = startDiagnosticSession(db, learnerId, "v0-diagnosis-1", {
      now: fixedClock("2026-07-17T00:00:01.000Z"),
    });

    recordDiagnosticResponse(
      db,
      session.id,
      "cpp-basics",
      "unknown",
      { now: fixedClock("2026-07-17T00:00:02.000Z") },
    );
    recordDiagnosticResponse(
      db,
      session.id,
      "cpp-basics",
      "ready",
      { now: fixedClock("2026-07-17T00:00:03.000Z") },
    );

    const response = db
      .prepare<[string, string], { readonly response: string; readonly created_at: string }>(
        "SELECT response, created_at FROM diagnostic_responses WHERE session_id = ? AND prompt_id = ?",
      )
      .get(session.id, "cpp-basics");

    expect(response?.response).toBe("ready");
    expect(response?.created_at).toBe("2026-07-17T00:00:03.000Z");
  });

  it("rejects responses that are not in the documented enum", () => {
    const db = openSchema();
    const learnerId = LOCAL_DEFAULT_LEARNER_ID;
    getOrCreateLocalProfile(db, { now: fixedClock("2026-07-17T00:00:00.000Z") });
    const session = startDiagnosticSession(db, learnerId, "v0-diagnosis-1", {
      now: fixedClock("2026-07-17T00:00:01.000Z"),
    });

    expect(() =>
      recordDiagnosticResponse(
        db,
        session.id,
        "cpp-basics",
        // Cast through `unknown` is not allowed at all in this repo's
        // strict configuration; the only safe way to exercise the
        // rejection path is to feed an obvious out-of-enum value.
        "nope" as unknown as "unknown",
        { now: fixedClock("2026-07-17T00:00:02.000Z") },
      ),
    ).toThrow();
  });
});

describe("learner node baselines", () => {
  it("upserts the latest baseline for a (learner, node) pair", () => {
    const db = openSchema();
    const learnerId = LOCAL_DEFAULT_LEARNER_ID;
    getOrCreateLocalProfile(db, { now: fixedClock("2026-07-17T00:00:00.000Z") });

    upsertBaseline(db, learnerId, "cpp-io-types", "unknown", "low", "diagnosis", {
      now: fixedClock("2026-07-17T00:00:01.000Z"),
    });
    const baseline: LearnerNodeBaselineRow = upsertBaseline(
      db,
      learnerId,
      "cpp-io-types",
      "ready",
      "high",
      "manual_override",
      { now: fixedClock("2026-07-17T00:00:02.000Z") },
    );

    expect(baseline.baseline).toBe("ready");
    expect(baseline.confidence).toBe("high");
    expect(baseline.source).toBe("manual_override");

    const list = listBaselines(db, learnerId);
    expect(list).toHaveLength(1);
    expect(list[0]?.baseline).toBe("ready");
  });
});

describe("learning plans and daily snapshots", () => {
  it("supersedes an existing active plan before inserting a new one", () => {
    const db = openSchema();
    const learnerId = LOCAL_DEFAULT_LEARNER_ID;
    getOrCreateLocalProfile(db, { now: fixedClock("2026-07-17T00:00:00.000Z") });

    const first = createLearningPlan(db, learnerId, "v0-plan-generator-1", "{}", {
      now: fixedClock("2026-07-17T00:00:01.000Z"),
    });
    expect(first.status).toBe("active");

    const second = createLearningPlan(db, learnerId, "v0-plan-generator-2", "{}", {
      now: fixedClock("2026-07-17T00:00:02.000Z"),
    });
    expect(second.status).toBe("active");

    const plans = db
      .prepare<[string], { readonly id: string; readonly status: string }>(
        "SELECT id, status FROM learning_plans WHERE learner_id = ? ORDER BY created_at ASC",
      )
      .all(learnerId);

    expect(plans).toHaveLength(2);
    expect(plans[0]?.id).toBe(first.id);
    expect(plans[0]?.status).toBe("superseded");
    expect(plans[1]?.id).toBe(second.id);
    expect(plans[1]?.status).toBe("active");

    const active = findActivePlan(db, learnerId);
    expect(active?.id).toBe(second.id);
  });

  it("creates daily snapshots, exposes the latest one, and tracks successors", () => {
    const db = openSchema();
    const learnerId = LOCAL_DEFAULT_LEARNER_ID;
    getOrCreateLocalProfile(db, { now: fixedClock("2026-07-17T00:00:00.000Z") });
    const plan = createLearningPlan(db, learnerId, "v0-plan-generator-1", "{}", {
      now: fixedClock("2026-07-17T00:00:01.000Z"),
    });

    const firstSnapshot = createDailySnapshot(
      db,
      plan.id,
      "2026-07-17",
      30,
      "learn",
      "v0-plan-generator-1",
      null,
      { now: fixedClock("2026-07-17T00:00:02.000Z") },
    );
    expect(firstSnapshot.supersedesDailyPlanId).toBeNull();

    const secondSnapshot = createDailySnapshot(
      db,
      plan.id,
      "2026-07-17",
      15,
      "learn",
      "v0-plan-generator-1",
      firstSnapshot.id,
      { now: fixedClock("2026-07-17T00:00:03.000Z") },
    );
    expect(secondSnapshot.supersedesDailyPlanId).toBe(firstSnapshot.id);

    const latest = findLatestDailySnapshot(db, plan.id);
    expect(latest?.id).toBe(secondSnapshot.id);
    expect(latest?.effortBoundaryMinutes).toBe(15);
  });

  it("supersedePlan marks the named plan as superseded", () => {
    const db = openSchema();
    const learnerId = LOCAL_DEFAULT_LEARNER_ID;
    getOrCreateLocalProfile(db, { now: fixedClock("2026-07-17T00:00:00.000Z") });
    const plan = createLearningPlan(db, learnerId, "v0-plan-generator-1", "{}", {
      now: fixedClock("2026-07-17T00:00:01.000Z"),
    });

    supersedePlan(db, plan.id);

    expect(findActivePlan(db, learnerId)).toBeNull();
  });
});

describe("plan items and feedback", () => {
  it("inserts plan items in rank order and never updates an existing item", () => {
    const db = openSchema();
    const learnerId = LOCAL_DEFAULT_LEARNER_ID;
    getOrCreateLocalProfile(db, { now: fixedClock("2026-07-17T00:00:00.000Z") });
    const plan = createLearningPlan(db, learnerId, "v0-plan-generator-1", "{}", {
      now: fixedClock("2026-07-17T00:00:01.000Z"),
    });
    const snapshot = createDailySnapshot(
      db,
      plan.id,
      "2026-07-17",
      30,
      "learn",
      "v0-plan-generator-1",
      null,
      { now: fixedClock("2026-07-17T00:00:02.000Z") },
    );

    const first = insertPlanItem(
      db,
      snapshot.id,
      "practice-cpp-io-types",
      "cpp-io-types",
      "primary",
      1,
      '["new_path"]',
      { now: fixedClock("2026-07-17T00:00:03.000Z") },
    );
    const duplicate = insertPlanItem(
      db,
      snapshot.id,
      "practice-cpp-io-types",
      "cpp-io-types",
      "primary",
      1,
      '["new_path"]',
      { now: fixedClock("2026-07-17T00:00:04.000Z") },
    );

    expect(first.id).not.toBe(duplicate.id);

    const items = listPlanItems(db, snapshot.id);
    expect(items).toHaveLength(2);
    expect(new Set(items.map((item) => item.id))).toEqual(
      new Set([first.id, duplicate.id]),
    );
  });

  it("appends feedback for distinct actions and rejects duplicate actions with a RangeError", () => {
    const db = openSchema();
    const learnerId = LOCAL_DEFAULT_LEARNER_ID;
    getOrCreateLocalProfile(db, { now: fixedClock("2026-07-17T00:00:00.000Z") });
    const plan = createLearningPlan(db, learnerId, "v0-plan-generator-1", "{}", {
      now: fixedClock("2026-07-17T00:00:01.000Z"),
    });
    const snapshot = createDailySnapshot(
      db,
      plan.id,
      "2026-07-17",
      30,
      "learn",
      "v0-plan-generator-1",
      null,
      { now: fixedClock("2026-07-17T00:00:02.000Z") },
    );
    const item = insertPlanItem(
      db,
      snapshot.id,
      "practice-cpp-io-types",
      "cpp-io-types",
      "primary",
      1,
      '["new_path"]',
      { now: fixedClock("2026-07-17T00:00:03.000Z") },
    );

    const accepted = appendFeedback(db, item.id, "accepted", {
      now: fixedClock("2026-07-17T00:00:04.000Z") });
    expect(accepted.action).toBe("accepted");

    expect(() =>
      appendFeedback(db, item.id, "accepted", {
        now: fixedClock("2026-07-17T00:00:05.000Z") }),
    ).toThrow(RangeError);

    appendFeedback(db, item.id, "started", {
      now: fixedClock("2026-07-17T00:00:06.000Z") });
    appendFeedback(db, item.id, "skipped", {
      reasonCode: "too_hard",
      now: fixedClock("2026-07-17T00:00:07.000Z") });
  });

  it("requires non-blank reason text for skip reason 'other'", () => {
    const db = openSchema();
    const learnerId = LOCAL_DEFAULT_LEARNER_ID;
    getOrCreateLocalProfile(db, { now: fixedClock("2026-07-17T00:00:00.000Z") });
    const plan = createLearningPlan(db, learnerId, "v0-plan-generator-1", "{}", {
      now: fixedClock("2026-07-17T00:00:01.000Z") });
    const snapshot = createDailySnapshot(
      db,
      plan.id,
      "2026-07-17",
      30,
      "learn",
      "v0-plan-generator-1",
      null,
      { now: fixedClock("2026-07-17T00:00:02.000Z") },
    );
    const item = insertPlanItem(
      db,
      snapshot.id,
      "practice-cpp-io-types",
      "cpp-io-types",
      "primary",
      1,
      '["new_path"]',
      { now: fixedClock("2026-07-17T00:00:03.000Z") },
    );

    expect(() =>
      appendFeedback(db, item.id, "skipped", {
        reasonCode: "other",
        now: fixedClock("2026-07-17T00:00:04.000Z") }),
    ).toThrow(RangeError);

    appendFeedback(db, item.id, "skipped", {
      reasonCode: "other",
      reasonText: "  wrote notes instead  ",
      now: fixedClock("2026-07-17T00:00:05.000Z") });
  });
});

describe("plan revision events", () => {
  it("appends a single event linking prior and successor daily plans", () => {
    const db = openSchema();
    const learnerId = LOCAL_DEFAULT_LEARNER_ID;
    getOrCreateLocalProfile(db, { now: fixedClock("2026-07-17T00:00:00.000Z") });
    const plan = createLearningPlan(db, learnerId, "v0-plan-generator-1", "{}", {
      now: fixedClock("2026-07-17T00:00:01.000Z") });
    const first = createDailySnapshot(
      db,
      plan.id,
      "2026-07-17",
      30,
      "learn",
      "v0-plan-generator-1",
      null,
      { now: fixedClock("2026-07-17T00:00:02.000Z") },
    );
    const second = createDailySnapshot(
      db,
      plan.id,
      "2026-07-17",
      15,
      "learn",
      "v0-plan-generator-1",
      first.id,
      { now: fixedClock("2026-07-17T00:00:03.000Z") },
    );

    const event = recordRevisionEvent(
      db,
      first.id,
      second.id,
      "effort_changed",
      "fingerprint-15-min",
      { now: fixedClock("2026-07-17T00:00:04.000Z") },
    );
    expect(event.beforeDailyPlanId).toBe(first.id);
    expect(event.afterDailyPlanId).toBe(second.id);
    expect(event.eventType).toBe("effort_changed");

    const initialEvent = recordRevisionEvent(
      db,
      null,
      first.id,
      "initial_plan",
      "fingerprint-30-min",
      { now: fixedClock("2026-07-17T00:00:05.000Z") },
    );
    expect(initialEvent.beforeDailyPlanId).toBeNull();
    expect(initialEvent.afterDailyPlanId).toBe(first.id);
  });
});

describe("happy-path V0 learner setup", () => {
  it("creates an undecided profile, then transitions to a resolved primary + two interests while keeping auditable history", () => {
    const db = openSchema();
    const learnerId = LOCAL_DEFAULT_LEARNER_ID;

    const profile = getOrCreateLocalProfile(db, {
      now: fixedClock("2026-07-17T00:00:00.000Z") });
    expect(profile.onboardingState).toBe("new");

    setInterestTracks(db, learnerId, ["backend-server", "security"], {
      now: fixedClock("2026-07-17T00:00:01.000Z") });
    setPrimaryTrack(db, learnerId, "systems-software", {
      now: fixedClock("2026-07-17T00:00:02.000Z") });

    const goals = listGoalHistory(db, learnerId);
    expect(goals).toHaveLength(2);
    expect(goals[0]?.status).toBe("active");
    expect(goals[0]?.primaryTrackId).toBe("systems-software");
    expect(goals[0]?.interestTrackIds).toEqual(["backend-server", "security"]);
    expect(goals[1]?.status).toBe("superseded");
    expect(goals[1]?.primaryTrackId).toBeNull();
    expect(goals[1]?.interestTrackIds).toEqual(["backend-server", "security"]);

    // The auditable history covers both states the learner passed
    // through: interests-only, then primary+interests.
    const superseded = goals.find((goal) => goal.status === "superseded");
    expect(superseded?.primaryTrackId).toBeNull();
    expect(superseded?.interestTrackIds).toEqual(["backend-server", "security"]);
  });
});

describe("DB-handle rule", () => {
  it("does not open or close the database passed into any repository function", () => {
    const db = openSchema();
    const learnerId = LOCAL_DEFAULT_LEARNER_ID;

    const before = db.open;

    getOrCreateLocalProfile(db);
    setPrimaryTrack(db, learnerId, "systems-software");
    setInterestTracks(db, learnerId, ["backend-server", "security"]);
    const session = startDiagnosticSession(db, learnerId, "v0-diagnosis-1");
    recordDiagnosticResponse(db, session.id, "cpp-basics", "ready");
    completeDiagnosticSession(db, session.id);
    upsertBaseline(db, learnerId, "cpp-io-types", "ready", "high", "manual_override");
    const plan = createLearningPlan(db, learnerId, "v0-plan-generator-1", "{}");
    const snapshot = createDailySnapshot(db, plan.id, "2026-07-17", 30, "learn", "v0-plan-generator-1");
    const item = insertPlanItem(db, snapshot.id, "practice-cpp-io-types", "cpp-io-types", "primary", 1, "[]");
    appendFeedback(db, item.id, "accepted");
    recordRevisionEvent(db, null, snapshot.id, "initial_plan", "fp-001");

    expect(db.open).toBe(true);
    expect(db.open).toBe(before);
  });
});