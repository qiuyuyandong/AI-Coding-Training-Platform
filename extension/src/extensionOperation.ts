export type ExtensionOperationErrorReporter = (error: unknown) => void;

export function isExtensionContextInvalidatedError(error: unknown): boolean {
  const message =
    error instanceof Error
      ? error.message
      : typeof error === "string"
        ? error
        : "";
  return message.toLowerCase().includes("extension context invalidated");
}

export type ExtensionContextGuard = Readonly<{
  isActive: () => boolean;
  run: (operation: () => void) => void;
}>;

/**
 * Guard callbacks owned by a content-script context.
 *
 * Reloading an unpacked extension invalidates already-injected content
 * scripts, but their DOM observers and browser event callbacks can still be
 * scheduled briefly. The first failed callback permanently retires this
 * runtime. Context invalidation is an expected lifecycle cancellation; other
 * failures remain visible to the supplied reporter.
 */
export function createExtensionContextGuard(
  reportError: ExtensionOperationErrorReporter,
): ExtensionContextGuard {
  let active = true;

  return {
    isActive: () => active,
    run: (operation) => {
      if (!active) return;
      try {
        operation();
      } catch (error) {
        active = false;
        if (!isExtensionContextInvalidatedError(error)) {
          reportError(error);
        }
      }
    },
  };
}

/**
 * Settle a Chrome extension Promise at the event boundary.
 *
 * MV3 contexts can be invalidated while a page or popup is still alive.
 * Event handlers cannot await those Promises directly, so every fire-and-forget
 * operation must terminate here instead of becoming an unhandled rejection in
 * chrome://extensions.
 */
export async function settleExtensionOperation(
  operation: () => Promise<unknown>,
  reportError: ExtensionOperationErrorReporter,
): Promise<boolean> {
  try {
    await operation();
    return true;
  } catch (error) {
    reportError(error);
    return false;
  }
}
