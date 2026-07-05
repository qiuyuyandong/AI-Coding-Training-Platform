import { TrainingWorkspace } from "@/components/TrainingWorkspace";

export default async function TrainingPage({ searchParams }: { searchParams: Promise<{ platform?: string; externalId?: string }> }) {
  const { platform = "leetcode", externalId = "two-sum" } = await searchParams;

  return (
    <main className="mx-auto max-w-4xl px-6 py-10">
      <TrainingWorkspace platform={platform} externalId={externalId} />
    </main>
  );
}