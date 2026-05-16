import type { ManagedAccount, SmartRecommendation } from "./types.js";

export type CommandPaletteGroup = "Навигация" | "Аккаунты" | "Лимиты" | "Перенос" | "Диагностика";

export type CommandPaletteAction =
  | "navigate:dashboard"
  | "navigate:accounts"
  | "navigate:limits"
  | "navigate:vault"
  | "navigate:health"
  | "navigate:settings"
  | "login"
  | "refreshAll"
  | "switchBest"
  | "switchAccount"
  | "importAuth"
  | "exportVault"
  | "openLogs"
  | "exportDiagnostics";

export interface CommandPaletteCommand {
  id: string;
  group: CommandPaletteGroup;
  title: string;
  subtitle: string;
  keywords: string[];
  action: CommandPaletteAction;
  accountId?: string;
  view?: "dashboard" | "accounts" | "limits" | "vault" | "health" | "settings";
  disabled?: boolean;
}

export interface BuildCommandPaletteInput {
  accounts: ManagedAccount[];
  activeView: "dashboard" | "accounts" | "limits" | "vault" | "health" | "settings";
  smartRecommendation: SmartRecommendation | null;
}

const navigation: Array<Pick<CommandPaletteCommand, "id" | "title" | "subtitle" | "keywords" | "action" | "view">> = [
  { id: "nav.dashboard", title: "Открыть панель", subtitle: "Сводка аккаунтов и рабочая папка", keywords: ["главная", "сводка", "dashboard"], action: "navigate:dashboard", view: "dashboard" },
  { id: "nav.accounts", title: "Открыть аккаунты", subtitle: "Таблица, карточки и инспектор профиля", keywords: ["профили", "таблица", "accounts"], action: "navigate:accounts", view: "accounts" },
  { id: "nav.limits", title: "Открыть лимиты", subtitle: "Нагрузка, история и лучший профиль", keywords: ["лимиты", "rate", "quota"], action: "navigate:limits", view: "limits" },
  { id: "nav.vault", title: "Открыть перенос", subtitle: "Экспорт, импорт и auth.json", keywords: ["перенос", "экспорт", "импорт", "vault"], action: "navigate:vault", view: "vault" },
  { id: "nav.health", title: "Открыть диагностику", subtitle: "Центр здоровья, логи и релиз", keywords: ["health", "логи", "ошибки"], action: "navigate:health", view: "health" },
  { id: "nav.settings", title: "Открыть настройки", subtitle: "Автообновление, умный режим и уведомления", keywords: ["настройки", "режим", "settings"], action: "navigate:settings", view: "settings" }
];

function isSwitchTarget(account: ManagedAccount): boolean {
  return !account.isActive && !account.archived && account.status !== "limited" && account.status !== "error";
}

function searchText(command: CommandPaletteCommand): string {
  return [command.title, command.subtitle, command.group, ...command.keywords].join(" ").toLowerCase();
}

export function buildCommandPalette(input: BuildCommandPaletteInput): CommandPaletteCommand[] {
  const commands: CommandPaletteCommand[] = navigation.map((item) => ({
    ...item,
    group: "Навигация",
    disabled: item.view === input.activeView
  }));

  commands.push(
    {
      id: "account.login",
      group: "Аккаунты",
      title: "Добавить ChatGPT-профиль",
      subtitle: "Запустить вход через браузер или код устройства",
      keywords: ["добавить", "логин", "chatgpt", "device"],
      action: "login"
    },
    {
      id: "accounts.refreshAll",
      group: "Лимиты",
      title: "Обновить все лимиты",
      subtitle: "Запросить свежий статус по всем профилям",
      keywords: ["лимиты", "обновить", "refresh", "quota"],
      action: "refreshAll",
      disabled: input.accounts.length === 0
    },
    {
      id: "account.switchBest",
      group: "Аккаунты",
      title: "Переключить на лучший профиль",
      subtitle: input.smartRecommendation?.reason ?? "Нет свежей рекомендации",
      keywords: ["лучший", "умный", "авто", "switch"],
      action: "switchBest",
      accountId: input.smartRecommendation?.accountId,
      disabled: !input.smartRecommendation
    },
    {
      id: "vault.export",
      group: "Перенос",
      title: "Экспортировать профили",
      subtitle: "Создать зашифрованный .cam-export",
      keywords: ["экспорт", "backup", "перенос"],
      action: "exportVault",
      disabled: input.accounts.length === 0
    },
    {
      id: "vault.importAuth",
      group: "Перенос",
      title: "Импортировать auth.json",
      subtitle: "Подключить существующую авторизацию Codex",
      keywords: ["импорт", "auth", "json"],
      action: "importAuth"
    },
    {
      id: "diagnostics.logs",
      group: "Диагностика",
      title: "Открыть журнал",
      subtitle: "Показать последние события приложения",
      keywords: ["журнал", "логи", "logs"],
      action: "openLogs"
    },
    {
      id: "diagnostics.export",
      group: "Диагностика",
      title: "Сохранить отчёт диагностики",
      subtitle: "Экспортировать JSON без секретов",
      keywords: ["отчёт", "диагностика", "health"],
      action: "exportDiagnostics"
    }
  );

  for (const account of input.accounts.filter(isSwitchTarget).slice(0, 12)) {
    commands.push({
      id: `account.switch.${account.id}`,
      group: "Аккаунты",
      title: `Переключить: ${account.label}`,
      subtitle: `${account.email} · нагрузка ${Math.max(account.fiveHourUsedPercent ?? 0, account.weeklyUsedPercent ?? 0).toFixed(0)}%`,
      keywords: ["переключить", "аккаунт", account.email, account.planType, ...(account.tags ?? [])],
      action: "switchAccount",
      accountId: account.id
    });
  }

  return commands;
}

export function filterCommandPalette(commands: CommandPaletteCommand[], query: string): CommandPaletteCommand[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return commands;
  return commands.filter((command) => searchText(command).includes(needle));
}
