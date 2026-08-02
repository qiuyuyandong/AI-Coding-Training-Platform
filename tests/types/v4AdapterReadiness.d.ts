declare module "*/scripts/validate-v4-adapter-readiness.mjs" {
  export function validateV4AdapterReadiness(
    document: unknown,
    registryText: string,
    repoRoot?: string,
  ): readonly string[];
}

declare module "*/tests/helpers/v4AdapterReadinessContract.cjs" {
  export function normalizeRepoRelativePath(raw: string): string | null;
  export function validateV4AdapterReadinessRecord(value: unknown): readonly string[];
}
