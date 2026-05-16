import { describe, expect, it } from "vitest";
import { DiagnosticsService } from "../../src/main/services/diagnosticsService";

describe("DiagnosticsService", () => {
  it("reports missing Codex CLI as Russian user-facing issue", async () => {
    const service = new DiagnosticsService({
      appDataDir: "C:\\Users\\User\\AppData\\Roaming\\Codex Account Manager",
      codexHome: "C:\\Users\\User\\.codex",
      resolveCodexPath: async () => null,
      getSchemaVersion: () => 2,
      isVaultDegraded: () => false,
      logPath: "C:\\Users\\User\\AppData\\Roaming\\Codex Account Manager\\app.log"
    });

    const health = await service.getHealth();

    expect(health.items.find((item) => item.id === "codexCli")?.status).toBe("error");
    expect(health.items.find((item) => item.id === "codexCli")?.message).toBe("Codex CLI не найден.");
    expect(health.schemaVersion).toBe(2);
  });
});
