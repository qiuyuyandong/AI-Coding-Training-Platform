#!/usr/bin/env node
// Validate a V0 curriculum package directory against the deterministic
// rules in lib/curriculum/validatePackage.ts. Emits machine-readable
// JSON to stdout; exits 0 on success, 1 on validation failure, 2 on
// usage error.
//
// Usage: node scripts/validate-curriculum.mjs [package-path]
// Default package path: ./content/tracks/software-development-foundations-v1

import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import * as validatorModule from "../lib/curriculum/validatePackage.ts";

const validatePackage =
  validatorModule.validatePackage ??
  validatorModule.default?.validatePackage;

if (typeof validatePackage !== "function") {
  throw new Error("Failed to load validatePackage from lib/curriculum/validatePackage.ts");
}

const scriptDirectory = fileURLToPath(new URL(".", import.meta.url));
const projectRoot = resolve(scriptDirectory, "..");
const defaultPackagePath = join(
  projectRoot,
  "content",
  "tracks",
  "software-development-foundations-v1",
);

const argPath = process.argv[2];
const packagePath = resolve(projectRoot, argPath ?? defaultPackagePath);

let rawManifest;
try {
  rawManifest = readFileSync(join(packagePath, "manifest.json"), "utf8");
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  emitAndExit({
    ok: false,
    packagePath,
    errors: [
      {
        code: "manifest.unreadable",
        path: "manifest.json",
        message: `Unable to read manifest.json: ${message}`,
      },
    ],
  }, 2);
}

let manifest;
try {
  manifest = JSON.parse(rawManifest);
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  emitAndExit({
    ok: false,
    packagePath,
    errors: [
      {
        code: "manifest.invalid_json",
        path: "manifest.json",
        message: `manifest.json is not valid JSON: ${message}`,
      },
    ],
  }, 2);
}

const loadJsonArray = (relativePath) => {
  const absolute = join(packagePath, relativePath);
  const raw = readFileSync(absolute, "utf8");
  return JSON.parse(raw);
};

let nodes;
let edges;
let resources;
let practiceMappings;
let careers;

try {
  nodes = loadJsonArray("nodes.json");
  edges = loadJsonArray("edges.json");
  resources = loadJsonArray("resources.json");
  practiceMappings = loadJsonArray("practice-mappings.json");
  careers = JSON.parse(
    readFileSync(join(packagePath, manifest.careers_file), "utf8"),
  );
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  emitAndExit({
    ok: false,
    packagePath,
    errors: [
      {
        code: "package.file_unreadable",
        path: "<package>",
        message: `Unable to read package files: ${message}`,
      },
    ],
  }, 2);
}

const validation = validatePackage({
  manifest,
  nodes,
  edges,
  resources,
  practiceMappings,
  careers,
});

if (validation.ok) {
  emitAndExit(
    {
      ok: true,
      packagePath,
      normalized: {
        packageId: validation.normalized.packageId,
        checksum: validation.normalized.checksum,
        counts: validation.normalized.counts,
      },
    },
    0,
  );
} else {
  emitAndExit(
    {
      ok: false,
      packagePath,
      errors: validation.errors,
    },
    1,
  );
}

function emitAndExit(payload, code) {
  process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
  process.exit(code);
}