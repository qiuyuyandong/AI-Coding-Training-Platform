import { ProjectWorkspace } from "@/components/ProjectWorkspace";
import { openDatabase } from "@/lib/db/client";
import { LOCAL_DEFAULT_LEARNER_ID } from "@/lib/domain/learner";
import { getOrCreateLocalProfile } from "@/lib/repositories/learnerProfiles";
import { listLearnerProjects } from "@/lib/repositories/projectPractice";
import { loadProjectTemplateDefinition } from "@/lib/repositories/projectTemplates";
import { join } from "node:path";

export const dynamic = "force-dynamic";

type ActiveRow = {
  readonly project_id: string;
  readonly project_title: string;
  readonly capture_mode: "full" | "basic" | "minimal";
  readonly session_id: string;
  readonly milestone_title: string;
};
type ArtifactRow = { readonly id: string; readonly kind: string; readonly purpose: string; readonly recorded_at: string };
type RunRow = { readonly id: string; readonly kind: "build" | "test" | "check"; readonly result: string; readonly recorded_at: string };

export default function ProjectsPage() {
  const definition = loadProjectTemplateDefinition(join(
    process.cwd(), "content", "projects", "cpp-task-tracker-v1.json",
  ));
  const db = openDatabase();
  try {
    getOrCreateLocalProfile(db);
    const projects = listLearnerProjects(db, LOCAL_DEFAULT_LEARNER_ID);
    const active = db.prepare<[string], ActiveRow>(`
      SELECT lp.id AS project_id, lp.title AS project_title,
             lp.capture_mode, ps.id AS session_id, tm.title AS milestone_title
      FROM learner_projects lp
      JOIN project_practice_sessions ps ON ps.learner_project_id = lp.id
      JOIN project_template_milestones tm ON tm.id = ps.template_milestone_id
      WHERE lp.learner_id = ? AND lp.status = 'active' AND ps.status = 'active'
      ORDER BY ps.started_at DESC LIMIT 1
    `).get(LOCAL_DEFAULT_LEARNER_ID);
    const artifacts = active === undefined ? [] : db.prepare<[string], ArtifactRow>(`
      SELECT id, kind, purpose, recorded_at FROM artifact_evidence
      WHERE project_session_id = ? AND deleted_at IS NULL ORDER BY recorded_at DESC
    `).all(active.session_id);
    const runResults = active === undefined ? [] : db.prepare<[string], RunRow>(`
      SELECT id, kind, result, recorded_at FROM explicit_run_results
      WHERE project_session_id = ? ORDER BY recorded_at DESC
    `).all(active.session_id);
    return <ProjectWorkspace
      templateTitle={definition.title}
      templateSummary={definition.summary}
      projectCount={projects.length}
      activeProject={active === undefined ? null : {
        projectId: active.project_id,
        projectTitle: active.project_title,
        captureMode: active.capture_mode,
        sessionId: active.session_id,
        milestoneTitle: active.milestone_title,
        artifacts: artifacts.map((artifact) => ({ id: artifact.id, kind: artifact.kind, purpose: artifact.purpose, recordedAt: artifact.recorded_at })),
        runResults: runResults.map((run) => ({ id: run.id, kind: run.kind, result: run.result, recordedAt: run.recorded_at })),
      }}
    />;
  } finally {
    db.close();
  }
}
