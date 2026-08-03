#!/usr/bin/env node

import { existsSync, lstatSync, readdirSync, readFileSync } from "node:fs";
import { basename, dirname, isAbsolute, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const here = dirname(fileURLToPath(import.meta.url));
const defaultRepoRoot = resolve(here, "..");

const ALLOWED_PERMISSIONS = Object.freeze([
  "storage", "alarms", "webRequest", "downloads", "scripting", "webNavigation",
]);
const ALLOWED_HOST_PERMISSIONS = Object.freeze([
  "http://localhost:3000/*",
  "https://leetcode.com/*",
  "https://leetcode.cn/*",
  "https://www.nowcoder.com/*",
  "https://ac.nowcoder.com/*",
  "https://www.luogu.com.cn/*",
  "https://codeforces.com/*",
  "https://atcoder.jp/*",
]);
const ALLOWED_WEB_ACCESSIBLE_MATCHES = Object.freeze([
  "https://leetcode.com/*",
  "https://leetcode.cn/*",
  "https://www.nowcoder.com/*",
  "https://ac.nowcoder.com/*",
  "https://www.luogu.com.cn/*",
  "https://codeforces.com/*",
]);
const FORBIDDEN_PERMISSIONS = new Set([
  "webRequestBlocking", "debugger", "devtools", "proxy", "cookies", "history", "tabs", "activeTab",
]);
const FORBIDDEN_DATA_KEYS = new Set([
  "body", "rawBody", "raw_body", "responseBody", "response_body", "responseText",
  "response_text", "code", "sourceCode", "source_code", "requestHeaders", "request_headers",
  "responseHeaders", "response_headers", "extraHeaders", "headers", "cookie", "cookies",
  "authorization", "auth", "csrf", "csrfToken", "csrf_token", "token", "requestBody",
  "request_body", "username", "user", "account", "accountId", "account_id", "email", "userId",
  "user_id", "fullStatement", "full_statement", "problemStatement", "problem_statement",
  "source", "rawHeaders", "raw_headers", "ip", "initiator", "credential", "credentials",
  "password",
]);
const FORBIDDEN_FIXTURE_KEYS = new Set([
  ...[...FORBIDDEN_DATA_KEYS].map(normalizeSensitiveKey),
  "accesstoken", "apikey", "sessiontoken", "secret", "clientsecret", "bearertoken",
]);
const TARGET_FILES = Object.freeze([
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
]);
const LOCAL_KEYS = new Set([
  "installationId", "captureCredential", "captureCredentialVersion", "captureEnabled",
  "captureEndpoint", "captureProtocolVersion", "confirmedSubmissions",
  "confirmedSubmissionTombstones", "captureOutbox", "captureQuarantine", "lastCaptureError",
  "lastSuccessfulCaptureAt", "lastDeliveredAttemptId", "lastDeliveredAttemptStatus", "pairedAt",
  "v4ClickIntentMigration", "discardedPreBundleEventCount", "preBundleQueueDiscardedAt",
  "pendingSubmissionIntents", "eventQueue", "outbox", "quarantine",
]);
const SESSION_KEYS = new Set([
  "uiHints", "transientE1", "transientPageContexts", "transientUnmatchedE3",
  "transientAmbiguityDiagnostics", "characterizationSession", "b3WitnessState",
  "contentIngressDiagnostics", "contentIngressReady", "webRequestSpikeMarkers",
  "leetcodeEndpointDiagnostics",
]);

function normalizePath(path) {
  return path.replaceAll("\\", "/");
}

function normalizeSensitiveKey(key) {
  return key.replace(/[^a-z0-9]/giu, "").toLowerCase();
}

function stableUnique(values) {
  return [...new Set(values)].sort();
}

function exactStringArray(value) {
  return Array.isArray(value) && value.every((entry) => typeof entry === "string")
    ? stableUnique(value)
    : null;
}

function compareExactArray(value, expected, label, findings) {
  const actual = exactStringArray(value);
  if (actual === null || JSON.stringify(actual) !== JSON.stringify(stableUnique(expected))) {
    findings.push(`manifest: ${label} must equal the approved allowlist`);
  }
}

function auditManifest(manifest, label, findings) {
  if (typeof manifest !== "object" || manifest === null || Array.isArray(manifest)) {
    findings.push(`${label}: manifest must be a JSON object`);
    return;
  }
  compareExactArray(manifest.permissions, ALLOWED_PERMISSIONS, `${label} permissions`, findings);
  compareExactArray(manifest.host_permissions, ALLOWED_HOST_PERMISSIONS, `${label} host_permissions`, findings);
  const permissions = exactStringArray(manifest.permissions) ?? [];
  for (const permission of permissions) {
    if (FORBIDDEN_PERMISSIONS.has(permission)) findings.push(`${label}: forbidden permission ${permission}`);
  }
  const hosts = exactStringArray(manifest.host_permissions) ?? [];
  if (hosts.some((host) => host === "<all_urls>" || host.includes("://*/*") || host.startsWith("*://"))) {
    findings.push(`${label}: broad host permission is forbidden`);
  }
  if (manifest.optional_permissions !== undefined || manifest.optional_host_permissions !== undefined) {
    findings.push(`${label}: optional permission surfaces are not approved`);
  }
  if (manifest.devtools_page !== undefined || manifest.externally_connectable !== undefined) {
    findings.push(`${label}: DevTools and external connection surfaces are forbidden`);
  }
  const contentScripts = Array.isArray(manifest.content_scripts) ? manifest.content_scripts : [];
  for (const entry of contentScripts) {
    if (typeof entry !== "object" || entry === null || Array.isArray(entry)) continue;
    const scripts = exactStringArray(entry.js) ?? [];
    if (scripts.some((path) => /(?:^|\/)(?:tests?|fixtures?|\.tmp)(?:\/|$)/iu.test(path))) {
      findings.push(`${label}: content_scripts contains a test-only path`);
    }
  }
  const resources = Array.isArray(manifest.web_accessible_resources)
    ? manifest.web_accessible_resources
    : [];
  if (resources.length !== 1 || typeof resources[0] !== "object" || resources[0] === null
    || Array.isArray(resources[0])) {
    findings.push(`${label}: web_accessible_resources must contain the approved bridge entry`);
  } else {
    compareExactArray(resources[0].resources, ["main-world-bridge.js"], `${label} bridge resources`, findings);
    compareExactArray(resources[0].matches, ALLOWED_WEB_ACCESSIBLE_MATCHES, `${label} bridge matches`, findings);
  }
  findUnapprovedManifestUrls(manifest, [], label, findings);
}

function findUnapprovedManifestUrls(value, path, label, findings) {
  if (typeof value === "string") {
    if (!/^https?:\/\//iu.test(value)) return;
    const joined = path.join(".");
    const approvedLocation = joined === "host_permissions"
      || /^content_scripts\.\d+\.matches$/u.test(joined)
      || /^web_accessible_resources\.\d+\.matches$/u.test(joined);
    if (!approvedLocation) findings.push(`${label}: remote manifest URL at ${joined}`);
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((entry, index) => findUnapprovedManifestUrls(entry, [...path, String(index)], label, findings));
    return;
  }
  if (!isObject(value)) return;
  for (const [key, nested] of Object.entries(value)) {
    const next = [...path, key];
    if (Array.isArray(nested) && ["host_permissions", "matches"].includes(key)) {
      for (const entry of nested) findUnapprovedManifestUrls(entry, [...path, key], label, findings);
    } else {
      findUnapprovedManifestUrls(nested, next, label, findings);
    }
  }
}

function propertyName(node, constants = new Map()) {
  if (ts.isIdentifier(node) || ts.isStringLiteral(node) || ts.isNumericLiteral(node)) return node.text;
  if (ts.isComputedPropertyName(node)) return staticString(node.expression, constants);
  return null;
}

function isForbiddenDeclarationLiteral(node) {
  let current = node.parent;
  while (current !== undefined) {
    if (ts.isVariableDeclaration(current)) {
      return ts.isIdentifier(current.name) && /forbidden/iu.test(current.name.text);
    }
    if (ts.isStatement(current) || ts.isSourceFile(current)) return false;
    current = current.parent;
  }
  return false;
}

function lineOf(sourceFile, node) {
  return sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1;
}

function directChromeStorageArea(node) {
  if (!ts.isPropertyAccessExpression(node) || !["local", "session"].includes(node.name.text)) return null;
  const storageAccess = node.expression;
  if (!ts.isPropertyAccessExpression(storageAccess) || storageAccess.name.text !== "storage") return null;
  if (!ts.isIdentifier(storageAccess.expression) || storageAccess.expression.text !== "chrome") return null;
  return node.name.text;
}

function chromeStorageArea(call, storageAliases) {
  if (!ts.isPropertyAccessExpression(call.expression)) return null;
  if (!ts.isIdentifier(call.expression.name) || !["get", "set", "remove"].includes(call.expression.name.text)) return null;
  const areaAccess = call.expression.expression;
  const direct = directChromeStorageArea(areaAccess);
  if (direct !== null) return direct;
  return ts.isIdentifier(areaAccess) ? storageAliases.get(areaAccess.text) ?? null : null;
}

function storageAreaFromExpression(node, storageAliases) {
  const direct = directChromeStorageArea(node);
  if (direct !== null) return direct;
  if (ts.isIdentifier(node)) return storageAliases.get(node.text) ?? null;
  if (!ts.isCallExpression(node) || !ts.isIdentifier(node.expression)
    || node.expression.text !== "chromeArea") return null;
  const factoryArea = node.arguments[0] === undefined
    ? null
    : directChromeStorageArea(node.arguments[0])
      ?? (ts.isIdentifier(node.arguments[0])
        ? storageAliases.get(node.arguments[0].text) ?? null
        : null);
  return factoryArea === "local" || factoryArea === "session" ? factoryArea : null;
}

function isTrustedStorageFactoryCall(node, storageAliases) {
  return ts.isCallExpression(node)
    && ts.isIdentifier(node.expression)
    && node.expression.text === "chromeArea"
    && storageAreaFromExpression(node, storageAliases) !== null;
}

function literalKeys(node, constants = new Map()) {
  if (node === undefined) return [];
  const scalar = staticString(node, constants);
  if (scalar !== null) return [scalar];
  if (ts.isArrayLiteralExpression(node)) return node.elements.flatMap((entry) => literalKeys(entry, constants));
  if (ts.isObjectLiteralExpression(node)) {
    return node.properties.flatMap((property) => {
      if (ts.isPropertyAssignment(property) || ts.isShorthandPropertyAssignment(property)
        || ts.isMethodDeclaration(property)) {
        const name = propertyName(property.name, constants);
        return name === null ? [] : [name];
      }
      return [];
    });
  }
  return [];
}

function isReflectGetCall(node) {
  return ts.isCallExpression(node)
    && ts.isPropertyAccessExpression(node.expression)
    && ts.isIdentifier(node.expression.expression)
    && node.expression.expression.text === "Reflect"
    && node.expression.name.text === "get";
}

function isSensitiveRawRead(node, sensitiveAliases, stringConstants) {
  if (isReflectGetCall(node)) {
    const target = node.arguments[0];
    if (!ts.isIdentifier(target) || !sensitiveAliases.has(target.text)) return false;
    const key = staticString(node.arguments[1], stringConstants);
    return key === null || FORBIDDEN_DATA_KEYS.has(key);
  }
  if (ts.isPropertyAccessExpression(node)) {
    return FORBIDDEN_DATA_KEYS.has(node.name.text)
      && ts.isIdentifier(node.expression)
      && sensitiveAliases.has(node.expression.text);
  }
  if (ts.isElementAccessExpression(node) && ts.isIdentifier(node.expression)
    && sensitiveAliases.has(node.expression.text)) {
    const key = staticString(node.argumentExpression, stringConstants);
    return key === null || FORBIDDEN_DATA_KEYS.has(key);
  }
  return false;
}

function isBindingIdentifier(node) {
  const parent = node.parent;
  return (ts.isVariableDeclaration(parent) && parent.name === node)
    || (ts.isParameter(parent) && parent.name === node)
    || (ts.isBindingElement(parent) && parent.name === node)
    || ((ts.isFunctionDeclaration(parent) || ts.isFunctionExpression(parent))
      && parent.name === node);
}

function expressionContainsForbiddenAccess(
  root,
  sensitiveAliases,
  stringConstants = new Map(),
  opaqueAliases = new Set(),
) {
  const flowSensitiveAliases = sensitiveAliases ?? new Set();
  const hasFlowAliases = sensitiveAliases !== undefined;
  let found = false;
  function visit(node) {
    if (ts.isPropertyAccessExpression(node) && ts.isIdentifier(node.expression)
      && (opaqueAliases.has(node.expression.text)
        || (FORBIDDEN_DATA_KEYS.has(node.name.text)
          && (!hasFlowAliases || flowSensitiveAliases.has(node.expression.text))))) {
      found = true;
    }
    if (ts.isElementAccessExpression(node) && node.argumentExpression !== undefined
      && ts.isIdentifier(node.expression)
      && (opaqueAliases.has(node.expression.text)
        || (ts.isStringLiteral(node.argumentExpression)
          && FORBIDDEN_DATA_KEYS.has(node.argumentExpression.text)
          && (!hasFlowAliases || flowSensitiveAliases.has(node.expression.text))))) found = true;
    if (hasFlowAliases && isReflectGetCall(node)) {
      const target = node.arguments[0];
      if (ts.isIdentifier(target) && (flowSensitiveAliases.has(target.text) || opaqueAliases.has(target.text))) {
        const key = staticString(node.arguments[1], stringConstants);
        if (opaqueAliases.has(target.text) || key === null || FORBIDDEN_DATA_KEYS.has(key)) found = true;
      }
    }
    if (hasFlowAliases && ts.isIdentifier(node) && !isBindingIdentifier(node)
      && flowSensitiveAliases.has(node.text)) {
      const parent = node.parent;
      const isPropertyReceiver = ts.isPropertyAccessExpression(parent) && parent.expression === node;
      const isElementReceiver = ts.isElementAccessExpression(parent) && parent.expression === node;
      const isReflectTarget = isReflectGetCall(parent) && parent.arguments[0] === node;
      if (!isPropertyReceiver && !isElementReceiver && !isReflectTarget) found = true;
    }
    if (hasFlowAliases && ts.isIdentifier(node) && !isBindingIdentifier(node)
      && opaqueAliases.has(node.text)) found = true;
    ts.forEachChild(node, visit);
  }
  visit(root);
  return found;
}

function isConsoleCall(node) {
  return ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)
    && ts.isIdentifier(node.expression.expression) && node.expression.expression.text === "console";
}

function isErrorConstruction(node) {
  return (ts.isNewExpression(node) || ts.isCallExpression(node))
    && ts.isIdentifier(node.expression) && node.expression.text === "Error";
}

function isChromeWebRequestAccess(node) {
  return ts.isPropertyAccessExpression(node)
    && node.name.text === "webRequest"
    && ts.isIdentifier(node.expression)
    && node.expression.text === "chrome";
}

function isWebRequestObjectExpression(node, aliases) {
  return isChromeWebRequestAccess(node)
    || (ts.isIdentifier(node) && aliases.has(node.text));
}

function isWebRequestEventExpression(node, aliases) {
  return ts.isPropertyAccessExpression(node) && isWebRequestObjectExpression(node.expression, aliases);
}

function isWebRequestAddListener(node, aliases, eventAliases) {
  if (!ts.isCallExpression(node) || !ts.isPropertyAccessExpression(node.expression)
    || node.expression.name.text !== "addListener") return false;
  const eventAccess = node.expression.expression;
  if (ts.isIdentifier(eventAccess) && eventAliases.has(eventAccess.text)) return true;
  if (!ts.isPropertyAccessExpression(eventAccess)) return false;
  const webRequestAccess = eventAccess.expression;
  return isWebRequestObjectExpression(webRequestAccess, aliases);
}

function staticString(node, constants) {
  if (node === undefined) return null;
  if (ts.isStringLiteral(node)) return node.text;
  if (ts.isIdentifier(node)) return constants.get(node.text) ?? null;
  if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.PlusToken) {
    const left = staticString(node.left, constants);
    const right = staticString(node.right, constants);
    return left === null || right === null ? null : left + right;
  }
  return null;
}

function auditProductionSource(path, text, findings) {
  if (path.endsWith(".html")) {
    if (/<script\b[^>]*\bsrc\s*=\s*["']https?:\/\//iu.test(text)
      || /<link\b[^>]*\bhref\s*=\s*["']https?:\/\//iu.test(text)) {
      findings.push(`${path}: remote executable or stylesheet resource is forbidden`);
    }
    return;
  }
  const scriptKind = path.endsWith(".js") ? ts.ScriptKind.JS : ts.ScriptKind.TS;
  const sourceFile = ts.createSourceFile(path, text, ts.ScriptTarget.Latest, true, scriptKind);
  const advancedDataFlow = path === "extension/src/background.ts";
  const webRequestAliases = new Set();
  const webRequestEventAliases = new Set();
  const storageAliases = new Map();
  const trustedStorageAliases = new Set();
  const sensitiveAliases = new Set(["details", "request", "response", "payload"]);
  const opaqueAliases = new Set();
  const stringConstants = new Map();
  let aliasesChanged = true;
  function addAlias(set, name) {
    if (set.has(name)) return;
    set.add(name);
    aliasesChanged = true;
  }
  function recordStorageAlias(name, area) {
    if (!storageAliases.has(name)) {
      storageAliases.set(name, area);
      aliasesChanged = true;
      return;
    }
    const prior = storageAliases.get(name);
    if (prior !== "ambiguous" && prior !== area) {
      storageAliases.set(name, "ambiguous");
      aliasesChanged = true;
    }
  }
  function recordStringConstant(name, value) {
    if (!stringConstants.has(name)) {
      stringConstants.set(name, value);
      aliasesChanged = true;
      return;
    }
    const prior = stringConstants.get(name);
    if (prior !== null && prior !== value) {
      stringConstants.set(name, null);
      aliasesChanged = true;
    }
  }

  function markSensitiveBinding(binding, forceAll) {
    if (ts.isIdentifier(binding)) {
      addAlias(sensitiveAliases, binding.text);
      return;
    }
    if (!ts.isObjectBindingPattern(binding)) return;
    for (const element of binding.elements) {
      if (!ts.isBindingElement(element)) continue;
      if (element.dotDotDotToken !== undefined || forceAll) {
        markSensitiveBinding(element.name, true);
        continue;
      }
      const property = element.propertyName === undefined
        ? (ts.isIdentifier(element.name) ? element.name.text : null)
        : propertyName(element.propertyName, stringConstants);
      const forbidden = property === null || FORBIDDEN_DATA_KEYS.has(property);
      if (ts.isObjectBindingPattern(element.name)) {
        markSensitiveBinding(element.name, forceAll || forbidden);
      } else if (forbidden) {
        markSensitiveBinding(element.name, true);
      }
    }
  }

  function collect(node) {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer !== undefined) {
      const storageArea = storageAreaFromExpression(node.initializer, storageAliases);
      if (storageArea !== null) {
        recordStorageAlias(node.name.text, storageArea);
        if (isTrustedStorageFactoryCall(node.initializer, storageAliases)
          || (ts.isIdentifier(node.initializer) && trustedStorageAliases.has(node.initializer.text))) {
          addAlias(trustedStorageAliases, node.name.text);
        }
      }
      if (isChromeWebRequestAccess(node.initializer)
        || (ts.isIdentifier(node.initializer) && webRequestAliases.has(node.initializer.text))) {
        addAlias(webRequestAliases, node.name.text);
      }
      if (isWebRequestEventExpression(node.initializer, webRequestAliases)) {
        addAlias(webRequestEventAliases, node.name.text);
      }
      if (ts.isIdentifier(node.initializer) && sensitiveAliases.has(node.initializer.text)) {
        addAlias(sensitiveAliases, node.name.text);
      }
      if (advancedDataFlow && isSensitiveRawRead(node.initializer, sensitiveAliases, stringConstants)) {
        addAlias(sensitiveAliases, node.name.text);
      }
      if (advancedDataFlow && expressionContainsForbiddenAccess(
        node.initializer,
        sensitiveAliases,
        stringConstants,
        opaqueAliases,
      )) {
        if (ts.isObjectLiteralExpression(node.initializer) || ts.isArrayLiteralExpression(node.initializer)
          || (ts.isIdentifier(node.initializer) && opaqueAliases.has(node.initializer.text))) {
          addAlias(opaqueAliases, node.name.text);
        } else {
          addAlias(sensitiveAliases, node.name.text);
        }
      }
      const value = staticString(node.initializer, stringConstants);
      if (value !== null) recordStringConstant(node.name.text, value);
    }
    if (advancedDataFlow && ts.isVariableDeclaration(node) && node.initializer !== undefined
      && ts.isIdentifier(node.initializer)
      && (sensitiveAliases.has(node.initializer.text) || opaqueAliases.has(node.initializer.text))) {
      markSensitiveBinding(node.name, opaqueAliases.has(node.initializer.text));
      if (ts.isObjectBindingPattern(node.name) && opaqueAliases.has(node.initializer.text)) {
        markSensitiveBinding(node.name, true);
      }
    }
    if (advancedDataFlow && ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.EqualsToken
      && ts.isPropertyAccessExpression(node.left)
      && ts.isIdentifier(node.left.expression)
      && expressionContainsForbiddenAccess(node.right, sensitiveAliases, stringConstants, opaqueAliases)) {
      addAlias(opaqueAliases, node.left.expression.text);
    }
    ts.forEachChild(node, collect);
  }
  while (aliasesChanged) {
    aliasesChanged = false;
    collect(sourceFile);
  }
  function report(node, message) {
    findings.push(`${path}:${lineOf(sourceFile, node)}: ${message}`);
  }
  function visit(node) {
    if (ts.isStringLiteral(node) && node.text === "requestBody" && !isForbiddenDeclarationLiteral(node)) {
      report(node, "production requestBody use is forbidden; the allowlist is empty");
    }
    if (ts.isStringLiteral(node) && (node.text === "<all_urls>" || node.text.startsWith("*://"))) {
      report(node, "broad production request filter is forbidden");
    }
    if (ts.isPropertyAccessExpression(node) && node.name.text === "requestBody") {
      report(node, "production requestBody property access is forbidden");
    }
    if (ts.isElementAccessExpression(node) && node.argumentExpression !== undefined
      && ts.isStringLiteral(node.argumentExpression) && node.argumentExpression.text === "requestBody") {
      report(node, "production requestBody element access is forbidden");
    }
    if (ts.isElementAccessExpression(node) && node.argumentExpression !== undefined
      && !ts.isStringLiteral(node.argumentExpression)) {
      const resolved = staticString(node.argumentExpression, stringConstants);
      if (resolved !== null && FORBIDDEN_DATA_KEYS.has(resolved)) {
        report(node, `computed forbidden raw-data access ${resolved}`);
      } else if (ts.isIdentifier(node.expression) && sensitiveAliases.has(node.expression.text)) {
        report(node, "unverifiable computed access on sensitive input");
      }
    }
    if (ts.isPropertyAssignment(node) && propertyName(node.name) === "requestBody") {
      report(node, "production requestBody property is forbidden");
    }
    if (isReflectGetCall(node)) {
      const target = node.arguments[0];
      if (ts.isIdentifier(target)
        && (sensitiveAliases.has(target.text) || opaqueAliases.has(target.text))) {
        const key = staticString(node.arguments[1], stringConstants);
        if (opaqueAliases.has(target.text) || key === null || FORBIDDEN_DATA_KEYS.has(key)) {
          report(node, "reflective forbidden raw-data access on sensitive input");
        }
      }
    }
    if (ts.isCallExpression(node)) {
      if (isWebRequestAddListener(node, webRequestAliases, webRequestEventAliases) && node.arguments.length > 2) {
        report(node, "production webRequest listener extraInfoSpec is forbidden");
      }
      const area = chromeStorageArea(node, storageAliases);
      if (area !== null) {
        if (area === "ambiguous") {
          report(node, "ambiguous aliased Chrome storage access cannot be verified");
        }
        const receiver = ts.isPropertyAccessExpression(node.expression)
          && ts.isIdentifier(node.expression.expression)
          ? node.expression.expression.text
          : null;
        if (path === "extension/src/background.ts"
          && (receiver === null || !trustedStorageAliases.has(receiver))) {
          report(node, "extension/src/background.ts: storage access must use the runtime storage wrapper");
        }
        if (node.arguments[0] !== undefined && ts.isObjectLiteralExpression(node.arguments[0])
          && node.arguments[0].properties.some(ts.isSpreadAssignment)) {
          report(node, "unverifiable spread write to Chrome storage");
        }
        const allowed = area === "local"
          ? LOCAL_KEYS
          : area === "session" ? SESSION_KEYS : new Set();
        for (const key of literalKeys(node.arguments[0], stringConstants)) {
          if (FORBIDDEN_DATA_KEYS.has(key)) report(node, `forbidden storage key ${key}`);
          if (!allowed.has(key)) report(node, `${key} is not approved for chrome.storage.${area}`);
        }
        if (advancedDataFlow && node.arguments[0] !== undefined
          && expressionContainsForbiddenAccess(
            node.arguments[0],
            sensitiveAliases,
            stringConstants,
            opaqueAliases,
          )) {
          report(node, "storage write references forbidden raw data");
        }
      }
      if (isConsoleCall(node) && node.arguments.some((argument) => advancedDataFlow
        ? expressionContainsForbiddenAccess(argument, sensitiveAliases, stringConstants, opaqueAliases)
        : expressionContainsForbiddenAccess(argument))) {
        report(node, "console output references forbidden raw data");
      }
      if (ts.isIdentifier(node.expression) && ["eval", "importScripts"].includes(node.expression.text)) {
        report(node, `${node.expression.text} remote-code surface is forbidden`);
      }
      if (node.expression.kind === ts.SyntaxKind.ImportKeyword) {
        if (node.arguments.length !== 1 || !ts.isStringLiteral(node.arguments[0])) {
          report(node, "non-literal dynamic import is forbidden");
        } else if (/^https?:\/\//iu.test(node.arguments[0].text)) {
          report(node, "remote dynamic import is forbidden");
        }
      }
    }
    if (isErrorConstruction(node) && (node.arguments ?? []).some((argument) => advancedDataFlow
      ? expressionContainsForbiddenAccess(argument, sensitiveAliases, stringConstants, opaqueAliases)
      : expressionContainsForbiddenAccess(argument))) {
      report(node, "error output references forbidden raw data");
    }
    if (ts.isNewExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === "Function") {
      report(node, "Function constructor remote-code surface is forbidden");
    }
    if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)
      && /^https?:\/\//iu.test(node.moduleSpecifier.text)) {
      report(node, "remote static import is forbidden");
    }
    ts.forEachChild(node, visit);
  }
  visit(sourceFile);
}

function isObject(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasRealFixtureProvenance(meta) {
  if (!isObject(meta) || !isNonEmptyString(meta.fixtureName) || !isRealIsoDate(meta.captureDate)) return false;
  const standard = isApprovedOjUrl(meta.sourceUrl) && isNonEmptyString(meta.captureMethod)
    && meta.sanitized === true;
  const privacy = isObject(meta.privacy) ? meta.privacy : null;
  const gatedNetwork = isNonEmptyString(meta.preflightReceipt) && privacy?.sanitized === true
    && privacy?.productionEligible === false;
  return standard || gatedNetwork;
}

function isNonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function isRealIsoDate(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/u.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function isApprovedOjUrl(value) {
  if (typeof value !== "string") return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.username === "" && url.password === ""
      && ["leetcode.com", "leetcode.cn", "www.nowcoder.com", "ac.nowcoder.com",
        "www.luogu.com.cn", "codeforces.com", "atcoder.jp"].includes(url.hostname);
  } catch {
    return false;
  }
}

function fixtureBaseName(path) {
  return basename(path).replace(/\.meta\.json$|\.json$|\.html$/u, "");
}

function isSafeRelativePath(path) {
  const normalized = normalizePath(path);
  return !isAbsolute(path) && !normalized.startsWith("/")
    && !normalized.split("/").includes("..") && !normalized.includes("//");
}

function findForbiddenFixtureKey(value, path = "") {
  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index += 1) {
      const found = findForbiddenFixtureKey(value[index], `${path}[${index}]`);
      if (found !== null) return found;
    }
    return null;
  }
  if (!isObject(value)) return null;
  for (const [key, nested] of Object.entries(value)) {
    const nextPath = path === "" ? key : `${path}.${key}`;
    if (FORBIDDEN_FIXTURE_KEYS.has(normalizeSensitiveKey(key))) return nextPath;
    const found = findForbiddenFixtureKey(nested, nextPath);
    if (found !== null) return found;
  }
  return null;
}

function auditFixtures(fixtures, findings) {
  const entries = Object.entries(fixtures);
  for (const [path, text] of entries) {
    const normalized = normalizePath(path);
    if (normalized.startsWith("unsafe-link:")) {
      findings.push(`${path}: linked fixture path is forbidden`);
      continue;
    }
    if (!isSafeRelativePath(path)) {
      findings.push(`${path}: unsafe fixture path`);
      continue;
    }
    if (normalized.includes("/curriculum/")) continue;
    const isFake = normalized.includes("/capture-v4/fake/");
    if (normalized.endsWith(".html")) {
      if (isFake) {
        const normalizedText = text.replace(/\s+/gu, " ");
        if (!normalizedText.includes("Fake OJ") || !normalizedText.includes("real OJ endpoint")) {
          findings.push(`${path}: synthetic HTML fixture lacks Fake OJ provenance`);
        }
      } else {
        const metaPath = normalized.replace(/\.html$/u, ".meta.json");
        if (!Object.hasOwn(fixtures, metaPath)) findings.push(`${path}: real HTML fixture lacks paired provenance`);
        if (/<script\b|type\s*=\s*["']password|name\s*=\s*["'](?:authorization|account|cookie|csrf|password|token|username)/iu.test(text)) {
          findings.push(`${path}: real HTML fixture contains forbidden active or credential content`);
        }
      }
      continue;
    }
    if (!normalized.endsWith(".json")) continue;
    let document;
    try {
      document = JSON.parse(text);
    } catch {
      findings.push(`${path}: fixture is not valid JSON`);
      continue;
    }
    const forbidden = findForbiddenFixtureKey(document);
    if (forbidden !== null) findings.push(`${path}: forbidden fixture key ${forbidden}`);
    if (isFake) {
      if (!isObject(document) || typeof document.scenario !== "string"
        || document.safeEnvelopeOnly !== true || !Array.isArray(document.forbiddenFields)) {
        findings.push(`${path}: synthetic fixture lacks explicit safe-envelope provenance`);
      }
      continue;
    }
    if (normalized.endsWith(".meta.json")) {
      if (!hasRealFixtureProvenance(document) || document.fixtureName !== fixtureBaseName(normalized)) {
        findings.push(`${path}: real fixture metadata lacks provenance`);
      }
      continue;
    }
    const embeddedMeta = isObject(document) ? document.meta : null;
    const pairedMetaPath = normalized.replace(/\.json$/u, ".meta.json");
    const embeddedValid = hasRealFixtureProvenance(embeddedMeta)
      && embeddedMeta.fixtureName === fixtureBaseName(normalized);
    if (!embeddedValid && !Object.hasOwn(fixtures, pairedMetaPath)) {
      findings.push(`${path}: real JSON fixture lacks embedded or paired provenance`);
    }
  }
}

export function auditV4ExtensionPrivacy(input) {
  const findings = [];
  auditManifest(input.sourceManifest, "source", findings);
  if (input.targetManifest === null) {
    findings.push("target: extension/dist/manifest.json is required");
  } else {
    auditManifest(input.targetManifest, "target", findings);
    if (JSON.stringify(input.sourceManifest) !== JSON.stringify(input.targetManifest)) {
      findings.push("target: manifest differs from extension/manifest.json");
    }
  }
  if (JSON.stringify(stableUnique(input.targetFiles)) !== JSON.stringify(stableUnique(TARGET_FILES))) {
    findings.push("target: target file inventory differs from the approved exact dist");
  }
  for (const [path, text] of Object.entries(input.productionSources)) {
    if (path.startsWith("unsafe-link:")) {
      findings.push(`${path}: linked production path is forbidden`);
      continue;
    }
    auditProductionSource(normalizePath(path), text, findings);
  }
  const backgroundSource = input.productionSources["extension/src/background.ts"];
  if (backgroundSource !== undefined) {
    if (!backgroundSource.includes('typeof chrome.storage.local.setAccessLevel === "function"')) {
      findings.push("extension/src/background.ts: local storage access-level capability check is required");
    }
    if (!backgroundSource.includes(
      'chrome.storage.local.setAccessLevel({ accessLevel: "TRUSTED_CONTEXTS" })',
    )) findings.push("extension/src/background.ts: local storage must be restricted to TRUSTED_CONTEXTS");
    if (!backgroundSource.includes(
      'chrome.storage.session.setAccessLevel({ accessLevel: "TRUSTED_CONTEXTS" })',
    )) findings.push("extension/src/background.ts: session storage must be restricted to TRUSTED_CONTEXTS");
    if (/chrome\.storage\.(?:local|session)\.(?:get|set|remove)\s*\(/u.test(backgroundSource)) {
      findings.push("extension/src/background.ts: storage access must use the runtime storage wrapper");
    }
  }
  const sourcePopup = input.productionSources["extension/src/popup.html"];
  const targetPopup = input.productionSources["extension/dist/popup.html"];
  if (sourcePopup === undefined || targetPopup === undefined || sourcePopup !== targetPopup) {
    findings.push("target: popup.html differs from the source artifact");
  }
  auditFixtures(input.fixtures, findings);
  return stableUnique(findings);
}

function collectFiles(root, relativeDirectory, accepted) {
  const start = resolve(root, relativeDirectory);
  if (!existsSync(start)) return {};
  const result = {};
  const stack = [start];
  while (stack.length > 0) {
    const current = stack.pop();
    for (const entry of readdirSync(current)) {
      const absolute = resolve(current, entry);
      const path = normalizePath(relative(root, absolute));
      const metadata = lstatSync(absolute);
      if (metadata.isSymbolicLink()) {
        result[`unsafe-link:${path}`] = "";
      } else if (metadata.isDirectory()) {
        stack.push(absolute);
      } else if (metadata.isFile()) {
        if (accepted(path)) result[path] = readFileSync(absolute, "utf8");
      } else {
        result[`unsafe-link:${path}`] = "";
      }
    }
  }
  return result;
}

function collectTargetFiles(root) {
  const dist = resolve(root, "extension/dist");
  if (!existsSync(dist)) return [];
  const files = [];
  const stack = [dist];
  while (stack.length > 0) {
    const current = stack.pop();
    for (const entry of readdirSync(current)) {
      const absolute = resolve(current, entry);
      const path = normalizePath(relative(root, absolute));
      const metadata = lstatSync(absolute);
      if (metadata.isSymbolicLink()) {
        files.push(`unsafe-link:${path}`);
      } else if (metadata.isDirectory()) {
        files.push(`unexpected-directory:${path}`);
      } else if (metadata.isFile()) {
        files.push(path);
      } else {
        files.push(`unsafe-entry:${path}`);
      }
    }
  }
  return files;
}

export function collectV4PrivacyFixtureFiles(repoRoot) {
  return collectFiles(repoRoot, "tests/fixtures", (path) => /\.(?:json|html)$/u.test(path));
}

export function collectV4PrivacyTargetFiles(repoRoot) {
  return collectTargetFiles(repoRoot);
}

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

export function loadV4ExtensionPrivacyAuditInput(repoRoot = defaultRepoRoot) {
  const sourceManifestPath = resolve(repoRoot, "extension/manifest.json");
  const targetManifestPath = resolve(repoRoot, "extension/dist/manifest.json");
  return {
    sourceManifest: readJson(sourceManifestPath),
    targetManifest: existsSync(targetManifestPath) ? readJson(targetManifestPath) : null,
    targetFiles: collectV4PrivacyTargetFiles(repoRoot),
    productionSources: {
      ...collectFiles(repoRoot, "extension/src", (path) => path.endsWith(".ts")),
      ...collectFiles(repoRoot, "extension/dist", (path) => /\.(?:js|html)$/u.test(path)),
      "extension/src/popup.html": readFileSync(resolve(repoRoot, "extension/src/popup.html"), "utf8"),
    },
    fixtures: collectV4PrivacyFixtureFiles(repoRoot),
  };
}

function main() {
  let findings;
  try {
    findings = auditV4ExtensionPrivacy(loadV4ExtensionPrivacyAuditInput(defaultRepoRoot));
  } catch (error) {
    console.error(`V4 extension privacy audit FAIL: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
    return;
  }
  if (findings.length > 0) {
    console.error(`V4 extension privacy audit FAIL (${findings.length} findings)`);
    for (const finding of findings) console.error(`- ${finding}`);
    process.exitCode = 1;
    return;
  }
  console.log("V4 extension privacy audit PASS (0 findings)");
}

if (process.argv[1] !== undefined && import.meta.url === new URL(`file://${process.argv[1]}`).href) main();
