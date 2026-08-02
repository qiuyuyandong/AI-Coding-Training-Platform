import { existsSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { chromium } from "@playwright/test";

const TARGETS = Object.freeze({
  "leetcode.cn": Object.freeze({
    platform: "leetcode",
    startUrl: "https://leetcode.cn/problemset/",
  }),
  "leetcode.com": Object.freeze({
    platform: "leetcode",
    startUrl: "https://leetcode.com/problemset/",
  }),
  "atcoder.jp": Object.freeze({
    platform: "atcoder",
    startUrl: "https://atcoder.jp/contests/",
  }),
  "codeforces.com": Object.freeze({
    platform: "codeforces",
    startUrl: "https://codeforces.com/problemset",
  }),
  "www.luogu.com.cn": Object.freeze({
    platform: "luogu",
    startUrl: "https://www.luogu.com.cn/problem/list",
  }),
});

function hostnameArgument(argv) {
  const argument = argv.find((value) => value.startsWith("--hostname="));
  return argument?.slice("--hostname=".length) ?? "";
}

function safeDownloadName(platform, suggestedFilename) {
  const expected = `${platform}-characterization-`;
  if (!suggestedFilename.startsWith(expected) || !suggestedFilename.endsWith(".json")) {
    return undefined;
  }
  return suggestedFilename.replaceAll(/[^a-z0-9._-]/giu, "_");
}

async function main() {
  const hostname = hostnameArgument(process.argv.slice(2));
  const target = TARGETS[hostname];
  if (target === undefined) {
    throw new Error(
      `Unsupported hostname. Choose one of: ${Object.keys(TARGETS).join(", ")}`,
    );
  }

  const extensionDist = resolve("extension", "dist");
  const manifestPath = resolve(extensionDist, "manifest.json");
  if (!existsSync(manifestPath)) {
    throw new Error("Production extension/dist is missing; run npm run extension:build first.");
  }

  const profilePath = resolve(".local", "v4-characterization", hostname.replaceAll(".", "-"));
  const outputPath = resolve("output", "playwright", "v4-characterization");
  mkdirSync(profilePath, { recursive: true });
  mkdirSync(outputPath, { recursive: true });

  const context = await chromium.launchPersistentContext(profilePath, {
    channel: "chromium",
    headless: false,
    acceptDownloads: true,
    downloadsPath: outputPath,
    args: [
      `--disable-extensions-except=${extensionDist}`,
      `--load-extension=${extensionDist}`,
      "--disable-features=ExtensionDisableUnsupportedDeveloper",
    ],
  });

  context.on("download", async (download) => {
    const filename = safeDownloadName(target.platform, download.suggestedFilename());
    if (filename === undefined) return;
    const destination = resolve(outputPath, filename);
    await download.saveAs(destination);
    process.stdout.write(`SAFE_EXPORT=${destination}\n`);
  });

  const existingWorker = context.serviceWorkers()[0];
  const worker = existingWorker ?? await context.waitForEvent("serviceworker", { timeout: 20_000 });
  const extensionId = new URL(worker.url()).hostname;
  const pages = context.pages();
  const platformPage = pages[0] ?? await context.newPage();
  await platformPage.goto(target.startUrl, { waitUntil: "domcontentloaded", timeout: 60_000 });

  const controlPage = await context.newPage();
  await controlPage.goto(`chrome-extension://${extensionId}/popup.html`);
  await controlPage.locator("#characterizationHostname").selectOption(hostname);
  await controlPage.evaluate(({ selectedHostname }) => {
    const setText = (selector, value) => {
      const element = document.querySelector(selector);
      if (element !== null) element.textContent = value;
    };
    setText("#characterizationHeading", "V4 安全诊断");
    setText(
      "#characterizationInfo",
      `仅记录 ${selectedHostname} 的请求路径与状态元数据；不记录代码、正文、请求头、Cookie 或身份信息。`,
    );
    const authenticatedLabel = document.querySelector(
      "label[for='characterizationAuthenticated']",
    );
    if (authenticatedLabel !== null) {
      const checkbox = authenticatedLabel.querySelector("input");
      authenticatedLabel.textContent = " 当前页面已由你本人登录";
      if (checkbox !== null) authenticatedLabel.prepend(checkbox);
    }
    setText("#characterizationStart", "开始 5 分钟诊断");
    setText("#characterizationStop", "停止诊断");
    setText("#characterizationExport", "导出安全记录");
    const heading = document.querySelector("#characterizationHeading");
    heading?.scrollIntoView({ block: "start" });
  }, { selectedHostname: hostname });

  process.stdout.write(`PLATFORM_URL=${target.startUrl}\n`);
  process.stdout.write(`CONTROL_URL=chrome-extension://${extensionId}/popup.html\n`);
  process.stdout.write(`OUTPUT_DIR=${outputPath}\n`);
  process.stdout.write("READY=1\n");

  await new Promise((complete) => {
    context.once("close", complete);
  });
}

main().catch((error) => {
  const message = error instanceof Error ? error.stack ?? error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});
