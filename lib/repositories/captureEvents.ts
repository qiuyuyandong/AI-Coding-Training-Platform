import type Database from "better-sqlite3";
import { CaptureEventSchema, type CaptureEvent } from "@/lib/capture/events";

export function saveCaptureEvent(db: Database.Database, event: CaptureEvent): void {
  const parsed = CaptureEventSchema.parse(event);
  db.prepare(`
    INSERT INTO capture_events (id, type, platform, problem_external_id, problem_title, canonical_url, occurred_at, payload_json)
    VALUES (@id, @type, @platform, @problemExternalId, @problemTitle, @canonicalUrl, @occurredAt, @payloadJson)
  `).run({ ...parsed, payloadJson: JSON.stringify(parsed.payload) });
}