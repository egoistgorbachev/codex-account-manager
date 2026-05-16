# Чеклист релиза

## Перед сборкой

- Проверить, что версия совпадает в `package.json`, `package-lock.json` и `src/shared/releaseNotes.ts`.
- Запустить `npm run typecheck`.
- Запустить `npm run test:run`.
- Убедиться, что интерфейс остаётся полностью русским, кроме технических имён `Codex`, `ChatGPT`, `auth.json`, `CODEX_HOME`.

## Сборка

```powershell
npm run build
```

Ожидаемые файлы для версии 1.9.0:

- `release/Codex-Account-Manager-Setup-1.9.0.exe`
- `release/Codex-Account-Manager-1.9.0.exe`
- `release/latest.yml`
- `release/Codex-Account-Manager-Setup-1.9.0.exe.blockmap`
- `release/SHA256SUMS-1.9.0.txt`

## Контрольные суммы

```powershell
Get-ChildItem release -File |
  Where-Object { $_.Name -match '1\.9\.0|latest\.yml|blockmap' } |
  Get-FileHash -Algorithm SHA256 |
  ForEach-Object { "$($_.Hash.ToLower())  $([IO.Path]::GetFileName($_.Path))" } |
  Set-Content release/SHA256SUMS-1.9.0.txt -Encoding ascii
```

## Smoke-проверка

```powershell
npm run smoke
```

## Перед публичной публикацией

- Подключить сертификат подписи Windows и включить `signAndEditExecutable`.
- Включить `verifyUpdateCodeSignature`.
- Настроить `build.publish` или переменную `CAM_UPDATE_FEED_URL`.
- Проверить блок `Диагностика -> Релиз` в собранном приложении.

