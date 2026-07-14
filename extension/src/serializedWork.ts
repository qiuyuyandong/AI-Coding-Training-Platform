export type SerializedWorkExecutor = {
  readonly schedule: (work: () => Promise<void>) => void;
  readonly idle: () => Promise<void>;
};

export function createSerializedWorkExecutor(
  initialization: Promise<void>,
  onError: (error: unknown) => void,
): SerializedWorkExecutor {
  let tail = initialization.catch((error: unknown) => {
    onError(error);
  });

  return {
    schedule: (work) => {
      tail = tail
        .then(work)
        .catch((error: unknown) => {
          onError(error);
        });
    },
    idle: () => tail,
  };
}
