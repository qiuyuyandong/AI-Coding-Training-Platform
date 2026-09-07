ALTER TABLE ai_quota_ledger ADD COLUMN input_fingerprint TEXT NOT NULL DEFAULT '';
ALTER TABLE ai_request_audit ADD COLUMN input_fingerprint TEXT NOT NULL DEFAULT '';
ALTER TABLE ai_coach_reports ADD COLUMN input_fingerprint TEXT NOT NULL DEFAULT '';
ALTER TABLE ai_plan_change_proposals ADD COLUMN input_fingerprint TEXT NOT NULL DEFAULT '';
