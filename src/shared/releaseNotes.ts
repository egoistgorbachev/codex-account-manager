export const appVersion = "1.8.0";

export interface ReleaseNoteEntry {
  title: string;
  body: string;
}

export const releaseNotes: ReleaseNoteEntry[] = [
  {
    title: "GitHub Release канал",
    body: "Сборка теперь содержит GitHub publish-конфиг и генерирует update manifest для автоматического обновления через GitHub Releases."
  },
  {
    title: "Автообновление приложения",
    body: "Установленная версия сама проверяет обновления после запуска, а кнопка в диагностике запускает проверку вручную."
  },
  {
    title: "Профессиональная публикация",
    body: "В релиз добавляются installer, portable, latest.yml, blockmap и SHA256SUMS, чтобы обновления и проверка целостности работали из одного источника."
  },
  {
    title: "Русская инструкция",
    body: "README, release checklist и заметки релиза обновлены для понятной установки, обновления и проверки файлов."
  }
];
