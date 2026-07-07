import type Database from "better-sqlite3";
import { openDatabase } from "@/lib/db/client";
import type { Problem } from "@/lib/domain/problem";
import { upsertProblem } from "@/lib/repositories/problems";

const SEEDED_AT = "2026-07-06T00:00:00.000Z";

export const SEEDED_PROBLEMS: readonly Problem[] = [
  {
    id: "prob_lc_two_sum",
    platform: "leetcode",
    externalId: "two-sum",
    title: "Two Sum",
    canonicalUrl: "https://leetcode.com/problems/two-sum/",
    tags: ["Array", "Hash Table"],
    difficulty: "easy",
    status: "not_started",
    contentMode: "metadata_only",
    trainingMode: "deep_link",
    createdAt: SEEDED_AT,
    updatedAt: SEEDED_AT,
  },
  {
    id: "prob_lc_valid_parentheses",
    platform: "leetcode",
    externalId: "valid-parentheses",
    title: "Valid Parentheses",
    canonicalUrl: "https://leetcode.com/problems/valid-parentheses/",
    tags: ["Stack", "String"],
    difficulty: "easy",
    status: "not_started",
    contentMode: "metadata_only",
    trainingMode: "deep_link",
    createdAt: SEEDED_AT,
    updatedAt: SEEDED_AT,
  },
  {
    id: "prob_cf_4a",
    platform: "codeforces",
    externalId: "4A",
    title: "Watermelon",
    canonicalUrl: "https://codeforces.com/problemset/problem/4/A",
    tags: ["math"],
    difficulty: "800",
    status: "not_started",
    contentMode: "metadata_only",
    trainingMode: "deep_link",
    createdAt: SEEDED_AT,
    updatedAt: SEEDED_AT,
  },
  {
    id: "prob_atcoder_abc086_a",
    platform: "atcoder",
    externalId: "abc086_a",
    title: "Product",
    canonicalUrl: "https://atcoder.jp/contests/abc086/tasks/abc086_a",
    tags: ["math"],
    difficulty: "beginner",
    status: "not_started",
    contentMode: "metadata_only",
    trainingMode: "deep_link",
    createdAt: SEEDED_AT,
    updatedAt: SEEDED_AT,
  },
  {
    id: "prob_luogu_p1001",
    platform: "luogu",
    externalId: "P1001",
    title: "A+B Problem",
    canonicalUrl: "https://www.luogu.com.cn/problem/P1001",
    tags: ["入门"],
    difficulty: "beginner",
    status: "not_started",
    contentMode: "metadata_only",
    trainingMode: "deep_link",
    createdAt: SEEDED_AT,
    updatedAt: SEEDED_AT,
  },
];

export function seedDatabase(db: Database.Database): void {
  const transaction = db.transaction(() => {
    for (const problem of SEEDED_PROBLEMS) {
      upsertProblem(db, problem);
    }
  });
  transaction();
}

function isSeedCliEntrypoint(): boolean {
  const scriptPath = process.argv[1]?.replaceAll("\\", "/") ?? "";
  return scriptPath.endsWith("lib/db/seed.ts");
}

if (process.env.NODE_ENV !== "test" && isSeedCliEntrypoint()) {
  const db = openDatabase();
  try {
    seedDatabase(db);
  } finally {
    db.close();
  }
}
