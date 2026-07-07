import { SourceSchema, type Source } from "@/lib/domain/source";

const SOURCE_FIXTURES = [
  {
    id: "src_leetcode",
    platform: "leetcode",
    name: "LeetCode",
    homepage: "https://leetcode.com",
    integrationMode: "extension_capture",
    statementPolicy: "never_cache",
    supportsSubmissionSync: false,
    riskLevel: "high",
    enabled: true,
  },
  {
    id: "src_codeforces",
    platform: "codeforces",
    name: "Codeforces",
    homepage: "https://codeforces.com",
    integrationMode: "metadata_api",
    statementPolicy: "never_cache",
    supportsSubmissionSync: true,
    riskLevel: "low",
    enabled: true,
  },
  {
    id: "src_atcoder",
    platform: "atcoder",
    name: "AtCoder",
    homepage: "https://atcoder.jp",
    integrationMode: "metadata_api",
    statementPolicy: "never_cache",
    supportsSubmissionSync: true,
    riskLevel: "low",
    enabled: true,
  },
  {
    id: "src_nowcoder",
    platform: "nowcoder",
    name: "NowCoder",
    homepage: "https://www.nowcoder.com",
    integrationMode: "extension_capture",
    statementPolicy: "never_cache",
    supportsSubmissionSync: false,
    riskLevel: "medium",
    enabled: false,
  },
  {
    id: "src_luogu",
    platform: "luogu",
    name: "Luogu",
    homepage: "https://www.luogu.com.cn",
    integrationMode: "extension_capture",
    statementPolicy: "never_cache",
    supportsSubmissionSync: false,
    riskLevel: "medium",
    enabled: false,
  },
] satisfies readonly Source[];

export function listSources(): readonly Source[] {
  return SOURCE_FIXTURES.map((source) => SourceSchema.parse(source));
}
