export type QualityGateStage = readonly ["run", string];

export const QUALITY_GATE_STAGES: readonly QualityGateStage[];

export const CONTENT_PACKAGE_MANIFEST_PATH: string;

export const LINK_ACCESS_CHECK_REPORT_PATH: string;

export function hasContentPackageManifest(targetPath?: string): boolean;

export function hasLinkAccessCheckReport(targetPath?: string): boolean;