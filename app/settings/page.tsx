import React from "react";

export const dynamic = "force-dynamic";

export default function SettingsPage() {
  const vaultPath = process.env.TRAINING_VAULT_PATH;
  const vaultId = process.env.TRAINING_VAULT_ID;
  const launchedWithVault = vaultPath !== undefined && vaultId !== undefined;
  return (
    <main className="mx-auto max-w-4xl px-6 py-10">
      <p className="text-xs uppercase tracking-wide text-slate-500">Local data</p>
      <h1 className="mt-2 text-3xl font-semibold">Local Vault</h1>
      <p className="mt-3 max-w-2xl text-slate-600">
        学习记录和捕获数据只保存在当前 Vault。切换 Vault 需要先停止本地应用，
        再从终端运行 launcher；网页不会在运行中改写数据库路径。
      </p>

      <section className="mt-8 rounded-xl border border-slate-200 bg-white p-5">
        <h2 className="text-lg font-semibold">当前 Vault</h2>
        {launchedWithVault ? (
          <dl className="mt-4 grid gap-3 text-sm">
            <div>
              <dt className="text-slate-500">状态</dt>
              <dd className="mt-1 font-medium text-emerald-700">已验证并打开</dd>
            </div>
            <div>
              <dt className="text-slate-500">Vault ID</dt>
              <dd className="mt-1 break-all font-mono" data-testid="vault-id">{vaultId}</dd>
            </div>
            <div>
              <dt className="text-slate-500">本地路径</dt>
              <dd className="mt-1 break-all font-mono" data-testid="vault-path">{vaultPath}</dd>
            </div>
          </dl>
        ) : (
          <div className="mt-4 rounded-lg bg-amber-50 p-4 text-sm text-amber-900">
            当前进程未由 Local Vault launcher 启动。停止服务后运行
            <code className="mx-1 font-semibold">npm run local</code>
            选择或创建 Vault。
          </div>
        )}
      </section>

      <section className="mt-6 rounded-xl border border-slate-200 bg-white p-5">
        <h2 className="text-lg font-semibold">切换方式</h2>
        <p className="mt-2 text-sm text-slate-600">
          先停止当前服务，再运行
          <code className="mx-1 font-semibold">npm run vault:switch</code>。
          无系统选择器时使用绝对路径参数
          <code className="ml-1 font-semibold">-- --vault &lt;absolute-path&gt;</code>。
        </p>
      </section>
    </main>
  );
}
