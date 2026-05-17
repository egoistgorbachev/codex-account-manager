import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { BrowserWindow, Menu, Notification, Tray, app, dialog, ipcMain, shell } from "electron";
import isDev from "electron-is-dev";
import { AccountStore } from "./db.js";
import { Vault } from "./security.js";
import { getAppDataDir, getDefaultCodexHome } from "./paths.js";
import { AccountManager, getDiagnostics } from "./accountManager.js";
import { resolveCodexDesktopPath, resolveCodexPath } from "./processManager.js";
import { DiagnosticsService } from "./services/diagnosticsService.js";
import { SettingsService } from "./services/settingsService.js";
import { registerHealthIpc } from "./ipc/healthIpc.js";
import { registerSettingsIpc } from "./ipc/settingsIpc.js";
import type { AppSettings } from "../shared/types.js";
import { selectSmartAccount } from "../shared/smartSelection.js";
import { appVersion } from "../shared/releaseNotes.js";
import { ReleaseService } from "./services/releaseService.js";
import { getCrashReportsDir, writeCrashReport } from "./services/crashReportService.js";
import { UpdaterService } from "./services/updaterService.js";
import { syncWindowsShortcutIcon } from "./services/windowsShortcutIconService.js";

let mainWindow: BrowserWindow | null = null;
let manager: AccountManager | null = null;
let tray: Tray | null = null;
let startupError: string | null = null;
let settingsService: SettingsService | null = null;
let logPath: string | null = null;
let autoRefreshTimer: NodeJS.Timeout | null = null;
let autoRefreshInFlight = false;
let updaterService: UpdaterService | null = null;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const appUserModelId = "one.egoist.codex-account-manager";
let currentRateLimitRefreshIntervalMs: AppSettings["autoRefreshIntervalMs"] = 180_000;

function getWindowIconPath(): string {
  return app.isPackaged ? path.join(process.resourcesPath, "icon.png") : path.join(process.cwd(), "assets", "icon.png");
}

function getWindowsShortcutIconSourcePath(): string {
  return app.isPackaged ? path.join(app.getAppPath(), "assets", "icon.ico") : path.join(process.cwd(), "assets", "icon.ico");
}

function log(message: string, error?: unknown): void {
  const details = error instanceof Error ? `${error.stack ?? error.message}` : error ? String(error) : "";
  const line = `[${new Date().toISOString()}] ${message}${details ? `\n${details}` : ""}\n`;
  console.log(line.trimEnd());
  if (!logPath) return;
  try {
    fs.mkdirSync(path.dirname(logPath), { recursive: true });
    fs.appendFileSync(logPath, line, "utf8");
  } catch {
    // Logging must never prevent the app from opening.
  }
}

function readLogTail(maxLines = 120): string[] {
  if (!logPath || !fs.existsSync(logPath)) return [];
  try {
    return fs.readFileSync(logPath, "utf8").split(/\r?\n/).filter(Boolean).slice(-maxLines);
  } catch {
    return [];
  }
}

function readPackageConfig(): { build?: { publish?: unknown; win?: { signAndEditExecutable?: boolean; verifyUpdateCodeSignature?: boolean } } } {
  const candidates = [
    path.join(process.cwd(), "package.json"),
    path.join(app.getAppPath(), "package.json")
  ];
  for (const candidate of candidates) {
    try {
      if (fs.existsSync(candidate)) return JSON.parse(fs.readFileSync(candidate, "utf8"));
    } catch (error) {
      log(`Failed to read package config: ${candidate}`, error);
    }
  }
  return {};
}

function createReleaseService(): ReleaseService {
  return new ReleaseService({
    projectRoot: process.cwd(),
    version: appVersion,
    productName: "Codex Account Manager",
    packageConfig: readPackageConfig(),
    env: process.env
  });
}

function captureCrash(kind: string, error: unknown): void {
  log(kind, error);
  try {
    const reportPath = writeCrashReport(getAppDataDir(), kind, error);
    log(`Crash report saved: ${reportPath}`);
  } catch (reportError) {
    log("Failed to save crash report", reportError);
  }
}

async function buildDiagnosticReport(appDataDir: string) {
  const diagnostics = {
    ...getDiagnostics(appDataDir),
    workspacePath: manager?.getWorkspacePath() ?? getDiagnostics(appDataDir).workspacePath,
    rateLimitRefreshIntervalMs: currentRateLimitRefreshIntervalMs,
    startupError,
    logPath
  };
  const health = await new DiagnosticsService({
    appDataDir,
    codexHome: getDefaultCodexHome(),
    logPath,
    resolveCodexPath: async () => resolveCodexPath(),
    resolveCodexDesktopPath,
    getSchemaVersion: () => manager?.getSchemaVersion() ?? 0,
    isVaultDegraded: () => false
  }).getHealth();
  const accounts = manager?.list().map((account) => ({
    id: account.id,
    label: account.label,
    email: account.email,
    planType: account.planType,
    status: account.status,
    isActive: account.isActive,
    lastRefreshAt: account.lastRefreshAt,
    profileDir: account.profileDir
  })) ?? [];
  return {
    format: "one.egoist.codex-account-manager.diagnostic-report",
    appVersion,
    generatedAt: new Date().toISOString(),
    diagnostics,
    health,
    profileIntegrity: manager?.getProfileIntegrity() ?? null,
    releaseReadiness: createReleaseService().getReadiness(),
    crashReportsDir: getCrashReportsDir(appDataDir),
    settings: settingsService ? {
      autoRefreshIntervalMs: settingsService.get().autoRefreshIntervalMs,
      privacyMode: settingsService.get().privacyMode,
      confirmSwitch: settingsService.get().confirmSwitch,
      smartSwitchMode: settingsService.get().smartSwitchMode,
      desktopNotifications: settingsService.get().desktopNotifications
    } : null,
    accounts
  };
}

function createWindow(): BrowserWindow {
  const window = new BrowserWindow({
    width: 1600,
    height: 900,
    minWidth: 1366,
    minHeight: 768,
    show: false,
    frame: false,
    backgroundColor: "#0a0118",
    title: "Codex Account Manager",
    icon: getWindowIconPath(),
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false,
      webSecurity: true
    }
  });

  window.once("ready-to-show", () => {
    window.show();
    window.focus();
  });

  window.webContents.on("render-process-gone", (_event, details) => {
    log(`Renderer process gone: ${details.reason}`);
  });

  const packagedRendererPath = path.join(__dirname, "../renderer/index.html");
  const loadPackagedRenderer = () =>
    window.loadFile(packagedRendererPath).catch((error) => log("Failed to load packaged renderer", error));

  if (isDev) {
    void window.loadURL("http://127.0.0.1:5173").catch((error) => {
      log("Failed to load dev renderer, falling back to packaged renderer", error);
      if (fs.existsSync(packagedRendererPath)) {
        void loadPackagedRenderer();
      }
    });
  } else {
    void loadPackagedRenderer();
  }

  return window;
}

function requireManager(): AccountManager {
  if (!manager) throw new Error(startupError ?? "Account manager is not ready");
  return manager;
}

async function openExternalUrl(url: string, reason: string): Promise<void> {
  const parsed = new URL(url);
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    throw new Error("Unsupported URL protocol");
  }
  log(`Opening external URL for ${reason}: ${parsed.origin}${parsed.pathname}`);
  if (process.env.CAM_DISABLE_EXTERNAL_OPEN === "1") {
    log(`External URL opening skipped by CAM_DISABLE_EXTERNAL_OPEN for ${reason}`);
    return;
  }
  await shell.openExternal(url);
}

function registerIpc(appDataDir: string): void {
  registerHealthIpc(
    new DiagnosticsService({
      appDataDir,
      codexHome: getDefaultCodexHome(),
      logPath,
      resolveCodexPath: async () => resolveCodexPath(),
      resolveCodexDesktopPath,
      getSchemaVersion: () => manager?.getSchemaVersion() ?? 0,
      isVaultDegraded: () => false
    })
  );
  ipcMain.handle("accounts:list", () => requireManager().list());
  ipcMain.handle("accounts:login:start", async (_event, type: "chatgpt" | "chatgptDeviceCode") => {
    log(`Starting login flow: ${type}`);
    const result = await requireManager().startLogin(type);
    const url = result.authUrl ?? result.verificationUrl;
    if (url) {
      await openExternalUrl(url, `login:${type}`);
    } else {
      log(`Login flow did not return an external URL: ${type}`);
    }
    return result;
  });
  ipcMain.handle("accounts:reauth:start", async (_event, accountId: string, type: "chatgpt" | "chatgptDeviceCode") => {
    log(`Starting reauthentication flow: ${type} for ${accountId}`);
    const result = await requireManager().reauthenticateAccount(accountId, type);
    const url = result.authUrl ?? result.verificationUrl;
    if (url) {
      await openExternalUrl(url, `reauth:${type}`);
    } else {
      log(`Reauthentication flow did not return an external URL: ${type}`);
    }
    return result;
  });
  ipcMain.handle("accounts:refresh", (_event, accountId: string) => {
    log(`Refreshing account: ${accountId}`);
    return requireManager().refreshAccount(accountId);
  });
  ipcMain.handle("accounts:refreshAll", () => refreshAllRateLimits("manual"));
  ipcMain.handle("accounts:export", async (_event, passphrase: string) => {
    const stamp = new Date().toISOString().slice(0, 10);
    const options: Electron.SaveDialogOptions = {
      title: "Export ChatGPT accounts",
      defaultPath: `codex-account-manager-accounts-${stamp}.cam-export`,
      filters: [{ name: "Codex Account Manager export", extensions: ["cam-export"] }]
    };
    const result = mainWindow ? await dialog.showSaveDialog(mainWindow, options) : await dialog.showSaveDialog(options);
    if (result.canceled || !result.filePath) return { exportedCount: 0, filePath: "" };
    const exported = await requireManager().exportAccounts(result.filePath, passphrase);
    log(`Exported ${exported.exportedCount} account(s) to ${exported.filePath}`);
    return exported;
  });
  ipcMain.handle("accounts:import", async (_event, passphrase: string) => {
    const options: Electron.OpenDialogOptions = {
      title: "Import ChatGPT accounts",
      properties: ["openFile"],
      filters: [{ name: "Codex Account Manager export", extensions: ["cam-export", "json"] }]
    };
    const result = mainWindow ? await dialog.showOpenDialog(mainWindow, options) : await dialog.showOpenDialog(options);
    if (result.canceled || !result.filePaths[0]) return { importedCount: 0, accounts: requireManager().list() };
    const imported = await requireManager().importAccounts(result.filePaths[0], passphrase);
    log(`Imported ${imported.importedCount} account(s) from ${result.filePaths[0]}`);
    mainWindow?.webContents.send("accounts:updated");
    return imported;
  });
  ipcMain.handle("accounts:importAuthJson", async () => {
    const options: Electron.OpenDialogOptions = {
      title: "Import Codex auth.json",
      properties: ["openFile"],
      filters: [{ name: "Codex auth JSON", extensions: ["json"] }]
    };
    const result = mainWindow ? await dialog.showOpenDialog(mainWindow, options) : await dialog.showOpenDialog(options);
    if (result.canceled || !result.filePaths[0]) return { importedCount: 0, accounts: requireManager().list() };
    const imported = await requireManager().importAuthJson(result.filePaths[0]);
    log(`Imported account from auth.json: ${result.filePaths[0]}`);
    mainWindow?.webContents.send("accounts:updated");
    return imported;
  });
  ipcMain.handle("accounts:profileFolder:open", async (_event, accountId: string) => {
    const profileDir = requireManager().getProfileFolder(accountId);
    log(`Opening account profile folder: ${profileDir}`);
    const error = await shell.openPath(profileDir);
    if (error) throw new Error(error);
  });
  ipcMain.handle("accounts:switch", (_event, accountId: string) => {
    log(`Switching active account: ${accountId}`);
    return requireManager().switchAccount(accountId).then((account) => {
      notify("Codex Account Manager", `Активирован аккаунт: ${account.label}`);
      return account;
    }).finally(() => updateTrayMenu());
  });
  ipcMain.handle("accounts:delete", async (_event, accountId: string) => {
    log(`Deleting account: ${accountId}`);
    await requireManager().deleteAccount(accountId);
    updateTrayMenu();
  });
  ipcMain.handle("workspace:bindAccount", (_event, accountId: string | null) => requireManager().bindWorkspaceAccount(accountId));
  ipcMain.handle("workspace:getBinding", () => requireManager().getWorkspaceBinding());
  ipcMain.handle("switch:history", () => requireManager().getSwitchHistory());
  ipcMain.handle("limits:history", (_event, accountId: string) => requireManager().getLimitHistory(accountId));
  ipcMain.handle("switch:rollback", (_event, eventId: string) => {
    log(`Rolling back switch event: ${eventId}`);
    const history = requireManager().rollbackSwitch(eventId);
    updateTrayMenu();
    mainWindow?.webContents.send("accounts:updated");
    return history;
  });
  ipcMain.handle("logs:tail", () => readLogTail());
  ipcMain.handle("logs:openFolder", async () => {
    if (!logPath) throw new Error("Log path is not ready");
    fs.mkdirSync(path.dirname(logPath), { recursive: true });
    const error = await shell.openPath(path.dirname(logPath));
    if (error) throw new Error(error);
  });
  ipcMain.handle("crashReports:openFolder", async () => {
    const crashDir = getCrashReportsDir(appDataDir);
    fs.mkdirSync(crashDir, { recursive: true });
    const error = await shell.openPath(crashDir);
    if (error) throw new Error(error);
  });
  ipcMain.handle("profiles:integrity", () => requireManager().getProfileIntegrity());
  ipcMain.handle("release:readiness", () => createReleaseService().getReadiness());
  ipcMain.handle("release:checkUpdates", () => updaterService?.checkForUpdates() ?? createReleaseService().checkForUpdates());
  ipcMain.handle("release:openFolder", async () => {
    const releaseDir = createReleaseService().getReleaseDir();
    fs.mkdirSync(releaseDir, { recursive: true });
    const error = await shell.openPath(releaseDir);
    if (error) throw new Error(error);
  });
  ipcMain.handle("diagnostics:exportReport", async () => {
    const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
    const options: Electron.SaveDialogOptions = {
      title: "Сохранить отчёт диагностики",
      defaultPath: `codex-account-manager-diagnostics-${stamp}.json`,
      filters: [{ name: "Diagnostic JSON", extensions: ["json"] }]
    };
    const result = mainWindow ? await dialog.showSaveDialog(mainWindow, options) : await dialog.showSaveDialog(options);
    if (result.canceled || !result.filePath) return { filePath: "" };
    const report = await buildDiagnosticReport(appDataDir);
    fs.writeFileSync(result.filePath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
    log(`Diagnostic report exported: ${result.filePath}`);
    return { filePath: result.filePath };
  });
  ipcMain.handle("accounts:update", (_event, input) => requireManager().updateAccount(input));
  ipcMain.handle("app:diagnostics", () => ({
    ...getDiagnostics(appDataDir),
    workspacePath: manager?.getWorkspacePath() ?? getDiagnostics(appDataDir).workspacePath,
    rateLimitRefreshIntervalMs: currentRateLimitRefreshIntervalMs,
    startupError,
    logPath
  }));
  ipcMain.handle("app:openExternal", (_event, url: string) => openExternalUrl(url, "manual-open"));
  ipcMain.handle("app:workspace:select", async () => {
    const options: Electron.OpenDialogOptions = {
      title: "Р’С‹Р±РµСЂРё СЂР°Р±РѕС‡СѓСЋ РїР°РїРєСѓ Codex",
      properties: ["openDirectory", "createDirectory"]
    };
    const result = mainWindow ? await dialog.showOpenDialog(mainWindow, options) : await dialog.showOpenDialog(options);
    if (!result.canceled && result.filePaths[0]) {
      requireManager().setWorkspacePath(result.filePaths[0]);
      log(`Workspace path updated: ${result.filePaths[0]}`);
    }
    return {
      ...getDiagnostics(appDataDir),
      workspacePath: manager?.getWorkspacePath() ?? getDiagnostics(appDataDir).workspacePath,
      rateLimitRefreshIntervalMs: currentRateLimitRefreshIntervalMs,
      startupError,
      logPath
    };
  });
  ipcMain.handle("window:minimize", (event) => {
    BrowserWindow.fromWebContents(event.sender)?.minimize();
  });
  ipcMain.handle("window:toggleMaximize", (event) => {
    const window = BrowserWindow.fromWebContents(event.sender);
    if (!window) return;
    if (window.isMaximized()) window.unmaximize();
    else window.maximize();
  });
  ipcMain.handle("window:close", (event) => {
    BrowserWindow.fromWebContents(event.sender)?.close();
  });
}

function showMainWindow(): void {
  if (!mainWindow) {
    mainWindow = createWindow();
    mainWindow.on("closed", () => {
      mainWindow = null;
    });
    return;
  }
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
}

function updateTrayMenu(): void {
  if (!tray || !manager) return;
  const accounts = manager.list();
  const active = accounts.find((account) => account.isActive);
  const recommendation = selectSmartAccount(accounts, manager.getWorkspaceBinding());
  const best = recommendation ? accounts.find((account) => account.id === recommendation.accountId) : null;

  tray.setToolTip(`Codex Account Manager${active ? ` В· ${active.label}` : ""}`);
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: active ? `РђРєС‚РёРІРЅС‹Р№: ${active.label}` : "РђРєС‚РёРІРЅС‹Р№ Р°РєРєР°СѓРЅС‚ РЅРµ РІС‹Р±СЂР°РЅ", enabled: false },
      { type: "separator" },
      {
        label: best ? `Умный выбор: ${best.label}` : "Умный выбор недоступен",
        enabled: Boolean(best && !best.isActive),
        click: () => {
          if (best) void manager?.switchAccount(best.id).finally(() => updateTrayMenu());
        }
      },
      {
        label: "РђРєРєР°СѓРЅС‚С‹",
        enabled: accounts.length > 0,
        submenu: accounts.slice(0, 12).map((account) => ({
          label: `${account.isActive ? "вњ“ " : ""}${account.label} В· ${account.email}`,
          enabled: !account.isActive,
          click: () => void manager?.switchAccount(account.id).finally(() => updateTrayMenu())
        }))
      },
      { type: "separator" },
      {
        label: "РћР±РЅРѕРІРёС‚СЊ Р»РёРјРёС‚С‹",
        enabled: accounts.length > 0,
        click: () => void refreshAllRateLimits("manual").finally(() => updateTrayMenu())
      },
      { label: "РћС‚РєСЂС‹С‚СЊ РѕРєРЅРѕ", click: showMainWindow },
      { label: "Р’С‹С…РѕРґ", click: () => app.quit() }
    ])
  );
}

function createTray(): void {
  if (tray) return;
  tray = new Tray(getWindowIconPath());
  tray.on("click", showMainWindow);
  updateTrayMenu();
}

function notify(title: string, body: string): void {
  if (settingsService?.get().desktopNotifications === false || !Notification.isSupported()) return;
  new Notification({ title, body, icon: getWindowIconPath() }).show();
}

function startAutoRefresh(intervalMs: AppSettings["autoRefreshIntervalMs"] = currentRateLimitRefreshIntervalMs): void {
  currentRateLimitRefreshIntervalMs = intervalMs;
  if (autoRefreshTimer) clearInterval(autoRefreshTimer);
  autoRefreshTimer = setInterval(() => {
    void runAutoRefresh();
  }, currentRateLimitRefreshIntervalMs);
}

async function runAutoRefresh(): Promise<void> {
  await refreshAllRateLimits("auto");
}

async function refreshAllRateLimits(reason: "auto" | "manual") {
  if (!manager) return [];
  if (autoRefreshInFlight) {
    log(`Rate-limit refresh skipped because another refresh is already running: ${reason}`);
    return manager.list();
  }

  const accounts = manager.list();
  if (accounts.length === 0) return accounts;
  autoRefreshInFlight = true;
  try {
    log(`${reason === "auto" ? "Auto-refreshing" : "Refreshing"} rate limits for ${accounts.length} account(s)`);
    const refreshed = await manager.refreshAllAccounts();
    mainWindow?.webContents.send("accounts:updated");
    log(`${reason === "auto" ? "Auto-refresh" : "Manual refresh"} completed`);
    const settings = settingsService?.get();
    const recommendation = selectSmartAccount(refreshed, manager.getWorkspaceBinding(), { staleAfterSeconds: 15 * 60 });
    const target = recommendation ? refreshed.find((account) => account.id === recommendation.accountId) : null;
    if (settings?.smartSwitchMode === "auto" && target && !target.isActive) {
      log(`Smart auto-switch selected ${target.email}: ${recommendation?.reason ?? "no reason"}`);
      await manager.switchAccount(target.id);
      notify("Codex Account Manager", `Авто-переключение: ${target.label}`);
      mainWindow?.webContents.send("accounts:updated");
      updateTrayMenu();
      return manager.list();
    }
    if (settings?.smartSwitchMode === "suggest" && recommendation) {
      log(`Smart suggestion: ${recommendation.accountEmail}. Reason=${recommendation.reason}`);
    }
    return refreshed;
  } catch (error) {
    log(`${reason === "auto" ? "Auto-refresh" : "Manual refresh"} failed`, error);
    throw error;
  } finally {
    autoRefreshInFlight = false;
  }
}

const gotLock = process.env.CAM_ALLOW_MULTIPLE_INSTANCE === "1" || app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  if (process.platform === "win32") {
    app.setAppUserModelId(appUserModelId);
  }

  if (process.env.CAM_USER_DATA_DIR) {
    app.setPath("userData", process.env.CAM_USER_DATA_DIR);
  }

  app.on("second-instance", () => {
    if (!mainWindow) {
      mainWindow = createWindow();
      return;
    }
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
  });

  app.whenReady().then(() => {
    const appDataDir = getAppDataDir();
    logPath = path.join(appDataDir, "logs", "main.log");
    syncWindowsShortcutIcon({
      env: process.env,
      platform: process.platform,
      productName: "Codex Account Manager",
      sourceIcoPath: getWindowsShortcutIconSourcePath(),
      version: appVersion,
      log
    });
    updaterService = new UpdaterService(() => mainWindow, log);
    registerIpc(appDataDir);

    try {
      const store = new AccountStore(appDataDir);
      const vault = new Vault(appDataDir);
      const codexPath = resolveCodexPath();
      log(`Resolved Codex CLI: ${codexPath ?? "not found"}`);
      manager = new AccountManager(store, vault, appDataDir, codexPath);
      settingsService = new SettingsService(store);
      currentRateLimitRefreshIntervalMs = settingsService.get().autoRefreshIntervalMs;
      registerSettingsIpc(settingsService, (settings) => {
        startAutoRefresh(settings.autoRefreshIntervalMs);
        log(`Auto-refresh interval updated: ${settings.autoRefreshIntervalMs}ms`);
      });
      manager.on("auth-event", (event) => mainWindow?.webContents.send("auth:event", event));
      manager.on("log", (message) => log(String(message)));
      const repairedAuths = manager.repairEncryptedAuthCache();
      if (repairedAuths > 0) log(`Recovered encrypted auth cache for ${repairedAuths} account profile(s)`);
      startAutoRefresh(currentRateLimitRefreshIntervalMs);
      createTray();
      updateTrayMenu();
      log("Application services initialized");
    } catch (error) {
      startupError = error instanceof Error ? error.message : String(error);
      log("Failed to initialize application services", error);
    }

    mainWindow = createWindow();
    mainWindow.on("closed", () => {
      mainWindow = null;
    });
    if (app.isPackaged && process.env.CAM_DISABLE_AUTO_UPDATE !== "1") {
      setTimeout(() => {
        void updaterService?.checkForUpdates();
      }, 8_000);
    }

    app.on("activate", () => {
      if (BrowserWindow.getAllWindows().length === 0) mainWindow = createWindow();
    });
  });

  app.on("child-process-gone", (_event, details) => {
    log(`Child process gone: ${details.type} ${details.reason}`);
  });

  process.on("uncaughtException", (error) => captureCrash("Uncaught exception", error));
  process.on("unhandledRejection", (reason) => captureCrash("Unhandled rejection", reason));

  app.on("before-quit", () => {
    if (autoRefreshTimer) clearInterval(autoRefreshTimer);
    void manager?.shutdown().catch((error) => log("Failed to stop Codex child processes", error));
  });

  app.on("window-all-closed", () => {
    if (process.platform !== "darwin") app.quit();
  });
}
