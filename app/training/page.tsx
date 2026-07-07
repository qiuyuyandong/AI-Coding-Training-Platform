import { TrainingWorkspace } from "@/components/TrainingWorkspace";

export default async function TrainingPage({ searchParams }: { searchParams: Promise<{ platform?: string; externalId?: string; title?: string }> }) {
  const { platform = "leetcode", externalId = "two-sum", title } = await searchParams;

  return (
    <main className="mx-auto max-w-4xl px-6 py-10">
      <TrainingWorkspace platform={platform} externalId={externalId} title={title} />
    </main>
  );
}
