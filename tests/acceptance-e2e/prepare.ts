import { join } from "node:path";
import Database from "better-sqlite3";
import { importPackage } from "@/lib/curriculum/importPackage";
import { applyMigrations } from "@/lib/db/migrations";
import { LOCAL_DEFAULT_LEARNER_ID } from "@/lib/domain/learner";
import { getOrCreateLocalProfile } from "@/lib/repositories/learnerProfiles";
import { createDailySnapshot, createLearningPlan, insertPlanItem } from "@/lib/repositories/plans";
import { serializeLearningPlanSnapshot } from "@/lib/services/planSnapshot";
import { rotateLocalCaptureInstallation } from "@/lib/vault/captureInstallation";
import { ACCEPTANCE_DB_PATH, ACCEPTANCE_VAULT_CONFIG_DIR, resetAcceptanceRoot } from "./database";

const NOW = "2026-09-07T00:00:00.000Z";

resetAcceptanceRoot();
const db = new Database(ACCEPTANCE_DB_PATH);
try {
  db.pragma("foreign_keys = ON");
  applyMigrations(db, { now: () => NOW });
  const imported = importPackage(db, join(process.cwd(), "content", "tracks", "software-development-foundations-v1"), { now: () => NOW });
  if (!imported.ok) throw new Error(`Curriculum import failed: ${JSON.stringify(imported.errors)}`);
  getOrCreateLocalProfile(db, { now: () => NOW });
  const item = db.prepare<[], { readonly node_id: string; readonly task_id: string }>(`
    SELECT mapping.node_id, mapping.practice_task_id AS task_id
    FROM node_practice_mappings mapping
    JOIN knowledge_nodes node ON node.id = mapping.node_id
    WHERE node.status = 'published'
    ORDER BY node.order_index ASC, mapping.sort_order ASC LIMIT 1
  `).get();
  if (item === undefined) throw new Error("Acceptance fixture has no mapped practice task");
  const plan = createLearningPlan(db, LOCAL_DEFAULT_LEARNER_ID, "offline-acceptance-fixture-1", serializeLearningPlanSnapshot({}), { now: () => NOW });
  const snapshot = createDailySnapshot(db, plan.id, "2026-09-07", 30, "learn", "offline-acceptance-fixture-1", null, { now: () => NOW });
  insertPlanItem(db, snapshot.id, item.task_id, item.node_id, "primary", 0, JSON.stringify(["acceptance_fixture"]), { now: () => NOW });
  rotateLocalCaptureInstallation({
    installationId: "installation_77777777-7777-4777-8777-777777777777",
    capability: `capture_${"A".repeat(43)}`,
  }, { configDirectory: ACCEPTANCE_VAULT_CONFIG_DIR, now: () => NOW });
} finally {
  db.close();
}
