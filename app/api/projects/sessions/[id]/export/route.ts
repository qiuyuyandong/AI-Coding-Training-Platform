import { NextResponse } from "next/server";
import { openDatabase } from "@/lib/db/client";
import { LOCAL_DEFAULT_LEARNER_ID } from "@/lib/domain/learner";
import { CaptureRequestError, requireSameOrigin } from "@/lib/http/captureRequest";

type RouteContext = { readonly params: Promise<{ readonly id: string }> };

export async function POST(request: Request, context: RouteContext): Promise<Response> {
  try {
    requireSameOrigin(request);
    const { id } = await context.params;
    const db = openDatabase();
    try {
      const session = db.prepare<[string, string], {
        readonly id: string;
        readonly learner_project_id: string;
        readonly template_milestone_id: string;
        readonly language: string;
        readonly toolchain_label: string | null;
        readonly status: string;
        readonly started_at: string;
        readonly ended_at: string | null;
      }>(`
        SELECT session.id, session.learner_project_id, session.template_milestone_id,
               session.language, session.toolchain_label, session.status,
               session.started_at, session.ended_at
        FROM project_practice_sessions session
        WHERE session.id = ? AND session.learner_id = ?
      `).get(id, LOCAL_DEFAULT_LEARNER_ID);
      if (session === undefined) return NextResponse.json({ ok: false, error: "Project session not found" }, { status: 404 });
      const runs = db.prepare<[string]>(`
        SELECT id, kind, result, exit_code, diagnostics, provenance,
               supersedes_result_id, recorded_at
        FROM explicit_run_results WHERE project_session_id = ?
        ORDER BY recorded_at ASC, id ASC
      `).all(id);
      const artifacts = db.prepare<[string]>(`
        SELECT id, kind, purpose, capture_mode, content_hash, byte_size,
               preview_json, recorded_at, deleted_at
        FROM artifact_evidence WHERE project_session_id = ?
        ORDER BY recorded_at ASC, id ASC
      `).all(id);
      const summaries = db.prepare<[string, string]>(`
        SELECT id, outcome, coverage_level, confidence, reason_codes_json,
               unresolved_facts_json, classifier_version, created_at
        FROM training_session_summaries
        WHERE source_type = 'project' AND source_id = ? AND learner_id = ?
        ORDER BY created_at ASC, id ASC
      `).all(id, LOCAL_DEFAULT_LEARNER_ID);
      const payload = JSON.stringify({ schemaVersion: "project-evidence-export-1", session, runs, artifacts, summaries }, null, 2);
      return new Response(payload, {
        status: 200,
        headers: {
          "content-type": "application/json; charset=utf-8",
          "content-disposition": `attachment; filename="project-evidence-${safeFilePart(id)}.json"`,
        },
      });
    } finally {
      db.close();
    }
  } catch (error) {
    if (error instanceof CaptureRequestError) return NextResponse.json({ ok: false, error: error.message }, { status: error.status });
    return NextResponse.json({ ok: false, error: "Failed to export project evidence" }, { status: 500 });
  }
}

function safeFilePart(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]/gu, "_").slice(0, 100);
}
