import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { expect, test, _electron as electron, type Page } from "@playwright/test";

function tempUserData(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "cam-smoke-"));
}

async function expectServicesReady(page: Page) {
  const diagnostics = await page.evaluate(() => window.cam!.getDiagnostics());
  expect(diagnostics.startupError).toBeNull();
  await expect.poll(async () => page.evaluate(() => window.cam!.listAccounts().then((accounts) => accounts.length))).toBeGreaterThanOrEqual(0);
}

test("запускает приложение и показывает русскую навигацию", async () => {
  const userDataDir = tempUserData();
  const app = await electron.launch({
    args: ["."],
    env: { ...process.env, CAM_ALLOW_MULTIPLE_INSTANCE: "1", CAM_USER_DATA_DIR: userDataDir, ELECTRON_IS_DEV: "0" }
  });
  try {
    const page = await app.firstWindow();
    await page.waitForLoadState("domcontentloaded");
    const nav = page.getByLabel("Разделы консоли");

    await expect(nav.getByText("Панель", { exact: true })).toBeVisible({ timeout: 15_000 });
    await expect(nav.getByText("Аккаунты", { exact: true })).toBeVisible();
    await expect(nav.getByText("Диагностика", { exact: true })).toBeVisible();
    await expect(nav.getByText("Настройки", { exact: true })).toBeVisible();
    await expectServicesReady(page);
  } finally {
    await app.close();
    fs.rmSync(userDataDir, { recursive: true, force: true });
  }
});

test("показывает интерфейс, если dev-server недоступен", async () => {
  const userDataDir = tempUserData();
  const app = await electron.launch({
    args: ["."],
    env: { ...process.env, CAM_ALLOW_MULTIPLE_INSTANCE: "1", CAM_USER_DATA_DIR: userDataDir, ELECTRON_IS_DEV: "1" }
  });
  try {
    const page = await app.firstWindow();
    const nav = page.getByLabel("Разделы консоли");

    await expect(nav.getByText("Панель", { exact: true })).toBeVisible({ timeout: 15_000 });
    await expect(nav.getByText("Диагностика", { exact: true })).toBeVisible();
    await expectServicesReady(page);
  } finally {
    await app.close();
    fs.rmSync(userDataDir, { recursive: true, force: true });
  }
});

test("собранное приложение запускает реальные сервисы без startupError", async () => {
  const executablePath = path.join(process.cwd(), "release", "win-unpacked", "Codex Account Manager.exe");
  test.skip(!fs.existsSync(executablePath), "Сначала нужно выполнить npm run build или npm run build:dir");

  const userDataDir = tempUserData();
  const app = await electron.launch({
    executablePath,
    env: { ...process.env, CAM_ALLOW_MULTIPLE_INSTANCE: "1", CAM_USER_DATA_DIR: userDataDir }
  });
  try {
    const page = await app.firstWindow();
    await page.waitForLoadState("domcontentloaded");
    await expect(page.getByLabel("Разделы консоли").getByText("Аккаунты", { exact: true })).toBeVisible({ timeout: 15_000 });
    await expectServicesReady(page);
  } finally {
    await app.close();
    fs.rmSync(userDataDir, { recursive: true, force: true });
  }
});

test("собранное приложение запускает реальный сценарий добавления аккаунта", async () => {
  test.setTimeout(70_000);
  const executablePath = path.join(process.cwd(), "release", "win-unpacked", "Codex Account Manager.exe");
  test.skip(!fs.existsSync(executablePath), "Сначала нужно выполнить npm run build или npm run build:dir");

  const userDataDir = tempUserData();
  const app = await electron.launch({
    executablePath,
    env: {
      ...process.env,
      CAM_ALLOW_MULTIPLE_INSTANCE: "1",
      CAM_DISABLE_EXTERNAL_OPEN: "1",
      CAM_USER_DATA_DIR: userDataDir
    }
  });
  try {
    const page = await app.firstWindow();
    await page.waitForLoadState("domcontentloaded");
    await expect(page.getByLabel("Разделы консоли").getByText("Панель", { exact: true })).toBeVisible({ timeout: 15_000 });
    await expectServicesReady(page);

    const diagnostics = await page.evaluate(() => window.cam!.getDiagnostics());
    test.skip(!diagnostics.codexPath, "Codex CLI не найден на этой машине");

    const login = await page.evaluate(() => window.cam!.startLogin("chatgptDeviceCode"));
    expect(login.type).toBe("chatgptDeviceCode");
    expect(login.loginId.length).toBeGreaterThan(0);
    expect(login.verificationUrl).toContain("http");
    expect(login.userCode?.length).toBeGreaterThan(0);
  } finally {
    await app.close();
    fs.rmSync(userDataDir, { recursive: true, force: true });
  }
});
