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
};

export function appendLearnerAssessment(
  db: Database.Database,
  input: Omit<LearnerAssessment, "id" | "resolution">,
): LearnerAssessment {
  const assessment = LearnerAssessmentSchema.parse({
    ...input,
    id: `assessment_${randomUUID()}`,
    resolution: "pending_verification",
  });
  db.prepare(`
    INSERT INTO learner_assessments (
      id, learner_id, node_id, kind, rating, reason,
      ability_input_fingerprint, resolution, created_at
    ) VALUES (
      @id, @learnerId, @nodeId, @kind, @rating, @reason,
      @abilityInputFingerprint, @resolution, @createdAt
    )
  `).run(assessment);
  return assessment;
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
