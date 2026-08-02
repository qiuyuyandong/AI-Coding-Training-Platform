/**
 * Typed TypeScript facade for the readiness contract. The single runtime
 * implementation lives at
 * `tests/helpers/v4AdapterReadinessContract.cjs` so the CLI can
 * require it from a pure Node context without a TS loader.
 */

export type V4AdapterReadinessStatus =
  | "uncharacterized"
  | "candidate"
  | "experimental"
  | "blocked"
  | "production"
  | "disabled";

export type V4AdapterReadinessTier = "public" | "authenticated";

export type V4AdapterReadinessRecord = {
  readonly platform: string;
  readonly status: V4AdapterReadinessStatus;
  readonly characterization?: {
    readonly date: string;
    readonly source: string;
    readonly tier: V4AdapterReadinessTier;
  };
  readonly requestMatcher?: string;
  readonly e2Policy?: string;
  readonly e3Policy?: string;
  readonly privacyFields?: readonly string[];
  readonly fakeOjCases?: readonly string[];
  readonly realObservation?: string;
  readonly failureDisposition?: string;
  readonly endpointDriftDisposition?: string;
  readonly productionCertification?: boolean;
  readonly disableReason?: string;
};

export {
  normalizeRepoRelativePath,
  validateV4AdapterReadinessRecord,
} from "@/tests/helpers/v4AdapterReadinessContract.cjs";
