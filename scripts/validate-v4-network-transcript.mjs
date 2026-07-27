#!/usr/bin/env node

import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import * as transcriptModule from "../extension/src/networkTranscriptContract.ts";

const transcriptContract = transcriptModule.default ?? transcriptModule;
const { parseNetworkTranscriptDocument } = transcriptContract;

export function validateTranscript(data) {
  const result = parseNetworkTranscriptDocument(data);
  return result.ok ? [] : [result.reason];
}

function main() {
  const path = process.argv[2];
  if (typeof path !== "string" || path.trim().length === 0) {
    console.error("usage: node scripts/validate-v4-network-transcript.mjs <fixture-meta-path>");
    process.exitCode = 2;
    return;
  }
  const resolvedPath = resolve(path);
  if (!existsSync(resolvedPath)) {
    console.error(`transcript fixture does not exist: ${resolvedPath}`);
    process.exitCode = 1;
    return;
  }
  let data;
  try {
    data = JSON.parse(readFileSync(resolvedPath, "utf8"));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`invalid JSON: ${message}`);
    process.exitCode = 1;
    return;
  }
  const failures = validateTranscript(data);
  if (failures.length > 0) {
    for (const failure of failures) console.error(`- ${failure}`);
    process.exitCode = 1;
    return;
  }
  console.log("V4 network transcript fixture PASS");
}

const invokedPath = process.argv[1];
if (invokedPath !== undefined && import.meta.url === new URL(`file://${invokedPath}`).href) main();
