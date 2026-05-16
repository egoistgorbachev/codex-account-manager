import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { safeStorage } from "electron";

const KEY_FILE = "vault.key";
const FALLBACK_KEY_FILE = "vault.local.key";

function atomicWrite(filePath: string, data: Buffer | string): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const tmp = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tmp, data, { mode: 0o600 });
  fs.renameSync(tmp, filePath);
}

function parseHexKey(value: string): Buffer | null {
  const normalized = value.trim();
  return /^[a-f0-9]{64}$/i.test(normalized) ? Buffer.from(normalized, "hex") : null;
}

function readPlaintextKey(filePath: string): Buffer | null {
  if (!fs.existsSync(filePath)) return null;
  try {
    return parseHexKey(fs.readFileSync(filePath, "utf8")) ?? null;
  } catch {
    return null;
  }
}

function readSafeStorageKey(filePath: string): Buffer | null {
  if (!safeStorage?.isEncryptionAvailable() || !fs.existsSync(filePath)) return null;
  try {
    return parseHexKey(safeStorage.decryptString(fs.readFileSync(filePath))) ?? null;
  } catch {
    return null;
  }
}

function readOrCreateMasterKey(appDataDir: string): Buffer {
  const keyPath = path.join(appDataDir, KEY_FILE);
  const fallbackKeyPath = path.join(appDataDir, FALLBACK_KEY_FILE);

  const encryptedKey = readSafeStorageKey(keyPath);
  if (encryptedKey) return encryptedKey;

  const plaintextKey = readPlaintextKey(keyPath);
  if (plaintextKey) return plaintextKey;

  const fallbackKey = readPlaintextKey(fallbackKeyPath);
  if (fallbackKey) return fallbackKey;

  const key = crypto.randomBytes(32);
  if (fs.existsSync(keyPath)) {
    atomicWrite(fallbackKeyPath, key.toString("hex"));
  } else if (safeStorage?.isEncryptionAvailable()) {
    atomicWrite(keyPath, safeStorage.encryptString(key.toString("hex")));
  } else {
    atomicWrite(keyPath, key.toString("hex"));
  }
  return key;
}

export class Vault {
  private readonly key: Buffer;

  constructor(appDataDir: string) {
    this.key = readOrCreateMasterKey(appDataDir);
  }

  encryptUtf8(value: string): string {
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv("aes-256-gcm", this.key, iv);
    const ciphertext = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
    const tag = cipher.getAuthTag();
    return `cam_v1_${Buffer.concat([iv, tag, ciphertext]).toString("base64")}`;
  }

  decryptUtf8(payload: string): string {
    if (!payload.startsWith("cam_v1_")) {
      throw new Error("Unsupported encrypted payload format");
    }
    const raw = Buffer.from(payload.slice("cam_v1_".length), "base64");
    const iv = raw.subarray(0, 12);
    const tag = raw.subarray(12, 28);
    const ciphertext = raw.subarray(28);
    const decipher = crypto.createDecipheriv("aes-256-gcm", this.key, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
  }
}

export function maskSecret(value: string): string {
  if (value.length <= 12) return "[secret]";
  return `${value.slice(0, 4)}...${value.slice(-4)}`;
}
