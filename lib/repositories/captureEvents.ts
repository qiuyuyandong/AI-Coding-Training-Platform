import type Database from "better-sqlite3";
import { CaptureEventSchema, type CaptureEvent } from "@/lib/capture/events";

export function saveCaptureEvent(db: Database.Database, event: CaptureEvent): boolean {
  const parsed = CaptureEventSchema.parse(event);
  const result = db.prepare(`
    INSERT OR IGNORE INTO capture_events (id, type, platform, problem_external_id, problem_title, canonical_url, occurred_at, payload_json)
    VALUES (@id, @type, @platform, @problemExternalId, @problemTitle, @canonicalUrl, @occurredAt, @payloadJson)
  `).run({ ...parsed, payloadJson: JSON.stringify(parsed.payload) });
  return result.changes > 0;
}

type CaptureEventRow = {
  readonly id: string;
  readonly type: string;
  readonly platform: string;
  readonly problem_external_id: string;
  readonly problem_title: string;
  readonly canonical_url: string;
  readonly occurred_at: string;
  readonly payload_json: string;
};

function fromCaptureEventRow(row: CaptureEventRow): CaptureEvent {
  return CaptureEventSchema.parse({
    id: row.id,
    type: row.type,
    platform: row.platform,
    problemExternalId: row.problem_external_id,
    problemTitle: row.problem_title,
    canonicalUrl: row.canonical_url,
    occurredAt: row.occurred_at,
    payload: JSON.parse(row.payload_json),
  });
}

export function listRecentCaptureEvents(db: Database.Database, limit = 10): CaptureEvent[] {
  const statement = db.prepare<number, CaptureEventRow>("SELECT * FROM capture_events ORDER BY occurred_at DESC LIMIT ?");
  return statement.all(limit).map(fromCaptureEventRow);
}
