import { AlertTriangle, CheckCircle2, CircleHelp } from "lucide-react";
import type { HealthItem, HealthReport } from "../../shared/types";
import { uiText } from "../i18n/ru";

function iconFor(item: HealthItem) {
  if (item.status === "ok") return <CheckCircle2 />;
  if (item.status === "warning") return <AlertTriangle />;
  return <CircleHelp />;
}

export function HealthPage({ report }: { report: HealthReport | null }) {
  return (
    <section className="page-panel" aria-label={uiText.nav.health}>
      <div className="page-header">
        <span>{uiText.nav.health}</span>
        <h2>{uiText.health.title}</h2>
      </div>
      <div className="health-grid">
        {report?.items.map((item) => (
          <article key={item.id} className={`health-item ${item.status}`}>
            {iconFor(item)}
            <strong>{item.label}</strong>
            <span>{item.message}</span>
          </article>
        )) ?? <p>{uiText.states.loading}</p>}
      </div>
    </section>
  );
}
