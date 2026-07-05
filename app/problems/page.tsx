import { ProblemCard } from "@/components/ProblemCard";
import type { Problem } from "@/lib/domain/problem";

const demoProblems: Problem[] = [
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
    createdAt: "2026-07-05T00:00:00.000Z",
    updatedAt: "2026-07-05T00:00:00.000Z",
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
    createdAt: "2026-07-05T00:00:00.000Z",
    updatedAt: "2026-07-05T00:00:00.000Z",
  },
];

export default function ProblemsPage() {
  return (
    <main className="mx-auto max-w-5xl px-6 py-10">
      <h1 className="text-3xl font-semibold">Unified Problem Catalog</h1>
      <p className="mt-3 text-slate-600">V1 stores metadata and deep links. Full statements stay on original platforms unless licensed or manually entered.</p>
      <section className="mt-8 grid gap-4 md:grid-cols-2">
        {demoProblems.map((problem) => <ProblemCard key={problem.id} problem={problem} />)}
      </section>
    </main>
  );
}