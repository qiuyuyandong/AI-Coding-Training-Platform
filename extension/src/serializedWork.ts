export type SerializedWorkExecutor = {
  readonly schedule: (
    work: () => Promise<void>,
    onFailure?: (stage: "initialization" | "work", error: unknown) => void,
  ) => void;
  readonly idle: () => Promise<void>;
};

export function createSerializedWorkExecutor(
  initialization: Promise<void> | (() => Promise<void>),
  onError: (error: unknown, stage: "initialization" | "work") => void,
): SerializedWorkExecutor {
  const initialize = typeof initialization === "function"
    ? initialization
    : () => initialization;
  let tail = Promise.resolve();

  return {
    schedule: (work, onFailure) => {
      tail = tail
        .then(async () => {
          try {
            await initialize();
          } catch (error) {
            onError(error, "initialization");
            onFailure?.("initialization", error);
            return;
          }
          try {
            await work();
          } catch (error) {
            onError(error, "work");
            onFailure?.("work", error);
          }
        });
    },
    idle: () => tail,
  };
}
