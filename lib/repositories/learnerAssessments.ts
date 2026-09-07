import { randomUUID } from "node:crypto";
import type Database from "better-sqlite3";
import {
  LearnerAssessmentSchema,
  type LearnerAssessment,
} from "@/lib/domain/review";

type AssessmentRow = {
  readonly id: string;
  readonly learner_id: string;
  readonly node_id: string;
  readonly kind: string;
  readonly rating: string | null;
  readonly reason: string | null;
  readonly ability_input_fingerprint: string | null;
  readonly resolution: string;
  readonly created_at: string;
  readonly idempotency_key: string | null;
};

export function appendLearnerAssessment(
  db: Database.Database,
  input: Omit<LearnerAssessment, "id" | "resolution"> & { readonly idempotencyKey?: string },
): { readonly assessment: LearnerAssessment; readonly replayed: boolean } {
  const { idempotencyKey, ...assessmentInput } = input;
  if (idempotencyKey !== undefined && (idempotencyKey.length < 1 || idempotencyKey.length > 200)) {
    throw new RangeError("Assessment idempotency key must contain 1-200 characters");
  }
  const assessment = LearnerAssessmentSchema.parse({
    ...assessmentInput,
    id: `assessment_${randomUUID()}`,
    resolution: "pending_verification",
  });
  const existing = idempotencyKey === undefined ? undefined : db.prepare<[string], AssessmentRow>(`
    SELECT * FROM learner_assessments WHERE idempotency_key = ?
  `).get(idempotencyKey);
  if (existing !== undefined) return assessmentReplay(existing, assessment);
  const node = db.prepare<[string], { readonly id: string }>("SELECT id FROM knowledge_nodes WHERE id = ?").get(assessment.nodeId);
  if (node === undefined) throw new RangeError(`Knowledge node '${assessment.nodeId}' was not found`);
  db.prepare(`
    INSERT INTO learner_assessments (
      id, learner_id, node_id, kind, rating, reason,
      ability_input_fingerprint, resolution, created_at, idempotency_key
    ) VALUES (
      @id, @learnerId, @nodeId, @kind, @rating, @reason,
      @abilityInputFingerprint, @resolution, @createdAt, @idempotencyKey
    )
  `).run({ ...assessment, idempotencyKey: idempotencyKey ?? null });
  return { assessment, replayed: false };
}

function assessmentReplay(
  row: AssessmentRow,
  candidate: LearnerAssessment,
): { readonly assessment: LearnerAssessment; readonly replayed: boolean } {
  const existing = fromRow(row);
  if (existing.learnerId !== candidate.learnerId || existing.nodeId !== candidate.nodeId
    || existing.kind !== candidate.kind || existing.rating !== candidate.rating
    || existing.reason !== candidate.reason || existing.abilityInputFingerprint !== candidate.abilityInputFingerprint) {
    throw new RangeError("Assessment idempotency key was already used for different input");
  }
  return { assessment: existing, replayed: true };
}

export function listLearnerAssessments(
  db: Database.Database,
  learnerId: string,
  limit = 20,
): readonly LearnerAssessment[] {
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
    throw new RangeError("limit must be an integer from 1 to 100");
  }
  return db.prepare<[string, number], AssessmentRow>(`
    SELECT * FROM learner_assessments
    WHERE learner_id = ? ORDER BY created_at DESC, id ASC LIMIT ?
  `).all(learnerId, limit).map(fromRow);
}

function fromRow(row: AssessmentRow): LearnerAssessment {
  return LearnerAssessmentSchema.parse({
    id: row.id,
    learnerId: row.learner_id,
    nodeId: row.node_id,
    kind: row.kind,
    rating: row.rating,
    reason: row.reason,
    abilityInputFingerprint: row.ability_input_fingerprint,
    resolution: row.resolution,
    createdAt: row.created_at,
  });
}
