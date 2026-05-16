export type PlanType =
  | "free"
  | "go"
  | "plus"
  | "pro"
  | "prolite"
  | "team"
  | "business"
  | "enterprise"
  | "edu"
  | "unknown"
  | string;

export interface RateLimitWindow {
  usedPercent: number;
  windowDurationMins: number | null;
  resetsAt: number | null;
}

export interface RateLimitSnapshot {
  limitId: string | null;
  limitName: string | null;
  primary: RateLimitWindow | null;
  secondary: RateLimitWindow | null;
  credits: { hasCredits: boolean; unlimited: boolean; balance: string | null } | null;
  planType: PlanType | null;
  rateLimitReachedType: string | null;
}

export interface ManagedAccount {
  id: string;
  label: string;
  email: string;
  planType: PlanType;
  profileDir: string;
  isActive: boolean;
  createdAt: number;
  updatedAt: number;
  lastUsedAt: number | null;
  lastRefreshAt: number | null;
  subscriptionEndsAt: number | null;
  status: "unknown" | "active" | "near_limit" | "limited" | "error";
  statusReason: string | null;
  primaryUsedPercent: number | null;
  primaryResetsAt: number | null;
  primaryWindowDurationMins: number | null;
  secondaryUsedPercent: number | null;
  secondaryResetsAt: number | null;
  secondaryWindowDurationMins: number | null;
  fiveHourUsedPercent: number | null;
  fiveHourResetsAt: number | null;
  weeklyUsedPercent: number | null;
  weeklyResetsAt: number | null;
  notes: string | null;
  tags?: string[];
  favorite?: boolean;
  archived?: boolean;
}

export interface LoginStartResult {
  loginId: string;
  profileId: string;
  type: "chatgpt" | "chatgptDeviceCode";
  authUrl?: string;
  verificationUrl?: string;
  userCode?: string;
}

export interface AuthEvent {
  loginId: string;
  profileId: string;
  success: boolean;
  error: string | null;
  account?: ManagedAccount;
}

export interface AppDiagnostics {
  codexPath: string | null;
  codexDesktopPath?: string | null;
  codexAppUserModelId?: string | null;
  activeCodexHome: string;
  appDataDir: string;
  workspacePath?: string;
  rateLimitRefreshIntervalMs?: number;
  startupError?: string | null;
  logPath?: string | null;
}

export type HealthStatus = "ok" | "warning" | "error";

export interface HealthItem {
  id: "codexCli" | "codexDesktop" | "database" | "vault" | "schema" | "logs";
  label: string;
  status: HealthStatus;
  message: string;
  action?: "choosePath" | "openLogs" | "repair" | "retry";
}

export interface HealthReport {
  generatedAt: number;
  schemaVersion: number;
  appDataDir: string;
  codexHome: string;
  logPath: string | null;
  items: HealthItem[];
}

export interface ProfileIntegrityItem {
  accountId: string;
  label: string;
  email: string;
  status: HealthStatus;
  message: string;
}

export interface ProfileIntegrityReport {
  generatedAt: number;
  total: number;
  ok: number;
  warnings: number;
  errors: number;
  items: ProfileIntegrityItem[];
}

export interface DiagnosticReportExportResult {
  filePath: string;
}

export type ReleaseArtifactKind = "installer" | "portable" | "latestYml" | "blockmap" | "checksums";

export interface ReleaseArtifactStatus {
  kind: ReleaseArtifactKind;
  label: string;
  fileName: string;
  path: string;
  exists: boolean;
  sizeBytes: number | null;
  sha256: string | null;
  checksumListed: boolean;
}

export interface ReleaseReadinessReport {
  version: string;
  generatedAt: number;
  releaseDir: string;
  updateFeedConfigured: boolean;
  signingEnabled: boolean;
  codeSignatureVerification: boolean;
  ready: boolean;
  summary: string;
  artifacts: ReleaseArtifactStatus[];
}

export interface UpdateCheckResult {
  status: "available" | "not_available" | "downloaded" | "checking" | "not_configured" | "error";
  message: string;
  feedUrl: string | null;
  checkedAt: number;
  version: string | null;
}

export interface AccountExportResult {
  exportedCount: number;
  filePath: string;
}

export interface AccountImportResult {
  importedCount: number;
  accounts: ManagedAccount[];
}

export interface WorkspaceBinding {
  workspacePath: string;
  accountId: string | null;
  accountLabel: string | null;
  accountEmail: string | null;
}

export type SmartSwitchMode = "off" | "suggest" | "auto";

export interface SmartRecommendation {
  accountId: string;
  accountLabel: string;
  accountEmail: string;
  score: number;
  reason: string;
  workspaceMatched: boolean;
}

export interface SwitchHistoryItem {
  id: string;
  accountId: string;
  accountLabel: string | null;
  accountEmail: string | null;
  previousAccountId: string | null;
  startedAt: number;
  completedAt: number | null;
  status: string;
  error: string | null;
  backupPath: string | null;
}

export interface LimitHistoryPoint {
  accountId: string;
  capturedAt: number;
  status: ManagedAccount["status"];
  statusReason: string | null;
  fiveHourUsedPercent: number | null;
  weeklyUsedPercent: number | null;
  primaryUsedPercent: number | null;
  secondaryUsedPercent: number | null;
}

export type ImportConflictMode = "skip" | "replace" | "copy";

export interface ImportConflict {
  incomingId: string;
  existingId: string;
  email: string;
  reason: "email" | "account_id";
}

export interface ImportPreview {
  total: number;
  conflicts: ImportConflict[];
  safeToImport: Array<{ id: string; email: string; label: string }>;
}

export interface AppSettings {
  language: "ru";
  autoRefreshIntervalMs: 60_000 | 180_000 | 300_000 | 600_000 | 900_000;
  privacyMode: boolean;
  confirmSwitch: boolean;
  smartSwitchMode: SmartSwitchMode;
  desktopNotifications: boolean;
  trayEnabled: boolean;
  autostartEnabled: boolean;
}

export interface IpcResult<T> {
  ok: true;
  data: T;
}

export interface IpcFailure {
  ok: false;
  error: import("./errors.js").SafeAppError;
}

export type IpcResponse<T> = IpcResult<T> | IpcFailure;

export interface AppApi {
  listAccounts(): Promise<ManagedAccount[]>;
  startLogin(type: "chatgpt" | "chatgptDeviceCode"): Promise<LoginStartResult>;
  reauthenticateAccount(accountId: string, type: "chatgpt" | "chatgptDeviceCode"): Promise<LoginStartResult>;
  openExternal(url: string): Promise<void>;
  minimizeWindow(): Promise<void>;
  toggleMaximizeWindow(): Promise<void>;
  closeWindow(): Promise<void>;
  selectWorkspace(): Promise<AppDiagnostics>;
  refreshAccount(accountId: string): Promise<ManagedAccount>;
  refreshAllAccounts(): Promise<ManagedAccount[]>;
  exportAccounts(passphrase: string): Promise<AccountExportResult>;
  importAccounts(passphrase: string): Promise<AccountImportResult>;
  importAuthJson(): Promise<AccountImportResult>;
  openProfileFolder(accountId: string): Promise<void>;
  switchAccount(accountId: string): Promise<ManagedAccount>;
  deleteAccount(accountId: string): Promise<void>;
  bindWorkspaceAccount(accountId: string | null): Promise<WorkspaceBinding>;
  getWorkspaceBinding(): Promise<WorkspaceBinding>;
  getSwitchHistory(): Promise<SwitchHistoryItem[]>;
  rollbackSwitch(eventId: string): Promise<SwitchHistoryItem[]>;
  readLogTail(): Promise<string[]>;
  openLogsFolder(): Promise<void>;
  updateAccount(input: {
    id: string;
    label?: string;
    notes?: string | null;
    subscriptionEndsAt?: number | null;
    tags?: string[];
    favorite?: boolean;
    archived?: boolean;
  }): Promise<ManagedAccount>;
  getLimitHistory(accountId: string): Promise<LimitHistoryPoint[]>;
  getDiagnostics(): Promise<AppDiagnostics>;
  getHealth(): Promise<HealthReport>;
  getProfileIntegrity(): Promise<ProfileIntegrityReport>;
  exportDiagnosticReport(): Promise<DiagnosticReportExportResult>;
  getReleaseReadiness(): Promise<ReleaseReadinessReport>;
  checkForUpdates(): Promise<UpdateCheckResult>;
  openReleaseFolder(): Promise<void>;
  openCrashReportsFolder(): Promise<void>;
  getSettings(): Promise<AppSettings>;
  updateSettings(input: Partial<Omit<AppSettings, "language">> & { language?: "ru" }): Promise<AppSettings>;
  onAuthEvent(callback: (event: AuthEvent) => void): () => void;
  onAccountsUpdated(callback: () => void): () => void;
}
