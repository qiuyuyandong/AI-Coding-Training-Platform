declare module "@/scripts/validate-v4-candidate.mjs" {
  export const CANDIDATE_ALLOWED_PATHS: readonly string[];

  export function parseExtensionE2eSummary(output: string, exitCode: number): Readonly<{
    passed: number;
    failed: number;
    skipped: number;
    exitCode: number;
  }>;

  export function classifyCandidatePath(path: string): Readonly<{
    kind: "candidate" | "forbidden" | "unknown";
    reason: string;
  }>;

  export function validateCandidatePaths(paths: readonly string[]): Readonly<{
    checks: readonly Readonly<{ name: string; ok: boolean; detail?: unknown }>[];
    failedChecks: readonly string[];
    classifications: readonly Readonly<{
      path: string;
      kind: "candidate" | "forbidden" | "unknown";
      reason: string;
    }>[];
  }>;

  export function validateCandidateState(input: Readonly<{
    productionSources: Readonly<Record<string, string>>;
    privacyFindings: readonly string[];
    readinessFailures: readonly string[];
    extensionE2e: Readonly<{ passed: number; failed: number; skipped: number; exitCode: number }>;
    qualityGate: Readonly<{ exitCode: number }>;
    docs: Readonly<{ d1: string; d2: string; plan: string; handoff: string }>;
    database: Readonly<{
      before: Readonly<{ length: number; lastWriteTimeUtc: string }>;
      after: Readonly<{ length: number; lastWriteTimeUtc: string }>;
    }>;
  }>): Readonly<{
    checks: readonly Readonly<{ name: string; ok: boolean; detail?: unknown }>[];
    failedChecks: readonly string[];
  }>;

  export function validateCandidateIdentityState(input: Readonly<{
    head: string;
    sha: string;
    status: string;
  }>): Readonly<{
    checks: readonly Readonly<{ name: string; ok: boolean; detail?: unknown }>[];
    failedChecks: readonly string[];
  }>;

  export function validateCandidateCommit(cwd: string, sha: string): Readonly<{
    checks: readonly Readonly<{ name: string; ok: boolean; detail?: unknown }>[];
    failedChecks: readonly string[];
  }>;
}
