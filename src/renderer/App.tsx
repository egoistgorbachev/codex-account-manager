import React, { useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  Activity,
  AlertTriangle,
  Archive,
  ArrowUpRight,
  Bot,
  CheckCircle2,
  Cpu,
  Database,
  ExternalLink,
  FileText,
  FileDown,
  FileUp,
  FolderOpen,
  Gauge,
  KeyRound,
  Layers3,
  Loader2,
  LogIn,
  Maximize2,
  Minus,
  Search,
  SlidersHorizontal,
  RefreshCcw,
  Sparkles,
  Star,
  Tag,
  TerminalSquare,
  Trash2,
  X,
  Zap
} from "lucide-react";
import type {
  AppDiagnostics,
  AppSettings,
  AuthEvent,
  HealthReport,
  LimitHistoryPoint,
  LoginStartResult,
  ManagedAccount,
  ProfileIntegrityReport,
  ReleaseReadinessReport,
  SwitchHistoryItem,
  UpdateCheckResult,
  WorkspaceBinding
} from "../shared/types";
import { selectSmartAccount } from "../shared/smartSelection";
import { appVersion, releaseNotes } from "../shared/releaseNotes";
import logoUrl from "./assets/logo.png";
import { DashboardPage } from "./pages/DashboardPage";
import { HealthPage } from "./pages/HealthPage";
import { SettingsPage } from "./pages/SettingsPage";
import "./styles.css";

const nowSeconds = () => Math.floor(Date.now() / 1000);

const demoSettings: AppSettings = {
  language: "ru",
  autoRefreshIntervalMs: 180_000,
  privacyMode: false,
  confirmSwitch: true,
  smartSwitchMode: "suggest",
  desktopNotifications: true,
  trayEnabled: false,
  autostartEnabled: false
};

const demoHealth: HealthReport = {
  generatedAt: nowSeconds(),
  schemaVersion: 3,
  appDataDir: "browser-preview",
  codexHome: "browser-preview",
  logPath: null,
  items: [
    {
      id: "codexCli",
      label: "Codex CLI",
      status: "ok",
      message: "Демонстрационный режим готов."
    },
    {
      id: "database",
      label: "База данных",
      status: "ok",
      message: "Схема доступна."
    }
  ]
};

const demoAccounts: ManagedAccount[] = [
  {
    id: "demo-pro",
    label: "основной",
    email: "primary@example.com",
    planType: "pro",
    profileDir: "demo",
    isActive: true,
    createdAt: 0,
    updatedAt: 0,
    lastUsedAt: nowSeconds(),
    lastRefreshAt: nowSeconds(),
    subscriptionEndsAt: null,
    status: "active",
    statusReason: null,
    primaryUsedPercent: 34,
    primaryResetsAt: nowSeconds() + 3600,
    primaryWindowDurationMins: 300,
    secondaryUsedPercent: 12,
    secondaryResetsAt: nowSeconds() + 6 * 86400,
    secondaryWindowDurationMins: 10080,
    fiveHourUsedPercent: 34,
    fiveHourResetsAt: nowSeconds() + 3600,
    weeklyUsedPercent: 12,
    weeklyResetsAt: nowSeconds() + 6 * 86400,
    notes: null
  },
  {
    id: "demo-plus",
    label: "резерв",
    email: "backup@example.com",
    planType: "plus",
    profileDir: "demo",
    isActive: false,
    createdAt: 0,
    updatedAt: 0,
    lastUsedAt: null,
    lastRefreshAt: nowSeconds() - 2400,
    subscriptionEndsAt: null,
    status: "near_limit",
    statusReason: "Использование выше 90%",
    primaryUsedPercent: 91,
    primaryResetsAt: nowSeconds() + 900,
    primaryWindowDurationMins: 300,
    secondaryUsedPercent: 40,
    secondaryResetsAt: nowSeconds() + 5 * 86400,
    secondaryWindowDurationMins: 10080,
    fiveHourUsedPercent: 91,
    fiveHourResetsAt: nowSeconds() + 900,
    weeklyUsedPercent: 40,
    weeklyResetsAt: nowSeconds() + 5 * 86400,
    notes: null
  }
];

const cam = window.cam ?? {
  listAccounts: async () => demoAccounts,
  startLogin: async (type: "chatgpt" | "chatgptDeviceCode") => ({
    loginId: "demo-login",
    profileId: "demo-profile",
    type,
    authUrl: "https://chatgpt.com",
    verificationUrl: "https://auth.openai.com/codex/device",
    userCode: "DEMO-1234"
  }),
  reauthenticateAccount: async (accountId: string, type: "chatgpt" | "chatgptDeviceCode") => ({
    loginId: "demo-reauth",
    profileId: accountId,
    type,
    authUrl: "https://chatgpt.com",
    verificationUrl: "https://auth.openai.com/codex/device",
    userCode: "DEMO-5678"
  }),
  openExternal: async () => undefined,
  minimizeWindow: async () => undefined,
  toggleMaximizeWindow: async () => undefined,
  closeWindow: async () => undefined,
  selectWorkspace: async () => ({
    codexPath: "browser-preview",
    activeCodexHome: "browser-preview",
    appDataDir: "browser-preview",
    workspacePath: "browser-preview",
    rateLimitRefreshIntervalMs: 3 * 60 * 1000,
    startupError: null,
    logPath: null
  }),
  refreshAccount: async (accountId: string) => demoAccounts.find((account) => account.id === accountId) ?? demoAccounts[0],
  refreshAllAccounts: async () => demoAccounts,
  exportAccounts: async () => ({ exportedCount: demoAccounts.length, filePath: "browser-preview.cam-export" }),
  importAccounts: async () => ({ importedCount: demoAccounts.length, accounts: demoAccounts }),
  importAuthJson: async () => ({ importedCount: 1, accounts: demoAccounts }),
  openProfileFolder: async () => undefined,
  switchAccount: async (accountId: string) => demoAccounts.find((account) => account.id === accountId) ?? demoAccounts[0],
  deleteAccount: async () => undefined,
  updateAccount: async () => demoAccounts[0],
  bindWorkspaceAccount: async (accountId: string | null) => {
    const account = demoAccounts.find((item) => item.id === accountId) ?? null;
    return { workspacePath: "browser-preview", accountId: account?.id ?? null, accountLabel: account?.label ?? null, accountEmail: account?.email ?? null };
  },
  getWorkspaceBinding: async () => ({ workspacePath: "browser-preview", accountId: null, accountLabel: null, accountEmail: null }),
  getSwitchHistory: async () => [],
  getLimitHistory: async (accountId: string) => [
    { accountId, capturedAt: nowSeconds() - 1200, status: "active", statusReason: null, fiveHourUsedPercent: 62, weeklyUsedPercent: 18, primaryUsedPercent: 62, secondaryUsedPercent: 18 },
    { accountId, capturedAt: nowSeconds() - 600, status: "active", statusReason: null, fiveHourUsedPercent: 54, weeklyUsedPercent: 21, primaryUsedPercent: 54, secondaryUsedPercent: 21 },
    { accountId, capturedAt: nowSeconds(), status: "active", statusReason: null, fiveHourUsedPercent: 38, weeklyUsedPercent: 22, primaryUsedPercent: 38, secondaryUsedPercent: 22 }
  ],
  rollbackSwitch: async () => [],
  readLogTail: async () => ["Журнал доступен в собранном приложении."],
  openLogsFolder: async () => undefined,
  getDiagnostics: async () => ({
    codexPath: "browser-preview",
    activeCodexHome: "browser-preview",
    appDataDir: "browser-preview",
    workspacePath: "browser-preview",
    rateLimitRefreshIntervalMs: 3 * 60 * 1000,
    startupError: null,
    logPath: null
  }),
  getHealth: async () => demoHealth,
  getProfileIntegrity: async () => ({ generatedAt: nowSeconds(), total: demoAccounts.length, ok: demoAccounts.length, warnings: 0, errors: 0, items: [] }),
  exportDiagnosticReport: async () => ({ filePath: "browser-preview-diagnostics.json" }),
  getReleaseReadiness: async () => ({
    version: appVersion,
    generatedAt: nowSeconds(),
    releaseDir: "browser-preview/release",
    updateFeedConfigured: false,
    signingEnabled: false,
    codeSignatureVerification: false,
    ready: false,
    summary: "Релиз собран локально, но публичный канал обновлений не настроен.",
    artifacts: []
  }),
  checkForUpdates: async () => ({
    status: "not_configured",
    message: "Канал обновлений пока не настроен.",
    feedUrl: null,
    checkedAt: nowSeconds(),
    version: null
  }),
  openReleaseFolder: async () => undefined,
  openCrashReportsFolder: async () => undefined,
  getSettings: async () => demoSettings,
  updateSettings: async (input: Partial<Omit<AppSettings, "language">> & { language?: "ru" }) => ({ ...demoSettings, ...input, language: "ru" as const }),
  onAuthEvent: () => () => undefined,
  onAccountsUpdated: () => () => undefined
};

function formatTime(value: number | null): string {
  if (!value) return "нет данных";
  return new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value * 1000));
}

function statusLabel(account: ManagedAccount): string {
  if (account.status === "limited") return "лимит";
  if (account.status === "near_limit") return "почти лимит";
  if (account.status === "active") return "активен";
  if (account.status === "error") return "ошибка";
  return "не проверен";
}

function statusClass(account: ManagedAccount): string {
  if (account.status === "limited") return "limited";
  if (account.status === "near_limit") return "risk";
  if (account.status === "active") return "active";
  return "";
}

function used(account: ManagedAccount): number {
  return Math.max(account.fiveHourUsedPercent ?? 0, account.weeklyUsedPercent ?? 0);
}

function soonestReset(account: ManagedAccount): number | null {
  const resets = [account.fiveHourResetsAt, account.weeklyResetsAt].filter(Boolean) as number[];
  return resets.length ? Math.min(...resets) : null;
}

function accountScore(account: ManagedAccount): number {
  if (account.status === "error") return 5000;
  if (account.status === "limited") return 4000 + (soonestReset(account) ?? 0) / 100000;
  if (account.status === "near_limit") return 2000 + used(account);
  return used(account);
}

function isUsable(account: ManagedAccount): boolean {
  return account.status !== "limited" && account.status !== "error";
}

function uiErrorMessage(action: string): string {
  return `${action}. Подробности доступны в журнале диагностики.`;
}

function autoRefreshLabel(ms?: number): string {
  if (!ms) return "авто";
  const minutes = Math.max(1, Math.round(ms / 60000));
  return `${minutes} мин`;
}

function relativeRefresh(account: ManagedAccount): string {
  if (!account.lastRefreshAt) return "нет снимка";
  const minutes = Math.max(0, Math.floor((nowSeconds() - account.lastRefreshAt) / 60));
  if (minutes < 1) return "только что";
  if (minutes < 60) return `${minutes} мин назад`;
  return `${Math.floor(minutes / 60)} ч назад`;
}

function meterTone(usedPercent: number | null): string {
  const usedValue = usedPercent ?? 0;
  if (usedValue >= 90) return "danger";
  if (usedValue >= 72) return "warn";
  return "good";
}

function LimitMeter({ label, usedPercent, resetsAt }: { label: string; usedPercent: number | null; resetsAt: number | null }) {
  const pct = Math.max(0, Math.min(100, usedPercent ?? 0));
  return (
    <div className={`limit-meter ${meterTone(usedPercent)}`}>
      <div className="limit-line">
        <span>{label}</span>
        <strong>{usedPercent == null ? "нет данных" : `${usedPercent.toFixed(0)}%`}</strong>
      </div>
      <div className="bar">
        <span style={{ width: `${pct}%` }} />
      </div>
      <small>сброс {formatTime(resetsAt)}</small>
    </div>
  );
}

function LimitHistoryChart({ history }: { history: LimitHistoryPoint[] }) {
  const points = history.slice(-12);
  return (
    <div className="limit-history">
      <div className="limit-history-head">
        <span>История лимитов</span>
        <strong>{points.length ? `${points.length} снимков` : "нет данных"}</strong>
      </div>
      <div className="history-bars" aria-label="История нагрузки">
        {points.length ? points.map((point) => {
          const value = Math.max(point.fiveHourUsedPercent ?? point.primaryUsedPercent ?? 0, point.weeklyUsedPercent ?? point.secondaryUsedPercent ?? 0);
          return <span key={`${point.accountId}-${point.capturedAt}`} title={`${formatTime(point.capturedAt)} · ${value.toFixed(0)}%`} style={{ height: `${Math.max(8, value)}%` }} />;
        }) : Array.from({ length: 8 }, (_, index) => <i key={index} />)}
      </div>
    </div>
  );
}

function SignalOrbit({ account }: { account: ManagedAccount | null }) {
  const load = account ? used(account) : 0;
  const tone = account ? meterTone(load) : "idle";
  return (
    <div className={`signal-orbit ${tone}`} aria-hidden="true">
      <div className="orbit-core">
        <Bot />
        <strong>{account ? `${Math.round(load)}%` : "--"}</strong>
      </div>
      <span className="orbit-node node-a" />
      <span className="orbit-node node-b" />
      <span className="orbit-node node-c" />
      <i className="orbit-ring ring-a" />
      <i className="orbit-ring ring-b" />
    </div>
  );
}

function AccountRow({
  account,
  selected,
  busy,
  onRefresh,
  onSwitch,
  onReauth,
  onOpenFolder,
  onSelect,
  onDelete
}: {
  account: ManagedAccount;
  selected: boolean;
  busy: string | null;
  onRefresh: (id: string) => void;
  onSwitch: (id: string) => void;
  onReauth: (id: string) => void;
  onOpenFolder: (id: string) => void;
  onSelect: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  return (
    <tr className={`${account.isActive ? "account-row is-active" : "account-row"} ${selected ? "is-selected" : ""}`}>
      <td onClick={() => onSelect(account.id)}>
        <div className="account-cell">
          <div className="avatar">{account.label.slice(0, 2).toUpperCase()}</div>
          <div className="account-copy">
            <div className="name">
              {account.label}
              {account.favorite ? <Star className="inline-mark" /> : null}
              {account.archived ? <span className="badge compact">архив</span> : null}
              {account.isActive ? <span className="badge active compact">активен</span> : null}
            </div>
            <div className="email">{account.email}</div>
          </div>
        </div>
      </td>
      <td onClick={() => onSelect(account.id)}>
        <span className="plan">{account.planType}</span>
      </td>
      <td onClick={() => onSelect(account.id)}>
        <LimitMeter label="5 часов" usedPercent={account.fiveHourUsedPercent} resetsAt={account.fiveHourResetsAt} />
      </td>
      <td onClick={() => onSelect(account.id)}>
        <LimitMeter label="неделя" usedPercent={account.weeklyUsedPercent} resetsAt={account.weeklyResetsAt} />
      </td>
      <td onClick={() => onSelect(account.id)}>
        <span className={`badge ${statusClass(account)}`}>{statusLabel(account)}</span>
        <div className="reset">проверен {formatTime(account.lastRefreshAt)}</div>
      </td>
      <td>
        <div className="row-actions">
          <button className="icon-btn" disabled={busy !== null} onClick={() => onRefresh(account.id)} title="Обновить лимиты">
            {busy === `refresh:${account.id}` ? <Loader2 className="spin" /> : <RefreshCcw />}
          </button>
          <button className="icon-btn" disabled={busy !== null} onClick={() => onReauth(account.id)} title="Повторно авторизовать профиль">
            {busy === `reauth:${account.id}` ? <Loader2 className="spin" /> : <KeyRound />}
          </button>
          <button className="icon-btn" disabled={busy !== null} onClick={() => onOpenFolder(account.id)} title="Открыть папку профиля">
            <FolderOpen />
          </button>
          <button className="icon-btn primary" disabled={busy !== null || account.isActive} onClick={() => onSwitch(account.id)} title="Сделать активным и перезапустить Codex">
            {busy === `switch:${account.id}` ? <Loader2 className="spin" /> : <Zap />}
          </button>
          <button className="icon-btn" disabled={busy !== null} onClick={() => onDelete(account.id)} title="Удалить профиль">
            <Trash2 />
          </button>
        </div>
      </td>
    </tr>
  );
}

function AccountCard({
  account,
  selected,
  busy,
  onRefresh,
  onSwitch,
  onReauth,
  onOpenFolder,
  onSelect,
  onDelete
}: {
  account: ManagedAccount;
  selected: boolean;
  busy: string | null;
  onRefresh: (id: string) => void;
  onSwitch: (id: string) => void;
  onReauth: (id: string) => void;
  onOpenFolder: (id: string) => void;
  onSelect: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  return (
    <article className={`profile-card ${selected ? "is-selected" : ""} ${account.isActive ? "is-active" : ""}`} onClick={() => onSelect(account.id)}>
      <div className="profile-card-head">
        <div className="account-cell">
          <div className="avatar">{account.label.slice(0, 2).toUpperCase()}</div>
          <div className="account-copy">
            <div className="name">
              {account.label}
              {account.favorite ? <Star className="inline-mark" /> : null}
              {account.archived ? <span className="badge compact">архив</span> : null}
              {account.isActive ? <span className="badge active compact">активен</span> : null}
            </div>
            <div className="email">{account.email}</div>
          </div>
        </div>
        <span className={`badge ${statusClass(account)}`}>{statusLabel(account)}</span>
      </div>
      <div className="profile-card-body">
        <LimitMeter label="5 часов" usedPercent={account.fiveHourUsedPercent} resetsAt={account.fiveHourResetsAt} />
        <LimitMeter label="неделя" usedPercent={account.weeklyUsedPercent} resetsAt={account.weeklyResetsAt} />
      </div>
      <div className="profile-card-foot">
        <span>{account.planType}</span>
        <span>{relativeRefresh(account)}</span>
      </div>
      <div className="row-actions card-actions" onClick={(event) => event.stopPropagation()}>
        <button className="icon-btn" disabled={busy !== null} onClick={() => onRefresh(account.id)} title="Обновить лимиты">
          {busy === `refresh:${account.id}` ? <Loader2 className="spin" /> : <RefreshCcw />}
        </button>
        <button className="icon-btn" disabled={busy !== null} onClick={() => onReauth(account.id)} title="Повторно авторизовать профиль">
          {busy === `reauth:${account.id}` ? <Loader2 className="spin" /> : <KeyRound />}
        </button>
        <button className="icon-btn" disabled={busy !== null} onClick={() => onOpenFolder(account.id)} title="Открыть папку профиля">
          <FolderOpen />
        </button>
        <button className="icon-btn primary" disabled={busy !== null || account.isActive} onClick={() => onSwitch(account.id)} title="Сделать активным и перезапустить Codex">
          {busy === `switch:${account.id}` ? <Loader2 className="spin" /> : <Zap />}
        </button>
        <button className="icon-btn" disabled={busy !== null} onClick={() => onDelete(account.id)} title="Удалить профиль">
          <Trash2 />
        </button>
      </div>
    </article>
  );
}

function AccountInspector({
  account,
  busy,
  onRefresh,
  onSwitch,
  onReauth,
  onOpenFolder,
  onMetadata
}: {
  account: ManagedAccount | null;
  busy: string | null;
  onRefresh: (id: string) => void;
  onSwitch: (id: string) => void;
  onReauth: (id: string) => void;
  onOpenFolder: (id: string) => void;
  onMetadata: (id: string, input: { tags?: string[]; favorite?: boolean; archived?: boolean }) => void;
}) {
  if (!account) {
    return (
      <aside className="inspector empty-inspector">
        <TerminalSquare />
        <strong>Профиль не выбран</strong>
        <span>Выбери аккаунт в списке, чтобы увидеть живой снимок лимитов и быстрые команды.</span>
      </aside>
    );
  }

  return (
    <aside className={`inspector ${statusClass(account)}`}>
      <div className="inspector-top">
        <span className="caption">выбранный профиль</span>
        <span className={`badge ${statusClass(account)}`}>{statusLabel(account)}</span>
      </div>
      <div className="inspector-identity">
        <div className="avatar large">{account.label.slice(0, 2).toUpperCase()}</div>
        <div>
          <strong>{account.label}</strong>
          <span>{account.email}</span>
        </div>
      </div>
      <div className="inspector-grid">
        <div>
          <span>План</span>
          <strong>{account.planType}</strong>
        </div>
        <div>
          <span>Снимок</span>
          <strong>{relativeRefresh(account)}</strong>
        </div>
      </div>
      <div className="metadata-strip">
        <button className={`meta-toggle ${account.favorite ? "is-on" : ""}`} disabled={busy !== null} onClick={() => onMetadata(account.id, { favorite: !account.favorite })}>
          <Star />
          Избранное
        </button>
        <button className={`meta-toggle ${account.archived ? "is-on" : ""}`} disabled={busy !== null} onClick={() => onMetadata(account.id, { archived: !account.archived })}>
          <Archive />
          Архив
        </button>
      </div>
      <div className="tag-row">
        {(account.tags ?? []).slice(0, 5).map((tag) => <span key={tag}><Tag />{tag}</span>)}
        {(account.tags ?? []).length === 0 ? <span><Tag />без тегов</span> : null}
      </div>
      <div className="quick-tags">
        {["work", "personal", "client", "backup"].map((tag) => {
          const tags = account.tags ?? [];
          const active = tags.includes(tag);
          return (
            <button
              key={tag}
              className={active ? "is-selected" : ""}
              disabled={busy !== null}
              onClick={() => onMetadata(account.id, { tags: active ? tags.filter((item) => item !== tag) : [...tags, tag] })}
            >
              {tag}
            </button>
          );
        })}
      </div>
      <LimitMeter label="5 часов" usedPercent={account.fiveHourUsedPercent} resetsAt={account.fiveHourResetsAt} />
      <LimitMeter label="Неделя" usedPercent={account.weeklyUsedPercent} resetsAt={account.weeklyResetsAt} />
      <div className="inspector-path" title={account.profileDir}>
        <Database />
        <span>{account.profileDir}</span>
      </div>
      <div className="inspector-actions">
        <button className="button" disabled={busy !== null || account.isActive} onClick={() => onSwitch(account.id)}>
          <Zap />
          Активировать
        </button>
        <button className="button secondary" disabled={busy !== null} onClick={() => onRefresh(account.id)}>
          <RefreshCcw />
          Обновить
        </button>
        <button className="button secondary" disabled={busy !== null} onClick={() => onReauth(account.id)}>
          <KeyRound />
          Авторизация
        </button>
        <button className="button secondary" disabled={busy !== null} onClick={() => onOpenFolder(account.id)}>
          <FolderOpen />
          Папка
        </button>
      </div>
    </aside>
  );
}

function LoginPanel({ login, onOpen }: { login: LoginStartResult | null; onOpen: (url: string) => void }) {
  if (!login) return null;
  return (
    <section className="login-panel">
      <div>
        <div className="panel-title">Авторизация запущена</div>
        {login.type === "chatgpt" ? (
          <p className="muted">Открой браузер, войди в ChatGPT и вернись сюда после подтверждения.</p>
        ) : (
          <div className="device-code">
            <span>Код устройства</span>
            <strong>{login.userCode}</strong>
          </div>
        )}
      </div>
      <button className="button" onClick={() => onOpen(login.authUrl ?? login.verificationUrl ?? "")}>
        <ExternalLink />
        Открыть
      </button>
    </section>
  );
}

type TransferMode = "export" | "import";
type ViewKey = "dashboard" | "accounts" | "limits" | "vault" | "health" | "settings";
type LoginWizardState = {
  open: boolean;
  phase: "method" | "starting" | "waiting" | "done" | "error";
  type: "chatgpt" | "chatgptDeviceCode" | null;
  result: LoginStartResult | null;
  error: string | null;
};
type ConfirmState = {
  title: string;
  body: string;
  confirmLabel: string;
  tone?: "primary" | "danger";
  details?: string[];
};

function passwordStrength(value: string): { label: string; className: string } {
  const score = Number(value.length >= 8) + Number(value.length >= 14) + Number(/[A-ZА-Я]/.test(value)) + Number(/\d/.test(value)) + Number(/[^\dA-Za-zА-Яа-я]/.test(value));
  if (!value) return { label: "Введите пароль", className: "idle" };
  if (score <= 2) return { label: "Слабый пароль", className: "weak" };
  if (score <= 4) return { label: "Нормальный пароль", className: "medium" };
  return { label: "Сильный пароль", className: "strong" };
}

function AddAccountWizard({
  state,
  busy,
  onStart,
  onOpen,
  onClose
}: {
  state: LoginWizardState;
  busy: string | null;
  onStart: (type: "chatgpt" | "chatgptDeviceCode") => void;
  onOpen: (url: string) => void;
  onClose: () => void;
}) {
  if (!state.open) return null;
  const url = state.result?.authUrl ?? state.result?.verificationUrl ?? "";
  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label="Добавление аккаунта">
      <div className="workflow-modal">
        <div className="modal-head">
          <div>
            <div className="panel-title">Добавление аккаунта</div>
            <p className="muted">Авторизация проходит через локальный Codex app-server. Токены остаются на этом ПК.</p>
          </div>
          <button className="window-btn" onClick={onClose} title="Закрыть">
            <X />
          </button>
        </div>

        {state.phase === "method" ? (
          <div className="choice-grid">
            <button className="choice-card" disabled={busy !== null} onClick={() => onStart("chatgptDeviceCode")}>
              <KeyRound />
              <strong>Код устройства</strong>
              <span>Надёжный вариант, если браузерный callback недоступен.</span>
            </button>
            <button className="choice-card" disabled={busy !== null} onClick={() => onStart("chatgpt")}>
              <LogIn />
              <strong>Браузерный вход</strong>
              <span>Откроет ChatGPT и вернёт профиль после подтверждения.</span>
            </button>
          </div>
        ) : null}

        {state.phase === "starting" ? (
          <div className="workflow-state">
            <Loader2 className="spin" />
            <strong>Запускаю авторизацию</strong>
            <span>Поднимаю Codex RPC и готовлю отдельный локальный профиль.</span>
          </div>
        ) : null}

        {state.phase === "waiting" && state.result ? (
          <div className="workflow-state">
            <CheckCircle2 />
            <strong>{state.type === "chatgptDeviceCode" ? "Введите код устройства" : "Завершите вход в браузере"}</strong>
            {state.result.userCode ? <div className="device-code compact-code"><span>Код</span><strong>{state.result.userCode}</strong></div> : null}
            <span>После подтверждения приложение само сохранит профиль и обновит список.</span>
            {url ? (
              <button className="button" onClick={() => onOpen(url)}>
                <ExternalLink />
                Открыть страницу входа
              </button>
            ) : null}
          </div>
        ) : null}

        {state.phase === "done" ? (
          <div className="workflow-state success">
            <CheckCircle2 />
            <strong>Аккаунт добавлен</strong>
            <span>Профиль сохранён локально. Можно обновить лимиты или переключиться на него.</span>
            <button className="button" onClick={onClose}>Готово</button>
          </div>
        ) : null}

        {state.phase === "error" ? (
          <div className="workflow-state danger">
            <AlertTriangle />
            <strong>Не удалось добавить аккаунт</strong>
            <span>{state.error ?? "Подробности доступны в журнале диагностики."}</span>
            <button className="button secondary" onClick={() => onStart("chatgptDeviceCode")}>Повторить через код</button>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function ConfirmDialog({
  state,
  onClose
}: {
  state: ConfirmState | null;
  onClose: (confirmed: boolean) => void;
}) {
  if (!state) return null;
  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label={state.title}>
      <div className={`confirm-modal ${state.tone === "danger" ? "danger" : ""}`}>
        <div className="modal-head">
          <div>
            <div className="panel-title">{state.title}</div>
            <p className="muted">{state.body}</p>
          </div>
          <button className="window-btn" onClick={() => onClose(false)} title="Закрыть">
            <X />
          </button>
        </div>
        {state.details?.length ? (
          <div className="confirm-details">
            {state.details.map((detail) => <span key={detail}>{detail}</span>)}
          </div>
        ) : null}
        <div className="modal-actions">
          <button className="button secondary" onClick={() => onClose(false)}>Отмена</button>
          <button className={`button ${state.tone === "danger" ? "danger-action" : ""}`} onClick={() => onClose(true)}>{state.confirmLabel}</button>
        </div>
      </div>
    </div>
  );
}

function App() {
  const [accounts, setAccounts] = useState<ManagedAccount[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [login, setLogin] = useState<LoginStartResult | null>(null);
  const [message, setMessage] = useState<string>("Готов к работе");
  const [diagnostics, setDiagnostics] = useState<AppDiagnostics | null>(null);
  const [healthReport, setHealthReport] = useState<HealthReport | null>(null);
  const [profileIntegrity, setProfileIntegrity] = useState<ProfileIntegrityReport | null>(null);
  const [releaseReadiness, setReleaseReadiness] = useState<ReleaseReadinessReport | null>(null);
  const [updateCheck, setUpdateCheck] = useState<UpdateCheckResult | null>(null);
  const [settingsData, setSettingsData] = useState<AppSettings | null>(null);
  const [workspaceBinding, setWorkspaceBinding] = useState<WorkspaceBinding | null>(null);
  const [switchHistory, setSwitchHistory] = useState<SwitchHistoryItem[]>([]);
  const [limitHistory, setLimitHistory] = useState<LimitHistoryPoint[]>([]);
  const [logLines, setLogLines] = useState<string[]>([]);
  const [showLogViewer, setShowLogViewer] = useState(false);
  const [showReleaseNotes, setShowReleaseNotes] = useState(false);
  const [transferMode, setTransferMode] = useState<TransferMode | null>(null);
  const [transferPassword, setTransferPassword] = useState("");
  const [transferConfirm, setTransferConfirm] = useState("");
  const [transferError, setTransferError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "usable" | "risk">("all");
  const [viewMode, setViewMode] = useState<"table" | "cards">("table");
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null);
  const [activeView, setActiveView] = useState<ViewKey>("dashboard");
  const [loginWizard, setLoginWizard] = useState<LoginWizardState>({ open: false, phase: "method", type: null, result: null, error: null });
  const [confirmState, setConfirmState] = useState<ConfirmState | null>(null);
  const transferResolveRef = useRef<((value: string | null) => void) | null>(null);
  const confirmResolveRef = useRef<((confirmed: boolean) => void) | null>(null);

  const stats = useMemo(() => {
    const active = accounts.find((account) => account.isActive);
    const low = accounts.filter((account) => account.status === "near_limit" || account.status === "limited").length;
    const avg = accounts.length ? accounts.reduce((sum, account) => sum + used(account), 0) / accounts.length : 0;
    const usable = accounts.filter(isUsable).length;
    const stale = accounts.filter((account) => !account.lastRefreshAt || nowSeconds() - account.lastRefreshAt > 15 * 60).length;
    return { active, low, avg, usable, stale };
  }, [accounts]);

  const smartRecommendation = useMemo(() => selectSmartAccount(accounts, workspaceBinding), [accounts, workspaceBinding]);
  const bestAccount = useMemo(() => {
    return smartRecommendation ? accounts.find((account) => account.id === smartRecommendation.accountId) ?? null : null;
  }, [accounts, smartRecommendation]);

  const selectedAccount = useMemo(() => {
    return accounts.find((account) => account.id === selectedAccountId) ?? stats.active ?? bestAccount ?? accounts[0] ?? null;
  }, [accounts, bestAccount, selectedAccountId, stats.active]);

  const visibleAccounts = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return accounts
      .filter((account) => {
        if (statusFilter === "usable" && (!isUsable(account) || account.archived)) return false;
        if (statusFilter === "risk" && account.status !== "near_limit" && account.status !== "limited" && account.status !== "error") return false;
        if (!needle) return true;
        return `${account.label} ${account.email} ${account.planType}`.toLowerCase().includes(needle);
      })
      .slice()
      .sort((a, b) => Number(b.isActive) - Number(a.isActive) || Number(b.favorite) - Number(a.favorite) || Number(a.archived) - Number(b.archived) || accountScore(a) - accountScore(b) || a.label.localeCompare(b.label));
  }, [accounts, search, statusFilter]);
  const tableScrollable = visibleAccounts.length > 5;
  const navItems: Array<{ key: ViewKey; label: string }> = [
    { key: "dashboard", label: "Панель" },
    { key: "accounts", label: "Аккаунты" },
    { key: "limits", label: "Лимиты" },
    { key: "vault", label: "Перенос" },
    { key: "health", label: "Диагностика" },
    { key: "settings", label: "Настройки" }
  ];

  useEffect(() => {
    if (selectedAccountId && accounts.some((account) => account.id === selectedAccountId)) return;
    setSelectedAccountId(stats.active?.id ?? bestAccount?.id ?? accounts[0]?.id ?? null);
  }, [accounts, bestAccount, selectedAccountId, stats.active]);

  useEffect(() => {
    if (!selectedAccount?.id) {
      setLimitHistory([]);
      return;
    }
    let cancelled = false;
    cam.getLimitHistory(selectedAccount.id)
      .then((history) => {
        if (!cancelled) setLimitHistory(history);
      })
      .catch(() => {
        if (!cancelled) setLimitHistory([]);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedAccount?.id]);
  async function reload() {
    try {
      const [nextAccounts, nextDiagnostics, nextHealth, nextIntegrity, nextRelease, nextSettings, nextBinding, nextSwitchHistory] = await Promise.all([
        cam.listAccounts(),
        cam.getDiagnostics(),
        cam.getHealth().catch(() => null),
        cam.getProfileIntegrity().catch(() => null),
        cam.getReleaseReadiness().catch(() => null),
        cam.getSettings().catch(() => null),
        cam.getWorkspaceBinding().catch(() => null),
        cam.getSwitchHistory().catch(() => [])
      ]);
      setAccounts(nextAccounts);
      setDiagnostics(nextDiagnostics);
      setHealthReport(nextHealth);
      setProfileIntegrity(nextIntegrity);
      setReleaseReadiness(nextRelease);
      setSettingsData(nextSettings);
      setWorkspaceBinding(nextBinding);
      setSwitchHistory(nextSwitchHistory);
      if (nextDiagnostics.startupError) setMessage(uiErrorMessage("Сервисы приложения требуют внимания"));
    } catch {
      setMessage(uiErrorMessage("Не удалось загрузить список аккаунтов"));
      try {
        setDiagnostics(await cam.getDiagnostics());
      } catch {
        // Keep UI alive if diagnostics are unavailable.
      }
    }
  }

  useEffect(() => {
    void reload();
    if (window.localStorage.getItem("cam.releaseNotesSeen") !== appVersion) {
      setShowReleaseNotes(true);
    }
    const offAuth = cam.onAuthEvent((event: AuthEvent) => {
      setMessage(event.success ? `Аккаунт добавлен: ${event.account?.email ?? event.profileId}` : uiErrorMessage("Не удалось завершить вход"));
      setLogin(null);
      setLoginWizard((current) => ({
        ...current,
        open: true,
        phase: event.success ? "done" : "error",
        error: event.success ? null : (event.error ?? "Codex не вернул успешное завершение входа")
      }));
      void reload();
    });
    const offAccountsUpdated = cam.onAccountsUpdated(() => {
      setMessage("Лимиты автоматически обновлены");
      void reload();
    });
    return () => {
      offAuth();
      offAccountsUpdated();
    };
  }, []);

  async function startLogin(type: "chatgpt" | "chatgptDeviceCode") {
    setLoginWizard({ open: true, phase: "starting", type, result: null, error: null });
    setBusy(`login:${type}`);
    setMessage(type === "chatgpt" ? "Открываю браузер для входа в ChatGPT" : "Открываю device-code вход");
    try {
      const result = await cam.startLogin(type);
      setLogin(result);
      setLoginWizard({ open: true, phase: "waiting", type, result, error: null });
      setMessage("Браузер открыт. Заверши вход, затем вернись в приложение");
    } catch {
      setLoginWizard({ open: true, phase: "error", type, result: null, error: "Не удалось начать вход. Проверь диагностику Codex CLI." });
      setMessage(uiErrorMessage("Не удалось начать вход"));
    } finally {
      setBusy(null);
    }
  }

  function openLoginWizard(): void {
    setLoginWizard({ open: true, phase: "method", type: null, result: null, error: null });
  }

  function closeLoginWizard(): void {
    setLoginWizard({ open: false, phase: "method", type: null, result: null, error: null });
  }

  function requestConfirm(state: ConfirmState): Promise<boolean> {
    setConfirmState(state);
    return new Promise((resolve) => {
      confirmResolveRef.current = resolve;
    });
  }

  function closeConfirm(confirmed: boolean): void {
    const resolve = confirmResolveRef.current;
    confirmResolveRef.current = null;
    setConfirmState(null);
    resolve?.(confirmed);
  }

  async function refreshAccount(id: string) {
    setBusy(`refresh:${id}`);
    try {
      await cam.refreshAccount(id);
      setMessage("Лимиты обновлены");
      await reload();
    } catch {
      setMessage(uiErrorMessage("Не удалось обновить лимиты"));
    } finally {
      setBusy(null);
    }
  }

  async function refreshAllAccounts() {
    setBusy("refresh:all");
    try {
      await cam.refreshAllAccounts();
      setMessage("Лимиты всех аккаунтов обновлены");
      await reload();
    } catch {
      setMessage(uiErrorMessage("Не удалось обновить все аккаунты"));
    } finally {
      setBusy(null);
    }
  }

  function requestTransferPassword(mode: TransferMode): Promise<string | null> {
    setTransferMode(mode);
    setTransferPassword("");
    setTransferConfirm("");
    setTransferError(null);
    return new Promise((resolve) => {
      transferResolveRef.current = resolve;
    });
  }

  function closeTransferPrompt(value: string | null): void {
    const resolve = transferResolveRef.current;
    transferResolveRef.current = null;
    setTransferMode(null);
    setTransferPassword("");
    setTransferConfirm("");
    setTransferError(null);
    resolve?.(value);
  }

  function submitTransferPrompt(): void {
    if (!transferMode) return;
    if (transferPassword.trim().length < 8) {
      setTransferError("Пароль должен быть не короче 8 символов");
      return;
    }
    if (transferMode === "export" && transferPassword !== transferConfirm) {
      setTransferError("Пароли не совпадают");
      return;
    }
    closeTransferPrompt(transferPassword);
  }

  async function exportAccounts() {
    if (accounts.length === 0) {
      setMessage("Нечего экспортировать: список аккаунтов пуст");
      return;
    }
    const confirmed = await requestConfirm({
      title: "Экспорт аккаунтов",
      body: "Файл будет зашифрован паролем, но после расшифровки он содержит auth-материал. Храни его как секрет.",
      confirmLabel: "Продолжить экспорт",
      details: [`Аккаунтов: ${accounts.length}`, "Формат: .cam-export", "Передача только доверенным ПК"]
    });
    if (!confirmed) return;
    const passphrase = await requestTransferPassword("export");
    if (!passphrase) return;
    setBusy("export");
    try {
      const result = await cam.exportAccounts(passphrase);
      setMessage(result.exportedCount > 0 ? `Экспортировано аккаунтов: ${result.exportedCount}` : "Экспорт отменён");
    } catch {
      setMessage(uiErrorMessage("Не удалось экспортировать аккаунты"));
    } finally {
      setBusy(null);
    }
  }

  async function importAccounts() {
    const passphrase = await requestTransferPassword("import");
    if (!passphrase) return;
    setBusy("import");
    try {
      const result = await cam.importAccounts(passphrase);
      setAccounts(result.accounts);
      setMessage(result.importedCount > 0 ? `Импортировано аккаунтов: ${result.importedCount}` : "Импорт отменён");
      await reload();
    } catch {
      setMessage(uiErrorMessage("Не удалось импортировать аккаунты"));
    } finally {
      setBusy(null);
    }
  }

  async function importAuthJson() {
    setBusy("import-auth");
    try {
      const result = await cam.importAuthJson();
      setAccounts(result.accounts);
      setMessage(result.importedCount > 0 ? `Импортирован auth.json: ${result.importedCount}` : "Импорт auth.json отменён");
      await reload();
    } catch {
      setMessage(uiErrorMessage("Не удалось импортировать auth.json"));
    } finally {
      setBusy(null);
    }
  }

  async function reauthenticateAccount(id: string) {
    const account = accounts.find((item) => item.id === id);
    setBusy(`reauth:${id}`);
    try {
      const result = await cam.reauthenticateAccount(id, "chatgptDeviceCode");
      setLogin(result);
      setLoginWizard({ open: true, phase: "waiting", type: "chatgptDeviceCode", result, error: null });
      setMessage("Открыл reauth. Заверши вход, профиль обновится без пересоздания списка");
    } catch {
      setLoginWizard({ open: true, phase: "error", type: "chatgptDeviceCode", result: null, error: `Не удалось обновить авторизацию${account ? ` для ${account.email}` : ""}.` });
      setMessage(uiErrorMessage("Не удалось обновить авторизацию"));
    } finally {
      setBusy(null);
    }
  }

  async function openProfileFolder(id: string) {
    setBusy(`folder:${id}`);
    try {
      await cam.openProfileFolder(id);
      setMessage("Папка профиля открыта");
    } catch {
      setMessage(uiErrorMessage("Не удалось открыть папку профиля"));
    } finally {
      setBusy(null);
    }
  }

  async function switchAccount(id: string) {
    const account = accounts.find((item) => item.id === id);
    if (account && !account.isActive && settingsData?.confirmSwitch !== false) {
      const confirmed = await requestConfirm({
        title: "Переключить аккаунт",
        body: "Менеджер остановит Codex, сделает backup текущего auth.json, запишет выбранный профиль и запланирует перезапуск Codex.",
        confirmLabel: "Переключить",
        details: [`Профиль: ${account.label}`, `Email: ${account.email}`, `Текущий: ${stats.active?.label ?? "не выбран"}`]
      });
      if (!confirmed) return;
    }
    setBusy(`switch:${id}`);
    try {
      await cam.switchAccount(id);
      setMessage("Codex закрыт, аккаунт переключён, приложение запускается заново");
      await reload();
    } catch {
      setMessage(uiErrorMessage("Не удалось переключить аккаунт"));
    } finally {
      setBusy(null);
    }
  }

  async function deleteAccount(id: string) {
    const account = accounts.find((item) => item.id === id);
    if (account) {
      const confirmed = await requestConfirm({
        title: "Удалить профиль",
        body: "Профиль будет удалён из менеджера вместе с локальной папкой профиля. Активный auth.json Codex не удаляется.",
        confirmLabel: "Удалить",
        tone: "danger",
        details: [`Профиль: ${account.label}`, `Email: ${account.email}`]
      });
      if (!confirmed) return;
    }
    setBusy(`delete:${id}`);
    try {
      await cam.deleteAccount(id);
      setMessage("Профиль удалён из менеджера");
      await reload();
    } catch {
      setMessage(uiErrorMessage("Не удалось удалить профиль"));
    } finally {
      setBusy(null);
    }
  }

  async function selectWorkspace() {
    setBusy("workspace");
    try {
      const nextDiagnostics = await cam.selectWorkspace();
      setDiagnostics(nextDiagnostics);
      setMessage(`Рабочая папка Codex: ${nextDiagnostics.workspacePath ?? "не выбрана"}`);
    } catch {
      setMessage(uiErrorMessage("Не удалось выбрать рабочую папку"));
    } finally {
      setBusy(null);
    }
  }

  async function updateSettings(input: Partial<Omit<AppSettings, "language">>) {
    setBusy("settings");
    try {
      const nextSettings = await cam.updateSettings(input);
      setSettingsData(nextSettings);
      setDiagnostics(await cam.getDiagnostics());
      setMessage("Настройки обновлены");
    } catch {
      setMessage(uiErrorMessage("Не удалось сохранить настройки"));
    } finally {
      setBusy(null);
    }
  }

  async function bindSelectedToWorkspace() {
    if (!selectedAccount) {
      setMessage("Сначала выбери аккаунт");
      return;
    }
    setBusy("workspace-bind");
    try {
      const binding = await cam.bindWorkspaceAccount(selectedAccount.id);
      setWorkspaceBinding(binding);
      setMessage(`Workspace привязан к ${selectedAccount.label}`);
    } catch {
      setMessage(uiErrorMessage("Не удалось закрепить аккаунт за workspace"));
    } finally {
      setBusy(null);
    }
  }

  async function clearWorkspaceBinding() {
    setBusy("workspace-bind");
    try {
      const binding = await cam.bindWorkspaceAccount(null);
      setWorkspaceBinding(binding);
      setMessage("Привязка workspace очищена");
    } catch {
      setMessage(uiErrorMessage("Не удалось очистить привязку workspace"));
    } finally {
      setBusy(null);
    }
  }

  async function rollbackSwitch(event: SwitchHistoryItem) {
    const confirmed = await requestConfirm({
      title: "Откатить переключение",
      body: "Будет восстановлен auth.json из backup-файла, созданного перед этим переключением. Текущий auth.json тоже будет сохранён как backup.",
      confirmLabel: "Откатить",
      details: [`Профиль: ${event.accountLabel ?? event.accountId}`, `Время: ${formatTime(event.startedAt)}`]
    });
    if (!confirmed) return;
    setBusy(`rollback:${event.id}`);
    try {
      const history = await cam.rollbackSwitch(event.id);
      setSwitchHistory(history);
      setMessage("Откат выполнен. Codex auth.json восстановлен из резервной копии");
      await reload();
    } catch {
      setMessage(uiErrorMessage("Не удалось выполнить откат переключения"));
    } finally {
      setBusy(null);
    }
  }

  async function openLogViewer() {
    setBusy("logs");
    try {
      const lines = await cam.readLogTail();
      setLogLines(lines.length ? lines : ["Журнал пока пуст."]);
      setShowLogViewer(true);
      setMessage("Журнал диагностики открыт");
    } catch {
      setMessage(uiErrorMessage("Не удалось открыть журнал диагностики"));
    } finally {
      setBusy(null);
    }
  }

  async function openLogsFolder() {
    setBusy("logs-folder");
    try {
      await cam.openLogsFolder();
      setMessage("Папка журналов открыта");
    } catch {
      setMessage(uiErrorMessage("Не удалось открыть папку журналов"));
    } finally {
      setBusy(null);
    }
  }

  async function exportDiagnosticReport() {
    setBusy("diagnostic-report");
    try {
      const result = await cam.exportDiagnosticReport();
      setMessage(result.filePath ? "Отчёт диагностики сохранён" : "Экспорт отчёта отменён");
    } catch {
      setMessage(uiErrorMessage("Не удалось сохранить отчёт диагностики"));
    } finally {
      setBusy(null);
    }
  }

  async function refreshReleaseReadiness() {
    setBusy("release-readiness");
    try {
      const report = await cam.getReleaseReadiness();
      setReleaseReadiness(report);
      setMessage(report.ready ? "Релизная проверка пройдена" : "Релизная проверка требует внимания");
    } catch {
      setMessage(uiErrorMessage("Не удалось проверить релиз"));
    } finally {
      setBusy(null);
    }
  }

  async function checkUpdates() {
    setBusy("update-check");
    try {
      const result = await cam.checkForUpdates();
      setUpdateCheck(result);
      setMessage(result.message);
    } catch {
      setMessage(uiErrorMessage("Не удалось проверить обновления"));
    } finally {
      setBusy(null);
    }
  }

  async function openReleaseFolder() {
    setBusy("release-folder");
    try {
      await cam.openReleaseFolder();
      setMessage("Папка релиза открыта");
    } catch {
      setMessage(uiErrorMessage("Не удалось открыть папку релиза"));
    } finally {
      setBusy(null);
    }
  }

  async function openCrashReportsFolder() {
    setBusy("crash-folder");
    try {
      await cam.openCrashReportsFolder();
      setMessage("Папка crash-отчётов открыта");
    } catch {
      setMessage(uiErrorMessage("Не удалось открыть crash-отчёты"));
    } finally {
      setBusy(null);
    }
  }

  async function updateAccountMetadata(id: string, input: { tags?: string[]; favorite?: boolean; archived?: boolean }) {
    setBusy(`meta:${id}`);
    try {
      const updated = await cam.updateAccount({ id, ...input });
      setAccounts((current) => current.map((account) => account.id === id ? updated : account));
      setMessage("Метки профиля обновлены");
    } catch {
      setMessage(uiErrorMessage("Не удалось обновить метки профиля"));
    } finally {
      setBusy(null);
    }
  }

  function closeReleaseNotes(): void {
    window.localStorage.setItem("cam.releaseNotesSeen", appVersion);
    setShowReleaseNotes(false);
  }

  const pageContent = (() => {
    switch (activeView) {
      case "dashboard":
        return (
          <>
            <section className="hero dashboard-hero">
              <div className="hero-copy">
                <div className="hero-kicker">
                  <TerminalSquare />
                  локальная панель Codex
                </div>
                <h2>Профили ChatGPT для Codex</h2>
                <p>Компактная панель для управления аккаунтами, лимитами, переносом и диагностикой без длинной прокрутки.</p>
                <div className="hero-actions">
                  <button className="button" disabled={busy !== null} onClick={openLoginWizard}>
                    <LogIn />
                    Добавить аккаунт
                  </button>
                  <button className="button secondary" disabled={busy !== null || accounts.length === 0} onClick={refreshAllAccounts}>
                    {busy === "refresh:all" ? <Loader2 className="spin" /> : <RefreshCcw />}
                    Обновить лимиты
                  </button>
                </div>
              </div>
              <div className="hero-visual">
                <SignalOrbit account={selectedAccount ?? bestAccount} />
                {bestAccount ? (
                  <div className="recommendation">
                    <span>{settingsData?.smartSwitchMode === "auto" ? "Авто-режим" : "Умный выбор"}</span>
                    <strong title={bestAccount.email}>{bestAccount.label}</strong>
                    <small>{smartRecommendation?.reason ?? `${used(bestAccount).toFixed(0)}% · сброс ${formatTime(soonestReset(bestAccount))}`}</small>
                    <button className="button subtle" disabled={busy !== null || bestAccount.isActive} onClick={() => void switchAccount(bestAccount.id)}>
                      <ArrowUpRight />
                      Переключить
                    </button>
                  </div>
                ) : null}
              </div>
            </section>
            <DashboardPage accounts={accounts} />
            <section className="ops-strip">
              <div className="workspace-card">
                <div className="workspace-meta">
                  <div className="workspace-status"><i />локальное хранилище</div>
                  <span>Рабочая папка</span>
                  <strong>{diagnostics?.workspacePath ?? "не выбрана"}</strong>
                </div>
                <button className="button secondary" disabled={busy !== null} onClick={selectWorkspace}>
                  <FolderOpen />
                  Выбрать
                </button>
              </div>
              <div className="health-card">
                <div>
                  <span>Готовы к работе</span>
                  <strong>{stats.usable}/{accounts.length || 0}</strong>
                </div>
                <div>
                  <span>Устарели</span>
                  <strong>{stats.stale}</strong>
                </div>
                <div>
                  <span>Автообновление</span>
                  <strong>{autoRefreshLabel(diagnostics?.rateLimitRefreshIntervalMs)}</strong>
                </div>
              </div>
            </section>
          </>
        );
      case "accounts":
        return (
          <>
            <section className="panel workbench-panel account-panel">
              <div className="panel-head">
                <div>
                  <div className="panel-title-row">
                    <h3>Аккаунты</h3>
                    <span className="badge compact">панель команд</span>
                  </div>
                  <p className="muted">{message}</p>
                </div>
                <div className="panel-actions">
                  <label className="search-wrap">
                    <Search />
                    <input
                      className="search"
                      value={search}
                      onChange={(event) => setSearch(event.target.value)}
                      placeholder="Поиск профиля"
                      aria-label="Поиск профиля"
                    />
                  </label>
                  <div className="segmented" aria-label="Фильтр аккаунтов">
                    <button className={statusFilter === "all" ? "is-selected" : ""} onClick={() => setStatusFilter("all")}>Все</button>
                    <button className={statusFilter === "usable" ? "is-selected" : ""} onClick={() => setStatusFilter("usable")}>Готовые</button>
                    <button className={statusFilter === "risk" ? "is-selected" : ""} onClick={() => setStatusFilter("risk")}>Риск</button>
                  </div>
                  <div className="segmented view-mode" aria-label="Вид аккаунтов">
                    <button className={viewMode === "table" ? "is-selected" : ""} onClick={() => setViewMode("table")}>
                      <SlidersHorizontal />
                      Таблица
                    </button>
                    <button className={viewMode === "cards" ? "is-selected" : ""} onClick={() => setViewMode("cards")}>
                      <Layers3 />
                      Карточки
                    </button>
                  </div>
                  <button className="button secondary" disabled={busy !== null || accounts.length === 0} onClick={exportAccounts}>
                    {busy === "export" ? <Loader2 className="spin" /> : <FileDown />}
                    Экспорт
                  </button>
                  <button className="button secondary" disabled={busy !== null} onClick={importAccounts}>
                    {busy === "import" ? <Loader2 className="spin" /> : <FileUp />}
                    Импорт
                  </button>
                  <button className="button secondary" disabled={busy !== null} onClick={importAuthJson}>
                    {busy === "import-auth" ? <Loader2 className="spin" /> : <FileUp />}
                    auth.json
                  </button>
                  <button className="button secondary" disabled={busy !== null || accounts.length === 0} onClick={refreshAllAccounts}>
                    {busy === "refresh:all" ? <Loader2 className="spin" /> : <RefreshCcw />}
                    Обновить все
                  </button>
                  <span className="badge">Codex · {diagnostics?.codexPath ?? "не найден"}</span>
                </div>
              </div>
              <div className="profile-workbench">
                <div className={`profile-main ${tableScrollable ? "is-scrollable" : ""}`}>
                  {viewMode === "table" ? (
                    <table className="table">
                      <thead>
                        <tr>
                          <th>Аккаунт</th>
                          <th>План</th>
                          <th>5 часов</th>
                          <th>Неделя</th>
                          <th>Статус</th>
                          <th />
                        </tr>
                      </thead>
                      <tbody>
                        {visibleAccounts.map((account) => (
                          <AccountRow
                            key={account.id}
                            account={account}
                            selected={selectedAccount?.id === account.id}
                            busy={busy}
                            onRefresh={refreshAccount}
                            onSwitch={switchAccount}
                            onReauth={reauthenticateAccount}
                            onOpenFolder={openProfileFolder}
                            onSelect={setSelectedAccountId}
                            onDelete={deleteAccount}
                          />
                        ))}
                        {accounts.length === 0 ? (
                          <tr>
                            <td colSpan={6}>
                              <div className="empty-onboarding">
                                <strong>Добавь первый профиль</strong>
                                <span>Начни с входа ChatGPT или подключи существующий auth.json. Всё хранится локально и шифруется отдельно.</span>
                                <div className="mini-actions">
                                  <button className="button" disabled={busy !== null} onClick={openLoginWizard}><LogIn />Добавить ChatGPT</button>
                                  <button className="button secondary" disabled={busy !== null} onClick={importAuthJson}><Database />auth.json</button>
                                  <button className="button secondary" onClick={() => setActiveView("health")}><Activity />Диагностика</button>
                                </div>
                              </div>
                            </td>
                          </tr>
                        ) : visibleAccounts.length === 0 ? (
                          <tr>
                            <td colSpan={6}>
                              <div className="empty">Под этот фильтр аккаунтов нет.</div>
                            </td>
                          </tr>
                        ) : null}
                      </tbody>
                    </table>
                  ) : (
                    <div className="profile-grid">
                      {visibleAccounts.map((account) => (
                        <AccountCard
                          key={account.id}
                          account={account}
                          selected={selectedAccount?.id === account.id}
                          busy={busy}
                          onRefresh={refreshAccount}
                          onSwitch={switchAccount}
                          onReauth={reauthenticateAccount}
                          onOpenFolder={openProfileFolder}
                          onSelect={setSelectedAccountId}
                          onDelete={deleteAccount}
                        />
                      ))}
                      {accounts.length === 0 ? (
                        <div className="empty-onboarding">
                          <strong>Список пока пуст</strong>
                          <span>Добавь ChatGPT-профиль или импортируй auth.json, чтобы менеджер мог переключать Codex без ручной замены файлов.</span>
                          <div className="mini-actions">
                            <button className="button" disabled={busy !== null} onClick={openLoginWizard}><LogIn />Добавить</button>
                            <button className="button secondary" disabled={busy !== null} onClick={importAuthJson}><Database />auth.json</button>
                          </div>
                        </div>
                      ) : null}
                      {accounts.length > 0 && visibleAccounts.length === 0 ? <div className="empty">Под этот фильтр аккаунтов нет.</div> : null}
                    </div>
                  )}
                </div>
                <AccountInspector
                  account={selectedAccount}
                  busy={busy}
                  onRefresh={refreshAccount}
                  onSwitch={switchAccount}
                  onReauth={reauthenticateAccount}
                  onOpenFolder={openProfileFolder}
                  onMetadata={(id, input) => void updateAccountMetadata(id, input)}
                />
              </div>
              <div className="workspace-bind-strip">
                <div>
                  <span>Привязка workspace</span>
                  <strong>{workspaceBinding?.accountLabel ? `${workspaceBinding.accountLabel} · ${workspaceBinding.accountEmail}` : "аккаунт не закреплён"}</strong>
                </div>
                <div className="mini-actions">
                  <button className="button secondary" disabled={busy !== null || !selectedAccount} onClick={bindSelectedToWorkspace}>
                    <FolderOpen />
                    Закрепить выбранный
                  </button>
                  <button className="button secondary" disabled={busy !== null || !workspaceBinding?.accountId} onClick={clearWorkspaceBinding}>
                    <X />
                    Снять
                  </button>
                </div>
              </div>
            </section>
          </>
        );
      case "limits":
        return (
          <section className="panel workbench-panel limits-panel">
            <div className="panel-head">
              <div>
                <div className="panel-title-row">
                  <h3>Лимиты</h3>
                  <span className="badge compact">маршрутизация</span>
                </div>
                <p className="muted">Сводка по нагрузке и ближайшему выгодному аккаунту.</p>
              </div>
              <div className="panel-actions">
                <button className="button secondary" disabled={busy !== null || accounts.length === 0} onClick={refreshAllAccounts}>
                  {busy === "refresh:all" ? <Loader2 className="spin" /> : <RefreshCcw />}
                  Обновить все
                </button>
                <button className="button" disabled={busy !== null || !bestAccount || bestAccount.isActive} onClick={() => bestAccount && void switchAccount(bestAccount.id)}>
                  <ArrowUpRight />
                  Переключить лучший
                </button>
              </div>
            </div>
            <div className="limits-grid">
              <div className="limits-overview">
                <SignalOrbit account={selectedAccount ?? bestAccount} />
                <div className="recommendation">
                  <span>{settingsData?.smartSwitchMode === "auto" ? "Авто-режим" : "Умный выбор"}</span>
                  <strong title={bestAccount?.email ?? ""}>{bestAccount?.label ?? "нет подходящего аккаунта"}</strong>
                  <small>{bestAccount ? smartRecommendation?.reason ?? `${used(bestAccount).toFixed(0)}% · сброс ${formatTime(soonestReset(bestAccount))}` : "нет данных"}</small>
                </div>
                <LimitHistoryChart history={limitHistory} />
              </div>
              <div className="limits-list">
                {visibleAccounts.slice(0, 4).map((account) => (
                  <div key={account.id} className="limit-card">
                    <strong>{account.label}</strong>
                    <LimitMeter label="5 часов" usedPercent={account.fiveHourUsedPercent} resetsAt={account.fiveHourResetsAt} />
                    <LimitMeter label="Неделя" usedPercent={account.weeklyUsedPercent} resetsAt={account.weeklyResetsAt} />
                  </div>
                ))}
              </div>
            </div>
          </section>
        );
      case "vault":
        return (
          <section className="panel workbench-panel vault-panel">
            <div className="panel-head">
              <div>
                <div className="panel-title-row">
                  <h3>Перенос</h3>
                  <span className="badge compact">vault</span>
                </div>
                <p className="muted">Экспорт, импорт и `auth.json` в одном окне.</p>
              </div>
              <div className="panel-actions">
                <button className="button secondary" disabled={busy !== null || accounts.length === 0} onClick={exportAccounts}>
                  {busy === "export" ? <Loader2 className="spin" /> : <FileDown />}
                  Экспорт
                </button>
                <button className="button secondary" disabled={busy !== null} onClick={importAccounts}>
                  {busy === "import" ? <Loader2 className="spin" /> : <FileUp />}
                  Импорт
                </button>
                <button className="button" disabled={busy !== null} onClick={importAuthJson}>
                  {busy === "import-auth" ? <Loader2 className="spin" /> : <Database />}
                  auth.json
                </button>
              </div>
            </div>
            <section className="vault-grid">
              <button className="command-card" disabled={busy !== null || accounts.length === 0} onClick={exportAccounts}>
                <FileDown />
                <span>Экспорт</span>
                <strong>Зашифрованный перенос профилей</strong>
              </button>
              <button className="command-card" disabled={busy !== null} onClick={importAccounts}>
                <FileUp />
                <span>Импорт</span>
                <strong>Восстановить `.cam-export`</strong>
              </button>
              <button className="command-card" disabled={busy !== null} onClick={importAuthJson}>
                <Database />
                <span>auth.json</span>
                <strong>Подключить существующую авторизацию</strong>
              </button>
              <div className="vault-note">
                <span>Подсказка</span>
                <strong>Перед записью используется предпросмотр конфликтов.</strong>
                <p>Если в архиве есть пересечения по e-mail, менеджер предложит безопасный режим переноса.</p>
              </div>
            </section>
          </section>
        );
      case "health":
        return (
          <>
            <HealthPage report={healthReport} />
            <section className="health-foot">
              <div className="workspace-card">
                <div className="workspace-meta">
                  <span>Активный CODEX_HOME</span>
                  <strong>{diagnostics?.activeCodexHome ?? "не выбран"}</strong>
                </div>
                <button className="button secondary" onClick={selectWorkspace}>
                  <FolderOpen />
                  Выбрать рабочую папку
                </button>
              </div>
              <div className="health-card">
                <div>
                  <span>Профили</span>
                  <strong>{profileIntegrity ? `${profileIntegrity.ok}/${profileIntegrity.total}` : "проверка"}</strong>
                </div>
                <div>
                  <span>Предупреждения</span>
                  <strong>{profileIntegrity?.warnings ?? 0}</strong>
                </div>
                <div>
                  <span>Ошибки</span>
                  <strong>{profileIntegrity?.errors ?? 0}</strong>
                </div>
                <div>
                  <span>Отчёт</span>
                  <strong>без секретов</strong>
                </div>
              </div>
              <div className="health-actions-strip">
                <button className="button secondary" disabled={busy !== null} onClick={openLogViewer}>
                  {busy === "logs" ? <Loader2 className="spin" /> : <FileText />}
                  Журнал
                </button>
                <button className="button secondary" disabled={busy !== null} onClick={openLogsFolder}>
                  {busy === "logs-folder" ? <Loader2 className="spin" /> : <FolderOpen />}
                  Папка логов
                </button>
                <button className="button secondary" disabled={busy !== null} onClick={exportDiagnosticReport}>
                  {busy === "diagnostic-report" ? <Loader2 className="spin" /> : <FileDown />}
                  Отчёт
                </button>
                <span>{diagnostics?.logPath ?? "Журнал будет создан после запуска приложения"}</span>
              </div>
              <div className="release-health-card">
                <div className="release-health-head">
                  <div>
                    <span>Релиз</span>
                    <strong>v{releaseReadiness?.version ?? appVersion}</strong>
                  </div>
                  <span className={`release-pill ${releaseReadiness?.ready ? "ok" : "warn"}`}>
                    {releaseReadiness?.ready ? "готов" : "локальная сборка"}
                  </span>
                </div>
                <p>{releaseReadiness?.summary ?? "Проверка релизных файлов будет доступна после загрузки диагностики."}</p>
                <div className="release-artifacts">
                  {(releaseReadiness?.artifacts ?? []).slice(0, 5).map((artifact) => (
                    <span key={artifact.kind} className={artifact.exists && artifact.checksumListed ? "ok" : artifact.exists ? "warn" : "miss"}>
                      {artifact.exists && artifact.checksumListed ? <CheckCircle2 /> : <AlertTriangle />}
                      {artifact.label}
                    </span>
                  ))}
                </div>
                <div className="release-flags">
                  <span>{releaseReadiness?.signingEnabled ? "подпись включена" : "подпись не включена"}</span>
                  <span>{releaseReadiness?.updateFeedConfigured ? "feed настроен" : "feed не настроен"}</span>
                  <span>{updateCheck?.message ?? "обновления ещё не проверялись"}</span>
                </div>
                <div className="mini-actions">
                  <button className="button secondary" disabled={busy !== null} onClick={refreshReleaseReadiness}>
                    {busy === "release-readiness" ? <Loader2 className="spin" /> : <RefreshCcw />}
                    Проверить релиз
                  </button>
                  <button className="button secondary" disabled={busy !== null} onClick={checkUpdates}>
                    {busy === "update-check" ? <Loader2 className="spin" /> : <Activity />}
                    Обновления
                  </button>
                  <button className="button secondary" disabled={busy !== null} onClick={openReleaseFolder}>
                    {busy === "release-folder" ? <Loader2 className="spin" /> : <FolderOpen />}
                    Папка релиза
                  </button>
                  <button className="button secondary" disabled={busy !== null} onClick={openCrashReportsFolder}>
                    {busy === "crash-folder" ? <Loader2 className="spin" /> : <FileText />}
                    Crash-отчёты
                  </button>
                </div>
              </div>
            </section>
          </>
        );
      case "settings":
        return (
          <>
            <SettingsPage settings={settingsData} onUpdate={(input) => void updateSettings(input)} />
            <section className="settings-strip">
              <div className="workspace-card">
                <div className="workspace-meta">
                  <span>Рабочая папка Codex</span>
                  <strong>{diagnostics?.workspacePath ?? "не выбрана"}</strong>
                </div>
                <button className="button secondary" onClick={selectWorkspace}>
                  <FolderOpen />
                  Выбрать
                </button>
              </div>
              <div className="health-card">
                <div>
                  <span>Автообновление</span>
                  <strong>{autoRefreshLabel(diagnostics?.rateLimitRefreshIntervalMs)}</strong>
                </div>
                <div>
                  <span>Аккаунтов</span>
                  <strong>{accounts.length}</strong>
                </div>
                <div>
                  <span>Активный</span>
                  <strong>{stats.active?.label ?? "не выбран"}</strong>
                </div>
                <div>
                  <span>Умный режим</span>
                  <strong>{settingsData?.smartSwitchMode === "auto" ? "авто" : settingsData?.smartSwitchMode === "off" ? "выкл" : "предлагать"}</strong>
                </div>
              </div>
            </section>
            <section className="page-panel switch-history-panel">
              <div className="page-header">
                <span>История</span>
                <h2>Последние переключения</h2>
              </div>
              <div className="history-list">
                {switchHistory.length ? switchHistory.slice(0, 6).map((event) => (
                  <article key={event.id} className={`history-item ${event.status}`}>
                    <span>{formatTime(event.startedAt)}</span>
                    <strong>{event.accountLabel ?? event.accountId}</strong>
                    <em>{event.status === "completed" ? "завершено" : event.status === "failed" ? "ошибка" : event.status}</em>
                    <button
                      className="icon-btn"
                      disabled={busy !== null || !event.backupPath}
                      onClick={() => void rollbackSwitch(event)}
                      title="Откатить auth.json"
                    >
                      {busy === `rollback:${event.id}` ? <Loader2 className="spin" /> : <RefreshCcw />}
                    </button>
                  </article>
                )) : <div className="empty compact-empty">Переключений пока нет.</div>}
              </div>
            </section>
          </>
        );
    }
  })();

  return (
    <main className="shell">
      <header className="topbar">
        <div className="brand">
          <div className="mark">
            <img src={logoUrl} alt="" aria-hidden="true" />
          </div>
          <div>
            <div className="eyebrow">Панель управления</div>
            <h1>Codex Account Manager <span className="version">{appVersion}</span></h1>
          </div>
        </div>
        <nav className="top-nav" aria-label="Разделы консоли">
          {navItems.map((item) => (
            <button
              key={item.key}
              className={activeView === item.key ? "is-active" : ""}
              onClick={() => setActiveView(item.key)}
            >
              {item.label}
            </button>
          ))}
        </nav>
        <div className="actions top-actions">
          <button className="button secondary" disabled={busy !== null} onClick={() => startLogin("chatgptDeviceCode")}>
            <KeyRound />
            Код устройства
          </button>
          <button className="button" disabled={busy !== null} onClick={openLoginWizard}>
            <LogIn />
            Добавить ChatGPT
          </button>
          <div className="window-controls" aria-label="Управление окном">
            <button className="window-btn" onClick={() => void cam.minimizeWindow()} title="Свернуть">
              <Minus />
            </button>
            <button className="window-btn" onClick={() => void cam.toggleMaximizeWindow()} title="Развернуть">
              <Maximize2 />
            </button>
            <button className="window-btn close" onClick={() => void cam.closeWindow()} title="Закрыть">
              <X />
            </button>
          </div>
        </div>
      </header>

      <div className="content">{pageContent}</div>
      <AddAccountWizard
        state={loginWizard}
        busy={busy}
        onStart={(type) => void startLogin(type)}
        onOpen={(url) => void cam.openExternal(url)}
        onClose={closeLoginWizard}
      />
      <ConfirmDialog state={confirmState} onClose={closeConfirm} />
      {transferMode ? (
        <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label={transferMode === "export" ? "Экспорт аккаунтов" : "Импорт аккаунтов"}>
          <div className="transfer-modal">
            <div className="panel-title">{transferMode === "export" ? "Экспорт аккаунтов" : "Импорт аккаунтов"}</div>
            <p className="muted">
              {transferMode === "export"
                ? "Задай пароль для зашифрованного файла. Он понадобится для импорта на другом ПК."
                : "Введи пароль от экспортированного файла, чтобы перенести авторизации на этот ПК."}
            </p>
            <label className="field">
              <span>Пароль</span>
              <input autoFocus type="password" value={transferPassword} onChange={(event) => setTransferPassword(event.target.value)} onKeyDown={(event) => {
                if (event.key === "Enter") submitTransferPrompt();
                if (event.key === "Escape") closeTransferPrompt(null);
              }} />
              <small className={`password-hint ${passwordStrength(transferPassword).className}`}>{passwordStrength(transferPassword).label}</small>
            </label>
            {transferMode === "export" ? (
              <label className="field">
                <span>Повтор пароля</span>
                <input type="password" value={transferConfirm} onChange={(event) => setTransferConfirm(event.target.value)} onKeyDown={(event) => {
                  if (event.key === "Enter") submitTransferPrompt();
                  if (event.key === "Escape") closeTransferPrompt(null);
                }} />
              </label>
            ) : null}
            {transferError ? <div className="form-error">{transferError}</div> : null}
            <div className="modal-actions">
              <button className="button secondary" onClick={() => closeTransferPrompt(null)}>Отмена</button>
              <button className="button" onClick={submitTransferPrompt}>{transferMode === "export" ? "Экспорт" : "Импорт"}</button>
            </div>
          </div>
        </div>
      ) : null}
      {showLogViewer ? (
        <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label="Журнал диагностики">
          <div className="transfer-modal log-viewer">
            <div className="modal-head">
              <div>
                <div className="panel-title">Журнал диагностики</div>
                <p className="muted">Последние записи без секретов и токенов.</p>
              </div>
              <button className="icon-btn" onClick={() => setShowLogViewer(false)} title="Закрыть">
                <X />
              </button>
            </div>
            <pre className="log-lines">{logLines.join("\n")}</pre>
            <div className="modal-actions">
              <button className="button secondary" onClick={openLogsFolder}>
                <FolderOpen />
                Папка логов
              </button>
              <button className="button" onClick={() => setShowLogViewer(false)}>Готово</button>
            </div>
          </div>
        </div>
      ) : null}
      {showReleaseNotes ? (
        <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label="Что нового">
          <div className="transfer-modal release-notes-modal">
            <div className="modal-head">
              <div>
                <div className="panel-title">Что нового в {appVersion}</div>
                <p className="muted">Коротко о свежем релизе.</p>
              </div>
              <button className="icon-btn" onClick={closeReleaseNotes} title="Закрыть">
                <X />
              </button>
            </div>
            <div className="release-notes-list">
              {releaseNotes.map((note) => (
                <article key={note.title}>
                  <CheckCircle2 />
                  <div>
                    <strong>{note.title}</strong>
                    <span>{note.body}</span>
                  </div>
                </article>
              ))}
            </div>
            <div className="modal-actions">
              <button className="button secondary" onClick={() => setActiveView("health")}>Диагностика</button>
              <button className="button" onClick={closeReleaseNotes}>Понятно</button>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
