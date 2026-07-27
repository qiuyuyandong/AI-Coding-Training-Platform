/**
 * Unit tests for V4 safe Network Transcript validator.
 *
 * Tests cover:
 * - Valid synthetic fixture acceptance
 * - Forbidden data rejection (body, raw, response text, headers,
 *   cookies, tokens, csrf, source code, user/account fields,
 *   full statement, unknown fields)
 * - Invalid query value rejection
 * - Missing provenance rejection (date, source, authentication status,
 *   sanitization, evidence tier, production eligibility)
 * - Authenticated production certification rejection
 */

// @vitest-environment node

import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

import { afterEach, describe, expect, test } from "vitest";
import { parseNetworkTranscriptEvidence } from "@/tests/helpers/networkTranscriptContract";
import { validateTranscript } from "@/scripts/validate-v4-network-transcript.mjs";

const validatorPath = resolve(process.cwd(), "scripts/validate-v4-network-transcript.mjs");
const tempRoots: string[] = [];

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

function buildValidMeta(overrides: Record<string, unknown> = {}) {
  return {
    fixtureName: "test-nowcoder-negative-browse",
    sourceUrl: "https://ac.nowcoder.com/",
    captureDate: "2026-07-26",
    captureMethod: "user-authorized browser observation",
    authenticated: false,
    sanitized: true,
    evidenceTier: "characterization-derived",
    productionEligible: false,
    signals: [
      {
        kind: "network_request_observed",
        platform: "nowcoder",
        tier: "E1",
      },
    ],
    ...overrides,
  };
}

function buildValidEvidence() {
  return [
    {
      schemaVersion: 1,
      evidenceId: "e1-test-001",
      platform: "nowcoder",
      tier: "E1",
      kind: "network_request_observed",
      requestId: "req-abc123",
      method: "GET",
      normalizedPath: "/acm/problem/abc100",
      resourceType: "main_frame",
      statusCode: 200,
      responseTopLevelFieldNames: ["data", "code", "message"],
      tabId: 1,
      frameId: 0,
      documentId: "doc-xyz789",
      receivedAt: "2026-07-26T10:00:00.000Z",
      relativeTimingOrder: 0,
      signalObservedFromRealUserAction: false,
      expectedTier: "E1",
    },
  ];
}

function buildValidTranscript(
  metaOverrides: Record<string, unknown> = {},
  evidenceOverrides: unknown[] = [],
) {
  return {
    meta: buildValidMeta(metaOverrides),
    evidence: evidenceOverrides.length > 0 ? evidenceOverrides : buildValidEvidence(),
  };
}

function validateData(data: Record<string, unknown>) {
  const failures = validateTranscript(data);
  return {
    status: failures.length === 0 ? 0 : 1,
    stdout: failures.length === 0 ? "V4 network transcript fixture PASS\n" : "",
    stderr: failures.map((failure) => `- ${failure}`).join("\n"),
  };
}

// ---------------------------------------------------------------------------
// Cleanup
// ---------------------------------------------------------------------------

afterEach(() => {
  for (const root of tempRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// Valid fixture tests
// ---------------------------------------------------------------------------

describe("valid synthetic fixture acceptance", () => {
  test("accepts a valid synthetic transcript with all permitted fields", () => {
    const result = validateData(buildValidTranscript());
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("PASS");
  });

  test("accepts a transcript with E2 and E3 evidence chain", () => {
    const evidence = [
      ...buildValidEvidence(),
      {
        schemaVersion: 1,
        evidenceId: "e2-test-001",
        platform: "nowcoder",
        tier: "E2",
        kind: "submission_confirmed",
        requestEvidenceId: "e1-test-001",
        externalSubmissionId: "sub-12345",
        problemExternalId: "acm/problem/abc100",
        submissionIdFieldName: "submissionId",
        submissionIdScalarType: "string",
        verdictStatusFieldName: "status",
        verdictStatusScalarType: "string",
        tabId: 1,
        frameId: 0,
        documentId: "doc-xyz789",
        receivedAt: "2026-07-26T10:00:01.000Z",
      },
      {
        schemaVersion: 1,
        evidenceId: "e3-test-001",
        platform: "nowcoder",
        tier: "E3",
        kind: "final_verdict_confirmed",
        externalSubmissionId: "sub-12345",
        problemExternalId: "acm/problem/abc100",
        verdict: "Accepted",
        tabId: 1,
        frameId: 0,
        documentId: "doc-xyz789",
        receivedAt: "2026-07-26T10:00:02.000Z",
      },
    ];
    const result = validateData(buildValidTranscript({}, evidence));
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("PASS");
  });

  test("accepts a transcript with minimal required fields", () => {
    const minimalMeta = buildValidMeta({
      evidenceTier: "public-content-accessible",
      productionEligible: false,
    });
    const minimalEvidence = [
      {
        schemaVersion: 1,
        evidenceId: "e1-min-001",
        platform: "nowcoder",
        tier: "E1",
        kind: "network_request_observed",
        requestId: "req-min",
        method: "GET",
        normalizedPath: "/acm/problem/abc100",
        resourceType: "main_frame",
        tabId: 1,
        frameId: 0,
        documentId: "doc-min",
        receivedAt: "2026-07-26T10:00:00.000Z",
      },
    ];
    const result = validateData({
      meta: minimalMeta,
      evidence: minimalEvidence,
    });
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("PASS");
  });

  test("accepts authenticated characterization fixture (non-production)", () => {
    const result = validateData(
      buildValidTranscript(
        {
          authenticated: true,
          evidenceTier: "authenticated-characterization",
          productionEligible: false,
        },
        buildValidEvidence(),
      ),
    );
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("PASS");
  });
});

// ---------------------------------------------------------------------------
// Forbidden data class tests
// ---------------------------------------------------------------------------

describe("forbidden data rejection", () => {
  const forbiddenFieldTests: { field: string; value: unknown }[] = [
    { field: "body", value: "some request body" },
    { field: "rawBody", value: "raw body content" },
    { field: "raw_body", value: "raw body content" },
    { field: "responseBody", value: { data: "response" } },
    { field: "response_body", value: { data: "response" } },
    { field: "responseText", value: "response text content" },
    { field: "response_text", value: "response text content" },
    { field: "code", value: "source code here" },
    { field: "source", value: "source code" },
    { field: "sourceCode", value: "source code" },
    { field: "source_code", value: "source code" },
    { field: "requestHeaders", value: { "Content-Type": "application/json" } },
    { field: "request_headers", value: { "Content-Type": "application/json" } },
    { field: "responseHeaders", value: { "Content-Type": "application/json" } },
    { field: "response_headers", value: { "Content-Type": "application/json" } },
    { field: "cookie", value: "session=abc123" },
    { field: "cookies", value: "session=abc123" },
    { field: "authorization", value: "Bearer token" },
    { field: "auth", value: "Bearer token" },
    { field: "csrf", value: "csrf-token-value" },
    { field: "csrfToken", value: "csrf-token-value" },
    { field: "csrf_token", value: "csrf-token-value" },
    { field: "token", value: "auth-token" },
    { field: "username", value: "testuser" },
    { field: "user", value: "testuser" },
    { field: "account", value: "testaccount" },
    { field: "accountId", value: "12345" },
    { field: "account_id", value: "12345" },
    { field: "email", value: "test@example.com" },
    { field: "userId", value: "12345" },
    { field: "user_id", value: "12345" },
    { field: "fullStatement", value: "Full problem statement here" },
    { field: "full_statement", value: "Full problem statement here" },
    { field: "problemStatement", value: "Problem statement" },
    { field: "problem_statement", value: "Problem statement" },
    { field: "requestBody", value: "request body" },
    { field: "request_body", value: "request body" },
  ];

  for (const { field, value } of forbiddenFieldTests) {
    test(`rejects forbidden field '${field}' at top level of evidence`, () => {
      const evidence = [
        {
          ...buildValidEvidence()[0],
          [field]: value,
        },
      ];
      const result = validateData(buildValidTranscript({}, evidence));
      expect(result.status).toBe(1);
      expect(result.stderr).toContain("Forbidden key");
      expect(result.stderr).toContain(field);
    });

    test(`rejects forbidden field '${field}' nested in evidence object`, () => {
      const evidence = [
        {
          ...buildValidEvidence()[0],
          nested: {
            [field]: value,
          },
        },
      ];
      const result = validateData(buildValidTranscript({}, evidence));
      expect(result.status).toBe(1);
      expect(result.stderr).toContain("Forbidden key");
    });
  }

  test("rejects forbidden field 'body' inside array in evidence", () => {
    const evidence = [
      {
        ...buildValidEvidence()[0],
        items: [{ body: "forbidden" }],
      },
    ];
    const result = validateData(buildValidTranscript({}, evidence));
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("Forbidden key");
  });

  test("rejects unknown field not in permitted schema", () => {
    const evidence = [
      {
        ...buildValidEvidence()[0],
        unknownField: "unexpected value",
      },
    ];
    const result = validateData(buildValidTranscript({}, evidence));
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("unknown");
  });

  test("rejects unknown field in metadata", () => {
    const result = validateData(
      buildValidTranscript({ unknownMetadataField: "value" }),
    );
    expect(result.status).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Missing provenance tests
// ---------------------------------------------------------------------------

describe("missing provenance rejection", () => {
  test("rejects missing capture date", () => {
    const result = validateData(buildValidTranscript({ captureDate: "" }));
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("captureDate");
  });

  test("rejects missing source URL", () => {
    const result = validateData(buildValidTranscript({ sourceUrl: "" }));
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("sourceUrl");
  });

  test("rejects invalid source URL format", () => {
    const result = validateData(buildValidTranscript({ sourceUrl: "not-a-url" }));
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("sourceUrl");
  });

  test("rejects source URLs with credentials, query values, or fragments", () => {
    for (const sourceUrl of [
      "https://user:password@ac.nowcoder.com/acm/problem/abc100",
      "https://ac.nowcoder.com/acm/problem/abc100?token=forbidden",
      "https://ac.nowcoder.com/acm/problem/abc100#account",
    ]) {
      const result = validateData(buildValidTranscript({ sourceUrl }));

      expect(result.status).toBe(1);
      expect(result.stderr).toContain("without credentials, query, or fragment");
    }
  });

  test("rejects missing authentication status", () => {
    const metaWithoutAuth = { ...buildValidMeta(), authenticated: undefined };
    const result = validateData({ meta: metaWithoutAuth, evidence: buildValidEvidence() });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("authenticated");
  });

  test("rejects missing sanitization flag", () => {
    const metaWithoutSanitized = { ...buildValidMeta(), sanitized: undefined };
    const result = validateData({ meta: metaWithoutSanitized, evidence: buildValidEvidence() });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("sanitized");
  });

  test("rejects sanitization flag set to false", () => {
    const result = validateData(buildValidTranscript({ sanitized: false }));
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("sanitized");
  });

  test("rejects missing evidence tier", () => {
    const metaWithoutTier = { ...buildValidMeta(), evidenceTier: undefined };
    const result = validateData({ meta: metaWithoutTier, evidence: buildValidEvidence() });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("evidenceTier");
  });

  test("rejects invalid evidence tier", () => {
    const result = validateData(buildValidTranscript({ evidenceTier: "invalid-tier" }));
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("evidenceTier");
  });

  test("rejects missing production eligibility flag", () => {
    const metaWithoutEligible = { ...buildValidMeta(), productionEligible: undefined };
    const result = validateData({ meta: metaWithoutEligible, evidence: buildValidEvidence() });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("productionEligible");
  });

  test("rejects missing signals array", () => {
    const metaWithoutSignals = { ...buildValidMeta(), signals: undefined };
    const result = validateData({ meta: metaWithoutSignals, evidence: buildValidEvidence() });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("signals");
  });

  test("rejects empty signals array", () => {
    const result = validateData(buildValidTranscript({ signals: [] }));
    expect(result.status).toBe(1);
  });

  test("rejects missing meta object entirely", () => {
    const result = validateData({ evidence: buildValidEvidence() });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("meta");
  });

  test("rejects missing evidence array entirely", () => {
    const result = validateData({ meta: buildValidMeta() });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("evidence");
  });
});

// ---------------------------------------------------------------------------
// Authenticated production certification rejection
// ---------------------------------------------------------------------------

describe("authenticated production certification rejection", () => {
  test("rejects authenticated fixture claimed as production eligible", () => {
    const result = validateData(
      buildValidTranscript(
        {
          authenticated: true,
          evidenceTier: "authenticated-characterization",
          productionEligible: true,
        },
        buildValidEvidence(),
      ),
    );
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("authenticated production certification");
    expect(result.stderr).toContain("can never satisfy a production gate");
  });

  test("rejects authenticated fixture with production-eligible flag set to true", () => {
    const result = validateData(
      buildValidTranscript(
        {
          authenticated: true,
          productionEligible: true,
        },
        buildValidEvidence(),
      ),
    );
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("authenticated production certification");
  });

  test("rejects unauthenticated fixture with production-eligible but wrong tier", () => {
    // Even unauthenticated, if evidenceTier is not certifying, productionEligible should be false
    const result = validateData(
      buildValidTranscript(
        {
          authenticated: false,
          evidenceTier: "characterization-derived",
          productionEligible: true,
        },
        buildValidEvidence(),
      ),
    );
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("cannot satisfy a production gate");
  });

  test("accepts authenticated fixture with productionEligible explicitly false", () => {
    const result = validateData(
      buildValidTranscript(
        {
          authenticated: true,
          evidenceTier: "authenticated-characterization",
          productionEligible: false,
        },
        buildValidEvidence(),
      ),
    );
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("PASS");
  });
});

// ---------------------------------------------------------------------------
// Invalid field value tests
// ---------------------------------------------------------------------------

describe("invalid field value rejection", () => {
  test("rejects unknown evidence kinds in both the CLI and TypeScript contract", () => {
    const evidence = [{ ...buildValidEvidence()[0], kind: "unknown" }];
    const result = validateData(buildValidTranscript({}, evidence));
    const parsed = parseNetworkTranscriptEvidence(evidence[0]);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("invalid_union_discriminator");
    expect(parsed.ok).toBe(false);
  });

  test("rejects incorrect evidence schema version in both the CLI and TypeScript contract", () => {
    const evidence = [{ ...buildValidEvidence()[0], schemaVersion: 2 }];
    const result = validateData(buildValidTranscript({}, evidence));
    const parsed = parseNetworkTranscriptEvidence(evidence[0]);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("invalid_literal");
    expect(parsed.ok).toBe(false);
  });
  test("rejects invalid HTTP method", () => {
    const evidence = [
      {
        ...buildValidEvidence()[0],
        method: "INVALID",
      },
    ];
    const result = validateData(buildValidTranscript({}, evidence));
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("method");
  });

  test("rejects invalid status code range", () => {
    const evidence = [
      {
        ...buildValidEvidence()[0],
        statusCode: 99,
      },
    ];
    const result = validateData(buildValidTranscript({}, evidence));
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("statusCode");
  });

  test("rejects status code above 599", () => {
    const evidence = [
      {
        ...buildValidEvidence()[0],
        statusCode: 600,
      },
    ];
    const result = validateData(buildValidTranscript({}, evidence));
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("statusCode");
  });

  test("rejects invalid resource type", () => {
    const evidence = [
      {
        ...buildValidEvidence()[0],
        resourceType: "invalid",
      },
    ];
    const result = validateData(buildValidTranscript({}, evidence));
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("resourceType");
  });

  test("rejects malformed normalized path (no leading slash)", () => {
    const evidence = [
      {
        ...buildValidEvidence()[0],
        normalizedPath: "acm/problem/abc100",
      },
    ];
    const result = validateData(buildValidTranscript({}, evidence));
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("normalizedPath");
  });

  test("rejects normalized path with invalid characters", () => {
    const evidence = [
      {
        ...buildValidEvidence()[0],
        normalizedPath: "/api?param=value",
      },
    ];
    const result = validateData(buildValidTranscript({}, evidence));
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("normalizedPath");
  });

  test("rejects evidence with control characters in identifier", () => {
    const evidence = [
      {
        ...buildValidEvidence()[0],
        evidenceId: "e1-test\x00-001",
      },
    ];
    const result = validateData(buildValidTranscript({}, evidence));
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("control");
  });

  test("rejects invalid ISO datetime format", () => {
    const evidence = [
      {
        ...buildValidEvidence()[0],
        receivedAt: "2026-07-26 10:00:00",
      },
    ];
    const result = validateData(buildValidTranscript({}, evidence));
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("receivedAt");
  });

  test("rejects invalid tier value", () => {
    const evidence = [
      {
        ...buildValidEvidence()[0],
        tier: "E5",
      },
    ];
    const result = validateData(buildValidTranscript({}, evidence));
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("tier");
  });

  test("rejects invalid platform value", () => {
    const evidence = [
      {
        ...buildValidEvidence()[0],
        platform: "unknown",
      },
    ];
    const result = validateData(buildValidTranscript({}, evidence));
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("platform");
  });

  test("rejects negative tabId", () => {
    const evidence = [
      {
        ...buildValidEvidence()[0],
        tabId: -1,
      },
    ];
    const result = validateData(buildValidTranscript({}, evidence));
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("tabId");
  });

  test("rejects invalid submissionIdScalarType", () => {
    const evidence = [
      {
        schemaVersion: 1,
        evidenceId: "e2-test-001",
        platform: "nowcoder",
        tier: "E2",
        kind: "submission_confirmed",
        requestEvidenceId: "e1-test-001",
        externalSubmissionId: "sub-12345",
        problemExternalId: "acm/problem/abc100",
        submissionIdFieldName: "submissionId",
        submissionIdScalarType: "boolean", // invalid
        tabId: 1,
        frameId: 0,
        documentId: "doc-xyz789",
        receivedAt: "2026-07-26T10:00:01.000Z",
      },
    ];
    const result = validateData(buildValidTranscript({}, evidence));
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("submissionIdScalarType");
  });
});

// ---------------------------------------------------------------------------
// Valid E2 and E3 evidence tests
// ---------------------------------------------------------------------------

describe("E2 submission confirmed evidence validation", () => {
  test("accepts valid E2 evidence with all required fields", () => {
    const evidence = [
      {
        schemaVersion: 1,
        evidenceId: "e2-001",
        platform: "nowcoder",
        tier: "E2",
        kind: "submission_confirmed",
        requestEvidenceId: "e1-001",
        externalSubmissionId: "sub-999",
        problemExternalId: "acm/problem/abc100",
        submissionIdFieldName: "submissionId",
        submissionIdScalarType: "string",
        verdictStatusFieldName: "status",
        verdictStatusScalarType: "string",
        tabId: 1,
        frameId: 0,
        documentId: "doc-xyz789",
        receivedAt: "2026-07-26T10:00:01.000Z",
      },
    ];
    const result = validateData(buildValidTranscript({}, evidence));
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("PASS");
  });

  test("accepts E2 evidence with minimal fields", () => {
    const evidence = [
      {
        schemaVersion: 1,
        evidenceId: "e2-001",
        platform: "nowcoder",
        tier: "E2",
        kind: "submission_confirmed",
        requestEvidenceId: "e1-001",
        externalSubmissionId: "sub-999",
        problemExternalId: "acm/problem/abc100",
        submissionIdFieldName: "submissionId",
        submissionIdScalarType: "number",
        tabId: 1,
        frameId: 0,
        documentId: "doc-xyz789",
        receivedAt: "2026-07-26T10:00:01.000Z",
      },
    ];
    const result = validateData(buildValidTranscript({}, evidence));
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("PASS");
  });

  test("accepts E2 with bigint submission ID type", () => {
    const evidence = [
      {
        schemaVersion: 1,
        evidenceId: "e2-001",
        platform: "nowcoder",
        tier: "E2",
        kind: "submission_confirmed",
        requestEvidenceId: "e1-001",
        externalSubmissionId: "sub-999",
        problemExternalId: "acm/problem/abc100",
        submissionIdFieldName: "submissionId",
        submissionIdScalarType: "bigint",
        tabId: 1,
        frameId: 0,
        documentId: "doc-xyz789",
        receivedAt: "2026-07-26T10:00:01.000Z",
      },
    ];
    const result = validateData(buildValidTranscript({}, evidence));
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("PASS");
  });
});

describe("E3 final verdict confirmed evidence validation", () => {
  test("accepts valid E3 evidence", () => {
    const evidence = [
      {
        schemaVersion: 1,
        evidenceId: "e3-001",
        platform: "nowcoder",
        tier: "E3",
        kind: "final_verdict_confirmed",
        externalSubmissionId: "sub-999",
        problemExternalId: "acm/problem/abc100",
        verdict: "Accepted",
        tabId: 1,
        frameId: 0,
        documentId: "doc-xyz789",
        receivedAt: "2026-07-26T10:00:02.000Z",
      },
    ];
    const result = validateData(buildValidTranscript({}, evidence));
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("PASS");
  });

  test("accepts E3 with non-Accepted verdict", () => {
    const evidence = [
      {
        schemaVersion: 1,
        evidenceId: "e3-001",
        platform: "nowcoder",
        tier: "E3",
        kind: "final_verdict_confirmed",
        externalSubmissionId: "sub-999",
        problemExternalId: "acm/problem/abc100",
        verdict: "Wrong Answer",
        tabId: 1,
        frameId: 0,
        documentId: "doc-xyz789",
        receivedAt: "2026-07-26T10:00:02.000Z",
      },
    ];
    const result = validateData(buildValidTranscript({}, evidence));
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("PASS");
  });

  test("rejects E3 with empty verdict", () => {
    const evidence = [
      {
        schemaVersion: 1,
        evidenceId: "e3-001",
        platform: "nowcoder",
        tier: "E3",
        kind: "final_verdict_confirmed",
        externalSubmissionId: "sub-999",
        problemExternalId: "acm/problem/abc100",
        verdict: "",
        tabId: 1,
        frameId: 0,
        documentId: "doc-xyz789",
        receivedAt: "2026-07-26T10:00:02.000Z",
      },
    ];
    const result = validateData(buildValidTranscript({}, evidence));
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("verdict");
  });
});

// ---------------------------------------------------------------------------
// CLI exit code tests
// ---------------------------------------------------------------------------

describe("CLI exit codes", () => {
  test("returns 0 for valid transcript", () => {
    const result = validateData(buildValidTranscript());
    expect(result.status).toBe(0);
  });

  test("returns 1 for invalid transcript", () => {
    const evidence = [{ ...buildValidEvidence()[0], body: "forbidden" }];
    const result = validateData(buildValidTranscript({}, evidence));
    expect(result.status).toBe(1);
  });

  test("returns 2 for missing argument", () => {
    const result = spawnSync(process.execPath, ["--import", "tsx", validatorPath], {
      encoding: "utf8",
    });
    expect(result.status).toBe(2);
    expect(result.stderr).toContain("usage");
  });

  test("returns 1 for non-existent file", () => {
    const result = spawnSync(process.execPath, ["--import", "tsx", validatorPath, "/nonexistent/path.json"], {
      encoding: "utf8",
    });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("does not exist");
  });

  test("returns 1 for invalid JSON", () => {
    const root = mkdtempSync(join(tmpdir(), "v4-network-transcript-"));
    tempRoots.push(root);
    const path = join(root, "invalid.json");
    writeFileSync(path, "{ invalid json }", "utf8");
    const result = spawnSync(process.execPath, ["--import", "tsx", validatorPath, path], {
      encoding: "utf8",
    });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("invalid JSON");
  });
});

// ---------------------------------------------------------------------------
// authenticated-characterization tier validation
// ---------------------------------------------------------------------------

describe("authenticated-characterization tier requirements", () => {
  test("rejects authenticated-characterization with authenticated === false", () => {
    const result = validateData(
      buildValidTranscript({
        authenticated: false,
        evidenceTier: "authenticated-characterization",
        productionEligible: false,
      }),
    );
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("authenticated-characterization");
    expect(result.stderr).toContain("authenticated === true");
  });

  test("accepts authenticated-characterization with all requirements met", () => {
    const result = validateData(
      buildValidTranscript({
        authenticated: true,
        evidenceTier: "authenticated-characterization",
        productionEligible: false,
      }),
    );
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("PASS");
  });
});

// ---------------------------------------------------------------------------
// Multi-evidence chain validation
// ---------------------------------------------------------------------------

describe("multi-evidence chain validation", () => {
  test("accepts valid three-stage chain (E1 -> E2 -> E3)", () => {
    const evidence = [
      {
        schemaVersion: 1,
        evidenceId: "e1-chain-001",
        platform: "nowcoder",
        tier: "E1",
        kind: "network_request_observed",
        requestId: "req-chain",
        method: "POST",
        normalizedPath: "/acm/problem/abc100/submit",
        resourceType: "xmlhttprequest",
        statusCode: 200,
        tabId: 1,
        frameId: 0,
        documentId: "doc-chain",
        receivedAt: "2026-07-26T10:00:00.000Z",
      },
      {
        schemaVersion: 1,
        evidenceId: "e2-chain-001",
        platform: "nowcoder",
        tier: "E2",
        kind: "submission_confirmed",
        requestEvidenceId: "e1-chain-001",
        externalSubmissionId: "sub-chain-001",
        problemExternalId: "acm/problem/abc100",
        submissionIdFieldName: "submissionId",
        submissionIdScalarType: "string",
        tabId: 1,
        frameId: 0,
        documentId: "doc-chain",
        receivedAt: "2026-07-26T10:00:01.000Z",
      },
      {
        schemaVersion: 1,
        evidenceId: "e3-chain-001",
        platform: "nowcoder",
        tier: "E3",
        kind: "final_verdict_confirmed",
        externalSubmissionId: "sub-chain-001",
        problemExternalId: "acm/problem/abc100",
        verdict: "Accepted",
        tabId: 1,
        frameId: 0,
        documentId: "doc-chain",
        receivedAt: "2026-07-26T10:00:05.000Z",
      },
    ];
    const result = validateData(buildValidTranscript({}, evidence));
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("PASS");
  });

  test("rejects E1 evidence with forbidden field in chain", () => {
    const evidence = [
      {
        ...buildValidEvidence()[0],
        headers: { "Content-Type": "application/json" },
      },
    ];
    const result = validateData(buildValidTranscript({}, evidence));
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("Forbidden key");
  });

  test("validates each evidence item independently", () => {
    const evidence = [
      buildValidEvidence()[0],
      {
        schemaVersion: 1,
        evidenceId: "e2-invalid",
        platform: "nowcoder",
        tier: "E2",
        kind: "submission_confirmed",
        requestEvidenceId: "e1-test-001",
        externalSubmissionId: "sub-12345",
        problemExternalId: "acm/problem/abc100",
        submissionIdFieldName: "submissionId",
        submissionIdScalarType: "invalid-type",
        tabId: 1,
        frameId: 0,
        documentId: "doc-xyz789",
        receivedAt: "2026-07-26T10:00:01.000Z",
      },
    ];
    const result = validateData(buildValidTranscript({}, evidence));
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("submissionIdScalarType");
  });
});
