declare module "@/scripts/validate-v4-d4-acceptance-profiles.mjs" {
  export function validateV4D4AcceptanceProfiles(
    profiles: unknown,
    readiness: unknown,
    repoRoot?: string,
  ): readonly string[];
}
