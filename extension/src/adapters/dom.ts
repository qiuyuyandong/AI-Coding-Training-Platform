/**
 * Shared DOM helpers for adapter extraction.
 *
 * Pure visible-element checks. The element is considered hidden when
 * it or any ancestor carries the HTML `hidden` attribute, an
 * `aria-hidden="true"` attribute, an inline `display: none` or
 * `visibility: hidden|collapse` declaration, or a computed style that
 * makes it visually invisible. No state is captured and no DOM
 * mutation is performed.
 */

export function isElementHidden(element: Element): boolean {
  const view = element.ownerDocument.defaultView;
  let current: Element | null = element;
  while (current !== null) {
    if (current.hasAttribute("hidden")) return true;
    if (current.getAttribute("aria-hidden")?.trim().toLowerCase() === "true") return true;

    const inlineStyle = current.getAttribute("style") ?? "";
    if (/(?:^|;)\s*display\s*:\s*none\s*(?:;|$)/iu.test(inlineStyle)) return true;
    if (/(?:^|;)\s*visibility\s*:\s*(?:hidden|collapse)\s*(?:;|$)/iu.test(inlineStyle)) return true;

    if (view !== null) {
      const computed = view.getComputedStyle(current);
      if (computed.display === "none") return true;
      if (computed.visibility === "hidden" || computed.visibility === "collapse") return true;
    }
    current = current.parentElement;
  }
  return false;
}
