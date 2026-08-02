import type { CharacterizationController } from "./characterization";

/**
 * Blocks production processing only for the registry platform selected by the
 * active session-backed characterization window.
 */
export async function blocksCharacterizationProductionIngress(
  platform: string,
  controller: CharacterizationController,
): Promise<boolean> {
  const session = await controller.getSession();
  return session.active && session.platform === platform;
}

/** Phase B compatibility name retained for existing callers and evidence. */
export async function blocksNowCoderProductionIngress(
  platform: string,
  controller: CharacterizationController,
): Promise<boolean> {
  return blocksCharacterizationProductionIngress(platform, controller);
}
