# Tauri link driver

createTauriLinks(open?) provides ExternalLinksDriver and consumes Logger.
Its open(url) method validates the SDK URL policy and delegates to the official
Tauri opener plugin's openUrl. The system's default browser/application owns the
external destination; the WebView is never navigated. Failures retain the original
error in logging and return a structured failure. No events are subscribed to.

The desktop host injects this driver into shared application composition,
initializes tauri-plugin-opener 2.7.3, and grants only web/mail/telephone URL
opening to the local main window. The `external-links` capability is explicitly
enabled in `tauri.conf.json` alongside the other main-window capabilities. Rebuild
the executable after native capability changes. The desktop configuration test
checks registration and allowed schemes. Actual system-browser launching remains
part of Windows acceptance; tests never launch external programs.

Reference: https://v2.tauri.app/plugin/opener/
