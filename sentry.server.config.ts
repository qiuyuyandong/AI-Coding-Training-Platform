import * as Sentry from "@sentry/nextjs";
import {
  createSentryDevOptions,
  resolveSentryDevConfig,
} from "@/lib/observability/sentryDev";

const config = resolveSentryDevConfig({
  nodeEnv: process.env.NODE_ENV,
  enabled: process.env.SENTRY_DEV_ENABLED,
  dsn: process.env.SENTRY_DEV_DSN,
  release: process.env.SENTRY_DEV_RELEASE,
});

if (config.enabled) {
  Sentry.init(createSentryDevOptions(config));
}
