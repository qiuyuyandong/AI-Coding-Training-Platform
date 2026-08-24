import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  createSentryDevOptions,
  resolveSentryDevConfig,
  sanitizeSentryDevEvent,
} from "@/lib/observability/sentryDev";

const dsn = "https://publickey@o123.ingest.us.sentry.io/456";
const release = "0123456789abcdef0123456789abcdef01234567";

describe("development-only Sentry boundary", () => {
  it.each([
    { nodeEnv: "production", enabled: "1", dsn, release },
    { nodeEnv: "test", enabled: "1", dsn, release },
    { nodeEnv: "development", enabled: undefined, dsn, release },
    { nodeEnv: "development", enabled: "true", dsn, release },
    { nodeEnv: "development", enabled: "1", dsn: undefined, release },
    { nodeEnv: "development", enabled: "1", dsn: "http://o123.sentry.io/456", release },
    { nodeEnv: "development", enabled: "1", dsn: "https://example.com/456", release },
    { nodeEnv: "development", enabled: "1", dsn, release: "dev" },
  ])("stays disabled outside the exact closed gate", (input) => {
    expect(resolveSentryDevConfig(input)).toEqual({ enabled: false });
  });

  it("enables only development with an approved DSN and full Git SHA", () => {
    expect(resolveSentryDevConfig({ nodeEnv: "development", enabled: "1", dsn, release })).toEqual({
      enabled: true,
      dsn,
      environment: "development",
      release,
    });
  });

  it("projects an error to one minimal exception and strips sensitive context", () => {
    const event = sanitizeSentryDevEvent({
      event_id: "ABCDEF0123456789ABCDEF0123456789",
      timestamp: 1234.5,
      level: "fatal",
      platform: "node",
      message: "token=secret at C:\\Users\\person\\private.txt",
      request: { url: "http://localhost:3000/training?code=secret" },
      user: { email: "person@example.com", ip_address: "127.0.0.1" },
      breadcrumbs: [{ message: "clicked submit" }],
      contexts: { database: { query: "select secret" } },
      extra: { body: "source code" },
      tags: { platform: "leetcode" },
      transaction: "/training",
      fingerprint: ["private"],
      exception: {
        values: [{
          type: "TypeError",
          value: "attempt token secret",
          module: "private-module",
          stacktrace: {
            frames: [
              {
                filename: "C:\\Users\\person\\repo\\app\\training\\page.tsx",
                abs_path: "C:\\Users\\person\\repo\\app\\training\\page.tsx",
                function: "TrainingPage",
                lineno: 42,
                colno: 7,
                context_line: "const token = secret",
                vars: { token: "secret" },
              },
              { filename: "https://leetcode.cn/app/secret.ts", function: "remote" },
            ],
          },
        }],
      },
    }, release);

    expect(event).toEqual({
      type: undefined,
      event_id: "abcdef0123456789abcdef0123456789",
      timestamp: 1234.5,
      level: "error",
      platform: "javascript",
      environment: "development",
      release,
      exception: {
        values: [{
          type: "TypeError",
          value: "Development runtime exception",
          stacktrace: {
            frames: [{
              filename: "app/training/page.tsx",
              function: "TrainingPage",
              lineno: 42,
              colno: 7,
              in_app: true,
            }],
          },
        }],
      },
    });
  });

  it("drops message, transaction, replay, and malformed exception events", () => {
    expect(sanitizeSentryDevEvent({ message: "secret" }, release)).toBeNull();
    expect(sanitizeSentryDevEvent({ type: "transaction", exception: { values: [{ type: "Error" }] } }, release)).toBeNull();
    expect(sanitizeSentryDevEvent({ type: "replay_event", exception: { values: [{ type: "Error" }] } }, release)).toBeNull();
    expect(sanitizeSentryDevEvent({ exception: { values: [{ type: "Error with spaces" }] } }, release)).toBeNull();
  });

  it("returns a closed no-telemetry init contract", () => {
    const config = resolveSentryDevConfig({ nodeEnv: "development", enabled: "1", dsn, release });
    expect(config.enabled).toBe(true);
    if (!config.enabled) throw new Error("test config should be enabled");
    const options = createSentryDevOptions(config);

    expect(options).toMatchObject({
      enabled: true,
      environment: "development",
      release,
      sampleRate: 1,
      tracesSampleRate: 0,
      enableLogs: false,
      sendDefaultPii: false,
      sendClientReports: false,
      autoSessionTracking: false,
      maxBreadcrumbs: 0,
      dataCollection: {
        userInfo: false,
        cookies: false,
        httpHeaders: { request: false, response: false },
        httpBodies: [],
        urlQueryParams: false,
        graphQL: { document: false, variables: false },
        genAI: { inputs: false, outputs: false },
        databaseQueryData: false,
        stackFrameVariables: false,
        frameContextLines: 0,
      },
    });
    expect(options.beforeBreadcrumb()).toBeNull();
    expect(options.beforeSendTransaction()).toBeNull();
  });

  it("keeps wizard-only production surfaces absent", () => {
    const root = process.cwd();
    const nextConfig = readFileSync(resolve(root, "next.config.ts"), "utf8");
    const client = readFileSync(resolve(root, "instrumentation-client.ts"), "utf8");
    const server = readFileSync(resolve(root, "sentry.server.config.ts"), "utf8");
    const all = `${nextConfig}\n${client}\n${server}`;

    expect(all).not.toContain("withSentryConfig");
    expect(all).not.toContain("replayIntegration");
    expect(all).not.toContain("tunnelRoute");
    expect(all).not.toContain("automaticVercelMonitors");
    expect(client).not.toMatch(/^import \* as Sentry/mu);
    expect(client).toContain('process.env.NODE_ENV === "development"');
    expect(client).toContain('import("@sentry/nextjs")');
    expect(client).toContain('import("@/lib/observability/sentryDev")');
    expect(all).not.toMatch(/tracesSampleRate:\s*[1-9]/u);
    expect(all).not.toMatch(/enableLogs:\s*true/u);
    expect(all).not.toMatch(/https:\/\/[^\s"]+sentry\.io/u);
    expect(() => readFileSync(resolve(root, "app/sentry-example-page/page.tsx"), "utf8")).toThrow();
    expect(() => readFileSync(resolve(root, "app/api/sentry-example-api/route.ts"), "utf8")).toThrow();
  });
});
