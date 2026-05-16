import fs from "node:fs";
import path from "node:path";
import { appVersion } from "../../shared/releaseNotes.js";

const secretPatterns = [
  /(bearer\s+)[a-z0-9._~+/=-]+/gi,
  /("(?:access|refresh|id)_token"\s*:\s*")[^"]+(")/gi,
  /("(?:apiKey|api_key|token|secret|password)"\s*:\s*")[^"]+(")/gi,
  /((?:sk|sess|eyJ)[a-z0-9._~+/=-]{12,})/gi
];

export function sanitizeCrashText(value: unknown): string {
  const raw = value instanceof Error ? `${value.name}: ${value.message}\n${value.stack ?? ""}` : String(value);
  return secretPatterns.reduce((text, pattern) => text.replace(pattern, (...parts) => {
    if (parts.length >= 4 && typeof parts[1] === "string" && typeof parts[2] === "string") return `${parts[1]}[скрыто]${parts[2]}`;
    if (parts.length >= 3 && typeof parts[1] === "string") return `${parts[1]}[скрыто]`;
    return "[скрыто]";
  }), raw).slice(0, 16_000);
}

export interface CrashReportRecord {
  format: "one.egoist.codex-account-manager.crash-report";
  appVersion: string;
  kind: string;
  generatedAt: string;
  message: string;
}

export function buildCrashReport(kind: string, error: unknown): CrashReportRecord {
  return {
    format: "one.egoist.codex-account-manager.crash-report",
    appVersion,
    kind,
    generatedAt: new Date().toISOString(),
    message: sanitizeCrashText(error)
  };
}

export function getCrashReportsDir(appDataDir: string): string {
  return path.join(appDataDir, "crash-reports");
}

export function writeCrashReport(appDataDir: string, kind: string, error: unknown): string {
  const dir = getCrashReportsDir(appDataDir);
  fs.mkdirSync(dir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const filePath = path.join(dir, `crash-${stamp}.json`);
  fs.writeFileSync(filePath, `${JSON.stringify(buildCrashReport(kind, error), null, 2)}\n`, "utf8");
  return filePath;
}
