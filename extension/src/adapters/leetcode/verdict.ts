/**
 * LeetCode verdict DOM extraction (Phase A audit-equivalent behavior).
 *
 * Behavior is preserved verbatim from the previous locations in
 * `extension/src/platforms.ts`; only the file location and module
 * boundary moved. The shared visibility helper now lives in
 * `extension/src/adapters/dom`.
 */

import { isElementHidden } from "@/extension/src/adapters/dom";
import { normalizeTrustedVerdictText } from "@/lib/capture/verdictTaxonomy";

const LEETCODE_VERDICT_SELECTORS = [
  '[data-e2e-locator="submission-result"]',
  '[data-e2e-locator="console-result"]',
] as const;

/** A verdict plus the real narrow DOM node that produced it. */
export type LeetCodeVerdictObservation = Readonly<{
  readonly verdictText: string;
  readonly surface: Element;
}>;

type LeetCodeLocatorResult = LeetCodeVerdictObservation | "conflict" | null;

/**
 * Extract a LeetCode verdict from its two observed first-party locators.
 *
 * The current result UI renders the same verdict in two visible panes.
 * Joining both strings would produce "TLE\nTLE", which is not a verdict
 * token. Collapse identical values instead. If two visible panes
 * disagree, return no evidence rather than guessing which pane is
 * authoritative.
 */
export function extractLeetCodeVerdictText(pageDocument: Document): string {
  const located = extractLeetCodeLocatorObservation(pageDocument);
  if (located === "conflict") return "";
  if (located !== null) return located.verdictText;

  // The restored problem URL has no verdict locator; its selected
  // submission-detail tab is the fallback evidence surface. That tab
  // briefly renders generic chrome such as "Submission details" before
  // the verdict. Unlike a first-party verdict locator, an unknown
  // detail-tab label is not enough to prove a final failure, so wait
  // for a recognized final verdict.
  return extractLeetCodeDetailVerdictText(pageDocument);
}

/**
 * Extract the same first-party LeetCode verdict while retaining the stable
 * Element reference used by submit-epoch causality.  The node is never
 * serialized or sent outside the content runtime.
 */
export function extractLeetCodeVerdictObservation(
  pageDocument: Document,
): LeetCodeVerdictObservation | null {
  const located = extractLeetCodeLocatorObservation(pageDocument);
  if (located !== null && located !== "conflict") return located;
  if (located === "conflict") return null;
  return extractLeetCodeDetailObservation(pageDocument);
}

/**
 * Extract a LeetCode verdict from the selected submission-detail tab.
 * Returns "" when the tab structure is not the active submission-detail
 * surface, or when the trimmed tab text is not a recognized final
 * verdict. Empty / generic labels ("提交详情", "Submission details")
 * never satisfy the final-verdict gate.
 */
export function extractLeetCodeDetailVerdictText(pageDocument: Document): string {
  return extractLeetCodeDetailObservation(pageDocument)?.verdictText ?? "";
}

function extractLeetCodeLocatorObservation(
  pageDocument: Document,
): LeetCodeLocatorResult {
  const locatorTexts = new Set<string>();
  const matches: Array<{ readonly text: string; readonly element: Element }> = [];
  for (const selector of LEETCODE_VERDICT_SELECTORS) {
    for (const element of Array.from(pageDocument.querySelectorAll(selector))) {
      if (isElementHidden(element)) continue;
      const text = (element.textContent ?? "").trim();
      if (text === "") continue;
      locatorTexts.add(text);
      matches.push({ text, element });
    }
  }
  const text = singleUniqueText(locatorTexts);
  if (text === "") return locatorTexts.size > 0 ? "conflict" : null;
  const match = matches.find((candidate) => candidate.text === text);
  return match === undefined ? null : Object.freeze({ verdictText: text, surface: match.element });
}

function extractLeetCodeDetailObservation(
  pageDocument: Document,
): LeetCodeVerdictObservation | null {
  const detailTabs = pageDocument.querySelectorAll("#submission-detail_tab");
  if (detailTabs.length !== 1) return null;
  const detailTab = detailTabs.item(0);
  if (isElementHidden(detailTab)) return null;
  const selectedTab = detailTab.closest(".flexlayout__tab_button--selected");
  if (selectedTab === null || isElementHidden(selectedTab)) return null;
  if (detailTab.closest("#submission-detail_tabbar_outer") === null) return null;

  const detailTexts = new Set<string>();
  collectVisibleLeafTexts(detailTab, detailTexts);
  const detailText = singleUniqueText(detailTexts);
  if (detailText === "") return null;
  const normalized = normalizeTrustedVerdictText(detailText);
  return normalized === null || normalized === "Other Failure"
    ? null
    : Object.freeze({ verdictText: detailText, surface: detailTab });
}

function singleUniqueText(texts: ReadonlySet<string>): string {
  if (texts.size !== 1) return "";
  const first = texts.values().next();
  return first.done === true ? "" : first.value;
}

function collectVisibleLeafTexts(root: Element, output: Set<string>): void {
  for (const element of [root, ...Array.from(root.querySelectorAll("*"))]) {
    if (isElementHidden(element)) continue;
    const hasTextChild = Array.from(element.children).some(
      (child) => (child.textContent ?? "").trim() !== "",
    );
    if (hasTextChild) continue;
    const text = (element.textContent ?? "").trim();
    if (text !== "") output.add(text);
  }
}
