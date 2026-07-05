const rules = [
  "Do not bypass login, captcha, paywalls, anti-bot systems, or access controls.",
  "Do not cache LeetCode, NowCoder, or Luogu full statements in V1.",
  "Use browser session without extracting browser session tokens.",
  "Store training records locally by default.",
];

export default function CompliancePage() {
  return (
    <main className="mx-auto max-w-4xl px-6 py-10">
      <h1 className="text-3xl font-semibold">Compliance</h1>
      <ul className="mt-6 space-y-3">
        {rules.map((rule) => <li key={rule} className="rounded-lg border border-slate-200 bg-white p-4">{rule}</li>)}
      </ul>
    </main>
  );
}
