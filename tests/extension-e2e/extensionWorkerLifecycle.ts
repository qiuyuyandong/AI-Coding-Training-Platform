export interface ExtensionWorkerLifecycleEffects<TWorker> {
  readonly readExisting: () => TWorker | undefined;
  readonly waitForStarted: () => PromiseLike<TWorker>;
  readonly openPopup: () => PromiseLike<void>;
}

/** Resolves one extension worker without leaving a waiter past context teardown. */
export async function resolveExtensionWorkerLifecycle<TWorker>(
  effects: ExtensionWorkerLifecycleEffects<TWorker>,
): Promise<TWorker> {
  const existing = effects.readExisting();
  if (existing !== undefined) return existing;

  const started = effects.waitForStarted();
  const [worker] = await Promise.all([started, effects.openPopup()]);
  return worker;
}
