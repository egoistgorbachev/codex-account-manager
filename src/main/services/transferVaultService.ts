import type { ImportPreview } from "../../shared/types.js";

export interface PreviewAccount {
  id: string;
  email: string;
  label: string;
}

export function previewImport(input: { incoming: PreviewAccount[]; existing: PreviewAccount[] }): ImportPreview {
  const existingByEmail = new Map(input.existing.map((account) => [account.email.toLowerCase(), account]));
  const conflicts = input.incoming.flatMap((account) => {
    const existing = existingByEmail.get(account.email.toLowerCase());
    return existing ? [{ incomingId: account.id, existingId: existing.id, email: account.email, reason: "email" as const }] : [];
  });
  const conflictIds = new Set(conflicts.map((conflict) => conflict.incomingId));
  return {
    total: input.incoming.length,
    conflicts,
    safeToImport: input.incoming.filter((account) => !conflictIds.has(account.id))
  };
}
