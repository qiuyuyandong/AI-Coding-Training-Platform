#!/usr/bin/env node
// Deterministic curriculum-link checker.
//
// Usage:
//   node scripts/check-curriculum-links.mjs <package-path> \
//        --profile <name> [--output <path>] [--base-url <origin>]
//
// What it does:
//   - Loads `manifest.json`, `resources.json` and `practice-mappings.json`
//     from <package-path> (plus the careers file referenced in the
//     manifest, though that contributes no URLs).
//   - Collects every URL from `resources[].url` and from every
//     `practiceMappings[].sources[].url`.
//   - Deduplicates the URL list in stable sorted order so re-runs
//     produce byte-identical JSON output.
//   - For each URL, performs a `fetch` with `AbortSignal.timeout(10s)`
//     and `redirect: 'manual'`, manually following up to 5 redirects.
//   - Rejects non-HTTP(S), non-2xx/3xx, login-interstitial markers
//     (`<input name="password"`, `Sign in`, `Login to continue`,
//     `请登录`, `登录`), and duplicate `finalUrl`s across distinct
//     source URLs.
//   - Emits deterministic JSON (sorted by original URL, stable stringify
//     with indent 2) to the `--output` path or stdout when no path is
//     given.
//   - Exits 0 when every result reports `ok: true`; exits 1 otherwise.
//
// When `--base-url` is supplied, every collected URL is rewritten so its
// origin matches the supplied one and its pathname is preserved (used by
// the test harness to point the fixture URLs at an in-process HTTP
// server). The CLI never opens a network connection in the absence of an
// explicit `--base-url`.

import { readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

const LOGIN_MARKERS = [
  "<input name=\"password\"",
  "Sign in",
  "Login to continue",
  "请登录",
  "登录",
];

const MAX_REDIRECTS = 5;
const FETCH_TIMEOUT_MS = 10_000;
const BODY_LIMIT_BYTES = 256 * 1024;

const scriptDirectory = fileURLToPath(new URL(".", import.meta.url));
const projectRoot = resolve(scriptDirectory, "..");

const { values, positionals } = parseArgs({
  options: {
    profile: { type: "string" },
    output: { type: "string" },
    "base-url": { type: "string" },
    help: { type: "boolean", short: "h" },
  },
  allowPositionals: true,
});

if (values.help || positionals.length === 0) {
  printUsage();
  process.exit(values.help ? 0 : 2);
}

const profile = values.profile ?? "default";
const packagePath = resolve(projectRoot, positionals[0]);
const outputPath = values.output !== undefined
  ? resolve(projectRoot, values.output)
  : null;

const baseUrl = values["base-url"];

try {
  const result = await runCheck(packagePath, profile, baseUrl);
  const json = `${JSON.stringify(result, null, 2)}\n`;
  if (outputPath !== null) {
    writeFileSync(outputPath, json, "utf8");
  } else {
    process.stdout.write(json);
  }
  process.exit(result.summary.failed === 0 && result.summary.duplicates === 0 ? 0 : 1);
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`check-curriculum-links failed: ${message}\n`);
  process.exit(2);
}

function printUsage() {
  process.stdout.write(
    "Usage: node scripts/check-curriculum-links.mjs <package-path> --profile <name> [--output <path>] [--base-url <origin>]\n",
  );
}

async function runCheck(packagePathArg, profileName, baseUrlArg) {
  const { manifest, resources, practiceMappings } = loadPackageFiles(packagePathArg);
  const urls = collectUrls(resources, practiceMappings);
  const rewritten = urls.map((entry) => rewriteUrl(entry, baseUrlArg));

  const deduped = stableDedupe(rewritten);
  const results = [];
  const finalUrlToSources = new Map();
  let duplicates = 0;

  for (const entry of deduped) {
    const outcome = await probe(entry.url);
    const record = {
      url: entry.url,
      finalUrl: outcome.finalUrl,
      status: outcome.status,
      redirects: outcome.redirects,
      ok: outcome.ok,
    };
    if (outcome.error !== undefined) record.error = outcome.error;
    if (outcome.ok) {
      const previous = finalUrlToSources.get(outcome.finalUrl);
      if (previous !== undefined && previous !== entry.source) {
        record.ok = false;
        record.error = `duplicate final URL shared with ${previous}`;
        duplicates += 1;
      }
      finalUrlToSources.set(outcome.finalUrl, entry.source);
    }
    results.push(record);
  }

  const failed = results.filter((r) => r.ok === false).length;
  const okCount = results.length - failed;

  return {
    checkedAt: new Date(0).toISOString(),
    profile: profileName,
    package: {
      path: packagePathArg,
      track_slug: manifest.track_slug,
      semantic_version: manifest.semantic_version,
    },
    results: results.sort((a, b) => (a.url < b.url ? -1 : a.url > b.url ? 1 : 0)),
    summary: {
      total: results.length,
      ok: okCount,
      failed,
      duplicates,
    },
  };
}

function loadPackageFiles(packagePathArg) {
  const read = (file) => readFileSync(join(packagePathArg, file), "utf8");
  const manifest = JSON.parse(read("manifest.json"));
  const resources = JSON.parse(read("resources.json"));
  const practiceMappings = JSON.parse(read("practice-mappings.json"));
  // The careers file is referenced but contributes no URLs; we still
  // confirm it exists so the validator and importer will agree later.
  const careersPath = join(packagePathArg, manifest.careers_file);
  readFileSync(careersPath, "utf8");
  return { manifest, resources, practiceMappings };
}

function collectUrls(resources, practiceMappings) {
  const collected = [];
  for (const resource of resources) {
    if (typeof resource.url === "string" && resource.url.length > 0) {
      collected.push({ source: `resource:${resource.stable_id}`, url: resource.url });
    }
  }
  for (const mapping of practiceMappings) {
    for (const source of mapping.sources ?? []) {
      if (typeof source.url === "string" && source.url.length > 0) {
        collected.push({
          source: `practice:${mapping.practice_task_stable_id}`,
          url: source.url,
        });
      }
    }
  }
  return collected;
}

function rewriteUrl(entry, baseUrlArg) {
  if (baseUrlArg === undefined) return entry;
  let parsedOriginal;
  try {
    parsedOriginal = new URL(entry.url);
  } catch {
    return entry;
  }
  const rewritten = new URL(`${parsedOriginal.pathname}${parsedOriginal.search}`, baseUrlArg);
  return { source: entry.source, url: rewritten.href };
}

function stableDedupe(entries) {
  // Stable sort by `url`, then keep first occurrence per URL. The first
  // occurrence wins so the `source` attribution never depends on JS
  // Set iteration order.
  const sorted = [...entries].sort((a, b) => {
    if (a.url === b.url) {
      if (a.source === b.source) return 0;
      return a.source < b.source ? -1 : 1;
    }
    return a.url < b.url ? -1 : 1;
  });
  const seen = new Set();
  const out = [];
  for (const entry of sorted) {
    if (seen.has(entry.url)) continue;
    seen.add(entry.url);
    out.push(entry);
  }
  return out;
}

async function probe(initialUrl) {
  // Reject obviously bad URLs up-front.
  let parsed;
  try {
    parsed = new URL(initialUrl);
  } catch {
    return { ok: false, status: 0, redirects: 0, finalUrl: initialUrl, error: "URL is not parseable" };
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return { ok: false, status: 0, redirects: 0, finalUrl: initialUrl, error: `non-HTTP(S) protocol ${parsed.protocol}` };
  }

  let currentUrl = initialUrl;
  let redirects = 0;
  let response;
  let bodyText = "";
  let status = 0;
  let tooManyRedirects = false;
  let redirectError;

  while (true) {
    try {
      response = await fetch(currentUrl, {
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
        redirect: "manual",
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        ok: false,
        status,
        redirects,
        finalUrl: currentUrl,
        error: classifyFetchError(message),
      };
    }

    status = response.status;

    if (status >= 300 && status < 400) {
      const location = response.headers.get("location");
      if (location === null) {
        return {
          ok: false,
          status,
          redirects,
          finalUrl: currentUrl,
          error: `redirect ${status} without Location header`,
        };
      }
      if (redirects >= MAX_REDIRECTS) {
        tooManyRedirects = true;
        redirectError = `redirected ${redirects + 1} times (cap ${MAX_REDIRECTS})`;
        break;
      }
      let nextUrl;
      try {
        nextUrl = new URL(location, currentUrl).href;
      } catch {
        return {
          ok: false,
          status,
          redirects,
          finalUrl: currentUrl,
          error: `redirect ${status} produced unparseable Location header: ${location}`,
        };
      }
      currentUrl = nextUrl;
      redirects += 1;
      // Free the previous response body so the redirect loop is cheap.
      try { await response.arrayBuffer(); } catch { /* ignore */ }
      continue;
    }

    // Final response (non-redirect).
    try {
      const buffer = await response.arrayBuffer();
      const truncated = buffer.byteLength > BODY_LIMIT_BYTES
        ? buffer.slice(0, BODY_LIMIT_BYTES)
        : buffer;
      bodyText = new TextDecoder("utf-8", { fatal: false }).decode(truncated);
    } catch {
      bodyText = "";
    }
    break;
  }

  if (tooManyRedirects) {
    return {
      ok: false,
      status,
      redirects,
      finalUrl: currentUrl,
      error: redirectError ?? "too many redirects",
    };
  }

  if (status < 200 || status >= 400) {
    return {
      ok: false,
      status,
      redirects,
      finalUrl: currentUrl,
      error: `unexpected HTTP status ${status}`,
    };
  }

  for (const marker of LOGIN_MARKERS) {
    if (bodyText.includes(marker)) {
      return {
        ok: false,
        status,
        redirects,
        finalUrl: currentUrl,
        error: `login/interstitial marker detected: ${marker}`,
      };
    }
  }

  return { ok: true, status, redirects, finalUrl: currentUrl };
}

function classifyFetchError(message) {
  if (message.includes("aborted")) {
    if (message.includes("timeout")) {
      return `timeout after ${FETCH_TIMEOUT_MS}ms`;
    }
    return "request aborted";
  }
  if (message.toLowerCase().includes("fetch failed")) {
    return message;
  }
  return message;
}