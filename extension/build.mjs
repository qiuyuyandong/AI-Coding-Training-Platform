import { execFileSync } from "node:child_process";
import { copyFileSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { build } from "esbuild";

const root = process.cwd();
const extensionDir = join(root, "extension");
const outdir = join(extensionDir, "dist");
const sourceBuildSha = execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim();
// D1 update-like tests build a second traceable artifact without modifying
// generated files after esbuild completes. Normal builds always use HEAD.
const variant = process.env.V4_BUILD_VARIANT;
if (variant !== undefined && variant !== "d1-replacement") {
  throw new Error(`Unsupported V4_BUILD_VARIANT: ${variant}`);
}
const buildSha = variant === undefined ? sourceBuildSha : `${sourceBuildSha}:d1-replacement`;

rmSync(outdir, { recursive: true, force: true });
mkdirSync(outdir, { recursive: true });

await build({
  entryPoints: {
    background: join(extensionDir, "src", "background.ts"),
    content: join(extensionDir, "src", "content.ts"),
    popup: join(extensionDir, "src", "popup.ts"),
  },
  bundle: true,
  format: "esm",
  target: "chrome120",
  outdir,
  sourcemap: true,
  define: { __B3_BUILD_SHA__: JSON.stringify(buildSha) },
  logLevel: "info",
});

// MAIN-world bridge (Phase A Task A7). Built as a standalone IIFE so it
// can be injected via `chrome.scripting.executeScript({ world: "MAIN" })`.
// The bridge is dormant until an adapter in the registry opts in to MAIN
// injection; the bundle is unconditionally produced so the file referenced
// by `web_accessible_resources` always exists.
await build({
  entryPoints: [join(extensionDir, "src", "mainWorldBridge.ts")],
  bundle: true,
  format: "iife",
  target: "chrome120",
  outfile: join(outdir, "main-world-bridge.js"),
  sourcemap: true,
  logLevel: "info",
});

copyFileSync(join(extensionDir, "manifest.json"), join(outdir, "manifest.json"));
copyFileSync(join(extensionDir, "src", "popup.html"), join(outdir, "popup.html"));
