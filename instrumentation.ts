async function resolveServerConfig() {
  const { resolveSentryDevConfig } = await import("@/lib/observability/sentryDev");
  return resolveSentryDevConfig({
    nodeEnv: process.env.NODE_ENV,
    enabled: process.env.SENTRY_DEV_ENABLED,
    dsn: process.env.SENTRY_DEV_DSN,
    release: process.env.SENTRY_DEV_RELEASE,
  });
}

export async function register(): Promise<void> {
  if (process.env.NODE_ENV !== "development" || process.env.NEXT_RUNTIME !== "nodejs") return;
  if (!(await resolveServerConfig()).enabled) return;
  await import("./sentry.server.config");
}

export async function onRequestError(error: unknown): Promise<void> {
  if (process.env.NODE_ENV !== "development" || process.env.NEXT_RUNTIME !== "nodejs") return;
  if (!(await resolveServerConfig()).enabled) return;
  const { captureRequestError } = await import("@sentry/nextjs");
  captureRequestError(
    error,
    { path: "<redacted>", method: "<redacted>", headers: {} },
    { routerKind: "<redacted>", routePath: "<redacted>", routeType: "<redacted>" },
  );
}
