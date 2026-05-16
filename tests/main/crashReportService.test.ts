import { describe, expect, it } from "vitest";
import { buildCrashReport, sanitizeCrashText } from "../../src/main/services/crashReportService";

describe("crashReportService", () => {
  it("redacts common token shapes from crash text", () => {
    const text = sanitizeCrashText('Bearer sk-test-secret-token-value and "access_token":"eyJvery-secret-token"');

    expect(text).toContain("Bearer [скрыто]");
    expect(text).toContain('"access_token":"[скрыто]"');
    expect(text).not.toContain("sk-test-secret-token-value");
    expect(text).not.toContain("eyJvery-secret-token");
  });

  it("builds a local crash report without raw secret values", () => {
    const error = new Error("failed with password");
    error.stack = 'Error: failed\n{"password":"super-secret"}';

    const report = buildCrashReport("test", error);

    expect(report.format).toBe("one.egoist.codex-account-manager.crash-report");
    expect(report.kind).toBe("test");
    expect(report.message).toContain('"password":"[скрыто]"');
    expect(report.message).not.toContain("super-secret");
  });
});
