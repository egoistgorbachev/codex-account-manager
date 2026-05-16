import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { EventEmitter } from "node:events";
import fs from "node:fs";
import path from "node:path";
import type { PlanType, RateLimitSnapshot } from "../shared/types.js";

type RpcResponse<T> = { id: number; result?: T; error?: { code: number; message: string; data?: unknown } };
type Notification = { method: string; params?: unknown };

export type CodexAccount =
  | { type: "apiKey" }
  | { type: "chatgpt"; email: string; planType: PlanType }
  | { type: "amazonBedrock" };

export interface AccountReadResponse {
  account: CodexAccount | null;
  requiresOpenaiAuth: boolean;
}

export type LoginResponse =
  | { type: "apiKey" }
  | { type: "chatgpt"; loginId: string; authUrl: string }
  | { type: "chatgptDeviceCode"; loginId: string; verificationUrl: string; userCode: string }
  | { type: "chatgptAuthTokens" };

export interface RateLimitsResponse {
  rateLimits: RateLimitSnapshot;
  rateLimitsByLimitId: Record<string, RateLimitSnapshot | undefined> | null;
}

interface PendingCall {
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
  timer: NodeJS.Timeout;
}

export class CodexRpcClient extends EventEmitter {
  private child: ChildProcessWithoutNullStreams | null = null;
  private nextId = 1;
  private readonly pending = new Map<number, PendingCall>();
  private buffer = "";
  private initialized = false;

  constructor(private readonly codexHome: string, private readonly codexPath = "codex") {
    super();
  }

  async start(): Promise<void> {
    if (this.child) return;
    fs.mkdirSync(this.codexHome, { recursive: true });

    this.child = spawn(this.codexPath, ["app-server", "--listen", "stdio://"], {
      env: { ...process.env, CODEX_HOME: this.codexHome },
      windowsHide: true,
      stdio: "pipe"
    });

    this.child.on("error", (error) => {
      this.rejectAllPending(error);
      this.child = null;
      this.initialized = false;
      this.emit("stderr", `Failed to start Codex app-server with "${this.codexPath}": ${error.message}`);
      this.emit("exit", { code: null, signal: "spawn-error" });
    });
    this.child.stdout.setEncoding("utf8");
    this.child.stderr.setEncoding("utf8");
    this.child.stdout.on("data", (chunk: string) => this.onStdout(chunk));
    this.child.stderr.on("data", (chunk: string) => this.emit("stderr", chunk));
    this.child.on("exit", (code, signal) => {
      const error = new Error(`Codex app-server exited (${code ?? signal ?? "unknown"})`);
      this.rejectAllPending(error);
      this.child = null;
      this.initialized = false;
      this.emit("exit", { code, signal });
    });

    await this.request("initialize", {
      clientInfo: {
        name: "egoist_codex_account_manager",
        title: "Codex Account Manager",
        version: "0.1.0"
      },
      capabilities: {
        optOutNotificationMethods: [
          "thread/started",
          "turn/started",
          "item/agentMessage/delta",
          "command/exec/outputDelta"
        ]
      }
    });
    this.sendNotification("initialized", {});
    this.initialized = true;
  }

  async stop(): Promise<void> {
    this.rejectAllPending(new Error("Codex app-server stopped"));
    const child = this.child;
    if (!child) return;
    await new Promise<void>((resolve) => {
      const timer = setTimeout(resolve, 2500);
      child.once("exit", () => {
        clearTimeout(timer);
        resolve();
      });
      child.kill();
    });
    this.child = null;
    this.initialized = false;
  }

  async readAccount(refreshToken = false): Promise<AccountReadResponse> {
    await this.start();
    return this.request<AccountReadResponse>("account/read", { refreshToken });
  }

  async startLogin(type: "chatgpt" | "chatgptDeviceCode"): Promise<LoginResponse> {
    await this.start();
    return this.request<LoginResponse>("account/login/start", type === "chatgpt" ? { type: "chatgpt" } : { type: "chatgptDeviceCode" });
  }

  async readRateLimits(): Promise<RateLimitsResponse> {
    await this.start();
    return this.request<RateLimitsResponse>("account/rateLimits/read", undefined);
  }

  private request<T>(method: string, params: unknown, timeoutMs = 45_000): Promise<T> {
    const child = this.child;
    if (!child) return Promise.reject(new Error("Codex app-server is not running"));
    const id = this.nextId++;
    const payload = params === undefined ? { method, id } : { method, id, params };
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`Codex request timed out: ${method}`));
      }, timeoutMs);
      this.pending.set(id, {
        resolve: (value) => resolve(value as T),
        reject,
        timer
      });
      child.stdin.write(`${JSON.stringify(payload)}\n`, (error) => {
        if (!error) return;
        clearTimeout(timer);
        this.pending.delete(id);
        reject(error);
      });
    });
  }

  private rejectAllPending(error: Error): void {
    for (const [id, pending] of this.pending) {
      clearTimeout(pending.timer);
      pending.reject(error);
      this.pending.delete(id);
    }
  }

  private sendNotification(method: string, params: unknown): void {
    this.child?.stdin.write(`${JSON.stringify({ method, params })}\n`);
  }

  private onStdout(chunk: string): void {
    this.buffer += chunk;
    let newline = this.buffer.indexOf("\n");
    while (newline >= 0) {
      const line = this.buffer.slice(0, newline).trim();
      this.buffer = this.buffer.slice(newline + 1);
      if (line) this.onMessage(line);
      newline = this.buffer.indexOf("\n");
    }
  }

  private onMessage(line: string): void {
    let message: RpcResponse<unknown> | Notification;
    try {
      message = JSON.parse(line) as RpcResponse<unknown> | Notification;
    } catch {
      this.emit("stderr", `Invalid JSON from Codex app-server: ${line}`);
      return;
    }

    if ("id" in message && typeof message.id === "number") {
      const pending = this.pending.get(message.id);
      if (!pending) {
        this.respondToServerRequest(message.id, message);
        return;
      }
      clearTimeout(pending.timer);
      this.pending.delete(message.id);
      if (message.error) pending.reject(new Error(message.error.message));
      else pending.resolve(message.result);
      return;
    }

    if ("method" in message) {
      this.emit(message.method, message.params);
      this.emit("notification", message);
    }
  }

  private respondToServerRequest(id: number, message: unknown): void {
    const method = (message as { method?: string }).method;
    if (!method) return;
    this.child?.stdin.write(
      `${JSON.stringify({
        id,
        error: {
          code: -32601,
          message: `Client-side server request is not supported by Codex Account Manager: ${method}`
        }
      })}\n`
    );
  }
}

export function getAuthFilePath(codexHome: string): string {
  return path.join(codexHome, "auth.json");
}

export function selectBestRateLimit(response: RateLimitsResponse): RateLimitSnapshot {
  const byCodex = response.rateLimitsByLimitId?.codex;
  return byCodex ?? response.rateLimits;
}

export function classifyRateLimit(snapshot: RateLimitSnapshot): { status: "active" | "near_limit" | "limited"; reason: string | null } {
  if (snapshot.rateLimitReachedType) return { status: "limited", reason: snapshot.rateLimitReachedType };
  const used = Math.max(snapshot.primary?.usedPercent ?? 0, snapshot.secondary?.usedPercent ?? 0);
  if (used >= 90) return { status: "near_limit", reason: "Usage is above 90%" };
  return { status: "active", reason: null };
}
