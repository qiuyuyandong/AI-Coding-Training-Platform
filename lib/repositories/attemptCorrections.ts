import type Database from "better-sqlite3";
import {
  AttemptCorrectionSchema,
  type AttemptCorrection,
  type AttemptCorrectionChange,
} from "@/lib/domain/training";

type AttemptCorrectionRow = {
  readonly correction_id: string;
  readonly attempt_id: string;
  readonly field_name: string;
  readonly old_value: string | null;
  readonly new_value: string | null;
  readonly reason: string;
  readonly corrected_at: string;
  readonly resulting_revision: number;
};

type MutableCorrection = {
  readonly id: string;
  readonly attemptId: string;
  readonly reason: string;
  readonly correctedAt: string;
  readonly resultingRevision: number;
  readonly changes: AttemptCorrectionChange[];
};

export function insertAttemptCorrectionChanges(
  db: Database.Database,
  correction: AttemptCorrection,
): void {
  const parsed = AttemptCorrectionSchema.parse(correction);
  const insert = db.prepare(`
    INSERT INTO attempt_corrections (
      correction_id, attempt_id, field_name, old_value, new_value,
      reason, corrected_at, resulting_revision
    ) VALUES (
      @correctionId, @attemptId, @fieldName, @oldValue, @newValue,
      @reason, @correctedAt, @resultingRevision
    )
  `);
  for (const change of parsed.changes) {
    insert.run({
      correctionId: parsed.id,
      attemptId: parsed.attemptId,
      fieldName: change.field,
      oldValue: change.oldValue,
      newValue: change.newValue,
      reason: parsed.reason,
      correctedAt: parsed.correctedAt,
      resultingRevision: parsed.resultingRevision,
    });
  }
}

export function listAttemptCorrections(
  db: Database.Database,
  attemptId: string,
): AttemptCorrection[] {
  const rows = db.prepare<[string, string], AttemptCorrectionRow>(`
    WITH recent_corrections AS (
      SELECT correction_id, MAX(corrected_at) AS corrected_at
      FROM attempt_corrections
      WHERE attempt_id = ?
      GROUP BY correction_id
      ORDER BY corrected_at DESC, correction_id DESC
      LIMIT 100
    )
    SELECT correction.*
    FROM attempt_corrections AS correction
    INNER JOIN recent_corrections AS recent
      ON recent.correction_id = correction.correction_id
    WHERE correction.attempt_id = ?
    ORDER BY correction.corrected_at DESC,
      correction.correction_id DESC,
      correction.field_name ASC
  `).all(attemptId, attemptId);

  const grouped = new Map<string, MutableCorrection>();
  for (const row of rows) {
    const existing = grouped.get(row.correction_id);
    const change = {
      field: row.field_name,
      oldValue: row.old_value,
      newValue: row.new_value,
    };
    if (existing !== undefined) {
      existing.changes.push(AttemptCorrectionSchema.shape.changes.element.parse(change));
      continue;
    }
    grouped.set(row.correction_id, {
      id: row.correction_id,
      attemptId: row.attempt_id,
      reason: row.reason,
      correctedAt: row.corrected_at,
      resultingRevision: row.resulting_revision,
      changes: [AttemptCorrectionSchema.shape.changes.element.parse(change)],
    });
  }
  return [...grouped.values()].map((correction) =>
    AttemptCorrectionSchema.parse(correction));
}
