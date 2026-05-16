import { useCallback, useEffect, useState } from "react";
import type { AppApi, ManagedAccount } from "../../shared/types";

export interface AccountsState {
  accounts: ManagedAccount[];
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

export function useAccounts(api?: AppApi): AccountsState {
  const resolvedApi = api ?? window.cam;
  const [accounts, setAccounts] = useState<ManagedAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!resolvedApi) {
      setAccounts([]);
      setLoading(false);
      setError("Мост приложения недоступен.");
      return;
    }

    setLoading(true);
    setError(null);
    try {
      setAccounts(await resolvedApi.listAccounts());
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Не удалось загрузить аккаунты.");
    } finally {
      setLoading(false);
    }
  }, [resolvedApi]);

  useEffect(() => {
    void refresh();
    return resolvedApi?.onAccountsUpdated(() => void refresh());
  }, [resolvedApi, refresh]);

  return { accounts, loading, error, refresh };
}
