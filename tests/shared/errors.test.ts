import { describe, expect, it } from "vitest";
import { AppError, appError, toSafeError } from "../../src/shared/errors";

describe("safe app errors", () => {
  it("returns stable code and Russian message without leaking technical details", () => {
    const rawDetail = "raw token abc123 in C:\\Users\\Secret\\auth.json";
    const error = appError("AUTH_INVALID", rawDetail);
    const safe = toSafeError(error);

    expect(error.message).toBe("Файл авторизации поврежден или не подходит для этого аккаунта.");
    expect(error.detail).toBe(rawDetail);
    expect(error.message).not.toContain("abc123");
    expect(error.message).not.toContain("C:\\");
    expect(safe.code).toBe("AUTH_INVALID");
    expect(safe.message).toBe("Файл авторизации поврежден или не подходит для этого аккаунта.");
    expect(safe.message).not.toContain("abc123");
    expect(safe.message).not.toContain("C:\\");
  });

  it("keeps direct AppError messages safe and stores raw detail separately", () => {
    const rawDetail = "raw token abc123 in C:\\Users\\Secret\\auth.json";
    const error = new AppError("AUTH_INVALID", rawDetail);

    expect(error.message).toBe("Файл авторизации поврежден или не подходит для этого аккаунта.");
    expect(error.detail).toBe(rawDetail);
    expect(error.message).not.toContain("abc123");
    expect(error.message).not.toContain("C:\\");
  });
});
