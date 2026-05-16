import type { AppSettings } from "../../shared/types";
import { uiText } from "../i18n/ru";

const intervals: AppSettings["autoRefreshIntervalMs"][] = [60_000, 180_000, 300_000, 600_000, 900_000];
const smartModes: Array<{ value: AppSettings["smartSwitchMode"]; label: string }> = [
  { value: "suggest", label: "предлагать" },
  { value: "auto", label: "авто" },
  { value: "off", label: "выкл" }
];

function minutes(ms: number): string {
  return `${Math.round(ms / 60000)} мин`;
}

export function SettingsPage({
  settings,
  onUpdate
}: {
  settings: AppSettings | null;
  onUpdate: (input: Partial<Omit<AppSettings, "language">>) => void;
}) {
  return (
    <section className="page-panel" aria-label={uiText.nav.settings}>
      <div className="page-header">
        <span>{uiText.nav.settings}</span>
        <h2>{uiText.settings.title}</h2>
      </div>
      <div className="settings-list">
        <label>
          <span>{uiText.settings.language}</span>
          <strong>Русский</strong>
        </label>
        <label>
          <span>{uiText.settings.autoRefresh}</span>
          <div className="inline-options" aria-label="Интервал автообновления">
            {intervals.map((interval) => (
              <button
                key={interval}
                className={settings?.autoRefreshIntervalMs === interval ? "is-selected" : ""}
                disabled={!settings}
                onClick={() => onUpdate({ autoRefreshIntervalMs: interval })}
              >
                {minutes(interval)}
              </button>
            ))}
          </div>
        </label>
        <label>
          <span>{uiText.settings.privacyMode}</span>
          <button
            className={`settings-toggle ${settings?.privacyMode ? "is-on" : ""}`}
            disabled={!settings}
            onClick={() => onUpdate({ privacyMode: !settings?.privacyMode })}
          >
            {settings?.privacyMode ? "включен" : "выключен"}
          </button>
        </label>
        <label>
          <span>Подтверждение переключения</span>
          <button
            className={`settings-toggle ${settings?.confirmSwitch ? "is-on" : ""}`}
            disabled={!settings}
            onClick={() => onUpdate({ confirmSwitch: !settings?.confirmSwitch })}
          >
            {settings?.confirmSwitch ? "включено" : "выключено"}
          </button>
        </label>
        <label>
          <span>Умный режим</span>
          <div className="inline-options" aria-label="Умный режим переключения">
            {smartModes.map((mode) => (
              <button
                key={mode.value}
                className={settings?.smartSwitchMode === mode.value ? "is-selected" : ""}
                disabled={!settings}
                onClick={() => onUpdate({ smartSwitchMode: mode.value })}
              >
                {mode.label}
              </button>
            ))}
          </div>
        </label>
        <label>
          <span>Уведомления Windows</span>
          <button
            className={`settings-toggle ${settings?.desktopNotifications ? "is-on" : ""}`}
            disabled={!settings}
            onClick={() => onUpdate({ desktopNotifications: !settings?.desktopNotifications })}
          >
            {settings?.desktopNotifications ? "включены" : "выключены"}
          </button>
        </label>
      </div>
    </section>
  );
}
