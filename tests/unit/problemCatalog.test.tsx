import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { openDatabase } from "@/lib/db/client";
import { listProblems } from "@/lib/repositories/problems";

let tempDir = "";

beforeEach(() => {
  tempDir = mkdtempSync(join(tmpdir(), "problem-catalog-"));
  process.env.TRAINING_DB_PATH = join(tempDir, "test.sqlite");
  const db = openDatabase();
  try {
    applyMigrations(db);
  } finally {
    db.close();
  }
});

afterEach(() => {
  delete process.env.TRAINING_DB_PATH;
  rmSync(tempDir, { recursive: true, force: true });
});

function applyMigrations(db: Database.Database): void {
  const migrations = ["0001_initial.sql", "0002_attempt_capture_source.sql"];
  for (const name of migrations) {
    const sql = readFileSync(join(process.cwd(), "lib", "db", "migrations", name), "utf8");
    db.exec(sql);
  }
}

describe("problem catalog seed", () => {
  it("seeds starter problems idempotently", async () => {
    const { seedDatabase } = await import("@/lib/db/seed");
    const db = openDatabase();
    try {
      seedDatabase(db);
      seedDatabase(db);

      const problems = listProblems(db);

      expect(problems.length).toBeGreaterThanOrEqual(5);
      expect(problems.map((problem) => problem.externalId)).toContain("two-sum");
      expect(new Set(problems.map((problem) => `${problem.platform}:${problem.externalId}`)).size).toBe(problems.length);
    } finally {
      db.close();
    }
  });

  it("preserves local problem status when seed is rerun", async () => {
    const { seedDatabase } = await import("@/lib/db/seed");
    const db = openDatabase();
    try {
      seedDatabase(db);
      db.prepare("UPDATE problems SET status = 'solved' WHERE platform = 'leetcode' AND external_id = 'two-sum'").run();

      seedDatabase(db);

      const problem = listProblems(db).find((item) => item.platform === "leetcode" && item.externalId === "two-sum");
      expect(problem?.status).toBe("solved");
    } finally {
      db.close();
    }
  });

  it("normalizes catalog identity and canonical URL on write", async () => {
    const { upsertProblem } = await import("@/lib/repositories/problems");
    const db = openDatabase();
    try {
      upsertProblem(db, {
        id: "prob_normalized",
        platform: "leetcode",
        externalId: "/TWO-SUM/",
        title: "Two Sum",
        canonicalUrl: "https://leetcode.com/problems/two-sum/description/?env=daily",
        tags: [],
        difficulty: "easy",
        status: "not_started",
        contentMode: "metadata_only",
        trainingMode: "deep_link",
        createdAt: "2026-07-14T00:00:00.000Z",
        updatedAt: "2026-07-14T00:00:00.000Z",
      });

      expect(listProblems(db)[0]).toMatchObject({
        externalId: "two-sum",
        canonicalUrl: "https://leetcode.com/problems/two-sum/",
      });
    } finally {
      db.close();
    }
  });
});

describe("catalog APIs", () => {
  it("returns seeded problems from /api/problems", async () => {
    const { seedDatabase } = await import("@/lib/db/seed");
    const db = openDatabase();
    try {
      seedDatabase(db);
    } finally {
      db.close();
    }
    const { GET } = await import("@/app/api/problems/route");

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.problems.length).toBeGreaterThanOrEqual(5);
    expect(body.problems[0]).toMatchObject({ contentMode: "metadata_only", trainingMode: "deep_link" });
  });

  it("seeds starter problems from /api/problems/seed", async () => {
    const { POST } = await import("@/app/api/problems/seed/route");

    const response = await POST();
    const body = await response.json();
    const db = openDatabase();
    try {
      const problems = listProblems(db);

      expect(response.status).toBe(200);
      expect(body).toMatchObject({ ok: true, count: 5 });
      expect(problems).toHaveLength(5);
      expect(problems.map((problem) => problem.externalId)).toContain("two-sum");
    } finally {
      db.close();
    }
  });

  it("keeps /api/problems/seed idempotent", async () => {
    const { POST } = await import("@/app/api/problems/seed/route");

    await POST();
    const response = await POST();
    const body = await response.json();
    const db = openDatabase();
    try {
      const problems = listProblems(db);

      expect(response.status).toBe(200);
      expect(body).toMatchObject({ ok: true, count: 5 });
      expect(problems).toHaveLength(5);
    } finally {
      db.close();
    }
  });

  it("returns validated source registry from /api/sources", async () => {
    const { GET } = await import("@/app/api/sources/route");

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.sources.map((source: { readonly platform: string }) => source.platform)).toContain("leetcode");
  });
});

describe("ProblemsPage", () => {
  it("renders an empty state when the local catalog is not seeded", async () => {
    const { default: ProblemsPage } = await import("@/app/problems/page");

    const markup = renderToStaticMarkup(await ProblemsPage());

    expect(markup).toContain("Seed starter catalog");
  });

  it("renders seeded local problems", async () => {
    const { seedDatabase } = await import("@/lib/db/seed");
    const db = openDatabase();
    try {
      seedDatabase(db);
    } finally {
      db.close();
    }
    const { default: ProblemsPage } = await import("@/app/problems/page");

    const markup = renderToStaticMarkup(await ProblemsPage());

    expect(markup).toContain("Two Sum");
    expect(markup).toContain("Start Training");
  });
});

describe("SeedProblemsButton", () => {
  it("posts to the seed API and reports success", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () => new Response(JSON.stringify({ ok: true, count: 5 }), { status: 200 });
    const { SeedProblemsButton } = await import("@/components/SeedProblemsButton");
    let seeded = false;
    try {
      render(<SeedProblemsButton onSeeded={() => { seeded = true; }} />);

      fireEvent.click(screen.getByRole("button", { name: "Seed starter catalog" }));

      await waitFor(() => expect(screen.getByText("Catalog seeded. Reloading problems..." )).toBeTruthy());
      expect(seeded).toBe(true);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("shows an error when seeding fails", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () => new Response(JSON.stringify({ ok: false, error: "Seed failed" }), { status: 500 });
    const { SeedProblemsButton } = await import("@/components/SeedProblemsButton");
    try {
      render(<SeedProblemsButton />);

      fireEvent.click(screen.getByRole("button", { name: "Seed starter catalog" }));

      await waitFor(() => expect(screen.getByText("Seed failed").className).toContain("text-red-700"));
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
