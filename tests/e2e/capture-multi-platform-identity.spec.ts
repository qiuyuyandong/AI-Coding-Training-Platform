import { expect, test } from "@playwright/test";
import Database from "better-sqlite3";
import {
  captureEvent,
  postCaptureEvents,
  type CaptureProblemFixture,
} from "./captureFixtures";
import { E2E_DB_PATH } from "./database";

// API pipeline only E2E — no extension, no real detector.
// Verifies that SESSION_STARTED + SUBMISSION_OBSERVED + VERDICT_OBSERVED
// events for LeetCode.cn, Luogu, and NowCoder are materialized by
// POST /api/capture/events into SQLite and surfaced on /training with
// correct platform/externalId/canonical/verdict/result, with no cross-platform
// leakage.

const leetcodeCnProblem: CaptureProblemFixture = {
  captureSessionId: "session_e2e_leetcoden_cn",
  platform: "leetcode",
  problemExternalId: "two-sum",
  problemTitle: "两数之和",
  canonicalUrl: "https://leetcode.cn/problems/two-sum/",
};

const luoguProblem: CaptureProblemFixture = {
  captureSessionId: "session_e2e_domestic_luogu_pipeline",
  platform: "luogu",
  problemExternalId: "P1001",
  problemTitle: "A+B Problem",
  canonicalUrl: "https://www.luogu.com.cn/problem/P1001",
};

const nowCoderProblem: CaptureProblemFixture = {
  captureSessionId: "session_e2e_nowcoder",
  platform: "nowcoder",
  problemExternalId: "acm/problem/319811",
  problemTitle: "小红的字符串处理",
  canonicalUrl: "https://ac.nowcoder.com/acm/problem/319811",
};

type AttemptRow = {
  readonly platform: string;
  readonly problem_external_id: string;
  readonly submission_id: string;
  readonly canonical_url: string;
  readonly verdict: string | null;
  readonly result: string;
  readonly voided_at: string | null;
};

type SessionRow = {
  readonly id: string;
  readonly platform: string;
  readonly problem_external_id: string;
  readonly canonical_url: string;
};

test("LeetCode.cn capture pipeline — passed and failed verdicts are distinct", async ({
  page,
  request,
}) => {
  await postCaptureEvents(request, [
    captureEvent(leetcodeCnProblem, {
      type: "SESSION_STARTED",
      eventId: "evt_e2e_lc_cn_session",
      occurredAt: "2026-07-20T10:00:00.000Z",
    }),
    captureEvent(leetcodeCnProblem, {
      type: "SUBMISSION_OBSERVED",
      eventId: "evt_e2e_lc_cn_submission_fail",
      submissionId: "submission_e2e_lc_cn_fail",
      occurredAt: "2026-07-20T10:01:00.000Z",
    }),
    captureEvent(leetcodeCnProblem, {
      type: "VERDICT_OBSERVED",
      eventId: "evt_e2e_lc_cn_verdict_fail",
      submissionId: "submission_e2e_lc_cn_fail",
      verdict: "Wrong Answer",
      occurredAt: "2026-07-20T10:02:00.000Z",
    }),
    captureEvent(leetcodeCnProblem, {
      type: "SUBMISSION_OBSERVED",
      eventId: "evt_e2e_lc_cn_submission_pass",
      submissionId: "submission_e2e_lc_cn_pass",
      occurredAt: "2026-07-20T10:03:00.000Z",
    }),
    captureEvent(leetcodeCnProblem, {
      type: "VERDICT_OBSERVED",
      eventId: "evt_e2e_lc_cn_verdict_pass",
      submissionId: "submission_e2e_lc_cn_pass",
      verdict: "Accepted",
      occurredAt: "2026-07-20T10:04:00.000Z",
    }),
  ]);

  const db = new Database(E2E_DB_PATH, { readonly: true });
  try {
    const attempts = db
      .prepare<[], AttemptRow>(`
        SELECT platform, problem_external_id, submission_id, canonical_url,
               verdict, result, voided_at
        FROM training_attempts
        WHERE submission_id LIKE 'submission_e2e_lc_cn_%'
        ORDER BY submission_id
      `)
      .all();

    expect(attempts).toHaveLength(2);

    const failedAttempt = attempts.find((a) => a.submission_id === "submission_e2e_lc_cn_fail");
    if (!failedAttempt) throw new Error("LeetCode.cn failed attempt not found");
    expect(failedAttempt.platform).toBe("leetcode");
    expect(failedAttempt.problem_external_id).toBe("two-sum");
    expect(failedAttempt.canonical_url).toBe("https://leetcode.cn/problems/two-sum/");
    expect(failedAttempt.verdict).toBe("Wrong Answer");
    expect(failedAttempt.result).toBe("failed");
    expect(failedAttempt.voided_at).toBeNull();

    const passedAttempt = attempts.find((a) => a.submission_id === "submission_e2e_lc_cn_pass");
    if (!passedAttempt) throw new Error("LeetCode.cn passed attempt not found");
    expect(passedAttempt.platform).toBe("leetcode");
    expect(passedAttempt.problem_external_id).toBe("two-sum");
    expect(passedAttempt.canonical_url).toBe("https://leetcode.cn/problems/two-sum/");
    expect(passedAttempt.verdict).toBe("Accepted");
    expect(passedAttempt.result).toBe("passed");
    expect(passedAttempt.voided_at).toBeNull();

    const sessions = db
      .prepare<[], SessionRow>(`
        SELECT id, platform, problem_external_id, canonical_url
        FROM training_sessions
        WHERE id = 'session_e2e_leetcoden_cn'
      `)
      .all();
    expect(sessions).toHaveLength(1);
    const session = sessions[0];
    if (!session) throw new Error("LeetCode.cn session not found");
    expect(session.platform).toBe("leetcode");
    expect(session.problem_external_id).toBe("two-sum");
    expect(session.canonical_url).toBe("https://leetcode.cn/problems/two-sum/");
  } finally {
    db.close();
  }

  // UI: passed verdict — verdict is in the Training attempt panel, not the problem heading section
  await page.goto(
    "/training?platform=leetcode&externalId=two-sum&title=%E4%B8%A4%E6%95%B0%E4%B9%8B%E5%92%8C",
  );
  const lcProblemSection = page.locator("section").filter({
    has: page.getByRole("heading", { name: "两数之和" }),
  });
  await expect(lcProblemSection).toContainText("leetcode");
  await expect(lcProblemSection).toContainText("two-sum");
  // canonical URL is in href, not visible text; DB layer already asserts it
  const lcAttemptPanel = page.locator("section").filter({
    has: page.getByRole("heading", { name: "Training attempt" }),
  });
  await expect(lcAttemptPanel).toContainText("leetcode");
  await expect(lcAttemptPanel).toContainText("two-sum");
  await expect(lcAttemptPanel).toContainText("Accepted");
  await expect(lcAttemptPanel).not.toContainText("Luogu");
  await expect(lcAttemptPanel).not.toContainText("NowCoder");
});

test("Luogu capture pipeline — passed and failed verdicts are distinct", async ({
  page,
  request,
}) => {
  await postCaptureEvents(request, [
    captureEvent(luoguProblem, {
      type: "SESSION_STARTED",
      eventId: "evt_e2e_luogu_session_v2",
      occurredAt: "2026-07-20T11:00:00.000Z",
    }),
    captureEvent(luoguProblem, {
      type: "SUBMISSION_OBSERVED",
      eventId: "evt_e2e_luogu_submission_fail",
      submissionId: "submission_e2e_domestic_luogu_fail",
      occurredAt: "2026-07-20T11:01:00.000Z",
    }),
    captureEvent(luoguProblem, {
      type: "VERDICT_OBSERVED",
      eventId: "evt_e2e_luogu_verdict_fail",
      submissionId: "submission_e2e_domestic_luogu_fail",
      verdict: "Wrong Answer",
      occurredAt: "2026-07-20T11:02:00.000Z",
    }),
    captureEvent(luoguProblem, {
      type: "SUBMISSION_OBSERVED",
      eventId: "evt_e2e_luogu_submission_pass",
      submissionId: "submission_e2e_domestic_luogu_pass",
      occurredAt: "2026-07-20T11:03:00.000Z",
    }),
    captureEvent(luoguProblem, {
      type: "VERDICT_OBSERVED",
      eventId: "evt_e2e_luogu_verdict_pass",
      submissionId: "submission_e2e_domestic_luogu_pass",
      verdict: "Accepted",
      occurredAt: "2026-07-20T11:04:00.000Z",
    }),
  ]);

  const db = new Database(E2E_DB_PATH, { readonly: true });
  try {
    const attempts = db
      .prepare<[], AttemptRow>(`
        SELECT platform, problem_external_id, submission_id, canonical_url,
               verdict, result, voided_at
        FROM training_attempts
        WHERE submission_id LIKE 'submission_e2e_domestic_luogu_%'
        ORDER BY submission_id
      `)
      .all();

    expect(attempts).toHaveLength(2);

    const failedAttempt = attempts.find((a) => a.submission_id === "submission_e2e_domestic_luogu_fail");
    if (!failedAttempt) throw new Error("Luogu failed attempt not found");
    expect(failedAttempt.platform).toBe("luogu");
    expect(failedAttempt.problem_external_id).toBe("P1001");
    expect(failedAttempt.canonical_url).toBe("https://www.luogu.com.cn/problem/P1001");
    expect(failedAttempt.verdict).toBe("Wrong Answer");
    expect(failedAttempt.result).toBe("failed");
    expect(failedAttempt.voided_at).toBeNull();

    const passedAttempt = attempts.find((a) => a.submission_id === "submission_e2e_domestic_luogu_pass");
    if (!passedAttempt) throw new Error("Luogu passed attempt not found");
    expect(passedAttempt.platform).toBe("luogu");
    expect(passedAttempt.problem_external_id).toBe("P1001");
    expect(passedAttempt.canonical_url).toBe("https://www.luogu.com.cn/problem/P1001");
    expect(passedAttempt.verdict).toBe("Accepted");
    expect(passedAttempt.result).toBe("passed");
    expect(passedAttempt.voided_at).toBeNull();

    const sessions = db
      .prepare<[], SessionRow>(`
        SELECT id, platform, problem_external_id, canonical_url
        FROM training_sessions
        WHERE id = 'session_e2e_domestic_luogu_pipeline'
      `)
      .all();
    expect(sessions).toHaveLength(1);
    const session = sessions[0];
    if (!session) throw new Error("Luogu session not found");
    expect(session.platform).toBe("luogu");
    expect(session.problem_external_id).toBe("P1001");
    expect(session.canonical_url).toBe("https://www.luogu.com.cn/problem/P1001");
  } finally {
    db.close();
  }

  // UI: passed verdict — verdict is in the Training attempt panel, not the problem heading section
  await page.goto("/training?platform=luogu&externalId=P1001&title=A%2BB%20Problem");
  const luoguProblemSection = page.locator("section").filter({
    has: page.getByRole("heading", { name: "A+B Problem" }),
  });
  await expect(luoguProblemSection).toContainText("luogu");
  await expect(luoguProblemSection).toContainText("P1001");
  // canonical URL is in href, not visible text; DB layer already asserts it
  const luoguAttemptPanel = page.locator("section").filter({
    has: page.getByRole("heading", { name: "Training attempt" }),
  });
  await expect(luoguAttemptPanel).toContainText("luogu");
  await expect(luoguAttemptPanel).toContainText("P1001");
  await expect(luoguAttemptPanel).toContainText("Accepted");
  await expect(luoguAttemptPanel).not.toContainText("leetcode");
  await expect(luoguAttemptPanel).not.toContainText("NowCoder");
});

test("NowCoder capture pipeline — passed and failed verdicts are distinct", async ({
  page,
  request,
}) => {
  await postCaptureEvents(request, [
    captureEvent(nowCoderProblem, {
      type: "SESSION_STARTED",
      eventId: "evt_e2e_nowcoder_session",
      occurredAt: "2026-07-20T12:00:00.000Z",
    }),
    captureEvent(nowCoderProblem, {
      type: "SUBMISSION_OBSERVED",
      eventId: "evt_e2e_nowcoder_submission_fail",
      submissionId: "submission_e2e_nowcoder_fail",
      occurredAt: "2026-07-20T12:01:00.000Z",
    }),
    captureEvent(nowCoderProblem, {
      type: "VERDICT_OBSERVED",
      eventId: "evt_e2e_nowcoder_verdict_fail",
      submissionId: "submission_e2e_nowcoder_fail",
      verdict: "Time Limit Exceeded",
      occurredAt: "2026-07-20T12:02:00.000Z",
    }),
    captureEvent(nowCoderProblem, {
      type: "SUBMISSION_OBSERVED",
      eventId: "evt_e2e_nowcoder_submission_pass",
      submissionId: "submission_e2e_nowcoder_pass",
      occurredAt: "2026-07-20T12:03:00.000Z",
    }),
    captureEvent(nowCoderProblem, {
      type: "VERDICT_OBSERVED",
      eventId: "evt_e2e_nowcoder_verdict_pass",
      submissionId: "submission_e2e_nowcoder_pass",
      verdict: "Accepted",
      occurredAt: "2026-07-20T12:04:00.000Z",
    }),
  ]);

  const db = new Database(E2E_DB_PATH, { readonly: true });
  try {
    const attempts = db
      .prepare<[], AttemptRow>(`
        SELECT platform, problem_external_id, submission_id, canonical_url,
               verdict, result, voided_at
        FROM training_attempts
        WHERE submission_id LIKE 'submission_e2e_nowcoder_%'
        ORDER BY submission_id
      `)
      .all();

    expect(attempts).toHaveLength(2);

    const failedAttempt = attempts.find(
      (a) => a.submission_id === "submission_e2e_nowcoder_fail",
    );
    if (!failedAttempt) throw new Error("NowCoder failed attempt not found");
    expect(failedAttempt.platform).toBe("nowcoder");
    expect(failedAttempt.problem_external_id).toBe("acm/problem/319811");
    expect(failedAttempt.canonical_url).toBe("https://ac.nowcoder.com/acm/problem/319811");
    expect(failedAttempt.verdict).toBe("Time Limit Exceeded");
    // TLE → "partial" per classifyVerdict (time limit → partial)
    expect(failedAttempt.result).toBe("partial");
    expect(failedAttempt.voided_at).toBeNull();

    const passedAttempt = attempts.find(
      (a) => a.submission_id === "submission_e2e_nowcoder_pass",
    );
    if (!passedAttempt) throw new Error("NowCoder passed attempt not found");
    expect(passedAttempt.platform).toBe("nowcoder");
    expect(passedAttempt.problem_external_id).toBe("acm/problem/319811");
    expect(passedAttempt.canonical_url).toBe("https://ac.nowcoder.com/acm/problem/319811");
    expect(passedAttempt.verdict).toBe("Accepted");
    expect(passedAttempt.result).toBe("passed");
    expect(passedAttempt.voided_at).toBeNull();

    const sessions = db
      .prepare<[], SessionRow>(`
        SELECT id, platform, problem_external_id, canonical_url
        FROM training_sessions
        WHERE id = 'session_e2e_nowcoder'
      `)
      .all();
    expect(sessions).toHaveLength(1);
    const session = sessions[0];
    if (!session) throw new Error("NowCoder session not found");
    expect(session.platform).toBe("nowcoder");
    expect(session.problem_external_id).toBe("acm/problem/319811");
    expect(session.canonical_url).toBe("https://ac.nowcoder.com/acm/problem/319811");
  } finally {
    db.close();
  }

  // UI: passed verdict — verdict is in the Training attempt panel, not the problem heading section
  await page.goto(
    "/training?platform=nowcoder&externalId=acm%2Fproblem%2F319811&title=%E6%B1%82%E5%A5%87%E6%95%B0%E4%B9%8B%E5%92%8C",
  );
  const nowCoderProblemSection = page.locator("section").filter({
    has: page.getByRole("heading", { name: "求奇数之和" }),
  });
  await expect(nowCoderProblemSection).toContainText("nowcoder");
  await expect(nowCoderProblemSection).toContainText("acm/problem/319811");
  // canonical URL is in href, not visible text; DB layer already asserts it
  const nowCoderAttemptPanel = page.locator("section").filter({
    has: page.getByRole("heading", { name: "Training attempt" }),
  });
  await expect(nowCoderAttemptPanel).toContainText("nowcoder");
  await expect(nowCoderAttemptPanel).toContainText("acm/problem/319811");
  await expect(nowCoderAttemptPanel).toContainText("Accepted");
  await expect(nowCoderAttemptPanel).not.toContainText("Time Limit Exceeded");
  await expect(nowCoderAttemptPanel).not.toContainText("leetcode");
  await expect(nowCoderAttemptPanel).not.toContainText("Luogu");
});
