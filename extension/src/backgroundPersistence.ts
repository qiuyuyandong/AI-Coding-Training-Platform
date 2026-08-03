import type {
  OrchestratorEffects,
  OrchestratorPersistence,
  OrchestratorState,
} from "./backgroundOrchestrator";

export async function persistEffectsBeforeCaching(input: {
  readonly effects: OrchestratorEffects;
  readonly persist: (persistence: OrchestratorPersistence) => Promise<void>;
  readonly setCachedSnapshot: (state: OrchestratorState | undefined) => void;
}): Promise<void> {
  try {
    await input.persist(input.effects.persistence);
    input.setCachedSnapshot(input.effects.state);
  } catch (error) {
    input.setCachedSnapshot(undefined);
    throw error;
  }
}
