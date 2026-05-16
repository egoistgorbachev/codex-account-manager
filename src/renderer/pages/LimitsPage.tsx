import type { ManagedAccount } from "../../shared/types";
import { uiText } from "../i18n/ru";

export function LimitsPage({ accounts }: { accounts: ManagedAccount[] }) {
  return (
    <section className="page-panel" aria-label={uiText.nav.limits}>
      <div className="page-header">
        <span>{uiText.nav.limits}</span>
        <h2>Окна лимитов</h2>
      </div>
      <div className="compact-list">
        {accounts.map((account) => (
          <article key={account.id}>
            <strong>{account.label}</strong>
            <span>5 часов: {account.fiveHourUsedPercent?.toFixed(0) ?? "нет данных"}%</span>
            <small>Неделя: {account.weeklyUsedPercent?.toFixed(0) ?? "нет данных"}%</small>
          </article>
        ))}
      </div>
    </section>
  );
}
