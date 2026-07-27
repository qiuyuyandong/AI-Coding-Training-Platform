# NowCoder Network Fixture Corpus — Safe Network Transcripts

> **Phase B Task B1:** strict, local-only safe Network Transcript schema,
> CLI validator, synthetic fixture documentation, and tests.
>
> **Status:** `characterization-derived`. NOT certifying. NOT production.
>
> **Authentication:** Authenticated fixtures (if any) are marked
> `authenticated: true` and can **NEVER** satisfy a production certification
> gate under any circumstances.

## Overview

This directory stores safe network transcript fixtures from NowCoder
characterization observations. Each fixture contains only schema-valid scalar
metadata about observed network requests — no raw bodies, headers, cookies,
tokens, credentials, source code, or user-identifying information.

## Data Sanitation

All fixtures in this directory contain **sanitized data only**:

- Request/response bodies: **NOT retained**
- Raw response text: **NOT retained**
- Headers (request or response): **NOT retained**
- Cookies: **NOT retained**
- Authorization tokens: **NOT retained**
- CSRF values: **NOT retained**
- Source code: **NOT retained**
- Username/account identity: **NOT retained**
- Full problem statements: **NOT retained**
- Unknown fields: **NOT retained**

### Permitted Fields

The following fields ARE retained after strict schema validation:

| Field | Description |
|-------|-------------|
| `platform` | Platform identifier (e.g., "nowcoder") |
| `method` | HTTP method (GET, POST, etc.) |
| `normalizedPath` | Path with user-specific and secret query values stripped |
| `resourceType` | Chrome webRequest resource type |
| `statusCode` | HTTP status code (100-599) |
| `normalizedRedirectPath` | Normalized redirect target path |
| `responseTopLevelFieldNames` | Top-level response field names only |
| `submissionIdFieldName` | Field name for submission ID |
| `submissionIdScalarType` | Scalar type for submission ID |
| `verdictStatusFieldName` | Field name for verdict/status |
| `verdictStatusScalarType` | Scalar type for verdict/status |
| `tabId`, `frameId`, `documentId` | Browser document identity |
| `relativeTimingOrder` | Relative request ordering |
| `expectedTier` | Evidence tier classification |

## Authenticated Fixtures

**Authenticated fixtures can NEVER certify production.**

Any fixture captured from a logged-in browser session is marked:

```json
{
  "authenticated": true,
  "evidenceTier": "authenticated-characterization",
  "productionEligible": false
}
```

This is not a limitation to be worked around — it is a design constraint.
Authenticated characterization evidence is explicitly non-certifying under the
repository's evidence rules. Production certification requires unauthenticated,
publicly accessible evidence.

## Evidence Tiers

| Tier | Description | Production Eligible |
|------|-------------|---------------------|
| `public-content-accessible` | Public pages, no authentication | Yes (with verification) |
| `verified-public-dom` | DOM-verified public verdict | Yes |
| `characterization-derived` | Derived from characterization | No |
| `authenticated-characterization` | Logged-in session observation | **NEVER** |

## Fixture Schema

Every fixture must conform to the `NetworkTranscriptMeta` schema:

```typescript
interface NetworkTranscriptMeta {
  fixtureName: string;
  sourceUrl: string;           // Must be valid URL
  captureDate: string;          // YYYY-MM-DD format
  captureMethod: string;        // e.g., "user-authorized browser observation"
  authenticated: boolean;       // true = logged-in session
  sanitized: true;              // Always true (enforced)
  evidenceTier: EvidenceTier;   // See table above
  productionEligible: boolean;  // false if authenticated
  signals: Array<{
    kind: string;
    platform: Platform;
    tier: Tier;
  }>;
  notes?: string;
}
```

## Validation

All fixtures must pass the strict network transcript validator:

```powershell
node scripts/validate-v4-network-transcript.mjs tests/fixtures/nowcoder/network/<fixture>.json
```

The validator enforces:

- No forbidden keys present
- All required provenance fields present
- Valid field value types and ranges
- Authenticated fixtures cannot claim production eligibility
- Normalized paths contain no secret query parameters

## Synthetic Fixtures

Synthetic fixtures in this directory are generated for testing purposes and
do not represent real network observations. They validate the schema and
validator behavior without requiring live traffic.

## Missing Evidence

This corpus is scoped to NowCoder `ac.nowcoder.com` only. Other NowCoder
domains or subdomains require separate characterization with their own
safety validation.

## Non-Goals

- Production certification using authenticated fixtures
- Real browser/network activity
- Source code or credential retention
- Headers or body inspection
