import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import Database from "better-sqlite3";
import { afterEach, describe, expect, it } from "vitest";
import { importPackage } from "@/lib/curriculum/importPackage";
import { applyMigrations } from "@/lib/db/migrations";
import { rubricPasses } from "@/lib/domain/project";
import { getOrCreateLocalProfile } from "@/lib/repositories/learnerProfiles";
import {
  recordArtifactEvidence,
  recordExplicitRunResult,
  replaceActiveProjectSession,
} from "@/lib/repositories/projectPractice";
import { prepareArtifactEvidence } from "@/lib/services/artifactIntake";
import {
  completeProjectSessionEvidence,
  startDefaultProject,
} from "@/lib/services/projectEvidence";
import {
  deleteProjectArtifactEvidence,
  recordProjectArtifactEvidence,
  recordProjectRunEvidence,
} from "@/lib/services/projectEvidenceIntake";
import { deleteStoredArtifact, storeFullArtifact } from "@/lib/services/snapshotStore";
import { replayEvidenceAbility } from "@/lib/services/evidenceAbilityReplay";

const directories: string[] = [];
const databases: Database.Database[] = [];
const PASSING_RUBRIC = {
  function: 2,
  design: 1,
  testing: 2,
  integration: 2,
  maintainability: 1,
  robustness: 1,
  explanation: 2,
  transfer: 0,
} as const;

afterEach(() => {
  for (const db of databases.splice(0)) db.close();
  for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true });
});

describe("Phase 4 explicit project evidence", () => {
  it("rejects unsafe artifacts before persistence", () => {
    expect(() => prepareArtifactEvidence({
      projectSessionId: "session",
      kind: "snapshot",
      purpose: "checkpoint",
      captureMode: "full",
      relativePath: ".env.local",
      content: "API_KEY='abcdefghijk'",
      idempotencyKey: "unsafe",
      recordedAt: "2026-09-07T00:00:00.000Z",
    })).toThrow(/secret-like/u);
    expect(() => prepareArtifactEvidence({
      projectSessionId: "session",
      kind: "snapshot",
      purpose: "checkpoint",
      captureMode: "full",
      relativePath: "..\\outside.cpp",
      content: "int main() {}",
      idempotencyKey: "outside",
      recordedAt: "2026-09-07T00:00:00.000Z",
    })).toThrow(/selected workspace/u);
  });

  it("completes a project session through explicit build, test, and selected artifact evidence", () => {
    const db = openFixture();
    const started = startDefaultProject(db, {
      captureMode: "basic",
      now: "2026-09-07T00:00:00.000Z",
      toolchainLabel: "g++",
    });
    expect(startDefaultProject(db, {
      captureMode: "full",
      now: "2026-09-07T00:01:00.000Z",
    })).toEqual(started);
    recordExplicitRunResult(db, {
      projectSessionId: started.sessionId,
      kind: "build",
      result: "passed",
      exitCode: 0,
      diagnostics: null,
      provenance: "user_entered",
      supersedesResultId: null,
      idempotencyKey: "project-build-1",
      recordedAt: "2026-09-07T00:10:00.000Z",
    });
    const mistakenTest = recordExplicitRunResult(db, {
      projectSessionId: started.sessionId,
      kind: "test",
      result: "failed",
      exitCode: 1,
      diagnostics: "Result entered against the wrong run",
      provenance: "explicit_import",
      supersedesResultId: null,
      idempotencyKey: "project-test-1",
      recordedAt: "2026-09-07T00:12:00.000Z",
    });
    recordExplicitRunResult(db, {
      projectSessionId: started.sessionId,
      kind: "test",
      result: "passed",
      exitCode: 0,
      diagnostics: "8 checks passed",
      provenance: "user_entered",
      supersedesResultId: mistakenTest.runResult.id,
      idempotencyKey: "project-test-correction-1",
      recordedAt: "2026-09-07T00:12:30.000Z",
    });
    recordArtifactEvidence(db, prepareArtifactEvidence({
      projectSessionId: started.sessionId,
      kind: "diff",
      purpose: "Show the completed CRUD slice",
      captureMode: "basic",
      relativePath: "src/main.cpp",
      content: "+void addTask() {}\n+void listTasks() {}",
      idempotencyKey: "project-artifact-1",
      recordedAt: "2026-09-07T00:13:00.000Z",
    }));

    const completed = completeProjectSessionEvidence(db, {
      sessionId: started.sessionId,
      usedAssistance: false,
      rubricScores: PASSING_RUBRIC,
      reflection: "Boundary cases are covered by explicit tests.",
      now: "2026-09-07T00:15:00.000Z",
    });

    expect(completed.outcome).toBe("independent_effective_completion");
    expect(completed.reviewId).not.toBeNull();
    expect(completed.projectCompleted).toBe(false);
    expect(completed.nextSessionId).not.toBeNull();
    expect(completed.nextMilestoneTitle).toBe("Functions, types, and modules");
    expect(count(db, "learning_evidence_events")).toBe(3);
    expect(count(db, "training_session_summaries")).toBe(1);
    expect(count(db, "project_node_evidence")).toBeGreaterThan(0);
    expect(count(db, "evidence_ability_transitions")).toBeGreaterThan(0);
    expect(db.prepare<[], { readonly projection_version: string }>(
      "SELECT projection_version FROM ability_snapshots LIMIT 1",
    ).get()?.projection_version).toBe("evidence-ability-projector-1");
    const transitionCount = count(db, "evidence_ability_transitions");
    const levelBeforeReplay = db.prepare<[], { readonly visible_level: string }>(
      "SELECT visible_level FROM ability_snapshots ORDER BY node_id LIMIT 1",
    ).get()?.visible_level;
    replayEvidenceAbility(db, "local-default-learner", "2026-09-07T00:15:00.000Z");
    expect(count(db, "evidence_ability_transitions")).toBe(transitionCount);
    expect(db.prepare<[], { readonly visible_level: string }>(
      "SELECT visible_level FROM ability_snapshots ORDER BY node_id LIMIT 1",
    ).get()?.visible_level).toBe(levelBeforeReplay);
    expect(db.prepare<[string], { readonly status: string }>(
      "SELECT status FROM project_practice_sessions WHERE id = ?",
    ).get(started.sessionId)?.status).toBe("completed");
  });

  it("advances all six milestones and closes the learner project", () => {
    const db = openFixture();
    const started = startDefaultProject(db, {
      captureMode: "minimal",
      now: "2026-09-07T01:00:00.000Z",
    });
    let sessionId = started.sessionId;
    let finalProjectCompleted = false;
    for (let index = 0; index < 6; index += 1) {
      recordExplicitRunResult(db, {
        projectSessionId: sessionId,
        kind: "test",
        result: "passed",
        exitCode: 0,
        diagnostics: null,
        provenance: "user_entered",
        supersedesResultId: null,
        idempotencyKey: `project-sequence-test-${index}`,
        recordedAt: `2026-09-07T0${index + 2}:00:00.000Z`,
      });
      const completed = completeProjectSessionEvidence(db, {
        sessionId,
        usedAssistance: false,
        rubricScores: PASSING_RUBRIC,
        now: `2026-09-07T0${index + 2}:10:00.000Z`,
      });
      finalProjectCompleted = completed.projectCompleted;
      if (completed.nextSessionId !== null) sessionId = completed.nextSessionId;
    }
    expect(finalProjectCompleted).toBe(true);
    expect(db.prepare<[string], { readonly status: string }>(
      "SELECT status FROM learner_projects WHERE id = ?",
    ).get(started.projectId)?.status).toBe("completed");
    expect(count(db, "project_practice_sessions")).toBe(6);
  });

  it("requires integration evidence in the project rubric", () => {
    const baseline = {
      function: 2,
      design: 1,
      testing: 2,
      integration: 1,
      maintainability: 1,
      robustness: 1,
      explanation: 2,
      transfer: 0,
    };
    expect(rubricPasses(baseline)).toBe(false);
    expect(rubricPasses({ ...baseline, integration: 2 })).toBe(true);
  });

  it("replaces an active session without skipping its milestone", () => {
    const db = openFixture();
    const started = startDefaultProject(db, { captureMode: "basic", now: "2026-09-07T03:00:00.000Z" });
    const replacement = replaceActiveProjectSession(db, {
      projectSessionId: started.sessionId,
      reason: "Restart with a smaller module boundary",
      now: "2026-09-07T03:10:00.000Z",
    });
    expect(replacement.learnerProjectId).toBe(started.projectId);
    expect(replacement.templateMilestoneId).toBe(started.milestoneId);
    expect(db.prepare<[string], { readonly status: string }>(
      "SELECT status FROM project_practice_sessions WHERE id = ?",
    ).get(started.sessionId)?.status).toBe("cancelled");
    expect(replacement.status).toBe("active");
  });

  it("stores and deletes only an explicitly selected full snapshot", () => {
    const directory = mkdtempSync(join(tmpdir(), "phase4-snapshot-"));
    directories.push(directory);
    const prepared = prepareArtifactEvidence({
      projectSessionId: "session",
      kind: "snapshot",
      purpose: "checkpoint",
      captureMode: "full",
      relativePath: "src/main.cpp",
      content: "int main() { return 0; }",
      idempotencyKey: "snapshot-1",
      recordedAt: "2026-09-07T00:00:00.000Z",
    });
    const stored = storeFullArtifact(directory, prepared, "int main() { return 0; }");
    expect(stored.reference).not.toBeNull();
    if (stored.reference === null) throw new Error("Full snapshot reference is missing");
    expect(readFileSync(stored.reference, "utf8")).toBe("int main() { return 0; }");
    expect(deleteStoredArtifact(directory, stored.reference)).toBe(true);
    expect(existsSync(stored.reference)).toBe(false);
  });

  it("enforces the server-owned project capture mode", () => {
    const db = openFixture();
    const started = startDefaultProject(db, { captureMode: "minimal", now: "2026-09-07T04:00:00.000Z" });
    expect(() => recordProjectArtifactEvidence(db, join(tmpdir(), "unused-evidence"), {
      projectSessionId: started.sessionId,
      kind: "snapshot",
      purpose: "client escalation",
      captureMode: "full",
      relativePath: "src/main.cpp",
      content: "int main() {}",
      idempotencyKey: "capture-mode-escalation",
      recordedAt: "2026-09-07T04:01:00.000Z",
    })).toThrow(/cannot be elevated/u);
    expect(count(db, "artifact_evidence")).toBe(0);
  });

  it("rolls back a run when its milestone status cannot be recorded", () => {
    const db = openFixture();
    const started = startDefaultProject(db, { captureMode: "basic", now: "2026-09-07T04:10:00.000Z" });
    db.exec(`
      CREATE TRIGGER fail_working_milestone BEFORE INSERT ON project_milestones
      WHEN NEW.status = 'working' BEGIN SELECT RAISE(ABORT, 'injected milestone failure'); END;
    `);
    expect(() => recordProjectRunEvidence(db, {
      projectSessionId: started.sessionId,
      kind: "build",
      result: "passed",
      exitCode: 0,
      diagnostics: null,
      provenance: "user_entered",
      supersedesResultId: null,
      idempotencyKey: "rollback-run",
      recordedAt: "2026-09-07T04:11:00.000Z",
    })).toThrow(/injected milestone failure/u);
    expect(count(db, "explicit_run_results")).toBe(0);
  });

  it("removes a newly written snapshot when database persistence fails", () => {
    const db = openFixture();
    const directory = mkdtempSync(join(tmpdir(), "phase4-compensation-"));
    directories.push(directory);
    const started = startDefaultProject(db, { captureMode: "full", now: "2026-09-07T04:20:00.000Z" });
    db.exec(`CREATE TRIGGER fail_artifact BEFORE INSERT ON artifact_evidence BEGIN SELECT RAISE(ABORT, 'injected artifact failure'); END;`);
    expect(() => recordProjectArtifactEvidence(db, directory, {
      projectSessionId: started.sessionId,
      kind: "snapshot",
      purpose: "failure compensation",
      captureMode: "full",
      relativePath: "src/main.cpp",
      content: "int main() { return 1; }",
      idempotencyKey: "rollback-artifact",
      recordedAt: "2026-09-07T04:21:00.000Z",
    })).toThrow(/injected artifact failure/u);
    expect(count(db, "artifact_evidence")).toBe(0);
    expect(existsSync(directory)).toBe(true);
    expect(readDirectoryFiles(directory)).toEqual([]);
  });

  it("restores snapshot bytes when soft deletion fails", () => {
    const db = openFixture();
    const directory = mkdtempSync(join(tmpdir(), "phase4-delete-compensation-"));
    directories.push(directory);
    const started = startDefaultProject(db, { captureMode: "full", now: "2026-09-07T04:30:00.000Z" });
    const saved = recordProjectArtifactEvidence(db, directory, {
      projectSessionId: started.sessionId,
      kind: "snapshot",
      purpose: "delete compensation",
      captureMode: "full",
      relativePath: "src/main.cpp",
      content: "int main() { return 2; }",
      idempotencyKey: "delete-artifact",
      recordedAt: "2026-09-07T04:31:00.000Z",
    });
    if (saved.artifact.reference === null) throw new Error("Stored snapshot reference is missing");
    db.exec(`CREATE TRIGGER fail_artifact_delete BEFORE UPDATE OF deleted_at ON artifact_evidence BEGIN SELECT RAISE(ABORT, 'injected delete failure'); END;`);
    expect(() => deleteProjectArtifactEvidence(db, directory, {
      projectSessionId: started.sessionId,
      artifactId: saved.artifact.id,
      deletedAt: "2026-09-07T04:32:00.000Z",
    })).toThrow(/injected delete failure/u);
    expect(readFileSync(saved.artifact.reference, "utf8")).toBe("int main() { return 2; }");
    expect(db.prepare<[string], { readonly deleted_at: string | null }>(
      "SELECT deleted_at FROM artifact_evidence WHERE id = ?",
    ).get(saved.artifact.id)?.deleted_at).toBeNull();
  });
});

function openFixture(): Database.Database {
  const directory = mkdtempSync(join(tmpdir(), "phase4-project-"));
  directories.push(directory);
  const db = new Database(join(directory, "test.sqlite"));
  databases.push(db);
  db.pragma("foreign_keys = ON");
  applyMigrations(db);
  const imported = importPackage(
    db,
    join(process.cwd(), "content", "tracks", "software-development-foundations-v1"),
  );
  if (!imported.ok) throw new Error("Curriculum import failed");
  getOrCreateLocalProfile(db, { now: () => "2026-09-07T00:00:00.000Z" });
  return db;
}

function count(db: Database.Database, table: string): number {
  return db.prepare<[], { readonly count: number }>(
    `SELECT COUNT(*) AS count FROM ${table}`,
  ).get()?.count ?? 0;
}

function readDirectoryFiles(directory: string): readonly string[] {
  return existsSync(directory) ? readdirSync(directory).sort() : [];
}
