import { randomUUID } from "node:crypto";
import type Database from "better-sqlite3";
import {
  ArtifactEvidenceSchema,
  ExplicitRunResultSchema,
  LearnerProjectSchema,
  ProjectPracticeSessionSchema,
  RubricScoresSchema,
  rubricPasses,
  type ArtifactEvidence,
  type ExplicitRunResult,
  type LearnerProject,
  type ProjectPracticeSession,
  type RubricScores,
} from "@/lib/domain/project";
import type { CaptureMode } from "@/lib/domain/evidence";
import type { PreparedArtifact } from "@/lib/services/artifactIntake";

type LearnerProjectRow = {
  readonly id: string;
  readonly learner_id: string;
  readonly template_id: string;
  readonly title: string;
  readonly capture_mode: string;
  readonly status: string;
  readonly created_at: string;
  readonly updated_at: string;
};

type RunResultRow = {
  readonly id: string;
  readonly project_session_id: string;
  readonly kind: string;
  readonly result: string;
  readonly exit_code: number | null;
  readonly diagnostics: string | null;
  readonly provenance: string;
  readonly supersedes_result_id: string | null;
  readonly idempotency_key: string;
  readonly recorded_at: string;
};

type ArtifactRow = {
  readonly id: string;
  readonly project_session_id: string;
  readonly kind: string;
  readonly purpose: string;
  readonly capture_mode: string;
  readonly content_hash: string;
  readonly byte_size: number;
  readonly reference: string | null;
  readonly preview_json: string;
  readonly idempotency_key: string;
  readonly recorded_at: string;
  readonly deleted_at: string | null;
};

export function createLearnerProject(
  db: Database.Database,
  input: {
    readonly learnerId: string;
    readonly templateId: string;
    readonly title: string;
    readonly captureMode: CaptureMode;
    readonly now: string;
  },
): LearnerProject {
  const row = LearnerProjectSchema.parse({
    id: `project_${randomUUID()}`,
    learnerId: input.learnerId,
    templateId: input.templateId,
    title: input.title,
    captureMode: input.captureMode,
    status: "active",
    createdAt: input.now,
    updatedAt: input.now,
  });
  db.prepare(`
    INSERT INTO learner_projects (
      id, learner_id, template_id, title, capture_mode, status, created_at, updated_at
    ) VALUES (@id, @learnerId, @templateId, @title, @captureMode, @status, @createdAt, @updatedAt)
  `).run(row);
  return row;
}

export function startProjectSession(
  db: Database.Database,
  input: {
    readonly learnerProjectId: string;
    readonly learnerId: string;
    readonly templateMilestoneId: string;
    readonly practiceTaskId?: string | null;
    readonly language: string;
    readonly toolchainLabel?: string | null;
    readonly provenanceJson: string;
    readonly now: string;
  },
): ProjectPracticeSession {
  const active = db.prepare<[string], { readonly id: string }>(`
    SELECT id FROM project_practice_sessions
    WHERE learner_project_id = ? AND status = 'active' LIMIT 1
  `).get(input.learnerProjectId);
  if (active !== undefined) throw new RangeError(`Project already has active session '${active.id}'`);
  const row = ProjectPracticeSessionSchema.parse({
    id: `project_session_${randomUUID()}`,
    learnerProjectId: input.learnerProjectId,
    learnerId: input.learnerId,
    templateMilestoneId: input.templateMilestoneId,
    practiceTaskId: input.practiceTaskId ?? null,
    language: input.language,
    toolchainLabel: input.toolchainLabel ?? null,
    provenanceJson: input.provenanceJson,
    status: "active",
    startedAt: input.now,
    endedAt: null,
  });
  db.prepare(`
    INSERT INTO project_practice_sessions (
      id, learner_project_id, learner_id, template_milestone_id,
      practice_task_id, language, toolchain_label, provenance_json,
      status, started_at, ended_at
    ) VALUES (
      @id, @learnerProjectId, @learnerId, @templateMilestoneId,
      @practiceTaskId, @language, @toolchainLabel, @provenanceJson,
      @status, @startedAt, @endedAt
    )
  `).run(row);
  return row;
}

export function replaceActiveProjectSession(
  db: Database.Database,
  input: {
    readonly projectSessionId: string;
    readonly reason: string;
    readonly now: string;
  },
): ProjectPracticeSession {
  const reason = input.reason.trim();
  if (reason.length === 0 || reason.length > 500) throw new RangeError("Replacement reason must contain 1-500 characters");
  return db.transaction(() => {
    const prior = db.prepare<[string], {
      readonly learner_project_id: string;
      readonly learner_id: string;
      readonly template_milestone_id: string;
      readonly practice_task_id: string | null;
      readonly language: string;
      readonly toolchain_label: string | null;
      readonly status: string;
    }>(`
      SELECT learner_project_id, learner_id, template_milestone_id,
             practice_task_id, language, toolchain_label, status
      FROM project_practice_sessions WHERE id = ?
    `).get(input.projectSessionId);
    if (prior === undefined) throw new RangeError(`Project session '${input.projectSessionId}' was not found`);
    if (prior.status !== "active") throw new RangeError(`Project session '${input.projectSessionId}' is not active`);
    db.prepare(`UPDATE project_practice_sessions SET status = 'cancelled', ended_at = ? WHERE id = ?`)
      .run(input.now, input.projectSessionId);
    const replacement = startProjectSession(db, {
      learnerProjectId: prior.learner_project_id,
      learnerId: prior.learner_id,
      templateMilestoneId: prior.template_milestone_id,
      practiceTaskId: prior.practice_task_id,
      language: prior.language,
      toolchainLabel: prior.toolchain_label,
      provenanceJson: JSON.stringify({
        initiatedBy: "learner_replacement",
        previousSessionId: input.projectSessionId,
        reason,
      }),
      now: input.now,
    });
    db.prepare(`UPDATE learner_projects SET updated_at = ? WHERE id = ?`)
      .run(input.now, prior.learner_project_id);
    return replacement;
  })();
}

export function recordExplicitRunResult(
  db: Database.Database,
  input: Omit<ExplicitRunResult, "id">,
): { readonly runResult: ExplicitRunResult; readonly replayed: boolean } {
  const candidate = ExplicitRunResultSchema.parse({ ...input, id: `run_result_${randomUUID()}` });
  if (candidate.supersedesResultId !== null) {
    const prior = db.prepare<[string], { readonly project_session_id: string; readonly kind: string }>(`
      SELECT project_session_id, kind FROM explicit_run_results WHERE id = ?
    `).get(candidate.supersedesResultId);
    if (prior === undefined) throw new RangeError(`Superseded run result '${candidate.supersedesResultId}' was not found`);
    if (prior.project_session_id !== candidate.projectSessionId || prior.kind !== candidate.kind) {
      throw new RangeError("A run-result correction must stay in the same session and result kind");
    }
  }
  const result = db.prepare(`
    INSERT OR IGNORE INTO explicit_run_results (
      id, project_session_id, kind, result, exit_code, diagnostics,
      provenance, supersedes_result_id, idempotency_key, recorded_at
    ) VALUES (
      @id, @projectSessionId, @kind, @result, @exitCode, @diagnostics,
      @provenance, @supersedesResultId, @idempotencyKey, @recordedAt
    )
  `).run(candidate);
  if (result.changes === 1) return { runResult: candidate, replayed: false };
  const existing = db.prepare<[string], RunResultRow>(`
    SELECT * FROM explicit_run_results WHERE idempotency_key = ?
  `).get(candidate.idempotencyKey);
  if (existing === undefined) throw new Error("Run-result replay row disappeared");
  return { runResult: fromRunResultRow(existing), replayed: true };
}

export function recordArtifactEvidence(
  db: Database.Database,
  input: PreparedArtifact,
): { readonly artifact: ArtifactEvidence; readonly replayed: boolean } {
  const candidate = ArtifactEvidenceSchema.parse({
    ...input,
    id: `artifact_${randomUUID()}`,
    deletedAt: null,
  });
  const snapshotRefId = candidate.kind === "snapshot" || candidate.kind === "diff"
    ? `snapshot_ref_${candidate.id}`
    : null;
  if (snapshotRefId !== null) {
    const session = db.prepare<[string], { readonly learner_id: string }>(`
      SELECT learner_id FROM project_practice_sessions WHERE id = ?
    `).get(candidate.projectSessionId);
    if (session === undefined) throw new RangeError(`Project session '${candidate.projectSessionId}' was not found`);
    const retentionExpiresAt = candidate.captureMode === "full"
      ? new Date(new Date(candidate.recordedAt).getTime() + 90 * 86_400_000).toISOString()
      : null;
    db.prepare(`
      INSERT OR IGNORE INTO code_snapshot_refs (
        id, learner_id, source_type, source_id, event_kind, capture_mode,
        content_hash, language, byte_size, storage_path, diff_features_json,
        captured_at, retention_expires_at, deleted_at, idempotency_key
      ) VALUES (?, ?, 'project', ?, 'checkpoint', ?, ?, NULL, ?, ?, ?, ?, ?, NULL, ?)
    `).run(
      snapshotRefId,
      session.learner_id,
      candidate.projectSessionId,
      candidate.captureMode,
      candidate.contentHash,
      candidate.byteSize,
      candidate.captureMode === "full" ? candidate.reference : null,
      candidate.previewJson,
      candidate.recordedAt,
      retentionExpiresAt,
      `${candidate.idempotencyKey}:snapshot`,
    );
  }
  const result = db.prepare(`
    INSERT OR IGNORE INTO artifact_evidence (
      id, project_session_id, kind, purpose, capture_mode, content_hash,
      byte_size, reference, preview_json, snapshot_ref_id, idempotency_key, recorded_at, deleted_at
    ) VALUES (
      @id, @projectSessionId, @kind, @purpose, @captureMode, @contentHash,
      @byteSize, @reference, @previewJson, @snapshotRefId, @idempotencyKey, @recordedAt, @deletedAt
    )
  `).run({ ...candidate, snapshotRefId });
  if (result.changes === 1) return { artifact: candidate, replayed: false };
  const existing = db.prepare<[string], ArtifactRow>(`
    SELECT * FROM artifact_evidence WHERE idempotency_key = ?
  `).get(candidate.idempotencyKey);
  if (existing === undefined) throw new Error("Artifact replay row disappeared");
  return { artifact: fromArtifactRow(existing), replayed: true };
}

export function deleteArtifactEvidence(
  db: Database.Database,
  artifactId: string,
  deletedAt: string,
): boolean {
  return db.transaction(() => {
    const row = db.prepare<[string], { readonly snapshot_ref_id: string | null }>(`
      SELECT snapshot_ref_id FROM artifact_evidence WHERE id = ? AND deleted_at IS NULL
    `).get(artifactId);
    if (row === undefined) return false;
    db.prepare(`UPDATE artifact_evidence SET deleted_at = ? WHERE id = ?`).run(deletedAt, artifactId);
    if (row.snapshot_ref_id !== null) {
      db.prepare(`UPDATE code_snapshot_refs SET deleted_at = ?, storage_path = NULL WHERE id = ?`)
        .run(deletedAt, row.snapshot_ref_id);
    }
    return true;
  })();
}

export function confirmProjectMilestone(
  db: Database.Database,
  input: {
    readonly learnerProjectId: string;
    readonly templateMilestoneId: string;
    readonly status: "started" | "working" | "tested" | "refined" | "retrospective" | "completed";
    readonly reflection?: string | null;
    readonly evidenceIds: readonly string[];
    readonly confirmedAt: string;
  },
): string {
  const id = `milestone_${randomUUID()}`;
  const result = db.prepare(`
    INSERT OR IGNORE INTO project_milestones (
      id, learner_project_id, template_milestone_id, status,
      reflection, evidence_ids_json, confirmed_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    input.learnerProjectId,
    input.templateMilestoneId,
    input.status,
    input.reflection ?? null,
    JSON.stringify([...input.evidenceIds]),
    input.confirmedAt,
  );
  if (result.changes === 1) return id;
  const existing = db.prepare<[string, string, string], { readonly id: string }>(`
    SELECT id FROM project_milestones
    WHERE learner_project_id = ? AND template_milestone_id = ? AND status = ?
  `).get(input.learnerProjectId, input.templateMilestoneId, input.status);
  if (existing === undefined) throw new Error("Project milestone replay row disappeared");
  return existing.id;
}

export function confirmProjectSessionMilestoneStatus(
  db: Database.Database,
  input: {
    readonly projectSessionId: string;
    readonly status: "working" | "tested" | "refined" | "retrospective";
    readonly reflection?: string | null;
    readonly evidenceIds?: readonly string[];
    readonly confirmedAt: string;
  },
): string {
  const session = db.prepare<[string], {
    readonly learner_project_id: string;
    readonly template_milestone_id: string;
  }>(`
    SELECT learner_project_id, template_milestone_id
    FROM project_practice_sessions WHERE id = ?
  `).get(input.projectSessionId);
  if (session === undefined) throw new RangeError(`Project session '${input.projectSessionId}' was not found`);
  return confirmProjectMilestone(db, {
    learnerProjectId: session.learner_project_id,
    templateMilestoneId: session.template_milestone_id,
    status: input.status,
    reflection: input.reflection ?? null,
    evidenceIds: input.evidenceIds ?? [],
    confirmedAt: input.confirmedAt,
  });
}

export function assessProjectMilestone(
  db: Database.Database,
  input: {
    readonly projectMilestoneId: string;
    readonly rubricVersion: string;
    readonly scores: RubricScores;
    readonly evidenceIds: readonly string[];
    readonly assessedAt: string;
  },
): { readonly id: string; readonly passes: boolean } {
  const scores = RubricScoresSchema.parse(input.scores);
  const id = `rubric_${randomUUID()}`;
  db.prepare(`
    INSERT INTO rubric_assessments (
      id, project_milestone_id, rubric_version, function_score, design_score,
      testing_score, integration_score, maintainability_score, robustness_score,
      explanation_score, transfer_score, evidence_ids_json, assessed_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    input.projectMilestoneId,
    input.rubricVersion,
    scores.function,
    scores.design,
    scores.testing,
    scores.integration,
    scores.maintainability,
    scores.robustness,
    scores.explanation,
    scores.transfer,
    JSON.stringify([...input.evidenceIds]),
    input.assessedAt,
  );
  return { id, passes: rubricPasses(scores) };
}

export function listLearnerProjects(
  db: Database.Database,
  learnerId: string,
): readonly LearnerProject[] {
  return db.prepare<[string], LearnerProjectRow>(`
    SELECT * FROM learner_projects WHERE learner_id = ?
    ORDER BY updated_at DESC, id ASC
  `).all(learnerId).map(fromLearnerProjectRow);
}

function fromLearnerProjectRow(row: LearnerProjectRow): LearnerProject {
  return LearnerProjectSchema.parse({
    id: row.id,
    learnerId: row.learner_id,
    templateId: row.template_id,
    title: row.title,
    captureMode: row.capture_mode,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  });
}

function fromRunResultRow(row: RunResultRow): ExplicitRunResult {
  return ExplicitRunResultSchema.parse({
    id: row.id,
    projectSessionId: row.project_session_id,
    kind: row.kind,
    result: row.result,
    exitCode: row.exit_code,
    diagnostics: row.diagnostics,
    provenance: row.provenance,
    supersedesResultId: row.supersedes_result_id,
    idempotencyKey: row.idempotency_key,
    recordedAt: row.recorded_at,
  });
}

function fromArtifactRow(row: ArtifactRow): ArtifactEvidence {
  return ArtifactEvidenceSchema.parse({
    id: row.id,
    projectSessionId: row.project_session_id,
    kind: row.kind,
    purpose: row.purpose,
    captureMode: row.capture_mode,
    contentHash: row.content_hash,
    byteSize: row.byte_size,
    reference: row.reference,
    previewJson: row.preview_json,
    idempotencyKey: row.idempotency_key,
    recordedAt: row.recorded_at,
    deletedAt: row.deleted_at,
  });
}
