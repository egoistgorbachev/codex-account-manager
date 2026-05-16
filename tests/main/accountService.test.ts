import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { AccountStore } from "../../src/main/db";
import { AccountService } from "../../src/main/services/accountService";

const dirs: string[] = [];

function tempDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "cam-account-"));
  dirs.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of dirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

describe("AccountService", () => {
  it("stores tags, favorite flag and archive flag", () => {
    const store = new AccountStore(tempDir());
    const service = new AccountService(store);

    try {
      store.upsert({
        id: "acc_1",
        label: "Рабочий аккаунт",
        email: "work@example.com",
        planType: "plus",
        profileDir: "C:\\profiles\\acc_1",
        encryptedAuthJson: "encrypted"
      });

      service.updateMetadata("acc_1", { tags: ["work", "backup"], favorite: true, archived: false });
      expect(service.getMetadata("acc_1")).toEqual({ tags: ["backup", "work"], favorite: true, archived: false });
      expect(store.get("acc_1")).toMatchObject({ tags: ["backup", "work"], favorite: true, archived: false });
    } finally {
      store.close();
    }
  });

  it("returns recent limit history in chronological order", () => {
    const store = new AccountStore(tempDir());

    try {
      store.upsert({
        id: "acc_1",
        label: "Рабочий аккаунт",
        email: "work@example.com",
        planType: "plus",
        profileDir: "C:\\profiles\\acc_1",
        encryptedAuthJson: "encrypted"
      });
      store.insertRateLimitSnapshot({
        id: "snap_2",
        accountId: "acc_1",
        capturedAt: 200,
        status: "active",
        statusReason: null,
        limits: {
          limitId: null,
          limitName: null,
          primary: { usedPercent: 40, resetsAt: null, windowDurationMins: 300 },
          secondary: { usedPercent: 10, resetsAt: null, windowDurationMins: 10_080 },
          credits: null,
          planType: "plus",
          rateLimitReachedType: null
        }
      });
      store.insertRateLimitSnapshot({
        id: "snap_1",
        accountId: "acc_1",
        capturedAt: 100,
        status: "near_limit",
        statusReason: "Высокая нагрузка",
        limits: {
          limitId: null,
          limitName: null,
          primary: { usedPercent: 80, resetsAt: null, windowDurationMins: 300 },
          secondary: { usedPercent: 30, resetsAt: null, windowDurationMins: 10_080 },
          credits: null,
          planType: "plus",
          rateLimitReachedType: null
        }
      });

      expect(store.listRateLimitHistory("acc_1")).toMatchObject([
        { capturedAt: 100, fiveHourUsedPercent: 80, weeklyUsedPercent: 30 },
        { capturedAt: 200, fiveHourUsedPercent: 40, weeklyUsedPercent: 10 }
      ]);
    } finally {
      store.close();
    }
  });
});
