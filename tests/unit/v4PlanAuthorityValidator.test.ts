import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";

import { afterEach, describe, expect, test } from "vitest";

const validatorPath = resolve(
  process.cwd(),
  "scripts/validate-v4-plan-authority.mjs",
);
const tempRoots: string[] = [];

function write(root: string, relativePath: string, content: string): void {
  const target = join(root, relativePath);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, content, "utf8");
}

function createAuthorityFixture(overrides: {
  readonly index?: string;
  readonly closeout?: string;
  readonly handoff?: string;
} = {}): string {
  const root = mkdtempSync(join(tmpdir(), "v4-plan-authority-"));
  tempRoots.push(root);
  write(
    root,
    "docs/superpowers/README.md",
    overrides.index ??
      "Active execution entry: `2026-07-24-v4-network-confirmed-capture-refactor-phase-0-click-ingress-stopgap.md`.\n",
  );
  write(
    root,
    "docs/superpowers/plans/2026-07-18-v0-closeout-observation-final-verification.md",
    overrides.closeout ??
      "**Status:** Blocked by V4. Do not resume formal observation until the V4 replacement candidate gates pass.\n",
  );
  write(
    root,
    "docs/superpowers/plans/2026-07-11-product-development-roadmap.md",
    "V4 Phase 0 is complete. Phase A awaits authorization; V0 closeout is blocked.\n",
  );
  write(
    root,
    "work/handoff-current.md",
    overrides.handoff ??
      "## Next Commander Action\n\nExecute `2026-07-24-v4-network-confirmed-capture-refactor-phase-0-click-ingress-stopgap.md`. Formal V0 observation is blocked.\n",
  );
  return root;
}

function runValidator(root: string) {
  return spawnSync(process.execPath, [validatorPath, root], {
    encoding: "utf8",
  });
}

afterEach(() => {
  for (const root of tempRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe("V4 plan authority validator", () => {
  test("accepts one Phase 0 execution entry with closeout blocked", () => {
    const result = runValidator(createAuthorityFixture());

    expect(result.status).toBe(0);
    expect(result.stdout).toContain("V4 plan authority PASS");
  });

  test("rejects an index that still calls V0 closeout active", () => {
    const result = runValidator(
      createAuthorityFixture({
        index:
          "The active closeout plan is `2026-07-18-v0-closeout-observation-final-verification.md`.\n",
      }),
    );

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("Phase 0 execution entry");
  });

  test("rejects authority that continues observation on the historical V3 SHA", () => {
    const result = runValidator(
      createAuthorityFixture({
        handoff:
          "## Next Commander Action\n\nStart formal V0 observation against implementation commit `2f4f5d895ea8d965fb64d19dc784ca5514480688`.\n",
      }),
    );

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("formal observation must be blocked");
  });
});
