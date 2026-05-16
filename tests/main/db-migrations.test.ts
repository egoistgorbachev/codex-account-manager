import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import { afterEach, describe, expect, it } from "vitest";
import { AccountStore } from "../../src/main/db";

const dirs: string[] = [];
const oldAccountSchema = `
  CREATE TABLE IF NOT EXISTS accounts (
    id TEXT PRIMARY KEY,
    label TEXT NOT NULL,
    email TEXT NOT NULL,
    plan_type TEXT NOT NULL,
    profile_dir TEXT NOT NULL,
    encrypted_auth_json TEXT NOT NULL,
    is_active INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    last_used_at INTEGER,
    last_refresh_at INTEGER,
    subscription_ends_at INTEGER,
    status TEXT NOT NULL DEFAULT 'unknown',
    status_reason TEXT,
    rate_limit_json TEXT,
    notes TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_accounts_email ON accounts(email);
  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );
`;

function tempDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "cam-db-"));
  dirs.push(dir);
  return dir;
}

function dbPath(dir: string): string {
  return path.join(dir, "accounts.sqlite");
}

function readTables(dir: string): string[] {
  const db = new Database(dbPath(dir));
  try {
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all() as Array<{ name: string }>;
    return tables.map((row) => row.name);
  } finally {
    db.close();
  }
}

function readLedger(dir: string): Array<{ version: number; name: string }> {
  const db = new Database(dbPath(dir));
  try {
    return db
      .prepare("SELECT version, name FROM schema_migrations ORDER BY version")
      .all() as Array<{ version: number; name: string }>;
  } finally {
    db.close();
  }
}

function readIndexNames(dir: string): string[] {
  const db = new Database(dbPath(dir));
  try {
    const indexes = db.prepare("SELECT name FROM sqlite_master WHERE type = 'index'").all() as Array<{ name: string }>;
    return indexes.map((row) => row.name);
  } finally {
    db.close();
  }
}

afterEach(() => {
  for (const dir of dirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

describe("database migrations", () => {
  it("creates migration ledger and 2.0 tables", () => {
    const dir = tempDir();
    const store = new AccountStore(dir);
    try {
      const names = readTables(dir);
      const ledger = readLedger(dir);

      expect(names).toContain("schema_migrations");
      expect(names).toContain("switch_events");
      expect(names).toContain("rate_limit_snapshots");
      expect(names).toContain("settings");
      expect(names).toContain("account_tags");
      expect(ledger).toEqual([
        { version: 1, name: "initial_accounts_settings" },
        { version: 2, name: "v2_switch_limits_tags" },
        { version: 3, name: "v2_account_metadata" }
      ]);
    } finally {
      store.close();
    }
  });

  it("does not duplicate ledger rows when reopened", () => {
    const dir = tempDir();
    new AccountStore(dir).close();
    new AccountStore(dir).close();

    expect(readLedger(dir)).toEqual([
      { version: 1, name: "initial_accounts_settings" },
      { version: 2, name: "v2_switch_limits_tags" },
      { version: 3, name: "v2_account_metadata" }
    ]);
  });

  it("preserves rows when migrating a pre-migration database", () => {
    const dir = tempDir();
    const legacyDb = new Database(dbPath(dir));
    try {
      legacyDb.exec(oldAccountSchema);
      legacyDb
        .prepare(
          `INSERT INTO accounts (
            id, label, email, plan_type, profile_dir, encrypted_auth_json, is_active,
            created_at, updated_at, last_used_at, last_refresh_at, subscription_ends_at,
            status, status_reason, rate_limit_json, notes
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .run(
          "acct-legacy",
          "Legacy Plus",
          "legacy@example.com",
          "plus",
          "C:\\Users\\EGOIST\\AppData\\Roaming\\Codex\\Profiles\\legacy",
          "{\"token\":\"encrypted\"}",
          1,
          1_700_000_000,
          1_700_000_100,
          1_700_000_200,
          1_700_000_300,
          1_800_000_000,
          "active",
          null,
          JSON.stringify({
            limitId: "primary",
            limitName: "ChatGPT Plus",
            primary: { usedPercent: 42, windowDurationMins: 300, resetsAt: 1_700_018_000 },
            secondary: null,
            credits: null,
            planType: "plus",
            rateLimitReachedType: null
          }),
          "kept note"
        );
      legacyDb.prepare("INSERT INTO settings (key, value) VALUES (?, ?)").run("privacyMode", "true");
    } finally {
      legacyDb.close();
    }

    const store = new AccountStore(dir);
    try {
      const accounts = store.list();
      const tables = readTables(dir);
      const ledger = readLedger(dir);

      expect(accounts).toHaveLength(1);
      expect(accounts[0]).toMatchObject({
        id: "acct-legacy",
        label: "Legacy Plus",
        email: "legacy@example.com",
        planType: "plus",
        isActive: true,
        status: "active",
        primaryUsedPercent: 42,
        notes: "kept note"
      });
      expect(store.getSetting("privacyMode")).toBe("true");
      expect(tables).toEqual(expect.arrayContaining(["schema_migrations", "switch_events", "rate_limit_snapshots", "account_tags"]));
      expect(ledger).toEqual([
        { version: 1, name: "initial_accounts_settings" },
        { version: 2, name: "v2_switch_limits_tags" },
        { version: 3, name: "v2_account_metadata" }
      ]);
    } finally {
      store.close();
    }
  });

  it("keeps the accounts email index after migration", () => {
    const dir = tempDir();
    const store = new AccountStore(dir);
    try {
      expect(readIndexNames(dir)).toContain("idx_accounts_email");
    } finally {
      store.close();
    }
  });

  it("keeps account CRUD and list behavior working after migration", () => {
    const dir = tempDir();
    const store = new AccountStore(dir);
    try {
      const first = store.upsert({
        id: "acct-1",
        label: "First Account",
        email: "first@example.com",
        planType: "plus",
        profileDir: "C:\\profiles\\first",
        encryptedAuthJson: "{\"token\":\"first\"}"
      });
      const second = store.upsert({
        id: "acct-2",
        label: "Second Account",
        email: "second@example.com",
        planType: "pro",
        profileDir: "C:\\profiles\\second",
        encryptedAuthJson: "{\"token\":\"second\"}"
      });

      expect(first.status).toBe("active");
      expect(second.status).toBe("active");
      expect(store.get("acct-1")?.email).toBe("first@example.com");
      expect(store.getByEmail("SECOND@example.com")?.id).toBe("acct-2");

      store.setActive("acct-2");
      store.updateMeta("acct-1", { label: "Renamed Account", notes: "manual note", subscriptionEndsAt: 1_800_000_000 });
      store.setSetting("confirmSwitch", "false");

      const accounts = store.list();
      expect(accounts.map((account) => account.id)).toEqual(["acct-2", "acct-1"]);
      expect(accounts[0].isActive).toBe(true);
      expect(store.get("acct-1")).toMatchObject({
        label: "Renamed Account",
        notes: "manual note",
        subscriptionEndsAt: 1_800_000_000
      });
      expect(store.getSetting("confirmSwitch")).toBe("false");
      store.delete("acct-1");
      expect(store.get("acct-1")).toBeNull();
    } finally {
      store.close();
    }
  });
});
