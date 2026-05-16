import { ipcMain } from "electron";
import type { DiagnosticsService } from "../services/diagnosticsService.js";

export function registerHealthIpc(service: DiagnosticsService): void {
  ipcMain.handle("health:get", () => service.getHealth());
}
