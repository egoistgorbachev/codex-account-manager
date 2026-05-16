import type { ManagedAccount } from "../../shared/types";
import { uiText } from "../i18n/ru";

export function AccountsPage({ accounts }: { accounts: ManagedAccount[] }) {
  return (
    <section className="page-panel" aria-label={uiText.nav.accounts}>
      <div className="page-header">
        <span>{uiText.nav.accounts}</span>
        <h2>Парк профилей</h2>
      </div>
      <div className="compact-list">
        {accounts.map((account) => (
          <article key={account.id}>
            <strong>{account.label}</strong>
            <span>{account.email}</span>
            <small>{account.isActive ? "активен" : "резерв"}</small>
          </article>
        ))}
        {accounts.length === 0 ? <p>{uiText.states.emptyAccounts}</p> : null}
      </div>
    </section>
  );
}
