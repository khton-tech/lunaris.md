# External link provider

Consumes ExternalLinksDriver and Logger; provides ExternalLinks. Requires
links.open. Validates destinations through the SDK URL policy and synchronously
invokes the driver before returning its promise. This keeps platform selection
and system-browser launching out of document plugins. It has no subscriptions.

The browser application registers BrowserLinks; the desktop host injects
TauriLinks. Both are wired into the shared application graph. Test with
npm run links:check. No actual browser windows are opened by automated tests.
