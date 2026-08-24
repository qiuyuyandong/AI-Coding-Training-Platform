import type { ErrorEvent, Event, StackFrame } from "@sentry/nextjs";

const RELEASE_PATTERN = /^[0-9a-f]{40}$/iu;
const EVENT_ID_PATTERN = /^[0-9a-f]{32}$/iu;
const SAFE_SYMBOL_PATTERN = /^[A-Za-z_$][A-Za-z0-9_.$<>\[\]-]{0,119}$/u;
const SAFE_FILE_PATTERN = /^[A-Za-z0-9_./()@\[\]-]{1,240}$/u;
const SAFE_SOURCE_ROOTS = ["app/", "components/", "lib/"] as const;
const SAFE_SOURCE_FILES = new Set([
  "instrumentation-client.ts",
  "instrumentation.ts",
  "sentry.server.config.ts",
]);

export type SentryDevEnvironment = {
  nodeEnv: string | undefined;
  enabled: string | undefined;
  dsn: string | undefined;
  release: string | undefined;
};

export type SentryDevConfig =
  | { enabled: false }
  | {
      enabled: true;
      dsn: string;
      environment: "development";
      release: string;
    };

function isApprovedSentryDsn(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:"
      && url.hostname.endsWith(".sentry.io")
      && url.username.length > 0
      && url.password === ""
      && url.port === ""
      && url.search === ""
      && url.hash === ""
      && /^\/\d+\/?$/u.test(url.pathname);
  } catch {
    return false;
  }
}

export function resolveSentryDevConfig(input: SentryDevEnvironment): SentryDevConfig {
  const dsn = input.dsn?.trim();
  const release = input.release?.trim();
  if (input.nodeEnv !== "development"
    || input.enabled !== "1"
    || dsn === undefined
    || !isApprovedSentryDsn(dsn)
    || release === undefined
    || !RELEASE_PATTERN.test(release)) {
    return { enabled: false };
  }

  return {
    enabled: true,
    dsn,
    environment: "development",
    release: release.toLowerCase(),
  };
}

function sanitizeSymbol(value: string | undefined): string | undefined {
  if (value === undefined || !SAFE_SYMBOL_PATTERN.test(value)) return undefined;
  return value;
}

function extractSafeSourcePath(value: string | undefined): string | undefined {
  if (value === undefined || value.length > 1024) return undefined;
  const normalized = value.replaceAll("\\", "/").split(/[?#]/u, 1)[0];
  if (normalized.startsWith("http://") || normalized.startsWith("https://")) return undefined;

  for (const file of SAFE_SOURCE_FILES) {
    if (normalized === file || normalized.endsWith(`/${file}`)) return file;
  }

  for (const root of SAFE_SOURCE_ROOTS) {
    const marker = `/${root}`;
    const index = normalized.lastIndexOf(marker);
    const candidate = index >= 0
      ? normalized.slice(index + 1)
      : normalized.startsWith(root)
        ? normalized
        : normalized.startsWith(`./${root}`)
          ? normalized.slice(2)
          : undefined;
    if (candidate !== undefined
      && SAFE_FILE_PATTERN.test(candidate)
      && !candidate.split("/").includes("..")) {
      return candidate;
    }
  }

  return undefined;
}

function sanitizeCoordinate(value: number | undefined): number | undefined {
  if (value === undefined || !Number.isSafeInteger(value) || value < 0) return undefined;
  return value;
}

function sanitizeStackFrame(frame: StackFrame): StackFrame | undefined {
  const filename = extractSafeSourcePath(frame.filename ?? frame.abs_path);
  if (filename === undefined) return undefined;

  return {
    filename,
    function: sanitizeSymbol(frame.function),
    lineno: sanitizeCoordinate(frame.lineno),
    colno: sanitizeCoordinate(frame.colno),
    in_app: true,
  };
}

export function sanitizeSentryDevEvent(event: Event, release: string): ErrorEvent | null {
  if (event.type !== undefined || !RELEASE_PATTERN.test(release)) return null;
  const sourceException = event.exception?.values?.[0];
  const type = sanitizeSymbol(sourceException?.type);
  if (sourceException === undefined || type === undefined) return null;

  const frames = (sourceException.stacktrace?.frames ?? [])
    .map(sanitizeStackFrame)
    .filter((frame): frame is StackFrame => frame !== undefined)
    .slice(-40);

  return {
    type: undefined,
    event_id: EVENT_ID_PATTERN.test(event.event_id ?? "")
      ? event.event_id?.toLowerCase()
      : undefined,
    timestamp: typeof event.timestamp === "number" && Number.isFinite(event.timestamp)
      ? event.timestamp
      : undefined,
    level: "error",
    platform: "javascript",
    environment: "development",
    release: release.toLowerCase(),
    exception: {
      values: [{
        type,
        value: "Development runtime exception",
        stacktrace: frames.length > 0 ? { frames } : undefined,
      }],
    },
  };
}

export function createSentryDevOptions(config: Extract<SentryDevConfig, { enabled: true }>) {
  return {
    dsn: config.dsn,
    enabled: true,
    environment: config.environment,
    release: config.release,
    sampleRate: 1,
    tracesSampleRate: 0,
    enableLogs: false,
    sendDefaultPii: false,
    sendClientReports: false,
    autoSessionTracking: false,
    maxBreadcrumbs: 0,
    attachStacktrace: true,
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
    beforeBreadcrumb: () => null,
    beforeSend: (event: ErrorEvent) => sanitizeSentryDevEvent(event, config.release),
    beforeSendTransaction: () => null,
  };
}
