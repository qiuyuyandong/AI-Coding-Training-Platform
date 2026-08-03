// @vitest-environment node

import { mkdirSync, mkdtempSync, rmSync, symlinkSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  auditV4ExtensionPrivacy,
  collectV4PrivacyFixtureFiles,
  collectV4PrivacyTargetFiles,
  loadV4ExtensionPrivacyAuditInput,
} from "@/scripts/audit-v4-extension-privacy.mjs";
import type { V4ExtensionPrivacyAuditInput } from "@/scripts/audit-v4-extension-privacy.mjs";

const approvedManifest = {
  manifest_version: 3,
  permissions: ["storage", "alarms", "webRequest", "downloads", "scripting", "webNavigation"],
  host_permissions: [
    "http://localhost:3000/*",
    "https://leetcode.com/*",
    "https://leetcode.cn/*",
    "https://www.nowcoder.com/*",
    "https://ac.nowcoder.com/*",
    "https://www.luogu.com.cn/*",
    "https://codeforces.com/*",
    "https://atcoder.jp/*",
  ],
  content_scripts: [{ matches: ["https://leetcode.com/problems/*"], js: ["content.js"] }],
  web_accessible_resources: [{
    resources: ["main-world-bridge.js"],
    matches: [
      "https://leetcode.com/*",
      "https://leetcode.cn/*",
      "https://www.nowcoder.com/*",
      "https://ac.nowcoder.com/*",
      "https://www.luogu.com.cn/*",
      "https://codeforces.com/*",
    ],
  }],
};

function input(overrides: Partial<V4ExtensionPrivacyAuditInput> = {}): V4ExtensionPrivacyAuditInput {
  const base: V4ExtensionPrivacyAuditInput = {
    sourceManifest: approvedManifest,
    targetManifest: approvedManifest,
    targetFiles: [
      "extension/dist/background.js",
      "extension/dist/background.js.map",
      "extension/dist/content.js",
      "extension/dist/content.js.map",
      "extension/dist/main-world-bridge.js",
      "extension/dist/main-world-bridge.js.map",
      "extension/dist/manifest.json",
      "extension/dist/popup.html",
      "extension/dist/popup.js",
      "extension/dist/popup.js.map",
    ],
    productionSources: {
      "extension/src/safe.ts": `
        const FORBIDDEN_INPUT_KEYS = new Set(["requestBody", "headers"]);
        chrome.storage.local.set({ captureEnabled: true });
        chrome.storage.session.set({ transientE1: [] });
      `,
      "extension/src/popup.html": "<script src=\"popup.js\"></script>",
      "extension/dist/popup.html": "<script src=\"popup.js\"></script>",
    },
    fixtures: {
      "tests/fixtures/capture-v4/fake/safe.json": JSON.stringify({
        scenario: "safe",
        safeEnvelopeOnly: true,
        forbiddenFields: [],
      }),
      "tests/fixtures/capture-v4/fake/problem-page.html": "Fake OJ; No real OJ endpoint",
      "tests/fixtures/oj/record.meta.json": JSON.stringify({
        fixtureName: "record",
        sourceUrl: "https://atcoder.jp/contests/abc/submissions/1",
        captureDate: "2026-08-03",
        captureMethod: "sanitized visible DOM",
        sanitized: true,
      }),
      "tests/fixtures/oj/record.html": "<main>sanitized verdict</main>",
    },
  };
  return {
    ...base,
    ...overrides,
    productionSources: {
      ...base.productionSources,
      ...(overrides.productionSources ?? {}),
    },
  };
}

describe("V4 extension privacy audit", () => {
  it("accepts the current source, exact target artifact, and fixture corpus", () => {
    expect(auditV4ExtensionPrivacy(loadV4ExtensionPrivacyAuditInput())).toEqual([]);
  });

  it("classifies requestBody in a rejection set as rejection rather than use", () => {
    expect(auditV4ExtensionPrivacy(input())).toEqual([]);
  });

  it.each([
    `const value = details.requestBody;`,
    `const value = details["requestBody"];`,
    `const options = { requestBody: true };`,
    `register(["requestBody"]);`,
  ])("rejects production request-body use while the allowlist is empty", (source) => {
    const findings = auditV4ExtensionPrivacy(input({
      productionSources: { "extension/src/unsafe.ts": source },
    }));
    expect(findings.some((finding) => finding.includes("requestBody"))).toBe(true);
  });

  it("rejects every production webRequest extraInfoSpec", () => {
    const findings = auditV4ExtensionPrivacy(input({
      productionSources: {
        "extension/src/unsafe.ts":
          `chrome.webRequest.onBeforeRequest.addListener(listener, filter, []);`,
      },
    }));
    expect(findings.some((finding) => finding.includes("extraInfoSpec"))).toBe(true);
  });

  it("rejects aliased webRequest extraInfoSpec and computed request-body access", () => {
    const findings = auditV4ExtensionPrivacy(input({
      productionSources: {
        "extension/src/unsafe.ts": `
          const wr = chrome.webRequest;
          wr.onBeforeRequest.addListener(listener, filter, []);
          const key = "request" + "Body";
          const leaked = details[key];
        `,
      },
    }));
    expect(findings.some((finding) => finding.includes("extraInfoSpec"))).toBe(true);
    expect(findings.some((finding) => finding.includes("computed"))).toBe(true);
  });

  it("rejects chained webRequest event and storage-area aliases", () => {
    const findings = auditV4ExtensionPrivacy(input({
      productionSources: {
        "extension/src/unsafe.ts": `
          const storageArea = chrome.storage.local;
          const local = storageArea;
          local.set({ body: details.body });
          const webRequest = chrome.webRequest;
          const before = webRequest.onBeforeRequest;
          before.addListener(listener, filter, []);
        `,
      },
    }));
    expect(findings.some((finding) => finding.includes("forbidden storage key body"))).toBe(true);
    expect(findings.some((finding) => finding.includes("extraInfoSpec"))).toBe(true);
  });

  it("rejects aliased background storage access outside the runtime wrapper", () => {
    const findings = auditV4ExtensionPrivacy(input({
      productionSources: {
        "extension/src/background.ts": `
          const local = chrome.storage.local;
          local.set({ captureEnabled: true });
        `,
      },
    }));
    expect(findings.some((finding) => finding.includes("runtime storage wrapper"))).toBe(true);
  });

  it("fails closed when a storage alias is ambiguous across scopes", () => {
    const findings = auditV4ExtensionPrivacy(input({
      productionSources: {
        "extension/src/unsafe.ts": `
          const area = chrome.storage.local;
          {
            const area = chrome.storage.session;
            area.set({ captureEnabled: true });
          }
        `,
      },
    }));
    expect(findings.some((finding) => finding.includes("ambiguous aliased Chrome storage"))).toBe(true);
  });

  it("rejects unverifiable spread writes to direct Chrome storage", () => {
    const findings = auditV4ExtensionPrivacy(input({
      productionSources: {
        "extension/src/unsafe.ts": `chrome.storage.local.set({ ...payload });`,
      },
    }));
    expect(findings.some((finding) => finding.includes("spread"))).toBe(true);
  });

  it("rejects reflective and destructured raw data flowing through trusted storage wrappers", () => {
    const findings = auditV4ExtensionPrivacy(input({
      productionSources: {
        "extension/src/background.ts": `
          const trustedLocalStorage = chromeArea(chrome.storage.local, "local");
          const key = "body";
          const reflected = Reflect.get(details, key);
          const { body: destructuredBody } = details;
          const aliasedBody = details.body;
          const carrier = { retained: details.body };
          const spreadCarrier = { ...details };
          const assignedCarrier = {};
          assignedCarrier.retained = details.body;
          const { envelope: { body: nestedBody } } = details;
          trustedLocalStorage.set({ captureEndpoint: reflected });
          trustedLocalStorage.set({ captureEndpoint: destructuredBody });
          trustedLocalStorage.set({ captureEndpoint: aliasedBody });
          trustedLocalStorage.set({ captureEndpoint: carrier.retained });
          trustedLocalStorage.set({ captureEndpoint: spreadCarrier.body });
          trustedLocalStorage.set({ captureEndpoint: assignedCarrier.retained });
          trustedLocalStorage.set({ captureEndpoint: nestedBody });
        `,
      },
    }));
    expect(findings.some((finding) => finding.includes("Reflect.get")
      || finding.includes("reflective"))).toBe(true);
    expect(findings.filter((finding) => finding.includes("storage write references forbidden raw data"))).toHaveLength(7);
  });

  it("requires trusted-context access levels in the production background", () => {
    const findings = auditV4ExtensionPrivacy(input({
      productionSources: { "extension/src/background.ts": "export {};" },
    }));
    expect(findings.some((finding) => finding.includes("local storage"))).toBe(true);
    expect(findings.some((finding) => finding.includes("session storage"))).toBe(true);
  });

  it("rejects direct background storage access outside the runtime wrapper", () => {
    const findings = auditV4ExtensionPrivacy(input({
      productionSources: {
        "extension/src/background.ts": `
          if (typeof chrome.storage.local.setAccessLevel === "function") {
            await chrome.storage.local.setAccessLevel({ accessLevel: "TRUSTED_CONTEXTS" });
          }
          await chrome.storage.session.setAccessLevel({ accessLevel: "TRUSTED_CONTEXTS" });
          await chrome.storage.local.set({ captureEnabled: true });
        `,
      },
    }));
    expect(findings.some((finding) => finding.includes("runtime storage wrapper"))).toBe(true);
  });

  it.each(["webRequestBlocking", "debugger", "devtools"]) (
    "rejects the forbidden %s permission",
    (permission) => {
      const findings = auditV4ExtensionPrivacy(input({
        sourceManifest: { ...approvedManifest, permissions: [...approvedManifest.permissions, permission] },
      }));
      expect(findings.some((finding) => finding.includes(permission))).toBe(true);
    },
  );

  it("rejects broad host access and test-only content scripts", () => {
    const findings = auditV4ExtensionPrivacy(input({
      sourceManifest: {
        ...approvedManifest,
        host_permissions: [...approvedManifest.host_permissions, "<all_urls>"],
        content_scripts: [{ matches: ["<all_urls>"], js: ["tests/fixture-content.js"] }],
      },
    }));
    expect(findings.some((finding) => finding.includes("host_permissions"))).toBe(true);
    expect(findings.some((finding) => finding.includes("test-only path"))).toBe(true);
  });

  it("rejects remote manifest fields and extra target artifacts", () => {
    const remoteManifest = { ...approvedManifest, update_url: "https://evil.example/update.xml" };
    const findings = auditV4ExtensionPrivacy(input({
      sourceManifest: remoteManifest,
      targetManifest: remoteManifest,
      targetFiles: [
        ...input().targetFiles,
        "extension/dist/vendor/remote-loader.mjs",
      ],
    }));
    expect(findings.some((finding) => finding.includes("remote manifest URL"))).toBe(true);
    expect(findings.some((finding) => finding.includes("target file inventory"))).toBe(true);
  });

  it("rejects a remote resource or source mismatch in target popup HTML", () => {
    const findings = auditV4ExtensionPrivacy(input({
      productionSources: {
        ...input().productionSources,
        "extension/dist/popup.html": "<script src=\"https://evil.example/remote.js\"></script>",
      },
    }));
    expect(findings.some((finding) => finding.includes("remote executable"))).toBe(true);
    expect(findings.some((finding) => finding.includes("differs from the source"))).toBe(true);
  });

  it("rejects forbidden raw keys written to storage, logs, or errors", () => {
    const findings = auditV4ExtensionPrivacy(input({
      productionSources: {
        "extension/src/unsafe.ts": `
          chrome.storage.local.set({ body: details.body });
          console.error(details.headers);
          throw new Error(details.token);
        `,
      },
    }));
    expect(findings.some((finding) => finding.includes("forbidden storage key body"))).toBe(true);
    expect(findings.some((finding) => finding.includes("console output"))).toBe(true);
    expect(findings.some((finding) => finding.includes("error output"))).toBe(true);
  });

  it("rejects local/session ownership inversion", () => {
    const findings = auditV4ExtensionPrivacy(input({
      productionSources: {
        "extension/src/unsafe.ts": `
          chrome.storage.local.set({ transientE1: [] });
          chrome.storage.session.set({ captureOutbox: [] });
        `,
      },
    }));
    expect(findings).toContain(
      "extension/src/unsafe.ts:2: transientE1 is not approved for chrome.storage.local",
    );
    expect(findings).toContain(
      "extension/src/unsafe.ts:3: captureOutbox is not approved for chrome.storage.session",
    );
  });

  it.each(["eval(source)", "new Function(source)", "importScripts(source)"])(
    "rejects remote-code surface %s",
    (source) => {
      expect(auditV4ExtensionPrivacy(input({
        productionSources: { "extension/src/unsafe.ts": source },
      }))).not.toEqual([]);
    },
  );

  it.each([
    `const filter = { urls: ["<all_urls>"] };`,
    `const filter = { urls: ["*://example.com/*"] };`,
    `import("https://example.com/module.js");`,
  ])("rejects broad filters and remote imports", (source) => {
    expect(auditV4ExtensionPrivacy(input({
      productionSources: { "extension/src/unsafe.ts": source },
    }))).not.toEqual([]);
  });

  it("rejects a target manifest that differs from source", () => {
    const findings = auditV4ExtensionPrivacy(input({
      targetManifest: { ...approvedManifest, permissions: ["storage"] },
    }));
    expect(findings).toContain("target: manifest differs from extension/manifest.json");
  });

  it("rejects synthetic fixtures without explicit safe-envelope provenance", () => {
    const findings = auditV4ExtensionPrivacy(input({
      fixtures: { "tests/fixtures/capture-v4/fake/unsafe.json": JSON.stringify({ scenario: "unsafe" }) },
    }));
    expect(findings).toContain(
      "tests/fixtures/capture-v4/fake/unsafe.json: synthetic fixture lacks explicit safe-envelope provenance",
    );
  });

  it("rejects real fixtures without provenance or with forbidden raw keys", () => {
    const findings = auditV4ExtensionPrivacy(input({
      fixtures: {
        "tests/fixtures/oj/unsafe.html": "<main>verdict</main>",
        "tests/fixtures/oj/network.json": JSON.stringify({ body: "secret" }),
      },
    }));
    expect(findings.some((finding) => finding.includes("lacks paired provenance"))).toBe(true);
    expect(findings.some((finding) => finding.includes("forbidden fixture key body"))).toBe(true);
    expect(findings.some((finding) => finding.includes("lacks embedded or paired provenance"))).toBe(true);
  });

  it("rejects malformed provenance, omitted sensitive aliases, and escaping fixture paths", () => {
    const findings = auditV4ExtensionPrivacy(input({
      fixtures: {
        "tests/fixtures/oj/bad.json": JSON.stringify({
          meta: {
            fixtureName: "wrong-name",
            sourceUrl: "not-a-url",
            captureDate: "not-a-date",
            captureMethod: "",
            sanitized: true,
          },
          rawHeaders: "secret",
          accessToken: "secret",
          Authorization: "Bearer secret",
          apiKey: "secret",
          session_token: "secret",
        }),
        "tests/fixtures/../escape.meta.json": JSON.stringify({
          fixtureName: "escape",
          sourceUrl: "https://atcoder.jp/",
          captureDate: "2026-08-03",
          captureMethod: "sanitized",
          sanitized: true,
        }),
      },
    }));
    expect(findings.some((finding) => finding.includes("rawHeaders"))).toBe(true);
    expect(findings.some((finding) => finding.includes("lacks embedded or paired provenance"))).toBe(true);
    expect(findings.some((finding) => finding.includes("unsafe fixture path"))).toBe(true);
  });

  it.each(["accessToken", "Authorization", "apiKey", "session_token"])(
    "rejects the case-normalized fixture credential alias %s",
    (key) => {
      const findings = auditV4ExtensionPrivacy(input({
        fixtures: {
          "tests/fixtures/oj/alias.json": JSON.stringify({
            meta: {
              fixtureName: "alias",
              sourceUrl: "https://atcoder.jp/contests/abc/submissions/1",
              captureDate: "2026-08-03",
              captureMethod: "sanitized",
              sanitized: true,
            },
            [key]: "secret",
          }),
        },
      }));
      expect(findings.some((finding) => finding.includes(key))).toBe(true);
    },
  );

  it("rejects linked source and fixture markers", () => {
    const findings = auditV4ExtensionPrivacy(input({
      productionSources: {
        "unsafe-link:extension/src/linked.ts": "",
      },
      fixtures: {
        "unsafe-link:tests/fixtures/oj/linked.json": "",
      },
    }));
    expect(findings.some((finding) => finding.includes("linked production path"))).toBe(true);
    expect(findings.some((finding) => finding.includes("linked fixture path"))).toBe(true);
  });

  it("discovers nested dist directories and fixture junctions without following them", () => {
    const root = mkdtempSync(join(tmpdir(), "v4-privacy-audit-"));
    const link = join(root, "tests", "fixtures", "linked");
    try {
      const dist = join(root, "extension", "dist");
      const fixtures = join(root, "tests", "fixtures");
      const target = join(root, "junction-target");
      mkdirSync(join(dist, "vendor"), { recursive: true });
      writeFileSync(join(dist, "manifest.json"), "{}");
      mkdirSync(fixtures, { recursive: true });
      mkdirSync(target, { recursive: true });
      writeFileSync(join(target, "secret.json"), "{}");
      symlinkSync(target, link, "junction");

      expect(collectV4PrivacyTargetFiles(root)).toContain(
        "unexpected-directory:extension/dist/vendor",
      );
      expect(Object.keys(collectV4PrivacyFixtureFiles(root))).toContain(
        "unsafe-link:tests/fixtures/linked",
      );
    } finally {
      try { unlinkSync(link); } catch { /* link may not have been created */ }
      rmSync(root, { recursive: true, force: true });
    }
  });
});
