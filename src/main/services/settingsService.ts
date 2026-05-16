import type { AppSettings } from "../../shared/types.js";
import type { AccountStore } from "../db.js";

const defaultSettings: AppSettings = {
  language: "ru",
  autoRefreshIntervalMs: 180_000,
  privacyMode: false,
  confirmSwitch: true,
  smartSwitchMode: "suggest",
  desktopNotifications: true,
  trayEnabled: false,
  autostartEnabled: false
};

export class SettingsService {
  constructor(private readonly store: AccountStore) {}

  get(): AppSettings {
    const raw = this.store.getSetting("appSettings");
    if (!raw) return defaultSettings;
    try {
      return { ...defaultSettings, ...(JSON.parse(raw) as Partial<AppSettings>), language: "ru" };
    } catch {
      return defaultSettings;
    }
  }

  update(input: Partial<Omit<AppSettings, "language">>): AppSettings {
    const next: AppSettings = { ...this.get(), ...input, language: "ru" };
    this.store.setSetting("appSettings", JSON.stringify(next));
    return next;
  }
}
