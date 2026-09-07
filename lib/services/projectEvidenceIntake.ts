import type Database from "better-sqlite3";
import { ArtifactEvidenceSchema, type ArtifactEvidence, type ExplicitRunResult } from "@/lib/domain/project";
import type { CaptureMode } from "@/lib/domain/evidence";
import {
  confirmProjectSessionMilestoneStatus,
  deleteArtifactEvidence,
  recordArtifactEvidence,
  recordExplicitRunResult,
} from "@/lib/repositories/projectPractice";
import { prepareArtifactEvidence, type ArtifactIntakeInput } from "@/lib/services/artifactIntake";
import {
  deleteStoredArtifact,
  deleteStoredArtifactWithReceipt,
  restoreStoredArtifact,
  storeFullArtifactWithReceipt,
} from "@/lib/services/snapshotStore";

type SessionPolicyRow = {
  readonly status: string;
  readonly capture_mode: CaptureMode;
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

export type ProjectRunEvidenceInput = Omit<ExplicitRunResult, "id">;

export function recordProjectRunEvidence(
  db: Database.Database,
  input: ProjectRunEvidenceInput,
): { readonly runResult: ExplicitRunResult; readonly replayed: boolean } {
  requireActiveSessionPolicy(db, input.projectSessionId);
  return db.transaction(() => {
    const saved = recordExplicitRunResult(db, input);
    confirmProjectSessionMilestoneStatus(db, {
      projectSessionId: input.projectSessionId,
      status: input.kind === "test" && input.result === "passed" ? "tested" : "working",
      confirmedAt: input.recordedAt,
    });
    return saved;
  })();
}

export function recordProjectArtifactEvidence(
  db: Database.Database,
  storageRoot: string,
  input: ArtifactIntakeInput,
): { readonly artifact: ArtifactEvidence; readonly replayed: boolean } {
  const policy = requireActiveSessionPolicy(db, input.projectSessionId);
  if (captureModeRank(input.captureMode) > captureModeRank(policy.capture_mode)) {
    throw new RangeError(`Project capture mode '${policy.capture_mode}' cannot be elevated by the request`);
  }
  if (input.captureMode !== policy.capture_mode) {
    throw new RangeError(`Project evidence must use its configured '${policy.capture_mode}' capture mode`);
  }
  const prepared = prepareArtifactEvidence({ ...input, captureMode: policy.capture_mode });
  const replay = findArtifactReplay(db, prepared);
  if (replay !== null) return { artifact: replay, replayed: true };

  const shouldStore = policy.capture_mode === "full"
    && (prepared.kind === "snapshot" || prepared.kind === "diff");
  const receipt = shouldStore
    ? storeFullArtifactWithReceipt(storageRoot, prepared, input.content ?? "")
    : { artifact: prepared, created: false };
  try {
    return db.transaction(() => {
      const saved = recordArtifactEvidence(db, receipt.artifact);
      confirmProjectSessionMilestoneStatus(db, {
        projectSessionId: input.projectSessionId,
        status: "refined",
        confirmedAt: input.recordedAt,
      });
      return saved;
    })();
  } catch (error) {
    if (receipt.created && receipt.artifact.reference !== null) {
      deleteStoredArtifact(storageRoot, receipt.artifact.reference);
    }
    throw error;
  }
}

export function deleteProjectArtifactEvidence(
  db: Database.Database,
  storageRoot: string,
  input: {
    readonly projectSessionId: string;
    readonly artifactId: string;
    readonly deletedAt: string;
  },
): boolean {
  requireActiveSessionPolicy(db, input.projectSessionId);
  const row = db.prepare<[string, string], { readonly reference: string | null }>(`
    SELECT reference FROM artifact_evidence
    WHERE id = ? AND project_session_id = ? AND deleted_at IS NULL
  `).get(input.artifactId, input.projectSessionId);
  if (row === undefined) return false;
  const receipt = row.reference !== null && row.reference.endsWith(".snapshot")
    ? deleteStoredArtifactWithReceipt(storageRoot, row.reference)
    : null;
  try {
    return db.transaction(() => deleteArtifactEvidence(db, input.artifactId, input.deletedAt))();
  } catch (error) {
    if (receipt !== null) restoreStoredArtifact(storageRoot, receipt);
    throw error;
  }
}

function requireActiveSessionPolicy(db: Database.Database, projectSessionId: string): SessionPolicyRow {
  const row = db.prepare<[string], SessionPolicyRow>(`
    SELECT session.status, project.capture_mode
    FROM project_practice_sessions session
    JOIN learner_projects project ON project.id = session.learner_project_id
    WHERE session.id = ?
  `).get(projectSessionId);
  if (row === undefined) throw new RangeError(`Project session '${projectSessionId}' was not found`);
  if (row.status !== "active") throw new RangeError(`Project session '${projectSessionId}' is not active`);
  return row;
}

function findArtifactReplay(
  db: Database.Database,
  prepared: ReturnType<typeof prepareArtifactEvidence>,
): ArtifactEvidence | null {
  const row = db.prepare<[string], ArtifactRow>(`
    SELECT * FROM artifact_evidence WHERE idempotency_key = ?
  `).get(prepared.idempotencyKey);
  if (row === undefined) return null;
  const artifact = ArtifactEvidenceSchema.parse({
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
  if (
    artifact.projectSessionId !== prepared.projectSessionId
    || artifact.kind !== prepared.kind
    || artifact.purpose !== prepared.purpose
    || artifact.captureMode !== prepared.captureMode
    || artifact.contentHash !== prepared.contentHash
    || artifact.byteSize !== prepared.byteSize
  ) {
    throw new RangeError("Artifact idempotency key was already used for different evidence");
  }
  return artifact;
}

function captureModeRank(mode: CaptureMode): number {
  if (mode === "minimal") return 0;
  if (mode === "basic") return 1;
  return 2;
}
