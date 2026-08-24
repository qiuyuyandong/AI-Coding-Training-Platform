import {
  executeVaultCommand,
  isDirectScriptExecution,
  parseVaultArguments,
} from "../lib/vault/launcher";

export async function main(args = process.argv.slice(2)): Promise<number> {
  try {
    const result = await executeVaultCommand(parseVaultArguments(args));
    if (result.status === "cancelled") {
      process.stdout.write("已取消；未修改 Vault 配置，也未启动服务。\n");
      return 0;
    }
    if (result.status === "configured") {
      process.stdout.write(`Vault 已配置：${result.vault.vaultPath}\n`);
      return 0;
    }
    return result.exitCode;
  } catch (error) {
    const message = error instanceof Error ? error.message : "未知错误";
    process.stderr.write(`Local Vault 失败：${message}\n`);
    return 1;
  }
}

if (isDirectScriptExecution(import.meta.url, process.argv[1])) {
  process.exitCode = await main();
}
