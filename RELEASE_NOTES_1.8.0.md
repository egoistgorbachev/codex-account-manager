# Codex Account Manager 1.8.0

## Главное

Версия 1.8.0 переводит проект из локальной сборки в нормальный GitHub Release-канал: установщик, portable-сборка, `latest.yml`, blockmap и checksums публикуются вместе, а установленное приложение может проверять обновления через GitHub Releases.

## Что нового

- Подключён `electron-updater`.
- Настроен `electron-builder` GitHub provider: `egoistgorbachev/codex-account-manager`.
- Приложение автоматически проверяет обновления после запуска установленной версии.
- Кнопка `Диагностика -> Обновления` запускает ручную проверку GitHub Release feed.
- Релизная проверка теперь видит GitHub publish-конфиг и перестаёт считать feed полностью отсутствующим.
- Обновлены русские инструкции по установке, обновлению и проверке SHA256.

## Как установить

1. Скачай `Codex-Account-Manager-Setup-1.8.0.exe`.
2. Запусти установщик.
3. Если Windows SmartScreen покажет предупреждение, проверь SHA256 из `SHA256SUMS-1.8.0.txt`.
4. После установки приложение будет проверять новые GitHub Releases автоматически.

## Как обновляться дальше

- Установленная версия проверяет обновления после запуска.
- Ручная проверка находится в разделе `Диагностика -> Обновления`.
- Когда новый релиз будет опубликован на GitHub, приложение скачает его через `latest.yml`.

## Файлы релиза

- `Codex-Account-Manager-Setup-1.8.0.exe` - обычный установщик Windows.
- `Codex-Account-Manager-1.8.0.exe` - portable-сборка.
- `latest.yml` - manifest для автообновления.
- `Codex-Account-Manager-Setup-1.8.0.exe.blockmap` - blockmap для дифференциальной загрузки.
- `SHA256SUMS-1.8.0.txt` - контрольные суммы.

## Проверка

- `npm run typecheck`
- `npm run test:run`
- `npm run build`
- `npm run smoke`

## Важно

Сборка остаётся unsigned до подключения коммерческого Windows code-signing сертификата. Автообновление через GitHub Release feed настроено, но SmartScreen может показывать предупреждение для неподписанного EXE.
