const CONTENT_BOOTSTRAP_SENTINEL = "__unifiedOjCaptureContentBootstrapV1__";

export type ContentBootstrapDependencies = Readonly<{
  readonly isolatedGlobal: object;
  /** Returns true only after the runtime and all of its listeners exist. */
  readonly install: (announceReady: () => void) => Promise<boolean>;
  readonly reannounceReady: () => void;
}>;

/**
 * Claims an isolated-world-only sentinel before asynchronous startup. A second
 * injection can reannounce readiness for a restarted worker but cannot install
 * another set of listeners or another capture runtime.
 */
export async function bootstrapContentRuntime(
  dependencies: ContentBootstrapDependencies,
): Promise<"installed" | "inactive" | "installing" | "reannounced"> {
  const existing = Reflect.get(dependencies.isolatedGlobal, CONTENT_BOOTSTRAP_SENTINEL);
  if (existing === "installed") {
    dependencies.reannounceReady();
    return "reannounced";
  }
  if (existing === "installing") return "installing";
  Reflect.set(dependencies.isolatedGlobal, CONTENT_BOOTSTRAP_SENTINEL, "installing");
  try {
    const installed = await dependencies.install(dependencies.reannounceReady);
    if (!installed) {
      Reflect.deleteProperty(dependencies.isolatedGlobal, CONTENT_BOOTSTRAP_SENTINEL);
      return "inactive";
    }
    Reflect.set(dependencies.isolatedGlobal, CONTENT_BOOTSTRAP_SENTINEL, "installed");
    return "installed";
  } catch (error) {
    Reflect.deleteProperty(dependencies.isolatedGlobal, CONTENT_BOOTSTRAP_SENTINEL);
    throw error;
  }
}
