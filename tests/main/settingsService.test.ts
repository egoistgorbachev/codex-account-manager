import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { AccountStore } from "../../src/main/db";
import { SettingsService } from "../../src/main/services/settingsService";

const dirs: string[] = [];

function tempDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "cam-settings-"));
  dirs.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of dirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

describe("SettingsService", () => {
  it("persists Russian-only settings with safe defaults", () => {
    const store = new AccountStore(tempDir());
    const service = new SettingsService(store);

    expect(service.get().language).toBe("ru");
    service.update({ privacyMode: true, autoRefreshIntervalMs: 300000 });

    expect(service.get()).toMatchObject({
      language: "ru",
      privacyMode: true,
      autoRefreshIntervalMs: 300000,
      smartSwitchMode: "suggest",
      desktopNotifications: true
    });
    service.update({ smartSwitchMode: "auto", desktopNotifications: false });

    expect(service.get()).toMatchObject({ smartSwitchMode: "auto", desktopNotifications: false });
    store.close();
  });
});
