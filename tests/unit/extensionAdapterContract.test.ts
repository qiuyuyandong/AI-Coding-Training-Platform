/**
 * Phase A Task A2 contract tests for `extension/src/adapters/**`.
 *
 * These tests pin the structural contract of the new adapter split:
 *
 *   - Every registry record declares platform, label, bounded version,
 *     exact host ownership, current DOM status, and V4 network status.
 *   - Only AtCoder DOM status remains "production". V4 network status is
 *     evidence-driven and distinguishes a real-observation-pending candidate.
 *   - The registry export and the legacy compatibility re-export are
 *     identity-equal.
 *   - A type-safe synthetic `AdapterEvidenceFunction` can be built on
 *     top of `defineNetworkAdapterPolicy`, and the runtime factory
 *     tolerates throwing candidates and re-parses non-null results
 *     through `parseSafeEvidence`.
 *   - Host ownership is bidirectional: each declared host accepts the
 *     platform's known-safe problem URL, and near-spoof or undeclared
 *     hosts are rejected.
 *   - No adapter module imports storage / outbox / transport / state
 *     machine / correlator / attempt-capture / background modules. The
 *     deterministic scan uses the TypeScript compiler API to parse
 *     `ImportDeclaration`, `ExportDeclaration`, `ImportEqualsDeclaration`,
 *     dynamic `import(...)`, and CommonJS `require(...)` calls, and resolves
 *     `@/` plus `./`/`../` specifiers
 *     into a transitive local dependency graph. Non-string-literal
 *     dynamic imports cannot be audited deterministically and are
 *     rejected as boundary failures.
 */

import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import ts from "typescript";
import { parseSafeEvidence } from "@/extension/src/evidence";
import type { SafeEvidence } from "@/extension/src/evidence";
import { defineNetworkAdapterPolicy } from "@/extension/src/adapters/contract";
import type {
  AdapterEvidenceFunction,
  Platform,
  PlatformAdapterRecord,
  V4NetworkAdapterPolicy,
  V4NetworkStatus,
} from "@/extension/src/adapters/contract";
import { PLATFORM_ADAPTERS } from "@/extension/src/adapters/registry";
// Compatibility re-export — must be identity-equal to the registry export.
import {
  detectProblemFromLocation,
  PLATFORM_ADAPTERS as COMPAT_PLATFORM_ADAPTERS,
  type DetectableLocation,
} from "@/extension/src/platforms";

const PLATFORMS: readonly Platform[] = [
  "leetcode",
  "nowcoder",
  "luogu",
  "codeforces",
  "atcoder",
];

function asLocation(url: string): DetectableLocation {
  const parsedUrl = new URL(url);
  return {
    href: parsedUrl.href,
    hostname: parsedUrl.hostname,
    pathname: parsedUrl.pathname,
  };
}

describe("platform adapter registry (Phase A Task A2)", () => {
  it("keeps disabled as an explicit fail-closed V4 readiness state", () => {
    const disabled: V4NetworkStatus = "disabled";
    expect(disabled).toBe("disabled");
  });

  it("registers exactly the five required platform keys", () => {
    expect(Object.keys(PLATFORM_ADAPTERS).slice().sort()).toEqual(
      PLATFORMS.slice().sort(),
    );
  });

  it("declares platform identifier, non-empty label, and bounded version on every record", () => {
    for (const platform of PLATFORMS) {
      const record = PLATFORM_ADAPTERS[platform];
      expect(record.platform).toBe(platform);
      expect(typeof record.label).toBe("string");
      expect(record.label.length).toBeGreaterThan(0);
      expect(typeof record.version).toBe("string");
      expect(record.version.length).toBeGreaterThan(0);
      expect(record.version).toBe(record.version.trim());
    }
  });

  it("keeps the legacy DOM status semantics — only AtCoder is 'production'", () => {
    expect(PLATFORM_ADAPTERS.atcoder.status).toBe("production");
    expect(PLATFORM_ADAPTERS.leetcode.status).toBe("experimental");
    expect(PLATFORM_ADAPTERS.nowcoder.status).toBe("experimental");
    expect(PLATFORM_ADAPTERS.luogu.status).toBe("experimental");
    expect(PLATFORM_ADAPTERS.codeforces.status).toBe("experimental");
  });

  it("records characterized network outcomes without conflating DOM certification", () => {
    for (const platform of PLATFORMS) {
      expect(PLATFORM_ADAPTERS[platform].v4NetworkStatus).toBe(
        platform === "nowcoder" || platform === "leetcode"
          ? "experimental"
          : platform === "atcoder" || platform === "codeforces" || platform === "luogu"
            ? "blocked"
          : "uncharacterized",
      );
    }
  });

  it("declares the documented exact host ownership for every record", () => {
    expect(PLATFORM_ADAPTERS.leetcode.hostOwnership.slice().sort()).toEqual(
      ["leetcode.cn", "leetcode.com"].sort(),
    );
    expect(PLATFORM_ADAPTERS.nowcoder.hostOwnership.slice().sort()).toEqual(
      ["ac.nowcoder.com", "www.nowcoder.com"].sort(),
    );
    expect(PLATFORM_ADAPTERS.luogu.hostOwnership).toEqual(["www.luogu.com.cn"]);
    expect(PLATFORM_ADAPTERS.codeforces.hostOwnership).toEqual(["codeforces.com"]);
    expect(PLATFORM_ADAPTERS.atcoder.hostOwnership).toEqual(["atcoder.jp"]);

    for (const platform of PLATFORMS) {
      for (const host of PLATFORM_ADAPTERS[platform].hostOwnership) {
        expect(host).not.toMatch(/[/\\:?]/);
        expect(host).not.toMatch(/^\./);
        expect(host).not.toMatch(/[*?[]/);
      }
    }
  });

  it("attaches policies only to characterized pilots", () => {
    const records: readonly PlatformAdapterRecord[] = Object.values(PLATFORM_ADAPTERS);
    for (const record of records) {
      if (record.platform === "nowcoder" || record.platform === "leetcode") {
        expect(record.networkPolicy).toBeDefined();
      } else {
        expect(record.networkPolicy).toBeUndefined();
      }
    }
  });

  it("exports the same PLATFORM_ADAPTERS binding as the compatibility re-export", () => {
    expect(PLATFORM_ADAPTERS).toBe(COMPAT_PLATFORM_ADAPTERS);
  });

  it("binds characterized pilots to their evidence-backed versions", () => {
    for (const platform of PLATFORMS) {
      expect(PLATFORM_ADAPTERS[platform].version).toBe(
        platform === "nowcoder"
          ? "v4-nowcoder-network-1"
          : platform === "leetcode"
            ? "v4-leetcode-network-6"
            : "v4-contract-1",
      );
    }
  });
});

describe("runtime V4 network policy factory (Phase A Task A2)", () => {
  it("returns normalized plain SafeEvidence from a valid candidate", () => {
    const policy = defineNetworkAdapterPolicy({
      requestEvidence: () => ({
        schemaVersion: 1 as const,
        evidenceId: "ev-factory-1",
        platform: "atcoder",
        tier: "E1" as const,
        kind: "request_observed" as const,
        receivedAt: "2026-07-24T00:00:00.000Z",
        tabId: 1,
        frameId: 0,
        documentId: "doc-factory-1",
        adapterVersion: "v4-contract-1",
        requestId: "req-factory-1",
        method: "POST" as const,
        endpointKey: "atcoder/submissions",
        resourceType: "xmlhttprequest" as const,
        lifecycle: "before_request" as const,
        apiTimeStamp: 0,
      }),
      submissionEvidence: () => null,
      verdictEvidence: () => null,
    });
    const out = policy.requestEvidence(undefined);
    if (out === null) throw new Error("Expected normalized Safe Evidence");
    expect(out.evidenceId).toBe("ev-factory-1");
    expect(out.tier).toBe("E1");
    // Parser-normalized output is a plain object, not the candidate's
    // literal identity.
    expect(typeof out).toBe("object");
  });

  it("returns null when the candidate returns a structurally plausible object with forbidden keys", () => {
    const policy = defineNetworkAdapterPolicy({
      requestEvidence: () => ({
        schemaVersion: 1,
        evidenceId: "ev-forbidden",
        platform: "atcoder",
        tier: "E1",
        kind: "request_observed",
        receivedAt: "2026-07-24T00:00:00.000Z",
        tabId: 1,
        frameId: 0,
        documentId: "doc-forbidden",
        adapterVersion: "v4-contract-1",
        requestId: "req-forbidden",
        method: "POST",
        endpointKey: "atcoder/submissions",
        resourceType: "xmlhttprequest",
        lifecycle: "before_request",
        apiTimeStamp: 0,
        body: "leaked-source-code",
      }),
      submissionEvidence: () => null,
      verdictEvidence: () => null,
    });
    expect(policy.requestEvidence(undefined)).toBeNull();
  });

  it("returns null for unknown or primitive inputs", () => {
    const policy = defineNetworkAdapterPolicy({
      requestEvidence: (input) => input,
      submissionEvidence: () => null,
      verdictEvidence: () => null,
    });
    expect(policy.requestEvidence(null)).toBeNull();
    expect(policy.requestEvidence(undefined)).toBeNull();
    expect(policy.requestEvidence("not-evidence")).toBeNull();
    expect(policy.requestEvidence(42)).toBeNull();
    expect(policy.requestEvidence(true)).toBeNull();
    expect(policy.requestEvidence({})).toBeNull();
  });

  it("returns null when the candidate throws and never re-throws", () => {
    const policy = defineNetworkAdapterPolicy({
      requestEvidence: () => {
        throw new Error("synthetic candidate failure");
      },
      submissionEvidence: () => null,
      verdictEvidence: () => null,
    });
    expect(() => policy.requestEvidence({ anything: true })).not.toThrow();
    expect(policy.requestEvidence({ anything: true })).toBeNull();
  });

  it("freezes the returned wrapper object so the wrapped functions cannot be replaced", () => {
    const policy: V4NetworkAdapterPolicy = defineNetworkAdapterPolicy({
      requestEvidence: () => null,
      submissionEvidence: () => null,
      verdictEvidence: () => null,
    });
    expect(Object.isFrozen(policy)).toBe(true);
  });

  it("exposes AdapterEvidenceFunction shape usable in synthetic test code", () => {
    const parseAndReturn: AdapterEvidenceFunction = (input) => {
      const result = parseSafeEvidence(input);
      return result.ok ? result.value : null;
    };
    const valid: SafeEvidence = {
      schemaVersion: 1,
      evidenceId: "ev-synthetic",
      platform: "atcoder",
      tier: "E0",
      kind: "ui_hint",
      receivedAt: "2026-07-24T00:00:00.000Z",
      tabId: 1,
      frameId: 0,
      documentId: "doc-synthetic",
      adapterVersion: "v4-contract-1",
      problemExternalId: "abc086_a",
    };
    expect(parseAndReturn(valid)).toEqual(valid);
    expect(parseAndReturn(null)).toBeNull();
    expect(parseAndReturn({ body: "secret" })).toBeNull();
    expect(parseAndReturn({ token: "x" })).toBeNull();
  });

  it("preserves no-policy state for blocked and uncharacterized platforms", () => {
    const records: readonly PlatformAdapterRecord[] = Object.values(PLATFORM_ADAPTERS);
    for (const record of records) {
      if (record.platform === "nowcoder" || record.platform === "leetcode") {
        expect(record.networkPolicy).toBeDefined();
        expect(record.v4NetworkStatus).toBe("experimental");
      } else if (record.platform === "atcoder" || record.platform === "codeforces" || record.platform === "luogu") {
        expect(record.networkPolicy).toBeUndefined();
        expect(record.v4NetworkStatus).toBe("blocked");
      } else {
        expect(record.networkPolicy).toBeUndefined();
        expect(record.v4NetworkStatus).toBe("uncharacterized");
      }
    }
  });
});

describe("bidirectional host ownership (Phase A Task A2)", () => {
  // Each declared host must accept one known-safe platform-specific URL.
  const POSITIVE_CASES: ReadonlyArray<readonly [Platform, string]> = [
    ["leetcode", "https://leetcode.com/problems/two-sum/"],
    ["leetcode", "https://leetcode.cn/problems/two-sum/"],
    ["codeforces", "https://codeforces.com/problemset/problem/4/A"],
    ["atcoder", "https://atcoder.jp/contests/abc086/tasks/abc086_a"],
    ["nowcoder", "https://www.nowcoder.com/practice/example"],
    ["nowcoder", "https://ac.nowcoder.com/acm/problem/25000"],
    ["luogu", "https://www.luogu.com.cn/problem/P1001"],
  ];

  it.each(POSITIVE_CASES)(
    "detects a known-safe URL on declared host %s -> %s",
    (platform, url) => {
      const detected = detectProblemFromLocation(asLocation(url), "Test");
      expect(detected).not.toBeNull();
      expect(detected?.platform).toBe(platform);
    },
  );

  // Near-spoof and undeclared hosts must be rejected even when the path
  // shape matches the platform's documented route.
  const NEGATIVE_CASES: ReadonlyArray<readonly [string, string]> = [
    ["leetcode.com.evil.example", "https://leetcode.com.evil.example/problems/two-sum/"],
    ["evil.leetcode.com", "https://evil.leetcode.com/problems/two-sum/"],
    ["leetcode.cn.evil.example", "https://leetcode.cn.evil.example/problems/two-sum/"],
    ["codeforces.com.evil.example", "https://codeforces.com.evil.example/problemset/problem/4/A"],
    ["evil.codeforces.com", "https://evil.codeforces.com/problemset/problem/4/A"],
    ["atcoder.jp.evil.example", "https://atcoder.jp.evil.example/contests/abc086/tasks/abc086_a"],
    ["evil.atcoder.jp", "https://evil.atcoder.jp/contests/abc086/tasks/abc086_a"],
    ["www.nowcoder.com.evil.example", "https://www.nowcoder.com.evil.example/practice/example"],
    ["ac.nowcoder.com.evil.example", "https://ac.nowcoder.com.evil.example/acm/problem/25000"],
    ["luogu.com.cn.evil.example", "https://luogu.com.cn.evil.example/problem/P1001"],
    ["www.luogu.com.cn.evil.example", "https://www.luogu.com.cn.evil.example/problem/P1001"],
    ["undeclared-nowcoder-host", "https://nowcoder.com/practice/example"],
    ["undeclared-luogu-host", "https://luogu.com/problem/P1001"],
  ];

  it.each(NEGATIVE_CASES)(
    "rejects near-spoof / undeclared host %s -> %s",
    (_label, url) => {
      expect(detectProblemFromLocation(asLocation(url), "Test")).toBeNull();
    },
  );
});

describe("adapter module dependency audit (Phase A Task A2)", () => {
  // The audit uses the TypeScript compiler API to enumerate import
  // bindings from each visited module; the test cases below exercise
  // synthetic sources directly, plus a real transitive run against the
  // existing extension tree.
  const FORBIDDEN_BASENAMES: ReadonlySet<string> = new Set([
    "attemptstorage.ts",
    "outboxdrain.ts",
    "capturetransport.ts",
    "confirmedsubmission.ts",
    "attemptcapture.ts",
    "background.ts",
    "submissioncorrelator.ts",
    "capturestatemachine.ts",
    "operation.ts",
  ]);

  type ImportRef =
    | { readonly kind: "static"; readonly specifier: string }
    | { readonly kind: "export-from"; readonly specifier: string }
    | { readonly kind: "dynamic-literal"; readonly specifier: string }
    | { readonly kind: "require-literal"; readonly specifier: string }
    | { readonly kind: "import-equals"; readonly specifier: string };

  function parseImports(filePath: string, source: string): {
    readonly refs: readonly ImportRef[];
    readonly nonLiteralModuleLoads: number;
  } {
    const sourceFile = ts.createSourceFile(
      filePath,
      source,
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TS,
    );
    const refs: ImportRef[] = [];
    let nonLiteralModuleLoads = 0;

    const visit = (node: ts.Node): void => {
      if (
        ts.isImportDeclaration(node)
        && node.moduleSpecifier
        && ts.isStringLiteral(node.moduleSpecifier)
      ) {
        refs.push({ kind: "static", specifier: node.moduleSpecifier.text });
      } else if (
        ts.isExportDeclaration(node)
        && node.moduleSpecifier
        && ts.isStringLiteral(node.moduleSpecifier)
      ) {
        refs.push({ kind: "export-from", specifier: node.moduleSpecifier.text });
      } else if (
        ts.isImportEqualsDeclaration(node)
        && ts.isExternalModuleReference(node.moduleReference)
      ) {
        const expression = node.moduleReference.expression;
        if (expression !== undefined && ts.isStringLiteral(expression)) {
          refs.push({ kind: "import-equals", specifier: expression.text });
        } else {
          nonLiteralModuleLoads++;
        }
      } else if (
        ts.isCallExpression(node)
        && node.expression.kind === ts.SyntaxKind.ImportKeyword
      ) {
        const arg = node.arguments[0];
        if (
          arg !== undefined
          && (ts.isStringLiteral(arg) || ts.isNoSubstitutionTemplateLiteral(arg))
        ) {
          refs.push({ kind: "dynamic-literal", specifier: arg.text });
        } else {
          // Bare import() or with a non-string-literal argument cannot
          // be audited deterministically, so the audit rejects any
          // non-literal dynamic import in the traversed subtree.
          nonLiteralModuleLoads++;
        }
      } else if (
        ts.isCallExpression(node)
        && ts.isIdentifier(node.expression)
        && node.expression.text === "require"
      ) {
        const arg = node.arguments[0];
        if (
          arg !== undefined
          && (ts.isStringLiteral(arg) || ts.isNoSubstitutionTemplateLiteral(arg))
        ) {
          refs.push({ kind: "require-literal", specifier: arg.text });
        } else {
          nonLiteralModuleLoads++;
        }
      }
      ts.forEachChild(node, visit);
    };
    ts.forEachChild(sourceFile, visit);
    return { refs, nonLiteralModuleLoads };
  }

  function isFile(p: string): boolean {
    try {
      return statSync(p).isFile();
    } catch {
      return false;
    }
  }

  function resolveFile(absolute: string): string | null {
    const candidates = [
      absolute,
      absolute + ".ts",
      absolute + ".tsx",
      path.join(absolute, "index.ts"),
      path.join(absolute, "index.tsx"),
    ];
    for (const candidate of candidates) {
      if (isFile(candidate)) return candidate;
    }
    return null;
  }

  const REPO_ROOT = path.resolve(process.cwd());

  function resolveSpecifier(importer: string, specifier: string): string | null {
    if (specifier.startsWith("@/")) {
      const abs = path.resolve(REPO_ROOT, specifier.slice(2));
      return resolveFile(abs);
    }
    if (specifier.startsWith("./") || specifier.startsWith("../")) {
      const dir = path.dirname(importer);
      const abs = path.resolve(dir, specifier);
      return resolveFile(abs);
    }
    // External package or URL — stop traversal.
    return null;
  }

  interface AuditResult {
    readonly violations: readonly string[];
    readonly nonLiteralModuleLoads: number;
    readonly visitedFiles: readonly string[];
  }

  function audit(entries: readonly string[]): AuditResult {
    const visited = new Set<string>();
    const violations: string[] = [];
    let nonLiteralModuleLoads = 0;
    const queue: string[] = [...entries];
    let idx = 0;
    while (idx < queue.length) {
      const file = queue[idx++];
      if (visited.has(file)) continue;
      visited.add(file);

      const basename = path.basename(file).toLowerCase();
      if (FORBIDDEN_BASENAMES.has(basename)) {
        violations.push(`${file} (matches forbidden filename ${basename})`);
      }

      const source = readFileSync(file, "utf8");
      const { refs, nonLiteralModuleLoads: nonLiteral } = parseImports(file, source);
      nonLiteralModuleLoads += nonLiteral;
      for (const ref of refs) {
        const resolved = resolveSpecifier(file, ref.specifier);
        if (resolved !== null && !visited.has(resolved)) {
          queue.push(resolved);
        }
      }
    }
    return { violations, nonLiteralModuleLoads, visitedFiles: [...visited] };
  }

  function walkTs(root: string): string[] {
    const out: string[] = [];
    let stat;
    try {
      stat = statSync(root);
    } catch {
      throw new Error(`adapter root not found: ${root}`);
    }
    if (!stat.isDirectory()) return out;
    for (const entry of readdirSync(root, { withFileTypes: true })) {
      const full = path.join(root, entry.name);
      if (entry.isDirectory()) {
        out.push(...walkTs(full));
      } else if (entry.isFile() && full.endsWith(".ts")) {
        out.push(full);
      }
    }
    return out;
  }

  function adapterDirectoryForTests(): string {
    return path.resolve(process.cwd(), "extension", "src", "adapters");
  }

  // ----- focused parse tests on synthetic sources (no fixture writes) -----

  it("collector recognizes a static import declaration", () => {
    const { refs, nonLiteralModuleLoads } = parseImports(
      "synthetic-static.ts",
      `import { foo } from "@/extension/src/evidence";\n`,
    );
    expect(refs).toContainEqual({ kind: "static", specifier: "@/extension/src/evidence" });
    expect(nonLiteralModuleLoads).toBe(0);
  });

  it("collector recognizes an export ... from declaration", () => {
    const { refs, nonLiteralModuleLoads } = parseImports(
      "synthetic-export.ts",
      `export { PLATFORM_ADAPTERS } from "@/extension/src/adapters/registry";\n`,
    );
    expect(refs).toContainEqual({
      kind: "export-from",
      specifier: "@/extension/src/adapters/registry",
    });
    expect(nonLiteralModuleLoads).toBe(0);
  });

  it("collector recognizes a literal dynamic import and treats it as auditable", () => {
    const { refs, nonLiteralModuleLoads } = parseImports(
      "synthetic-dyn.ts",
      `async function load() { return await import("@/extension/src/evidence"); }\n`,
    );
    expect(refs).toContainEqual({
      kind: "dynamic-literal",
      specifier: "@/extension/src/evidence",
    });
    expect(nonLiteralModuleLoads).toBe(0);
  });

  it("collector rejects non-literal dynamic imports as non-auditable", () => {
    const { refs, nonLiteralModuleLoads } = parseImports(
      "synthetic-nonliteral.ts",
      `async function load(name) { return await import(name); }\n`,
    );
    expect(refs.some((r) => r.specifier === "name")).toBe(false);
    expect(nonLiteralModuleLoads).toBeGreaterThanOrEqual(1);
  });

  it("collector rejects template-tag dynamic imports whose argument is not a string-literal", () => {
    const { refs, nonLiteralModuleLoads } = parseImports(
      "synthetic-computed.ts",
      `const key = "x"; async function load() { return await import(\`./foo-\${key}\`); }\n`,
    );
    expect(refs.some((r) => r.specifier.includes("foo"))).toBe(false);
    expect(nonLiteralModuleLoads).toBeGreaterThanOrEqual(1);
  });

  it("collector recognizes literal require and import-equals module loads", () => {
    const required = parseImports(
      "synthetic-require.ts",
      `const installation = require("../installation");\n`,
    );
    expect(required.refs).toContainEqual({
      kind: "require-literal",
      specifier: "../installation",
    });
    expect(required.nonLiteralModuleLoads).toBe(0);

    const imported = parseImports(
      "synthetic-import-equals.ts",
      `import installation = require("../installation");\n`,
    );
    expect(imported.refs).toContainEqual({
      kind: "import-equals",
      specifier: "../installation",
    });
    expect(imported.nonLiteralModuleLoads).toBe(0);
  });

  it("collector rejects non-literal require calls as non-auditable", () => {
    const { refs, nonLiteralModuleLoads } = parseImports(
      "synthetic-require-nonliteral.ts",
      `const moduleName = "../installation"; require(moduleName);\n`,
    );
    expect(refs).toEqual([]);
    expect(nonLiteralModuleLoads).toBeGreaterThanOrEqual(1);
  });

  // ----- file-tree audit tests against real sources -----

  it("audit from extension/src/adapters/** finds no forbidden boundary or non-literal module load", () => {
    const entries = walkTs(adapterDirectoryForTests());
    expect(entries.length).toBeGreaterThan(0);
    const result = audit(entries);
    expect(result.violations).toEqual([]);
    expect(result.nonLiteralModuleLoads).toBe(0);
  });

  it("audit walks at least the contract, registry, dom, and leetcode/luogu verdict files", () => {
    const entries = walkTs(adapterDirectoryForTests());
    expect(entries.some((f) => f.endsWith(path.join("adapters", "contract.ts")))).toBe(true);
    expect(entries.some((f) => f.endsWith(path.join("adapters", "registry.ts")))).toBe(true);
    expect(entries.some((f) => f.endsWith(path.join("adapters", "dom.ts")))).toBe(true);
    expect(entries.some((f) => f.endsWith(path.join("leetcode", "verdict.ts")))).toBe(true);
    expect(entries.some((f) => f.endsWith(path.join("luogu", "verdict.ts")))).toBe(true);
  });

  it("transitive proof: scanning from extension/src/installation.ts reaches captureTransport and attemptStorage boundaries", () => {
    const installation = path.resolve(REPO_ROOT, "extension", "src", "installation.ts");
    expect(isFile(installation)).toBe(true);
    const result = audit([installation]);
    const violationsLower = result.violations.map((v) => v.toLowerCase());
    expect(violationsLower.some((v) => v.includes("capturetransport.ts"))).toBe(true);
    expect(violationsLower.some((v) => v.includes("attemptstorage.ts"))).toBe(true);
    // installation.ts transitively reaches other forbidden boundaries too;
    // assert at least the documented ones for the proof.
    expect(violationsLower.some((v) => v.includes("attemptcapture.ts"))).toBe(true);
    expect(violationsLower.some((v) => v.includes("confirmedsubmission.ts"))).toBe(true);
    expect(result.visitedFiles.length).toBeGreaterThan(1);
  });

  it("transitive proof: a literal require of installation reaches forbidden boundaries", () => {
    const syntheticImporter = path.join(adapterDirectoryForTests(), "synthetic.ts");
    const parsed = parseImports(
      syntheticImporter,
      `const installation = require("../installation");\n`,
    );
    const ref = parsed.refs.find((candidate) => candidate.kind === "require-literal");
    if (ref === undefined) throw new Error("Expected literal require reference");
    const installation = resolveSpecifier(syntheticImporter, ref.specifier);
    if (installation === null) throw new Error("Expected installation module to resolve");

    const result = audit([installation]);
    const violationsLower = result.violations.map((value) => value.toLowerCase());
    expect(violationsLower.some((value) => value.includes("capturetransport.ts"))).toBe(true);
    expect(violationsLower.some((value) => value.includes("attemptstorage.ts"))).toBe(true);
  });

  it("transitive proof: scanning from extension/src/installation.ts does not flag pure platforms/evidence/verdict modules", () => {
    const installation = path.resolve(REPO_ROOT, "extension", "src", "installation.ts");
    const result = audit([installation]);
    const violationsLower = result.violations.map((v) => v.toLowerCase());
    expect(violationsLower.some((v) => v.includes("platforms.ts"))).toBe(false);
    expect(violationsLower.some((v) => v.includes("evidence.ts"))).toBe(false);
  });
});
