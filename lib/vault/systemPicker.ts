import { spawnSync } from "node:child_process";

export type PickerResult =
  | Readonly<{ status: "selected"; path: string }>
  | Readonly<{ status: "cancelled" }>
  | Readonly<{ status: "unavailable"; reason: string }>;

type CommandResult = Readonly<{
  status: number | null;
  stdout: string;
  stderr: string;
  errorCode?: string;
}>;

type CommandRunner = (
  command: string,
  args: readonly string[],
) => CommandResult;

export function pickSystemPath(
  kind: "directory" | "sqlite",
  options: {
    readonly platform?: NodeJS.Platform;
    readonly run?: CommandRunner;
  } = {},
): PickerResult {
  const platform = options.platform ?? process.platform;
  const run = options.run ?? runCommand;
  if (platform === "win32") return pickOnWindows(kind, run);
  if (platform === "darwin") return pickOnMac(kind, run);
  if (platform === "linux") return pickOnLinux(kind, run);
  return { status: "unavailable", reason: `Unsupported platform: ${platform}` };
}

function pickOnWindows(kind: "directory" | "sqlite", run: CommandRunner): PickerResult {
  const script = kind === "directory"
    ? [
      "$shell = New-Object -ComObject Shell.Application",
      "$folder = $shell.BrowseForFolder(0, '选择 Local Vault 文件夹', 0, 0)",
      "if ($null -ne $folder) { [Console]::Out.Write($folder.Self.Path) }",
    ].join("; ")
    : [
      "Add-Type -AssemblyName System.Windows.Forms",
      "$dialog = New-Object System.Windows.Forms.OpenFileDialog",
      "$dialog.Title = '选择现有 SQLite 数据库'",
      "$dialog.Filter = 'SQLite database (*.sqlite;*.db)|*.sqlite;*.db|All files (*.*)|*.*'",
      "if ($dialog.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) { [Console]::Out.Write($dialog.FileName) }",
    ].join("; ");
  return interpret(run("powershell.exe", [
    "-NoLogo",
    "-NoProfile",
    "-NonInteractive",
    "-STA",
    "-Command",
    script,
  ]));
}

function pickOnMac(kind: "directory" | "sqlite", run: CommandRunner): PickerResult {
  const expression = kind === "directory"
    ? "POSIX path of (choose folder with prompt \"选择 Local Vault 文件夹\")"
    : "POSIX path of (choose file with prompt \"选择现有 SQLite 数据库\")";
  return interpret(run("osascript", ["-e", expression]));
}

function pickOnLinux(kind: "directory" | "sqlite", run: CommandRunner): PickerResult {
  const zenityArguments = ["--file-selection", "--title=选择 Local Vault"];
  if (kind === "directory") zenityArguments.push("--directory");
  const zenity = run("zenity", zenityArguments);
  if (zenity.errorCode !== "ENOENT") return interpret(zenity);

  const kdialogArguments = kind === "directory"
    ? ["--getexistingdirectory", ".", "--title", "选择 Local Vault 文件夹"]
    : ["--getopenfilename", ".", "*.sqlite *.db|SQLite database"];
  const kdialog = run("kdialog", kdialogArguments);
  if (kdialog.errorCode !== "ENOENT") return interpret(kdialog);
  return {
    status: "unavailable",
    reason: "No supported system picker is installed; use an absolute --vault path",
  };
}

function runCommand(command: string, args: readonly string[]): CommandResult {
  const result = spawnSync(command, args, {
    encoding: "utf8",
    shell: false,
    windowsHide: true,
  });
  const errorCode = result.error !== undefined && "code" in result.error
    && typeof result.error.code === "string"
    ? result.error.code
    : undefined;
  return {
    status: result.status,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
    ...(errorCode === undefined ? {} : { errorCode }),
  };
}

function interpret(result: CommandResult): PickerResult {
  if (result.errorCode === "ENOENT") {
    return { status: "unavailable", reason: "The system picker command is unavailable" };
  }
  const selectedPath = result.stdout.trim();
  if (result.status === 0 && selectedPath !== "") {
    return { status: "selected", path: selectedPath };
  }
  if (result.status === 0 || /cancel(?:led|ed)|user canceled/u.test(result.stderr.toLowerCase())) {
    return { status: "cancelled" };
  }
  return {
    status: "unavailable",
    reason: result.stderr.trim() || `System picker exited with status ${String(result.status)}`,
  };
}
