import { AttemptStatusPanel } from "./AttemptStatusPanel";
import { CaptureStatusPanel } from "./CaptureStatusPanel";

type TrainingWorkspaceProps = {
  readonly platform: string;
  readonly externalId: string;
  readonly title?: string;
};

export function TrainingWorkspace({ platform, externalId, title }: TrainingWorkspaceProps) {
  const url = buildPlatformUrl(platform, externalId);
  const displayTitle = title ?? externalId;

  return (
    <>
      <section className="rounded-xl border border-slate-200 bg-white p-6">
        <p className="text-sm uppercase tracking-wide text-slate-500">{platform}</p>
        <h1 className="mt-2 text-2xl font-semibold">{displayTitle}</h1>
        {title && <p className="mt-1 text-sm text-slate-500">Problem ID: {externalId}</p>}
        <p className="mt-3 text-slate-600">
          Open the original platform in a full page load. The browser extension keeps each visible problem session and submission isolated in the local capture record.
        </p>
        <a className="mt-5 inline-block rounded-lg bg-slate-950 px-4 py-2 text-white" href={url} target="_blank" rel="noreferrer">
          Open original problem
        </a>
      </section>
      <CaptureStatusPanel />
      <AttemptStatusPanel platform={platform} externalId={externalId} />
    </>
  );
}

function buildPlatformUrl(platform: string, externalId: string): string {
  if (platform === "leetcode") return `https://leetcode.com/problems/${externalId}/`;
  if (platform === "codeforces") return `https://codeforces.com/problemset/problem/${externalId.slice(0, -1)}/${externalId.slice(-1)}`;
  if (platform === "atcoder") return `https://atcoder.jp/contests/${externalId.split("_")[0]}/tasks/${externalId}`;
  return "https://www.google.com/search?q=" + encodeURIComponent(`${platform} ${externalId}`);
}
