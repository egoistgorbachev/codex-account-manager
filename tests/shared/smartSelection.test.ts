import { describe, expect, it } from "vitest";
import type { ManagedAccount, WorkspaceBinding } from "../../src/shared/types";
import { selectSmartAccount } from "../../src/shared/smartSelection";

function account(input: Partial<ManagedAccount> & Pick<ManagedAccount, "id" | "label">): ManagedAccount {
  const { id, label, email, ...rest } = input;
  return {
    id,
    label,
    email: email ?? `${id}@example.com`,
    planType: "pro",
    profileDir: "test",
    isActive: false,
    createdAt: 0,
    updatedAt: 0,
    lastUsedAt: null,
    lastRefreshAt: null,
    subscriptionEndsAt: null,
    status: "active",
    statusReason: null,
    primaryUsedPercent: null,
    primaryResetsAt: null,
    primaryWindowDurationMins: null,
    secondaryUsedPercent: null,
    secondaryResetsAt: null,
    secondaryWindowDurationMins: null,
    fiveHourUsedPercent: 50,
    fiveHourResetsAt: null,
    weeklyUsedPercent: 10,
    weeklyResetsAt: null,
    notes: null,
    ...rest
  };
}

describe("selectSmartAccount", () => {
  it("ignores limited and error accounts", () => {
    const recommendation = selectSmartAccount([
      account({ id: "blocked", label: "blocked", status: "limited", fiveHourUsedPercent: 1 }),
      account({ id: "broken", label: "broken", status: "error", fiveHourUsedPercent: 1 }),
      account({ id: "ready", label: "ready", fiveHourUsedPercent: 45 })
    ]);

    expect(recommendation?.accountId).toBe("ready");
  });

  it("prefers a usable workspace-bound account", () => {
    const binding: WorkspaceBinding = {
      workspacePath: "C:/work",
      accountId: "workspace",
      accountLabel: "workspace",
      accountEmail: "workspace@example.com"
    };

    const recommendation = selectSmartAccount([
      account({ id: "low", label: "low", fiveHourUsedPercent: 4 }),
      account({ id: "workspace", label: "workspace", fiveHourUsedPercent: 33 })
    ], binding);

    expect(recommendation).toMatchObject({ accountId: "workspace", workspaceMatched: true });
    expect(recommendation?.reason).toContain("рабочей папке");
  });

  it("chooses the lower loaded account when there is no binding", () => {
    const recommendation = selectSmartAccount([
      account({ id: "busy", label: "busy", fiveHourUsedPercent: 82 }),
      account({ id: "calm", label: "calm", fiveHourUsedPercent: 12 })
    ]);

    expect(recommendation?.accountId).toBe("calm");
  });

  it("ignores archived and stale accounts before auto switching", () => {
    const recommendation = selectSmartAccount([
      account({ id: "archived", label: "archived", archived: true, fiveHourUsedPercent: 1, lastRefreshAt: 100 }),
      account({ id: "stale", label: "stale", fiveHourUsedPercent: 2, lastRefreshAt: 1 }),
      account({ id: "fresh", label: "fresh", fiveHourUsedPercent: 35, lastRefreshAt: 100 })
    ], null, { now: 100, staleAfterSeconds: 15 });

    expect(recommendation?.accountId).toBe("fresh");
  });

  it("does not prefer a workspace-bound account when its snapshot is stale", () => {
    const binding: WorkspaceBinding = {
      workspacePath: "C:/work",
      accountId: "workspace",
      accountLabel: "workspace",
      accountEmail: "workspace@example.com"
    };

    const recommendation = selectSmartAccount([
      account({ id: "workspace", label: "workspace", fiveHourUsedPercent: 1, lastRefreshAt: 1 }),
      account({ id: "fresh", label: "fresh", fiveHourUsedPercent: 40, lastRefreshAt: 100 })
    ], binding, { now: 100, staleAfterSeconds: 15 });

    expect(recommendation).toMatchObject({ accountId: "fresh", workspaceMatched: false });
  });
});
