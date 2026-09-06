import { randomUUID } from "node:crypto";
import type Database from "better-sqlite3";
import { z } from "zod";
import type { MappingRole } from "@/lib/domain/ability";
import { AttemptResultSchema } from "@/lib/domain/training";
import {
  appendEvidenceEvent,
  mapEvidenceToNode,
  saveTrainingSessionSummary,
} from "@/lib/repositories/evidence";
import { createOpenReview, selectReviewPracticeTaskId } from "@/lib/repositories/reviews";
import {
  classifyTrainingOutcome,
  type TrainingOutcomeInput,
} from "@/lib/services/trainingOutcomeClassifier";
import { scheduleNextReview } from "@/lib/services/reviewScheduler";

export const ATTEMPT_EVIDENCE_SCHEMA_VERSION = "learning-evidence-1" as const;

type AttemptRow = {
  readonly id: string;
  readonly capture_session_id: string | null;
  readonly record_source: string;
  readonly result: string;
  readonly revision: number;
  readonly reflection: string | null;
  readonly started_at: string;
  readonly ended_at: string | null;
};

type MappingRow = {
  readonly node_id: string;
  readonly role: string;
  readonly mapping_reason: string;
};

export type AttemptEvidenceSignals = Partial<Pick<
  TrainingOutcomeInput,
  "usedAssistance" | "meaningfulChangeCount" | "hasSubmissionSequence" | "hasCodeSnapshot" | "hasRunOrTestEvidence"
>>;

export type AttemptEvidenceResult = {
  readonly evidenceEventId: string;
  readonly summaryId: string;
  readonly reviewIds: readonly string[];
  readonly replayed: boolean;
};

export function replayAttemptEvidence(
  db: Database.Database,
  learnerId: string,
  attemptId: string,
  signals: AttemptEvidenceSignals = {},
): AttemptEvidenceResult {
  return db.transaction(() => {
    const attempt = db.prepare<[string], AttemptRow>(`
      SELECT id, capture_session_id, record_source, result, revision,
             reflection, started_at, ended_at
      FROM training_attempts
      WHERE id = ? AND voided_at IS NULL
    `).get(attemptId);
    if (attempt === undefined) throw new RangeError(`Active attempt '${attemptId}' was not found`);
    const result = AttemptResultSchema.parse(attempt.result);
    const mappings = db.prepare<[string], MappingRow>(`
      SELECT node_id, role, mapping_reason
      FROM attempt_node_mappings
      WHERE attempt_id = ?
      ORDER BY CASE role WHEN 'primary' THEN 0 ELSE 1 END, node_id ASC
    `).all(attemptId);
    const submissionCount = attempt.capture_session_id === null
      ? 1
      : db.prepare<[string], { readonly count: number }>(`
          SELECT COUNT(*) AS count FROM training_attempts
          WHERE capture_session_id = ? AND voided_at IS NULL
        `).get(attempt.capture_session_id)?.count ?? 1;
    const occurredAt = attempt.ended_at ?? attempt.started_at;
    const event = appendEvidenceEvent(db, {
      learnerId,
      sourceType: "attempt",
      sourceId: attempt.id,
      eventType: "result",
      occurredAt,
      factsJson: JSON.stringify({ result, revision: attempt.revision }),
      provenanceJson: JSON.stringify({
        recordSource: attempt.record_source,
        captureSessionId: attempt.capture_session_id,
      }),
      schemaVersion: ATTEMPT_EVIDENCE_SCHEMA_VERSION,
      parserVersion: ATTEMPT_EVIDENCE_SCHEMA_VERSION,
      confidence: attempt.record_source === "capture" ? "medium" : "low",
      supersedesEventId: null,
      idempotencyKey: `attempt:${attempt.id}:revision:${attempt.revision}:result`,
    });
    for (const mapping of mappings) {
      mapEvidenceToNode(db, {
        evidenceEventId: event.event.id,
        nodeId: mapping.node_id,
        role: parseMappingRole(mapping.role),
        strength: mapping.role === "primary" ? 100 : 35,
        mappingReason: mapping.mapping_reason,
      });
    }

    const classification = classifyTrainingOutcome({
      result,
      usedAssistance: signals.usedAssistance ?? null,
      submissionCount,
      meaningfulChangeCount: signals.meaningfulChangeCount ?? 0,
      hasSubmissionSequence: signals.hasSubmissionSequence ?? submissionCount > 1,
      hasCodeSnapshot: signals.hasCodeSnapshot ?? false,
      hasRunOrTestEvidence: signals.hasRunOrTestEvidence ?? false,
      hasReflection: attempt.reflection !== null && attempt.reflection.trim().length > 0,
    });
    const summary = saveTrainingSessionSummary(db, {
      learnerId,
      sourceType: "attempt",
      sourceId: attempt.id,
      outcome: classification.outcome,
      coverageLevel: classification.coverageLevel,
      confidence: classification.confidence,
      reasonCodes: [...classification.reasonCodes],
      unresolvedFacts: [...classification.unresolvedFacts],
      evidenceEventIds: [event.event.id],
      classifierVersion: classification.classifierVersion,
      inputFingerprint: classification.inputFingerprint,
      createdAt: occurredAt,
    });
    if (!event.replayed) {
      db.prepare(`
        UPDATE review_items SET status = 'cancelled'
        WHERE status = 'open' AND source_summary_id IN (
          SELECT id FROM training_session_summaries
          WHERE learner_id = ? AND source_type = 'attempt' AND source_id = ? AND id <> ?
        )
      `).run(learnerId, attempt.id, summary.summary.id);
    }
    const scheduled = scheduleNextReview(summary.summary);
    const reviewIds = mappings
      .filter((mapping) => mapping.role === "primary")
      .slice(0, 1)
      .map((mapping) => createOpenReview(db, {
        learnerId,
        nodeId: mapping.node_id,
        purpose: scheduled.purpose,
        dueAt: scheduled.dueAt,
        priority: scheduled.priority,
        selectedPracticeTaskId: selectReviewPracticeTaskId(db, mapping.node_id, scheduled.purpose),
        schedulerVersion: scheduled.schedulerVersion,
        sourceSummaryId: summary.summary.id,
        reasonCodes: [...scheduled.reasonCodes],
        createdAt: occurredAt,
      }).review.id);
    return {
      evidenceEventId: event.event.id,
      summaryId: summary.summary.id,
      reviewIds,
      replayed: event.replayed && summary.replayed,
    };
  })();
}

export function ensureAttemptNodeMappingsFromCatalog(
  db: Database.Database,
  attemptId: string,
  createdAt: string,
): number {
  const attempt = db.prepare<[string], { readonly platform: string; readonly problem_external_id: string }>(`
    SELECT platform, problem_external_id FROM training_attempts WHERE id = ?
  `).get(attemptId);
  if (attempt === undefined) return 0;
  type CatalogMapping = { readonly node_id: string; readonly role: "primary" | "supporting" };
  const mappings = db.prepare<[string, string], CatalogMapping>(`
    SELECT npm.node_id, npm.measurement_role AS role
    FROM canonical_problem_sources cps
    JOIN practice_tasks pt ON pt.canonical_problem_id = cps.canonical_problem_id
    JOIN node_practice_mappings npm ON npm.practice_task_id = pt.id
    WHERE cps.platform = ? AND cps.external_id = ?
    ORDER BY CASE npm.measurement_role WHEN 'primary' THEN 0 ELSE 1 END, npm.node_id ASC
  `).all(attempt.platform, attempt.problem_external_id);
  let inserted = 0;
  for (const mapping of mappings) {
    inserted += db.prepare(`
      INSERT OR IGNORE INTO attempt_node_mappings (
        id, attempt_id, node_id, role, mapping_reason, created_at
      ) VALUES (?, ?, ?, ?, 'canonical_problem_mapping', ?)
    `).run(`mapping_${randomUUID()}`, attemptId, mapping.node_id, mapping.role, createdAt).changes;
  }
  return inserted;
}

function parseMappingRole(value: string): MappingRole {
  return z.enum(["primary", "supporting"]).parse(value);
}
