import type Database from "better-sqlite3";
import {
  CaptureEventSchema,
  type CaptureEvent,
} from "@/lib/capture/protocol";

type CaptureEventRow = {
  readonly id: string;
  readonly schema_version: number;
  readonly type: string;
  readonly capture_session_id: string;
  readonly submission_id: string | null;
  readonly installation_id: string;
  readonly adapter_version: string;
  readonly parser_version: string;
  readonly page_origin: string;
  readonly provenance_level: string;
  readonly platform: string;
  readonly problem_external_id: string;
  readonly problem_title: string;
  readonly canonical_url: string;
  readonly occurred_at: string;
  readonly payload_json: string;
};

export function findCaptureEventFingerprint(
  db: Database.Database,
  eventId: string,
): string | null {
  const row = db
    .prepare<string, { readonly event_fingerprint: string }>(
      "SELECT event_fingerprint FROM capture_events WHERE id = ?",
    )
    .get(eventId);
  return row?.event_fingerprint ?? null;
}

export function insertCaptureEvent(
  db: Database.Database,
  event: CaptureEvent,
  fingerprint: string,
  receivedAt: string,
): void {
  const parsed = CaptureEventSchema.parse(event);
  db.prepare(`
    INSERT INTO capture_events (
      id, schema_version, type, capture_session_id, submission_id,
      installation_id, adapter_version, parser_version, page_origin,
      provenance_level, platform, problem_external_id, problem_title,
      canonical_url, occurred_at, payload_json, event_fingerprint, received_at
    ) VALUES (
      @id, @schemaVersion, @type, @captureSessionId, @submissionId,
      @installationId, @adapterVersion, @parserVersion, @pageOrigin,
      @provenanceLevel, @platform, @problemExternalId, @problemTitle,
      @canonicalUrl, @occurredAt, @payloadJson, @fingerprint, @receivedAt
    )
  `).run({
    ...parsed,
    submissionId: "submissionId" in parsed ? parsed.submissionId : null,
    payloadJson: JSON.stringify(parsed.payload),
    fingerprint,
    receivedAt,
  });
}

export function listRecentCaptureEvents(
  db: Database.Database,
  limit = 10,
): CaptureEvent[] {
  return db
    .prepare<number, CaptureEventRow>(
      "SELECT * FROM capture_events ORDER BY occurred_at DESC LIMIT ?",
    )
    .all(limit)
    .map(fromRow);
}

function fromRow(row: CaptureEventRow): CaptureEvent {
  const payload: unknown = JSON.parse(row.payload_json);
  const base = {
    schemaVersion: row.schema_version,
    id: row.id,
    type: row.type,
    captureSessionId: row.capture_session_id,
    installationId: row.installation_id,
    adapterVersion: row.adapter_version,
    parserVersion: row.parser_version,
    pageOrigin: row.page_origin,
    provenanceLevel: row.provenance_level,
    platform: row.platform,
    problemExternalId: row.problem_external_id,
    problemTitle: row.problem_title,
    canonicalUrl: row.canonical_url,
    occurredAt: row.occurred_at,
    payload,
  };
  return row.submission_id === null
    ? CaptureEventSchema.parse(base)
    : CaptureEventSchema.parse({ ...base, submissionId: row.submission_id });
}
