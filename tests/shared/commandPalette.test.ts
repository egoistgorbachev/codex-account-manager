import { describe, expect, it } from "vitest";
import { buildCommandPalette, filterCommandPalette } from "../../src/shared/commandPalette";
import type { ManagedAccount, SmartRecommendation } from "../../src/shared/types";

function account(input: Partial<ManagedAccount> & Pick<ManagedAccount, "id" | "label">): ManagedAccount {
  return {
    id: input.id,
    label: input.label,
    email: input.email ?? `${input.id}@example.com`,
    planType: "pro",
    profileDir: "test",
    isActive: input.isActive ?? false,
    createdAt: 0,
    updatedAt: 0,
    lastUsedAt: null,
    lastRefreshAt: 100,
    subscriptionEndsAt: null,
    status: input.status ?? "active",
    statusReason: null,
    primaryUsedPercent: null,
    primaryResetsAt: null,
    primaryWindowDurationMins: null,
    secondaryUsedPercent: null,
    secondaryResetsAt: null,
    secondaryWindowDurationMins: null,
    fiveHourUsedPercent: input.fiveHourUsedPercent ?? 20,
    fiveHourResetsAt: null,
    weeklyUsedPercent: input.weeklyUsedPercent ?? 10,
    weeklyResetsAt: null,
    notes: null,
    favorite: input.favorite ?? false,
    archived: input.archived ?? false
  };
}

describe("command palette model", () => {
  it("builds navigation, account and diagnostics commands in Russian", () => {
    const recommendation: SmartRecommendation = {
      accountId: "backup",
      accountLabel: "backup",
      accountEmail: "backup@example.com",
      score: 12,
      reason: "Ниже нагрузка по лимитам и нет ошибок статуса",
      workspaceMatched: false
    };

    const commands = buildCommandPalette({
      accounts: [
        account({ id: "active", label: "основной", isActive: true }),
        account({ id: "backup", label: "backup", favorite: true })
      ],
      activeView: "dashboard",
      smartRecommendation: recommendation
    });

    expect(commands.map((command) => command.title)).toContain("Переключить на лучший профиль");
    expect(commands.map((command) => command.title)).toContain("Открыть диагностику");
    expect(commands.map((command) => command.title)).toContain("Переключить: backup");
    expect(commands.some((command) => /[А-Яа-яЁё]/.test(command.title))).toBe(true);
  });

  it("filters commands by title, subtitle and keywords", () => {
    const commands = buildCommandPalette({
      accounts: [account({ id: "client", label: "клиент", email: "client@example.com" })],
      activeView: "dashboard",
      smartRecommendation: null
    });

    expect(filterCommandPalette(commands, "client").map((command) => command.id)).toContain("account.switch.client");
    expect(filterCommandPalette(commands, "журнал").map((command) => command.id)).toContain("diagnostics.logs");
    expect(filterCommandPalette(commands, "лимиты").map((command) => command.id)).toContain("accounts.refreshAll");
  });

  it("does not offer archived or active accounts as switch targets", () => {
    const commands = buildCommandPalette({
      accounts: [
        account({ id: "active", label: "активный", isActive: true }),
        account({ id: "archive", label: "архив", archived: true }),
        account({ id: "ready", label: "готовый" })
      ],
      activeView: "accounts",
      smartRecommendation: null
    });

    expect(commands.map((command) => command.id)).not.toContain("account.switch.active");
    expect(commands.map((command) => command.id)).not.toContain("account.switch.archive");
    expect(commands.map((command) => command.id)).toContain("account.switch.ready");
  });
});
