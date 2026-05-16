import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { EventEmitter } from "node:events";
import type {
  AccountImportResult,
  AuthEvent,
  LoginStartResult,
  LimitHistoryPoint,
  ManagedAccount,
  PlanType,
  ProfileIntegrityReport,
  SwitchHistoryItem,
  WorkspaceBinding
} from "../shared/types.js";
import type { AccountExportRecord } from "./db.js";
import { AccountStore } from "./db.js";
import { Vault } from "./security.js";
import { getAuthJsonPath, getDefaultCodexHome, getDefaultWorkspacePath, getProfileDir } from "./paths.js";
import { CodexRpcClient, classifyRateLimit, getAuthFilePath, selectBestRateLimit } from "./codexRpc.js";
import { getCodexAppUserModelId, resolveCodexDesktopPath, resolveCodexPath, scheduleCodexRestart, stopCodexProcesses } from "./processManager.js";
import { SwitchService } from "./services/switchService.js";

interface PendingLogin {
  profileId: string;
  profileDir: string;
  client: CodexRpcClient;
  pollTimer: NodeJS.Timeout | null;
  startedAt: number;
  replaceAccountId?: string;
  previousProfileDir?: string;
}

const portableExportFormat = "one.egoist.codex-account-manager.accounts";
const portableExportVersion = 1;
const portableExportIterations = 260_000;

interface PortableAccount {
  id: string;
  label: string;
  email: string;
  planType: PlanType;
  authJson: string;
  exportedWasActive: boolean;
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

interface PortablePayload {
  format: typeof portableExportFormat;
  version: typeof portableExportVersion;
  exportedAt: number;
  accounts: PortableAccount[];
}

interface PortableEnvelope {
  format: typeof portableExportFormat;
  version: typeof portableExportVersion;
  exportedAt: number;
  kdf: {
    name: "pbkdf2-sha256";
    iterations: number;
    salt: string;
  };
  cipher: {
    name: "aes-256-gcm";
    iv: string;
    tag: string;
    ciphertext: string;
  };
}

function atomicWrite(filePath: string, data: string): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const tmp = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tmp, data, "utf8");
  fs.renameSync(tmp, filePath);
}

function deriveExportKey(passphrase: string, salt: Buffer, iterations: number): Buffer {
  if (passphrase.trim().length < 8) {
    throw new Error("Export password must contain at least 8 characters");
  }
  return crypto.pbkdf2Sync(passphrase, salt, iterations, 32, "sha256");
}

function encryptPortablePayload(payload: PortablePayload, passphrase: string): PortableEnvelope {
  const salt = crypto.randomBytes(16);
  const iv = crypto.randomBytes(12);
  const key = deriveExportKey(passphrase, salt, portableExportIterations);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(payload), "utf8"), cipher.final()]);
  return {
    format: portableExportFormat,
    version: portableExportVersion,
    exportedAt: payload.exportedAt,
    kdf: {
      name: "pbkdf2-sha256",
      iterations: portableExportIterations,
      salt: salt.toString("base64")
    },
    cipher: {
      name: "aes-256-gcm",
      iv: iv.toString("base64"),
      tag: cipher.getAuthTag().toString("base64"),
      ciphertext: ciphertext.toString("base64")
    }
  };
}

function decryptPortablePayload(input: string, passphrase: string): PortablePayload {
  const envelope = JSON.parse(input) as PortableEnvelope;
  if (envelope.format !== portableExportFormat || envelope.version !== portableExportVersion) {
    throw new Error("Unsupported account export file");
  }
  if (envelope.kdf?.name !== "pbkdf2-sha256" || envelope.cipher?.name !== "aes-256-gcm") {
    throw new Error("Unsupported account export encryption");
  }
  const salt = Buffer.from(envelope.kdf.salt, "base64");
  const iv = Buffer.from(envelope.cipher.iv, "base64");
  const tag = Buffer.from(envelope.cipher.tag, "base64");
  const ciphertext = Buffer.from(envelope.cipher.ciphertext, "base64");
  const key = deriveExportKey(passphrase, salt, envelope.kdf.iterations);
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  const payload = JSON.parse(Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8")) as PortablePayload;
  if (payload.format !== portableExportFormat || payload.version !== portableExportVersion || !Array.isArray(payload.accounts)) {
    throw new Error("Invalid account export payload");
  }
  return payload;
}

function backupFile(filePath: string): void {
  if (!fs.existsSync(filePath)) return;
  const backupPath = `${filePath}.cam-backup-${new Date().toISOString().replace(/[:.]/g, "-")}`;
  fs.copyFileSync(filePath, backupPath);
  pruneAuthBackups(filePath);
}

function getAuthAccountId(authJson: string): string | null {
  try {
    const parsed = JSON.parse(authJson) as { tokens?: { account_id?: unknown } };
    return typeof parsed.tokens?.account_id === "string" && parsed.tokens.account_id ? parsed.tokens.account_id : null;
  } catch {
    return null;
  }
}

function replaceStateAccountIds(value: unknown, targetAccountId: string, previousAccountId: string | null): boolean {
  if (!value || typeof value !== "object") return false;
  let changed = false;
  const record = value as Record<string, unknown>;
  for (const [key, current] of Object.entries(record)) {
    if (current && typeof current === "object") {
      changed = replaceStateAccountIds(current, targetAccountId, previousAccountId) || changed;
      continue;
    }

    if (typeof current !== "string") continue;
    const isKnownAccountKey = ["creator_id", "creatorId", "account_id", "accountId", "providerAccountId"].includes(key);
    if (!isKnownAccountKey) continue;
    if (previousAccountId && current !== previousAccountId) continue;
    record[key] = targetAccountId;
    changed = true;
  }
  return changed;
}

function syncCodexGlobalState(codexHome: string, targetAuthJson: string, previousAuthJson: string | null): number {
  const targetAccountId = getAuthAccountId(targetAuthJson);
  if (!targetAccountId) return 0;

  const previousAccountId = previousAuthJson ? getAuthAccountId(previousAuthJson) : null;
  let changedFiles = 0;
  for (const name of [".codex-global-state.json", ".codex-global-state.json.bak"]) {
    const filePath = path.join(codexHome, name);
    if (!fs.existsSync(filePath)) continue;

    try {
      const state = JSON.parse(fs.readFileSync(filePath, "utf8")) as unknown;
      if (!replaceStateAccountIds(state, targetAccountId, previousAccountId)) continue;
      backupFile(filePath);
      atomicWrite(filePath, `${JSON.stringify(state, null, 2)}\n`);
      changedFiles += 1;
    } catch {
      // Global-state sync is a compatibility helper; auth.json remains the source of truth.
    }
  }
  return changedFiles;
}

function pruneAuthBackups(filePath: string, keep = 20): void {
  try {
    const dir = path.dirname(filePath);
    const prefix = `${path.basename(filePath)}.cam-backup-`;
    const backups = fs
      .readdirSync(dir, { withFileTypes: true })
      .filter((entry) => entry.isFile() && entry.name.startsWith(prefix))
      .map((entry) => {
        const fullPath = path.join(dir, entry.name);
        return { path: fullPath, mtime: fs.statSync(fullPath).mtimeMs };
      })
      .sort((a, b) => b.mtime - a.mtime);

    for (const backup of backups.slice(keep)) {
      fs.rmSync(backup.path, { force: true });
    }
  } catch {
    // Backup pruning is best-effort and must never block account switching.
  }
}

function getDisplayLabel(email: string): string {
  return email.split("@")[0] || email;
}

function getAccountIdentity(account: unknown): { email: string; planType: PlanType } {
  const current = account as { type?: string; email?: string; planType?: string } | null;
  if (!current || current.type !== "chatgpt" || !current.email) {
    throw new Error("Codex profile is not logged into a ChatGPT account");
  }
  return { email: current.email, planType: current.planType ?? "unknown" };
}

export class AccountManager extends EventEmitter {
  private readonly pendingLogins = new Map<string, PendingLogin>();
  private readonly codexPath: string | null;
  private switchInFlight: Promise<ManagedAccount> | null = null;

  constructor(
    private readonly store: AccountStore,
    private readonly vault: Vault,
    private readonly appDataDir: string,
    codexPath?: string | null
  ) {
    super();
    this.codexPath = codexPath ?? null;
  }

  list(): ManagedAccount[] {
    return this.store.list();
  }

  async shutdown(): Promise<void> {
    const pending = [...this.pendingLogins.values()];
    this.pendingLogins.clear();
    for (const login of pending) {
      if (login.pollTimer) clearTimeout(login.pollTimer);
    }
    await Promise.allSettled(pending.map((login) => login.client.stop()));
  }

  async startLogin(type: "chatgpt" | "chatgptDeviceCode"): Promise<LoginStartResult> {
    return this.beginLogin(type);
  }

  async reauthenticateAccount(accountId: string, type: "chatgpt" | "chatgptDeviceCode"): Promise<LoginStartResult> {
    const account = this.store.get(accountId);
    if (!account) throw new Error("Account not found");
    return this.beginLogin(type, {
      replaceAccountId: account.id,
      previousProfileDir: account.profileDir
    });
  }

  private async beginLogin(
    type: "chatgpt" | "chatgptDeviceCode",
    options: { replaceAccountId?: string; previousProfileDir?: string } = {}
  ): Promise<LoginStartResult> {
    const profileId = crypto.randomUUID();
    const profileDir = getProfileDir(this.appDataDir, profileId);
    fs.mkdirSync(profileDir, { recursive: true });

    const client = new CodexRpcClient(profileDir, this.requireCodexPath());
    client.on("account/login/completed", (params) => {
      void this.finalizeLogin(profileId, params as { loginId: string | null; success: boolean; error: string | null });
    });
    client.on("stderr", (chunk) => this.emit("log", String(chunk)));

    const response = await client.startLogin(type);
    if (response.type !== "chatgpt" && response.type !== "chatgptDeviceCode") {
      await client.stop();
      throw new Error("Unexpected Codex login response");
    }

    this.pendingLogins.set(response.loginId, {
      profileId,
      profileDir,
      client,
      pollTimer: null,
      startedAt: Date.now(),
      replaceAccountId: options.replaceAccountId,
      previousProfileDir: options.previousProfileDir
    });
    this.scheduleLoginPoll(response.loginId, profileId);
    return {
      profileId: options.replaceAccountId ?? profileId,
      loginId: response.loginId,
      type: response.type,
      authUrl: response.type === "chatgpt" ? response.authUrl : undefined,
      verificationUrl: response.type === "chatgptDeviceCode" ? response.verificationUrl : undefined,
      userCode: response.type === "chatgptDeviceCode" ? response.userCode : undefined
    };
  }

  async refreshAccount(accountId: string): Promise<ManagedAccount> {
    const account = this.store.get(accountId);
    if (!account) throw new Error("Account not found");
    this.ensureProfileAuth(account.profileDir, account.encryptedAuthJson);

    const client = new CodexRpcClient(account.profileDir, this.requireCodexPath());
    try {
      await client.readAccount(true);
      const response = await client.readRateLimits();
      const snapshot = selectBestRateLimit(response);
      const classified = classifyRateLimit(snapshot);
      this.store.insertRateLimitSnapshot({
        id: crypto.randomUUID(),
        accountId: account.id,
        capturedAt: Math.floor(Date.now() / 1000),
        status: classified.status,
        statusReason: classified.reason,
        limits: snapshot
      });
      return this.store.setRateLimits(account.id, snapshot, classified.status, classified.reason);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return this.store.setStatus(account.id, "error", message);
    } finally {
      await client.stop();
    }
  }

  async refreshAllAccounts(): Promise<ManagedAccount[]> {
    const accounts = this.store.list();
    const refreshed: ManagedAccount[] = [];
    for (const account of accounts) {
      try {
        refreshed.push(await this.refreshAccount(account.id));
      } catch (error) {
        this.emit("log", `Auto-refresh failed for ${account.email}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
    return refreshed;
  }

  repairEncryptedAuthCache(): number {
    let repaired = 0;
    for (const account of this.store.listForExport()) {
      try {
        if (this.readAccountAuthJsonWithRecovery(account).recovered) {
          repaired += 1;
        }
      } catch (error) {
        this.emit("log", `Auth cache repair skipped for ${account.email}: ${error instanceof Error ? error.message : String(error)}`);
        continue;
      }
    }
    return repaired;
  }

  async switchAccount(accountId: string): Promise<ManagedAccount> {
    if (this.switchInFlight) return this.switchInFlight;
    this.switchInFlight = this.performSwitchAccount(accountId).finally(() => {
      this.switchInFlight = null;
    });
    return this.switchInFlight;
  }

  private async performSwitchAccount(accountId: string): Promise<ManagedAccount> {
    const account = this.store.get(accountId);
    if (!account) throw new Error("Account not found");
    const authJson = this.readAccountAuthJson(account);
    const activeAuthPath = getAuthJsonPath(getDefaultCodexHome());
    const previousAuthJson = fs.existsSync(activeAuthPath) ? fs.readFileSync(activeAuthPath, "utf8") : null;
    const switchService = new SwitchService({
      codexHome: getDefaultCodexHome(),
      stopCodex: () => stopCodexProcesses(),
      startCodex: async () => {
        const syncedFiles = syncCodexGlobalState(getDefaultCodexHome(), authJson, previousAuthJson);
        this.emit("log", `Codex auth file updated and verified: ${activeAuthPath}. Synced ${syncedFiles} global state file(s).`);
      },
      recordEvent: async (event) => {
        this.store.recordSwitchEvent(event);
      }
    });

    await switchService.switchTo({
      accountId,
      previousAccountId: previousAuthJson ? getAuthAccountId(previousAuthJson) : null,
      expectedAuthAccountId: getAuthAccountId(authJson) ?? accountId,
      authJson
    });

    const saved = this.store.setActive(accountId);
    const desktopPath = resolveCodexDesktopPath();
    const appUserModelId = getCodexAppUserModelId();
    const restart = scheduleCodexRestart(desktopPath, appUserModelId, this.appDataDir);
    this.emit(
      "log",
      `Codex restart scheduled. Desktop=${desktopPath ?? "not found"} AppID=${appUserModelId ?? "not found"} Launcher=${restart.launcherPath} LauncherLog=${restart.launcherLogPath} Script=${restart.scriptPath} Log=${restart.logPath}`
    );
    return saved;
  }

  getWorkspacePath(): string {
    return this.store.getSetting("workspacePath") ?? getDefaultWorkspacePath();
  }

  setWorkspacePath(workspacePath: string): void {
    this.store.setSetting("workspacePath", workspacePath);
  }

  getWorkspaceBinding(): WorkspaceBinding {
    const workspacePath = this.getWorkspacePath();
    const raw = this.store.getSetting("workspaceBindings");
    const bindings = raw ? (JSON.parse(raw) as Record<string, string | null>) : {};
    const accountId = bindings[workspacePath] ?? null;
    const account = accountId ? this.store.get(accountId) : null;
    return {
      workspacePath,
      accountId: account?.id ?? null,
      accountLabel: account?.label ?? null,
      accountEmail: account?.email ?? null
    };
  }

  bindWorkspaceAccount(accountId: string | null): WorkspaceBinding {
    const workspacePath = this.getWorkspacePath();
    if (accountId && !this.store.get(accountId)) throw new Error("Account not found");
    const raw = this.store.getSetting("workspaceBindings");
    const bindings = raw ? (JSON.parse(raw) as Record<string, string | null>) : {};
    if (accountId) bindings[workspacePath] = accountId;
    else delete bindings[workspacePath];
    this.store.setSetting("workspaceBindings", JSON.stringify(bindings));
    return this.getWorkspaceBinding();
  }

  getSwitchHistory(limit = 8): SwitchHistoryItem[] {
    return this.store.listSwitchEvents(limit);
  }

  getLimitHistory(accountId: string): LimitHistoryPoint[] {
    if (!this.store.get(accountId)) throw new Error("Account not found");
    return this.store.listRateLimitHistory(accountId);
  }

  getProfileIntegrity(): ProfileIntegrityReport {
    const items = this.store.listForExport().map((account) => {
      const profileExists = fs.existsSync(account.profileDir);
      const authPath = getAuthFilePath(account.profileDir);
      const authExists = fs.existsSync(authPath);
      let cacheOk = true;
      try {
        this.vault.decryptUtf8(account.encryptedAuthJson);
      } catch {
        cacheOk = false;
      }

      if (profileExists && authExists && cacheOk) {
        return {
          accountId: account.id,
          label: account.label,
          email: account.email,
          status: "ok" as const,
          message: "Профиль, auth.json и шифрованный кэш доступны."
        };
      }

      if (profileExists && cacheOk) {
        return {
          accountId: account.id,
          label: account.label,
          email: account.email,
          status: "warning" as const,
          message: "Шифрованный кэш доступен, но локальный auth.json профиля отсутствует."
        };
      }

      return {
        accountId: account.id,
        label: account.label,
        email: account.email,
        status: "error" as const,
        message: !profileExists ? "Папка профиля отсутствует." : "Шифрованный кэш недоступен."
      };
    });

    return {
      generatedAt: Math.floor(Date.now() / 1000),
      total: items.length,
      ok: items.filter((item) => item.status === "ok").length,
      warnings: items.filter((item) => item.status === "warning").length,
      errors: items.filter((item) => item.status === "error").length,
      items
    };
  }

  rollbackSwitch(eventId: string): SwitchHistoryItem[] {
    const event = this.store.getSwitchEvent(eventId);
    if (!event) throw new Error("Switch event not found");
    if (!event.backupPath) throw new Error("Switch event does not have a backup file");
    if (!fs.existsSync(event.backupPath)) throw new Error("Switch backup file is missing");

    const authPath = getAuthJsonPath(getDefaultCodexHome());
    fs.mkdirSync(path.dirname(authPath), { recursive: true });
    const currentAuthJson = fs.existsSync(authPath) ? fs.readFileSync(authPath, "utf8") : null;
    backupFile(authPath);
    fs.copyFileSync(event.backupPath, authPath);
    const restoredAuthJson = fs.readFileSync(authPath, "utf8");
    const syncedFiles = syncCodexGlobalState(getDefaultCodexHome(), restoredAuthJson, currentAuthJson);
    this.emit("log", `Rolled back Codex auth from ${event.backupPath}. Synced ${syncedFiles} global state file(s).`);
    return this.getSwitchHistory();
  }

  getSchemaVersion(): number {
    return this.store.getSchemaVersion();
  }

  async updateAccount(input: {
    id: string;
    label?: string;
    notes?: string | null;
    subscriptionEndsAt?: number | null;
    tags?: string[];
    favorite?: boolean;
    archived?: boolean;
  }): Promise<ManagedAccount> {
    return this.store.updateMeta(input.id, input);
  }

  async deleteAccount(accountId: string): Promise<void> {
    const account = this.store.get(accountId);
    if (account?.profileDir && account.profileDir.startsWith(this.appDataDir) && fs.existsSync(account.profileDir)) {
      fs.rmSync(account.profileDir, { recursive: true, force: true });
    }
    this.store.delete(accountId);
  }

  async exportAccounts(filePath: string, passphrase: string): Promise<{ exportedCount: number; filePath: string }> {
    const records = this.store.listForExport();
    if (records.length === 0) throw new Error("There are no accounts to export");
    const payload: PortablePayload = {
      format: portableExportFormat,
      version: portableExportVersion,
      exportedAt: Math.floor(Date.now() / 1000),
      accounts: records.map((account) => ({
        id: account.id,
        label: account.label,
        email: account.email,
        planType: account.planType,
        authJson: this.readAccountAuthJson(account),
        exportedWasActive: account.isActive,
        createdAt: account.createdAt,
        updatedAt: account.updatedAt,
        lastUsedAt: account.lastUsedAt,
        lastRefreshAt: account.lastRefreshAt,
        subscriptionEndsAt: account.subscriptionEndsAt,
        status: account.status,
        statusReason: account.statusReason,
        rateLimitJson: account.rateLimitJson,
        notes: account.notes
      }))
    };
    const envelope = encryptPortablePayload(payload, passphrase);
    atomicWrite(filePath, `${JSON.stringify(envelope, null, 2)}\n`);
    return { exportedCount: records.length, filePath };
  }

  async importAccounts(filePath: string, passphrase: string): Promise<AccountImportResult> {
    const payload = decryptPortablePayload(fs.readFileSync(filePath, "utf8"), passphrase);
    const imported: ManagedAccount[] = [];
    for (const account of payload.accounts) {
      if (!account.id || !account.email || !account.authJson) {
        throw new Error("Account export contains an invalid account entry");
      }
      JSON.parse(account.authJson);
      const profileDir = getProfileDir(this.appDataDir, account.id);
      const authPath = getAuthFilePath(profileDir);
      atomicWrite(authPath, account.authJson);
      imported.push(
        this.store.importPortable({
          id: account.id,
          label: account.label || getDisplayLabel(account.email),
          email: account.email,
          planType: account.planType ?? "unknown",
          encryptedAuthJson: this.vault.encryptUtf8(account.authJson),
          isActive: false,
          createdAt: account.createdAt,
          updatedAt: account.updatedAt,
          lastUsedAt: account.lastUsedAt,
          lastRefreshAt: account.lastRefreshAt,
          subscriptionEndsAt: account.subscriptionEndsAt,
          status: account.status ?? "unknown",
          statusReason: account.statusReason,
          rateLimitJson: account.rateLimitJson,
          notes: account.notes,
          profileDir
        })
      );
    }
    return { importedCount: imported.length, accounts: this.list() };
  }

  async importAuthJson(filePath: string): Promise<AccountImportResult> {
    const authJson = fs.readFileSync(filePath, "utf8");
    try {
      JSON.parse(authJson);
    } catch {
      throw new Error("Selected auth.json is not valid JSON");
    }

    const profileId = crypto.randomUUID();
    const profileDir = getProfileDir(this.appDataDir, profileId);
    const authPath = getAuthFilePath(profileDir);
    atomicWrite(authPath, authJson);

    const client = new CodexRpcClient(profileDir, this.requireCodexPath());
    try {
      const accountResponse = await client.readAccount(true);
      const identity = getAccountIdentity(accountResponse.account);
      let rateLimits = null;
      try {
        rateLimits = selectBestRateLimit(await client.readRateLimits());
      } catch {
        rateLimits = null;
      }

      const existing = this.store.getByEmail(identity.email);
      const saved = this.store.upsert({
        id: existing?.id ?? profileId,
        label: existing?.label ?? getDisplayLabel(identity.email),
        email: identity.email,
        planType: identity.planType,
        profileDir,
        encryptedAuthJson: this.vault.encryptUtf8(authJson),
        rateLimits
      });

      if (existing?.profileDir && existing.profileDir !== profileDir && existing.profileDir.startsWith(this.appDataDir)) {
        fs.rmSync(existing.profileDir, { recursive: true, force: true });
      }

      return { importedCount: 1, accounts: this.list().map((account) => (account.id === saved.id ? saved : account)) };
    } catch (error) {
      fs.rmSync(profileDir, { recursive: true, force: true });
      throw error;
    } finally {
      await client.stop();
    }
  }

  getProfileFolder(accountId: string): string {
    const account = this.store.get(accountId);
    if (!account) throw new Error("Account not found");
    return account.profileDir;
  }

  private async finalizeLogin(profileId: string, params: { loginId: string | null; success: boolean; error: string | null }): Promise<void> {
    if (!params.loginId) return;
    if (!params.success) {
      await this.failPendingLogin(params.loginId, profileId, params.error ?? "Codex login failed");
      return;
    }
    await this.completePendingLogin(params.loginId, profileId);
  }

  private async completePendingLogin(loginId: string, profileId: string): Promise<void> {
    const pending = this.pendingLogins.get(loginId);
    if (!pending || pending.profileId !== profileId) return;
    this.pendingLogins.delete(loginId);
    if (pending.pollTimer) clearTimeout(pending.pollTimer);

    try {
      const accountResponse = await pending.client.readAccount(true);
      const identity = getAccountIdentity(accountResponse.account);
      let rateLimits = null;
      try {
        rateLimits = selectBestRateLimit(await pending.client.readRateLimits());
      } catch {
        rateLimits = null;
      }

      const authPath = getAuthFilePath(pending.profileDir);
      if (!fs.existsSync(authPath)) throw new Error("Codex did not create auth.json for this profile");
      const authJson = fs.readFileSync(authPath, "utf8");
      const encryptedAuthJson = this.vault.encryptUtf8(authJson);
      const replaceAccount = pending.replaceAccountId ? this.store.get(pending.replaceAccountId) : null;
      const saveId = pending.replaceAccountId ?? profileId;

      const account = this.store.upsert({
        id: saveId,
        label: replaceAccount?.label ?? getDisplayLabel(identity.email),
        email: identity.email,
        planType: identity.planType,
        profileDir: pending.profileDir,
        encryptedAuthJson,
        rateLimits
      });

      if (replaceAccount?.isActive) {
        const activeAuthPath = getAuthJsonPath(getDefaultCodexHome());
        const previousAuthJson = fs.existsSync(activeAuthPath) ? fs.readFileSync(activeAuthPath, "utf8") : null;
        backupFile(activeAuthPath);
        atomicWrite(activeAuthPath, authJson);
        const syncedFiles = syncCodexGlobalState(getDefaultCodexHome(), authJson, previousAuthJson);
        this.emit("log", `Reauthenticated active Codex account and synced ${syncedFiles} global state file(s)`);
      }

      if (
        pending.replaceAccountId &&
        pending.previousProfileDir &&
        pending.previousProfileDir !== pending.profileDir &&
        pending.previousProfileDir.startsWith(this.appDataDir)
      ) {
        fs.rmSync(pending.previousProfileDir, { recursive: true, force: true });
      }

      const event: AuthEvent = { loginId, profileId: saveId, success: true, error: null, account };
      this.emit("auth-event", event);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const event: AuthEvent = { loginId, profileId, success: false, error: message };
      this.emit("auth-event", event);
    } finally {
      await pending.client.stop();
    }
  }

  private async failPendingLogin(loginId: string, profileId: string, message: string): Promise<void> {
    const pending = this.pendingLogins.get(loginId);
    if (!pending || pending.profileId !== profileId) return;
    this.pendingLogins.delete(loginId);
    if (pending.pollTimer) clearTimeout(pending.pollTimer);
    const event: AuthEvent = { loginId, profileId, success: false, error: message };
    this.emit("auth-event", event);
    await pending.client.stop();
  }

  private scheduleLoginPoll(loginId: string, profileId: string): void {
    const pending = this.pendingLogins.get(loginId);
    if (!pending || pending.profileId !== profileId) return;
    pending.pollTimer = setTimeout(() => {
      void this.pollLoginCompletion(loginId, profileId);
    }, 2500);
  }

  private async pollLoginCompletion(loginId: string, profileId: string): Promise<void> {
    const pending = this.pendingLogins.get(loginId);
    if (!pending || pending.profileId !== profileId) return;

    if (Date.now() - pending.startedAt > 15 * 60 * 1000) {
      await this.failPendingLogin(loginId, profileId, "Login timed out. Try adding this account again.");
      return;
    }

    try {
      const authPath = getAuthFilePath(pending.profileDir);
      const accountResponse = await pending.client.readAccount(true);
      const account = accountResponse.account as { type?: string; email?: string } | null;
      if (fs.existsSync(authPath) && account?.type === "chatgpt" && account.email) {
        await this.completePendingLogin(loginId, profileId);
        return;
      }
    } catch (error) {
      this.emit("log", `Login polling is still waiting: ${error instanceof Error ? error.message : String(error)}`);
    }

    this.scheduleLoginPoll(loginId, profileId);
  }

  private ensureProfileAuth(profileDir: string, encryptedAuthJson: string): void {
    const authPath = getAuthFilePath(profileDir);
    if (fs.existsSync(authPath)) return;
    atomicWrite(authPath, this.vault.decryptUtf8(encryptedAuthJson));
  }

  private readAccountAuthJson(account: AccountExportRecord | (ManagedAccount & { encryptedAuthJson: string })): string {
    return this.readAccountAuthJsonWithRecovery(account).authJson;
  }

  private readAccountAuthJsonWithRecovery(account: AccountExportRecord | (ManagedAccount & { encryptedAuthJson: string })): {
    authJson: string;
    recovered: boolean;
  } {
    try {
      return { authJson: this.vault.decryptUtf8(account.encryptedAuthJson), recovered: false };
    } catch (error) {
      const authPath = getAuthFilePath(account.profileDir);
      if (!fs.existsSync(authPath)) {
        throw new Error(
          `Saved auth encryption is unavailable and profile auth.json is missing for ${account.email}. Re-add or import this account.`
        );
      }

      const authJson = fs.readFileSync(authPath, "utf8");
      try {
        JSON.parse(authJson);
      } catch {
        throw new Error(`Profile auth.json is not valid JSON for ${account.email}`);
      }

      this.store.updateEncryptedAuthJson(account.id, this.vault.encryptUtf8(authJson));
      this.emit(
        "log",
        `Recovered encrypted auth cache for ${account.email} from profile auth.json after decrypt failure: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
      return { authJson, recovered: true };
    }
  }

  private requireCodexPath(): string {
    if (!this.codexPath) {
      throw new Error("Codex CLI was not found. Install or launch Codex Desktop, then try again.");
    }
    return this.codexPath;
  }
}

export function getDiagnostics(appDataDir: string): {
  codexPath: string | null;
  codexDesktopPath: string | null;
  codexAppUserModelId: string | null;
  activeCodexHome: string;
  appDataDir: string;
  workspacePath: string;
} {
  return {
    codexPath: resolveCodexPath(),
    codexDesktopPath: resolveCodexDesktopPath(),
    codexAppUserModelId: getCodexAppUserModelId(),
    activeCodexHome: getDefaultCodexHome(),
    appDataDir,
    workspacePath: getDefaultWorkspacePath()
  };
}
