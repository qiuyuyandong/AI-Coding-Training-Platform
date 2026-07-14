import { AttemptStatusPanel } from "./AttemptStatusPanel";
import { CaptureStatusPanel } from "./CaptureStatusPanel";
import { ManualAttemptPanel } from "./ManualAttemptPanel";
import { PlatformSchema } from "@/lib/domain/source";
import {
  CanonicalProblemUrlError,
  canonicalProblemUrl,
  normalizeProblemIdentity,
} from "@/lib/services/canonicalProblemUrl";

type TrainingWorkspaceProps = {
  readonly platform: string;
  readonly externalId: string;
  readonly title?: string;
};

export function TrainingWorkspace({ platform, externalId, title }: TrainingWorkspaceProps) {
  const url = trainingUrl(platform, externalId);
  const displayTitle = title ?? externalId;

  return (
    <>
      <section className="rounded-xl border border-slate-200 bg-white p-6">
        <p className="text-sm uppercase tracking-wide text-slate-500">{platform}</p>
        <h1 className="mt-2 text-2xl font-semibold">{displayTitle}</h1>
        {title && <p className="mt-1 text-sm text-slate-500">Problem ID: {externalId}</p>}
        <p className="mt-3 text-slate-600">
          Open the original platform. The browser extension keeps each visible problem session and submission isolated across full loads and supported SPA route changes.
        </p>
        {url === undefined ? (
          <p className="mt-5 text-sm text-red-700">Original problem link is unavailable for this identity.</p>
        ) : (
          <a className="mt-5 inline-block rounded-lg bg-slate-950 px-4 py-2 text-white" href={url} target="_blank" rel="noreferrer">
            Open original problem
          </a>
        )}
      </section>
      <ManualAttemptPanel
        platform={platform}
        externalId={externalId}
        problemTitle={displayTitle}
        canonicalUrl={url}
      />
      <CaptureStatusPanel />
      <AttemptStatusPanel platform={platform} externalId={externalId} />
    </>
  );
}

function trainingUrl(platform: string, externalId: string): string | undefined {
  const parsedPlatform = PlatformSchema.safeParse(platform);
  if (!parsedPlatform.success || parsedPlatform.data === "manual") return undefined;
  try {
    const identity = normalizeProblemIdentity({
      platform: parsedPlatform.data,
      externalId,
    });
    return canonicalProblemUrl(identity);
  } catch (error) {
    if (error instanceof CanonicalProblemUrlError) return undefined;
    throw error;
  }
}
