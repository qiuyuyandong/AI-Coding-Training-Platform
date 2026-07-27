/**
 * Characterization Navigation Witness (Phase B Task B2/B3).
 *
 * Strictly validates and sanitizes incoming content script messages.
 * Fails closed on malformed/expired/sender validation errors.
 *
 * No raw sender URL/origin/path is ever retained in the witness output.
 * Content message must be constant-only (CHARACTERIZATION_NAVIGATION_OBSERVED).
 * Background synchronously derives sanitized NavigationWitness from trusted sender.
 */

export type NavigationWitness = Readonly<{
  schemaVersion: 1;
  evidenceId: string;
  platform: "nowcoder";
  tier: "E0";
  kind: "navigation_witness";
  receivedAt: string;
  tabId: number;
  frameId: 0;
  documentId: string;
  pageClass: "contest_list" | "contest_problem";
  relativeTimingOrder: number;
}>;

type SenderSnapshot = Readonly<{
  id?: string;
  url?: string;
  origin?: string;
  tab?: Readonly<{ id?: number }>;
  frameId?: number;
  documentId?: string;
}>;

/**
 * Parse and validate an incoming content script message into a sanitized
 * NavigationWitness. Returns undefined for any malformed/expired/rejected input.
 *
 * Background synchronously derives SanitizedNavigationWitness from trusted
 * sender with exact current whitelist — no async storage, no logs of raw fields.
 */
export function readNavigationWitness(
  value: unknown,
  sender: SenderSnapshot,
  extensionId: string,
  receivedAt: string,
): NavigationWitness | undefined {
  // Constant-only message type check
  if (typeof value !== "object" || value === null || Reflect.get(value, "type") !== "CHARACTERIZATION_NAVIGATION_OBSERVED") return undefined;

  // Trusted sender validation: extensionId, origin, frameId
  if (sender.id !== extensionId || sender.origin !== "https://ac.nowcoder.com" || sender.frameId !== 0) return undefined;

  // Tab and documentId extraction
  const tabId = sender.tab?.id;
  if (!Number.isInteger(tabId) || tabId === undefined || tabId < 0) return undefined;
  if (typeof sender.documentId !== "string" || !/^[A-Za-z0-9_-]{1,128}$/.test(sender.documentId)) return undefined;

  // URL sanitization: no username/password/search/hash allowed
  if (typeof sender.url !== "string") return undefined;
  let parsed: URL;
  try { parsed = new URL(sender.url); } catch { return undefined; }
  if (parsed.protocol !== "https:" || parsed.hostname !== "ac.nowcoder.com") return undefined;
  if (parsed.username !== "" || parsed.password !== "" || parsed.search !== "" || parsed.hash !== "") return undefined;

  // Path must match exact known contest structure
  const path = parsed.pathname.replace(/\/$/u, "");
  const pageClass: "contest_list" | "contest_problem" | undefined =
    path === "/acm/contest/18839" ? "contest_list"
    : path === "/acm/contest/18839/1001" ? "contest_problem"
    : undefined;
  if (pageClass === undefined) return undefined;

  // receivedAt must be valid ISO datetime
  if (!/^\d{4}-\d{2}-\d{2}T/.test(receivedAt)) return undefined;

  // Build sanitized witness — no raw URL/origin/path retained
  return Object.freeze({
    schemaVersion: 1,
    evidenceId: `e0_nowcoder_${sender.documentId}_${pageClass}`,
    platform: "nowcoder",
    tier: "E0",
    kind: "navigation_witness",
    receivedAt,
    tabId,
    frameId: 0,
    documentId: sender.documentId,
    pageClass,
    relativeTimingOrder: 0, // B3 state machine computes this separately
  });
}
