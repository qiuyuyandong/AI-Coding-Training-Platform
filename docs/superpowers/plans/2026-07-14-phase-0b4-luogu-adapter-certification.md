# Phase 0B4 Luogu Adapter Fixture and Certification Plan

**Status:** Executed on 2026-07-14. Terminal state: **BLOCKED** because no publicly accessible Luogu verdict DOM was available; implementation and quality gates passed, Luogu remains `experimental`, and Task 4a was not executed.

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans`. Each Task starts with a failing or characterization test. Use `superpowers:verification-before-completion` before the final wave.

**Goal:** Build a certification gate that determines whether the Luogu adapter can be promoted to `production` readiness. The gate consumes a static DOM-fixture corpus, a formal adapter-state registry, and produces a machine-readable CERTIFIED or BLOCKED verdict. Certification requires publicly verified verdict DOM evidence; characterization-only evidence is insufficient. If the gate blocks, Luogu remains `experimental` and the plan terminates in a documented blocked state — it does not claim completion.

**Architecture:** A new `PlatformAdapterStatus` type and `PLATFORM_ADAPTERS` registry in `extension/src/platforms.ts` declares each platform's readiness level, initially with Luogu as `experimental` (same as other enabled platforms). `candidateTextForPlatform` draws selectors from the registry. A `tests/fixtures/luogu/` corpus stores sanitized DOM fragments with provenance metadata; `detectProblemFromLocation` and `detectVerdictFromDocument` are exercised against every fixture. The certification gate (`tests/unit/platformCertification.test.ts`) reads fixture metadata, determines whether publicly verified verdict DOM exists, and enforces a hard rule: if verdict DOM is not publicly verifiable, Luogu must NOT be `production`. A separate promotion task changes Luogu to `production` only when the gate certifies. A separate E2E test verifies capture-pipeline platform identity (this is explicitly NOT DOM adapter certification and may run while Luogu is `experimental`).

**Tech Stack:** TypeScript 5.8 strict, Chrome MV3, Vitest 3.2/jsdom, Playwright 1.53, Next.js 15, SQLite/better-sqlite3.

**Repository baseline:** Current clean HEAD is `a9060e4` (docs: reconcile Phase 0 handoff state). Merge commit `983e10a` is the Phase 0C2 implementation commit and is an ancestor. This plan runs on clean `feature/v1-followup` at `a9060e4`.

---

## Global Constraints

- Every proposed path, symbol, and type is grounded in current code. No invented or unverified paths.
- Do not change V2 database schema, event envelope, provenance schemas, migration files, capture transition, or credential domain.
- Do not add cookies, tokens, session storage, hidden platform data, full problem statements, live scraping, credentials, cloud/AI calls, or external API requests in any automated test.
- Do not use `any`, `as any`, `as unknown`, `@ts-ignore`, `@ts-expect-error`, or non-null assertions.
- Do not commit. All steps end with diff inspection. Commander accepts or rejects before any commit.
- All test databases must be temporary (in-memory or `.tmp/playwright/`). Never open the repository default database.
- Existing unit/E2E tests must continue to pass after each task. Run the full gate before declaring completion.
- No Playwright test uses the network to reach real OJ sites. All E2E scenarios post fixture events through the API only.
- Only Task 0 (fixture acquisition) may use read-only browser access under the repository `web-access` policy. Every other task is fully offline.
- Phase 0D work (lint, CI, migration tests beyond existing coverage) is explicitly excluded.
- The plan supports two terminal states: CERTIFIED (Luogu becomes `production`) or BLOCKED (Luogu remains `experimental`, blocker documented in artifact). Do not mark the plan complete in BLOCKED state without recording the blocker.
- Every new pure source/test module must stay under 250 pure LOC (no comments). No `any`/suppressions/non-null assertions.
- Type definitions, schemas, and fixture loading logic live exclusively in `tests/helpers/luoguFixtureMetadata.ts`. No other file defines `EvidenceTier`, `FixtureMeta`, or fixture path resolution.

---

## Task Dependency Graph

```text
Task 0 (fixture acquisition, conditional read-only browser)
  |
  v
Task 1 (adapter registry — luogu = experimental) ──────────┐
  |                                                         |
  v                                                         v
Task 2 (fixture-loader characterization) ──────────> Task 3 (certification gate)
                                                              |
                                              ┌───────────────┴───────────────┐
                                              v                               v
                                       Task 4a (promote to production)   Task 4b (document blocker)
                                              |                               |
                                              v                               v
                                       Task 5 (E2E pipeline identity — runs while experimental)
                                              |
                                              v
                                       Task 6 (manual certification artifact)
                                              |
                                              v
                                       Task 7 (full gate + probes + cleanup)
```

Task 3 is the fork point. If the gate CERTIFIEDs, execute 4a then 5-7. If BLOCKED, execute 4b then 5-7 (Luogu remains `experimental` throughout).

---

## Deliverables Summary

| # | Deliverable | Key files | Dependency |
|---|-------------|-----------|------------|
| 0 | Luogu DOM fixture corpus | `tests/fixtures/luogu/*` | Read-only browser (conditional) |
| 1 | Adapter status registry (luogu=experimental) + refactor | `extension/src/platforms.ts` | None |
| 1b | Canonical fixture metadata module | `tests/helpers/luoguFixtureMetadata.ts` | None |
| 2 | Fixture-loader characterization tests | `tests/unit/luoguFixtureLoader.test.ts`, `tests/helpers/luoguFixtureMetadata.ts`, `tests/fixtures/luogu/*` | Task 0, Task 1, Task 1b |
| 3 | Certification decision gate | `tests/unit/platformCertification.test.ts`, `tests/helpers/luoguFixtureMetadata.ts` | Task 1, Task 1b, Task 2 |
| 4a | Promotion: change luogu to `production` | `extension/src/platforms.ts` | Task 3 == CERTIFIED |
| 4b | Blocker: record blocker in artifact | `work/reports/luogu-adapter-blocker.json` | Task 3 == BLOCKED |
| 5 | Luogu capture-pipeline E2E | `tests/e2e/capture-luogu-problem.spec.ts`, `tests/e2e/captureFixtures.ts` | Task 1 |
| 6 | Certification/blocker artifact | `work/reports/luogu-adapter-certification.json` | Task 2 |
| 7 | Quality gate + probes + cleanup | All verification commands | Tasks 0-6 |

---

## TODO: Task 0 — Acquire and store Luogu DOM fixture corpus

**Prerequisite:** This task requires read-only browser access to public Luogu pages. If the worker does not have browser automation capability, or if Luogu blocks read-only access, this task documents the failure. The certification gate (Task 3) reads the resulting fixture metadata to decide CERTIFIED vs BLOCKED. If public verdict DOM cannot be acquired, the gate BLOCKEDs.

**Files:**
- Create directory: `tests/fixtures/luogu/`
- Create for each fixture: `<name>.html` (sanitized HTML fragment) + `<name>.meta.json` (provenance metadata)

**Goal:** Capture public, visible Luogu DOM fragments that the extension's `detectProblemFromLocation` and `detectVerdictFromDocument` would encounter. Store only minimal verdict/status/problem-identity markup. Forbid problem statements, cookies, tokens, login-only data, scripts, inline event handlers, or personal data.

**Fixture provenance schema (`*.meta.json`):**

The `evidenceTier` field is the single source of truth for certification eligibility. It replaces any inference from `authenticated` alone.

```json
{
  "fixtureName": "problem-p1001",
  "sourceUrl": "https://www.luogu.com.cn/problem/P1001",
  "captureDate": "2026-07-14",
  "captureMethod": "read-only browser",
  "evidenceTier": "public-content-accessible",
  "purpose": "detectProblemFromLocation",
  "selectors": ["body"],
  "authenticated": false,
  "sanitized": true,
  "verdictExpected": null,
  "problemExpected": { "platform": "luogu", "externalId": "P1001" }
}
```

`evidenceTier` values and their meanings:

| Value | Meaning | Certifies verdict? |
|---|---|---|
| `"public-content-accessible"` | Public URL/title/content observed. Confirms detection of platform and problem identity from URL. Does NOT involve verdict DOM selectors. | No |
| `"verified-public-dom"` | Actual raw/rendered public DOM containing verdict text, acquired from a publicly accessible page without authentication. Selector provenance is documented. | Yes — only this tier |
| `"characterization-derived"` | Synthetic or sanitized markup with no real public DOM basis. Tests the `verdictFromText` function but is NOT evidence of real Luogu verdict page detection. | No |

The `authenticated` field is retained for audit trail but MUST NOT be used to infer evidence tier. Task 3 gate logic reads `evidenceTier` exclusively.

The `purpose` field uses these exact values:
- `"detectProblemFromLocation"` — tests URL-based problem detection against the fixture's source URL and title
- `"detectVerdictFromDocument"` — tests verdict text extraction from the fixture's HTML body
- `"both"` — tests both (only applicable for problem pages that also contain verdict elements)
- `"negative"` — tests that no verdict is detected (no-verdict problem page)

**Required fixture tiers (evidenceTier classification):**

**public-content-accessible:** Confirms that `detectProblemFromLocation` correctly identifies Luogu platform and problem identity from URL and title. This is NOT verdict DOM evidence and cannot contribute to verdict certification.

| Fixture name | evidenceTier | Purpose | Source | Expected detection |
|---|---|---|---|---|
| `problem-p1001` | public-content-accessible | detectProblemFromLocation | `https://www.luogu.com.cn/problem/P1001` | `detectProblemFromLocation` → `{ platform: "luogu", externalId: "P1001" }` |
| `problem-b3619` | public-content-accessible | detectProblemFromLocation | `https://www.luogu.com.cn/problem/B3619` | `detectProblemFromLocation` → `{ platform: "luogu", externalId: "B3619" }` |
| `problem-at-suffix` | public-content-accessible | detectProblemFromLocation | `https://www.luogu.com.cn/problem/AT_abc001_a` | `detectProblemFromLocation` → `{ platform: "luogu", externalId: "AT_ABC001_A" }` |

**verified-public-dom (required for CERTIFIED):** Actual public verdict DOM with documented selector provenance. Only this evidenceTier can satisfy certification. Requires a publicly visible Luogu page containing `.status`, `.record-status`, or `.submission-status` with verdict text, accessible without authentication.

| Fixture name | evidenceTier | Purpose | Expected detection |
|---|---|---|---|
| `verdict-accepted` | verified-public-dom | detectVerdictFromDocument | `detectVerdictFromDocument` → `{ verdict: "Accepted" }` |
| `verdict-accepted-chinese` | verified-public-dom | detectVerdictFromDocument | `detectVerdictFromDocument` → `{ verdict: "Accepted" }` |
| `verdict-wa` | verified-public-dom | detectVerdictFromDocument | `detectVerdictFromDocument` → `{ verdict: "Wrong Answer" }` |
| `verdict-re` | verified-public-dom | detectVerdictFromDocument | `detectVerdictFromDocument` → `{ verdict: "Runtime Error" }` |
| `verdict-tle` | verified-public-dom | detectVerdictFromDocument | `detectVerdictFromDocument` → `{ verdict: "Time Limit Exceeded" }` |
| `verdict-mle` | verified-public-dom | detectVerdictFromDocument | `detectVerdictFromDocument` → `{ verdict: "Memory Limit Exceeded" }` |
| `verdict-ce` | verified-public-dom | detectVerdictFromDocument | `detectVerdictFromDocument` → `{ verdict: "Compile Error" }` |
| `verdict-partial` | verified-public-dom | detectVerdictFromDocument | `detectVerdictFromDocument` → `{ verdict: "Partially Accepted" }` |

**characterization-derived (does NOT certify):** Synthetic or sanitized markup with no real public DOM basis. If verified-public-dom fixtures cannot be acquired, all verdict fixtures fall here. The `no-verdict-problem` fixture is also characterization-derived — it is a sanitized/stripped problem page, not a real DOM observation of a verdict-absent page. These fixtures test the `verdictFromText` function but do NOT count toward production certification.

| Fixture name | evidenceTier | Purpose | Expected detection |
|---|---|---|---|
| `no-verdict-problem` | characterization-derived | negative | `detectVerdictFromDocument` → `null` |
| `verdict-accepted` | characterization-derived | detectVerdictFromDocument | `detectVerdictFromDocument` → `{ verdict: "Accepted" }` |
| `verdict-accepted-chinese` | characterization-derived | detectVerdictFromDocument | `detectVerdictFromDocument` → `{ verdict: "Accepted" }` |
| (all verdict variants) | characterization-derived | ... | ... |

**Critical rule:** `evidenceTier` is the single source of truth. The `authenticated` field is retained for audit trail only. A fixture with `evidenceTier: "public-content-accessible"` and `authenticated: false` does NOT certify verdict detection — it only certifies URL detection. The `no-verdict-problem` fixture has `evidenceTier: "characterization-derived"` even though it may have `authenticated: false`, because the stripped DOM is not a real public verdict-absent page.

**Sanitization rules for each fixture:**
1. Strip `<script>`, `<style>`, `<iframe>`, `<link>`, `<meta>`, event handler attributes (`onclick`, `onload`, etc.).
2. Strip cookies, localStorage, sessionStorage references.
3. Strip problem statement text (only leave enough DOM to identify the verdict/status region).
4. Reduce to a single root element containing only the status/verdict DOM subtree.
5. Verify no personal data, no login tokens, no session identifiers remain.

- [x] **Step 0.1: Check public Luogu page accessibility**

Run a read-only fetch of `https://www.luogu.com.cn/problem/P1001` using the web-access skill's CDP browser (or any HTTP GET that does not send credentials).

Observable PASS: HTTP 200, response contains `<title>` with problem name, body contains problem content.
Observable FAIL: HTTP 403/401/429/redirect-to-login. If FAIL, ALL tiers are blocked and the plan terminates here — no certification is possible.

Artifact: `work/reports/luogu-public-accessibility.txt` containing PASS/FAIL and the status code.

- [~] **Step 0.2: PARTIAL — retained title/content evidence only; raw public DOM unavailable**

From the publicly accessible problem page, extract the `<head>` title text and the minimal `<body>` content. Sanitize per rules above. Save each as `<externalId-lowercase>.html` + `.meta.json`.

For the `no-verdict-problem` fixture: save the problem page DOM but strip any `.status`, `.record-status`, `.submission-status` elements that might appear. This tests the negative case. Its `evidenceTier` is `characterization-derived` — the stripped DOM is not real public verdict-absent evidence.

- [~] **Step 0.3: BLOCKED — Luogu record/verdict surfaces require authentication**

For verdict elements, attempt to find a publicly visible Luogu page that contains `.status`, `.record-status`, or `.submission-status` with verdict text. Candidates:
- Public submission record (if a stable URL exists and is accessible without login)
- Problem set page with solved/attempted indicators
- Any public archive of submission results
- Luogu's own public status/record pages

If such a public page is found: extract the verdict status element with its selector provenance, sanitize, save with `evidenceTier: "verified-public-dom"`.
If NO such public page exists without authentication: **verified-public-dom tier is empty**. All verdict fixtures use `evidenceTier: "characterization-derived"`. Record the finding in `work/reports/luogu-public-verdict-status.txt`.

**This is the hard gate.** If no fixture has `evidenceTier: "verified-public-dom"`, the certification gate (Task 3) will BLOCK, and promotion (Task 4a) is skipped. The plan enters the BLOCKED terminal state.

- [x] **Step 0.4: Structure the fixture directory**

```
tests/fixtures/luogu/
  readme.md  (documents acquisition date, method, tiers, and any blockers found)
  problem-p1001.html
  problem-p1001.meta.json
  problem-b3619.html
  problem-b3619.meta.json
  problem-at-abc001-a.html
  problem-at-abc001-a.meta.json
  no-verdict-problem.html
  no-verdict-problem.meta.json
  (if verified-public-dom acquired:) verdict-accepted.html + .meta.json, verdict-wa.html + .meta.json, ...
  (if characterization-derived only:) verdict-accepted.html + .meta.json (evidenceTier: characterization-derived), ...
```

- [x] **Step 0.5: Ensure every fixture metadata has explicit evidenceTier**

Before Task 2 runs, every `.meta.json` file must contain the `evidenceTier` field. If any fixture was created with an older schema that lacks it, Task 0 must add the field now (without changing any `.html` file):

```powershell
Get-ChildItem -Path "tests/fixtures/luogu" -Filter "*.meta.json" | ForEach-Object {
  $meta = Get-Content $_.FullName | ConvertFrom-Json
  if (-not $meta.PSObject.Properties.Name.Contains("evidenceTier")) {
    if ($meta.purpose -eq "detectProblemFromLocation" -or $meta.purpose -eq "both") {
      $meta | Add-Member -NotePropertyName "evidenceTier" -NotePropertyValue "public-content-accessible"
    } elseif ($meta.purpose -eq "negative" -or $meta.authenticated -eq $true) {
      $meta | Add-Member -NotePropertyName "evidenceTier" -NotePropertyValue "characterization-derived"
    } else {
      $meta | Add-Member -NotePropertyName "evidenceTier" -NotePropertyValue "characterization-derived"
    }
    $meta | ConvertTo-Json -Depth 10 | Set-Content $_.FullName
  }
}
```

Verify every file has the field:

```powershell
Get-ChildItem -Path "tests/fixtures/luogu" -Filter "*.meta.json" | ForEach-Object {
  $m = Get-Content $_.FullName | ConvertFrom-Json
  if (-not $m.PSObject.Properties.Name.Contains("evidenceTier")) { throw "$($_.Name) missing evidenceTier" }
}
```

Expected: no errors. Every `.meta.json` has an explicit `evidenceTier`.

- [x] **Step 0.6: Cleanup receipt**

```powershell
git status --short
```

Expected: only `tests/fixtures/luogu/*` files and `work/reports/luogu-public-accessibility.txt` (and `work/reports/luogu-public-verdict-status.txt` if verified-public-dom acquisition was attempted) appear as untracked.

---

## TODO: Task 1 — Adapter status registry (Luogu = experimental) and candidateTextForPlatform refactor

**Failing-first:** Write tests that reference `getPlatformAdapterStatus`, `getProductionPlatforms`, and `PLATFORM_ADAPTERS` before they exist. These tests assert that NO platform is `production` yet — Luogu starts as `experimental` like all other enabled adapters.

**Files:**
- Modify: `extension/src/platforms.ts`
- Modify: `tests/unit/extensionPlatforms.test.ts`

**Interfaces to produce:**

```typescript
export type PlatformAdapterStatus = "production" | "experimental" | "disabled";

export type PlatformAdapterRecord = {
  readonly status: PlatformAdapterStatus;
  readonly label: string;
  readonly selectors: readonly string[];
};

export const PLATFORM_ADAPTERS: Record<Platform, PlatformAdapterRecord>;

export function getPlatformAdapterStatus(platform: Platform): PlatformAdapterStatus;

export function getProductionPlatforms(): Platform[];
```

- [x] **Step 1.1: Write failing adapter status tests — assert NO production platform**

Append to `tests/unit/extensionPlatforms.test.ts`:

```typescript
import {
  getPlatformAdapterStatus,
  getProductionPlatforms,
  PLATFORM_ADAPTERS,
} from "@/extension/src/platforms";

describe("adapter status registry", () => {
  it("initially has no production platform (certification gate must decide)", () => {
    expect(getProductionPlatforms()).toEqual([]);
  });

  it("every currently enabled platform is experimental or disabled", () => {
    for (const platform of ["leetcode", "nowcoder", "codeforces", "atcoder", "luogu"] as const) {
      const status = getPlatformAdapterStatus(platform);
      expect(["experimental", "disabled"]).toContain(status);
    }
  });

  it("every platform has an adapter record with label and selectors", () => {
    for (const record of Object.values(PLATFORM_ADAPTERS)) {
      expect(typeof record.label).toBe("string");
      expect(record.label.length).toBeGreaterThan(0);
      expect(Array.isArray(record.selectors)).toBe(true);
      expect(record.selectors.length).toBeGreaterThan(0);
    }
  });
});
```

```powershell
npm run test -- tests/unit/extensionPlatforms.test.ts
```
Expected: FAIL with "does not provide an export named 'getPlatformAdapterStatus'".

- [x] **Step 1.2: Implement the adapter registry — Luogu is experimental**

In `extension/src/platforms.ts`, add after the `Platform` type:

```typescript
export type PlatformAdapterStatus = "production" | "experimental" | "disabled";

export type PlatformAdapterRecord = {
  readonly status: PlatformAdapterStatus;
  readonly label: string;
  readonly selectors: readonly string[];
};

export const PLATFORM_ADAPTERS: Record<Platform, PlatformAdapterRecord> = {
  leetcode: { status: "experimental", label: "LeetCode", selectors: [
    '[data-e2e-locator="submission-result"]',
    '[data-cy="submission-result"]',
    ".text-green-s",
    ".text-red-s",
    "body",
  ] },
  codeforces: { status: "experimental", label: "Codeforces", selectors: [
    ".status-cell", "td.status-small", ".verdict-accepted", "body",
  ] },
  atcoder: { status: "experimental", label: "AtCoder", selectors: [
    "#judge-status", ".waiting-judge", "td", "body",
  ] },
  nowcoder: { status: "experimental", label: "NowCoder", selectors: [
    ".result", ".submission-result", ".judge-result", "body",
  ] },
  luogu: { status: "experimental", label: "Luogu", selectors: [
    ".status", ".record-status", ".submission-status", "body",
  ] },
};

export function getPlatformAdapterStatus(platform: Platform): PlatformAdapterStatus {
  return PLATFORM_ADAPTERS[platform].status;
}

export function getProductionPlatforms(): Platform[] {
  return (Object.keys(PLATFORM_ADAPTERS) as Platform[]).filter(
    (p) => PLATFORM_ADAPTERS[p].status === "production",
  );
}
```

**Refactor `candidateTextForPlatform`:**

Replace the hardcoded `switch` with a registry lookup:

```typescript
function candidateTextForPlatform(platform: Platform, pageDocument: Document): string {
  return textFromSelectors(pageDocument, [...PLATFORM_ADAPTERS[platform].selectors]);
}
```

Verify selector arrays in the registry are byte-identical to the old switch branches. The Luogu branch was `[".status", ".record-status", ".submission-status", "body"]` — it remains identical.

- [x] **Step 1.3: Run focused verification**

```powershell
npm run test -- tests/unit/extensionPlatforms.test.ts
npm run typecheck
npm run extension:build
```

Expected: all tests pass (existing verdict/detection tests PLUS the new registry tests asserting NO production platform), typecheck exits 0, extension dist builds.

- [x] **Step 1.4: Cleanup receipt**

```powershell
$env:GIT_MASTER='1'; git diff --stat
```

Expected: only `extension/src/platforms.ts` and `tests/unit/extensionPlatforms.test.ts` are modified.

---

## TODO: Task 1b — Canonical fixture metadata module

**Failing-first none — pure shared utility.** Create a single authoritative module that owns all fixture-metadata types, schema validation, and deterministic directory loading. Both Task 2 (fixture loader) and Task 3 (certification gate) import from this module. No other file defines `EvidenceTier`, `FixtureMeta`, or fixture schema types.

**Files:**
- Create: `tests/helpers/luoguFixtureMetadata.ts`
- Create: `tests/helpers/` directory (if absent)

**Module contracts:**

```typescript
// --- Canonical types (single source of truth) ---
export type EvidenceTier = "public-content-accessible" | "verified-public-dom" | "characterization-derived";

export type Purpose = "detectProblemFromLocation" | "detectVerdictFromDocument" | "both" | "negative";

export type ProblemExpected = {
  readonly platform: "luogu";   // this corpus only
  readonly externalId: string;
};

export type VerdictExpected = {
  readonly verdict: string;
};

// --- Deterministic loading ---
export function getFixturesDir(): string;
// Resolves to <repo-root>/tests/fixtures/luogu using import.meta.url
// or documents cwd assumption if import.meta.url is unavailable.

export function loadFixtureMetadata(): FixtureMeta[];
// Reads every *.meta.json in getFixturesDir(), parses, validates, returns.
// Throws on first invalid file. Always returns same result for same on-disk state.

// --- Per-fixture parsing ---
export function parseFixtureMeta(raw: unknown): FixtureMeta;
// Zod parse. Throws ZodError on invalid.
```

**Cross-field rules enforced by `parseFixtureMeta`:**
- `verified-public-dom` MUST have non-null `verdictExpected` AND non-empty `selectors`.
- `public-content-accessible` MUST have non-null `problemExpected` and must have `verdictExpected === null`.
- `characterization-derived` MUST have `verdictExpected === null` (negative) OR valid verdict text (verdict coverage). It must NOT have non-empty `selectors` that claim DOM provenance.
- `platform` within `problemExpected` must be the literal `"luogu"` for this corpus.

The module MUST stay under 250 source lines (pure LOC, not counting comments). No Zod schema is duplicated anywhere else. No `any`/suppressions.

- [x] **Step 1b.1: Write the metadata module**

Create `tests/helpers/luoguFixtureMetadata.ts` with the full Zod schema, parsing, and directory loading per the contracts above.

```powershell
npm run typecheck
```

Expected: exits 0. The module compiles without test references.

- [x] **Step 1b.2: Cleanup receipt**

```powershell
$env:GIT_MASTER='1'; git diff --stat
```

Expected: `tests/helpers/luoguFixtureMetadata.ts` added (and `tests/helpers/` directory).

---

## TODO: Task 2 — Fixture-loader characterization tests

**Characterization, not failing-first:** The verdict-detection behavior already exists and is tested. This task adds a systematic fixture-loading harness that exercises `detectProblemFromLocation` and `detectVerdictFromDocument` against every fixture in `tests/fixtures/luogu/`. The harness uses `tests/helpers/luoguFixtureMetadata.ts` for all type definitions and fixture loading — it does NOT duplicate any schema or type.

**Files:**
- Create: `tests/unit/luoguFixtureLoader.test.ts`
- Rely on: `tests/helpers/luoguFixtureMetadata.ts`, `tests/fixtures/luogu/*`

**Test design:**

The test imports `loadFixtureMetadata`, `FixtureMeta`, `EvidenceTier` from the helper module. It iterates every returned fixture and runs:

- If `purpose` includes `detectProblemFromLocation`: create a `DetectableLocation` from `sourceUrl`, load the HTML into jsdom, call `detectProblemFromLocation`, assert against `problemExpected`.
- If `purpose` is `negative`: call `detectVerdictFromDocument("luogu", document)`, assert result is `null`.
- If `purpose` includes `detectVerdictFromDocument` (but is not `negative`): set `document.body.innerHTML` to the fixture content, call `detectVerdictFromDocument("luogu", document)`, assert against `verdictExpected`.

Each test case `it` block name includes the evidence tier tag read directly from `fixture.evidenceTier`:
- `[public-content-accessible]` — URL/title detection only, does NOT certify verdicts
- `[verified-public-dom]` — actual public verdict DOM, only tier that certifies
- `[characterization-derived]` — synthetic/function coverage, does NOT certify

- [x] **Step 2.1: Write the fixture-loader test**

Create `tests/unit/luoguFixtureLoader.test.ts`. Import `loadFixtureMetadata` from `tests/helpers/luoguFixtureMetadata.ts`. Do NOT define any type, schema, or path resolution inline.

- [x] **Step 2.2: Run the fixture loader**

```powershell
npm run test -- tests/unit/luoguFixtureLoader.test.ts
```

Expected: every fixture passes. Each verdict/URL detection matches its metadata.

- [x] **Step 2.3: Run all unit tests**

```powershell
npm run test
npm run typecheck
```

Expected: full unit suite passes, typecheck exits 0.

- [x] **Step 2.4: Cleanup receipt**

```powershell
$env:GIT_MASTER='1'; git diff --stat
```

Expected: `tests/helpers/luoguFixtureMetadata.ts` (if not already in diff), `tests/unit/luoguFixtureLoader.test.ts` added; `tests/fixtures/luogu/*` existing.

---

## TODO: Task 3 — Certification decision gate

**Failing-first:** Write `tests/unit/platformCertification.test.ts` that imports the adapter registry and reads fixture metadata to decide CERTIFIED or BLOCKED. It must FAIL if Luogu is set to `production` while the required verdict DOM evidence is missing (BLOCKED state). The test itself does not change any status — it is a read-only gate.

**Files:**
- Create: `tests/unit/platformCertification.test.ts`
- Rely on: `tests/helpers/luoguFixtureMetadata.ts` (Task 1b), `tests/fixtures/luogu/*.meta.json` (Task 0)

**Duplicate schema is forbidden.** This test imports `loadFixtureMetadata`, `EvidenceTier`, and all types from `tests/helpers/luoguFixtureMetadata.ts`. It does NOT define any type, schema, or path resolution inline.

**Certification rule (hard gate — reads evidenceTier, never authenticatesd):**
Luogu may be `production` ONLY if ALL of the following are true:
1. `getPlatformAdapterStatus("luogu")` returns `"production"` (set by Task 4a, not by this test).
2. At least one fixture has `evidenceTier === "verified-public-dom"` AND a non-null `verdictExpected` (proves verdict DOM was observed in the wild).
3. At least one fixture has `evidenceTier === "public-content-accessible"` (proves URL detection works).

Condition (2) is the hard gate. It requires actual public verdict DOM with selector provenance. Fixtures with `evidenceTier: "characterization-derived"` or `evidenceTier: "public-content-accessible"` do NOT satisfy condition (2), regardless of their `authenticated` or `purpose` values. If condition (2) is false, the test MUST fail if Luogu is `production`. This prevents premature promotion.

**Typed outcomes:**
The test writes `work/reports/certification-gate-verdict.json` containing:

```json
{
  "gateVerdict": "BLOCKED",
  "blockingReasons": [
    "No fixture has evidenceTier \"verified-public-dom\": all verdict fixtures are characterization-derived. " +
    "Production requires at least one fixture with evidenceTier=verified-public-dom AND a non-null verdictExpected, " +
    "proving actual public verdict DOM was observed with selector provenance."
  ],
  "fixtureCoverage": {
    "total": 12,
    "publicContentAccessible": 4,
    "verifiedPublicDom": 0,
    "characterizationDerived": 8
  },
  "luoguCurrentStatus": "experimental",
  "gateDate": "2026-07-14"
}
```

Or if certified:

```json
{
  "gateVerdict": "CERTIFIED",
  "blockingReasons": [],
  "fixtureCoverage": {
    "total": 3,
    "publicContentAccessible": 1,
    "verifiedPublicDom": 1,
    "characterizationDerived": 1
  },
  "luoguCurrentStatus": "experimental",
  "gateDate": "2026-07-14"
}
```

**Test structure — two describe blocks:**

The file contains two top-level `describe` blocks:

1. **`describe("certification gate — on-disk fixture corpus")`** — reads real on-disk fixtures via `loadFixtureMetadata()`, applies the certification rule, writes `work/reports/certification-gate-verdict.json`. This is the BLOCKED path in practice (no public verdict DOM).

2. **`describe("certification gate — synthetic CERTIFIED path")`** — uses in-memory-only metadata objects (never touches disk fixtures). Constructs one fixture per evidence tier:
   - One `public-content-accessible` object with non-null `problemExpected`.
   - One `verified-public-dom` object with non-null `verdictExpected` and non-empty `selectors`.
   - One `characterization-derived` object with null `verdictExpected`.
   - Passes these to the gate logic, asserts the outcome is CERTIFIED, blockers are empty, and `verifiedPublicDom >= 1`.
   - **This synthetic test cannot promote Luogu or satisfy Task 0 evidence.** It proves the gate logic is correct, not that real verdict DOM exists. The on-disk corpus test is the sole certification authority.

- [x] **Step 3.1: Write the certification gate test**

```typescript
import { describe, expect, it } from "vitest";
import { writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  PLATFORM_ADAPTERS,
  getPlatformAdapterStatus,
  getProductionPlatforms,
} from "@/extension/src/platforms";
import {
  loadFixtureMetadata,
  type FixtureMeta,
  type EvidenceTier,
} from "../../helpers/luoguFixtureMetadata";

const REPORTS_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "work", "reports");

// ---- Shared gate logic (pure function, tested by both suites) ----

function evaluateGate(metaFiles: FixtureMeta[]) {
  const verifiedPublicDom = metaFiles.filter(
    (m) => m.evidenceTier === "verified-public-dom" && m.verdictExpected !== null
  );
  const publicContentAccessible = metaFiles.filter(
    (m) => m.evidenceTier === "public-content-accessible"
  );
  const characterizationDerived = metaFiles.filter(
    (m) => m.evidenceTier === "characterization-derived"
  );
  const hasPublicVerdictDOM = verifiedPublicDom.length > 0;
  const hasPublicURLDetection = publicContentAccessible.length > 0;
  const productionBlocked = !hasPublicVerdictDOM || !hasPublicURLDetection;
  return { verifiedPublicDom, publicContentAccessible, characterizationDerived,
           hasPublicVerdictDOM, hasPublicURLDetection, productionBlocked };
}

describe("certification gate — on-disk fixture corpus", () => {
  const metaFiles = loadFixtureMetadata();
  const verdict = evaluateGate(metaFiles);

  // Write gate verdict artifact
  mkdirSync(REPORTS_DIR, { recursive: true });
  const artifact = {
    gateVerdict: verdict.productionBlocked ? "BLOCKED" : "CERTIFIED",
    blockingReasons: [] as string[],
    fixtureCoverage: {
      total: metaFiles.length,
      publicContentAccessible: verdict.publicContentAccessible.length,
      verifiedPublicDom: verdict.verifiedPublicDom.length,
      characterizationDerived: verdict.characterizationDerived.length,
    },
    luoguCurrentStatus: getPlatformAdapterStatus("luogu"),
    gateDate: new Date().toISOString().split("T")[0],
  };
  if (!verdict.hasPublicURLDetection) {
    artifact.blockingReasons.push("No public-content-accessible URL detection fixtures available.");
  }
  if (!verdict.hasPublicVerdictDOM) {
    artifact.blockingReasons.push(
      "No fixture has evidenceTier \"verified-public-dom\". " +
      "Production requires at least one fixture with evidenceTier=verified-public-dom AND a non-null verdictExpected, " +
      "proving actual public verdict DOM was observed with selector provenance."
    );
  }
  writeFileSync(
    join(REPORTS_DIR, "certification-gate-verdict.json"),
    JSON.stringify(artifact, null, 2),
    "utf8",
  );

  it("has at least one public-content-accessible URL detection fixture", () => {
    expect(verdict.publicContentAccessible.length).toBeGreaterThanOrEqual(1);
  });

  it("reports fixture coverage counts per evidence tier", () => {
    console.log(
      `Gate: ${artifact.gateVerdict}, ` +
      `public-content-accessible: ${verdict.publicContentAccessible.length}, ` +
      `verified-public-dom: ${verdict.verifiedPublicDom.length}, ` +
      `characterization-derived: ${verdict.characterizationDerived.length}`
    );
  });

  describe("production guard", () => {
    if (verdict.productionBlocked) {
      it("BLOCKED: Luogu must NOT be production when verified-public-dom evidence is missing", () => {
        expect(getProductionPlatforms()).not.toContain("luogu");
        expect(getPlatformAdapterStatus("luogu")).not.toBe("production");
      });
      it("BLOCKED: records at least one blocking reason", () => {
        expect(artifact.blockingReasons.length).toBeGreaterThanOrEqual(1);
      });
    } else {
      it("CERTIFIED: verified-public-dom evidence exists — Luogu MAY be promoted", () => {
        expect(verdict.verifiedPublicDom.length).toBeGreaterThanOrEqual(1);
        expect(artifact.blockingReasons).toEqual([]);
      });
    }
  });
});

describe("certification gate — synthetic CERTIFIED path", () => {
  // In-memory metadata ONLY. These objects test gate logic, not real evidence.
  // They cannot promote Luogu or satisfy Task 0 evidence requirements.

  const publicContentFixture: FixtureMeta = {
    fixtureName: "synth-url",
    sourceUrl: "https://www.luogu.com.cn/problem/P1001",
    evidenceTier: "public-content-accessible",
    purpose: "detectProblemFromLocation",
    selectors: ["body"],
    authenticated: false,
    sanitized: true,
    captureMethod: "synthetic",
    verdictExpected: null,
    problemExpected: { platform: "luogu", externalId: "P1001" },
  };

  const verifiedDomFixture: FixtureMeta = {
    fixtureName: "synth-verdict",
    sourceUrl: "https://www.luogu.com.cn/record/123",
    evidenceTier: "verified-public-dom",
    purpose: "detectVerdictFromDocument",
    selectors: [".status"],
    authenticated: false,
    sanitized: true,
    captureMethod: "synthetic",
    verdictExpected: { verdict: "Accepted" },
    problemExpected: null,
  };

  const characterizationFixture: FixtureMeta = {
    fixtureName: "synth-char",
    sourceUrl: "",
    evidenceTier: "characterization-derived",
    purpose: "negative",
    selectors: [],
    authenticated: false,
    sanitized: true,
    captureMethod: "synthetic",
    verdictExpected: null,
    problemExpected: null,
  };

  const result = evaluateGate([publicContentFixture, verifiedDomFixture, characterizationFixture]);

  it("CERTIFIED: one public-content-accessible + one verified-public-dom + one characterization-derived", () => {
    expect(result.productionBlocked).toBe(false);
    expect(result.verifiedPublicDom.length).toBe(1);
    expect(result.publicContentAccessible.length).toBe(1);
    expect(result.hasPublicVerdictDOM).toBe(true);
    expect(result.hasPublicURLDetection).toBe(true);
  });

  it("BLOCKED occurs when verified-public-dom fixture has null verdictExpected", () => {
    const badDom = { ...verifiedDomFixture, verdictExpected: null };
    const blocked = evaluateGate([publicContentFixture, badDom, characterizationFixture]);
    expect(blocked.productionBlocked).toBe(true);
  });

  it("BLOCKED occurs when only characterization-derived fixtures exist", () => {
    const blocked = evaluateGate([characterizationFixture]);
    expect(blocked.productionBlocked).toBe(true);
  });

  it("BLOCKED occurs when only public-content-accessible fixtures exist", () => {
    const blocked = evaluateGate([publicContentFixture]);
    expect(blocked.productionBlocked).toBe(true);
  });
});
```

- [x] **Step 3.2: Run the certification gate (expect failure first from missing exports)**

```powershell
npm run test -- tests/unit/platformCertification.test.ts
```

Expected (before Task 1b): FAIL — `loadFixtureMetadata` / `FixtureMeta` not exported from the helper.
Expected (after Task 1b): FAIL — `getPlatformAdapterStatus` / `PLATFORM_ADAPTERS` not exported from platforms.
Expected (after Task 1): PASS — both the on-disk test (BLOCKED) and the synthetic CERTIFIED test pass.

- [x] **Step 3.3: Read the gate verdict**

```powershell
node -e "console.log(JSON.stringify(require('./work/reports/certification-gate-verdict.json'), null, 2))"
```

Expected output shows `"BLOCKED"` with fixture counts and blocking reasons.

- [x] **Step 3.4: Confirm synthetic CERTIFIED test passes even when on-disk is BLOCKED**

```powershell
npm run test -- tests/unit/platformCertification.test.ts -- --verbose 2>&1 | Select-String "synthetic CERTIFIED path"
```

Expected: the synthetic test block passes (asserts CERTIFIED) while the on-disk test block correctly BLOCKEDs.

- [x] **Step 3.5: Fork — is the on-disk gate CERTIFIED or BLOCKED?**

Check the verdict:

```powershell
node -e "process.exit(require('./work/reports/certification-gate-verdict.json').gateVerdict === 'CERTIFIED' ? 0 : 1)"
```

- If exit code 0 (CERTIFIED): proceed to Task 4a (promotion) and then Tasks 5-7.
- If exit code 1 (BLOCKED): proceed to Task 4b (document blocker) and then Tasks 5-7 with Luogu remaining `experimental`.

- [x] **Step 3.6: Cleanup receipt**

```powershell
$env:GIT_MASTER='1'; git diff --stat
```

Expected: `tests/helpers/luoguFixtureMetadata.ts` (if not already tracked), `tests/unit/platformCertification.test.ts` added, `work/reports/certification-gate-verdict.json` added.

---

## TODO: Task 4a — Promotion (only if gate == CERTIFIED)

**Condition:** Task 3 returned CERTIFIED. This task changes Luogu from `experimental` to `production`.

**Skip condition:** If Task 3 returned BLOCKED, skip this task entirely and proceed to Task 4b.

**Files:**
- Modify: `extension/src/platforms.ts`
- Modify: `tests/unit/extensionPlatforms.test.ts`

- [x] **Step 4a.1: SKIPPED — gate is BLOCKED; do not change Luogu status**

In `extension/src/platforms.ts`, change only the Luogu entry:

```typescript
luogu: { status: "production", label: "Luogu", selectors: [
  ".status", ".record-status", ".submission-status", "body",
] },
```

No other entries change.

- [x] **Step 4a.2: SKIPPED — gate is BLOCKED; retain zero production platforms**

In `tests/unit/extensionPlatforms.test.ts`, replace the existing `"initially has no production platform"` test with:

```typescript
it("after certification: Luogu is the sole production platform", () => {
  expect(getProductionPlatforms()).toEqual(["luogu"]);
});

it("every other platform is experimental or disabled", () => {
  for (const platform of ["leetcode", "nowcoder", "codeforces", "atcoder"] as const) {
    expect(getPlatformAdapterStatus(platform)).not.toBe("production");
  }
});
```

The test `"initially has no production platform (certification gate must decide)"` is removed — it is no longer true after promotion.

- [x] **Step 4a.3: SKIPPED — promotion branch is not applicable**

```powershell
npm run test -- tests/unit/extensionPlatforms.test.ts
npm run typecheck
npm run extension:build
```

Expected: all tests pass. `getProductionPlatforms()` returns `["luogu"]`.

- [x] **Step 4a.4: SKIPPED — preserve the BLOCKED gate artifact unchanged**

```powershell
node -e "
const p = require('./work/reports/certification-gate-verdict.json');
p.luoguCurrentStatus = 'production';
p.promotedAt = new Date().toISOString();
require('fs').writeFileSync('./work/reports/certification-gate-verdict.json', JSON.stringify(p, null, 2));
"
```

- [x] **Step 4a.5: SKIPPED — Task 4a created no resources**

```powershell
$env:GIT_MASTER='1'; git diff --stat
```

Expected: `extension/src/platforms.ts` modified (Luogu status changed), `tests/unit/extensionPlatforms.test.ts` modified (tests updated), `work/reports/certification-gate-verdict.json` modified (promoted status).

---

## TODO: Task 4b — Document blocker (only if gate == BLOCKED)

**Condition:** Task 3 returned BLOCKED. This task records the blocker in a machine-readable artifact. Luogu remains `experimental`. The plan does NOT claim completion — it records the terminal blocked state.

**Skip condition:** If Task 3 returned CERTIFIED, skip this task entirely (Task 4a ran instead).

**Files:**
- Create: `work/reports/luogu-adapter-blocker.json`

- [x] **Step 4b.1: Write the blocker artifact**

```powershell
node -e "
const gate = require('./work/reports/certification-gate-verdict.json');
const blocker = {
  planStatus: 'BLOCKED',
  blockerType: 'missing_public_verdict_dom',
  blockingReasons: gate.blockingReasons,
  fixtureCoverage: gate.fixtureCoverage,
  luoguStatus: 'experimental',
  blockedAt: new Date().toISOString(),
  unblockCondition: 'Acquire at least one publicly accessible Luogu page containing .status, .record-status, or .submission-status ' +
    'elements with verdict text, without authentication. Create a fixture with evidenceTier=verified-public-dom ' +
    'and a non-null verdictExpected in tests/fixtures/luogu/. Re-run Task 0 Steps 0.3-0.5, then Tasks 2-7.',
};
require('fs').writeFileSync('./work/reports/luogu-adapter-blocker.json', JSON.stringify(blocker, null, 2));
console.log('BLOCKED: Luogu adapter certification blocked. See work/reports/luogu-adapter-blocker.json');
"
```

- [x] **Step 4b.2: Verify the blocker artifact**

```powershell
node -e "const b = require('./work/reports/luogu-adapter-blocker.json'); console.log(b.planStatus, b.blockerType); if (b.planStatus !== 'BLOCKED') process.exit(1)"
```

Expected: `BLOCKED missing_public_verdict_dom` or similar. Process exits 0.

- [x] **Step 4b.3: Cleanup receipt**

```powershell
$env:GIT_MASTER='1'; git diff --stat
```

Expected: `work/reports/luogu-adapter-blocker.json` added.

---

## TODO: Task 5 — Luogu capture-pipeline E2E (platform identity only)

**This is NOT DOM adapter certification.** This test verifies the capture pipeline correctly records `platform: "luogu"` through API events, database rows, and `/training` page rendering. It does not test DOM detection — that is covered by Tasks 0/2/3. This test may run while Luogu is `experimental` (Task 1 default) — its pass/fail is independent of the certification gate outcome.

**Files:**
- Modify: `tests/e2e/captureFixtures.ts`
- Create: `tests/e2e/capture-luogu-problem.spec.ts`

- [x] **Step 5.1: Widen CaptureProblemFixture platform type**

In `tests/e2e/captureFixtures.ts`, change the `platform` field from `"leetcode"` to the full `Platform` type:

```typescript
// FROM line 7:
export type CaptureProblemFixture = {
  readonly captureSessionId: string;
  readonly platform: "leetcode";
  // ...
};

// TO:
export type CaptureProblemFixture = {
  readonly captureSessionId: string;
  readonly platform: import("@/extension/src/platforms").Platform;
  // ...
};
```

This is a widening change — every existing use (`platform: "leetcode"`) remains valid. Verify:

```powershell
npm run typecheck
```

Expected: exits 0. No existing E2E file needs changes.

- [x] **Step 5.2: Write the Luogu pipeline E2E**

Create `tests/e2e/capture-luogu-problem.spec.ts`:

```typescript
import { expect, test } from "@playwright/test";
import Database from "better-sqlite3";
import { captureEvent, postCaptureEvents, type CaptureProblemFixture } from "./captureFixtures";
import { E2E_DB_PATH } from "./database";

const p1001: CaptureProblemFixture = {
  captureSessionId: "session_e2e_luogu_p1001",
  platform: "luogu",
  problemExternalId: "P1001",
  problemTitle: "A+B Problem",
  canonicalUrl: "https://www.luogu.com.cn/problem/P1001",
};

type AttemptRow = {
  readonly submission_id: string;
  readonly platform: string;
  readonly problem_external_id: string;
  readonly verdict: string;
  readonly result: string;
};

test("capture pipeline records luogu platform identity end to end", async ({ page, request }) => {
  await postCaptureEvents(request, [
    captureEvent(p1001, {
      type: "SESSION_STARTED",
      eventId: "evt_e2e_luogu_p1001_session",
      occurredAt: "2026-07-14T10:00:00.000Z",
    }),
    captureEvent(p1001, {
      type: "SUBMISSION_OBSERVED",
      eventId: "evt_e2e_luogu_p1001_submission",
      submissionId: "submission_e2e_luogu_p1001_1",
      occurredAt: "2026-07-14T10:05:00.000Z",
    }),
    captureEvent(p1001, {
      type: "VERDICT_OBSERVED",
      eventId: "evt_e2e_luogu_p1001_verdict",
      submissionId: "submission_e2e_luogu_p1001_1",
      verdict: "Accepted",
      occurredAt: "2026-07-14T10:06:00.000Z",
    }),
  ]);

  // Verify database row carries luogu platform
  const db = new Database(E2E_DB_PATH, { readonly: true });
  try {
    const attempts = db.prepare<[], AttemptRow>(`
      SELECT submission_id, platform, problem_external_id, verdict, result
      FROM training_attempts
      WHERE submission_id = 'submission_e2e_luogu_p1001_1'
    `).all();
    expect(attempts).toHaveLength(1);
    expect(attempts[0]).toMatchObject({
      submission_id: "submission_e2e_luogu_p1001_1",
      platform: "luogu",
      problem_external_id: "P1001",
    });
  } finally {
    db.close();
  }

  // Verify /training page renders the Luogu problem
  await page.goto("/training?platform=luogu&externalId=P1001&title=A+B%20Problem");
  await expect(page.getByRole("heading", { name: "A+B Problem" })).toBeVisible();

  const attemptPanel = page.locator("section").filter({
    has: page.getByRole("heading", { name: "Training attempt" }),
  });
  await expect(attemptPanel).toContainText("A+B Problem");
  await expect(attemptPanel).toContainText("Accepted");
});
```

- [x] **Step 5.3: Run the Luogu pipeline E2E**

```powershell
npx playwright test tests/e2e/capture-luogu-problem.spec.ts
```

Expected: PASS. This proves the capture pipeline accepts, stores, and renders `platform: "luogu"` events regardless of the adapter's `experimental`/`production` status.

- [x] **Step 5.4: Cleanup receipt**

```powershell
$env:GIT_MASTER='1'; git diff --stat
```

Expected: `tests/e2e/captureFixtures.ts` modified, `tests/e2e/capture-luogu-problem.spec.ts` added.

---

## TODO: Task 6 — Certification artifact and terminal state report

**Purpose:** Produce a machine-readable JSON artifact that documents the final plan outcome: whether Luogu was CERTIFIED and promoted to `production`, or BLOCKED and remained `experimental`. The artifact captures the exact terminal state and the evidence that led to it.

**Artifact path:** `work/reports/luogu-adapter-certification.json`

- [x] **Step 6.1: Write the terminal state reporter script**

Run a focused tsx script that reads the gate verdict and produces the final artifact:

```powershell
npx tsx -e "
const { PLATFORM_ADAPTERS, getProductionPlatforms, getPlatformAdapterStatus } = require('./extension/src/platforms');
const { readdirSync, readFileSync, writeFileSync, mkdirSync } = require('fs');
const { join } = require('path');

mkdirSync('work/reports', { recursive: true });

const gateVerdict = require('./work/reports/certification-gate-verdict.json');
const fixturesDir = 'tests/fixtures/luogu';
const htmlFiles = readdirSync(fixturesDir).filter(f => f.endsWith('.html'));
const metaFiles = htmlFiles.map(f => JSON.parse(readFileSync(join(fixturesDir, f.replace(/\.html$/, '.meta.json')), 'utf8')));
const blockerPath = 'work/reports/luogu-adapter-blocker.json';
const blocker = require('fs').existsSync(blockerPath) ? require(blockerPath) : null;

const artifact = {
  planName: 'phase-0b4-luogu-adapter-certification',
  terminalState: gateVerdict.gateVerdict === 'CERTIFIED' ? 'CERTIFIED' : 'BLOCKED',
  luoguStatus: getPlatformAdapterStatus('luogu'),
  productionPlatforms: getProductionPlatforms(),
  adapterVersion: 'multi-platform@0.2.0',
  certificationDate: gateVerdict.gateDate,
  fixtureCoverage: gateVerdict.fixtureCoverage,
  blockers: gateVerdict.blockingReasons,
  nonProductionPlatforms: Object.fromEntries(
    Object.entries(PLATFORM_ADAPTERS)
      .filter(([k]) => k !== 'luogu')
      .map(([k, v]) => [k, v.status])
  ),
  allFixtures: metaFiles.map(m => ({
    name: m.fixtureName,
    evidenceTier: m.evidenceTier,
    purpose: m.purpose,
    verdictExpected: m.verdictExpected !== null,
  })),
  unblockInstructions: blocker ? blocker.unblockCondition : null,
};

writeFileSync('work/reports/luogu-adapter-certification.json', JSON.stringify(artifact, null, 2));
console.log('Terminal state:', artifact.terminalState);
console.log('Luogu status:', artifact.luoguStatus);
"
```

- [x] **Step 6.2: Verify the artifact**

```powershell
node -e "
const a = require('./work/reports/luogu-adapter-certification.json');
const required = ['planName','terminalState','luoguStatus','productionPlatforms','fixtureCoverage','blockers'];
const missing = required.filter(k => !(k in a));
if (missing.length > 0) { console.error('MISSING:', missing.join(', ')); process.exit(1); }
console.log('PASS: certification artifact has all ' + required.length + ' required fields');
console.log('Terminal state: ' + a.terminalState);
console.log('Luogu status: ' + a.luoguStatus);
"
```

Expected: `PASS: certification artifact has all 6 required fields`. Exits 0.

- [x] **Step 6.3: Cleanup receipt**

```powershell
$env:GIT_MASTER='1'; git diff --stat
```

Expected: `work/reports/luogu-adapter-certification.json` added (and `work/reports/certification-gate-verdict.json` existing from Task 3).

---

## TODO: Task 7 — Full quality gate + adversarial probes + cleanup

- [x] **Step 7.1: Record baseline database hash and mtime**

Capture the current default database state so we can prove the gate does not mutate it:

```powershell
$env:GIT_MASTER='1'; $db = "training-platform.sqlite"
if (Test-Path $db) {
  $hash = (Get-FileHash $db -Algorithm SHA256).Hash
  $mtime = (Get-Item $db).LastWriteTime.ToString("o")
  @{ Hash = $hash; Mtime = $mtime } | ConvertTo-Json | Set-Content "work/reports/db-baseline.json"
  Write-Host "DB baseline recorded: hash=$hash mtime=$mtime"
} else {
  Write-Host "No default DB exists — will verify it remains absent"
  @{ } | ConvertTo-Json | Set-Content "work/reports/db-baseline.json"
}
```

- [x] **Step 7.2: Run the complete quality gate with disposable DB path**

Run each command separately. Each must exit 0 before the next.

```powershell
$dispDb = Join-Path $env:TEMP "phase-0b4-gate-$(Get-Random).sqlite"
$env:TRAINING_DB_PATH = $dispDb
try {
  npm run db:migrate; if ($LASTEXITCODE -ne 0) { throw "Migration failed" }
} finally {
  $env:TRAINING_DB_PATH = $null
  if (Test-Path $dispDb) { Remove-Item $dispDb -Force }
}

npm run test; if ($LASTEXITCODE -ne 0) { throw "Unit tests failed" }

npm run typecheck; if ($LASTEXITCODE -ne 0) { throw "Typecheck failed" }

npm run e2e; if ($LASTEXITCODE -ne 0) { throw "E2E failed" }

npm run extension:build; if ($LASTEXITCODE -ne 0) { throw "Extension build failed" }

npm run build; if ($LASTEXITCODE -ne 0) { throw "Production build failed" }
```

Verification notes:
- `npm run test` must produce nonzero test counts for the fixture-loader (Task 2), certification gate (Task 3, both on-disk and synthetic suites), and registry (Task 1) tests. Run with `--verbose` to confirm named tests are present. Accept that one symlink-related test may be skipped under EPERM; all mandatory junction tests must pass.
- `npm run typecheck` must exit 0 with strict TypeScript — no `any`, no suppressions, no non-null assertions.
- `npm run e2e` must pass the Luogu pipeline test alongside all existing E2E tests.
- `npm run build` (next build) must succeed.

- [x] **Step 7.3: Verify default database untouched**

Compare current state against the baseline recorded in Step 7.1:

```powershell
$baseline = Get-Content "work/reports/db-baseline.json" | ConvertFrom-Json
$db = "training-platform.sqlite"
if (Test-Path $db) {
  $hash = (Get-FileHash $db -Algorithm SHA256).Hash
  $mtime = (Get-Item $db).LastWriteTime.ToString("o")
  if ($baseline.Hash -and $hash -ne $baseline.Hash) { throw "Default database hash changed!" }
  if ($baseline.Mtime -and $mtime -ne $baseline.Mtime) { throw "Default database mtime changed!" }
  Write-Host "PASS: default database unchanged"
} else {
  if ($baseline.PSObject.Properties.Name.Count -gt 0) { throw "Default database was deleted!" }
  Write-Host "PASS: default database remains absent"
}
```

- [x] **Step 7.4: Adversarial probes**

No probe deletes or modifies real fixture files, test files, or source evidence. All probes use existing synthetic in-memory tests, ephemeral files, or targeted test-file runs.

| Class | Applicable | Probe | Expected outcome |
|---|---|---|---|
| Malformed input | Yes — adapter registry | Create ephemeral file `__probe_unknown_platform.ts` containing: `import { getPlatformAdapterStatus } from "./extension/src/platforms"; getPlatformAdapterStatus("unknown");`. Run `npx tsc --noEmit __probe_unknown_platform.ts --strict`. Expect non-zero exit and diagnostic `Argument of type '"unknown"' is not assignable to parameter of type 'Platform'`. Delete the probe file afterward. | `tsc --noEmit` exits non-zero with correct type error. Probe file absent in final diff. |
| Prompt injection | Ruled out | All inputs are compile-time literals or static file paths. No user text reaches the registry or gate. | N/A |
| Cancel/resume | Ruled out | No long-running stateful operations. E2E is longest at ~30s; Playwright owns server lifecycle. All other tasks complete in <5s. Tasks are idempotent. | N/A |
| Stale state | Yes — if Luogu changes DOM, selectors become stale. | Not tested destructively. The existing synthetic gate test `"BLOCKED occurs when only characterization-derived fixtures exist"` in Task 3 proves the gate stalls when verified-public-dom is absent. The fixture-loader will fail naturally if a real fixture's selector stops matching. | The synthetic test passes. Real fixture failure is the alert. |
| Dirty worktree | Yes — any uncommitted change could produce false PASS. | `git status --short` must match the exact manifest in Step 7.6. | All paths accounted for with correct tracked/untracked markers. |
| Hung/long commands | Ruled out | `npm run test` <5s. `npm run e2e` has 30s test timeout + 120s server start. `npm run build` <60s. All bounded. | N/A |
| Flaky tests | Yes (mitigated) | Fixture-loader tests are deterministic (static files, no async). Certification gate synthetic test is pure computation. E2E posts deterministic events with fixed IDs. No timers, random values, or race conditions. | Run `npm run test` twice. Identical pass counts both runs. |
| Misleading success output | Yes — `npm run test` passes with zero tests if `--passWithNoTests` swallows discovery failure. | Run `npm run test -- --verbose` and confirm each expected test file appears: `extensionPlatforms.test.ts` (Task 1), `luoguFixtureLoader.test.ts` (Task 2), `platformCertification.test.ts` (Task 3 — two describe blocks). Assert nonzero test counts per file. | At least 3 test files with >0 tests each. |
| Repeated interruptions | Ruled out | Every task is idempotent. Repeating any step produces the same result (same fixture files, same registry, same deterministic test assertions). Certification gate is read-only. | N/A |

- [x] **Step 7.5: Cleanup gates**

Prove no runtime artifacts remain:

```powershell
# No .tmp/playwright residue
if (Test-Path ".tmp/playwright") { throw ".tmp/playwright still exists" }
Write-Host "PASS: .tmp/playwright absent"

# Port 3000 free (no Next.js server left from E2E)
$portCheck = netstat -ano | Select-String ":3000 "
if ($portCheck) { throw "Port 3000 still in use" }
Write-Host "PASS: port 3000 free"

# No external sentinel dirs
foreach ($sentinel in @("node_modules/.cache", ".codegraph", ".vercel")) {
  if (Test-Path $sentinel) { Write-Host "INFO: $sentinel exists (expected)" }
}

# test-results/ is gitignored — verify it is absent or empty
if (Test-Path "test-results") {
  $count = @(Get-ChildItem "test-results" -Recurse -File).Count
  if ($count -gt 0) { throw "test-results/ contains $count files — should be cleaned" }
  Write-Host "PASS: test-results/ empty"
}

# No debug/probe scripts left behind
$probes = Get-ChildItem -Path "." -Filter "__probe_*" -File
if ($probes.Count -gt 0) { throw "Debug/probe scripts remain: $($probes.Name -join ', ')" }
Write-Host "PASS: no debug/probe scripts"

# extension/dist is gitignored — verify it exists but is ignored
if (-not (Test-Path "extension/dist")) { Write-Host "INFO: extension/dist absent (run extension:build first)" }
else { Write-Host "PASS: extension/dist present and gitignored" }
```

- [x] **Step 7.6: Dirty worktree assertion (exact manifest)**

```powershell
$env:GIT_MASTER='1'; git status --short
```

Expected output for BLOCKED path (Luogu experimental, no promotion):

Note: `M` marks modified tracked files. `??` marks new untracked files. Task 5 added symlink-safe teardown to `.gitignore`, `tests/e2e/database.ts`, and `tests/unit/e2eDatabase.test.ts` — these are included below.

```
M  .gitignore
M  extension/src/platforms.ts
M  tests/e2e/captureFixtures.ts
M  tests/e2e/database.ts
M  tests/unit/extensionPlatforms.test.ts
?? tests/e2e/capture-luogu-problem.spec.ts
?? tests/fixtures/luogu/
?? tests/helpers/luoguFixtureMetadata.ts
?? tests/unit/e2eDatabase.test.ts
?? tests/unit/luoguFixtureLoader.test.ts
?? tests/unit/platformCertification.test.ts
?? work/reports/
```

Expected output for CERTIFIED path (after Task 4a promotion — Luogu becomes `production`):

```
M  .gitignore
M  extension/src/platforms.ts
M  tests/e2e/captureFixtures.ts
M  tests/e2e/database.ts
M  tests/unit/extensionPlatforms.test.ts
?? tests/e2e/capture-luogu-problem.spec.ts
?? tests/fixtures/luogu/
?? tests/helpers/luoguFixtureMetadata.ts
?? tests/unit/e2eDatabase.test.ts
?? tests/unit/luoguFixtureLoader.test.ts
?? tests/unit/platformCertification.test.ts
?? work/reports/
```

In the BLOCKED path, `extension/src/platforms.ts` has Luogu as `experimental` (same as Task 1). In the CERTIFIED path, Luogu is `production` and `tests/unit/extensionPlatforms.test.ts` asserts one production platform. The `work/reports/` directory contains the gate verdict, blocker artifact (BLOCKED path only), and certification artifact.

If ANY file outside this list appears in `git status --short`, do NOT accept.

- [x] **Step 7.7: Whitespace and final diff**

```powershell
$env:GIT_MASTER='1'; git diff --check
```

Expected: no whitespace errors. No binary files.

- [x] **Step 7.8: Terminal state verification (BLOCKED path — exact pinning)**

For the BLOCKED terminal state (the only state possible given no verified-public-dom fixtures), verify:

```powershell
# Luogu is experimental
npx tsx -e "
const s = require('./extension/src/platforms').getPlatformAdapterStatus('luogu');
if (s !== 'experimental') { process.exit(1); }
console.log('PASS: luogu is ' + s);
"

# No production platforms
npx tsx -e "
const p = require('./extension/src/platforms').getProductionPlatforms();
if (p.length !== 0) { process.exit(1); }
console.log('PASS: production platforms empty: ' + JSON.stringify(p));
"

# Blocker artifact exists and is parseable
if (-not (Test-Path "work/reports/luogu-adapter-blocker.json")) { throw "Blocker artifact missing" }
$blocker = Get-Content "work/reports/luogu-adapter-blocker.json" | ConvertFrom-Json
if ($blocker.planStatus -ne "BLOCKED") { throw "Blocker status is not BLOCKED" }
Write-Host "PASS: blocker preserved: $($blocker.blockerType)"

# Certification artifact terminal state is BLOCKED
$artifact = Get-Content "work/reports/luogu-adapter-certification.json" | ConvertFrom-Json
if ($artifact.terminalState -ne "BLOCKED") { throw "Certification artifact does not say BLOCKED" }
if ($artifact.luoguStatus -ne "experimental") { throw "Certification artifact says luogu is $($artifact.luoguStatus)" }
if ($artifact.productionPlatforms.Count -ne 0) { throw "Certification artifact reports non-empty production platforms" }
Write-Host "PASS: certification artifact consistent: $($artifact.terminalState), luogu=$($artifact.luoguStatus), prod=[]"
```

Expected: all assertions pass. Terminal state: BLOCKED, Luogu: experimental, productionPlatforms: [].

- [x] **Step 7.9: Task 0 is externally BLOCKED — no false completion**

The plan does not claim completion. The blocker artifact (`work/reports/luogu-adapter-blocker.json`) is the terminal record:

```powershell
Write-Host "=== Phase 0B4 terminal state: BLOCKED ==="
Write-Host "Luogu remains experimental. Production certification requires:"
Write-Host "  - Acquire verified-public-dom fixture from a publicly accessible Luogu page"
Write-Host "  - Re-run Task 0 Step 0.3-0.5, then Tasks 2-7"
Write-Host "See work/reports/luogu-adapter-blocker.json for details."
```

---

## Final Verification Wave

Run in order. Each must exit 0.

```powershell
Write-Host "=== Phase 0B4 Final Verification Wave ==="

Write-Host "1/8: Migration applies cleanly"
npm run db:migrate; if ($LASTEXITCODE -ne 0) { throw "Migration failed" }

Write-Host "2/8: Full unit suite"
npm run test; if ($LASTEXITCODE -ne 0) { throw "Unit tests failed" }

Write-Host "3/8: Verify certification gate is present in test output"
npm run test -- --verbose 2>&1 | Select-String "platformCertification"; if ($LASTEXITCODE -ne 0) { throw "Certification gate test not found" }

Write-Host "4/8: Strict typecheck"
npm run typecheck; if ($LASTEXITCODE -ne 0) { throw "Typecheck failed" }

Write-Host "5/8: Full E2E suite (including Luogu pipeline)"
npm run e2e; if ($LASTEXITCODE -ne 0) { throw "E2E failed" }

Write-Host "6/8: Extension build"
npm run extension:build; if ($LASTEXITCODE -ne 0) { throw "Extension build failed" }

Write-Host "7/8: Production build"
npm run build; if ($LASTEXITCODE -ne 0) { throw "Production build failed" }

Write-Host "8/8: Clean worktree assertion"
$env:GIT_MASTER='1'; git diff --check; if ($LASTEXITCODE -ne 0) { throw "Whitespace errors" }

Write-Host "=== Terminal state ==="
node -e "const a = require('./work/reports/luogu-adapter-certification.json'); console.log('State:', a.terminalState, '| Luogu:', a.luoguStatus, '| Blockers:', a.blockers.length)"

Write-Host "=== Phase 0B4 Final Verification Wave COMPLETE ==="
```

---

## Must Not Have

The following are explicitly excluded. Do not implement:

- No changes to V2 database schema, migration files (0001-0005), event protocol (`lib/capture/protocol.ts`), capture transition (`lib/services/captureTransition.ts`), credential domain (`lib/domain/captureCredential.ts`, `lib/services/captureCredentials.ts`), or session/attempt lifecycle.
- No changes to `lib/services/`, `lib/repositories/`, `lib/db/migrations/`, or `lib/domain/` (except type imports).
- No new Chrome permissions, content-script match patterns, or host-permissions changes in `extension/manifest.json`.
- No network-dependent automated tests. No live scraping in unit/E2E.
- No cookies, tokens, session storage, full problem statements, or hidden platform data.
- No popup HTML/CSS changes.
- No committing. All steps end with cleanup receipt (`git diff --stat` / `git status --short`).
- No broad refactors beyond the targeted `candidateTextForPlatform` selector-source change.
- No type suppressions, `any`, `@ts-expect-error`, `@ts-ignore`, `as any`, `as unknown`, non-null assertions, or unsafe casts. The plan text itself must not contain these tokens in any code example (only in prohibition statements).
- No second production platform if promotion occurs. Only Luogu may be `production`.
- No modification of existing plan files, `AGENTS.md`, `README.md`, `IDEA.md`, `DESIGN.md`, or `docs/` beyond `docs/superpowers/plans/`.
- No Phase 0D work (lint, CI, migration tests beyond existing coverage).
- No "production with documented limitation" — missing public verdict DOM is a hard blocker.
- No false plan completion in BLOCKED state. The terminal state artifact must accurately reflect the blocker.

---

## Manual QA Procedures

These produce binary PASS/FAIL outcomes. Run after the full gate.

### MQA-1: Verify registry exports and current state

CERTIFIED path:
```powershell
npx tsx -e "
const { getProductionPlatforms, getPlatformAdapterStatus } = require('./extension/src/platforms');
const production = getProductionPlatforms();
console.log('Production platforms:', JSON.stringify(production));
console.log('Luogu status:', getPlatformAdapterStatus('luogu'));
if (production.length !== 1 || production[0] !== 'luogu') { console.error('UNEXPECTED'); process.exit(1); }
console.log('PASS: Luogu is the sole production platform');
"
```

BLOCKED path:
```powershell
npx tsx -e "
const { getProductionPlatforms, getPlatformAdapterStatus } = require('./extension/src/platforms');
const production = getProductionPlatforms();
console.log('Production platforms:', JSON.stringify(production));
console.log('Luogu status:', getPlatformAdapterStatus('luogu'));
if (production.length !== 0) { console.error('UNEXPECTED: production platform exists while blocked'); process.exit(1); }
console.log('PASS: No production platform (blocked state)');
"
```

Expected output for the applicable path. Artifact: `work/reports/mqa-1-state-check.txt`.

### MQA-2: Verify fixture loader against every fixture

```powershell
npm run test -- tests/unit/luoguFixtureLoader.test.ts 2>&1
```

Expected: all tests pass. Count of tests should equal number of fixture files. Artifact: `work/reports/mqa-2-fixture-loader.txt`.

### MQA-3: Verify certification artifact

```powershell
node -e "
const a = require('./work/reports/luogu-adapter-certification.json');
console.log('Terminal state:', a.terminalState);
console.log('Luogu:', a.luoguStatus);
console.log('Production platforms:', JSON.stringify(a.productionPlatforms));
console.log('Evidence tiers: public-content-accessible=' + a.fixtureCoverage.publicContentAccessible + ' verified-public-dom=' + a.fixtureCoverage.verifiedPublicDom + ' characterization-derived=' + a.fixtureCoverage.characterizationDerived);
"
```

Expected: fields match the actual terminal state. Artifact: `work/reports/mqa-3-cert-state.txt`.

### MQA-4: Verify E2E passed

```powershell
npx playwright test tests/e2e/capture-luogu-problem.spec.ts --reporter=list 2>&1 | Select-String -Pattern "(PASS|✓|passed)"
```

Expected: matches one line containing PASS or ✓. Artifact: `work/reports/mqa-4-e2e-pipeline.txt`.

### MQA-5: Verify blocker artifact (BLOCKED path only)

```powershell
if (Test-Path "work/reports/luogu-adapter-blocker.json") {
  node -e "const b = require('./work/reports/luogu-adapter-blocker.json'); console.log('Blocker:', b.blockerType); console.log('Unblock condition:', b.unblockCondition)"
}
```

Expected (BLOCKED path): blocker type and unblock condition printed. Artifact: `work/reports/mqa-5-blocker.txt`.

---

## Adversarial Classification (start-work nine classes)

| Class | Applicable | Probe | Mitigation / Rationale |
|---|---|---|---|---|
| Malformed input | Yes | Ephemeral `__probe_unknown_platform.ts` file with strict `tsc --noEmit` (Step 7.4). Deleted afterward. | `getPlatformAdapterStatus("unknown")` is a compile-time type error, never a runtime concern. The probe proves the type guard works without any suppression token. |
| Prompt injection | Ruled out | N/A | No user text reaches the registry, loader, or gate. All inputs are compile-time literals or static file paths. |
| Cancel/resume | Ruled out | N/A | No long-running stateful operations. E2E is longest at ~30s; Playwright owns server lifecycle and cleanly tears down on cancel. All other tasks complete in <5s. Every task is idempotent. |
| Stale state | Yes | Not tested destructively. The existing synthetic gate test `"BLOCKED occurs when only characterization-derived fixtures exist"` proves the gate stalls when verified-public-dom is absent. Real fixture failure is the alert. | The fixture-loader will fail naturally if a selector stops matching. No source evidence is mutated. |
| Dirty worktree | Yes | `git status --short` must match the exact manifest in Step 7.6. | Exact path-level manifest with tracked/untracked distinction. Any deviation blocks acceptance. |
| Hung/long commands | Ruled out | N/A | `npm run test` <5s. `npm run e2e` has 30s test timeout + 120s server start. `npm run build` <60s. All bounded. |
| Flaky tests | Yes (mitigated) | Run `npm run test` twice. | Fixture-loader tests are deterministic (static files, no async). Certification gate synthetic test is pure computation. E2E posts deterministic events with fixed IDs. No timers, random values, or race conditions. |
| Misleading success output | Yes | `npm run test -- --verbose` with explicit named-file assertions (Step 7.4). | Three expected test files must each have >0 tests. The certification gate synthetic suite independently verifies the gate logic. The terminal state artifact provides a machine-readable cross-check. No fixture or test file is deleted or modified for this probe. |
| Repeated interruptions | Ruled out | N/A | Every task is idempotent. Repeating any step produces the same result. The certification gate is read-only. Promotion (Task 4a) is the only mutation and is explicitly gated on the CERTIFIED verdict. |

---

## Acceptance Checklist

The plan has two possible terminal states. Check the applicable state.

**CERTIFIED acceptance:**
- [ ] All `evidenceTier: "public-content-accessible"` fixtures pass (URL/title detection).
- [ ] All `evidenceTier: "verified-public-dom"` fixtures pass (public verdict DOM).
- [ ] At least one `evidenceTier: "verified-public-dom"` fixture exists with non-null `verdictExpected`.
- [ ] `getProductionPlatforms()` returns `["luogu"]`.
- [ ] `getPlatformAdapterStatus("luogu")` returns `"production"`.
- [ ] Every non-Luogu platform is `experimental` or `disabled`.
- [ ] E2E pipeline test passes for Luogu platform identity.
- [ ] Certification artifact reports terminal state `CERTIFIED`.
- [ ] All verification commands pass.
- [ ] No whitespace errors, clean worktree, default database untouched.

**BLOCKED acceptance:**
- [x] All `evidenceTier: "public-content-accessible"` fixtures pass (URL/title detection).
- [x] All `evidenceTier: "characterization-derived"` fixtures pass (function coverage, NOT certification).
- [x] No fixture has `evidenceTier: "verified-public-dom"` — public verdict DOM could not be acquired.
- [x] `getProductionPlatforms()` returns `[]` (empty).
- [x] `getPlatformAdapterStatus("luogu")` returns `"experimental"`.
- [x] Certification gate records `BLOCKED` with blocking reasons.
- [x] Blocker artifact (`luogu-adapter-blocker.json`) exists with unblock conditions.
- [x] E2E pipeline test passes for Luogu platform identity (runs while experimental).
- [x] Certification artifact reports terminal state `BLOCKED`.
- [x] All verification commands pass.
- [x] No whitespace errors, final commit leaves a clean worktree, default database untouched.
- [x] Plan does NOT claim completion — the blocker is the terminal record.

---

## Plan Self-Review

1. **Task 1 sets Luogu to experimental, not production.** Failing-first tests assert `getProductionPlatforms() === []`. No contradicting "luogu is production" language remains.

2. **One canonical helper module owns all schema.** `tests/helpers/luoguFixtureMetadata.ts` defines `EvidenceTier`, `FixtureMeta`, Zod `parseFixtureMeta`, and `loadFixtureMetadata`. No other file duplicates types, path resolution, or validation logic. The module enforces cross-field rules (verified-public-dom requires non-null verdict + selectors; public-content-accessible forbids verdictExpected; characterization-derived forbids selector provenance). Both Task 2 and Task 3 import from it exclusively.

3. **Task 3 is the certification decision gate.** It reads actual fixture metadata via the shared helper, produces a typed verdict (`CERTIFIED` or `BLOCKED`), and enforces: if blocked, `getProductionPlatforms()` MUST NOT contain `"luogu"`. It also includes a **synthetic CERTIFIED sub-suite** using in-memory metadata only — this proves the gate logic is correct (one per-tier fixture yields CERTIFIED, missing verified-public-dom yields BLOCKED). The synthetic test cannot promote Luogu or satisfy Task 0 evidence requirements.

4. **Promotion is a separate task (4a) that runs only when CERTIFIED.** If BLOCKED, Task 4b records the blocker instead. No path exists where Luogu becomes `production` without passing the gate.

5. **E2E pipeline test (Task 5) is independent.** It runs while Luogu is `experimental` and does not claim DOM certification.

6. **Terminal state artifact captures the outcome.** `work/reports/luogu-adapter-certification.json` records `CERTIFIED` + `"production"` or `BLOCKED` + `"experimental"` with blockers and fixture counts.

7. **No "production with documented limitation" language.** Missing public verdict DOM is a hard blocker. Characterization-only evidence does not certify.

8. **All sections updated for the two-terminal-state model:** deliverables table, task dependency graph, acceptance checklist, manual QA, adversarial probes, final verification wave.

9. **No placeholders.** Every path, symbol, command, and assertion is concrete. Every artifact has an exact path and schema.

10. **No contradicting claims.** The goal statement, architecture, task descriptions, and checklist are all consistent with the experimental→gate→promotion/blocked ordering.
11. **Module size discipline.** Every new pure source/test module targets under 250 LOC. The helper module is the sole schema authority; no duplicate `EvidenceTier`/`FixtureMeta` definitions exist elsewhere.
12. **Synthetic CERTIFIED test is gate-logic-only.** It uses in-memory metadata, never touches disk fixtures, and cannot promote Luogu or satisfy evidence requirements. The on-disk corpus test remains the sole certification authority.
13. **No suppression tokens in code examples.** All Plan TypeScript examples are strict-clean. No `any`, `@ts-expect-error`, or `as any` appears in any step instruction (only in the prohibition rule itself). The malformed-input probe uses an ephemeral file with strict `tsc --noEmit`, not a suppression directive.
14. **No destructive probes.** The adversarial stale-state and misleading-success probes never delete or modify real fixture, test, or evidence files. Stale-state uses existing synthetic in-memory tests. Misleading-success uses explicit `--verbose` named-file assertions. The malformed-input probe creates and destroys an ephemeral file with cleanup receipt.
15. **Dirty-worktree manifest is exact.** It lists every modified/new file with `M`/`??` markers including Task 5's `.gitignore`, `database.ts`, and `e2eDatabase.test.ts` changes. Any file outside this list blocks acceptance.
16. **Disposable DB for migration gate.** `npm run db:migrate` runs with `$env:TRAINING_DB_PATH` set to a temporary path. Default database hash+mtime is recorded before and verified after. The gate never touches the default database.
17. **Cleanup gates are explicit.** `.tmp/playwright` absent, port 3000 free, no `__probe_*` files, `test-results/` empty, `extension/dist` properly gitignored.
