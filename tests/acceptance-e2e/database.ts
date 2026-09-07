import { lstatSync, mkdirSync, readdirSync, rmdirSync, unlinkSync } from "node:fs";
import { isAbsolute, relative, resolve } from "node:path";

const TEMP_ROOT = resolve(process.cwd(), ".tmp");
export const ACCEPTANCE_ROOT = resolve(TEMP_ROOT, "playwright-acceptance");
export const ACCEPTANCE_DB_PATH = resolve(ACCEPTANCE_ROOT, "training-platform.sqlite");
export const ACCEPTANCE_VAULT_CONFIG_DIR = resolve(ACCEPTANCE_ROOT, "config");

export function resetAcceptanceRoot(): void {
  cleanupAcceptanceRoot();
  mkdirSync(ACCEPTANCE_ROOT, { recursive: true });
}

export function cleanupAcceptanceRoot(): void {
  const relativePath = relative(TEMP_ROOT, ACCEPTANCE_ROOT);
  if (relativePath.length === 0 || relativePath === ".." || relativePath.startsWith(`..${process.platform === "win32" ? "\\" : "/"}`)
    || isAbsolute(relativePath)) {
    throw new Error(`Unsafe acceptance cleanup path: ${ACCEPTANCE_ROOT}`);
  }
  removePath(ACCEPTANCE_ROOT);
}

function removePath(target: string): void {
  const stat = lstatSync(target, { throwIfNoEntry: false });
  if (stat === undefined) return;
  if (stat.isSymbolicLink() || !stat.isDirectory()) {
    unlinkSync(target);
    return;
  }
  for (const entry of readdirSync(target)) removePath(resolve(target, entry));
  rmdirSync(target);
}
