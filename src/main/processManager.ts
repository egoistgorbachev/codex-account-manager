import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFile, spawn, spawnSync, type ChildProcess } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

function psQuote(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

function vbsString(value: string): string {
  return `"${value.replace(/"/g, '""')}"`;
}

function firstExisting(paths: Array<string | null | undefined>): string | null {
  for (const candidate of paths) {
    if (!candidate) continue;
    try {
      if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) return candidate;
    } catch {
      // Keep trying the next candidate.
    }
  }
  return null;
}

function findFromWhere(): string | null {
  const result = spawnSync("where.exe", ["codex"], { encoding: "utf8", windowsHide: true });
  if (result.status !== 0) return null;
  return firstExisting(result.stdout.split(/\r?\n/).map((line) => line.trim()));
}

function findFromAppxPackage(): string | null {
  const command = "(Get-AppxPackage OpenAI.Codex -ErrorAction SilentlyContinue | Select-Object -First 1 -ExpandProperty InstallLocation)";
  const result = spawnSync("powershell.exe", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", command], {
    encoding: "utf8",
    windowsHide: true
  });
  if (result.status !== 0) return null;
  const installLocation = result.stdout.trim();
  if (!installLocation) return null;
  return firstExisting([
    path.join(installLocation, "app", "resources", "codex.exe"),
    path.join(installLocation, "app", "resources", "codex")
  ]);
}

function findDesktopFromAppxPackage(): string | null {
  const command = "(Get-AppxPackage OpenAI.Codex -ErrorAction SilentlyContinue | Select-Object -First 1 -ExpandProperty InstallLocation)";
  const result = spawnSync("powershell.exe", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", command], {
    encoding: "utf8",
    windowsHide: true
  });
  if (result.status !== 0) return null;
  const installLocation = result.stdout.trim();
  if (!installLocation) return null;
  return firstExisting([path.join(installLocation, "app", "Codex.exe")]);
}

function findDesktopFromKnownLocations(): string | null {
  const localAppData = process.env.LOCALAPPDATA ?? path.join(os.homedir(), "AppData", "Local");
  const programFiles = process.env.ProgramFiles ?? "C:\\Program Files";
  const programFilesX86 = process.env["ProgramFiles(x86)"] ?? "C:\\Program Files (x86)";
  return firstExisting([
    path.join(localAppData, "Programs", "Codex", "Codex.exe"),
    path.join(localAppData, "OpenAI", "Codex", "Codex.exe"),
    path.join(localAppData, "Codex", "Codex.exe"),
    path.join(programFiles, "Codex", "Codex.exe"),
    path.join(programFiles, "OpenAI", "Codex", "Codex.exe"),
    path.join(programFilesX86, "Codex", "Codex.exe"),
    path.join(programFilesX86, "OpenAI", "Codex", "Codex.exe")
  ]);
}

function findFromRunningProcesses(): string | null {
  const command =
    "Get-CimInstance Win32_Process | Where-Object { $_.Name -ieq 'codex.exe' -and $_.CommandLine -match 'resources\\\\codex(\\.exe)?' } | Select-Object -First 1 -ExpandProperty ExecutablePath";
  const result = spawnSync("powershell.exe", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", command], {
    encoding: "utf8",
    windowsHide: true
  });
  if (result.status !== 0) return null;
  return firstExisting([result.stdout.trim()]);
}

function findDesktopFromRunningProcesses(): string | null {
  const command =
    "Get-CimInstance Win32_Process | Where-Object { $_.Name -ieq 'Codex.exe' -and $_.ExecutablePath -match '\\\\app\\\\Codex\\.exe$' -and $_.CommandLine -notmatch '--type=' } | Select-Object -First 1 -ExpandProperty ExecutablePath";
  const result = spawnSync("powershell.exe", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", command], {
    encoding: "utf8",
    windowsHide: true
  });
  if (result.status !== 0) return null;
  return firstExisting([result.stdout.trim()]);
}

export function resolveCodexPath(): string | null {
  const localAppData = process.env.LOCALAPPDATA ?? path.join(os.homedir(), "AppData", "Local");
  return (
    firstExisting([
      path.join(localAppData, "OpenAI", "Codex", "bin", "codex.exe"),
      path.join(os.homedir(), "AppData", "Local", "OpenAI", "Codex", "bin", "codex.exe")
    ]) ??
    findFromWhere() ??
    findFromAppxPackage() ??
    findFromRunningProcesses()
  );
}

export function resolveCodexDesktopPath(): string | null {
  return findDesktopFromRunningProcesses() ?? findDesktopFromAppxPackage() ?? findDesktopFromKnownLocations();
}

export async function stopCodexProcesses(): Promise<void> {
  const names = ["codex.exe", "Codex.exe"];
  for (const name of names) {
    try {
      await execFileAsync("taskkill.exe", ["/IM", name, "/T", "/F"], { windowsHide: true, timeout: 5000 });
    } catch {
      // No matching process is a normal state.
    }
  }
  await waitForCodexExit(10000);
}

function waitForProcessExit(child: ChildProcess, timeoutMs: number): Promise<void> {
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, timeoutMs);
    child.once("exit", () => {
      clearTimeout(timer);
      resolve();
    });
    child.once("error", () => {
      clearTimeout(timer);
      resolve();
    });
  });
}

function getVisibleCodexWindowCount(): number {
  const result = spawnSync("powershell.exe", [
    "-NoProfile",
    "-ExecutionPolicy",
    "Bypass",
    "-Command",
    "(Get-Process -Name Codex -ErrorAction SilentlyContinue | Where-Object { $_.MainWindowHandle -ne 0 }).Count"
  ], {
    encoding: "utf8",
    windowsHide: true
  });
  return Number(result.stdout.trim()) || 0;
}

async function waitForVisibleCodexWindow(timeoutMs: number): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (getVisibleCodexWindowCount() > 0) return true;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  return getVisibleCodexWindowCount() > 0;
}

async function waitForCodexExit(timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const result = spawnSync("powershell.exe", [
      "-NoProfile",
      "-ExecutionPolicy",
      "Bypass",
      "-Command",
      "(Get-Process -Name Codex,codex -ErrorAction SilentlyContinue).Count"
    ], {
      encoding: "utf8",
      windowsHide: true
    });
    if ((Number(result.stdout.trim()) || 0) === 0) return;
    await new Promise((resolve) => setTimeout(resolve, 400));
  }
}

export function getCodexAppUserModelId(): string | null {
  const result = spawnSync("powershell.exe", [
    "-NoProfile",
    "-ExecutionPolicy",
    "Bypass",
    "-Command",
    "(Get-StartApps | Where-Object { $_.Name -eq 'Codex' -or $_.AppID -like 'OpenAI.Codex*!App' } | Select-Object -First 1 -ExpandProperty AppID)"
  ], {
    encoding: "utf8",
    windowsHide: true
  });
  return result.status === 0 ? result.stdout.trim() || null : null;
}

async function launchViaAppUserModelId(): Promise<void> {
  const appId = getCodexAppUserModelId();
  if (!appId) return;
  const child = spawn("explorer.exe", [`shell:AppsFolder\\${appId}`], {
    detached: true,
    stdio: "ignore",
    windowsHide: true
  });
  child.unref();
  await waitForProcessExit(child, 1500);
}

export async function launchCodexApp(_codexPath: string, _workspacePath: string): Promise<void> {
  const desktopPath = resolveCodexDesktopPath();
  if (desktopPath) {
    const child = spawn(desktopPath, [], {
      detached: true,
      stdio: "ignore",
      windowsHide: true
    });
    child.unref();
    if (await waitForVisibleCodexWindow(8000)) return;
  }

  await launchViaAppUserModelId();
  if (await waitForVisibleCodexWindow(8000)) return;

  throw new Error("Codex launch command completed, but no visible Codex window appeared.");
}

export interface ScheduledRestart {
  launcherPath: string;
  launcherLogPath: string;
  scriptPath: string;
  logPath: string;
}

export function scheduleCodexRestart(desktopPath: string | null, appUserModelId: string | null, runnerDir: string): ScheduledRestart {
  const scriptsDir = path.join(runnerDir, "scripts");
  const logsDir = path.join(runnerDir, "logs");
  fs.mkdirSync(scriptsDir, { recursive: true });
  fs.mkdirSync(logsDir, { recursive: true });

  const launcherPath = path.join(scriptsDir, "restart-codex.vbs");
  const launcherLogPath = path.join(logsDir, "restart-launcher.log");
  const scriptPath = path.join(scriptsDir, "restart-codex.ps1");
  const logPath = path.join(logsDir, "restart-runner.log");
  const script = `
$ErrorActionPreference = 'Continue'
$desktop = ${desktopPath ? psQuote(desktopPath) : "$null"}
$appId = ${appUserModelId ? psQuote(appUserModelId) : "$null"}
$logPath = ${psQuote(logPath)}

function Write-RunnerLog([string]$Message) {
  try {
    $dir = Split-Path -Parent $logPath
    if (-not (Test-Path -LiteralPath $dir)) { New-Item -ItemType Directory -Path $dir -Force | Out-Null }
    Add-Content -LiteralPath $logPath -Value ("[{0}] {1}" -f (Get-Date).ToString("o"), $Message)
  } catch {}
}

function Resolve-CodexDesktop {
  param([string]$KnownDesktop)

  if ($KnownDesktop -and (Test-Path -LiteralPath $KnownDesktop)) { return $KnownDesktop }

  try {
    $pkg = Get-AppxPackage OpenAI.Codex -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($pkg -and $pkg.InstallLocation) {
      $candidate = Join-Path $pkg.InstallLocation "app\\Codex.exe"
      if (Test-Path -LiteralPath $candidate) { return $candidate }
    }
  } catch {}

  $programFilesX86 = [Environment]::GetEnvironmentVariable('ProgramFiles(x86)')
  $knownRoots = @()
  if ($env:LOCALAPPDATA) {
    $knownRoots += Join-Path $env:LOCALAPPDATA "Programs\\Codex\\Codex.exe"
    $knownRoots += Join-Path $env:LOCALAPPDATA "OpenAI\\Codex\\Codex.exe"
    $knownRoots += Join-Path $env:LOCALAPPDATA "Codex\\Codex.exe"
  }
  if ($env:ProgramFiles) {
    $knownRoots += Join-Path $env:ProgramFiles "Codex\\Codex.exe"
    $knownRoots += Join-Path $env:ProgramFiles "OpenAI\\Codex\\Codex.exe"
  }
  if ($programFilesX86) {
    $knownRoots += Join-Path $programFilesX86 "Codex\\Codex.exe"
    $knownRoots += Join-Path $programFilesX86 "OpenAI\\Codex\\Codex.exe"
  }
  foreach ($candidate in $knownRoots) {
    if ($candidate -and (Test-Path -LiteralPath $candidate)) { return $candidate }
  }

  return $null
}

function Resolve-CodexAppId {
  param([string]$KnownAppId)

  if ($KnownAppId) { return $KnownAppId }
  try {
    return (Get-StartApps | Where-Object { $_.Name -eq 'Codex' -or $_.AppID -like 'OpenAI.Codex*!App' } | Select-Object -First 1 -ExpandProperty AppID)
  } catch {
    return $null
  }
}

function Wait-CodexWindow([int]$Seconds) {
  $deadline = (Get-Date).AddSeconds($Seconds)
  do {
    $visible = @(Get-Process -Name Codex -ErrorAction SilentlyContinue | Where-Object { $_.MainWindowHandle -ne 0 }).Count
    if ($visible -gt 0) { return $true }
    Start-Sleep -Milliseconds 500
  } while ((Get-Date) -lt $deadline)
  return $false
}

$desktop = Resolve-CodexDesktop $desktop
$appId = Resolve-CodexAppId $appId
Write-RunnerLog "Runner started. Desktop=$desktop AppID=$appId"

try {
  Get-Process -Name Codex,codex -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
  $deadline = (Get-Date).AddSeconds(10)
  do {
    $remaining = @(Get-Process -Name Codex,codex -ErrorAction SilentlyContinue).Count
    if ($remaining -eq 0) { break }
    Start-Sleep -Milliseconds 250
  } while ((Get-Date) -lt $deadline)
  Write-RunnerLog "Codex process cleanup finished"
} catch {
  Write-RunnerLog ("Cleanup failed: " + $_.Exception.Message)
}

try {
  if ($appId) {
    Write-RunnerLog "Starting Codex through Microsoft Store AppID"
    Start-Process -FilePath "explorer.exe" -ArgumentList ("shell:AppsFolder\\" + $appId)
    Write-RunnerLog ("Store AppID launch requested: " + $appId)
    if (Wait-CodexWindow 12) {
      Write-RunnerLog "Visible Codex window detected after Store AppID launch"
      exit 0
    }
  } else {
    Write-RunnerLog "Store AppID not found"
  }

  if ($desktop -and (Test-Path -LiteralPath $desktop)) {
    try {
      Write-RunnerLog "Starting Codex desktop executable"
      Start-Process -FilePath $desktop
    } catch {
      Write-RunnerLog ("Desktop executable launch failed: " + $_.Exception.Message)
    }

    if (Wait-CodexWindow 12) {
      Write-RunnerLog "Visible Codex window detected after desktop executable launch"
      exit 0
    }
  } else {
    Write-RunnerLog "Desktop executable path is missing or unavailable"
  }

  if ($desktop -and (Test-Path -LiteralPath $desktop)) {
    Write-RunnerLog "No visible window after normal launch paths. Requesting elevated desktop launch via UAC"
    try {
      Start-Process -FilePath $desktop -Verb RunAs
      Write-RunnerLog "Elevated desktop launch requested"
    } catch {
      Write-RunnerLog ("Elevated desktop launch failed or was cancelled: " + $_.Exception.Message)
    }
  }
} catch {
  Write-RunnerLog ("Restart runner failed: " + $_.Exception.Message)
}
`;

  fs.writeFileSync(scriptPath, `\uFEFF${script.trimStart()}`, "utf8");

  const launcher = [
    "On Error Resume Next",
    "Dim shell, fso, logFile, command",
    "Set shell = CreateObject(\"WScript.Shell\")",
    "Set fso = CreateObject(\"Scripting.FileSystemObject\")",
    `Set logFile = fso.OpenTextFile(${vbsString(launcherLogPath)}, 8, True)`,
    `logFile.WriteLine Now & " launcher started"`,
    "logFile.Close",
    `command = "powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File " & Chr(34) & ${vbsString(scriptPath)} & Chr(34)`,
    "shell.Run command, 0, False"
  ].join("\r\n");
  fs.writeFileSync(launcherPath, `\uFEFF${launcher}`, "utf16le");

  const child = spawn("wscript.exe", [launcherPath], {
    cwd: runnerDir,
    detached: true,
    stdio: "ignore",
    windowsHide: true
  });
  child.unref();

  return { launcherPath, launcherLogPath, scriptPath, logPath };
}
