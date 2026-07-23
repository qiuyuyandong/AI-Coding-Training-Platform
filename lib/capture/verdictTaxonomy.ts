export const FINAL_CAPTURE_VERDICTS = [
  "Accepted",
  "Partially Accepted",
  "Time Limit Exceeded",
  "Memory Limit Exceeded",
  "Output Limit Exceeded",
  "Idleness Limit Exceeded",
  "Runtime Error",
  "Wrong Answer",
  "Presentation Error",
  "Compile Error",
  "Judge Error",
  "Other Failure",
] as const;

export type FinalCaptureVerdict = typeof FINAL_CAPTURE_VERDICTS[number];

const FINAL_CAPTURE_VERDICT_SET: ReadonlySet<string> = new Set(FINAL_CAPTURE_VERDICTS);

/**
 * Normalize text read from an adapter's trusted verdict region.
 *
 * This function never searches a page by itself. The platform adapter must
 * first narrow the evidence to a result/status element. Once that trust
 * boundary has been crossed, known English/Chinese labels and OJ codes map to
 * a stable product taxonomy. A non-empty, non-pending label falls back to
 * `Other Failure`, so a harmless wording change cannot leave a real submit
 * intent waiting forever.
 */
export function normalizeTrustedVerdictText(text: string): FinalCaptureVerdict | null {
  const candidate = stripStatusLabel(text);
  if (candidate === "") return null;
  const normalized = candidate.toLowerCase();

  if (includesAny(normalized, ["partially accepted", "partial accepted"])
    || includesAny(candidate, ["部分通过", "部分正确"])) {
    return "Partially Accepted";
  }
  if (includesAny(normalized, ["time limit exceeded", "time limit"])
    || hasVerdictToken(normalized, "tle")
    || includesAny(candidate, ["运行超时", "超出时间限制", "时间超限", "时间限制超出"])) {
    return "Time Limit Exceeded";
  }
  if (includesAny(normalized, ["memory limit exceeded", "memory limit"])
    || hasVerdictToken(normalized, "mle")
    || includesAny(candidate, ["内存超限", "超出内存限制", "内存限制超出"])) {
    return "Memory Limit Exceeded";
  }
  if (normalized.includes("output limit exceeded")
    || hasVerdictToken(normalized, "ole")
    || includesAny(candidate, ["输出超限", "超出输出限制", "输出限制超出"])) {
    return "Output Limit Exceeded";
  }
  if (normalized.includes("idleness limit exceeded")
    || hasVerdictToken(normalized, "ile")
    || includesAny(candidate, ["空闲超限", "空转超限"])) {
    return "Idleness Limit Exceeded";
  }
  if (normalized.includes("runtime error")
    || hasVerdictToken(normalized, "re")
    || includesAny(candidate, ["运行错误", "运行出错", "执行错误", "执行出错", "段错误"])) {
    return "Runtime Error";
  }
  if (normalized.includes("presentation error")
    || hasVerdictToken(normalized, "pe")
    || includesAny(candidate, ["格式错误", "输出格式错误"])) {
    return "Presentation Error";
  }
  if (normalized.includes("wrong answer")
    || hasVerdictToken(normalized, "wa")
    || includesAny(candidate, ["答案错误", "解答错误", "错误答案", "答案不正确"])) {
    return "Wrong Answer";
  }
  if (includesAny(normalized, ["compile error", "compilation error", "compilation failed"])
    || hasVerdictToken(normalized, "ce")
    || includesAny(candidate, ["编译错误", "编译失败"])) {
    return "Compile Error";
  }
  if (includesAny(normalized, ["judge error", "system error", "internal error"])
    || hasAnyVerdictToken(normalized, ["ie", "je", "se"])
    || includesAny(candidate, ["评测错误", "判题错误", "系统错误", "内部错误"])) {
    return "Judge Error";
  }

  const acceptedByChineseToken = candidate.includes("答案正确")
    || containsStandaloneChineseToken(candidate, "通过");
  if (normalized.includes("accepted") || hasVerdictToken(normalized, "ac") || acceptedByChineseToken) {
    return "Accepted";
  }

  if (isPendingVerdict(normalized, candidate)
    || isPlaceholder(candidate)
    || isNonVerdictNarrative(candidate)) return null;
  return "Other Failure";
}

export function isFinalCaptureVerdict(value: string): value is FinalCaptureVerdict {
  return FINAL_CAPTURE_VERDICT_SET.has(value);
}

export function classifyFinalCaptureVerdict(
  verdict: string,
): "passed" | "failed" | "partial" | "stuck" {
  if (verdict === "Accepted") return "passed";
  if (verdict === "Partially Accepted"
    || verdict === "Time Limit Exceeded"
    || verdict === "Memory Limit Exceeded"
    || verdict === "Output Limit Exceeded"
    || verdict === "Idleness Limit Exceeded"
    || verdict === "Runtime Error") {
    return "partial";
  }
  if (verdict === "Judge Error") return "stuck";
  return "failed";
}

function stripStatusLabel(text: string): string {
  return text
    .replace(/[\s\u00a0\u200b]+/gu, " ")
    .trim()
    .replace(/^(?:运行状态|评测状态|判题状态|提交结果|运行结果|结果)\s*[:：]?\s*/u, "")
    .trim();
}

function includesAny(text: string, values: readonly string[]): boolean {
  return values.some((value) => text.includes(value));
}

function hasAnyVerdictToken(text: string, tokens: readonly string[]): boolean {
  return tokens.some((token) => hasVerdictToken(text, token));
}

function hasVerdictToken(text: string, token: string): boolean {
  return text.split(/[^a-z]+/u).includes(token);
}

function isPendingVerdict(normalized: string, original: string): boolean {
  return hasAnyVerdictToken(normalized, ["wj", "judging", "pending", "waiting", "running", "queue", "queued", "queueing", "compiling", "testing", "submitted"])
    || includesAny(original, ["等待中", "等待判题", "判题中", "评测中", "运行中", "排队中", "提交中", "已提交", "编译中", "测试中"]);
}

function isPlaceholder(text: string): boolean {
  const normalized = text.toLowerCase();
  return normalized === "-"
    || normalized === "—"
    || normalized === "n/a"
    || normalized === "unknown"
    || text === "暂无"
    || text === "代号";
}

function isNonVerdictNarrative(text: string): boolean {
  return text.includes("全部通过")
    || text === "本题通过"
    || text.includes("通过的题目");
}

function containsStandaloneChineseToken(text: string, token: string): boolean {
  const pattern = new RegExp(`(?<!\\S)${token}(?!\\S)`, "u");
  return pattern.test(text);
}
