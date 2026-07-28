/**
 * Platform adapter registry (Phase A audit-equivalent behavior).
 *
 * Owns the single source of truth for `PLATFORM_ADAPTERS`. Adapters
 * preserve existing DOM-evidence selectors and extractors; the V4
 * network status stays "uncharacterized" for every platform until
 * real OJ characterization runs in a later phase. No adapter carries
 * a `networkPolicy` yet.
 */

import {
  type Platform,
  type PlatformAdapterRecord,
} from "@/extension/src/adapters/contract";
import { extractLeetCodeVerdictText } from "@/extension/src/adapters/leetcode/verdict";
import { extractLuoguRecordRowText } from "@/extension/src/adapters/luogu/verdict";
import {
  NOWCODER_NETWORK_ADAPTER_VERSION,
  NOWCODER_NETWORK_POLICY,
} from "@/extension/src/adapters/nowcoder/network";
import { extractNowCoderVerdictText } from "@/extension/src/adapters/nowcoder/verdict";

export const PLATFORM_ADAPTERS = {
  leetcode: {
    platform: "leetcode",
    label: "LeetCode",
    status: "experimental",
    v4NetworkStatus: "uncharacterized",
    version: "v4-contract-1",
    hostOwnership: ["leetcode.com", "leetcode.cn"],
    // The legacy authenticated fixture uses submission-result. The
    // current problem-scoped result page uses duplicate console-result
    // nodes for its two synchronized panes. The extractor accepts
    // either locator, collapses identical visible values, and rejects
    // conflicting panes.
    selectors: ['[data-e2e-locator="submission-result"]'],
    extractor: extractLeetCodeVerdictText,
  },
  codeforces: {
    platform: "codeforces",
    label: "Codeforces",
    status: "experimental",
    v4NetworkStatus: "uncharacterized",
    version: "v4-contract-1",
    hostOwnership: ["codeforces.com"],
    selectors: [".status-cell", "td.status-small", ".verdict-accepted"],
  },
  atcoder: {
    platform: "atcoder",
    label: "AtCoder",
    status: "production",
    v4NetworkStatus: "uncharacterized",
    version: "v4-contract-1",
    hostOwnership: ["atcoder.jp"],
    selectors: ["#judge-status"],
  },
  nowcoder: {
    platform: "nowcoder",
    label: "NowCoder",
    status: "experimental",
    v4NetworkStatus: "experimental",
    version: NOWCODER_NETWORK_ADAPTER_VERSION,
    hostOwnership: ["www.nowcoder.com", "ac.nowcoder.com"],
    // The public view-submission page wraps the verdict under
    // `<div class="coder-cont-legend">运行状态:<span class="font-green">答案正确</span></div>`.
    // The previously registered `.result`, `.submission-result` and
    // `.judge-result` selectors matched zero observed nodes and have
    // been removed to keep the registry evidence-backed.
    selectors: [".coder-cont-legend"],
    extractor: extractNowCoderVerdictText,
    networkPolicy: NOWCODER_NETWORK_POLICY,
  },
  luogu: {
    platform: "luogu",
    label: "Luogu",
    status: "experimental",
    v4NetworkStatus: "uncharacterized",
    version: "v4-contract-1",
    hostOwnership: ["www.luogu.com.cn"],
    // Luogu records expose verdict text inside an unlabeled semantic
    // row keyed by the exact label 评测状态 and a sibling
    // `<span style="color: rgb(82, 196, 26)">`. We deliberately do
    // NOT register CSS selectors here: the previously recorded
    // `.status`, `.record-status`, `.submission-status` matched zero
    // observed nodes and would have produced false positives on dev
    // pages. The semantic extractor below walks every node, requires
    // a uniquely labelled 评测状态 leaf, and reads the entire row text.
    // Empty rows produce empty candidate text, which forces
    // `verdictFromText` to return null rather than guessing.
    selectors: [],
    extractor: extractLuoguRecordRowText,
  },
} as const satisfies Record<Platform, PlatformAdapterRecord>;
