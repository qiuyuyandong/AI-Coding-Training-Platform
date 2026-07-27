import type { CharacterizationController } from "./characterization";

/**
 * Blocks production processing only while the session-backed NowCoder
 * characterization window is active. Keeping this gate separate makes every
 * background ingress use the same worker-restart-safe rule.
 */
export async function blocksNowCoderProductionIngress(
  platform: string,
  controller: CharacterizationController,
): Promise<boolean> {
  return platform === "nowcoder" && await controller.isActive();
}
