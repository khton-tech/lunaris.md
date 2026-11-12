# Tauri link driver

createTauriLinks(open?) provides ExternalLinksDriver and consumes Logger.
Its open(url) method validates the SDK URL policy and delegates to the official
Tauri opener plugin's openUrl. The system's default browser/application owns the
external destination; the WebView is never navigated. Failures retain the original
error in logging and return a structured failure. No events are subscribed to.

The desktop host injects this driver into shared application composition,
initializes tauri-plugin-opener 2.7.3, and grants only web/mail/telephone URL
opening to the local main window. Restart the desktop development process after
changing this native integration. npm run links:check exercises an injected port;
cargo check validates native registration and capabilities. Actual system-browser
launching is pending manual acceptance; tests never launch external programs.

Reference: https://v2.tauri.app/plugin/opener/
