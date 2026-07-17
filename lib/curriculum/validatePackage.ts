import { createHash } from "node:crypto";
import type {
  CareerTrack,
  KnowledgeEdge,
  KnowledgeNode,
  PracticeMapping,
} from "@/lib/domain/curriculum";
import type { LearningResource } from "@/lib/domain/resource";
import type { PackageManifest } from "@/lib/curriculum/packageSchema";

/**
 * One machine-readable validator error. The `code` is stable across runs
 * and is what callers should match against (it does not change when the
 * human-readable message is rewritten). `path` is a dotted JSON-pointer
 * style location; it is sorted before the validator returns so two runs
 * with identical input always produce byte-equivalent failure payloads.
 */
export type ValidationError = {
  readonly code: string;
  readonly path: string;
  readonly message: string;
};

/**
 * Discriminated union returned by every `validatePackage` call.
 *
 * - `ok: true` carries a `normalized` view: the deterministic package id,
 *   the SHA-256 checksum, and the counts the importer needs.
 * - `ok: false` carries a fully sorted, fully deduplicated error list.
 *
 * Callers must treat the result shape as exhaustive and ignore unknown
 * fields rather than treat `ok` as truthy.
 */
export type ValidateResult =
  | {
      readonly ok: true;
      readonly normalized: {
        readonly packageId: string;
        readonly checksum: string;
        readonly counts: {
          readonly nodes: number;
          readonly edges: number;
          readonly resources: number;
          readonly practiceMappings: number;
          readonly careers: number;
        };
        readonly primaryByNode: ReadonlyMap<string, LearningResource>;
        readonly mappingByNode: ReadonlyMap<string, PracticeMapping>;
        readonly canonicalProblemIds: ReadonlyMap<string, string>;
      };
    }
  | { readonly ok: false; readonly errors: readonly ValidationError[] };

export type CurriculumPackageInput = {
  readonly manifest: PackageManifest;
  readonly nodes: readonly KnowledgeNode[];
  readonly edges: readonly KnowledgeEdge[];
  readonly resources: readonly LearningResource[];
  readonly practiceMappings: readonly PracticeMapping[];
  readonly careers: { readonly careers: readonly CareerTrack[] };
};

/**
 * Stable set of error codes the validator may emit. Exported so callers,
 * tests, and CLI scripts can pattern-match without parsing free-text
 * messages.
 */
export const VALIDATION_ERROR_CODES = {
  manifestChecksumMismatch: "manifest.checksum_mismatch",
  manifestInvalidChecksumInput: "manifest.invalid_checksum_input",
  nodesDuplicateStableId: "nodes.duplicate_stable_id",
  nodesInvalidProvenanceUrl: "nodes.invalid_provenance_url",
  nodesPublishedMissingResource: "nodes.published_missing_resource",
  nodesPublishedMissingPractice: "nodes.published_missing_practice",
  nodesPublishedMissingOutcome: "nodes.published_missing_outcome",
  nodesPublishedMissingRationale: "nodes.published_missing_rationale",
  nodesPublishedMissingStoppingGuidance: "nodes.published_missing_stopping_guidance",
  nodesPublishedMissingProvenance: "nodes.published_missing_provenance",
  edgesDuplicate: "edges.duplicate",
  edgesSelfEdge: "edges.self_edge",
  edgesUnknownNode: "edges.unknown_node",
  edgesCycle: "edges.cycle",
  resourcesDuplicateStableId: "resources.duplicate_stable_id",
  resourcesUnknownNode: "resources.unknown_node",
  resourcesInvalidUrl: "resources.invalid_url",
  practiceDuplicateStableId: "practice.duplicate_stable_id",
  practiceDuplicateCanonicalProblem: "practice.duplicate_canonical_problem",
  practiceUnknownNode: "practice.unknown_node",
  practiceInvalidUrl: "practice.invalid_url",
  practiceDuplicateSource: "practice.duplicate_source",
  practiceMultiplePrimary: "practice.multiple_primary",
  careersCountInvalid: "careers.count_invalid",
  careersDuplicateSlug: "careers.duplicate_slug",
} as const;

/**
 * Pure, deterministic validator. It does not read from disk and does not
 * touch SQLite; callers load the JSON files and pass the parsed contents
 * in. The function returns either a normalized bundle the importer can
 * consume directly or a fully sorted list of `ValidationError`.
 */
export function validatePackage(input: CurriculumPackageInput): ValidateResult {
  const errors: ValidationError[] = [];

  const checksumInput = computeChecksumInput(input);
  if (checksumInput !== input.manifest.checksum_input) {
    errors.push({
      code: VALIDATION_ERROR_CODES.manifestChecksumMismatch,
      path: "manifest.checksum_input",
      message:
        "manifest.checksum_input does not match the canonical concatenation of every other package file",
    });
  }

  const checksum = sha256Hex(checksumInput);

  const nodeIds = new Set<string>();
  for (const node of input.nodes) {
    if (nodeIds.has(node.stable_id)) {
      errors.push({
        code: VALIDATION_ERROR_CODES.nodesDuplicateStableId,
        path: `nodes[${node.stable_id}].stable_id`,
        message: `Duplicate knowledge_node stable_id: ${node.stable_id}`,
      });
    }
    nodeIds.add(node.stable_id);

    const provenanceUrlError = validateHttpUrl(node.provenance.url);
    if (provenanceUrlError !== null) {
      errors.push({
        code: VALIDATION_ERROR_CODES.nodesInvalidProvenanceUrl,
        path: `nodes[${node.stable_id}].provenance.url`,
        message: provenanceUrlError,
      });
    }
  }

  const edgeKeys = new Set<string>();
  const adjacency = new Map<string, string[]>();
  for (const node of input.nodes) {
    adjacency.set(node.stable_id, []);
  }
  for (const edge of input.edges) {
    const key = `${edge.from_stable_id}\u0000${edge.to_stable_id}\u0000${edge.edge_type}`;
    if (edgeKeys.has(key)) {
      errors.push({
        code: VALIDATION_ERROR_CODES.edgesDuplicate,
        path: `edges[${edge.from_stable_id}->${edge.to_stable_id}:${edge.edge_type}]`,
        message: `Duplicate knowledge_edge: ${edge.from_stable_id} -> ${edge.to_stable_id} (${edge.edge_type})`,
      });
      continue;
    }
    edgeKeys.add(key);

    if (edge.from_stable_id === edge.to_stable_id) {
      errors.push({
        code: VALIDATION_ERROR_CODES.edgesSelfEdge,
        path: `edges[${edge.from_stable_id}->${edge.to_stable_id}]`,
        message: `Self-edge is forbidden: ${edge.from_stable_id}`,
      });
      continue;
    }

    if (!nodeIds.has(edge.from_stable_id)) {
      errors.push({
        code: VALIDATION_ERROR_CODES.edgesUnknownNode,
        path: `edges[${edge.from_stable_id}->${edge.to_stable_id}].from_stable_id`,
        message: `Edge references unknown from_node: ${edge.from_stable_id}`,
      });
    }
    if (!nodeIds.has(edge.to_stable_id)) {
      errors.push({
        code: VALIDATION_ERROR_CODES.edgesUnknownNode,
        path: `edges[${edge.from_stable_id}->${edge.to_stable_id}].to_stable_id`,
        message: `Edge references unknown to_node: ${edge.to_stable_id}`,
      });
    }

    const list = adjacency.get(edge.from_stable_id);
    if (list !== undefined) list.push(edge.to_stable_id);
  }

  if (hasCycle(adjacency)) {
    errors.push({
      code: VALIDATION_ERROR_CODES.edgesCycle,
      path: "edges",
      message: "Knowledge graph contains at least one cycle",
    });
  }

  const resourceIds = new Set<string>();
  const primaryByNode = new Map<string, LearningResource>();
  for (const resource of input.resources) {
    if (resourceIds.has(resource.stable_id)) {
      errors.push({
        code: VALIDATION_ERROR_CODES.resourcesDuplicateStableId,
        path: `resources[${resource.stable_id}].stable_id`,
        message: `Duplicate learning_resource stable_id: ${resource.stable_id}`,
      });
    }
    resourceIds.add(resource.stable_id);

    if (!nodeIds.has(resource.node_stable_id)) {
      errors.push({
        code: VALIDATION_ERROR_CODES.resourcesUnknownNode,
        path: `resources[${resource.stable_id}].node_stable_id`,
        message: `Resource references unknown node: ${resource.node_stable_id}`,
      });
    }

    const urlError = validateHttpUrl(resource.url);
    if (urlError !== null) {
      errors.push({
        code: VALIDATION_ERROR_CODES.resourcesInvalidUrl,
        path: `resources[${resource.stable_id}].url`,
        message: urlError,
      });
    }

    if (
      resource.review_status === "reviewed" &&
      primaryByNode.get(resource.node_stable_id) === undefined
    ) {
      primaryByNode.set(resource.node_stable_id, resource);
    }
  }

  const practiceIds = new Set<string>();
  const mappingByNode = new Map<string, PracticeMapping>();
  const canonicalProblemIds = new Map<string, string>();
  const sourceKeyToMapping = new Map<string, string>();
  const canonicalPrimary = new Map<string, string>();

  for (const mapping of input.practiceMappings) {
    if (practiceIds.has(mapping.practice_task_stable_id)) {
      errors.push({
        code: VALIDATION_ERROR_CODES.practiceDuplicateStableId,
        path: `practice_mappings[${mapping.practice_task_stable_id}].practice_task_stable_id`,
        message: `Duplicate practice_task stable_id: ${mapping.practice_task_stable_id}`,
      });
    }
    practiceIds.add(mapping.practice_task_stable_id);

    if (canonicalProblemIds.has(mapping.canonical_problem_stable_id)) {
      errors.push({
        code: VALIDATION_ERROR_CODES.practiceDuplicateCanonicalProblem,
        path: `practice_mappings[${mapping.practice_task_stable_id}].canonical_problem_stable_id`,
        message: `Duplicate canonical_problem stable_id: ${mapping.canonical_problem_stable_id}`,
      });
    }
    canonicalProblemIds.set(
      mapping.canonical_problem_stable_id,
      `cp_${mapping.canonical_problem_stable_id}`,
    );

    if (!nodeIds.has(mapping.node_stable_id)) {
      errors.push({
        code: VALIDATION_ERROR_CODES.practiceUnknownNode,
        path: `practice_mappings[${mapping.practice_task_stable_id}].node_stable_id`,
        message: `Practice mapping references unknown node: ${mapping.node_stable_id}`,
      });
    }

    if (mappingByNode.get(mapping.node_stable_id) === undefined) {
      mappingByNode.set(mapping.node_stable_id, mapping);
    }

    for (const source of mapping.sources) {
      const urlError = validateHttpUrl(source.url);
      if (urlError !== null) {
        errors.push({
          code: VALIDATION_ERROR_CODES.practiceInvalidUrl,
          path: `practice_mappings[${mapping.practice_task_stable_id}].sources[${source.external_id}].url`,
          message: urlError,
        });
      }

      const sourceKey = `${source.platform}\u0000${source.external_id}`;
      const existingMapping = sourceKeyToMapping.get(sourceKey);
      if (existingMapping !== undefined && existingMapping !== mapping.practice_task_stable_id) {
        errors.push({
          code: VALIDATION_ERROR_CODES.practiceDuplicateSource,
          path: `practice_mappings[${mapping.practice_task_stable_id}].sources[${source.platform}/${source.external_id}]`,
          message: `Duplicate canonical_source (${source.platform}, ${source.external_id})`,
        });
      } else {
        sourceKeyToMapping.set(sourceKey, mapping.practice_task_stable_id);
      }

      if (source.is_primary) {
        const existingPrimary = canonicalPrimary.get(mapping.canonical_problem_stable_id);
        if (existingPrimary !== undefined && existingPrimary !== mapping.practice_task_stable_id) {
          errors.push({
            code: VALIDATION_ERROR_CODES.practiceMultiplePrimary,
            path: `practice_mappings[${mapping.practice_task_stable_id}].sources[${source.platform}/${source.external_id}]`,
            message: `Multiple primary sources for canonical_problem ${mapping.canonical_problem_stable_id}`,
          });
        } else {
          canonicalPrimary.set(mapping.canonical_problem_stable_id, mapping.practice_task_stable_id);
        }
      }
    }
  }

  for (const node of input.nodes) {
    if (node.status !== "published") continue;

    const fieldEmpty = (
      value: string,
      code: string,
    ): ValidationError | null => {
      if (value.trim().length === 0) {
        return {
          code,
          path: `nodes[${node.stable_id}]`,
          message: `Published node ${node.stable_id} requires a non-empty ${code.split(".").pop()}`,
        };
      }
      return null;
    };

    const outcomeError = fieldEmpty(node.outcome, VALIDATION_ERROR_CODES.nodesPublishedMissingOutcome);
    if (outcomeError !== null) errors.push(outcomeError);
    const rationaleError = fieldEmpty(node.rationale, VALIDATION_ERROR_CODES.nodesPublishedMissingRationale);
    if (rationaleError !== null) errors.push(rationaleError);
    const stoppingError = fieldEmpty(
      node.stopping_guidance,
      VALIDATION_ERROR_CODES.nodesPublishedMissingStoppingGuidance,
    );
    if (stoppingError !== null) errors.push(stoppingError);
    if (
      node.provenance.authority.trim().length === 0 ||
      node.provenance.url.trim().length === 0 ||
      node.provenance.retrieved_at.trim().length === 0
    ) {
      errors.push({
        code: VALIDATION_ERROR_CODES.nodesPublishedMissingProvenance,
        path: `nodes[${node.stable_id}].provenance`,
        message: `Published node ${node.stable_id} requires a complete provenance block`,
      });
    }

    if (primaryByNode.get(node.stable_id) === undefined) {
      errors.push({
        code: VALIDATION_ERROR_CODES.nodesPublishedMissingResource,
        path: `nodes[${node.stable_id}]`,
        message: `Published node ${node.stable_id} requires exactly one reviewed primary resource`,
      });
    }
    if (mappingByNode.get(node.stable_id) === undefined) {
      errors.push({
        code: VALIDATION_ERROR_CODES.nodesPublishedMissingPractice,
        path: `nodes[${node.stable_id}]`,
        message: `Published node ${node.stable_id} requires at least one practice mapping`,
      });
    }
  }

  const careers = input.careers.careers;
  if (careers.length !== 9) {
    errors.push({
      code: VALIDATION_ERROR_CODES.careersCountInvalid,
      path: "careers.careers",
      message: `Expected exactly 9 careers, received ${careers.length}`,
    });
  }
  const careerSlugs = new Set<string>();
  for (const career of careers) {
    if (careerSlugs.has(career.slug)) {
      errors.push({
        code: VALIDATION_ERROR_CODES.careersDuplicateSlug,
        path: `careers.careers[${career.slug}].slug`,
        message: `Duplicate career slug: ${career.slug}`,
      });
    }
    careerSlugs.add(career.slug);
  }

  if (errors.length > 0) {
    return {
      ok: false,
      errors: sortErrors(errors),
    };
  }

  const packageId = buildPackageId(
    input.manifest.track_slug,
    input.manifest.semantic_version,
  );

  return {
    ok: true,
    normalized: {
      packageId,
      checksum,
      counts: {
        nodes: input.nodes.length,
        edges: input.edges.length,
        resources: input.resources.length,
        practiceMappings: input.practiceMappings.length,
        careers: careers.length,
      },
      primaryByNode,
      mappingByNode,
      canonicalProblemIds,
    },
  };
}

/**
 * Build the deterministic package id used both as the SQL primary key and
 * as the importer lookup key. The leading `pkg_` keeps it easy to
 * recognise in fixtures and tests; underscores replace the dots in the
 * semver so SQLite never has to compare on a separator that means
 * something different in dotted identifiers.
 */
export function buildPackageId(trackSlug: string, semanticVersion: string): string {
  return `pkg_${trackSlug}_${semanticVersion.replace(/\./g, "_")}`;
}

/**
 * Stable comparator for validation errors. Same input → same output
 * order, even when the validator traverses the package in a different
 * order between runs.
 */
function sortErrors(errors: readonly ValidationError[]): readonly ValidationError[] {
  return [...errors]
    .sort((a, b) => {
      if (a.code !== b.code) {
        if (a.code < b.code) return -1;
        if (a.code > b.code) return 1;
      }
      if (a.path !== b.path) {
        if (a.path < b.path) return -1;
        if (a.path > b.path) return 1;
      }
      if (a.message === b.message) return 0;
      return a.message < b.message ? -1 : 1;
    })
    .map((error) => ({ code: error.code, path: error.path, message: error.message }));
}

/**
 * Pure HTTP/HTTPS URL guard. Returns `null` for a valid http(s) URL, an
 * error message otherwise. The check runs after the Zod `.url()` schema
 * has accepted the string, so this is purely about protocol allow-listing.
 */
function validateHttpUrl(value: string): string | null {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    return `URL is not parseable: ${value}`;
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return `URL must use http or https: ${value}`;
  }
  return null;
}

/**
 * Deterministic JSON serialiser. Sorts object keys, preserves array
 * order, and refuses to encode anything that JSON itself cannot encode
 * (functions, BigInt, Symbol). Used to build the checksum input.
 */
function canonicalize(value: unknown): string {
  if (value === null) return "null";
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new Error("canonicalize cannot encode non-finite numbers");
    }
    return JSON.stringify(value);
  }
  if (typeof value === "string" || typeof value === "boolean") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((entry) => canonicalize(entry)).join(",")}]`;
  }
  if (typeof value === "object") {
    const obj = value as Record<string, unknown>;
    const keys = Object.keys(obj).sort();
    const body = keys
      .map((key) => `${JSON.stringify(key)}:${canonicalize(obj[key])}`)
      .join(",");
    return `{${body}}`;
  }
  throw new Error(`canonicalize cannot encode value of type ${typeof value}`);
}

/**
 * Produce the canonical concatenation of every non-manifest package file
 * in stable sorted order. The careers file is keyed by its manifest
 * reference (e.g. `careers/career-directions-v1.json`) so the validator
 * remains agnostic about where the careers file physically lives inside
 * the package directory.
 */
export function computeChecksumInput(input: CurriculumPackageInput): string {
  const entries: ReadonlyArray<readonly [string, unknown]> = [
    [input.manifest.careers_file, input.careers],
    ["edges.json", input.edges],
    ["nodes.json", input.nodes],
    ["practice-mappings.json", input.practiceMappings],
    ["resources.json", input.resources],
  ];
  const sorted = [...entries].sort(([a], [b]) => {
    if (a === b) return 0;
    return a < b ? -1 : 1;
  });
  return sorted.map(([, value]) => canonicalize(value)).join("\n");
}

function sha256Hex(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

/**
 * Cycle detector built on Kahn's algorithm. Treats the knowledge graph
 * as a directed graph from `from_stable_id` to `to_stable_id` and returns
 * `true` when at least one node cannot be topologically ordered, which
 * is exactly when the graph contains a cycle. Nodes that are referenced
 * by neither an edge nor a knowledge_node entry are still counted, so a
 * stranded node does not produce a false positive.
 */
function hasCycle(adjacency: ReadonlyMap<string, readonly string[]>): boolean {
  const inDegree = new Map<string, number>();
  for (const node of adjacency.keys()) {
    inDegree.set(node, 0);
  }
  for (const [, successors] of adjacency.entries()) {
    for (const successor of successors) {
      inDegree.set(successor, (inDegree.get(successor) ?? 0) + 1);
    }
  }

  const queue: string[] = [];
  for (const [node, degree] of inDegree.entries()) {
    if (degree === 0) queue.push(node);
  }

  let processed = 0;
  while (queue.length > 0) {
    const node = queue.shift();
    if (node === undefined) break;
    processed += 1;
    const successors = adjacency.get(node) ?? [];
    for (const successor of successors) {
      const nextDegree = (inDegree.get(successor) ?? 0) - 1;
      inDegree.set(successor, nextDegree);
      if (nextDegree === 0) queue.push(successor);
    }
  }

  return processed !== adjacency.size;
}