import type { ManagedAccount, RateLimitSnapshot } from "../../shared/types.js";

export interface AccountRecommendation {
  account: ManagedAccount;
  reason: string;
  score: number;
}

export interface LimitSnapshotRecord {
  id: string;
  accountId: string;
  capturedAt: number;
  status: ManagedAccount["status"];
  statusReason: string | null;
  limits: RateLimitSnapshot;
}

export function selectBestAccount(
  accounts: ManagedAccount[],
  options: { staleAfterSeconds: number; now?: number }
): AccountRecommendation | null {
  const now = options.now ?? Math.floor(Date.now() / 1000);
  const candidates = accounts.filter((account) => {
    if (account.status === "limited" || account.status === "error") return false;
    if (!account.lastRefreshAt) return false;
    return now - account.lastRefreshAt <= options.staleAfterSeconds;
  });

  const scored = candidates
    .map((account) => {
      const fiveHour = account.fiveHourUsedPercent ?? 50;
      const weekly = account.weeklyUsedPercent ?? 50;
      const activePenalty = account.isActive ? 5 : 0;
      return { account, score: fiveHour + weekly + activePenalty };
    })
    .sort((a, b) => a.score - b.score);

  const best = scored[0];
  if (!best) return null;
  return { ...best, reason: "Минимальная нагрузка по лимитам." };
}
