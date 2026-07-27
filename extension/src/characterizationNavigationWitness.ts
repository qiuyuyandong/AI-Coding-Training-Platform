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

export function readNavigationWitness(
  value: unknown,
  sender: SenderSnapshot,
  extensionId: string,
  receivedAt: string,
  sequence: number,
): NavigationWitness | undefined {
  if (typeof value !== "object" || value === null || Reflect.get(value, "type") !== "CHARACTERIZATION_NAVIGATION_OBSERVED") return undefined;
  if (sender.id !== extensionId || sender.origin !== "https://ac.nowcoder.com" || sender.frameId !== 0) return undefined;
  const tabId = sender.tab?.id;
  if (!Number.isInteger(tabId) || tabId === undefined || tabId < 0 || typeof sender.documentId !== "string" || !/^[A-Za-z0-9_-]{1,128}$/.test(sender.documentId)) return undefined;
  if (typeof sender.url !== "string") return undefined;
  let parsed: URL;
  try { parsed = new URL(sender.url); } catch { return undefined; }
  if (parsed.protocol !== "https:" || parsed.hostname !== "ac.nowcoder.com" || parsed.username !== "" || parsed.password !== "" || parsed.search !== "" || parsed.hash !== "") return undefined;
  const path = parsed.pathname.replace(/\/$/u, "");
  const pageClass = path === "/acm/contest/18839" ? "contest_list"
    : path === "/acm/contest/18839/1001" ? "contest_problem" : undefined;
  if (pageClass === undefined || !/^\d{4}-\d{2}-\d{2}T/.test(receivedAt) || !Number.isInteger(sequence) || sequence < 0) return undefined;
  return Object.freeze({ schemaVersion: 1, evidenceId: `e0_nowcoder_${sender.documentId}_${pageClass}`, platform: "nowcoder", tier: "E0", kind: "navigation_witness", receivedAt, tabId, frameId: 0, documentId: sender.documentId, pageClass, relativeTimingOrder: sequence });
}
