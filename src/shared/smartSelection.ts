import type { ManagedAccount, SmartRecommendation, WorkspaceBinding } from "./types.js";

export interface SmartSelectionOptions {
  now?: number;
  staleAfterSeconds?: number;
}

function usage(account: ManagedAccount): number {
  return Math.max(account.fiveHourUsedPercent ?? 0, account.weeklyUsedPercent ?? 0);
}

function isUsable(account: ManagedAccount, options: Required<SmartSelectionOptions>): boolean {
  if (account.archived) return false;
  if (account.status === "limited" || account.status === "error") return false;
  if (!Number.isFinite(options.staleAfterSeconds)) return true;
  if (!account.lastRefreshAt) return false;
  return options.now - account.lastRefreshAt <= options.staleAfterSeconds;
}

function resetPenalty(account: ManagedAccount, now: number): number {
  const resets = [account.fiveHourResetsAt, account.weeklyResetsAt].filter(Boolean) as number[];
  if (resets.length === 0) return 20;
  const nextReset = Math.min(...resets);
  const hours = Math.max(0, (nextReset - now) / 3600);
  return Math.min(12, hours);
}

function scoreAccount(account: ManagedAccount, binding: WorkspaceBinding | null, options: Required<SmartSelectionOptions>): number {
  let score = usage(account) + resetPenalty(account, options.now);
  if (account.status === "near_limit") score += 28;
  if (binding?.accountId === account.id) score -= 42;
  if (account.isActive) score -= 8;
  if (account.favorite) score -= 10;
  if (account.lastUsedAt) score -= 3;
  return score;
}

function reasonFor(account: ManagedAccount, binding: WorkspaceBinding | null): string {
  if (binding?.accountId === account.id) return "Привязан к текущей рабочей папке и доступен по лимитам";
  if (account.status === "near_limit") return "Лучший доступный вариант, но лимиты уже близко";
  if (account.isActive) return "Активный аккаунт остаётся лучшим вариантом";
  return "Ниже нагрузка по лимитам и нет ошибок статуса";
}

export function selectSmartAccount(
  accounts: ManagedAccount[],
  binding: WorkspaceBinding | null = null,
  options: SmartSelectionOptions = {}
): SmartRecommendation | null {
  const resolvedOptions: Required<SmartSelectionOptions> = {
    now: options.now ?? Math.floor(Date.now() / 1000),
    staleAfterSeconds: options.staleAfterSeconds ?? Number.POSITIVE_INFINITY
  };
  const candidates = accounts.filter((account) => isUsable(account, resolvedOptions));
  if (candidates.length === 0) return null;
  const selected = candidates
    .map((account) => ({ account, score: scoreAccount(account, binding, resolvedOptions) }))
    .sort((a, b) => a.score - b.score || a.account.label.localeCompare(b.account.label))[0];
  return {
    accountId: selected.account.id,
    accountLabel: selected.account.label,
    accountEmail: selected.account.email,
    score: selected.score,
    reason: reasonFor(selected.account, binding),
    workspaceMatched: binding?.accountId === selected.account.id
  };
}
