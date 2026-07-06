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

copyFileSync(join(extensionDir, "manifest.json"), join(outdir, "manifest.json"));
copyFileSync(join(extensionDir, "src", "popup.html"), join(outdir, "popup.html"));