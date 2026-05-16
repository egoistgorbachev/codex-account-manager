import type { AccountStore } from "../db.js";

export interface AccountMetadata {
  tags: string[];
  favorite: boolean;
  archived: boolean;
}

export class AccountService {
  constructor(private readonly store: AccountStore) {}

  updateMetadata(accountId: string, metadata: AccountMetadata): void {
    this.store.setAccountMetadata(accountId, {
      tags: [...new Set(metadata.tags.map((tag) => tag.trim()).filter(Boolean))].sort(),
      favorite: metadata.favorite,
      archived: metadata.archived
    });
  }

  getMetadata(accountId: string): AccountMetadata {
    return this.store.getAccountMetadata(accountId);
  }
}
