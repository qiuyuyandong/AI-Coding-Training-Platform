import { AttemptStatusPanel } from "./AttemptStatusPanel";
import { CaptureStatusPanel } from "./CaptureStatusPanel";

type TrainingWorkspaceProps = {
  platform: string;
  externalId: string;
};

export function TrainingWorkspace({ platform, externalId }: TrainingWorkspaceProps) {
  const url = buildPlatformUrl(platform, externalId);
  return (
    <>
      <section className="rounded-xl border border-slate-200 bg-white p-6">
        <p className="text-sm uppercase tracking-wide text-slate-500">{platform}</p>
        <h1 className="mt-2 text-2xl font-semibold">{externalId}</h1>
        <p className="mt-3 text-slate-600">
          This V1 workspace opens the original platform and waits for the browser extension to return page/submission events.
        </p>
        <a className="mt-5 inline-block rounded-lg bg-slate-950 px-4 py-2 text-white" href={url} target="_blank" rel="noreferrer">
          Open original problem
        </a>
      </section>
      <CaptureStatusPanel />
      <AttemptStatusPanel />
    </>
  );
}

function buildPlatformUrl(platform: string, externalId: string): string {
  if (platform === "leetcode") return `https://leetcode.com/problems/${externalId}/`;
  if (platform === "codeforces") return `https://codeforces.com/problemset/problem/${externalId.slice(0, -1)}/${externalId.slice(-1)}`;
  if (platform === "atcoder") return `https://atcoder.jp/contests/${externalId.split("_")[0]}/tasks/${externalId}`;
  return "https://www.google.com/search?q=" + encodeURIComponent(`${platform} ${externalId}`);
}
