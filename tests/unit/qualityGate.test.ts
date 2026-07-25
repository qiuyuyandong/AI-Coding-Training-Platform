import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  CONTENT_PACKAGE_MANIFEST_PATH,
  LINK_ACCESS_CHECK_REPORT_PATH,
  QUALITY_GATE_STAGES,
  hasContentPackageManifest,
  hasLinkAccessCheckReport,
} from "../../scripts/quality-gate.mjs";
import type { QualityGateStage } from "../../scripts/quality-gate.mjs";

const EXPECTED_STAGE_SCRIPT_NAMES = [
  "lint",
  "db:migrate",
  "curriculum:validate",
  "test",
  "typecheck",
  "e2e",
  "extension:check",
  "extension:e2e",
  "build",
];

describe("scripts/quality-gate.mjs", () => {
  describe("QUALITY_GATE_STAGES", () => {
    it("declares the canonical nine-stage order for the V0 quality gate", () => {
      const scriptNames = QUALITY_GATE_STAGES.map((args) => args[1]);
      expect(scriptNames).toEqual(EXPECTED_STAGE_SCRIPT_NAMES);
    });

    it("runs `npm run <script>` (never a bare script) for every stage", () => {
      for (const args of QUALITY_GATE_STAGES) {
        const stage = args as QualityGateStage;
        expect(stage[0]).toBe("run");
        expect(typeof stage[1]).toBe("string");
        expect(stage[1].length).toBeGreaterThan(0);
      }
    });

    it("inserts curriculum:validate immediately after db:migrate and before test", () => {
      const scriptNames = QUALITY_GATE_STAGES.map((args) => args[1]);
      const migrateIndex = scriptNames.indexOf("db:migrate");
      const validateIndex = scriptNames.indexOf("curriculum:validate");
      const testIndex = scriptNames.indexOf("test");
      expect(migrateIndex).toBeGreaterThanOrEqual(0);
      expect(validateIndex).toBe(migrateIndex + 1);
      expect(testIndex).toBe(validateIndex + 1);
    });

    it("freezes the stages array so callers cannot mutate the canonical order", () => {
      expect(Object.isFrozen(QUALITY_GATE_STAGES)).toBe(true);
      for (const args of QUALITY_GATE_STAGES) {
        expect(Object.isFrozen(args)).toBe(true);
      }
    });
  });

  describe("hasContentPackageManifest", () => {
    it("points at the V0 foundations track manifest committed in this repo", () => {
      expect(CONTENT_PACKAGE_MANIFEST_PATH.replace(/\\/g, "/")).toMatch(
        /content\/tracks\/software-development-foundations-v1\/manifest\.json$/,
      );
    });

    it("returns true when the manifest exists at the supplied path", () => {
      const dir = mkdtempSync(join(tmpdir(), "qg-content-"));
      const manifestPath = join(dir, "manifest.json");
      try {
        writeFileSync(manifestPath, "{}", "utf8");
        expect(hasContentPackageManifest(manifestPath)).toBe(true);
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });

    it("returns false when the manifest is absent and never throws", () => {
      const dir = mkdtempSync(join(tmpdir(), "qg-content-empty-"));
      try {
        const missingPath = join(dir, "does-not-exist.json");
        expect(() => hasContentPackageManifest(missingPath)).not.toThrow();
        expect(hasContentPackageManifest(missingPath)).toBe(false);
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });
  });

  describe("hasLinkAccessCheckReport", () => {
    let tempDir = "";
    let tempReportPath = "";

    beforeEach(() => {
      tempDir = mkdtempSync(join(tmpdir(), "qg-link-check-"));
      tempReportPath = join(tempDir, "v0-link-access-check.json");
    });

    afterEach(() => {
      if (tempDir.length > 0) {
        rmSync(tempDir, { recursive: true, force: true });
        tempDir = "";
      }
    });

    it("points at the expected work/reports path", () => {
      expect(LINK_ACCESS_CHECK_REPORT_PATH.replace(/\\/g, "/")).toMatch(
        /work\/reports\/v0-link-access-check\.json$/,
      );
    });

    it("returns true when the report exists at the supplied path", () => {
      writeFileSync(tempReportPath, "{}", "utf8");
      expect(hasLinkAccessCheckReport(tempReportPath)).toBe(true);
    });

    it("returns false when the report is absent and never throws (soft check)", () => {
      const missingPath = join(tempDir, "missing-link-report.json");
      expect(existsSync(missingPath)).toBe(false);
      expect(() => hasLinkAccessCheckReport(missingPath)).not.toThrow();
      expect(hasLinkAccessCheckReport(missingPath)).toBe(false);
    });

    it("defaults to the canonical work/reports path when called with no argument", () => {
      expect(() => hasLinkAccessCheckReport()).not.toThrow();
      const result = hasLinkAccessCheckReport();
      expect(typeof result).toBe("boolean");
    });
  });
});