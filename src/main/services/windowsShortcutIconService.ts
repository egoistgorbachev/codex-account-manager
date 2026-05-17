import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

export interface WindowsShortcutIconOptions {
  env: NodeJS.ProcessEnv;
  platform: NodeJS.Platform;
  productName: string;
  sourceIcoPath: string;
  version: string;
  log?: (message: string, error?: unknown) => void;
}

export interface WindowsShortcutIconTargets {
  iconDir: string;
  stableIconPath: string;
  versionedIconPath: string;
  shortcuts: string[];
}

function quotePowerShell(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}

function copyIfDifferent(sourceBytes: Buffer, targetPath: string): boolean {
  if (fs.existsSync(targetPath)) {
    const currentBytes = fs.readFileSync(targetPath);
    if (currentBytes.equals(sourceBytes)) return false;
  }
  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  fs.writeFileSync(targetPath, sourceBytes);
  return true;
}

export function getWindowsShortcutIconTargets(options: Pick<WindowsShortcutIconOptions, "env" | "productName" | "version">): WindowsShortcutIconTargets | null {
  const localAppData = options.env.LOCALAPPDATA;
  const roamingAppData = options.env.APPDATA;
  const userProfile = options.env.USERPROFILE;
  if (!localAppData || !roamingAppData) return null;

  const iconDir = path.join(localAppData, options.productName);
  const startMenuDir = path.join(roamingAppData, "Microsoft", "Windows", "Start Menu", "Programs");
  const shortcuts = [
    path.join(startMenuDir, `${options.productName}.lnk`),
    path.join(startMenuDir, options.productName, `${options.productName}.lnk`),
    path.join(roamingAppData, "Microsoft", "Internet Explorer", "Quick Launch", "User Pinned", "TaskBar", `${options.productName}.lnk`)
  ];
  if (userProfile) shortcuts.push(path.join(userProfile, "Desktop", `${options.productName}.lnk`));

  return {
    iconDir,
    stableIconPath: path.join(iconDir, "icon.ico"),
    versionedIconPath: path.join(iconDir, `icon-${options.version}.ico`),
    shortcuts
  };
}

export function buildShortcutRefreshScript(shortcuts: string[], iconPath: string): string {
  const linkList = shortcuts.map(quotePowerShell).join(", ");
  const quotedIcon = quotePowerShell(`${iconPath},0`);
  return [
    "$ErrorActionPreference = 'SilentlyContinue'",
    `$links = @(${linkList})`,
    `$icon = ${quotedIcon}`,
    "$shell = New-Object -ComObject WScript.Shell",
    "foreach ($link in $links) {",
    "  if (Test-Path -LiteralPath $link) {",
    "    $shortcut = $shell.CreateShortcut($link)",
    "    $shortcut.IconLocation = $icon",
    "    $shortcut.Save()",
    "  }",
    "}"
  ].join("\n");
}

export function syncWindowsShortcutIcon(options: WindowsShortcutIconOptions): void {
  if (options.platform !== "win32") return;
  const targets = getWindowsShortcutIconTargets(options);
  if (!targets) return;

  try {
    const sourceBytes = fs.readFileSync(options.sourceIcoPath);
    const stableChanged = copyIfDifferent(sourceBytes, targets.stableIconPath);
    const versionedChanged = copyIfDifferent(sourceBytes, targets.versionedIconPath);
    const existingShortcuts = targets.shortcuts.filter((shortcut) => fs.existsSync(shortcut));
    if (existingShortcuts.length === 0) return;

    const script = buildShortcutRefreshScript(existingShortcuts, targets.versionedIconPath);
    const encoded = Buffer.from(script, "utf16le").toString("base64");
    const result = spawnSync("powershell.exe", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-EncodedCommand", encoded], {
      encoding: "utf8",
      timeout: 5_000,
      windowsHide: true
    });
    if (result.error || result.status !== 0) {
      options.log?.("Failed to refresh Windows shortcut icon links", result.error ?? result.stderr);
    }

    if (stableChanged || versionedChanged) {
      options.log?.(`Windows shortcut icon synced: ${targets.versionedIconPath}`);
    }
  } catch (error) {
    options.log?.("Failed to sync Windows shortcut icon", error);
  }
}
