import type { BrowserWindow } from "electron";
import { app } from "electron";
import updater from "electron-updater";
import type { UpdateCheckResult } from "../../shared/types.js";

const { autoUpdater } = updater;

type LogFn = (message: string, error?: unknown) => void;

export class UpdaterService {
  private lastResult: UpdateCheckResult | null = null;
  private checking = false;

  constructor(private readonly getWindow: () => BrowserWindow | null, private readonly log: LogFn) {
    autoUpdater.autoDownload = true;
    autoUpdater.autoInstallOnAppQuit = true;
    autoUpdater.allowPrerelease = false;

    autoUpdater.on("checking-for-update", () => this.setResult("checking", "Проверяю обновления GitHub Release.", null));
    autoUpdater.on("update-available", (info) => this.setResult("available", `Найдена версия ${info.version}. Загрузка началась автоматически.`, info.version));
    autoUpdater.on("update-not-available", (info) => this.setResult("not_available", `Установлена актуальная версия ${info.version}.`, info.version));
    autoUpdater.on("update-downloaded", (info) => this.setResult("downloaded", `Версия ${info.version} загружена и установится после выхода из приложения.`, info.version));
    autoUpdater.on("error", (error) => this.setResult("error", `Не удалось проверить обновления: ${error.message}`, null, error));
  }

  getLastResult(): UpdateCheckResult | null {
    return this.lastResult;
  }

  async checkForUpdates(): Promise<UpdateCheckResult> {
    if (!app.isPackaged && process.env.CAM_FORCE_UPDATE_CHECK !== "1") {
      return this.setResult("not_configured", "Автообновление проверяется только в установленной сборке приложения.", null);
    }
    if (this.checking) {
      return this.lastResult ?? this.setResult("checking", "Проверка обновлений уже выполняется.", null);
    }

    this.checking = true;
    try {
      const result = await autoUpdater.checkForUpdates();
      if (!result?.updateInfo) {
        return this.lastResult ?? this.setResult("not_available", "Обновления не найдены.", null);
      }
      return this.lastResult ?? this.setResult("not_available", `Установлена актуальная версия ${result.updateInfo.version}.`, result.updateInfo.version);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return this.setResult("error", `Не удалось проверить обновления: ${message}`, null, error);
    } finally {
      this.checking = false;
    }
  }

  private setResult(status: UpdateCheckResult["status"], message: string, version: string | null, error?: unknown): UpdateCheckResult {
    const result = {
      status,
      message,
      feedUrl: "github:egoistgorbachev/codex-account-manager",
      checkedAt: Math.floor(Date.now() / 1000),
      version
    };
    this.lastResult = result;
    this.log(`Updater: ${message}`, error);
    this.getWindow()?.webContents.send("release:updateStatus", result);
    return result;
  }
}
