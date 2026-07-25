import {
  lstatSync,
  readdirSync,
  rmdirSync,
  unlinkSync,
} from "node:fs";
import { isAbsolute, relative, resolve } from "node:path";

const WORKSPACE_TEMP_ROOT = resolve(process.cwd(), ".tmp");
const EXTENSION_TEMP_ROOT = resolve(WORKSPACE_TEMP_ROOT, "playwright-extension");

export default function globalTeardown(): void {
  const relativePath = relative(WORKSPACE_TEMP_ROOT, EXTENSION_TEMP_ROOT);
  if (relativePath === "" || relativePath === ".."
    || relativePath.startsWith("..\\") || relativePath.startsWith("../")
    || isAbsolute(relativePath)) {
    throw new Error(`Unsafe extension E2E cleanup path: ${EXTENSION_TEMP_ROOT}`);
  }
  removePath(EXTENSION_TEMP_ROOT);
}

function removePath(target: string): void {
  const stats = lstatSync(target, { throwIfNoEntry: false });
  if (stats === undefined) return;
  if (stats.isSymbolicLink() || !stats.isDirectory()) {
    unlinkSync(target);
    return;
  }
  for (const entry of readdirSync(target)) removePath(resolve(target, entry));
  rmdirSync(target);
}
