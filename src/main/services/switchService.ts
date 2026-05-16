import fs from "node:fs";
import path from "node:path";
import { nanoid } from "nanoid";
import { appError } from "../../shared/errors.js";

type SwitchStatus = "started" | "completed" | "failed" | "rolled_back";

export interface SwitchEventRecord {
  id: string;
  accountId: string;
  previousAccountId: string | null;
  startedAt: number;
  completedAt: number | null;
  status: SwitchStatus;
  error: string | null;
  backupPath: string | null;
}

export interface SwitchServiceOptions {
  codexHome: string;
  stopCodex(): Promise<void>;
  startCodex(): Promise<void>;
  recordEvent(event: SwitchEventRecord): Promise<void>;
}

export interface SwitchInput {
  accountId: string;
  previousAccountId: string | null;
  expectedAuthAccountId?: string | null;
  authJson: string;
}

export interface SwitchResult {
  eventId: string;
  backupPath: string;
}

function atomicWrite(filePath: string, data: string): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const tempPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tempPath, data, "utf8");
  fs.renameSync(tempPath, filePath);
}

function extractAccountId(authJson: string): string | null {
  try {
    const parsed = JSON.parse(authJson) as { account_id?: unknown; tokens?: { account_id?: unknown } };
    if (typeof parsed.account_id === "string" && parsed.account_id) return parsed.account_id;
    if (typeof parsed.tokens?.account_id === "string" && parsed.tokens.account_id) return parsed.tokens.account_id;
    return null;
  } catch {
    throw appError("AUTH_INVALID");
  }
}

export class SwitchService {
  constructor(private readonly options: SwitchServiceOptions) {}

  async switchTo(input: SwitchInput): Promise<SwitchResult> {
    const eventId = nanoid();
    const startedAt = Math.floor(Date.now() / 1000);
    const authPath = path.join(this.options.codexHome, "auth.json");
    const backupPath = path.join(this.options.codexHome, `auth.${startedAt}.${eventId}.bak`);
    const expectedAuthAccountId = input.expectedAuthAccountId ?? input.accountId;

    await this.record({
      id: eventId,
      accountId: input.accountId,
      previousAccountId: input.previousAccountId,
      startedAt,
      completedAt: null,
      status: "started",
      error: null,
      backupPath
    });

    try {
      if (extractAccountId(input.authJson) !== expectedAuthAccountId) throw appError("AUTH_INVALID");
      await this.options.stopCodex();
      if (fs.existsSync(authPath)) fs.copyFileSync(authPath, backupPath);
      atomicWrite(authPath, input.authJson);
      const writtenAuthJson = fs.readFileSync(authPath, "utf8");
      if (writtenAuthJson !== input.authJson) throw appError("SWITCH_FAILED");
      if (extractAccountId(writtenAuthJson) !== expectedAuthAccountId) throw appError("AUTH_INVALID");
      await this.options.startCodex();
      await this.record({
        id: eventId,
        accountId: input.accountId,
        previousAccountId: input.previousAccountId,
        startedAt,
        completedAt: Math.floor(Date.now() / 1000),
        status: "completed",
        error: null,
        backupPath
      });
      return { eventId, backupPath };
    } catch (error) {
      await this.record({
        id: eventId,
        accountId: input.accountId,
        previousAccountId: input.previousAccountId,
        startedAt,
        completedAt: Math.floor(Date.now() / 1000),
        status: "failed",
        error: error instanceof Error ? error.message : String(error),
        backupPath
      });
      throw error;
    }
  }

  async rollback(backupPath: string): Promise<void> {
    const authPath = path.join(this.options.codexHome, "auth.json");
    if (!fs.existsSync(backupPath)) throw appError("SWITCH_FAILED");
    fs.copyFileSync(backupPath, authPath);
  }

  private async record(event: SwitchEventRecord): Promise<void> {
    await this.options.recordEvent(event);
  }
}
