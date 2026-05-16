import type { HealthReport } from "../../shared/types.js";

export interface DiagnosticsServiceOptions {
  appDataDir: string;
  codexHome: string;
  logPath: string | null;
  resolveCodexPath(): Promise<string | null>;
  resolveCodexDesktopPath?: () => string | null;
  getSchemaVersion(): number;
  isVaultDegraded(): boolean;
}

export class DiagnosticsService {
  constructor(private readonly options: DiagnosticsServiceOptions) {}

  async getHealth(): Promise<HealthReport> {
    const codexPath = await this.options.resolveCodexPath();
    const desktopPath = this.options.resolveCodexDesktopPath?.() ?? null;
    const vaultDegraded = this.options.isVaultDegraded();
    const schemaVersion = this.options.getSchemaVersion();

    return {
      generatedAt: Math.floor(Date.now() / 1000),
      schemaVersion,
      appDataDir: this.options.appDataDir,
      codexHome: this.options.codexHome,
      logPath: this.options.logPath,
      items: [
        {
          id: "codexCli",
          label: "Codex CLI",
          status: codexPath ? "ok" : "error",
          message: codexPath ? "Codex CLI найден." : "Codex CLI не найден.",
          action: codexPath ? undefined : "choosePath"
        },
        {
          id: "codexDesktop",
          label: "Codex Desktop",
          status: desktopPath ? "ok" : "warning",
          message: desktopPath ? "Codex Desktop найден." : "Codex Desktop не найден."
        },
        { id: "database", label: "База данных", status: "ok", message: "База данных доступна." },
        {
          id: "vault",
          label: "Хранилище",
          status: vaultDegraded ? "warning" : "ok",
          message: vaultDegraded ? "Защита хранилища ограничена." : "Хранилище защищено."
        },
        { id: "schema", label: "Версия схемы", status: "ok", message: `Версия схемы: ${schemaVersion}.` },
        {
          id: "logs",
          label: "Логи",
          status: this.options.logPath ? "ok" : "warning",
          message: this.options.logPath ? "Логи доступны." : "Путь к логам пока не задан.",
          action: this.options.logPath ? "openLogs" : undefined
        }
      ]
    };
  }
}
