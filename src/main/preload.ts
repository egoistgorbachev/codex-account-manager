import { contextBridge, ipcRenderer } from "electron";
import type { AppApi, AuthEvent } from "../shared/types.js";

const api: AppApi = {
  listAccounts: () => ipcRenderer.invoke("accounts:list"),
  startLogin: (type) => ipcRenderer.invoke("accounts:login:start", type),
  reauthenticateAccount: (accountId, type) => ipcRenderer.invoke("accounts:reauth:start", accountId, type),
  openExternal: (url) => ipcRenderer.invoke("app:openExternal", url),
  minimizeWindow: () => ipcRenderer.invoke("window:minimize"),
  toggleMaximizeWindow: () => ipcRenderer.invoke("window:toggleMaximize"),
  closeWindow: () => ipcRenderer.invoke("window:close"),
  selectWorkspace: () => ipcRenderer.invoke("app:workspace:select"),
  refreshAccount: (accountId) => ipcRenderer.invoke("accounts:refresh", accountId),
  refreshAllAccounts: () => ipcRenderer.invoke("accounts:refreshAll"),
  exportAccounts: (passphrase) => ipcRenderer.invoke("accounts:export", passphrase),
  importAccounts: (passphrase) => ipcRenderer.invoke("accounts:import", passphrase),
  importAuthJson: () => ipcRenderer.invoke("accounts:importAuthJson"),
  openProfileFolder: (accountId) => ipcRenderer.invoke("accounts:profileFolder:open", accountId),
  switchAccount: (accountId) => ipcRenderer.invoke("accounts:switch", accountId),
  deleteAccount: (accountId) => ipcRenderer.invoke("accounts:delete", accountId),
  bindWorkspaceAccount: (accountId) => ipcRenderer.invoke("workspace:bindAccount", accountId),
  getWorkspaceBinding: () => ipcRenderer.invoke("workspace:getBinding"),
  getSwitchHistory: () => ipcRenderer.invoke("switch:history"),
  getLimitHistory: (accountId) => ipcRenderer.invoke("limits:history", accountId),
  rollbackSwitch: (eventId) => ipcRenderer.invoke("switch:rollback", eventId),
  readLogTail: () => ipcRenderer.invoke("logs:tail"),
  openLogsFolder: () => ipcRenderer.invoke("logs:openFolder"),
  updateAccount: (input) => ipcRenderer.invoke("accounts:update", input),
  getDiagnostics: () => ipcRenderer.invoke("app:diagnostics"),
  getHealth: () => ipcRenderer.invoke("health:get"),
  getProfileIntegrity: () => ipcRenderer.invoke("profiles:integrity"),
  exportDiagnosticReport: () => ipcRenderer.invoke("diagnostics:exportReport"),
  getReleaseReadiness: () => ipcRenderer.invoke("release:readiness"),
  checkForUpdates: () => ipcRenderer.invoke("release:checkUpdates"),
  openReleaseFolder: () => ipcRenderer.invoke("release:openFolder"),
  openCrashReportsFolder: () => ipcRenderer.invoke("crashReports:openFolder"),
  getSettings: () => ipcRenderer.invoke("settings:get"),
  updateSettings: (input) => ipcRenderer.invoke("settings:update", input),
  onAuthEvent: (callback: (event: AuthEvent) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, payload: AuthEvent) => callback(payload);
    ipcRenderer.on("auth:event", listener);
    return () => ipcRenderer.off("auth:event", listener);
  },
  onAccountsUpdated: (callback: () => void) => {
    const listener = () => callback();
    ipcRenderer.on("accounts:updated", listener);
    return () => ipcRenderer.off("accounts:updated", listener);
  }
};

contextBridge.exposeInMainWorld("cam", api);
