const NOWCODER_FINAL_LABELS: ReadonlyArray<readonly [string, string]> = [
  ["\u7b54\u6848\u6b63\u786e", "Accepted"],
  ["\u7b54\u6848\u9519\u8bef", "Wrong Answer"],
  ["\u7f16\u8bd1\u9519\u8bef", "Compile Error"],
  ["\u8fd0\u884c\u9519\u8bef", "Runtime Error"],
  ["\u6267\u884c\u51fa\u9519", "Runtime Error"],
  ["\u65f6\u95f4\u8d85\u9650", "Time Limit Exceeded"],
  ["\u5185\u5b58\u8d85\u9650", "Memory Limit Exceeded"],
  ["\u8f93\u51fa\u8d85\u9650", "Output Limit Exceeded"],
  ["\u90e8\u5206\u901a\u8fc7", "Partially Accepted"],
];

export function extractNowCoderVerdictText(pageDocument: Document): string {
  const candidates = Array.from(pageDocument.querySelectorAll(".coder-cont-legend"))
    .filter(isVisible)
    .flatMap((element) => NOWCODER_FINAL_LABELS
      .filter(([label]) => element.textContent?.includes(label) === true)
      .map(([, verdict]) => verdict));
  const unique = [...new Set(candidates)];
  return unique.length === 1 ? unique[0] ?? "" : "";
}

function isVisible(element: Element): boolean {
  if (!(element instanceof HTMLElement)) return false;
  if (element.hidden || element.closest("[hidden], [aria-hidden='true']") !== null) return false;
  const style = element.ownerDocument.defaultView?.getComputedStyle(element);
  if (style?.display === "none" || style?.visibility === "hidden") return false;
  return true;
}
