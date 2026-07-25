#!/usr/bin/env node

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(process.argv[2] ?? process.cwd());
const phase0Plan =
  "2026-07-24-v4-network-confirmed-capture-refactor-phase-0-click-ingress-stopgap.md";
const historicalV3Sha = "2f4f5d895ea8d965fb64d19dc784ca5514480688";

function read(relativePath) {
  try {
    return readFileSync(resolve(root, relativePath), "utf8");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`cannot read ${relativePath}: ${message}`);
  }
}

const failures = [];
let index = "";
let closeout = "";
let handoff = "";
let roadmap = "";

try {
  index = read("docs/superpowers/README.md");
  closeout = read(
    "docs/superpowers/plans/2026-07-18-v0-closeout-observation-final-verification.md",
  );
  handoff = read("work/handoff-current.md");
  roadmap = read(
    "docs/superpowers/plans/2026-07-11-product-development-roadmap.md",
  );
} catch (error) {
  failures.push(error instanceof Error ? error.message : String(error));
}

if (!index.includes(phase0Plan) || !/(?:active|completed) execution entry/i.test(index)) {
  failures.push("docs index must name the V4 Phase 0 execution entry or record");
}
if (/active closeout plan/i.test(index)) {
  failures.push("docs index must not call the V0 closeout plan active");
}
if (/only active execution plan is[\s\S]{0,200}v0-closeout/i.test(roadmap)) {
  failures.push("product roadmap must not call V0 closeout the only active plan");
}
if (!/blocked by V4/i.test(closeout)) {
  failures.push("V0 closeout status must be blocked by V4");
}
if (!handoff.includes(phase0Plan)) {
  failures.push("handoff must name the V4 Phase 0 execution entry");
}
if (!/formal V0 observation is blocked/i.test(handoff)) {
  failures.push("formal observation must be blocked in the current handoff");
}
if (
  handoff.includes(historicalV3Sha) &&
  /start formal V0 observation against implementation commit/i.test(handoff)
) {
  failures.push("formal observation must be blocked, not continued on the V3 SHA");
}

if (failures.length > 0) {
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exitCode = 1;
} else {
  console.log("V4 plan authority PASS");
}
