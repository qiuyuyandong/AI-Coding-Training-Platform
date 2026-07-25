import { copyFileSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { build } from "esbuild";

const root = process.cwd();
const extensionDir = join(root, "extension");
const outdir = join(extensionDir, "dist");

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