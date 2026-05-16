import { describe, expect, it } from "vitest";
import { switchAccountInputSchema, updateSettingsInputSchema } from "../../src/shared/ipcSchemas";

describe("IPC schemas", () => {
  it("accepts valid switch input and rejects empty account id", () => {
    expect(switchAccountInputSchema.parse({ accountId: "acc_123" })).toEqual({ accountId: "acc_123" });
    expect(() => switchAccountInputSchema.parse({ accountId: "" })).toThrow();
  });

  it("rejects unknown switch input keys", () => {
    expect(() => switchAccountInputSchema.parse({ accountId: "acc_123", extra: true })).toThrow();
  });

  it("accepts Russian-only UI language setting", () => {
    expect(updateSettingsInputSchema.parse({ language: "ru", autoRefreshIntervalMs: 180000 })).toEqual({
      language: "ru",
      autoRefreshIntervalMs: 180000
    });
    expect(() => updateSettingsInputSchema.parse({ language: "en" })).toThrow();
  });

  it("rejects unsupported refresh intervals", () => {
    expect(() => updateSettingsInputSchema.parse({ language: "ru", autoRefreshIntervalMs: 120000 })).toThrow();
  });

  it("accepts optional privacy and switch confirmation booleans", () => {
    expect(
      updateSettingsInputSchema.parse({
        language: "ru",
        privacyMode: true,
        confirmSwitch: false,
        smartSwitchMode: "auto",
        desktopNotifications: false
      })
    ).toEqual({
      language: "ru",
      privacyMode: true,
      confirmSwitch: false,
      smartSwitchMode: "auto",
      desktopNotifications: false
    });
    expect(() => updateSettingsInputSchema.parse({ smartSwitchMode: "manual" })).toThrow();
  });

  it("rejects unknown settings input keys", () => {
    expect(() => updateSettingsInputSchema.parse({ language: "ru", extra: true })).toThrow();
  });
});
