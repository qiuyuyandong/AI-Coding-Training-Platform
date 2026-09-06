import { randomUUID } from "node:crypto";
import type Database from "better-sqlite3";
import { z } from "zod";
import { AbilityLevelSchema, MappingRoleSchema, type AbilityLevel } from "@/lib/domain/ability";
import { EvidenceCoverageSchema, EvidenceSourceTypeSchema, TrainingOutcomeSchema } from "@/lib/domain/evidence";
import { upsertAbilitySnapshot } from "@/lib/repositories/ability";
import {
  EVIDENCE_ABILITY_PROJECTOR_VERSION,
  projectEvidenceAbility,
  type EvidenceAbilityFact,
} from "@/lib/services/evidenceAbilityProjector";

type FactRow = {
  readonly summary_id: string;
  readonly source_type: string;
  readonly source_id: string;
  readonly task_identity: string;
  readonly outcome: string;
  readonly coverage_level: string;
  readonly confidence: string;
  readonly node_id: string;
  readonly role: string;
  readonly created_at: string;
  readonly unfamiliar_transfer: number;
  readonly evidence_event_ids_json: string;
};

export function replayEvidenceAbility(
  db: Database.Database,
  learnerId: string,
  now: string,
): readonly string[] {
  const rows = db.prepare<[string], FactRow>(`
    SELECT summary.id AS summary_id, summary.source_type, summary.source_id,
           summary.outcome, summary.coverage_level, summary.confidence,
           COALESCE(problem_source.canonical_problem_id, session.template_milestone_id, summary.source_id) AS task_identity,
           mapping.node_id, mapping.role, summary.created_at,
           CASE WHEN milestone.unfamiliar_change = 1 THEN 1 ELSE 0 END AS unfamiliar_transfer,
           summary.evidence_event_ids_json
    FROM training_session_summaries summary
    JOIN learning_evidence_events event
      ON event.learner_id = summary.learner_id
     AND event.source_type = summary.source_type
     AND event.source_id = summary.source_id
    JOIN evidence_node_mappings mapping ON mapping.evidence_event_id = event.id
    LEFT JOIN project_practice_sessions session
      ON summary.source_type = 'project' AND session.id = summary.source_id
    LEFT JOIN project_template_milestones milestone ON milestone.id = session.template_milestone_id
    LEFT JOIN training_attempts attempt
      ON summary.source_type = 'attempt' AND attempt.id = summary.source_id
    LEFT JOIN canonical_problem_sources problem_source
      ON problem_source.platform = attempt.platform
     AND problem_source.external_id = attempt.problem_external_id
     AND problem_source.is_primary = 1
    WHERE summary.learner_id = ?
      AND (summary.source_type = 'project' OR attempt.voided_at IS NULL)
      AND NOT EXISTS (
        SELECT 1 FROM training_session_summaries newer
        WHERE newer.learner_id = summary.learner_id
          AND newer.source_type = summary.source_type
          AND newer.source_id = summary.source_id
          AND (newer.created_at > summary.created_at
            OR (newer.created_at = summary.created_at AND newer.id > summary.id))
      )
    GROUP BY summary.id, mapping.node_id, mapping.role
    ORDER BY summary.created_at ASC, summary.id ASC
  `).all(learnerId);
  const byNode = new Map<string, EvidenceAbilityFact[]>();
  for (const row of rows) {
    const fact: EvidenceAbilityFact = {
      summaryId: row.summary_id,
      sourceType: EvidenceSourceTypeSchema.parse(row.source_type),
      sourceId: row.source_id,
      taskIdentity: row.task_identity,
      outcome: TrainingOutcomeSchema.parse(row.outcome),
      coverageLevel: EvidenceCoverageSchema.parse(row.coverage_level),
      confidence: z.enum(["low", "medium", "high"]).parse(row.confidence),
      role: MappingRoleSchema.parse(row.role),
      createdAt: row.created_at,
      unfamiliarTransfer: row.unfamiliar_transfer === 1,
      evidenceEventIds: z.array(z.string().min(1)).parse(JSON.parse(row.evidence_event_ids_json)),
    };
    const nodeFacts = byNode.get(row.node_id) ?? [];
    nodeFacts.push(fact);
    byNode.set(row.node_id, nodeFacts);
  }
  const transitionIds: string[] = [];
  for (const [nodeId, facts] of [...byNode.entries()].sort(([left], [right]) => left.localeCompare(right))) {
    const latestEvidenceAt = facts.at(-1)?.createdAt;
    if (latestEvidenceAt !== undefined) {
      db.prepare(`
        UPDATE learner_assessments SET resolution = 'resolved_by_evidence'
        WHERE learner_id = ? AND node_id = ?
          AND resolution = 'pending_verification' AND created_at < ?
      `).run(learnerId, nodeId, latestEvidenceAt);
    }
    const previous = db.prepare<[string, string], {
      readonly visible_level: string;
      readonly input_fingerprint: string;
      readonly projection_version: string;
    }>(`
      SELECT visible_level, input_fingerprint, projection_version
      FROM ability_snapshots WHERE learner_id = ? AND node_id = ?
    `).get(learnerId, nodeId);
    const previousLevel: AbilityLevel = AbilityLevelSchema.parse(previous?.visible_level ?? "unassessed");
    const projection = projectEvidenceAbility({ learnerId, nodeId, previousLevel, facts, now });
    const replayedEvidence = previous?.projection_version === EVIDENCE_ABILITY_PROJECTOR_VERSION
      && previous.input_fingerprint === projection.inputFingerprint;
    const visibleLevel = replayedEvidence ? previousLevel : projection.visibleLevel;
    upsertAbilitySnapshot(db, {
      learner_id: learnerId,
      node_id: nodeId,
      visible_level: visibleLevel,
      confidence: projection.confidence,
      evidence_count: projection.evidenceCount,
      stale: projection.stale,
      input_fingerprint: projection.inputFingerprint,
      projection_version: EVIDENCE_ABILITY_PROJECTOR_VERSION,
      as_of_time: now,
    });
    if (visibleLevel === previousLevel) continue;
    const id = `evidence_transition_${randomUUID()}`;
    const inserted = db.prepare(`
      INSERT OR IGNORE INTO evidence_ability_transitions (
        id, learner_id, node_id, previous_level, new_level,
        reason_codes_json, source_summary_ids_json, source_evidence_ids_json,
        input_fingerprint, projection_version, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id, learnerId, nodeId, previousLevel, visibleLevel,
      JSON.stringify(projection.reasonCodes), JSON.stringify(projection.sourceSummaryIds),
      JSON.stringify(projection.sourceEvidenceIds), projection.inputFingerprint,
      EVIDENCE_ABILITY_PROJECTOR_VERSION, now,
    );
    if (inserted.changes === 1) transitionIds.push(id);
  }
  return transitionIds;
}
