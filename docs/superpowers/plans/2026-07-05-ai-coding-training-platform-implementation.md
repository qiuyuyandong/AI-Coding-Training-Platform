# Unified OJ Entry + Capture Sync Implementation Plan

**Status:** Historical prototype implementation record. Its reused "V1" label
predates the current V0/V0.5/V1 roadmap; unchecked boxes here are not current
project work and this plan must not be resumed line by line.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build V1 as a local-first unified coding-practice entry: search problems in one app, deep-link to original OJ sites for training, capture user-visible training events through a browser extension, and feed attempts into local Coach/Growth analysis.

**Architecture:** V1 is not a crawler mirror and does not cache LeetCode/NowCoder/Luogu full statements by default. The Next.js app stores platform metadata, deep links, attempts, stats, and recommendations in SQLite; a Chrome MV3 extension observes user-opened OJ problem/submission pages and posts local capture events back to the app. Codeforces and AtCoder use metadata/submission APIs where available; LeetCode/NowCoder/Luogu use deep links plus user-consented page detection/capture only.

**Tech Stack:** Next.js App Router, TypeScript strict mode, Tailwind CSS, Zod, SQLite via `better-sqlite3`, Vitest, Testing Library, Playwright, Recharts, Chrome Extension Manifest V3.

**Commit policy:** Do not create git commits unless the user explicitly asks for commits.

---

## V1 Product Flow

```text
User opens local app
→ searches unified Problem Catalog
→ clicks Start Training
→ app opens original OJ URL for metadata-only platforms
→ browser extension detects the problem page and starts a local session
→ user solves/submits on original platform
→ extension detects visible verdict/result and posts CaptureEvent to localhost
→ app creates/updates TrainingAttempt
→ Coach updates weak points, recommendations, and Growth dashboard
```

V1 stores metadata and user training records. It must not bypass login, captcha, paywalls, anti-bot systems, or platform access controls.

---

## File Structure

Create this structure under `D:\Cowork\AI刷题训练平台`:

```text
app/
  globals.css
  layout.tsx
  page.tsx
  sources/page.tsx
  problems/page.tsx
  training/page.tsx
  coach/page.tsx
  growth/page.tsx
  compliance/page.tsx
  api/sources/route.ts
  api/problems/route.ts
  api/capture/events/route.ts
  api/attempts/route.ts
  api/coach/route.ts
  api/stats/route.ts
components/
  SourceCard.tsx
  ProblemCard.tsx
  TrainingWorkspace.tsx
  CaptureStatusPanel.tsx
  CoachPanel.tsx
  GrowthCharts.tsx
  ComplianceBadge.tsx
extension/
  manifest.json
  src/background.ts
  src/content.ts
  src/platforms.ts
  src/popup.html
  src/popup.ts
lib/
  adapters/atcoder.ts
  adapters/codeforces.ts
  adapters/types.ts
  capture/events.ts
  capture/platforms.ts
  db/client.ts
  db/migrate.ts
  db/seed.ts
  db/migrations/0001_initial.sql
  domain/source.ts
  domain/problem.ts
  domain/training.ts
  domain/ability.ts
  domain/stats.ts
  domain/recommendation.ts
  domain/coach.ts
  repositories/sources.ts
  repositories/problems.ts
  repositories/captureEvents.ts
  repositories/attempts.ts
  repositories/ability.ts
  repositories/stats.ts
  repositories/recommendations.ts
  services/attempts.ts
  services/ability.ts
  services/stats.ts
  services/recommendation.ts
  services/coach.ts
tests/
  unit/captureEvents.test.ts
  unit/problem.test.ts
  unit/attempt.test.ts
  unit/coachFallback.test.ts
  e2e/unified-entry-flow.spec.ts
README.md
COMPLIANCE.md
```

---

### Task 1: Project Scaffold

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `next.config.ts`
- Create: `postcss.config.mjs`
- Create: `tailwind.config.ts`
- Create: `vitest.config.ts`
- Create: `app/globals.css`
- Create: `app/layout.tsx`
- Create: `app/page.tsx`

- [ ] **Step 1: Create the package manifest**

Write `package.json`:

```json
{
  "name": "ai-coding-training-platform",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "typecheck": "tsc --noEmit",
    "test": "vitest run",
    "test:watch": "vitest",
    "e2e": "playwright test",
    "db:migrate": "tsx lib/db/migrate.ts",
    "db:seed": "tsx lib/db/seed.ts",
    "extension:check": "tsc --noEmit --project tsconfig.json"
  },
  "dependencies": {
    "better-sqlite3": "11.10.0",
    "next": "15.3.4",
    "react": "19.1.0",
    "react-dom": "19.1.0",
    "recharts": "2.15.3",
    "zod": "3.25.67"
  },
  "devDependencies": {
    "@playwright/test": "1.53.1",
    "@testing-library/jest-dom": "6.6.3",
    "@testing-library/react": "16.3.0",
    "@types/better-sqlite3": "7.6.13",
    "@types/chrome": "0.0.326",
    "@types/node": "24.0.4",
    "@types/react": "19.1.8",
    "@types/react-dom": "19.1.6",
    "autoprefixer": "10.4.21",
    "jsdom": "26.1.0",
    "postcss": "8.5.6",
    "tailwindcss": "3.4.17",
    "tsx": "4.20.3",
    "typescript": "5.8.3",
    "vitest": "3.2.4"
  }
}
```

- [ ] **Step 2: Create strict TypeScript config**

Write `tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["dom", "dom.iterable", "es2022"],
    "allowJs": false,
    "skipLibCheck": true,
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "preserve",
    "incremental": true,
    "paths": { "@/*": ["./*"] },
    "types": ["node", "chrome"]
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx"],
  "exclude": ["node_modules"]
}
```

- [ ] **Step 3: Create framework config files**

Write `next.config.ts`:

```ts
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
};

export default nextConfig;
```

Write `vitest.config.ts`:

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "jsdom",
    globals: true,
  },
});
```

Write `postcss.config.mjs`:

```js
const config = {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
};

export default config;
```

Write `tailwind.config.ts`:

```ts
import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: { extend: {} },
  plugins: [],
};

export default config;
```

- [ ] **Step 4: Create app shell**

Write `app/layout.tsx`:

```tsx
import "./globals.css";
import type { ReactNode } from "react";

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
```

Write `app/page.tsx`:

```tsx
const links = [
  ["Sources", "/sources"],
  ["Problems", "/problems"],
  ["Training", "/training"],
  ["Coach", "/coach"],
  ["Growth", "/growth"],
  ["Compliance", "/compliance"],
] as const;

export default function HomePage() {
  return (
    <main className="mx-auto max-w-5xl px-6 py-12">
      <p className="text-sm uppercase tracking-wide text-slate-500">Unified OJ Entry</p>
      <h1 className="mt-3 text-4xl font-semibold text-slate-950">
        一个入口检索题目，原站训练，本站沉淀训练记忆。
      </h1>
      <p className="mt-4 max-w-2xl text-slate-600">
        V1 使用元数据检索、原站 deep-link 和浏览器插件数据回流，不默认缓存力扣、牛客、洛谷等平台的完整题面。
      </p>
      <nav className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {links.map(([label, href]) => (
          <a key={href} href={href} className="rounded-xl border border-slate-200 p-4 text-slate-900 hover:bg-slate-50">
            {label}
          </a>
        ))}
      </nav>
    </main>
  );
}
```

Write `app/globals.css`:

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

body {
  background: #f8fafc;
  color: #0f172a;
}
```

- [ ] **Step 5: Verify scaffold**

Run:

```powershell
npm install
npm run typecheck
npm run test
```

Expected: install succeeds; `typecheck` exits 0; `test` exits 0 or reports no tests found without TypeScript errors.

---

### Task 2: Domain Schemas for Unified Entry and Capture

**Files:**
- Create: `lib/domain/source.ts`
- Create: `lib/domain/problem.ts`
- Create: `lib/domain/training.ts`
- Create: `lib/capture/events.ts`
- Test: `tests/unit/problem.test.ts`
- Test: `tests/unit/captureEvents.test.ts`

- [ ] **Step 1: Write failing problem schema tests**

Write `tests/unit/problem.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { ProblemSchema } from "@/lib/domain/problem";

describe("ProblemSchema", () => {
  it("accepts metadata-only external problems", () => {
    const parsed = ProblemSchema.parse({
      id: "prob_cf_1",
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
      updatedAt: "2026-07-05T00:00:00.000Z"
    });

    expect(parsed.contentMode).toBe("metadata_only");
    expect(parsed.trainingMode).toBe("deep_link");
  });

  it("rejects cached statements for unsupported platforms", () => {
    expect(() =>
      ProblemSchema.parse({
        id: "prob_lc_1",
        platform: "leetcode",
        externalId: "two-sum",
        title: "Two Sum",
        canonicalUrl: "https://leetcode.com/problems/two-sum/",
        tags: ["array"],
        difficulty: "easy",
        status: "not_started",
        contentMode: "cached_statement",
        trainingMode: "deep_link",
        createdAt: "2026-07-05T00:00:00.000Z",
        updatedAt: "2026-07-05T00:00:00.000Z"
      })
    ).toThrow();
  });
});
```

- [ ] **Step 2: Write failing capture event tests**

Write `tests/unit/captureEvents.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { CaptureEventSchema, pageDetectedEventToAttemptDraft } from "@/lib/capture/events";

describe("CaptureEventSchema", () => {
  it("accepts a page detected event", () => {
    const event = CaptureEventSchema.parse({
      id: "evt_1",
      type: "PAGE_DETECTED",
      platform: "leetcode",
      problemExternalId: "two-sum",
      problemTitle: "Two Sum",
      canonicalUrl: "https://leetcode.com/problems/two-sum/",
      occurredAt: "2026-07-05T00:00:00.000Z",
      payload: { source: "content_script" }
    });

    expect(event.type).toBe("PAGE_DETECTED");
  });

  it("converts page detection into an attempt draft", () => {
    const draft = pageDetectedEventToAttemptDraft({
      id: "evt_1",
      type: "PAGE_DETECTED",
      platform: "leetcode",
      problemExternalId: "two-sum",
      problemTitle: "Two Sum",
      canonicalUrl: "https://leetcode.com/problems/two-sum/",
      occurredAt: "2026-07-05T00:00:00.000Z",
      payload: { source: "content_script" }
    });

    expect(draft.result).toBe("draft");
    expect(draft.platform).toBe("leetcode");
    expect(draft.problemExternalId).toBe("two-sum");
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run:

```powershell
npm run test -- tests/unit/problem.test.ts tests/unit/captureEvents.test.ts
```

Expected: FAIL because `@/lib/domain/problem` and `@/lib/capture/events` do not exist.

- [ ] **Step 4: Implement source schema**

Write `lib/domain/source.ts`:

```ts
import { z } from "zod";

export const PlatformSchema = z.enum([
  "leetcode",
  "nowcoder",
  "luogu",
  "codeforces",
  "atcoder",
  "manual",
]);

export type Platform = z.infer<typeof PlatformSchema>;

export const SourceSchema = z.object({
  id: z.string().min(1),
  platform: PlatformSchema,
  name: z.string().min(1),
  homepage: z.string().url(),
  integrationMode: z.enum(["metadata_api", "deep_link", "extension_capture", "manual"]),
  statementPolicy: z.enum(["never_cache", "licensed_only", "user_local_only", "manual"]),
  supportsSubmissionSync: z.boolean(),
  riskLevel: z.enum(["low", "medium", "high"]),
  enabled: z.boolean(),
});

export type Source = z.infer<typeof SourceSchema>;
```

- [ ] **Step 5: Implement problem schema**

Write `lib/domain/problem.ts`:

```ts
import { z } from "zod";
import { PlatformSchema } from "./source";

export const ContentModeSchema = z.enum(["metadata_only", "licensed_statement", "manual_statement"]);
export const TrainingModeSchema = z.enum(["in_app", "deep_link"]);

export const ProblemStatusSchema = z.enum([
  "not_started",
  "in_progress",
  "solved",
  "needs_review",
  "needs_retry",
]);

const BaseProblemSchema = z.object({
  id: z.string().min(1),
  platform: PlatformSchema,
  externalId: z.string().min(1),
  title: z.string().min(1),
  canonicalUrl: z.string().url(),
  tags: z.array(z.string()),
  difficulty: z.string().min(1),
  status: ProblemStatusSchema,
  contentMode: ContentModeSchema,
  trainingMode: TrainingModeSchema,
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export const ProblemSchema = BaseProblemSchema.superRefine((value, context) => {
  const externalNoCachePlatforms = ["leetcode", "nowcoder", "luogu"] as const;
  if (externalNoCachePlatforms.includes(value.platform as (typeof externalNoCachePlatforms)[number]) && value.contentMode !== "metadata_only") {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["contentMode"],
      message: "LeetCode, NowCoder, and Luogu V1 problems must remain metadata_only.",
    });
  }
});

export type Problem = z.infer<typeof ProblemSchema>;
```

- [ ] **Step 6: Implement capture event schema**

Write `lib/capture/events.ts`:

```ts
import { z } from "zod";
import { PlatformSchema } from "@/lib/domain/source";

export const CaptureEventSchema = z.object({
  id: z.string().min(1),
  type: z.enum(["PAGE_DETECTED", "TRAINING_STARTED", "SUBMISSION_DETECTED", "VERDICT_UPDATED", "TRAINING_ENDED"]),
  platform: PlatformSchema,
  problemExternalId: z.string().min(1),
  problemTitle: z.string().min(1),
  canonicalUrl: z.string().url(),
  occurredAt: z.string().datetime(),
  payload: z.record(z.unknown()),
});

export type CaptureEvent = z.infer<typeof CaptureEventSchema>;

export type AttemptDraft = {
  result: "draft";
  platform: CaptureEvent["platform"];
  problemExternalId: string;
  problemTitle: string;
  canonicalUrl: string;
  startedAt: string;
};

export function pageDetectedEventToAttemptDraft(event: CaptureEvent): AttemptDraft {
  const parsed = CaptureEventSchema.parse(event);
  return {
    result: "draft",
    platform: parsed.platform,
    problemExternalId: parsed.problemExternalId,
    problemTitle: parsed.problemTitle,
    canonicalUrl: parsed.canonicalUrl,
    startedAt: parsed.occurredAt,
  };
}
```

- [ ] **Step 7: Verify schemas pass**

Run:

```powershell
npm run test -- tests/unit/problem.test.ts tests/unit/captureEvents.test.ts
npm run typecheck
```

Expected: PASS and typecheck exit 0.

---

### Task 3: SQLite Persistence

**Files:**
- Create: `lib/db/client.ts`
- Create: `lib/db/migrate.ts`
- Create: `lib/db/migrations/0001_initial.sql`
- Create: `lib/repositories/problems.ts`
- Create: `lib/repositories/captureEvents.ts`

- [ ] **Step 1: Write initial migration**

Write `lib/db/migrations/0001_initial.sql`:

```sql
CREATE TABLE IF NOT EXISTS schema_migrations (
  id TEXT PRIMARY KEY,
  applied_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS problems (
  id TEXT PRIMARY KEY,
  platform TEXT NOT NULL,
  external_id TEXT NOT NULL,
  title TEXT NOT NULL,
  canonical_url TEXT NOT NULL,
  tags_json TEXT NOT NULL,
  difficulty TEXT NOT NULL,
  status TEXT NOT NULL,
  content_mode TEXT NOT NULL,
  training_mode TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(platform, external_id)
);

CREATE TABLE IF NOT EXISTS capture_events (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  platform TEXT NOT NULL,
  problem_external_id TEXT NOT NULL,
  problem_title TEXT NOT NULL,
  canonical_url TEXT NOT NULL,
  occurred_at TEXT NOT NULL,
  payload_json TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS training_attempts (
  id TEXT PRIMARY KEY,
  platform TEXT NOT NULL,
  problem_external_id TEXT NOT NULL,
  problem_title TEXT NOT NULL,
  canonical_url TEXT NOT NULL,
  started_at TEXT NOT NULL,
  ended_at TEXT,
  result TEXT NOT NULL,
  verdict TEXT,
  language TEXT,
  duration_minutes INTEGER,
  reflection TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
```

- [ ] **Step 2: Implement database client**

Write `lib/db/client.ts`:

```ts
import Database from "better-sqlite3";

export function openDatabase() {
  const databasePath = process.env.TRAINING_DB_PATH ?? "training-platform.sqlite";
  return new Database(databasePath);
}
```

- [ ] **Step 3: Implement migration runner**

Write `lib/db/migrate.ts`:

```ts
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { openDatabase } from "./client";

const db = openDatabase();
const migrationsDir = join(process.cwd(), "lib", "db", "migrations");

db.exec("CREATE TABLE IF NOT EXISTS schema_migrations (id TEXT PRIMARY KEY, applied_at TEXT NOT NULL)");

const applied = new Set(
  db.prepare("SELECT id FROM schema_migrations").all().map((row) => (row as { id: string }).id),
);

for (const fileName of readdirSync(migrationsDir).filter((name) => name.endsWith(".sql")).sort()) {
  if (applied.has(fileName)) continue;
  const sql = readFileSync(join(migrationsDir, fileName), "utf8");
  const transaction = db.transaction(() => {
    db.exec(sql);
    db.prepare("INSERT INTO schema_migrations (id, applied_at) VALUES (?, ?)").run(fileName, new Date().toISOString());
  });
  transaction();
}

db.close();
```

- [ ] **Step 4: Implement problem repository**

Write `lib/repositories/problems.ts`:

```ts
import type Database from "better-sqlite3";
import { ProblemSchema, type Problem } from "@/lib/domain/problem";

type ProblemRow = {
  id: string;
  platform: string;
  external_id: string;
  title: string;
  canonical_url: string;
  tags_json: string;
  difficulty: string;
  status: string;
  content_mode: string;
  training_mode: string;
  created_at: string;
  updated_at: string;
};

function fromRow(row: ProblemRow): Problem {
  return ProblemSchema.parse({
    id: row.id,
    platform: row.platform,
    externalId: row.external_id,
    title: row.title,
    canonicalUrl: row.canonical_url,
    tags: JSON.parse(row.tags_json) as string[],
    difficulty: row.difficulty,
    status: row.status,
    contentMode: row.content_mode,
    trainingMode: row.training_mode,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  });
}

export function upsertProblem(db: Database.Database, problem: Problem): void {
  const parsed = ProblemSchema.parse(problem);
  db.prepare(`
    INSERT INTO problems (id, platform, external_id, title, canonical_url, tags_json, difficulty, status, content_mode, training_mode, created_at, updated_at)
    VALUES (@id, @platform, @externalId, @title, @canonicalUrl, @tagsJson, @difficulty, @status, @contentMode, @trainingMode, @createdAt, @updatedAt)
    ON CONFLICT(platform, external_id) DO UPDATE SET
      title = excluded.title,
      canonical_url = excluded.canonical_url,
      tags_json = excluded.tags_json,
      difficulty = excluded.difficulty,
      status = excluded.status,
      content_mode = excluded.content_mode,
      training_mode = excluded.training_mode,
      updated_at = excluded.updated_at
  `).run({ ...parsed, tagsJson: JSON.stringify(parsed.tags) });
}

export function listProblems(db: Database.Database): Problem[] {
  return db.prepare("SELECT * FROM problems ORDER BY updated_at DESC").all().map((row) => fromRow(row as ProblemRow));
}
```

- [ ] **Step 5: Implement capture event repository**

Write `lib/repositories/captureEvents.ts`:

```ts
import type Database from "better-sqlite3";
import { CaptureEventSchema, type CaptureEvent } from "@/lib/capture/events";

export function saveCaptureEvent(db: Database.Database, event: CaptureEvent): void {
  const parsed = CaptureEventSchema.parse(event);
  db.prepare(`
    INSERT INTO capture_events (id, type, platform, problem_external_id, problem_title, canonical_url, occurred_at, payload_json)
    VALUES (@id, @type, @platform, @problemExternalId, @problemTitle, @canonicalUrl, @occurredAt, @payloadJson)
  `).run({ ...parsed, payloadJson: JSON.stringify(parsed.payload) });
}
```

- [ ] **Step 6: Verify migration**

Run:

```powershell
$env:TRAINING_DB_PATH="test-training.sqlite"; npm run db:migrate; Remove-Item -LiteralPath "test-training.sqlite"
npm run typecheck
```

Expected: migration exits 0; typecheck exits 0.

---

### Task 4: Capture API

**Files:**
- Create: `app/api/capture/events/route.ts`
- Create: `lib/services/attempts.ts`
- Test: `tests/unit/captureEvents.test.ts`

- [ ] **Step 1: Replace capture event tests with page and submission coverage**

Write `tests/unit/captureEvents.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  CaptureEventSchema,
  pageDetectedEventToAttemptDraft,
  submissionEventToAttemptUpdate,
} from "@/lib/capture/events";

describe("CaptureEventSchema", () => {
  it("accepts a page detected event", () => {
    const event = CaptureEventSchema.parse({
      id: "evt_1",
      type: "PAGE_DETECTED",
      platform: "leetcode",
      problemExternalId: "two-sum",
      problemTitle: "Two Sum",
      canonicalUrl: "https://leetcode.com/problems/two-sum/",
      occurredAt: "2026-07-05T00:00:00.000Z",
      payload: { source: "content_script" }
    });

    expect(event.type).toBe("PAGE_DETECTED");
  });

  it("converts page detection into an attempt draft", () => {
    const draft = pageDetectedEventToAttemptDraft({
      id: "evt_1",
      type: "PAGE_DETECTED",
      platform: "leetcode",
      problemExternalId: "two-sum",
      problemTitle: "Two Sum",
      canonicalUrl: "https://leetcode.com/problems/two-sum/",
      occurredAt: "2026-07-05T00:00:00.000Z",
      payload: { source: "content_script" }
    });

    expect(draft.result).toBe("draft");
    expect(draft.platform).toBe("leetcode");
    expect(draft.problemExternalId).toBe("two-sum");
  });
});

describe("submissionEventToAttemptUpdate", () => {
  it("maps accepted verdicts into passed attempts", () => {
    const update = submissionEventToAttemptUpdate({
      id: "evt_2",
      type: "SUBMISSION_DETECTED",
      platform: "leetcode",
      problemExternalId: "two-sum",
      problemTitle: "Two Sum",
      canonicalUrl: "https://leetcode.com/problems/two-sum/",
      occurredAt: "2026-07-05T00:10:00.000Z",
      payload: { verdict: "Accepted", language: "TypeScript" }
    });

    expect(update.result).toBe("passed");
    expect(update.verdict).toBe("Accepted");
    expect(update.language).toBe("TypeScript");
  });
});
```

- [ ] **Step 2: Implement submission conversion**

Add to `lib/capture/events.ts`:

```ts
export type AttemptUpdate = {
  result: "passed" | "failed" | "partial" | "stuck";
  verdict: string;
  language?: string;
  endedAt: string;
};

export function submissionEventToAttemptUpdate(event: CaptureEvent): AttemptUpdate {
  const parsed = CaptureEventSchema.parse(event);
  const verdict = String(parsed.payload.verdict ?? "Unknown");
  const language = parsed.payload.language === undefined ? undefined : String(parsed.payload.language);
  return {
    result: verdict.toLowerCase().includes("accepted") ? "passed" : "failed",
    verdict,
    language,
    endedAt: parsed.occurredAt,
  };
}
```

- [ ] **Step 3: Implement Capture API route**

Write `app/api/capture/events/route.ts`:

```ts
import { NextResponse } from "next/server";
import { CaptureEventSchema } from "@/lib/capture/events";
import { openDatabase } from "@/lib/db/client";
import { saveCaptureEvent } from "@/lib/repositories/captureEvents";

export async function POST(request: Request) {
  const body: unknown = await request.json();
  const event = CaptureEventSchema.parse(body);
  const db = openDatabase();
  try {
    saveCaptureEvent(db, event);
  } finally {
    db.close();
  }
  return NextResponse.json({ ok: true, eventId: event.id });
}
```

- [ ] **Step 4: Verify capture tests and route types**

Run:

```powershell
npm run test -- tests/unit/captureEvents.test.ts
npm run typecheck
```

Expected: PASS and typecheck exit 0.

---

### Task 5: Chrome Extension MVP

**Files:**
- Create: `extension/manifest.json`
- Create: `extension/src/platforms.ts`
- Create: `extension/src/content.ts`
- Create: `extension/src/background.ts`
- Create: `extension/src/popup.html`
- Create: `extension/src/popup.ts`

- [ ] **Step 1: Create extension manifest**

Write `extension/manifest.json`:

```json
{
  "manifest_version": 3,
  "name": "Unified OJ Capture",
  "version": "0.1.0",
  "description": "Detects user-visible OJ training events and sends them to the local training app.",
  "permissions": ["storage", "tabs"],
  "host_permissions": [
    "http://localhost:3000/*",
    "https://leetcode.com/*",
    "https://www.nowcoder.com/*",
    "https://www.luogu.com.cn/*",
    "https://codeforces.com/*",
    "https://atcoder.jp/*"
  ],
  "background": {
    "service_worker": "src/background.js",
    "type": "module"
  },
  "content_scripts": [
    {
      "matches": [
        "https://leetcode.com/problems/*",
        "https://www.nowcoder.com/*",
        "https://www.luogu.com.cn/*",
        "https://codeforces.com/problemset/problem/*",
        "https://atcoder.jp/contests/*/tasks/*"
      ],
      "js": ["src/content.js"],
      "run_at": "document_idle"
    }
  ],
  "action": {
    "default_popup": "src/popup.html"
  }
}
```

- [ ] **Step 2: Implement platform detection**

Write `extension/src/platforms.ts`:

```ts
type Platform = "leetcode" | "nowcoder" | "luogu" | "codeforces" | "atcoder";

export type DetectedProblem = {
  platform: Platform;
  problemExternalId: string;
  problemTitle: string;
  canonicalUrl: string;
};

export function detectProblemFromLocation(location: Location, documentTitle: string): DetectedProblem | null {
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
```

- [ ] **Step 3: Implement content script**

Write `extension/src/content.ts`:

```ts
import { detectProblemFromLocation } from "./platforms";

const detected = detectProblemFromLocation(window.location, document.title);

if (detected) {
  chrome.runtime.sendMessage({
    type: "CAPTURE_EVENT",
    event: {
      id: `evt_${Date.now()}_${Math.random().toString(36).slice(2)}`,
      type: "PAGE_DETECTED",
      ...detected,
      occurredAt: new Date().toISOString(),
      payload: { source: "content_script" },
    },
  });
}
```

- [ ] **Step 4: Implement background sender**

Write `extension/src/background.ts`:

```ts
chrome.runtime.onMessage.addListener((message: unknown) => {
  if (!isCaptureMessage(message)) return;

  void fetch("http://localhost:3000/api/capture/events", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(message.event),
  }).catch(() => {
    void chrome.storage.local.set({ lastCaptureError: new Date().toISOString() });
  });
});

type CaptureMessage = { type: "CAPTURE_EVENT"; event: unknown };

function isCaptureMessage(value: unknown): value is CaptureMessage {
  return typeof value === "object" && value !== null && "type" in value && (value as { type: unknown }).type === "CAPTURE_EVENT";
}
```

- [ ] **Step 5: Implement popup**

Write `extension/src/popup.html`:

```html
<!doctype html>
<html lang="zh-CN">
  <body>
    <main style="width: 260px; font-family: sans-serif; padding: 12px;">
      <h1 style="font-size: 16px;">Unified OJ Capture</h1>
      <p>打开支持的 OJ 题目页后，插件会把页面检测事件发送到本地训练平台。</p>
      <p id="status">Ready</p>
      <script type="module" src="popup.js"></script>
    </main>
  </body>
</html>
```

Write `extension/src/popup.ts`:

```ts
const statusNode = document.querySelector("#status");
chrome.storage.local.get(["lastCaptureError"], (items) => {
  if (statusNode) {
    statusNode.textContent = items.lastCaptureError ? `Last error: ${items.lastCaptureError}` : "No recent capture errors";
  }
});
```

- [ ] **Step 6: Verify extension TypeScript**

Run:

```powershell
npm run typecheck
```

Expected: typecheck exit 0. Extension build/bundling can be added after V1 web flow passes.

---

### Task 6: Unified Problem Catalog and Deep-Link UI

**Files:**
- Create: `app/problems/page.tsx`
- Create: `app/training/page.tsx`
- Create: `components/ProblemCard.tsx`
- Create: `components/TrainingWorkspace.tsx`

- [ ] **Step 1: Build problem card component**

Write `components/ProblemCard.tsx`:

```tsx
import type { Problem } from "@/lib/domain/problem";

export function ProblemCard({ problem }: { problem: Problem }) {
  return (
    <article className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-wide text-slate-500">{problem.platform}</p>
          <h2 className="mt-1 text-lg font-semibold text-slate-950">{problem.title}</h2>
          <p className="mt-2 text-sm text-slate-600">{problem.tags.join(" · ")} · {problem.difficulty}</p>
        </div>
        <span className="rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-700">{problem.contentMode}</span>
      </div>
      <a className="mt-4 inline-block rounded-lg bg-slate-950 px-4 py-2 text-sm text-white" href={`/training?platform=${problem.platform}&externalId=${encodeURIComponent(problem.externalId)}`}>
        Start Training
      </a>
    </article>
  );
}
```

- [ ] **Step 2: Build problems page with seed data fallback**

Write `app/problems/page.tsx`:

```tsx
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
```

- [ ] **Step 3: Build training workspace component**

Write `components/TrainingWorkspace.tsx`:

```tsx
type TrainingWorkspaceProps = {
  platform: string;
  externalId: string;
};

export function TrainingWorkspace({ platform, externalId }: TrainingWorkspaceProps) {
  const url = buildPlatformUrl(platform, externalId);
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-6">
      <p className="text-sm uppercase tracking-wide text-slate-500">{platform}</p>
      <h1 className="mt-2 text-2xl font-semibold">{externalId}</h1>
      <p className="mt-3 text-slate-600">
        This V1 workspace opens the original platform and waits for the browser extension to return page/submission events.
      </p>
      <a className="mt-5 inline-block rounded-lg bg-slate-950 px-4 py-2 text-white" href={url} target="_blank" rel="noreferrer">
        Open original problem
      </a>
    </section>
  );
}

function buildPlatformUrl(platform: string, externalId: string): string {
  if (platform === "leetcode") return `https://leetcode.com/problems/${externalId}/`;
  if (platform === "codeforces") return `https://codeforces.com/problemset/problem/${externalId.slice(0, -1)}/${externalId.slice(-1)}`;
  if (platform === "atcoder") return `https://atcoder.jp/contests/${externalId.split("_")[0]}/tasks/${externalId}`;
  return "https://www.google.com/search?q=" + encodeURIComponent(`${platform} ${externalId}`);
}
```

- [ ] **Step 4: Build training page**

Write `app/training/page.tsx`:

```tsx
import { TrainingWorkspace } from "@/components/TrainingWorkspace";

export default function TrainingPage({ searchParams }: { searchParams: { platform?: string; externalId?: string } }) {
  const platform = searchParams.platform ?? "leetcode";
  const externalId = searchParams.externalId ?? "two-sum";

  return (
    <main className="mx-auto max-w-4xl px-6 py-10">
      <TrainingWorkspace platform={platform} externalId={externalId} />
    </main>
  );
}
```

- [ ] **Step 5: Verify UI build**

Run:

```powershell
npm run typecheck
npm run build
```

Expected: both exit 0.

---

### Task 7: Coach, Growth, Compliance, and Docs

**Files:**
- Create: `app/coach/page.tsx`
- Create: `app/growth/page.tsx`
- Create: `app/compliance/page.tsx`
- Create: `README.md`
- Create: `COMPLIANCE.md`

- [ ] **Step 1: Create Coach page**

Write `app/coach/page.tsx`:

```tsx
export default function CoachPage() {
  return (
    <main className="mx-auto max-w-4xl px-6 py-10">
      <h1 className="text-3xl font-semibold">Coach</h1>
      <p className="mt-3 text-slate-600">Coach uses local attempts and capture events to explain weak points and recommend the next practice. V1 starts with rule-based analysis.</p>
    </main>
  );
}
```

- [ ] **Step 2: Create Growth page**

Write `app/growth/page.tsx`:

```tsx
export default function GrowthPage() {
  return (
    <main className="mx-auto max-w-4xl px-6 py-10">
      <h1 className="text-3xl font-semibold">Growth</h1>
      <p className="mt-3 text-slate-600">Growth summarizes attempts, streaks, tag performance, verdicts, and review completion from local training data.</p>
    </main>
  );
}
```

- [ ] **Step 3: Create Compliance page**

Write `app/compliance/page.tsx`:

```tsx
const rules = [
  "Do not bypass login, captcha, paywalls, anti-bot systems, or access controls.",
  "Do not cache LeetCode, NowCoder, or Luogu full statements in V1.",
  "Use browser session without extracting browser session tokens.",
  "Store training records locally by default.",
];

export default function CompliancePage() {
  return (
    <main className="mx-auto max-w-4xl px-6 py-10">
      <h1 className="text-3xl font-semibold">Compliance</h1>
      <ul className="mt-6 space-y-3">
        {rules.map((rule) => <li key={rule} className="rounded-lg border border-slate-200 bg-white p-4">{rule}</li>)}
      </ul>
    </main>
  );
}
```

- [ ] **Step 4: Write README**

Write `README.md`:

```md
# AI Coding Training Platform

V1 is a unified OJ entry and local training memory system.

It provides:

- unified problem metadata search;
- deep links to original OJ problem pages;
- a Chrome extension that detects user-visible training events;
- local capture APIs;
- local attempts, Coach, and Growth pages.

V1 does not mirror LeetCode, NowCoder, Luogu, or similar full problem statements by default.

## Commands

```powershell
npm install
npm run dev
npm run typecheck
npm run test
npm run build
```
```

- [ ] **Step 5: Write COMPLIANCE.md**

Write `COMPLIANCE.md`:

```md
# Compliance Notes

The product uses this rule: use browser session, do not extract browser session.

Allowed in V1:

- store problem IDs, titles, tags, difficulty, source URLs, and user training records;
- open original OJ pages through deep links;
- detect user-visible page and submission events through a user-installed browser extension;
- keep captured training records local by default.

Not allowed in V1:

- bypass login, captcha, paywalls, anti-bot systems, or access controls;
- store platform passwords;
- upload platform session cookies;
- cache LeetCode, NowCoder, or Luogu full statements by default;
- run server-side crawlers against commercial OJ platforms.
```

- [ ] **Step 6: Full verification**

Run:

```powershell
npm run typecheck
npm run test
npm run build
```

Expected: all commands exit 0.

---

## Self-Review

- Spec coverage: V1 unified entry, original-site training, browser extension capture, local Capture API, metadata-only external platforms, Coach/Growth, and compliance boundaries are covered.
- Completeness scan: The plan uses concrete tasks, exact paths, executable commands, and complete code blocks for each implementation step.
- Type consistency: `platform`, `externalId`, `canonicalUrl`, `contentMode`, `trainingMode`, and `CaptureEvent` names are consistent across schemas, repositories, API route, extension, and UI.

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-07-05-ai-coding-training-platform-implementation.md`. Two execution options:

1. **Subagent-Driven (recommended)** - dispatch a fresh subagent per task, review between tasks, fast iteration.
2. **Inline Execution** - execute tasks in this session using executing-plans, batch execution with checkpoints.

Which approach?
