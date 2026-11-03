const en = {
  system: "System", back: "Back to application", title: "Lunaris", host: "Tauri host",
  phaseIdle: "Idle", phaseStarting: "Starting", phaseRunning: "Running", phaseFallback: "Recovery", phaseStopped: "Stopped",
  idle: "Ready to start.", starting: "Starting the application.", running: "The kernel is running.",
  fallback: "The application needs attention.", stopped: "The application is stopped.",
  description: "This independent system view stays available when application plugins fail.",
  empty: "No application plugins are configured yet. The host and kernel are ready for the first application module.",
  restart: "Retry application", working: "Working…", plugins: "Plugins", active: "Active", disabled: "Disabled",
  restartRequired: "Cleanup did not finish successfully. Close and restart the application before starting plugins again.",
  kernel: "Kernel", sdk: "SDK", state: "State", version: "Version", resources: "Resources",
  plugin: "Plugin", actions: "Actions", disable: "Disable and retry", enable: "Enable and retry",
  noPlugins: "No plugins registered", diagnostics: "Diagnostics", noDiagnostics: "No failures recorded",
  scope: "Disabling a plugin excludes it from the next kernel instance, including automatic dependency startup. Choices last until this window reloads.",
  origin: "Source", code: "Code", startup: "Startup", runtime: "Runtime", view: "Interface", cleanup: "Cleanup",
  registered: "Registered", resolving: "Resolving", activeState: "Active", stopping: "Stopping", failed: "Failed",
  startingState: "Starting", stoppedState: "Stopped",
  language: "Language", status: "System status", safety: "Recovery handles cooperative failures. A frozen WebView or crashed process requires restarting the application.",
  details: "A failure was detected. Review the plugin state and diagnostics below, then retry or exclude a plugin.",
};
export type MessageKey = keyof typeof en;
export type Translator = (key: MessageKey) => string;
const ru: Record<MessageKey, string> = {
  system: "Система", back: "Вернуться в приложение", title: "Lunaris", host: "Хост Tauri",
  phaseIdle: "Ожидание", phaseStarting: "Запуск", phaseRunning: "Работает", phaseFallback: "Восстановление", phaseStopped: "Остановлено",
  idle: "Готово к запуску.", starting: "Запуск приложения.", running: "Ядро работает.",
  fallback: "Приложению требуется внимание.", stopped: "Приложение остановлено.",
  description: "Этот независимый системный экран остаётся доступным при сбоях плагинов приложения.",
  empty: "Плагины приложения пока не подключены. Хост и ядро готовы к первому модулю приложения.",
  restart: "Повторить запуск", working: "Выполняется…", plugins: "Плагины", active: "Активны", disabled: "Отключены",
  restartRequired: "Очистка завершилась с ошибкой. Закройте и перезапустите приложение перед повторным запуском плагинов.",
  kernel: "Ядро", sdk: "SDK", state: "Состояние", version: "Версия", resources: "Ресурсы",
  plugin: "Плагин", actions: "Действия", disable: "Отключить и повторить", enable: "Включить и повторить",
  noPlugins: "Нет зарегистрированных плагинов", diagnostics: "Диагностика", noDiagnostics: "Ошибок не зафиксировано",
  scope: "Отключённый плагин исключается из следующего экземпляра ядра, в том числе из автоматического запуска зависимостей. Выбор действует до перезагрузки окна.",
  origin: "Источник", code: "Код", startup: "Запуск", runtime: "Выполнение", view: "Интерфейс", cleanup: "Очистка",
  registered: "Зарегистрирован", resolving: "Разрешение зависимостей", activeState: "Активен", stopping: "Остановка", failed: "Ошибка",
  startingState: "Запускается", stoppedState: "Остановлен",
  language: "Язык", status: "Состояние системы", safety: "Восстановление обрабатывает управляемые сбои. При зависании WebView или падении процесса потребуется перезапуск приложения.",
  details: "Обнаружен сбой. Проверьте состояния плагинов и диагностику, затем повторите запуск или исключите плагин.",
};

/** Built-in messages remain available even when a future localization plugin fails. */
export function translator(locale: string): Translator {
  const messages = locale.toLowerCase().startsWith("ru") ? ru : en;
  return key => messages[key];
}
