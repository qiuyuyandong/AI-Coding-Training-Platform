/**
 * Luogu record verdict DOM extraction (Phase A audit-equivalent
 * behavior).
 *
 * Behavior is preserved verbatim from the previous location in
 * `extension/src/platforms.ts`; only the file location and module
 * boundary moved.
 */

/**
 * Luogu record verdict extractor.
 *
 * Locates every leaf whose trimmed textContent is exactly the label
 * 评测状态, then reads the enclosing row's full text. The leaf must be a
 * genuine text node (no children) so comment boilerplate or arbitrary
 * heading copy cannot satisfy the matcher. We collect ALL qualifying
 * rows so a multi-row verdict table is handled honestly:
 *
 *   - Zero rows                  -> empty string -> `null` verdict.
 *   - One row                    -> use that row text.
 *   - Multiple rows, all identical -> collapse and use the single row text.
 *   - Multiple rows, conflicting   -> empty string -> `null` verdict
 *     (we never silently pick one of two divergent rows).
 */
export function extractLuoguRecordRowText(pageDocument: Document): string {
  const candidates = Array.from(pageDocument.querySelectorAll("span, em, b, i, p, div, td, th, li"))
    .filter((el) => el.children.length === 0);
  const uniqueRowTexts = new Set<string>();
  for (const candidate of candidates) {
    const text = (candidate.textContent ?? "").trim();
    if (text !== "评测状态") continue;
    const row = candidate.closest("div, tr, li, section");
    if (row === null) continue;
    const rowText = (row.textContent ?? "").trim();
    if (rowText === "") continue;
    uniqueRowTexts.add(rowText);
  }
  // Collapse identical rows. Conflicting rows yield no candidate text.
  if (uniqueRowTexts.size !== 1) return "";
  const first = uniqueRowTexts.values().next();
  return first.done === true ? "" : first.value;
}
