import { readFile } from "node:fs/promises";

const required = [
  "# V4 NowCoder Experimental Network Adapter Design",
  "## Request matcher",
  "POST /nccommon/submit_cd",
  "GET /nccommon/status",
  "## Business-success predicate",
  "## Stable ID extractor",
  "^[0-9]{1,20}$",
  "## Correlator window",
  "5 seconds",
  "## Final-verdict identity rule",
  "/acm/contest/view-submission",
  "## Retained safe fields",
  "## Fail-closed cases",
  "## Known unknowns",
  "no nearest-request fallback",
  "remain forbidden",
  "experimental",
];

export function validateNowCoderAdapterDesign(text) {
  const missing = required.filter((marker) => !text.includes(marker));
  return missing.length === 0
    ? { ok: true }
    : { ok: false, missing };
}

async function main() {
  const path = process.argv[2];
  if (path === undefined) {
    console.error("usage: node scripts/validate-v4-nowcoder-adapter-design.mjs <design.md>");
    process.exitCode = 2;
    return;
  }
  let text;
  try {
    text = await readFile(path, "utf8");
  } catch {
    console.error("NowCoder adapter design FAIL: unreadable file");
    process.exitCode = 1;
    return;
  }
  const result = validateNowCoderAdapterDesign(text);
  if (!result.ok) {
    console.error(`NowCoder adapter design FAIL: missing ${result.missing.join(", ")}`);
    process.exitCode = 1;
    return;
  }
  console.log("NowCoder adapter design PASS");
}

if (process.argv[1]?.endsWith("validate-v4-nowcoder-adapter-design.mjs")) {
  await main();
}
