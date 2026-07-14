import {
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, relative, resolve } from "node:path";
import Database from "better-sqlite3";
import {
  readFileSync,
  rmdirSync,
  symlinkSync,
  unlinkSync,
} from "node:fs";
import { afterEach, describe, expect, it } from "vitest";
import {
  cleanupE2eDatabase,
  E2E_DB_PATH,
  E2E_ROOT,
  prepareE2eDatabase,
} from "@/tests/e2e/database";

afterEach(() => {
  cleanupE2eDatabase();
});

const fileSymlinkProbe = probeFileSymlinkCapability();
if (!fileSymlinkProbe.supported) {
  process.stderr.write(
    `[e2eDatabase] file-symlink escape test BLOCKED on this host: ${fileSymlinkProbe.reason}. Enable Developer Mode or run vitest as administrator to permit file symlink creation.\n`,
  );
}

describe("E2E database lifecycle", () => {
  it("prepares a migrated database only under the workspace temp root", () => {
    const workspaceTempRoot = resolve(process.cwd(), ".tmp");
    const defaultDatabasePath = resolve(process.cwd(), "training-platform.sqlite");

    prepareE2eDatabase();

    expect(relative(workspaceTempRoot, E2E_ROOT)).toBe("playwright");
    expect(resolve(E2E_DB_PATH)).not.toBe(defaultDatabasePath);
    expect(existsSync(E2E_DB_PATH)).toBe(true);

    const db = new Database(E2E_DB_PATH, { readonly: true });
    try {
      const migrationCount = db
        .prepare<[], { readonly count: number }>("SELECT COUNT(*) AS count FROM schema_migrations")
        .get();
      const expectedMigrationCount = readdirSync(
        resolve(process.cwd(), "lib", "db", "migrations"),
      ).filter((name) => name.endsWith(".sql")).length;
      expect(migrationCount).toEqual({ count: expectedMigrationCount });
    } finally {
      db.close();
    }
  });

  it("removes the disposable database after prepare, including the E2E root directory", () => {
    prepareE2eDatabase();
    expect(existsSync(E2E_DB_PATH)).toBe(true);
    expect(existsSync(E2E_ROOT)).toBe(true);

    cleanupE2eDatabase();

    expect(existsSync(E2E_ROOT)).toBe(false);
    expect(existsSync(E2E_DB_PATH)).toBe(false);
  });

  it("removes the E2E root even when extra files and subdirectories are present", () => {
    prepareE2eDatabase();

    const extraDir = join(E2E_ROOT, "nested");
    mkdirSync(extraDir, { recursive: true });
    writeFileSync(join(extraDir, "marker.txt"), "regression-marker");
    writeFileSync(join(E2E_ROOT, "sibling.txt"), "sibling");

    cleanupE2eDatabase();

    expect(existsSync(E2E_ROOT)).toBe(false);
    expect(existsSync(extraDir)).toBe(false);
    expect(existsSync(join(E2E_ROOT, "sibling.txt"))).toBe(false);
  });

  it("is a no-op when the E2E root does not exist", () => {
    expect(existsSync(E2E_ROOT)).toBe(false);

    expect(() => cleanupE2eDatabase()).not.toThrow();

    expect(existsSync(E2E_ROOT)).toBe(false);
  });

  it("does not traverse a directory junction that escapes E2E_ROOT", () => {
    const externalDir = mkdtempSync(join(tmpdir(), "e2e-junction-outside-"));
    const externalSentinel = join(externalDir, "sentinel.txt");
    writeFileSync(externalSentinel, "do-not-touch");
    const sentinelBytesBefore = readFileSync(externalSentinel);

    prepareE2eDatabase();

    const junctionPath = join(E2E_ROOT, "escape-junction");
    symlinkSync(externalDir, junctionPath, "junction");

    try {
      cleanupE2eDatabase();

      expect(existsSync(E2E_ROOT)).toBe(false);
      expect(existsSync(externalSentinel)).toBe(true);
      expect(readFileSync(externalSentinel)).toEqual(sentinelBytesBefore);
    } finally {
      cleanupSentinel(externalDir, junctionPath);
    }
  });

  it.runIf(fileSymlinkProbe.supported)(
    "does not traverse a file symlink that escapes E2E_ROOT",
    () => {
      const externalDir = mkdtempSync(join(tmpdir(), "e2e-symlink-outside-"));
      const externalSentinel = join(externalDir, "sentinel.txt");
      writeFileSync(externalSentinel, "do-not-touch");
      const sentinelBytesBefore = readFileSync(externalSentinel);

      prepareE2eDatabase();

      const symlinkPath = join(E2E_ROOT, "escape-symlink.txt");
      symlinkSync(externalSentinel, symlinkPath, "file");

      try {
        cleanupE2eDatabase();

        expect(existsSync(E2E_ROOT)).toBe(false);
        expect(existsSync(externalSentinel)).toBe(true);
        expect(readFileSync(externalSentinel)).toEqual(sentinelBytesBefore);
      } finally {
        cleanupSentinel(externalDir, undefined, symlinkPath);
      }
    },
  );

  it("removes a broken directory junction without traversing the dangling target", () => {
    const externalDir = mkdtempSync(join(tmpdir(), "e2e-broken-junction-outside-"));
    const externalSentinel = join(externalDir, "sentinel.txt");
    writeFileSync(externalSentinel, "do-not-touch");
    const sentinelBytesBefore = readFileSync(externalSentinel);

    prepareE2eDatabase();

    const junctionPath = join(E2E_ROOT, "dangling-junction");
    symlinkSync(externalDir, junctionPath, "junction");

    try {
      // Break the junction by removing the external target while the link stays
      // inside E2E_ROOT. existsSync(dangling-junction) is now false, but the
      // reparse point itself is still present as a directory entry.
      unlinkSync(externalSentinel);
      rmdirSync(externalDir);
      expect(existsSync(externalDir)).toBe(false);

      cleanupE2eDatabase();

      expect(existsSync(E2E_ROOT)).toBe(false);
      expect(existsSync(junctionPath)).toBe(false);
    } finally {
      cleanupSentinel(externalDir, junctionPath);
    }

    // Sentinel bytes were captured before the link was broken; the test never
    // deletes the external target while the link is live, so this is purely a
    // sanity check on the helper.
    expect(sentinelBytesBefore.length).toBeGreaterThan(0);
  });
});

function cleanupSentinel(
  externalDir: string,
  junctionPath: string | undefined,
  symlinkPath?: string,
): void {
  if (junctionPath !== undefined && existsSync(junctionPath)) {
    unlinkSync(junctionPath);
  }
  if (symlinkPath !== undefined && existsSync(symlinkPath)) {
    unlinkSync(symlinkPath);
  }
  if (existsSync(externalDir)) {
    for (const entry of readdirSync(externalDir)) {
      unlinkSync(join(externalDir, entry));
    }
    rmdirSync(externalDir);
  }
}

function probeFileSymlinkCapability(): {
  readonly supported: boolean;
  readonly reason: string;
} {
  const probeDir = mkdtempSync(join(tmpdir(), "e2e-symlink-probe-"));
  const target = join(probeDir, "target.txt");
  const link = join(probeDir, "link.txt");
  writeFileSync(target, "probe");
  try {
    symlinkSync(target, link, "file");
    if (lstatSync(link).isSymbolicLink()) {
      return { supported: true, reason: "" };
    }
    return {
      supported: false,
      reason: "symlink created but lstat did not report isSymbolicLink",
    };
  } catch (error) {
    return {
      supported: false,
      reason: formatError(error),
    };
  } finally {
    if (existsSync(link)) unlinkSync(link);
    if (existsSync(target)) unlinkSync(target);
    if (existsSync(probeDir)) rmdirSync(probeDir);
  }
}

function formatError(error: unknown): string {
  if (error instanceof Error) {
    const code = readErrorCode(error);
    return code !== null ? `${code}: ${error.message}` : error.message;
  }
  return String(error);
}

function readErrorCode(error: Error): string | null {
  // Errors thrown by Node.js fs/network APIs include a `code` string
  // property (e.g. "EPERM", "ENOENT"). The `in` check narrows error to
  // Error & Record<"code", unknown>, so no type assertion is required to
  // access the property and check its runtime type.
  if ("code" in error) {
    const candidate = error.code;
    if (typeof candidate === "string") return candidate;
  }
  return null;
}
