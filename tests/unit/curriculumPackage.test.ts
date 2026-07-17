import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  VALIDATION_ERROR_CODES,
  buildPackageId,
  computeChecksumInput,
  validatePackage,
  type CurriculumPackageInput,
} from "@/lib/curriculum/validatePackage";

const FIXTURE_PATH = join(
  process.cwd(),
  "tests",
  "fixtures",
  "curriculum",
  "sample-package",
);

function loadFixture(): CurriculumPackageInput {
  const readJson = (relativePath: string): unknown =>
    JSON.parse(readFileSync(join(FIXTURE_PATH, relativePath), "utf8")) as unknown;
  const manifest = readJson("manifest.json") as CurriculumPackageInput["manifest"];
  return {
    manifest,
    nodes: readJson("nodes.json") as CurriculumPackageInput["nodes"],
    edges: readJson("edges.json") as CurriculumPackageInput["edges"],
    resources: readJson("resources.json") as CurriculumPackageInput["resources"],
    practiceMappings: readJson("practice-mappings.json") as CurriculumPackageInput["practiceMappings"],
    careers: readJson("careers/career-directions-v1.json") as CurriculumPackageInput["careers"],
  };
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function withResources(
  base: CurriculumPackageInput,
  resources: CurriculumPackageInput["resources"],
): CurriculumPackageInput {
  return { ...base, resources };
}

function withEdges(
  base: CurriculumPackageInput,
  edges: CurriculumPackageInput["edges"],
): CurriculumPackageInput {
  return { ...base, edges };
}

function withNodes(
  base: CurriculumPackageInput,
  nodes: CurriculumPackageInput["nodes"],
): CurriculumPackageInput {
  return { ...base, nodes };
}

function withPracticeMappings(
  base: CurriculumPackageInput,
  practiceMappings: CurriculumPackageInput["practiceMappings"],
): CurriculumPackageInput {
  return { ...base, practiceMappings };
}

function withCareers(
  base: CurriculumPackageInput,
  careers: CurriculumPackageInput["careers"],
): CurriculumPackageInput {
  return { ...base, careers };
}

function makeNineCareers(): CurriculumPackageInput["careers"] {
  const slugPool = [
    "frontend-web",
    "backend-server",
    "client",
    "data-analytics-engineering",
    "ai-ml",
    "edge-ai-embedded",
    "cloud-platform",
    "security",
    "systems-software",
  ] as const;
  const careers = slugPool.map((slug) => ({
    slug,
    name: slug,
    status: "published" as const,
    summary: {
      purpose: `Purpose for ${slug}`,
      representative_roles: [`Role for ${slug}`],
      common_foundation_dependencies: ["sample-node-a"],
      direction_specific_module_names: [`module-${slug}`],
      coarse_order: ["sample-node-a", "sample-node-b"],
      representative_project: `Project for ${slug}`,
      provenance: "Editorial note 2026-07-17.",
      reviewed_at: "2026-07-17T00:00:00.000Z",
      unavailable_in_v0: true as const,
    },
  }));
  return { careers };
}

function makePackage(opts?: {
  careers?: CurriculumPackageInput["careers"];
  nodes?: CurriculumPackageInput["nodes"];
  edges?: CurriculumPackageInput["edges"];
  resources?: CurriculumPackageInput["resources"];
  practiceMappings?: CurriculumPackageInput["practiceMappings"];
}): CurriculumPackageInput {
  const base = loadFixture();
  return {
    manifest: base.manifest,
    nodes: opts?.nodes ?? base.nodes,
    edges: opts?.edges ?? base.edges,
    resources: opts?.resources ?? base.resources,
    practiceMappings: opts?.practiceMappings ?? base.practiceMappings,
    careers: opts?.careers ?? base.careers,
  };
}

function withChecksum(input: CurriculumPackageInput): CurriculumPackageInput {
  return {
    ...input,
    manifest: {
      ...input.manifest,
      checksum_input: computeChecksumInput(input),
    },
  };
}

describe("validatePackage", () => {
  it("accepts the sample fixture and produces a deterministic normalized bundle", () => {
    const loaded = loadFixture();
    const result = validatePackage(loaded);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.normalized.packageId).toBe(
      buildPackageId(loaded.manifest.track_slug, loaded.manifest.semantic_version),
    );
    expect(result.normalized.packageId).toBe("pkg_sample-package_1_0_0");
    expect(result.normalized.counts).toEqual({
      nodes: 2,
      edges: 1,
      resources: 2,
      practiceMappings: 2,
      careers: 9,
    });
    expect(result.normalized.checksum).toMatch(/^[a-f0-9]{64}$/);
  });

  it("produces byte-equal sorted error lists for two structurally identical bad inputs", () => {
    const base = makePackage();
    // Keep the manifest checksum stale (do NOT call withChecksum) so both
    // the invalid-URL error AND the checksum-mismatch error fire together.
    const mutated = withResources(
      clone(base),
      base.resources.map((resource) =>
        resource.stable_id === "sample-resource-a"
          ? { ...resource, url: "ftp://example.com/resource-a" }
          : resource,
      ),
    );
    const first = validatePackage(mutated);
    const second = validatePackage(clone(mutated));
    expect(first.ok).toBe(false);
    expect(second.ok).toBe(false);
    if (first.ok || second.ok) return;
    expect(JSON.stringify(first.errors)).toBe(JSON.stringify(second.errors));
    const codes = first.errors.map((error) => error.code);
    expect(codes).toContain(VALIDATION_ERROR_CODES.resourcesInvalidUrl);
    expect(codes).toContain(VALIDATION_ERROR_CODES.manifestChecksumMismatch);
  });

  it("rejects a non-HTTP(S) resource URL together with a stale checksum_input", () => {
    const base = makePackage();
    const cloned = clone(base);
    const mutated = withResources(
      cloned,
      cloned.resources.map((resource) =>
        resource.stable_id === "sample-resource-a"
          ? { ...resource, url: "ftp://example.com/resource-a" }
          : resource,
      ),
    );
    // Intentionally leave the manifest.checksum_input at its on-disk value
    // so the validator reports the manifest.checksum_mismatch error too.
    const result = validatePackage(mutated);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    const codes = result.errors.map((error) => error.code);
    expect(codes).toContain(VALIDATION_ERROR_CODES.resourcesInvalidUrl);
    expect(codes).toContain(VALIDATION_ERROR_CODES.manifestChecksumMismatch);
  });

  it("rejects a published node that lost its primary reviewed resource", () => {
    const base = makePackage();
    const cloned = clone(base);
    const mutated = withResources(
      cloned,
      cloned.resources.filter(
        (resource) => resource.stable_id !== "sample-resource-a",
      ),
    );
    const synced = withChecksum(mutated);
    const result = validatePackage(synced);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    const codes = result.errors.map((error) => error.code);
    expect(codes).toContain(VALIDATION_ERROR_CODES.nodesPublishedMissingResource);
  });

  it("rejects an edge that references an unknown node", () => {
    const base = makePackage();
    const mutated = withEdges(clone(base), [
      {
        from_stable_id: "sample-node-a",
        to_stable_id: "ghost-node",
        edge_type: "required_prerequisite",
      },
    ]);
    const synced = withChecksum(mutated);
    const result = validatePackage(synced);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    const codes = result.errors.map((error) => error.code);
    expect(codes).toContain(VALIDATION_ERROR_CODES.edgesUnknownNode);
  });

  it("rejects a self-edge on a published node", () => {
    const base = makePackage();
    const mutated = withEdges(clone(base), [
      {
        from_stable_id: "sample-node-a",
        to_stable_id: "sample-node-a",
        edge_type: "required_prerequisite",
      },
    ]);
    const synced = withChecksum(mutated);
    const result = validatePackage(synced);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    const codes = result.errors.map((error) => error.code);
    expect(codes).toContain(VALIDATION_ERROR_CODES.edgesSelfEdge);
  });

  it("rejects a cycle A -> B -> C -> A in the knowledge graph", () => {
    const base = makePackage();
    const thirdNode = {
      stable_id: "sample-node-c",
      title: "Sample Node C",
      outcome: "Triangular cycle terminator.",
      rationale: "Forces a cycle in the graph.",
      order_index: 3,
      status: "published" as const,
      provenance: {
        authority: "Sample Authority",
        url: "https://example.com/sample-c",
        retrieved_at: "2026-07-17T00:00:00.000Z",
      },
      stopping_guidance: "Stop once the cycle is detected.",
    };
    const baseSnapshot = clone(base);
    const mutated = withPracticeMappings(
      withResources(
        withEdges(
          withNodes(baseSnapshot, [...baseSnapshot.nodes, thirdNode]),
          [
            { from_stable_id: "sample-node-a", to_stable_id: "sample-node-b", edge_type: "required_prerequisite" },
            { from_stable_id: "sample-node-b", to_stable_id: "sample-node-c", edge_type: "required_prerequisite" },
            { from_stable_id: "sample-node-c", to_stable_id: "sample-node-a", edge_type: "required_prerequisite" },
          ],
        ),
        [
          ...baseSnapshot.resources,
          {
            stable_id: "sample-resource-c",
            title: "Sample Resource C",
            url: "https://example.com/resource-c",
            author: "Sample Author",
            language: "en",
            cost: "free",
            access: "open",
            license_boundary: "permissive_open",
            review_status: "reviewed",
            reviewed_at: "2026-07-17T00:00:00.000Z",
            stopping_guidance: "Stop after the worked example.",
            node_stable_id: "sample-node-c",
            role: "primary",
          },
        ],
      ),
      [
        ...baseSnapshot.practiceMappings,
        {
          node_stable_id: "sample-node-c",
          practice_task_stable_id: "sample-task-c",
          canonical_problem_stable_id: "sample-problem-c",
          title: "Practice Task C",
          kind: "oj",
          difficulty_band: "intro",
          sources: [
            {
              platform: "atcoder",
              external_id: "practice_2",
              url: "https://atcoder.jp/contests/practice/tasks/practice_2",
              is_primary: true,
            },
          ],
        },
      ],
    );
    const synced = withChecksum(mutated);
    const result = validatePackage(synced);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    const codes = result.errors.map((error) => error.code);
    expect(codes).toContain(VALIDATION_ERROR_CODES.edgesCycle);
  });

  it("rejects two careers that share the same slug", () => {
    const base = makePackage();
    const mutated = withCareers(clone(base), {
      careers: base.careers.careers.map((career, index) =>
        index === 1
          ? { ...career, slug: base.careers.careers[0]!.slug }
          : career,
      ),
    });
    const synced = withChecksum(mutated);
    const result = validatePackage(synced);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    const codes = result.errors.map((error) => error.code);
    expect(codes).toContain(VALIDATION_ERROR_CODES.careersDuplicateSlug);
  });

  it("accepts a fresh package with exactly nine careers", () => {
    const base = makePackage();
    const mutated: CurriculumPackageInput = {
      ...base,
      careers: makeNineCareers(),
    };
    const synced = withChecksum(mutated);
    const result = validatePackage(synced);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.normalized.counts.careers).toBe(9);
  });

  it("rejects a careers list with eight entries as count_invalid", () => {
    const base = makePackage();
    const mutated: CurriculumPackageInput = {
      ...base,
      careers: {
        careers: makeNineCareers().careers.slice(0, 8),
      },
    };
    const synced = withChecksum(mutated);
    const result = validatePackage(synced);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    const codes = result.errors.map((error) => error.code);
    expect(codes).toContain(VALIDATION_ERROR_CODES.careersCountInvalid);
  });

  it("rejects a careers list with ten entries as count_invalid", () => {
    const base = makePackage();
    const ten = [
      ...makeNineCareers().careers,
      {
        slug: "extra-career",
        name: "Extra Career",
        status: "published" as const,
        summary: {
          purpose: "Extra",
          representative_roles: ["Extra Role"],
          common_foundation_dependencies: ["sample-node-a"],
          direction_specific_module_names: ["extra-module"],
          coarse_order: ["sample-node-a", "sample-node-b"],
          representative_project: "Extra project",
          provenance: "Editorial note 2026-07-17.",
          reviewed_at: "2026-07-17T00:00:00.000Z",
          unavailable_in_v0: true as const,
        },
      },
    ];
    const mutated: CurriculumPackageInput = {
      ...base,
      careers: { careers: ten },
    };
    const synced = withChecksum(mutated);
    const result = validatePackage(synced);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    const codes = result.errors.map((error) => error.code);
    expect(codes).toContain(VALIDATION_ERROR_CODES.careersCountInvalid);
  });
});