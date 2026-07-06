type Platform = "leetcode" | "nowcoder" | "luogu" | "codeforces" | "atcoder";

export type DetectableLocation = Pick<Location, "href" | "hostname" | "pathname">;

export type DetectedProblem = {
  platform: Platform;
  problemExternalId: string;
  problemTitle: string;
  canonicalUrl: string;
};

export function detectProblemFromLocation(location: DetectableLocation, documentTitle: string): DetectedProblem | null {
  const url = location.href;
  const title = documentTitle.replace(/ - .*$/, "").trim();

  if (location.hostname.includes("leetcode.com") && location.pathname.startsWith("/problems/")) {
    return { platform: "leetcode", problemExternalId: location.pathname.split("/")[2] ?? title, problemTitle: title, canonicalUrl: url };
  }

  if (location.hostname.includes("codeforces.com") && location.pathname.includes("/problemset/problem/")) {
    const parts = location.pathname.split("/");
    return { platform: "codeforces", problemExternalId: `${parts.at(-2) ?? ""}${parts.at(-1) ?? ""}`, problemTitle: title, canonicalUrl: url };
  }

  if (location.hostname.includes("atcoder.jp") && location.pathname.includes("/tasks/")) {
    return { platform: "atcoder", problemExternalId: location.pathname.split("/").at(-1) ?? title, problemTitle: title, canonicalUrl: url };
  }

  if (location.hostname.includes("nowcoder.com")) {
    return { platform: "nowcoder", problemExternalId: location.pathname, problemTitle: title, canonicalUrl: url };
  }

  if (location.hostname.includes("luogu.com.cn")) {
    return { platform: "luogu", problemExternalId: location.pathname, problemTitle: title, canonicalUrl: url };
  }

  return null;
}
