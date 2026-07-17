import { readFileSync } from "node:fs";
import { join } from "node:path";
import type Database from "better-sqlite3";
import { z } from "zod";
import type {
  CareerTrack,
  KnowledgeEdge,
  KnowledgeNode,
  PracticeMapping,
} from "@/lib/domain/curriculum";
import type { LearningResource } from "@/lib/domain/resource";
import {
  PackageCareersFileSchema,
  PackageManifestSchema,
  type PackageManifest,
} from "@/lib/curriculum/packageSchema";
import {
  buildPackageId,
  computeChecksumInput,
  validatePackage,
  type ValidationError,
} from "@/lib/curriculum/validatePackage";

/**
 * Thrown when an attempt is made to install the same `(track_slug,
 * semantic_version)` pair with a *different* checksum. The current
 * installed content must be uninstalled through a future explicit
 * release flow before a conflicting package can replace it.
 */
export class ConflictError extends Error {
  constructor(
    message: string,
    readonly context: {
      readonly trackSlug: string;
      readonly semanticVersion: string;
      readonly existingChecksum: string;
      readonly incomingChecksum: string;
    },
  ) {
    super(message);
    this.name = "ConflictError";
  }
}

/**
 * Thrown when an attempt is made to install an *older* version on top of
 * a strictly higher one. The curriculum is append-only: once a 1.0.1
 * ships, 1.0.0 cannot be re-imported without a manual downgrade path
 * (which V0 deliberately does not provide).
 */
export class ImmutableError extends Error {
  constructor(
    message: string,
    readonly context: {
      readonly trackSlug: string;
      readonly attemptedVersion: string;
      readonly existingVersion: string;
    },
  ) {
    super(message);
    this.name = "ImmutableError";
  }
}

export type ImportCounts = {
  readonly nodes: number;
  readonly edges: number;
  readonly resources: number;
  readonly practiceMappings: number;
  readonly practiceSources: number;
  readonly nodeResourceLinks: number;
  readonly nodePracticeLinks: number;
  readonly careers: number;
  readonly canonicalProblems: number;
};

export type ImportResult =
  | {
      readonly ok: true;
      readonly package_id: string;
      readonly track_slug: string;
      readonly semantic_version: string;
      readonly checksum: string;
      readonly replayed: boolean;
      readonly counts: ImportCounts;
    }
  | { readonly ok: false; readonly errors: readonly ValidationError[] };

export type ImportOptions = {
  readonly now?: () => string;
};

export type LoadedPackage = {
  readonly manifest: PackageManifest;
  readonly nodes: readonly KnowledgeNode[];
  readonly edges: readonly KnowledgeEdge[];
  readonly resources: readonly LearningResource[];
  readonly practiceMappings: readonly PracticeMapping[];
  readonly careers: z.infer<typeof PackageCareersFileSchema>;
};

/**
 * Load every package file from disk and return the parsed bundle. Used
 * by both the CLI and the importer; exposed for tests so they can reuse
 * the same loader against fixture directories.
 */
export function loadPackageFromDisk(packagePath: string): LoadedPackage {
  const manifest = parseJson(packagePath, "manifest.json", PackageManifestSchema);
  const nodes = parseJson(packagePath, "nodes.json", z.array(z.unknown()));
  const edges = parseJson(packagePath, "edges.json", z.array(z.unknown()));
  const resources = parseJson(packagePath, "resources.json", z.array(z.unknown()));
  const practiceMappings = parseJson(
    packagePath,
    "practice-mappings.json",
    z.array(z.unknown()),
  );
  const careersPath = join(packagePath, manifest.careers_file);
  const careers = parseJsonAbsolute(careersPath, PackageCareersFileSchema);
  return {
    manifest,
    nodes: nodes as readonly KnowledgeNode[],
    edges: edges as readonly KnowledgeEdge[],
    resources: resources as readonly LearningResource[],
    practiceMappings: practiceMappings as readonly PracticeMapping[],
    careers,
  };
}

function parseJson<T>(
  baseDir: string,
  fileName: string,
  schema: z.ZodType<T>,
): T {
  return parseJsonAbsolute(join(baseDir, fileName), schema);
}

function parseJsonAbsolute<T>(
  absolutePath: string,
  schema: z.ZodType<T>,
): T {
  const raw = readFileSync(absolutePath, "utf8");
  const value: unknown = JSON.parse(raw);
  return schema.parse(value);
}

/**
 * Transactional package importer.
 *
 * Contract:
 *   - `db` is the SQLite handle. The function never opens or closes it.
 *   - `packagePath` is the directory holding `manifest.json`, the four
 *     `*.json` data files and the careers companion referenced from the
 *     manifest.
 *   - Returns a discriminated union: `ok: true` carries the deterministic
 *     package id, the SHA-256 checksum and the resulting row counts;
 *     `ok: false` carries the validator's sorted error list.
 *   - Throws `ConflictError` when the same slug+version exists with a
 *     different checksum (re-import protection).
 *   - Throws `ImmutableError` when a strictly higher semantic_version
 *     already exists at the same slug (append-only curriculum).
 *   - On any other thrown error, the entire transaction rolls back: no
 *     partial state survives.
 */
export function importPackage(
  db: Database.Database,
  packagePath: string,
  options: ImportOptions = {},
): ImportResult {
  const loaded = loadPackageFromDisk(packagePath);

  const validation = validatePackage(loaded);
  if (!validation.ok) {
    return { ok: false, errors: validation.errors };
  }

  const normalized = validation.normalized;
  const now = options.now ?? (() => new Date().toISOString());
  const installedAt = now();

  const tx = db.transaction(() => {
    const existingRow = db
      .prepare<
        [string, string],
        {
          readonly id: string;
          readonly checksum: string;
          readonly semantic_version: string;
        }
      >(
        `SELECT id, checksum, semantic_version
           FROM curriculum_packages
          WHERE track_slug = ? AND semantic_version = ?`,
      )
      .get(loaded.manifest.track_slug, loaded.manifest.semantic_version);

    if (existingRow !== undefined) {
      if (existingRow.checksum === normalized.checksum) {
        const counts = readExistingCounts(db, existingRow.id);
        return {
          ok: true as const,
          package_id: existingRow.id,
          track_slug: loaded.manifest.track_slug,
          semantic_version: loaded.manifest.semantic_version,
          checksum: normalized.checksum,
          replayed: true,
          counts,
        };
      }
      throw new ConflictError(
        `Package ${loaded.manifest.track_slug}@${loaded.manifest.semantic_version} already exists with a different checksum`,
        {
          trackSlug: loaded.manifest.track_slug,
          semanticVersion: loaded.manifest.semantic_version,
          existingChecksum: existingRow.checksum,
          incomingChecksum: normalized.checksum,
        },
      );
    }

    const higherRow = db
      .prepare<[string, string], { readonly semantic_version: string }>(
        `SELECT semantic_version
           FROM curriculum_packages
          WHERE track_slug = ?
            AND semantic_version > ?`,
      )
      .get(loaded.manifest.track_slug, loaded.manifest.semantic_version);
    if (higherRow !== undefined) {
      throw new ImmutableError(
        `Package ${loaded.manifest.track_slug}@${loaded.manifest.semantic_version} cannot replace the higher ${higherRow.semantic_version}`,
        {
          trackSlug: loaded.manifest.track_slug,
          attemptedVersion: loaded.manifest.semantic_version,
          existingVersion: higherRow.semantic_version,
        },
      );
    }

    const packageId = normalized.packageId;
    const checksumInput = computeChecksumInput(loaded);
    if (checksumInput !== loaded.manifest.checksum_input) {
      throw new Error(
        "Refusing to import a package whose checksum_input does not match its files",
      );
    }

    db.prepare(
      `INSERT INTO curriculum_packages (
         id, track_slug, semantic_version, checksum,
         source_revision, installed_at
       ) VALUES (?, ?, ?, ?, ?, ?)`,
    ).run(
      packageId,
      loaded.manifest.track_slug,
      loaded.manifest.semantic_version,
      normalized.checksum,
      loaded.manifest.source_revision,
      installedAt,
    );

    const canonicalProblemIds = insertCanonicalProblems(
      db,
      loaded.practiceMappings,
    );
    const practiceSourceCount = insertCanonicalProblemSources(
      db,
      loaded.practiceMappings,
      canonicalProblemIds,
    );
    insertKnowledgeNodes(db, loaded.nodes, packageId);
    insertKnowledgeEdges(db, loaded.edges);
    insertLearningResources(db, loaded.resources, packageId);
    const nodeResourceLinkCount = insertNodeResources(
      db,
      loaded.resources,
      loaded.nodes,
    );
    insertPracticeTasks(db, loaded.practiceMappings, canonicalProblemIds, packageId);
    const nodePracticeLinkCount = insertNodePracticeMappings(
      db,
      loaded.practiceMappings,
    );
    insertCareerTracks(db, loaded.careers.careers, packageId);

    const counts: ImportCounts = {
      nodes: loaded.nodes.length,
      edges: loaded.edges.length,
      resources: loaded.resources.length,
      practiceMappings: loaded.practiceMappings.length,
      practiceSources: practiceSourceCount,
      nodeResourceLinks: nodeResourceLinkCount,
      nodePracticeLinks: nodePracticeLinkCount,
      careers: loaded.careers.careers.length,
      canonicalProblems: canonicalProblemIds.size,
    };

    return {
      ok: true as const,
      package_id: packageId,
      track_slug: loaded.manifest.track_slug,
      semantic_version: loaded.manifest.semantic_version,
      checksum: normalized.checksum,
      replayed: false,
      counts,
    };
  });

  return tx();
}

function insertCanonicalProblems(
  db: Database.Database,
  mappings: readonly PracticeMapping[],
): Map<string, string> {
  const result = new Map<string, string>();
  const insert = db.prepare(
    `INSERT OR IGNORE INTO canonical_problems (id, stable_id, title)
     VALUES (?, ?, ?)`,
  );
  for (const mapping of mappings) {
    const id = `cp_${mapping.canonical_problem_stable_id}`;
    insert.run(id, mapping.canonical_problem_stable_id, mapping.title);
    result.set(mapping.canonical_problem_stable_id, id);
  }
  return result;
}

function insertCanonicalProblemSources(
  db: Database.Database,
  mappings: readonly PracticeMapping[],
  canonicalProblemIds: ReadonlyMap<string, string>,
): number {
  const insert = db.prepare(
    `INSERT OR IGNORE INTO canonical_problem_sources (
       id, canonical_problem_id, platform, external_id, url, is_primary
     ) VALUES (?, ?, ?, ?, ?, ?)`,
  );
  let count = 0;
  for (const mapping of mappings) {
    const canonicalProblemId = canonicalProblemIds.get(
      mapping.canonical_problem_stable_id,
    );
    if (canonicalProblemId === undefined) continue;
    for (const source of mapping.sources) {
      const id = `cpsrc_${source.platform}_${source.external_id}`;
      insert.run(
        id,
        canonicalProblemId,
        source.platform,
        source.external_id,
        source.url,
        source.is_primary ? 1 : 0,
      );
      count += 1;
    }
  }
  return count;
}

function insertKnowledgeNodes(
  db: Database.Database,
  nodes: readonly KnowledgeNode[],
  packageId: string,
): void {
  const insert = db.prepare(
    `INSERT OR IGNORE INTO knowledge_nodes (
       id, stable_id, title, outcome, rationale, order_index,
       status, provenance_json, package_id
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  for (const node of nodes) {
    const id = `node_${node.stable_id}`;
    insert.run(
      id,
      node.stable_id,
      node.title,
      node.outcome,
      node.rationale,
      node.order_index,
      node.status,
      JSON.stringify(node.provenance),
      packageId,
    );
  }
}

function insertKnowledgeEdges(
  db: Database.Database,
  edges: readonly KnowledgeEdge[],
): void {
  const insert = db.prepare(
    `INSERT OR IGNORE INTO knowledge_edges (
       id, from_node_id, to_node_id, edge_type
     ) VALUES (?, ?, ?, ?)`,
  );
  for (const edge of edges) {
    const fromId = `node_${edge.from_stable_id}`;
    const toId = `node_${edge.to_stable_id}`;
    const id = `edge_${edge.from_stable_id}_${edge.to_stable_id}_${edge.edge_type}`;
    insert.run(id, fromId, toId, edge.edge_type);
  }
}

function insertLearningResources(
  db: Database.Database,
  resources: readonly LearningResource[],
  packageId: string,
): void {
  const insert = db.prepare(
    `INSERT OR IGNORE INTO learning_resources (
       id, stable_id, title, url, author, language, cost, access,
       license_boundary, review_status, reviewed_at, stopping_guidance,
       package_id
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  for (const resource of resources) {
    const id = `res_${resource.stable_id}`;
    insert.run(
      id,
      resource.stable_id,
      resource.title,
      resource.url,
      resource.author,
      resource.language,
      resource.cost,
      resource.access,
      resource.license_boundary,
      resource.review_status,
      resource.reviewed_at,
      resource.stopping_guidance,
      packageId,
    );
  }
}

function insertNodeResources(
  db: Database.Database,
  resources: readonly LearningResource[],
  nodes: readonly KnowledgeNode[],
): number {
  const nodeIds = new Map<string, string>();
  for (const node of nodes) {
    nodeIds.set(node.stable_id, `node_${node.stable_id}`);
  }
  const insert = db.prepare(
    `INSERT OR IGNORE INTO node_resources (node_id, resource_id, role, sort_order)
     VALUES (?, ?, ?, ?)`,
  );
  let count = 0;
  for (const resource of resources) {
    const nodeId = nodeIds.get(resource.node_stable_id);
    if (nodeId === undefined) continue;
    insert.run(nodeId, `res_${resource.stable_id}`, resource.role, 0);
    count += 1;
  }
  return count;
}

function insertPracticeTasks(
  db: Database.Database,
  mappings: readonly PracticeMapping[],
  canonicalProblemIds: ReadonlyMap<string, string>,
  packageId: string,
): void {
  const insert = db.prepare(
    `INSERT OR IGNORE INTO practice_tasks (
       id, stable_id, canonical_problem_id, title, kind, difficulty_band,
       package_id
     ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
  );
  for (const mapping of mappings) {
    const canonicalProblemId = canonicalProblemIds.get(
      mapping.canonical_problem_stable_id,
    );
    if (canonicalProblemId === undefined) continue;
    const id = `task_${mapping.practice_task_stable_id}`;
    insert.run(
      id,
      mapping.practice_task_stable_id,
      canonicalProblemId,
      mapping.title,
      mapping.kind,
      mapping.difficulty_band,
      packageId,
    );
  }
}

function insertNodePracticeMappings(
  db: Database.Database,
  mappings: readonly PracticeMapping[],
): number {
  const insert = db.prepare(
    `INSERT OR IGNORE INTO node_practice_mappings (
       node_id, practice_task_id, measurement_role, variant_family_id,
       sort_order
     ) VALUES (?, ?, ?, ?, ?)`,
  );
  let count = 0;
  let sortOrder = 0;
  for (const mapping of mappings) {
    insert.run(
      `node_${mapping.node_stable_id}`,
      `task_${mapping.practice_task_stable_id}`,
      "primary",
      null,
      sortOrder,
    );
    sortOrder += 1;
    count += 1;
  }
  return count;
}

function insertCareerTracks(
  db: Database.Database,
  careers: readonly CareerTrack[],
  packageId: string,
): void {
  const insert = db.prepare(
    `INSERT OR IGNORE INTO career_tracks (id, slug, name, summary, status, package_id)
     VALUES (?, ?, ?, ?, ?, ?)`,
  );
  for (const career of careers) {
    insert.run(
      `career_${career.slug}`,
      career.slug,
      career.name,
      JSON.stringify(career.summary),
      career.status,
      packageId,
    );
  }
}

function readExistingCounts(
  db: Database.Database,
  packageId: string,
): ImportCounts {
  const scalar = (sql: string, param: string): number =>
    db
      .prepare<[string], { readonly count: number }>(sql)
      .get(param)?.count ?? 0;
  return {
    nodes: scalar(
      `SELECT COUNT(*) AS count FROM knowledge_nodes WHERE package_id = ?`,
      packageId,
    ),
    edges: scalar(
      `SELECT COUNT(*) AS count
         FROM knowledge_edges e
         JOIN knowledge_nodes n ON n.id = e.from_node_id
        WHERE n.package_id = ?`,
      packageId,
    ),
    resources: scalar(
      `SELECT COUNT(*) AS count FROM learning_resources WHERE package_id = ?`,
      packageId,
    ),
    practiceMappings: scalar(
      `SELECT COUNT(*) AS count FROM practice_tasks WHERE package_id = ?`,
      packageId,
    ),
    practiceSources: scalar(
      `SELECT COUNT(*) AS count
         FROM canonical_problem_sources s
         JOIN practice_tasks t ON t.canonical_problem_id = s.canonical_problem_id
        WHERE t.package_id = ?`,
      packageId,
    ),
    nodeResourceLinks: scalar(
      `SELECT COUNT(*) AS count
         FROM node_resources nr
         JOIN knowledge_nodes n ON n.id = nr.node_id
        WHERE n.package_id = ?`,
      packageId,
    ),
    nodePracticeLinks: scalar(
      `SELECT COUNT(*) AS count
         FROM node_practice_mappings npm
         JOIN knowledge_nodes n ON n.id = npm.node_id
        WHERE n.package_id = ?`,
      packageId,
    ),
    careers: scalar(
      `SELECT COUNT(*) AS count FROM career_tracks WHERE package_id = ?`,
      packageId,
    ),
    canonicalProblems: scalar(
      `SELECT COUNT(*) AS count
         FROM canonical_problems cp
         JOIN practice_tasks t ON t.canonical_problem_id = cp.id
        WHERE t.package_id = ?`,
      packageId,
    ),
  };
}

export { buildPackageId };