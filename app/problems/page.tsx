import React from "react";
import { ProblemCard } from "@/components/ProblemCard";
import { SeedProblemsButton } from "@/components/SeedProblemsButton";
import { openDatabase } from "@/lib/db/client";
import { listProblems } from "@/lib/repositories/problems";

export const dynamic = "force-dynamic";

export default function ProblemsPage() {
  const db = openDatabase();
  try {
    const problems = listProblems(db);

    return (
      <main className="mx-auto max-w-5xl px-6 py-10">
        <h1 className="text-3xl font-semibold">Unified Problem Catalog</h1>
        <p className="mt-3 text-slate-600">V1 stores metadata and deep links. Full statements stay on original platforms unless licensed or manually entered.</p>
        {problems.length === 0 ? (
          <section className="mt-8 rounded-xl border border-slate-200 bg-white p-6">
            <h2 className="text-lg font-semibold text-slate-950">No local problems yet</h2>
            <SeedProblemsButton />
          </section>
        ) : (
          <section className="mt-8 grid gap-4 md:grid-cols-2">
            {problems.map((problem) => <ProblemCard key={problem.id} problem={problem} />)}
          </section>
        )}
      </main>
    );
  } finally {
    db.close();
  }
}
