import type { Platform } from "./platforms";

/**
 * Strict submit-button recognition for the OJ capture content script.
 *
 * The capture pipeline must never interpret ordinary text containing "submit"
 * or "提交" as a submission event. Pages whose body, headline, comment, or
 * editor buffer happen to contain those substrings (for example
 * "登录并提交", "提交记录", "Submit Solution Now") would otherwise generate
 * spurious events.
 *
 * To keep the check honest, this module exposes only pure functions that:
 *
 *   1. Restrict candidates to actual interactive controls:
 *      - native `<button>` elements;
 *      - `<input type="submit">` / `<input type="button">`;
 *      - elements with an explicit `[role="button"]` attribute
 *        (we do not silently promote `<a>` or `<div>` to buttons).
 *   2. Walk up the DOM from the actual click target via `Element.closest()`
 *      so that clicking the inner span of a styled button still resolves to
 *      the button.
 *   3. Normalize the displayed label via trim, whitespace collapse and
 *      lowercase, then match it against a per-platform allowlist of exact
 *      labels. Substring matches are explicitly rejected.
 *
 * The Luogu problem page additionally promotes an `<a class="title">` element
 * whose visible label is exactly "提交". This promotion is intentionally
 * scoped to the Luogu platform so we never broadly accept anchors for any
 * other OJ.
 *
 * The allowlist is intentionally small and evidence-backed. We only ship
 * the labels we have actually observed on the supported platforms:
 *
 *   - LeetCode (EN):   "submit"
 *   - LeetCode (CN):   "提交"
 *   - Codeforces (EN): "submit"
 *   - AtCoder (EN/JA): "submit" / "提出"
 *   - NowCoder (CN):   "提交", "保存并提交"
 *   - Luogu (CN):      "提交"
 *
 * Adding a label requires new platform evidence, never a guess.
 */

const SUBMIT_LABELS_BY_PLATFORM: Readonly<Record<Platform, readonly string[]>> = {
  leetcode: ["submit", "提交"],
  codeforces: ["submit"],
  atcoder: ["submit", "提出"],
  nowcoder: ["提交", "保存并提交"],
  luogu: ["提交"],
};

export type SubmitControlResolution =
  | { readonly kind: "control"; readonly control: Element }
  | { readonly kind: "none" };

/**
 * Locate the nearest interactive submit candidate for a click. Returns
 * `none` when the clicked element (or any of its interactive ancestors) is
 * not a button, input[type=submit|button], or explicit role=button.
 */
export function resolveSubmitControl(start: Element | null): SubmitControlResolution {
  if (start === null) return { kind: "none" };
  const control = start.closest(INTERACTIVE_CONTROL_SELECTOR);
  if (control === null) return { kind: "none" };
  return { kind: "control", control };
}

/**
 * Return the normalized visible label for an interactive control. The label
 * is trim+collapse+lowercased; for inputs we read the `value` attribute (the
 * browser-rendered text of `<input type=submit|button>`), otherwise we read
 * `textContent`. An `aria-label` is used as a fallback when the visible text
 * is empty so that icon-only buttons can still be recognized, but only if
 * the aria-label normalizes to an allowed label.
 */
export function normalizeControlLabel(control: Element): string {
  const visible = readVisibleLabel(control);
  if (visible.length > 0) return normalize(visible);
  const aria = control.getAttribute("aria-label");
  if (aria === null) return "";
  return normalize(aria);
}

export function isAllowedSubmitLabel(
  platform: Platform,
  control: Element,
): boolean {
  const normalized = normalizeControlLabel(control);
  if (normalized.length === 0) return false;
  return SUBMIT_LABELS_BY_PLATFORM[platform].includes(normalized);
}

/**
 * Combined gate used by the content script click handler. Returns true iff
 * the click target resolves to an interactive control whose normalized label
 * is exactly an allowed label for `platform`. Substring matches are never
 * accepted.
 *
 * The Luogu problem page exposes its submit control as an anchor
 * `<a class="title"><span class="icon">…</span><span class="text">提交</span></a>`
 * rather than a native button. That promotion is intentionally scoped to
 * the Luogu platform and to anchors carrying exactly the `title` class —
 * other classes or other platforms remain unaffected so the existing
 * false-positive guards hold. When the anchor wraps an inner
 * `<span class="text">`, we read THAT element's text rather than the
 * concatenated anchor text so decorative icons do not corrupt the label.
 */
export function isExactSubmitControl(
  platform: Platform,
  target: Element | null,
): boolean {
  if (target === null) return false;
  const baseResolved = resolveSubmitControl(target);
  let control: Element | null;
  if (baseResolved.kind === "control") {
    control = baseResolved.control;
  } else if (platform === "luogu") {
    // Platform-specific anchor promotion: scoped to `<a class="title">` so
    // we never broaden the interactive-control surface for any other OJ.
    control = target.closest("a.title");
  } else {
    control = null;
  }
  if (control === null) return false;
  if (platform === "luogu" && control.tagName.toLowerCase() === "a") {
    if (control.getAttribute("href") !== "javascript:void 0") return false;
    const textSpan = control.querySelector("span.text");
    if (textSpan !== null) {
      const normalized = normalize(textSpan.textContent ?? "");
      if (normalized.length === 0) return false;
      return SUBMIT_LABELS_BY_PLATFORM.luogu.includes(normalized);
    }
  }
  return isAllowedSubmitLabel(platform, control);
}

// --- internals --------------------------------------------------------------

const INTERACTIVE_CONTROL_SELECTOR = [
  'button',
  'input[type="submit"]',
  'input[type="button"]',
  '[role="button"]',
].join(",");

function readVisibleLabel(control: Element): string {
  if (control instanceof HTMLInputElement) {
    if (control.type !== "submit" && control.type !== "button") return "";
    return control.value;
  }
  return control.textContent ?? "";
}

function normalize(raw: string): string {
  // Collapse all runs of whitespace (including NBSP and zero-width spaces)
  // into a single ASCII space, trim, then lowercase. This guarantees that
  // "  提  交  " is treated the same as "提交", while "提交记录" stays as
  // "提交记录" and therefore cannot accidentally match "提交".
  const collapsed = raw
    .replace(/[\s\u00a0\u200b]+/gu, " ")
    .trim()
    .toLowerCase();
  return collapsed;
}
