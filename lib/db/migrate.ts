import { openDatabase } from "./client";
import { applyMigrations } from "./migrations";

const db = openDatabase();
try {
  applyMigrations(db);
} finally {
  db.close();
}
