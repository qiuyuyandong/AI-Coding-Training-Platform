# V0 Bilingual User Interface Implementation Plan

> **Execution status (2026-07-24): DEFERRED.** This plan is approved future
> scope, not active V0 work. Do not execute it until V0 formal observation,
> same-SHA F1–F4, and explicit user acceptance are complete.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Do not delegate unless the user explicitly authorizes subagents. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Provide a persistent Chinese/English switch for every current user-visible application route and component, with Chinese as the default and no change to business identifiers or stored training data.

**Architecture:** A typed, JSON-serializable message catalog supplies identical keys for `zh-CN` and `en`. Server Components resolve a local locale Cookie per request; a small client provider supplies the same catalog to interactive components, and a navigation toggle writes the Cookie then refreshes the current route. Coach and other dynamic domain outputs expose semantic codes/counts so pages translate them instead of storing English presentation sentences in pure services.

**Tech Stack:** Next.js 15 App Router, React 19 Server/Client Components, TypeScript 5.8 strict mode, local Cookie, Vitest, Testing Library, Playwright.

## Global Constraints

- Default locale is exactly `zh-CN`; supported locales are exactly `zh-CN` and `en`.
- Locale preference is stored only in a first-party Cookie named `training_locale` with `Path=/`, `Max-Age=31536000`, and `SameSite=Lax`.
- Do not add third-party i18n packages, external translation calls, locale-prefixed route copies, database columns, or migrations.
- Course/package content remains in its published language; translate application chrome, controls, explanations, states, and labels only.
- Internal enums, API fields, URLs, IDs, reason codes, verdict values, and database values do not change with locale.
- Client-visible generic errors must be localized; raw technical error details may appear only in an explicitly labelled diagnostics disclosure.
- Preserve pure Coach/Growth service logic under `lib/services/**`; presentation translation belongs in pages/components/i18n helpers.
- Keep TypeScript strict: no `any`, `as any`, `as unknown`, `@ts-ignore`, `@ts-expect-error`, or non-null assertions.
- Prefix every Git command with `$env:GIT_MASTER='1';`.
- Do not commit, push, or create a PR unless the user separately authorizes it. Commit steps below are authorization gates only.

---

### Task 1: Build the typed locale and message foundation

**Files:**
- Create: `lib/i18n/locale.ts`
- Create: `lib/i18n/messages/zh-CN.ts`
- Create: `lib/i18n/messages/en.ts`
- Create: `lib/i18n/messages/index.ts`
- Create: `lib/i18n/format.ts`
- Create: `lib/i18n/server.ts`
- Create: `components/I18nProvider.tsx`
- Create: `components/LocaleToggle.tsx`
- Create: `tests/unit/i18n.test.ts`
- Create: `tests/unit/localeToggle.test.tsx`

**Interfaces:**
- Produces: `Locale = "zh-CN" | "en"`, `DEFAULT_LOCALE`, `LOCALE_COOKIE_NAME`, `parseLocale`, `localeCookie`.
- Produces: `Messages`, `messagesFor(locale)`, `formatMessage(template, variables)`, `formatLocalDateTime(value, locale)`.
- Produces: `getRequestLocale()` and `getRequestMessages()` for Server Components.
- Produces: `I18nProvider`, `useI18n()`, and `LocaleToggle` for Client Components.

- [ ] **Step 1: Write failing locale/catalog tests**

```ts
expect(parseLocale(undefined)).toBe("zh-CN");
expect(parseLocale("fr")).toBe("zh-CN");
expect(parseLocale("en")).toBe("en");
expect(localeCookie("en")).toBe(
  "training_locale=en; Path=/; Max-Age=31536000; SameSite=Lax",
);
expect(messageKeys(messagesFor("zh-CN")))
  .toEqual(messageKeys(messagesFor("en")));
expect(formatMessage("{count} results", { count: 3 })).toBe("3 results");
```

- [ ] **Step 2: Run the focused tests and verify missing modules fail**

Run: `npx vitest run tests/unit/i18n.test.ts tests/unit/localeToggle.test.tsx`

Expected: FAIL because the i18n modules do not exist.

- [ ] **Step 3: Implement locale parsing and Cookie serialization**

```ts
export const SUPPORTED_LOCALES = ["zh-CN", "en"] as const;
export type Locale = typeof SUPPORTED_LOCALES[number];
export const DEFAULT_LOCALE: Locale = "zh-CN";
export const LOCALE_COOKIE_NAME = "training_locale";

export function parseLocale(value: string | undefined): Locale {
  return value === "en" || value === "zh-CN" ? value : DEFAULT_LOCALE;
}

export function localeCookie(locale: Locale): string {
  return `${LOCALE_COOKIE_NAME}=${locale}; Path=/; Max-Age=31536000; SameSite=Lax`;
}
```

- [ ] **Step 4: Implement structurally identical JSON message catalogs**

Start `zh-CN.ts` with the shared shell namespaces, not a flat global bag. Later tasks extend the same typed catalogs with their owned route namespaces:

```ts
export const zhCN = {
  common: {
    localeName: "中文",
    switchLocale: "English",
    loading: "正在加载…",
    retry: "重试",
    unavailable: "暂不可用",
  },
  nav: {
    home: "首页",
    map: "学习地图",
    plan: "学习计划",
    today: "今日任务",
    problems: "题目",
    training: "训练",
    coach: "教练",
    growth: "成长",
    sources: "来源",
    compliance: "合规",
    settings: "设置",
  },
} as const;
```

Define a recursive `MessageShape<T>` that maps string literals to `string`; export `en satisfies MessageShape<typeof zhCN>` so missing and extra keys are compile failures. Values containing counts use named `{variable}` placeholders. Each later task adds its complete namespace to both catalogs in the same change that consumes it.

- [ ] **Step 5: Implement safe formatting helpers**

`formatMessage` accepts only `string | number` variables and replaces exact named placeholders. It throws on a missing variable in tests/development. `formatLocalDateTime` returns `Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }).format(date)` for valid ISO input and the original value for invalid input.

- [ ] **Step 6: Implement server locale resolution**

```ts
export async function getRequestLocale(): Promise<Locale> {
  const store = await cookies();
  return parseLocale(store.get(LOCALE_COOKIE_NAME)?.value);
}

export async function getRequestMessages(): Promise<{
  readonly locale: Locale;
  readonly messages: Messages;
}> {
  const locale = await getRequestLocale();
  return { locale, messages: messagesFor(locale) };
}
```

- [ ] **Step 7: Implement the client provider and toggle**

The provider value is `{ locale, messages }`. `LocaleToggle` computes the other supported locale, writes `document.cookie = localeCookie(nextLocale)`, and calls `router.refresh()`. Its accessible name comes from the current catalog and its visible label is `English` in Chinese mode and `中文` in English mode.

- [ ] **Step 8: Run focused tests and typecheck**

Run: `npx vitest run tests/unit/i18n.test.ts tests/unit/localeToggle.test.tsx`

Then run: `npm run typecheck`

Expected: tests and strict typecheck PASS; catalogs have identical keys.

- [ ] **Step 9: Authorization-gated commit checkpoint**

If authorized, commit with `feat(i18n): add typed local bilingual catalog`; otherwise leave uncommitted.

---

### Task 2: Localize the app shell and V0 learning loop

**Files:**
- Modify: `app/layout.tsx`
- Modify: `app/page.tsx`
- Create: `components/Navigation.tsx`
- Modify: `lib/i18n/messages/zh-CN.ts`
- Modify: `lib/i18n/messages/en.ts`
- Modify: `app/map/page.tsx`
- Modify: `app/map/[nodeId]/page.tsx`
- Modify: `app/plan/page.tsx`
- Modify: `app/today/page.tsx`
- Modify: `components/GoalSetupPanel.tsx`
- Modify: `components/EffortBoundarySelector.tsx`
- Modify: `components/TodayTaskPanel.tsx`
- Modify: `components/PlanItemCompletionPanel.tsx`
- Modify: `components/TrainingAttemptNodeLink.tsx`
- Modify: `tests/unit/mapPage.test.ts`
- Modify: `tests/unit/planPage.test.ts`
- Modify: `tests/unit/todayPage.test.ts`
- Create: `tests/unit/appShellI18n.test.tsx`

**Interfaces:**
- `RootLayout` resolves locale/messages once, sets `<html lang>`, wraps children with `I18nProvider`, and renders localized navigation plus `LocaleToggle`.
- Server pages call `getRequestMessages`; Client Components call `useI18n` and never parse cookies directly.

- [ ] **Step 1: Add failing app-shell tests**

Test Chinese default and English catalog rendering without relying on browser locale:

```tsx
render(<Navigation locale="zh-CN" messages={messagesFor("zh-CN")} />);
expect(screen.getByRole("link", { name: "学习地图" })).toHaveAttribute("href", "/map");
expect(screen.getByRole("button", { name: "切换到 English" })).toBeVisible();

render(<Navigation locale="en" messages={messagesFor("en")} />);
expect(screen.getByRole("link", { name: "Learning Map" })).toBeVisible();
expect(screen.getByRole("button", { name: "Switch to 中文" })).toBeVisible();
```

- [ ] **Step 2: Make the root layout locale-aware**

Convert `RootLayout` to `async`, resolve one catalog, set `lang={locale}`, and include all current destinations: Home, Map, Plan, Today, Problems, Training, Coach, Growth, Sources, Compliance, Settings. Keep semantic navigation and keyboard focus behavior.

- [ ] **Step 3: Localize Home and Map surfaces**

Move eyebrow, headings, descriptions, empty states, graph labels, directions, steps, accessibility titles/descriptions, and link/button text into `home`, `map`, and `node` namespaces. Keep course node titles and published career content unchanged. Replace visible `Curriculum map`, `Tab`, `Enter`, `baseline`, and other mixed-language chrome in Chinese mode; provide natural English equivalents.

- [ ] **Step 4: Localize Plan and Today server pages**

Move goal/diagnosis/override/plan state text, stage and effort labels, empty states, task roles, reason explanations, snapshot metadata, and links into the relevant namespaces. Preserve enum values such as `learn`, `practice`, `recover`, and reason codes internally; map them only at render time.

- [ ] **Step 5: Localize learning-loop client components**

Replace hard-coded strings in GoalSetup, effort selection, Today task alternatives, completion/reflection, and mapped-attempt ability displays with `useI18n`. Known API errors render localized user messages; raw server errors may be stored for an optional diagnostics `<details>` but not used as the primary visible message.

- [ ] **Step 6: Add both-locale component assertions**

Update existing tests to wrap client components in `I18nProvider`. For each major interaction, assert one Chinese and one English label while keeping existing behavior assertions unchanged.

- [ ] **Step 7: Run V0 learning-loop tests**

Run: `npx vitest run tests/unit/appShellI18n.test.tsx tests/unit/mapPage.test.ts tests/unit/planPage.test.ts tests/unit/todayPage.test.ts tests/unit/todayPageFallback.test.ts`

Expected: all selected tests PASS in both locale fixtures.

- [ ] **Step 8: Authorization-gated commit checkpoint**

If authorized, commit with `feat(i18n): localize the V0 learning loop`; otherwise leave uncommitted.

---

### Task 3: Localize Training, Problems, Settings, and capture status

**Files:**
- Modify: `app/training/page.tsx`
- Modify: `lib/i18n/messages/zh-CN.ts`
- Modify: `lib/i18n/messages/en.ts`
- Modify: `app/problems/page.tsx`
- Modify: `app/settings/page.tsx`
- Modify: `app/settings/CapturePairingSettings.tsx`
- Modify: `components/TrainingWorkspace.tsx`
- Modify: `components/ManualAttemptPanel.tsx`
- Modify: `components/CaptureStatusPanel.tsx`
- Modify: `components/AttemptStatusPanel.tsx`
- Modify: `components/ProblemCard.tsx`
- Modify: `components/SeedProblemsButton.tsx`
- Modify: `tests/unit/attemptStatusPanel.test.tsx`
- Modify: `tests/unit/problemCatalog.test.tsx`
- Create: `tests/unit/trainingSettingsI18n.test.tsx`

**Interfaces:**
- Training/capture components consume `useI18n`.
- Pairing and installation status values remain stable; labels and actions are localized.

- [ ] **Step 1: Add failing bilingual interaction tests**

Cover original-problem link, manual attempt form, capture empty/error/latest state, automatic/manual source labels, correction/void actions, problem search/seed actions, create/rotate/revoke pairing actions, pairing-code expiry, and installation status.

- [ ] **Step 2: Localize Training workspace and attempt panels**

Update the old page-session explanation to the repaired verdict-gated behavior: exact submit creates local waiting state, final verdict creates a training result, and opening/running/debugging alone does not. Localize polling, empty states, results, corrections, void history, manual entry, and all error fallbacks.

- [ ] **Step 3: Localize Problems and cards**

Translate metadata labels, open-training actions, missing-link state, seed action status, filters, and empty/error states. Platform names and problem titles remain source data.

- [ ] **Step 4: Localize Settings and pairing**

Translate page headings, descriptions, active/revoked/last-seen states, code creation/rotation/revocation, confirmations, and API fallbacks. Installation IDs and timestamps stay unchanged but timestamps render through `formatLocalDateTime`.

- [ ] **Step 5: Run focused tests**

Run: `npx vitest run tests/unit/trainingSettingsI18n.test.tsx tests/unit/attemptStatusPanel.test.tsx tests/unit/problemCatalog.test.tsx tests/unit/manualAttempts.test.ts`

Expected: all tests PASS with behavior unchanged and both locale catalogs exercised.

- [ ] **Step 6: Authorization-gated commit checkpoint**

If authorized, commit with `feat(i18n): localize training and settings`; otherwise leave uncommitted.

---

### Task 4: Convert Coach output to semantic data and localize remaining pages

**Files:**
- Modify: `lib/services/coachAnalysis.ts`
- Modify: `lib/i18n/messages/zh-CN.ts`
- Modify: `lib/i18n/messages/en.ts`
- Modify: `tests/unit/coachAnalysis.test.ts`
- Modify: `app/coach/page.tsx`
- Modify: `app/growth/page.tsx`
- Modify: `app/sources/page.tsx`
- Modify: `app/compliance/page.tsx`
- Modify: `tests/unit/growthStats.test.ts`
- Create: `tests/unit/secondaryPagesI18n.test.tsx`

**Interfaces:**
- `CoachAnalysis` returns semantic `analysisKind`, signal kinds, recommendation kinds, counts, and evidence IDs; it no longer embeds English titles/sentences.
- Pages map semantic kinds to locale templates with `formatMessage`.

- [ ] **Step 1: Rewrite Coach tests around semantic output**

```ts
expect(buildCoachAnalysis([], now)).toMatchObject({
  analysisKind: "no-data",
  recentWindowSize: 0,
  signals: [{ kind: "no-data", count: 0 }],
  recommendations: [{ kind: "complete-first-capture" }],
});
```

Keep evidence ID and grouping assertions; remove assertions against English prose.

- [ ] **Step 2: Refactor Coach service without changing decision logic**

Use stable kinds for `no-data`, `draft-only`, `review-first`, `partial-review`, and `momentum`; signals retain the existing signal kinds; recommendations use explicit kinds such as `review-failed-or-stuck`, `retry-partial`, and `increase-difficulty`. Expose counts required for templates. Do not pass locale or message catalogs into the service.

- [ ] **Step 3: Localize Coach page from semantic kinds**

Map every analysis/signal/recommendation kind exhaustively. Use a `never`-checked switch helper so adding a future kind causes a type error until both catalogs are updated.

- [ ] **Step 4: Localize Growth**

Translate page chrome, no-data state, metric labels, result distribution labels, automatic/manual source labels, updated-at label, and section headings. Keep `buildGrowthStats` pure and unchanged; localize enums at render time.

- [ ] **Step 5: Localize Sources and Compliance**

Translate all headings, descriptions, rules, empty states, and actions. Source names/URLs and compliance identifiers remain data.

- [ ] **Step 6: Run focused service/page tests**

Run: `npx vitest run tests/unit/coachAnalysis.test.ts tests/unit/growthStats.test.ts tests/unit/secondaryPagesI18n.test.tsx`

Expected: all tests PASS; no presentation sentence remains in `coachAnalysis.ts`.

- [ ] **Step 7: Authorization-gated commit checkpoint**

If authorized, commit with `feat(i18n): localize coach growth and policy pages`; otherwise leave uncommitted.

---

### Task 5: Prove locale persistence and complete the visible-string audit

**Files:**
- Create: `tests/e2e/i18n.spec.ts`
- Modify: `tests/e2e/v0-accessibility.spec.ts`
- Modify: `tests/e2e/v0-core-learning-loop.spec.ts`
- Modify: `README.md`
- Modify: `DESIGN.md`
- Modify: `docs/runbook.md`
- Modify: `work/handoff-current.md`
- Modify: `work/reports/v0-engineering-gates.md`

**Interfaces:**
- E2E covers default Chinese, English switch, refresh/navigation persistence, switch back, and all current routes.

- [ ] **Step 1: Write the locale persistence E2E**

```ts
test("persists the bilingual preference across current routes", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("html")).toHaveAttribute("lang", "zh-CN");
  await expect(page.getByRole("link", { name: "学习地图" })).toBeVisible();
  await page.getByRole("button", { name: "切换到 English" }).click();
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  await page.goto("/training");
  await expect(page.getByRole("heading", { name: /Training/i })).toBeVisible();
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  await page.getByRole("button", { name: "Switch to 中文" }).click();
  await expect(page.locator("html")).toHaveAttribute("lang", "zh-CN");
});
```

- [ ] **Step 2: Add a route matrix smoke test**

Visit `/`, `/map`, one `/map/[nodeId]`, `/plan`, `/today`, `/problems`, `/training`, `/coach`, `/growth`, `/sources`, `/compliance`, and `/settings` under each locale. Assert the locale-specific page heading or primary empty state and verify no generic `Application error` appears.

- [ ] **Step 3: Audit all visible TSX strings**

Review every file under `app/**/*.tsx` and `components/**/*.tsx`. For each remaining literal, classify it as one of:

- published content/data;
- stable technical identifier or route;
- punctuation/formatting;
- translated through the message catalog.

Move every unclassified user-facing literal into the catalog. Do not treat comments, class names, test IDs, or API field names as visible copy.

- [ ] **Step 4: Update accessibility coverage**

Run existing keyboard/landmark checks in Chinese and English. Ensure the locale control has a locale-specific accessible name, the active document `lang` is correct, and translated labels still associate with inputs.

- [ ] **Step 5: Run focused E2E**

Run: `npx playwright test tests/e2e/i18n.spec.ts tests/e2e/v0-accessibility.spec.ts tests/e2e/v0-core-learning-loop.spec.ts`

Expected: all selected tests PASS under the Playwright-owned server.

- [ ] **Step 6: Reconcile user and engineering documentation**

Document Chinese default, local Cookie persistence, how to switch languages, the fact that course content keeps its published language, and troubleshooting steps for clearing only `training_locale`. Do not claim translation of external OJ pages.

- [ ] **Step 7: Run the authoritative verification sequence after the capture plan is also complete**

```powershell
npm run lint
npm run db:migrate
npm run test
npm run typecheck
npm run e2e
npm run extension:check
npm run build
npm run quality:gate
```

Record exact test/pass/skip counts. Checks not run must remain explicitly unverified.

- [ ] **Step 8: Perform a bounded visual/manual pass**

At desktop and narrow viewport widths, inspect navigation wrapping, locale toggle focus, long English labels, Chinese form labels, error messages, and the extension pairing path. This is engineering observation only; it is not user acceptance.

- [ ] **Step 9: Authorization-gated commit checkpoint**

If authorized, commit with `feat(v0): add full bilingual interface`. Do not push.

## Completion Gate

This plan is complete only when every current user-visible route has a tested Chinese and English primary state, the locale Cookie persists across navigation/reload, business data remains locale-independent, and authoritative gates pass after integration with the capture repair. Full bilingual engineering coverage does not make the product accepted or public-release ready; new-RC real-use observation and explicit user acceptance remain required.
