import { ipcMain } from "electron";
import { updateSettingsInputSchema } from "../../shared/ipcSchemas.js";
import type { AppSettings } from "../../shared/types.js";
import type { SettingsService } from "../services/settingsService.js";

export function registerSettingsIpc(service: SettingsService, onUpdate?: (settings: AppSettings) => void): void {
  ipcMain.handle("settings:get", () => service.get());
  ipcMain.handle("settings:update", (_event, input) => {
    const settings = service.update(updateSettingsInputSchema.parse(input));
    onUpdate?.(settings);
    return settings;
  });
}
