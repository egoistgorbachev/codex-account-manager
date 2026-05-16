import { FileDown, FileUp, ShieldCheck } from "lucide-react";
import { uiText } from "../i18n/ru";

export function VaultPage() {
  return (
    <section className="page-panel" aria-label={uiText.nav.vault}>
      <div className="page-header">
        <span>{uiText.nav.vault}</span>
        <h2>Перенос и резервирование</h2>
      </div>
      <div className="summary-grid">
        <article>
          <FileDown />
          <span>{uiText.actions.exportSelected}</span>
          <strong>шифрование</strong>
        </article>
        <article>
          <FileUp />
          <span>{uiText.actions.importAccounts}</span>
          <strong>предпросмотр</strong>
        </article>
        <article>
          <ShieldCheck />
          <span>Конфликты</span>
          <strong>до записи</strong>
        </article>
      </div>
    </section>
  );
}
