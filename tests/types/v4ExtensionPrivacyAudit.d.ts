declare module "@/scripts/audit-v4-extension-privacy.mjs" {
  export type V4ExtensionPrivacyAuditInput = Readonly<{
    sourceManifest: unknown;
    targetManifest: unknown | null;
    targetFiles: readonly string[];
    productionSources: Readonly<Record<string, string>>;
    fixtures: Readonly<Record<string, string>>;
  }>;

  export function auditV4ExtensionPrivacy(input: V4ExtensionPrivacyAuditInput): readonly string[];
  export function collectV4PrivacyFixtureFiles(repoRoot: string): Readonly<Record<string, string>>;
  export function collectV4PrivacyTargetFiles(repoRoot: string): readonly string[];
  export function loadV4ExtensionPrivacyAuditInput(repoRoot?: string): V4ExtensionPrivacyAuditInput;
}
