import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import type { LimitHistoryPoint, ManagedAccount, PlanType, RateLimitSnapshot, SwitchHistoryItem } from "../shared/types.js";
import type { LimitSnapshotRecord } from "./services/limitService.js";

type Row = {
  id: string;
  label: string;
  email: string;
  plan_type: string;
  profile_dir: string;
  encrypted_auth_json: string;
  is_active: 0 | 1;
  created_at: number;
  updated_at: number;
  last_used_at: number | null;
  last_refresh_at: number | null;
  subscription_ends_at: number | null;
  status: ManagedAccount["status"];
  status_reason: string | null;
  rate_limit_json: string | null;
  notes: string | null;
  favorite?: 0 | 1;
  archived?: 0 | 1;
};

type Migration = {
  version: number;
  name: string;
  sql?: string;
  run?: (db: Database.Database) => void;
};

export interface AccountExportRecord {
  id: string;
  label: string;
  email: string;
  planType: PlanType;
  profileDir: string;
  encryptedAuthJson: string;
  isActive: boolean;
  createdAt: number;
  updatedAt: number;
  lastUsedAt: number | null;
  lastRefreshAt: number | null;
  subscriptionEndsAt: number | null;
  status: ManagedAccount["status"];
  statusReason: string | null;
  rateLimitJson: string | null;
  notes: string | null;
}

const migrations: Migration[] = [
  {
    version: 1,
    name: "initial_accounts_settings",
    sql: `
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
    `
  },
  {
    version: 2,
    name: "v2_switch_limits_tags",
    sql: `
      CREATE TABLE IF NOT EXISTS switch_events (
        id TEXT PRIMARY KEY,
        account_id TEXT NOT NULL,
        previous_account_id TEXT,
        started_at INTEGER NOT NULL,
        completed_at INTEGER,
        status TEXT NOT NULL,
        error TEXT,
        backup_path TEXT,
        codex_desktop_path TEXT,
        codex_app_user_model_id TEXT
      );
      CREATE TABLE IF NOT EXISTS rate_limit_snapshots (
        id TEXT PRIMARY KEY,
        account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
        captured_at INTEGER NOT NULL,
        status TEXT NOT NULL,
        status_reason TEXT,
        primary_used_percent REAL,
        primary_resets_at INTEGER,
        primary_window_duration_mins INTEGER,
        secondary_used_percent REAL,
        secondary_resets_at INTEGER,
        secondary_window_duration_mins INTEGER,
        raw_json TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS account_tags (
        account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
        tag TEXT NOT NULL,
        PRIMARY KEY (account_id, tag)
      );
    `
  },
  {
    version: 3,
    name: "v2_account_metadata",
    run: (db) => {
      const columns = new Set((db.prepare("PRAGMA table_info(accounts)").all() as Array<{ name: string }>).map((column) => column.name));
      if (!columns.has("favorite")) db.exec("ALTER TABLE accounts ADD COLUMN favorite INTEGER NOT NULL DEFAULT 0");
      if (!columns.has("archived")) db.exec("ALTER TABLE accounts ADD COLUMN archived INTEGER NOT NULL DEFAULT 0");
      db.exec(`
        CREATE TABLE IF NOT EXISTS account_tags (
          account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
          tag TEXT NOT NULL,
          PRIMARY KEY (account_id, tag)
        );
      `);
    }
  }
];

function runMigrations(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      applied_at INTEGER NOT NULL
    );
  `);
  const applied = new Set(
    (db.prepare("SELECT version FROM schema_migrations").all() as Array<{ version: number }>).map((row) => row.version)
  );
  const apply = db.transaction((migration: Migration) => {
    if (migration.sql) db.exec(migration.sql);
    migration.run?.(db);
    db.prepare("INSERT OR IGNORE INTO schema_migrations (version, name, applied_at) VALUES (?, ?, ?)").run(
      migration.version,
      migration.name,
      Math.floor(Date.now() / 1000)
    );
  });
  for (const migration of migrations) {
    if (!applied.has(migration.version)) apply(migration);
  }
}

function pickWindow(limits: RateLimitSnapshot | null, kind: "five-hour" | "weekly"): { usedPercent: number | null; resetsAt: number | null } {
  const windows = [limits?.primary, limits?.secondary].filter(Boolean) as NonNullable<RateLimitSnapshot["primary"]>[];
  if (kind === "weekly") {
    const weekly = windows.find((window) => (window.windowDurationMins ?? 0) >= 7 * 24 * 60 - 60);
    return { usedPercent: weekly?.usedPercent ?? null, resetsAt: weekly?.resetsAt ?? null };
  }
  const fiveHour =
    windows.find((window) => {
      const mins = window.windowDurationMins ?? 0;
      return mins >= 240 && mins <= 360;
    }) ?? windows.find((window) => (window.windowDurationMins ?? 0) < 24 * 60);
  return { usedPercent: fiveHour?.usedPercent ?? null, resetsAt: fiveHour?.resetsAt ?? null };
}

function getTags(db: Database.Database, accountId: string): string[] {
  return (
    db.prepare("SELECT tag FROM account_tags WHERE account_id = ? ORDER BY tag ASC").all(accountId) as Array<{ tag: string }>
  ).map((tagRow) => tagRow.tag);
}

function mapRow(row: Row, db?: Database.Database): ManagedAccount {
  const limits = row.rate_limit_json ? (JSON.parse(row.rate_limit_json) as RateLimitSnapshot) : null;
  const fiveHour = pickWindow(limits, "five-hour");
  const weekly = pickWindow(limits, "weekly");
  return {
    id: row.id,
    label: row.label,
    email: row.email,
    planType: row.plan_type as PlanType,
    profileDir: row.profile_dir,
    isActive: row.is_active === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    lastUsedAt: row.last_used_at,
    lastRefreshAt: row.last_refresh_at,
    subscriptionEndsAt: row.subscription_ends_at,
    status: row.status,
    statusReason: row.status_reason,
    primaryUsedPercent: limits?.primary?.usedPercent ?? null,
    primaryResetsAt: limits?.primary?.resetsAt ?? null,
    primaryWindowDurationMins: limits?.primary?.windowDurationMins ?? null,
    secondaryUsedPercent: limits?.secondary?.usedPercent ?? null,
    secondaryResetsAt: limits?.secondary?.resetsAt ?? null,
    secondaryWindowDurationMins: limits?.secondary?.windowDurationMins ?? null,
    fiveHourUsedPercent: fiveHour.usedPercent,
    fiveHourResetsAt: fiveHour.resetsAt,
    weeklyUsedPercent: weekly.usedPercent,
    weeklyResetsAt: weekly.resetsAt,
    notes: row.notes,
    tags: db ? getTags(db, row.id) : [],
    favorite: row.favorite === 1,
    archived: row.archived === 1
  };
}

export class AccountStore {
  private readonly db: Database.Database;

  constructor(appDataDir: string) {
    fs.mkdirSync(appDataDir, { recursive: true });
    this.db = new Database(path.join(appDataDir, "accounts.sqlite"));
    this.db.pragma("journal_mode = WAL");
    this.db.pragma("foreign_keys = ON");
    runMigrations(this.db);
  }

  close(): void {
    this.db.close();
  }

  getSchemaVersion(): number {
    const row = this.db.prepare("SELECT max(version) AS version FROM schema_migrations").get() as { version: number | null };
    return row.version ?? 0;
  }

  list(): ManagedAccount[] {
    const rows = this.db.prepare("SELECT * FROM accounts ORDER BY is_active DESC, updated_at DESC").all() as Row[];
    return rows.map((row) => mapRow(row, this.db));
  }

  listForExport(): AccountExportRecord[] {
    const rows = this.db.prepare("SELECT * FROM accounts ORDER BY is_active DESC, updated_at DESC").all() as Row[];
    return rows.map((row) => ({
      id: row.id,
      label: row.label,
      email: row.email,
      planType: row.plan_type as PlanType,
      profileDir: row.profile_dir,
      encryptedAuthJson: row.encrypted_auth_json,
      isActive: row.is_active === 1,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      lastUsedAt: row.last_used_at,
      lastRefreshAt: row.last_refresh_at,
      subscriptionEndsAt: row.subscription_ends_at,
      status: row.status,
      statusReason: row.status_reason,
      rateLimitJson: row.rate_limit_json,
      notes: row.notes
    }));
  }

  get(id: string): (ManagedAccount & { encryptedAuthJson: string }) | null {
    const row = this.db.prepare("SELECT * FROM accounts WHERE id = ?").get(id) as Row | undefined;
    return row ? { ...mapRow(row, this.db), encryptedAuthJson: row.encrypted_auth_json } : null;
  }

  getByEmail(email: string): (ManagedAccount & { encryptedAuthJson: string }) | null {
    const row = this.db
      .prepare("SELECT * FROM accounts WHERE lower(email) = lower(?) ORDER BY is_active DESC, updated_at DESC LIMIT 1")
      .get(email) as Row | undefined;
    return row ? { ...mapRow(row, this.db), encryptedAuthJson: row.encrypted_auth_json } : null;
  }

  upsert(input: {
    id: string;
    label: string;
    email: string;
    planType: PlanType;
    profileDir: string;
    encryptedAuthJson: string;
    rateLimits?: RateLimitSnapshot | null;
  }): ManagedAccount {
    const now = Math.floor(Date.now() / 1000);
    const existing = this.get(input.id);
    this.db
      .prepare(
        `INSERT INTO accounts (
          id, label, email, plan_type, profile_dir, encrypted_auth_json, created_at, updated_at,
          last_refresh_at, status, rate_limit_json
        ) VALUES (
          @id, @label, @email, @planType, @profileDir, @encryptedAuthJson, @now, @now,
          @now, 'active', @rateLimitJson
        )
        ON CONFLICT(id) DO UPDATE SET
          label = excluded.label,
          email = excluded.email,
          plan_type = excluded.plan_type,
          profile_dir = excluded.profile_dir,
          encrypted_auth_json = excluded.encrypted_auth_json,
          updated_at = excluded.updated_at,
          last_refresh_at = excluded.last_refresh_at,
          status = excluded.status,
          status_reason = NULL,
          rate_limit_json = excluded.rate_limit_json`
      )
      .run({
        ...input,
        label: existing?.label ?? input.label,
        now,
        rateLimitJson: input.rateLimits ? JSON.stringify(input.rateLimits) : null
      });
    const saved = this.get(input.id);
    if (!saved) throw new Error("Failed to save account");
    return saved;
  }

  setRateLimits(id: string, limits: RateLimitSnapshot, status: ManagedAccount["status"], reason: string | null): ManagedAccount {
    const now = Math.floor(Date.now() / 1000);
    this.db
      .prepare(
        "UPDATE accounts SET rate_limit_json = ?, status = ?, status_reason = ?, last_refresh_at = ?, updated_at = ? WHERE id = ?"
      )
      .run(JSON.stringify(limits), status, reason, now, now, id);
    const saved = this.get(id);
    if (!saved) throw new Error("Account not found");
    return saved;
  }

  insertRateLimitSnapshot(record: LimitSnapshotRecord): void {
    this.db
      .prepare(
        `INSERT INTO rate_limit_snapshots (
          id, account_id, captured_at, status, status_reason,
          primary_used_percent, primary_resets_at, primary_window_duration_mins,
          secondary_used_percent, secondary_resets_at, secondary_window_duration_mins,
          raw_json
        ) VALUES (
          @id, @accountId, @capturedAt, @status, @statusReason,
          @primaryUsedPercent, @primaryResetsAt, @primaryWindowDurationMins,
          @secondaryUsedPercent, @secondaryResetsAt, @secondaryWindowDurationMins,
          @rawJson
        )`
      )
      .run({
        id: record.id,
        accountId: record.accountId,
        capturedAt: record.capturedAt,
        status: record.status,
        statusReason: record.statusReason,
        primaryUsedPercent: record.limits.primary?.usedPercent ?? null,
        primaryResetsAt: record.limits.primary?.resetsAt ?? null,
        primaryWindowDurationMins: record.limits.primary?.windowDurationMins ?? null,
        secondaryUsedPercent: record.limits.secondary?.usedPercent ?? null,
        secondaryResetsAt: record.limits.secondary?.resetsAt ?? null,
        secondaryWindowDurationMins: record.limits.secondary?.windowDurationMins ?? null,
        rawJson: JSON.stringify(record.limits)
      });
  }

  listRateLimitHistory(accountId: string, limit = 18): LimitHistoryPoint[] {
    const rows = this.db
      .prepare(
        `SELECT
          account_id AS accountId,
          captured_at AS capturedAt,
          status,
          status_reason AS statusReason,
          primary_used_percent AS primaryUsedPercent,
          secondary_used_percent AS secondaryUsedPercent,
          primary_window_duration_mins AS primaryWindowDurationMins,
          secondary_window_duration_mins AS secondaryWindowDurationMins
        FROM rate_limit_snapshots
        WHERE account_id = ?
        ORDER BY captured_at DESC
        LIMIT ?`
      )
      .all(accountId, limit) as Array<{
      accountId: string;
      capturedAt: number;
      status: ManagedAccount["status"];
      statusReason: string | null;
      primaryUsedPercent: number | null;
      secondaryUsedPercent: number | null;
      primaryWindowDurationMins: number | null;
      secondaryWindowDurationMins: number | null;
    }>;

    return rows.reverse().map((row) => {
      const primary = row.primaryUsedPercent === null ? null : {
        usedPercent: row.primaryUsedPercent,
        resetsAt: null,
        windowDurationMins: row.primaryWindowDurationMins
      };
      const secondary = row.secondaryUsedPercent === null ? null : {
        usedPercent: row.secondaryUsedPercent,
        resetsAt: null,
        windowDurationMins: row.secondaryWindowDurationMins
      };
      const limits = { limitId: null, limitName: null, primary, secondary, credits: null, planType: null, rateLimitReachedType: null };
      const fiveHour = pickWindow(limits, "five-hour");
      const weekly = pickWindow(limits, "weekly");
      return {
        accountId: row.accountId,
        capturedAt: row.capturedAt,
        status: row.status,
        statusReason: row.statusReason,
        fiveHourUsedPercent: fiveHour.usedPercent,
        weeklyUsedPercent: weekly.usedPercent,
        primaryUsedPercent: row.primaryUsedPercent,
        secondaryUsedPercent: row.secondaryUsedPercent
      };
    });
  }

  setStatus(id: string, status: ManagedAccount["status"], reason: string | null): ManagedAccount {
    const now = Math.floor(Date.now() / 1000);
    this.db
      .prepare("UPDATE accounts SET status = ?, status_reason = ?, updated_at = ? WHERE id = ?")
      .run(status, reason, now, id);
    const saved = this.get(id);
    if (!saved) throw new Error("Account not found");
    return saved;
  }

  updateEncryptedAuthJson(id: string, encryptedAuthJson: string): ManagedAccount {
    const now = Math.floor(Date.now() / 1000);
    this.db
      .prepare("UPDATE accounts SET encrypted_auth_json = ?, updated_at = ?, status_reason = NULL WHERE id = ?")
      .run(encryptedAuthJson, now, id);
    const saved = this.get(id);
    if (!saved) throw new Error("Account not found");
    return saved;
  }

  setActive(id: string): ManagedAccount {
    const now = Math.floor(Date.now() / 1000);
    const tx = this.db.transaction(() => {
      this.db.prepare("UPDATE accounts SET is_active = 0").run();
      this.db.prepare("UPDATE accounts SET is_active = 1, last_used_at = ?, updated_at = ? WHERE id = ?").run(now, now, id);
    });
    tx();
    const saved = this.get(id);
    if (!saved) throw new Error("Account not found");
    return saved;
  }

  recordSwitchEvent(event: {
    id: string;
    accountId: string;
    previousAccountId: string | null;
    startedAt: number;
    completedAt: number | null;
    status: string;
    error: string | null;
    backupPath: string | null;
  }): void {
    this.db
      .prepare(
        `INSERT INTO switch_events (
          id, account_id, previous_account_id, started_at, completed_at, status, error, backup_path
        ) VALUES (
          @id, @accountId, @previousAccountId, @startedAt, @completedAt, @status, @error, @backupPath
        )
        ON CONFLICT(id) DO UPDATE SET
          completed_at = excluded.completed_at,
          status = excluded.status,
          error = excluded.error,
          backup_path = excluded.backup_path`
      )
      .run(event);
  }

  setAccountMetadata(accountId: string, metadata: { tags: string[]; favorite: boolean; archived: boolean }): void {
    const tx = this.db.transaction(() => {
      this.db.prepare("UPDATE accounts SET favorite = ?, archived = ?, updated_at = ? WHERE id = ?").run(
        metadata.favorite ? 1 : 0,
        metadata.archived ? 1 : 0,
        Math.floor(Date.now() / 1000),
        accountId
      );
      this.db.prepare("DELETE FROM account_tags WHERE account_id = ?").run(accountId);
      const insert = this.db.prepare("INSERT INTO account_tags (account_id, tag) VALUES (?, ?)");
      for (const tag of metadata.tags) insert.run(accountId, tag);
    });
    tx();
  }

  getAccountMetadata(accountId: string): { tags: string[]; favorite: boolean; archived: boolean } {
    const row = this.db.prepare("SELECT favorite, archived FROM accounts WHERE id = ?").get(accountId) as
      | { favorite: 0 | 1; archived: 0 | 1 }
      | undefined;
    const tags = (
      this.db.prepare("SELECT tag FROM account_tags WHERE account_id = ? ORDER BY tag ASC").all(accountId) as Array<{ tag: string }>
    ).map((tagRow) => tagRow.tag);
    return { tags, favorite: row?.favorite === 1, archived: row?.archived === 1 };
  }

  listSwitchEvents(limit = 8): SwitchHistoryItem[] {
    const rows = this.db
      .prepare(
        `SELECT
          switch_events.id,
          switch_events.account_id AS accountId,
          accounts.label AS accountLabel,
          accounts.email AS accountEmail,
          switch_events.previous_account_id AS previousAccountId,
          switch_events.started_at AS startedAt,
          switch_events.completed_at AS completedAt,
          switch_events.status,
          switch_events.error,
          switch_events.backup_path AS backupPath
        FROM switch_events
        LEFT JOIN accounts ON accounts.id = switch_events.account_id
        ORDER BY switch_events.started_at DESC
        LIMIT ?`
      )
      .all(limit) as SwitchHistoryItem[];
    return rows;
  }

  getSwitchEvent(id: string): SwitchHistoryItem | null {
    const row = this.db
      .prepare(
        `SELECT
          switch_events.id,
          switch_events.account_id AS accountId,
          accounts.label AS accountLabel,
          accounts.email AS accountEmail,
          switch_events.previous_account_id AS previousAccountId,
          switch_events.started_at AS startedAt,
          switch_events.completed_at AS completedAt,
          switch_events.status,
          switch_events.error,
          switch_events.backup_path AS backupPath
        FROM switch_events
        LEFT JOIN accounts ON accounts.id = switch_events.account_id
        WHERE switch_events.id = ?
        LIMIT 1`
      )
      .get(id) as SwitchHistoryItem | undefined;
    return row ?? null;
  }

  updateMeta(id: string, input: {
    label?: string;
    notes?: string | null;
    subscriptionEndsAt?: number | null;
    tags?: string[];
    favorite?: boolean;
    archived?: boolean;
  }): ManagedAccount {
    const current = this.get(id);
    if (!current) throw new Error("Account not found");
    const now = Math.floor(Date.now() / 1000);
    this.db
      .prepare("UPDATE accounts SET label = ?, notes = ?, subscription_ends_at = ?, updated_at = ? WHERE id = ?")
      .run(input.label ?? current.label, input.notes ?? current.notes, input.subscriptionEndsAt ?? current.subscriptionEndsAt, now, id);
    if (input.tags || input.favorite !== undefined || input.archived !== undefined) {
      this.setAccountMetadata(id, {
        tags: input.tags ?? current.tags ?? [],
        favorite: input.favorite ?? current.favorite ?? false,
        archived: input.archived ?? current.archived ?? false
      });
    }
    const saved = this.get(id);
    if (!saved) throw new Error("Account not found");
    return saved;
  }

  delete(id: string): void {
    this.db.prepare("DELETE FROM accounts WHERE id = ?").run(id);
  }

  importPortable(input: AccountExportRecord & { profileDir: string }): ManagedAccount {
    const now = Math.floor(Date.now() / 1000);
    this.db
      .prepare(
        `INSERT INTO accounts (
          id, label, email, plan_type, profile_dir, encrypted_auth_json, is_active,
          created_at, updated_at, last_used_at, last_refresh_at, subscription_ends_at,
          status, status_reason, rate_limit_json, notes
        ) VALUES (
          @id, @label, @email, @planType, @profileDir, @encryptedAuthJson, 0,
          @createdAt, @now, @lastUsedAt, @lastRefreshAt, @subscriptionEndsAt,
          @status, @statusReason, @rateLimitJson, @notes
        )
        ON CONFLICT(id) DO UPDATE SET
          label = excluded.label,
          email = excluded.email,
          plan_type = excluded.plan_type,
          profile_dir = excluded.profile_dir,
          encrypted_auth_json = excluded.encrypted_auth_json,
          updated_at = excluded.updated_at,
          last_used_at = excluded.last_used_at,
          last_refresh_at = excluded.last_refresh_at,
          subscription_ends_at = excluded.subscription_ends_at,
          status = excluded.status,
          status_reason = excluded.status_reason,
          rate_limit_json = excluded.rate_limit_json,
          notes = excluded.notes`
      )
      .run({
        ...input,
        createdAt: input.createdAt || now,
        now,
        status: input.status ?? "unknown",
        statusReason: input.statusReason ?? null,
        rateLimitJson: input.rateLimitJson ?? null,
        notes: input.notes ?? null
      });
    const saved = this.get(input.id);
    if (!saved) throw new Error("Failed to import account");
    return saved;
  }

  getSetting(key: string): string | null {
    const row = this.db.prepare("SELECT value FROM settings WHERE key = ?").get(key) as { value: string } | undefined;
    return row?.value ?? null;
  }

  setSetting(key: string, value: string): void {
    this.db
      .prepare(
        `INSERT INTO settings (key, value) VALUES (?, ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value`
      )
      .run(key, value);
  }
}
