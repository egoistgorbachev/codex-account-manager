export type AppErrorCode =
  | "CODEX_NOT_FOUND"
  | "RPC_TIMEOUT"
  | "AUTH_INVALID"
  | "ACCOUNT_NOT_FOUND"
  | "EXPORT_PASSWORD_WEAK"
  | "IMPORT_UNSUPPORTED"
  | "SWITCH_FAILED"
  | "DB_UNAVAILABLE"
  | "VAULT_DEGRADED";

export interface SafeAppError {
  code: AppErrorCode;
  message: string;
}

const messages: Record<AppErrorCode, string> = {
  CODEX_NOT_FOUND: "Codex CLI не найден. Проверь путь в настройках.",
  RPC_TIMEOUT: "Codex не ответил вовремя. Повтори действие позже.",
  AUTH_INVALID: "Файл авторизации поврежден или не подходит для этого аккаунта.",
  ACCOUNT_NOT_FOUND: "Аккаунт не найден.",
  EXPORT_PASSWORD_WEAK: "Пароль экспорта слишком слабый.",
  IMPORT_UNSUPPORTED: "Файл импорта не поддерживается этой версией.",
  SWITCH_FAILED: "Не удалось переключить аккаунт.",
  DB_UNAVAILABLE: "База данных временно недоступна.",
  VAULT_DEGRADED: "Защита локального хранилища ограничена."
};

export class AppError extends Error {
  constructor(
    public readonly code: AppErrorCode,
    public readonly detail?: string,
    public readonly cause?: unknown
  ) {
    super(messages[code]);
    this.name = "AppError";
  }
}

export function appError(code: AppErrorCode, detail?: string, cause?: unknown): AppError {
  return new AppError(code, detail, cause);
}

export function toSafeError(error: unknown): SafeAppError {
  if (error instanceof AppError) return { code: error.code, message: messages[error.code] };
  return { code: "SWITCH_FAILED", message: messages.SWITCH_FAILED };
}
