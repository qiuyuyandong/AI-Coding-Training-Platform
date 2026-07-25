/**
 * Phase A Task A10 — Global setup for the extension E2E lane.
 *
 * Creates a fresh disposable database file under `.tmp/capture-v4-full-chain-*`,
 * runs migrations against it, sets `TRAINING_DB_PATH` so the Next.js dev
 * server spawned by Playwright's webServer config uses the disposable DB,
 * and persists the DB path so workers can read it in
 * `beforeEach`/`afterEach` for count assertions.
 */

import { writeFileSync } from "node:fs";
import { resolve } from "node:path";

import { createDisposableDatabase, runMigrations } from "./database";

const SERVER_DB_PATH_FILE = resolve(process.cwd(), ".tmp", "server-db-path.txt");

export default async function globalSetup(): Promise<void> {
  const { dbPath } = createDisposableDatabase();
  runMigrations(dbPath);
  process.env.TRAINING_DB_PATH = dbPath;
  writeFileSync(SERVER_DB_PATH_FILE, dbPath, "utf8");
}