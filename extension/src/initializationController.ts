export type InitializationControllerStatus = "idle" | "initializing" | "ready";

export type InitializationController = Readonly<{
  readonly ensure: () => Promise<void>;
  readonly reset: () => void;
  readonly status: () => InitializationControllerStatus;
}>;

export function createInitializationController(
  initialize: () => Promise<void>,
): InitializationController {
  let state: InitializationControllerStatus = "idle";
  let flight: Promise<void> | undefined;

  function ensure(): Promise<void> {
    if (state === "ready") return Promise.resolve();
    if (flight !== undefined) return flight;
    state = "initializing";
    const running = initialize()
      .then(() => { state = "ready"; })
      .catch((error: unknown) => {
        state = "idle";
        throw error;
      });
    flight = running.finally(() => { flight = undefined; });
    return flight;
  }

  return Object.freeze({
    ensure,
    reset: () => {
      if (state !== "initializing") state = "idle";
    },
    status: () => state,
  });
}
