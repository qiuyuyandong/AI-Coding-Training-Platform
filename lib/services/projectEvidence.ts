import { createHash } from "node:crypto";
import { join } from "node:path";
import type Database from "better-sqlite3";
import { z } from "zod";
import type { CaptureMode } from "@/lib/domain/evidence";
import { RubricScoresSchema, rubricPasses, type RubricScores } from "@/lib/domain/project";
import { LOCAL_DEFAULT_LEARNER_ID } from "@/lib/domain/learner";
import {
  appendEvidenceEvent,
  mapEvidenceToNode,
  saveTrainingSessionSummary,
} from "@/lib/repositories/evidence";
import {
  createLearnerProject,
  startProjectSession,
  confirmProjectMilestone,
  confirmProjectSessionMilestoneStatus,
  assessProjectMilestone,
} from "@/lib/repositories/projectPractice";
import {
  installProjectTemplate,
  loadProjectTemplateDefinition,
} from "@/lib/repositories/projectTemplates";
import { createOpenReview, selectReviewPracticeTaskId } from "@/lib/repositories/reviews";
import { classifyTrainingOutcome } from "@/lib/services/trainingOutcomeClassifier";
import { scheduleNextReview } from "@/lib/services/reviewScheduler";
import { replayEvidenceAbility } from "@/lib/services/evidenceAbilityReplay";

const PROJECT_EVIDENCE_VERSION = "project-evidence-1" as const;
const ProjectCompletionResultSchema = z.object({
  summaryId: z.string().min(1),
  outcome: z.enum([
    "independent_effective_completion",
    "assisted_effective_completion",
    "productive_struggle",
    "unproductive_trial_and_error",
    "insufficient_evidence",
  ]),
  reviewId: z.string().nullable(),
  milestoneRecordId: z.string().min(1),
  rubricAssessmentId: z.string().min(1),
  projectCompleted: z.boolean(),
  nextSessionId: z.string().nullable(),
  nextMilestoneTitle: z.string().nullable(),
}).strict();
type ProjectCompletionResult = z.infer<typeof ProjectCompletionResultSchema>;

type SessionRow = {
  readonly id: string;
  readonly learner_project_id: string;
  readonly learner_id: string;
  readonly template_milestone_id: string;
  readonly rubric_version: string;
  readonly toolchain_label: string | null;
  readonly started_at: string;
  readonly status: string;
};

type NextMilestoneRow = {
  readonly id: string;
  readonly stable_id: string;
  readonly title: string;
  readonly template_stable_id: string;
  readonly template_version: string;
  readonly language: string;
};

type RunRow = {
  readonly id: string;
  readonly kind: "build" | "test" | "check";
  readonly result: "passed" | "failed" | "not_run";
  readonly exit_code: number | null;
  readonly diagnostics: string | null;
  readonly recorded_at: string;
};

type ArtifactRow = {
  readonly id: string;
  readonly kind: string;
  readonly content_hash: string;
  readonly byte_size: number;
  readonly recorded_at: string;
};

type NodeRow = {
  readonly node_id: string;
  readonly role: "primary" | "supporting";
};

export function startDefaultProject(
  db: Database.Database,
  input: {
    readonly learnerId?: string;
    readonly captureMode: CaptureMode;
    readonly now: string;
    readonly toolchainLabel?: string | null;
  },
): { readonly projectId: string; readonly sessionId: string; readonly milestoneId: string; readonly replayed: boolean } {
  return db.transaction(() => {
    const definition = loadProjectTemplateDefinition(join(
      process.cwd(),
      "content",
      "projects",
      "cpp-task-tracker-v1.json",
    ));
    const template = installProjectTemplate(db, definition, input.now);
    const learnerId = input.learnerId ?? LOCAL_DEFAULT_LEARNER_ID;
    const existing = db.prepare<[string, string], {
      readonly project_id: string;
      readonly session_id: string;
      readonly milestone_id: string;
      readonly capture_mode: string;
      readonly toolchain_label: string | null;
    }>(`
      SELECT project.id AS project_id, session.id AS session_id,
             session.template_milestone_id AS milestone_id,
             project.capture_mode, session.toolchain_label
      FROM learner_projects project
      JOIN project_practice_sessions session ON session.learner_project_id = project.id
      WHERE project.learner_id = ? AND project.template_id = ?
        AND project.status = 'active' AND session.status = 'active'
      ORDER BY session.started_at DESC LIMIT 1
    `).get(learnerId, template.id);
    if (existing !== undefined) {
      if (existing.capture_mode !== input.captureMode
        || existing.toolchain_label !== (input.toolchainLabel ?? null)) {
        throw new RangeError("Active project request conflicts with its saved capture mode or toolchain");
      }
      return {
        projectId: existing.project_id,
        sessionId: existing.session_id,
        milestoneId: existing.milestone_id,
        replayed: true,
      };
    }
    const project = createLearnerProject(db, {
      learnerId,
      templateId: template.id,
      title: template.title,
      captureMode: input.captureMode,
      now: input.now,
    });
    const milestone = db.prepare<[string], { readonly id: string }>(`
      SELECT id FROM project_template_milestones
      WHERE template_id = ? ORDER BY order_index ASC LIMIT 1
    `).get(template.id);
    if (milestone === undefined) throw new Error("Installed project template has no milestone");
    const practiceTask = db.prepare<[string], { readonly id: string }>(`
      SELECT id FROM practice_tasks
      WHERE stable_id = ? ORDER BY id ASC LIMIT 1
    `).get(`project-${definition.stableId}-${definition.milestones[0]?.stableId ?? ""}`);
    const session = startProjectSession(db, {
      learnerProjectId: project.id,
      learnerId,
      templateMilestoneId: milestone.id,
      practiceTaskId: practiceTask?.id ?? null,
      language: template.language,
      toolchainLabel: input.toolchainLabel ?? null,
      provenanceJson: JSON.stringify({ initiatedBy: "learner", templateVersion: template.version }),
      now: input.now,
    });
    confirmProjectMilestone(db, {
      learnerProjectId: project.id,
      templateMilestoneId: milestone.id,
      status: "started",
      evidenceIds: [],
      confirmedAt: input.now,
    });
    return { projectId: project.id, sessionId: session.id, milestoneId: milestone.id, replayed: false };
  })();
}

export function completeProjectSessionEvidence(
  db: Database.Database,
  input: {
    readonly sessionId: string;
    readonly usedAssistance: boolean | null;
    readonly rubricScores: RubricScores;
    readonly reflection?: string | null;
    readonly now: string;
  },
): ProjectCompletionResult & { readonly replayed: boolean } {
  const rubricScores = RubricScoresSchema.parse(input.rubricScores);
  if (!rubricPasses(rubricScores)) {
    throw new RangeError("Function, testing, integration, and explanation rubric scores must each be at least 2");
  }
  const reflection = input.reflection?.trim() || null;
  const inputFingerprint = createHash("sha256").update(JSON.stringify({
    sessionId: input.sessionId,
    usedAssistance: input.usedAssistance,
    rubricScores,
    reflection,
  })).digest("hex");
  return db.transaction(() => {
    const receipt = db.prepare<[string], { readonly input_fingerprint: string; readonly result_json: string }>(`
      SELECT input_fingerprint, result_json FROM project_session_completion_receipts
      WHERE project_session_id = ?
    `).get(input.sessionId);
    if (receipt !== undefined) {
      if (receipt.input_fingerprint !== inputFingerprint) {
        throw new RangeError("Project completion request was already used with different input");
      }
      return { ...ProjectCompletionResultSchema.parse(JSON.parse(receipt.result_json)), replayed: true };
    }
    const session = db.prepare<[string], SessionRow>(`
      SELECT session.id, session.learner_project_id, session.learner_id,
             session.template_milestone_id, milestone.rubric_version,
             session.toolchain_label, session.started_at, session.status
      FROM project_practice_sessions session
      JOIN project_template_milestones milestone ON milestone.id = session.template_milestone_id
      WHERE session.id = ?
    `).get(input.sessionId);
    if (session === undefined) throw new RangeError(`Project session '${input.sessionId}' was not found`);
    if (session.status !== "active") throw new RangeError(`Project session '${input.sessionId}' is not active`);
    const runs = db.prepare<[string], RunRow>(`
      SELECT id, kind, result, exit_code, diagnostics, recorded_at
      FROM explicit_run_results current
      WHERE project_session_id = ?
        AND NOT EXISTS (
          SELECT 1 FROM explicit_run_results correction
          WHERE correction.supersedes_result_id = current.id
        )
      ORDER BY recorded_at ASC, id ASC
    `).all(session.id);
    if (runs.length === 0) throw new RangeError("At least one explicit build, test, or check result is required");
    const artifacts = db.prepare<[string], ArtifactRow>(`
      SELECT id, kind, content_hash, byte_size, recorded_at
      FROM artifact_evidence
      WHERE project_session_id = ? AND deleted_at IS NULL
      ORDER BY recorded_at ASC, id ASC
    `).all(session.id);
    const nodes = db.prepare<[string], NodeRow>(`
      SELECT node_id, role FROM project_milestone_nodes
      WHERE template_milestone_id = ?
      ORDER BY CASE role WHEN 'primary' THEN 0 ELSE 1 END, node_id ASC
    `).all(session.template_milestone_id);
    if (nodes.length === 0) throw new Error("Project milestone has no node mapping");

    const eventIds: string[] = [];
    for (const run of runs) {
      const event = appendEvidenceEvent(db, {
        learnerId: session.learner_id,
        sourceType: "project",
        sourceId: session.id,
        eventType: run.kind === "test" ? "test" : "run",
        occurredAt: run.recorded_at,
        factsJson: JSON.stringify({ kind: run.kind, result: run.result, exitCode: run.exit_code }),
        provenanceJson: JSON.stringify({ explicit: true, diagnosticsPresent: run.diagnostics !== null }),
        schemaVersion: PROJECT_EVIDENCE_VERSION,
        parserVersion: PROJECT_EVIDENCE_VERSION,
        confidence: "high",
        supersedesEventId: null,
        idempotencyKey: `project-run:${run.id}`,
      });
      eventIds.push(event.event.id);
      mapAllNodes(db, event.event.id, nodes);
    }
    for (const artifact of artifacts) {
      const event = appendEvidenceEvent(db, {
        learnerId: session.learner_id,
        sourceType: "project",
        sourceId: session.id,
        eventType: "snapshot",
        occurredAt: artifact.recorded_at,
        factsJson: JSON.stringify({ kind: artifact.kind, contentHash: artifact.content_hash, byteSize: artifact.byte_size }),
        provenanceJson: JSON.stringify({ explicitlySelected: true }),
        schemaVersion: PROJECT_EVIDENCE_VERSION,
        parserVersion: PROJECT_EVIDENCE_VERSION,
        confidence: "high",
        supersedesEventId: null,
        idempotencyKey: `project-artifact:${artifact.id}`,
      });
      eventIds.push(event.event.id);
      mapAllNodes(db, event.event.id, nodes);
    }

    const hasPassedTest = runs.some((run) => run.kind === "test" && run.result === "passed");
    const hasFailure = runs.some((run) => run.result === "failed");
    const classification = classifyTrainingOutcome({
      result: hasPassedTest && !hasFailure ? "passed" : artifacts.length > 0 ? "partial" : "failed",
      usedAssistance: input.usedAssistance,
      submissionCount: 1,
      meaningfulChangeCount: artifacts.length,
      hasSubmissionSequence: false,
      hasCodeSnapshot: artifacts.some((artifact) => artifact.kind === "snapshot" || artifact.kind === "diff"),
      hasRunOrTestEvidence: true,
      hasReflection: reflection !== null,
    });
    const summary = saveTrainingSessionSummary(db, {
      learnerId: session.learner_id,
      sourceType: "project",
      sourceId: session.id,
      outcome: classification.outcome,
      coverageLevel: classification.coverageLevel,
      confidence: classification.confidence,
      reasonCodes: [...classification.reasonCodes],
      unresolvedFacts: [...classification.unresolvedFacts],
      evidenceEventIds: eventIds,
      classifierVersion: classification.classifierVersion,
      inputFingerprint: classification.inputFingerprint,
      createdAt: input.now,
    });
    const scheduled = scheduleNextReview(summary.summary);
    const primaryNode = nodes.find((node) => node.role === "primary") ?? nodes[0];
    const review = primaryNode === undefined ? null : createOpenReview(db, {
      learnerId: session.learner_id,
      nodeId: primaryNode.node_id,
      purpose: scheduled.purpose,
      dueAt: scheduled.dueAt,
      priority: scheduled.priority,
      selectedPracticeTaskId: selectReviewPracticeTaskId(db, primaryNode.node_id, scheduled.purpose),
      schedulerVersion: scheduled.schedulerVersion,
      sourceSummaryId: summary.summary.id,
      reasonCodes: [...scheduled.reasonCodes],
      createdAt: input.now,
    }).review;
    if (reflection !== null) {
      confirmProjectSessionMilestoneStatus(db, {
        projectSessionId: session.id,
        status: "retrospective",
        reflection,
        evidenceIds: eventIds,
        confirmedAt: input.now,
      });
    }
    const milestoneRecordId = confirmProjectMilestone(db, {
      learnerProjectId: session.learner_project_id,
      templateMilestoneId: session.template_milestone_id,
      status: "completed",
      reflection,
      evidenceIds: eventIds,
      confirmedAt: input.now,
    });
    const rubric = assessProjectMilestone(db, {
      projectMilestoneId: milestoneRecordId,
      rubricVersion: session.rubric_version,
      scores: rubricScores,
      evidenceIds: eventIds,
      assessedAt: input.now,
    });
    for (const node of nodes) {
      for (const evidenceEventId of eventIds) {
        db.prepare(`
          INSERT OR IGNORE INTO project_node_evidence (
            project_milestone_id, node_id, role, evidence_event_id
          ) VALUES (?, ?, ?, ?)
        `).run(milestoneRecordId, node.node_id, node.role, evidenceEventId);
      }
    }
    db.prepare(`
      UPDATE project_practice_sessions SET status = 'completed', ended_at = ? WHERE id = ?
    `).run(input.now, session.id);
    const nextMilestone = db.prepare<[string], NextMilestoneRow>(`
      SELECT next.id, next.stable_id, next.title,
             template.stable_id AS template_stable_id,
             template.version AS template_version,
             template.language
      FROM project_template_milestones current
      JOIN project_template_milestones next
        ON next.template_id = current.template_id
       AND next.order_index = current.order_index + 1
      JOIN project_templates template ON template.id = current.template_id
      WHERE current.id = ?
    `).get(session.template_milestone_id);
    let nextSessionId: string | null = null;
    if (nextMilestone === undefined) {
      db.prepare(`UPDATE learner_projects SET status = 'completed', updated_at = ? WHERE id = ?`)
        .run(input.now, session.learner_project_id);
    } else {
      const practiceTask = db.prepare<[string], { readonly id: string }>(`
        SELECT id FROM practice_tasks WHERE stable_id = ? ORDER BY id ASC LIMIT 1
      `).get(`project-${nextMilestone.template_stable_id}-${nextMilestone.stable_id}`);
      const nextSession = startProjectSession(db, {
        learnerProjectId: session.learner_project_id,
        learnerId: session.learner_id,
        templateMilestoneId: nextMilestone.id,
        practiceTaskId: practiceTask?.id ?? null,
        language: nextMilestone.language,
        toolchainLabel: session.toolchain_label,
        provenanceJson: JSON.stringify({
          initiatedBy: "milestone_progression",
          templateVersion: nextMilestone.template_version,
          previousSessionId: session.id,
        }),
        now: input.now,
      });
      nextSessionId = nextSession.id;
      confirmProjectMilestone(db, {
        learnerProjectId: session.learner_project_id,
        templateMilestoneId: nextMilestone.id,
        status: "started",
        evidenceIds: [],
        confirmedAt: input.now,
      });
      db.prepare(`UPDATE learner_projects SET updated_at = ? WHERE id = ?`)
        .run(input.now, session.learner_project_id);
    }
    replayEvidenceAbility(db, session.learner_id, input.now);
    const result: ProjectCompletionResult = {
      summaryId: summary.summary.id,
      outcome: summary.summary.outcome,
      reviewId: review?.id ?? null,
      milestoneRecordId,
      rubricAssessmentId: rubric.id,
      projectCompleted: nextMilestone === undefined,
      nextSessionId,
      nextMilestoneTitle: nextMilestone?.title ?? null,
    };
    db.prepare(`
      INSERT INTO project_session_completion_receipts (
        project_session_id, input_fingerprint, result_json, completed_at
      ) VALUES (?, ?, ?, ?)
    `).run(input.sessionId, inputFingerprint, JSON.stringify(result), input.now);
    return { ...result, replayed: false };
  })();
}

function mapAllNodes(
  db: Database.Database,
  evidenceEventId: string,
  nodes: readonly NodeRow[],
): void {
  for (const node of nodes) {
    mapEvidenceToNode(db, {
      evidenceEventId,
      nodeId: node.node_id,
      role: node.role,
      strength: node.role === "primary" ? 100 : 35,
      mappingReason: "project_template_milestone",
    });
  }
}
