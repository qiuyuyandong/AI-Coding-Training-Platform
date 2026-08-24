if (process.env.NODE_ENV === "development") {
  void Promise.all([
    import("@sentry/nextjs"),
    import("@/lib/observability/sentryDev"),
  ]).then(([{ init }, { createSentryDevOptions, resolveSentryDevConfig }]) => {
    const config = resolveSentryDevConfig({
      nodeEnv: process.env.NODE_ENV,
      enabled: process.env.NEXT_PUBLIC_SENTRY_DEV_ENABLED,
      dsn: process.env.NEXT_PUBLIC_SENTRY_DEV_DSN,
      release: process.env.NEXT_PUBLIC_SENTRY_DEV_RELEASE,
    });

    if (config.enabled) {
      init(createSentryDevOptions(config));
    }
  });
}
