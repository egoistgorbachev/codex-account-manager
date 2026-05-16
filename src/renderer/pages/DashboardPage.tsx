import { Activity, CheckCircle2, Gauge, ShieldCheck } from "lucide-react";
import type { ManagedAccount } from "../../shared/types";
import { uiText } from "../i18n/ru";

function load(account: ManagedAccount): number {
  return Math.max(account.fiveHourUsedPercent ?? 0, account.weeklyUsedPercent ?? 0);
}

export function DashboardPage({ accounts }: { accounts: ManagedAccount[] }) {
  const active = accounts.find((account) => account.isActive);
  const usable = accounts.filter((account) => account.status !== "limited" && account.status !== "error").length;
  const average = accounts.length ? accounts.reduce((sum, account) => sum + load(account), 0) / accounts.length : 0;

  return (
    <section className="page-panel" aria-label={uiText.nav.dashboard}>
      <div className="page-header">
        <span>{uiText.nav.dashboard}</span>
        <h2>Сводка аккаунтов</h2>
      </div>
      <div className="summary-grid">
        <article>
          <Activity />
          <span>Всего аккаунтов</span>
          <strong>{accounts.length}</strong>
        </article>
        <article>
          <CheckCircle2 />
          <span>Готовы к работе</span>
          <strong>{usable}</strong>
        </article>
        <article>
          <Gauge />
          <span>Средняя нагрузка</span>
          <strong>{average.toFixed(0)}%</strong>
        </article>
        <article>
          <ShieldCheck />
          <span>Активный профиль</span>
          <strong>{active?.label ?? "не выбран"}</strong>
        </article>
      </div>
    </section>
  );
}
