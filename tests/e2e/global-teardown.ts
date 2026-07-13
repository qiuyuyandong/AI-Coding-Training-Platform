import { cleanupE2eDatabase } from "./database";

export default function globalTeardown(): void {
  cleanupE2eDatabase();
}
