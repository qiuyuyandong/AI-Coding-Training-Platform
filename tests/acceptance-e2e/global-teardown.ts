import { cleanupAcceptanceRoot } from "./database";

export default function globalTeardown(): void {
  cleanupAcceptanceRoot();
}
