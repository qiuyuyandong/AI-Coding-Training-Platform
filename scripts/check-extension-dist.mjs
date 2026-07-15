import { existsSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join } from "node:path";

const root = process.cwd();
const extensionDir = join(root, "extension");
const distDir = join(extensionDir, "dist");
const requiredFiles = [
  "background.js",
  "background.js.map",
  "content.js",
  "content.js.map",
  "manifest.json",
  "popup.html",
  "popup.js",
  "popup.js.map",
];

for (const name of requiredFiles) {
  if (!existsSync(join(distDir, name))) {
    throw new Error(`Missing extension build output: extension/dist/${name}`);
  }
}

for (const name of ["manifest.json", "popup.html"]) {
  const sourcePath = name === "manifest.json"
    ? join(extensionDir, name)
    : join(extensionDir, "src", name);
  const outputPath = join(distDir, name);
  if (readFileSync(sourcePath, "utf8") !== readFileSync(outputPath, "utf8")) {
    throw new Error(`Extension output differs from source: ${name}`);
  }
}

const ignored = spawnSync(
  "git",
  ["check-ignore", "--quiet", "extension/dist/content.js"],
  {
    cwd: root,
    env: { ...process.env, GIT_MASTER: "1" },
    stdio: "inherit",
  },
);
if (ignored.status !== 0) {
  throw new Error("extension/dist is not ignored by Git");
}
