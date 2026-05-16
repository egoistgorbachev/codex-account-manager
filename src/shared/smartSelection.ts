import type { ManagedAccount, SmartRecommendation, WorkspaceBinding } from "./types.js";

function usage(account: ManagedAccount): number {
  return Math.max(account.fiveHourUsedPercent ?? 0, account.weeklyUsedPercent ?? 0);
}

function isUsable(account: ManagedAccount): boolean {
  return account.status !== "limited" && account.status !== "error";
}

function resetPenalty(account: ManagedAccount): number {
  const resets = [account.fiveHourResetsAt, account.weeklyResetsAt].filter(Boolean) as number[];
  if (resets.length === 0) return 20;
  const nextReset = Math.min(...resets);
  const hours = Math.max(0, (nextReset - Math.floor(Date.now() / 1000)) / 3600);
  return Math.min(12, hours);
}

function scoreAccount(account: ManagedAccount, binding: WorkspaceBinding | null): number {
  let score = usage(account) + resetPenalty(account);
  if (account.status === "near_limit") score += 28;
  if (binding?.accountId === account.id) score -= 42;
  if (account.isActive) score -= 8;
  if (account.lastUsedAt) score -= 3;
  return score;
}

function reasonFor(account: ManagedAccount, binding: WorkspaceBinding | null): string {
  if (binding?.accountId === account.id) return "Привязан к текущей рабочей папке и доступен по лимитам";
  if (account.status === "near_limit") return "Лучший доступный вариант, но лимиты уже близко";
  if (account.isActive) return "Активный аккаунт остаётся лучшим вариантом";
  return "Ниже нагрузка по лимитам и нет ошибок статуса";
}

export function selectSmartAccount(accounts: ManagedAccount[], binding: WorkspaceBinding | null = null): SmartRecommendation | null {
  const candidates = accounts.filter(isUsable);
  if (candidates.length === 0) return null;
  const selected = candidates
    .map((account) => ({ account, score: scoreAccount(account, binding) }))
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
