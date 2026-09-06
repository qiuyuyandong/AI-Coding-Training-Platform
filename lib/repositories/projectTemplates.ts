import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import type Database from "better-sqlite3";
import {
  ProjectTemplateDefinitionSchema,
  ProjectTemplateSchema,
  type ProjectTemplate,
  type ProjectTemplateDefinition,
} from "@/lib/domain/project";

type TemplateRow = {
  readonly id: string;
  readonly stable_id: string;
  readonly version: string;
  readonly title: string;
  readonly summary: string;
  readonly language: string;
  readonly definition_hash: string;
  readonly status: string;
  readonly created_at: string;
};

export function loadProjectTemplateDefinition(path: string): ProjectTemplateDefinition {
  return ProjectTemplateDefinitionSchema.parse(JSON.parse(readFileSync(path, "utf8")));
}

export function installProjectTemplate(
  db: Database.Database,
  definition: ProjectTemplateDefinition,
  now: string,
): ProjectTemplate {
  const parsed = ProjectTemplateDefinitionSchema.parse(definition);
  const definitionHash = createHash("sha256").update(JSON.stringify(parsed)).digest("hex");
  const existing = db.prepare<[string, string], TemplateRow>(`
    SELECT * FROM project_templates WHERE stable_id = ? AND version = ?
  `).get(parsed.stableId, parsed.version);
  if (existing !== undefined) {
    if (existing.definition_hash !== definitionHash) {
      throw new RangeError(`Project template '${parsed.stableId}@${parsed.version}' changed without a version bump`);
    }
    return fromTemplateRow(existing);
  }

  return db.transaction(() => {
    const templateId = stableRowId("template", `${parsed.stableId}@${parsed.version}`);
    const packageRow = db.prepare<[], { readonly id: string }>(`
      SELECT id FROM curriculum_packages ORDER BY installed_at DESC LIMIT 1
    `).get();
    if (packageRow === undefined) throw new RangeError("A curriculum package must be installed before project templates");
    db.prepare(`
      INSERT INTO project_templates (
        id, stable_id, version, title, summary, language, definition_hash, status, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, 'published', ?)
    `).run(
      templateId,
      parsed.stableId,
      parsed.version,
      parsed.title,
      parsed.summary,
      parsed.language,
      definitionHash,
      now,
    );
    for (const [orderIndex, milestone] of parsed.milestones.entries()) {
      const milestoneId = stableRowId("template_milestone", `${templateId}:${milestone.stableId}`);
      const taskStableId = `project-${parsed.stableId}-${milestone.stableId}`;
      const canonicalId = stableRowId("canonical_project", taskStableId);
      const practiceTaskId = stableRowId("project_task", taskStableId);
      db.prepare(`
        INSERT INTO canonical_problems (id, stable_id, title) VALUES (?, ?, ?)
      `).run(canonicalId, taskStableId, milestone.title);
      db.prepare(`
        INSERT INTO canonical_problem_sources (
          id, canonical_problem_id, platform, external_id, url, is_primary
        ) VALUES (?, ?, 'manual', ?, ?, 1)
      `).run(
        stableRowId("canonical_project_source", taskStableId),
        canonicalId,
        taskStableId,
        `manual://projects/${parsed.stableId}/${milestone.stableId}`,
      );
      db.prepare(`
        INSERT INTO practice_tasks (
          id, stable_id, canonical_problem_id, title, kind, difficulty_band, package_id
        ) VALUES (?, ?, ?, ?, 'project_milestone', 'medium', ?)
      `).run(practiceTaskId, taskStableId, canonicalId, milestone.title, packageRow.id);
      db.prepare(`
        INSERT INTO project_template_milestones (
          id, template_id, stable_id, title, outcome, order_index,
          unfamiliar_change, rubric_version
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        milestoneId,
        templateId,
        milestone.stableId,
        milestone.title,
        milestone.outcome,
        orderIndex,
        milestone.unfamiliarChange ? 1 : 0,
        milestone.rubricVersion,
      );
      for (const node of milestone.nodes) {
        const nodeRow = db.prepare<[string], { readonly id: string }>(`
          SELECT id FROM knowledge_nodes WHERE stable_id = ? AND status = 'published'
          ORDER BY package_id DESC LIMIT 1
        `).get(node.stableId);
        if (nodeRow === undefined) throw new RangeError(`Project milestone references missing node '${node.stableId}'`);
        db.prepare(`
          INSERT INTO project_milestone_nodes (template_milestone_id, node_id, role)
          VALUES (?, ?, ?)
        `).run(milestoneId, nodeRow.id, node.role);
        db.prepare(`
          INSERT INTO node_practice_mappings (
            node_id, practice_task_id, measurement_role, variant_family_id, sort_order
          ) VALUES (?, ?, ?, ?, ?)
        `).run(
          nodeRow.id,
          practiceTaskId,
          node.role,
          `project-${parsed.stableId}`,
          orderIndex,
        );
      }
    }
    const inserted = db.prepare<[string], TemplateRow>("SELECT * FROM project_templates WHERE id = ?").get(templateId);
    if (inserted === undefined) throw new Error("Inserted project template disappeared");
    return fromTemplateRow(inserted);
  })();
}

export function listPublishedProjectTemplates(db: Database.Database): readonly ProjectTemplate[] {
  return db.prepare<[], TemplateRow>(`
    SELECT * FROM project_templates WHERE status = 'published'
    ORDER BY title ASC, version DESC
  `).all().map(fromTemplateRow);
}

function stableRowId(prefix: string, value: string): string {
  return `${prefix}_${createHash("sha256").update(value).digest("hex").slice(0, 24)}`;
}

function fromTemplateRow(row: TemplateRow): ProjectTemplate {
  return ProjectTemplateSchema.parse({
    id: row.id,
    stableId: row.stable_id,
    version: row.version,
    title: row.title,
    summary: row.summary,
    language: row.language,
    definitionHash: row.definition_hash,
    status: row.status,
    createdAt: row.created_at,
  });
}
