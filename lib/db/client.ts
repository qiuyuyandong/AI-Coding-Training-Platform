import Database from "better-sqlite3";

export function openDatabase() {
  const databasePath = process.env.TRAINING_DB_PATH ?? "training-platform.sqlite";
  return new Database(databasePath);
}