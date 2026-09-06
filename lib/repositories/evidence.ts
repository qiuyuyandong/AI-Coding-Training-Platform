import { randomUUID } from "node:crypto";
import type Database from "better-sqlite3";
import { z } from "zod";
import {
  LearningEvidenceEventSchema,
  TrainingSessionSummarySchema,
  type EvidenceNodeMapping,
  type LearningEvidenceEvent,
  type TrainingSessionSummary,
} from "@/lib/domain/evidence";

type EvidenceRow = {
  readonly id: string;
  readonly learner_id: string;
  readonly source_type: string;
  readonly source_id: string;
  readonly event_type: string;
  readonly occurred_at: string;
  readonly facts_json: string;
  readonly provenance_json: string;
  readonly schema_version: string;
  readonly parser_version: string;
  readonly confidence: string;
  readonly supersedes_event_id: string | null;
  readonly idempotency_key: string;
  readonly created_at: string;
};

type SummaryRow = {
  readonly id: string;
  readonly learner_id: string;
  readonly source_type: string;
  readonly source_id: string;
  readonly outcome: string;
  readonly coverage_level: string;
  readonly confidence: string;
  readonly reason_codes_json: string;
  readonly unresolved_facts_json: string;
  readonly evidence_event_ids_json: string;
  readonly classifier_version: string;
  readonly input_fingerprint: string;
  readonly created_at: string;
};

export type AppendEvidenceInput = Omit<LearningEvidenceEvent, "id" | "createdAt"> & {
  readonly createdAt?: string;
};

export function appendEvidenceEvent(
  db: Database.Database,
  input: AppendEvidenceInput,
): { readonly event: LearningEvidenceEvent; readonly replayed: boolean } {
  const createdAt = input.createdAt ?? input.occurredAt;
  const candidate = LearningEvidenceEventSchema.parse({
    ...input,
    id: `evidence_${randomUUID()}`,
    createdAt,
  });
  const result = db.prepare(`
    INSERT OR IGNORE INTO learning_evidence_events (
      id, learner_id, source_type, source_id, event_type, occurred_at,
      facts_json, provenance_json, schema_version, parser_version, confidence,
      supersedes_event_id, idempotency_key, created_at
    ) VALUES (
      @id, @learnerId, @sourceType, @sourceId, @eventType, @occurredAt,
      @factsJson, @provenanceJson, @schemaVersion, @parserVersion, @confidence,
      @supersedesEventId, @idempotencyKey, @createdAt
    )
  `).run(candidate);
  if (result.changes === 1) return { event: candidate, replayed: false };
  const existing = db.prepare<[string], EvidenceRow>(`
    SELECT * FROM learning_evidence_events WHERE idempotency_key = ?
  `).get(candidate.idempotencyKey);
  if (existing === undefined) throw new Error("Evidence replay row disappeared");
  return { event: fromEvidenceRow(existing), replayed: true };
}

export function mapEvidenceToNode(
  db: Database.Database,
  mapping: EvidenceNodeMapping,
): void {
  db.prepare(`
    INSERT INTO evidence_node_mappings (
      evidence_event_id, node_id, role, strength, mapping_reason
    ) VALUES (@evidenceEventId, @nodeId, @role, @strength, @mappingReason)
    ON CONFLICT(evidence_event_id, node_id) DO UPDATE SET
      role = excluded.role,
      strength = excluded.strength,
      mapping_reason = excluded.mapping_reason
  `).run(mapping);
}

export type SaveSummaryInput = Omit<TrainingSessionSummary, "id">;

export function saveTrainingSessionSummary(
  db: Database.Database,
  input: SaveSummaryInput,
): { readonly summary: TrainingSessionSummary; readonly replayed: boolean } {
  const candidate = TrainingSessionSummarySchema.parse({
    ...input,
    id: `summary_${randomUUID()}`,
  });
  const row = {
    id: candidate.id,
    learnerId: candidate.learnerId,
    sourceType: candidate.sourceType,
    sourceId: candidate.sourceId,
    outcome: candidate.outcome,
    coverageLevel: candidate.coverageLevel,
    confidence: candidate.confidence,
    reasonCodesJson: JSON.stringify(candidate.reasonCodes),
    unresolvedFactsJson: JSON.stringify(candidate.unresolvedFacts),
    evidenceEventIdsJson: JSON.stringify(candidate.evidenceEventIds),
    classifierVersion: candidate.classifierVersion,
    inputFingerprint: candidate.inputFingerprint,
    createdAt: candidate.createdAt,
  };
  const result = db.prepare(`
    INSERT OR IGNORE INTO training_session_summaries (
      id, learner_id, source_type, source_id, outcome, coverage_level,
      confidence, reason_codes_json, unresolved_facts_json,
      evidence_event_ids_json, classifier_version, input_fingerprint, created_at
    ) VALUES (
      @id, @learnerId, @sourceType, @sourceId, @outcome, @coverageLevel,
      @confidence, @reasonCodesJson, @unresolvedFactsJson,
      @evidenceEventIdsJson, @classifierVersion, @inputFingerprint, @createdAt
    )
  `).run(row);
  if (result.changes === 1) return { summary: candidate, replayed: false };
  const existing = db.prepare<[string, string, string, string, string], SummaryRow>(`
    SELECT * FROM training_session_summaries
    WHERE learner_id = ? AND source_type = ? AND source_id = ?
      AND classifier_version = ? AND input_fingerprint = ?
  `).get(
    candidate.learnerId,
    candidate.sourceType,
    candidate.sourceId,
    candidate.classifierVersion,
    candidate.inputFingerprint,
  );
  if (existing === undefined) throw new Error("Summary replay row disappeared");
  return { summary: fromSummaryRow(existing), replayed: true };
}

export function listEvidenceForSource(
  db: Database.Database,
  learnerId: string,
  sourceType: LearningEvidenceEvent["sourceType"],
  sourceId: string,
): readonly LearningEvidenceEvent[] {
  return db.prepare<[string, string, string], EvidenceRow>(`
    SELECT * FROM learning_evidence_events
    WHERE learner_id = ? AND source_type = ? AND source_id = ?
    ORDER BY occurred_at ASC, id ASC
  `).all(learnerId, sourceType, sourceId).map(fromEvidenceRow);
}

function fromEvidenceRow(row: EvidenceRow): LearningEvidenceEvent {
  return LearningEvidenceEventSchema.parse({
    id: row.id,
    learnerId: row.learner_id,
    sourceType: row.source_type,
    sourceId: row.source_id,
    eventType: row.event_type,
    occurredAt: row.occurred_at,
    factsJson: row.facts_json,
    provenanceJson: row.provenance_json,
    schemaVersion: row.schema_version,
    parserVersion: row.parser_version,
    confidence: row.confidence,
    supersedesEventId: row.supersedes_event_id,
    idempotencyKey: row.idempotency_key,
    createdAt: row.created_at,
  });
}

const StringArraySchema = z.array(z.string().min(1));

function fromSummaryRow(row: SummaryRow): TrainingSessionSummary {
  return TrainingSessionSummarySchema.parse({
    id: row.id,
    learnerId: row.learner_id,
    sourceType: row.source_type,
    sourceId: row.source_id,
    outcome: row.outcome,
    coverageLevel: row.coverage_level,
    confidence: row.confidence,
    reasonCodes: StringArraySchema.parse(JSON.parse(row.reason_codes_json)),
    unresolvedFacts: StringArraySchema.parse(JSON.parse(row.unresolved_facts_json)),
    evidenceEventIds: StringArraySchema.parse(JSON.parse(row.evidence_event_ids_json)),
    classifierVersion: row.classifier_version,
    inputFingerprint: row.input_fingerprint,
    createdAt: row.created_at,
  });
}
