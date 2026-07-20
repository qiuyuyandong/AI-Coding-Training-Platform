import { mkdtempSync, rmSync, writeFileSync, readFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { describe, expect, it, afterAll, beforeAll } from "vitest";
import type { Server } from "node:http";

const SAMPLE_FIXTURE = join(process.cwd(), "tests", "fixtures", "curriculum", "sample-package");

async function startTestServer(): Promise<{ server: Server; port: number }> {
  const server = createServer();
  const redirectMap: Record<string, string> = {
    "/redirect-once": "/ok",
    "/redirect-twice": "/redirect-once",
    "/final-dup-alt": "/final-dup",
  };
  const chain = ["/r1", "/r2", "/r3", "/r4", "/r5", "/r6"];
  for (let i = 0; i < chain.length - 1; i++) {
    redirectMap[chain[i] as string] = chain[i + 1] as string;
  }
  redirectMap["/redirect-six"] = chain[0] as string;

  server.on("request", (req, res) => {
    const url = req.url ?? "/";
    if (url === "/ok" || url === "/final-dup") {
      res.writeHead(200, { "Content-Type": "text/plain" });
      res.end("x");
    } else if (url === "/not-found") {
      res.writeHead(404);
      res.end("not found");
    } else if (url === "/login") {
      res.writeHead(200, { "Content-Type": "text/html" });
      res.end('<input name="password">');
    } else if (url === "/seo-login-wall") {
      res.writeHead(200, { "Content-Type": "text/html" });
      res.end(
        '<!doctype html><html><head>'
        + '<meta name="robots" content="index,follow">'
        + '<meta name="description" content="This generic platform description is deliberately long enough to resemble SEO metadata while exposing no public problem statement to the visitor.">'
        + '<meta property="og:title" content="请登录后继续">'
        + '</head><body><main>请登录</main></body></html>',
      );
    } else if (url === "/slow") {
      setTimeout(() => {
        res.writeHead(200);
        res.end("slow response");
      }, 12_000);
    } else if (redirectMap[url]) {
      res.writeHead(301, { Location: redirectMap[url] });
      res.end();
    } else {
      res.writeHead(200);
      res.end("ok");
    }
  });

  return new Promise<{ server: Server; port: number }>((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const addr = server.address();
      if (!addr || typeof addr !== "object") {
        throw new Error("server.address() did not return a usable address");
      }
      resolve({ server, port: addr.port });
    });
  });
}

function writeMinimalPkg(dstDir: string, port: number, resourceUrl: string, resourceStableId: string): void {
  const pkgDir = join(dstDir, "pkg");
  mkdirSync(pkgDir, { recursive: true });
  const resources = [
    {
      stable_id: resourceStableId,
      title: "Test Resource",
      url: resourceUrl,
      author: "Test Author",
      language: "en",
      cost: "free",
      access: "open",
      license_boundary: "permissive_open",
      review_status: "reviewed",
      reviewed_at: "2026-07-17T00:00:00.000Z",
      stopping_guidance: "Stop after reading.",
      node_stable_id: "sample-node-a",
      role: "primary",
    },
    {
      stable_id: "sample-resource-b",
      title: "Sample Resource B",
      url: `http://127.0.0.1:${port}/ok`,
      author: "Sample Author",
      language: "en",
      cost: "free",
      access: "open",
      license_boundary: "permissive_open",
      review_status: "reviewed",
      reviewed_at: "2026-07-17T00:00:00.000Z",
      stopping_guidance: "Stop after completing the worked example.",
      node_stable_id: "sample-node-b",
      role: "primary",
    },
  ];

  const manifest = {
    track_slug: "sample-package",
    semantic_version: "1.0.0",
    source_revision: "fixture-sample-1",
    careers_file: "careers/career-directions-v1.json",
    checksum_input: "placeholder",
  };

  writeFileSync(join(pkgDir, "manifest.json"), JSON.stringify(manifest));
  writeFileSync(join(pkgDir, "resources.json"), JSON.stringify(resources));
  writeFileSync(join(pkgDir, "practice-mappings.json"), JSON.stringify([]));
  writeFileSync(join(pkgDir, "nodes.json"), JSON.stringify([]));
  writeFileSync(join(pkgDir, "edges.json"), JSON.stringify([]));

  const careersDir = join(pkgDir, "careers");
  mkdirSync(careersDir, { recursive: true });
  const careersData = readFileSync(join(SAMPLE_FIXTURE, "careers", "career-directions-v1.json"), "utf8");
  writeFileSync(join(careersDir, "career-directions-v1.json"), careersData);
}

type CliResult = {
  readonly status: number | null;
  readonly stdout: string;
  readonly stderr: string;
};

function runCli(pkgPath: string, outPath: string): Promise<CliResult> {
  return new Promise<CliResult>((resolve, reject) => {
    const child = spawn(
      process.execPath,
      [
        "scripts/check-curriculum-links.mjs",
        pkgPath,
        "--profile",
        "test",
        "--output",
        outPath,
      ],
      { cwd: process.cwd(), windowsHide: true },
    );
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk: string) => {
      stderr += chunk;
    });
    child.on("error", reject);
    child.on("close", (status) => {
      resolve({ status, stdout, stderr });
    });
  });
}

function readJson(path: string): unknown {
  return JSON.parse(readFileSync(path, "utf8"));
}

describe("check-curriculum-links", () => {
  let server: Server;
  let port: number;

  beforeAll(async () => {
    const result = await startTestServer();
    server = result.server;
    port = result.port;
  });

  afterAll(() => {
    if (server) {
      server.close();
    }
  });

  it("ok route: summary.failed === 0", async () => {
    const tmp = mkdtempSync(join(tmpdir(), "link-check-ok-"));
    try {
      writeMinimalPkg(tmp, port, `http://127.0.0.1:${port}/ok`, "sample-resource-a");
      const outPath = join(tmp, "out.json");
      const result = await runCli(join(tmp, "pkg"), outPath);
      expect(result.status).toBe(0);
      const output = readJson(outPath) as { summary: { failed: number } };
      expect(output.summary.failed).toBe(0);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("redirect-twice: resolves with 2 redirects", async () => {
    const tmp = mkdtempSync(join(tmpdir(), "link-check-redir2-"));
    try {
      writeMinimalPkg(tmp, port, `http://127.0.0.1:${port}/redirect-twice`, "sample-resource-a");
      const outPath = join(tmp, "out.json");
      await runCli(join(tmp, "pkg"), outPath);
      const output = readJson(outPath) as { results: Array<{ url: string; redirects: number }> };
      const r = output.results.find((res) => res.url.includes("/redirect-twice"));
      expect(r?.redirects).toBe(2);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("redirect-six: at least one result has redirect error", async () => {
    const tmp = mkdtempSync(join(tmpdir(), "link-check-redir6-"));
    try {
      writeMinimalPkg(tmp, port, `http://127.0.0.1:${port}/redirect-six`, "sample-resource-a");
      const outPath = join(tmp, "out.json");
      await runCli(join(tmp, "pkg"), outPath);
      const output = readJson(outPath) as { results: Array<{ ok: boolean; error?: string }> };
      const hasRedirectError = output.results.some(
        (r) => r.ok === false && r.error !== undefined && /redirect/i.test(r.error),
      );
      expect(hasRedirectError).toBe(true);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("slow: at least one result has abort/timeout error", async () => {
    const tmp = mkdtempSync(join(tmpdir(), "link-check-slow-"));
    try {
      writeMinimalPkg(tmp, port, `http://127.0.0.1:${port}/slow`, "sample-resource-a");
      const outPath = join(tmp, "out.json");
      await runCli(join(tmp, "pkg"), outPath);
      const output = readJson(outPath) as { results: Array<{ ok: boolean; error?: string }> };
      const hasTimeoutError = output.results.some(
        (r) => r.ok === false && r.error !== undefined && /abort|timeout/i.test(r.error),
      );
      expect(hasTimeoutError).toBe(true);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  }, 20_000);

  it("not-found: at least one result has 404/status error", async () => {
    const tmp = mkdtempSync(join(tmpdir(), "link-check-404-"));
    try {
      writeMinimalPkg(tmp, port, `http://127.0.0.1:${port}/not-found`, "sample-resource-a");
      const outPath = join(tmp, "out.json");
      await runCli(join(tmp, "pkg"), outPath);
      const output = readJson(outPath) as { results: Array<{ ok: boolean; error?: string }> };
      const has404Error = output.results.some(
        (r) => r.ok === false && r.error !== undefined && /(404|status)/i.test(r.error),
      );
      expect(has404Error).toBe(true);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("login: at least one result has password/login marker error", async () => {
    const tmp = mkdtempSync(join(tmpdir(), "link-check-login-"));
    try {
      writeMinimalPkg(tmp, port, `http://127.0.0.1:${port}/login`, "sample-resource-a");
      const outPath = join(tmp, "out.json");
      await runCli(join(tmp, "pkg"), outPath);
      const output = readJson(outPath) as { results: Array<{ ok: boolean; error?: string }> };
      const hasLoginError = output.results.some(
        (r) => r.ok === false && r.error !== undefined && /(password|login)/i.test(r.error),
      );
      expect(hasLoginError).toBe(true);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("rejects a login wall even when it carries indexable SEO metadata", async () => {
    const tmp = mkdtempSync(join(tmpdir(), "link-check-seo-login-wall-"));
    try {
      writeMinimalPkg(
        tmp,
        port,
        `http://127.0.0.1:${port}/seo-login-wall`,
        "sample-resource-a",
      );
      const outPath = join(tmp, "out.json");
      await runCli(join(tmp, "pkg"), outPath);
      const output = readJson(outPath) as {
        results: Array<{ url: string; ok: boolean; error?: string }>;
      };
      const loginResult = output.results.find((entry) =>
        entry.url.endsWith("/seo-login-wall"));
      expect(loginResult?.ok).toBe(false);
      expect(loginResult?.error).toMatch(/login|登录/iu);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("two distinct source URLs resolving to same final-dup: duplicates >= 1", async () => {
    const tmp = mkdtempSync(join(tmpdir(), "link-check-dup-"));
    try {
      const pkgDir = join(tmp, "pkg");
      mkdirSync(pkgDir, { recursive: true });
      const resources = [
        {
          stable_id: "sample-resource-a",
          title: "Sample Resource A",
          url: `http://127.0.0.1:${port}/final-dup`,
          author: "Sample Author",
          language: "en",
          cost: "free",
          access: "open",
          license_boundary: "permissive_open",
          review_status: "reviewed",
          reviewed_at: "2026-07-17T00:00:00.000Z",
          stopping_guidance: "Stop after reading the overview.",
          node_stable_id: "sample-node-a",
          role: "primary",
        },
        {
          stable_id: "sample-resource-b",
          title: "Sample Resource B",
          url: `http://127.0.0.1:${port}/final-dup-alt`,
          author: "Sample Author",
          language: "en",
          cost: "free",
          access: "open",
          license_boundary: "permissive_open",
          review_status: "reviewed",
          reviewed_at: "2026-07-17T00:00:00.000Z",
          stopping_guidance: "Stop after completing the worked example.",
          node_stable_id: "sample-node-b",
          role: "primary",
        },
      ];

      const manifest = {
        track_slug: "sample-package",
        semantic_version: "1.0.0",
        source_revision: "fixture-sample-1",
        careers_file: "careers/career-directions-v1.json",
        checksum_input: "placeholder",
      };

      writeFileSync(join(pkgDir, "manifest.json"), JSON.stringify(manifest));
      writeFileSync(join(pkgDir, "resources.json"), JSON.stringify(resources));
      writeFileSync(join(pkgDir, "practice-mappings.json"), JSON.stringify([]));
      writeFileSync(join(pkgDir, "nodes.json"), JSON.stringify([]));
      writeFileSync(join(pkgDir, "edges.json"), JSON.stringify([]));

      const careersDir = join(pkgDir, "careers");
      mkdirSync(careersDir, { recursive: true });
      const careersData = readFileSync(join(SAMPLE_FIXTURE, "careers", "career-directions-v1.json"), "utf8");
      writeFileSync(join(careersDir, "career-directions-v1.json"), careersData);

      const outPath = join(tmp, "out.json");
      await runCli(pkgDir, outPath);
      const output = readJson(outPath) as { summary: { duplicates: number } };
      expect(output.summary.duplicates).toBeGreaterThanOrEqual(1);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("deterministic: running twice on /ok produces equal JSON output", async () => {
    const tmp = mkdtempSync(join(tmpdir(), "link-check-det-"));
    try {
      writeMinimalPkg(tmp, port, `http://127.0.0.1:${port}/ok`, "sample-resource-a");
      const out1 = join(tmp, "out1.json");
      const out2 = join(tmp, "out2.json");
      await runCli(join(tmp, "pkg"), out1);
      await runCli(join(tmp, "pkg"), out2);
      const s1 = readFileSync(out1, "utf8");
      const s2 = readFileSync(out2, "utf8");
      expect(s1).toBe(s2);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });
});
