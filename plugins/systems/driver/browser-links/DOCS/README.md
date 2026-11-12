# Browser link driver

createBrowserLinks(port?) provides ExternalLinksDriver and requires Logger.
The platform port defaults to the current window. open(url) validates the SDK
URL policy, then invokes window.open in the current user gesture with _blank and
noopener,noreferrer. It never navigates the editor window or exposes its opener.

The driver logs dispatch, not confirmed navigation: browsers may block popups,
and noopener deliberately does not provide a reliable child-window handle.
No events or ongoing resources are owned. The application host supplies this
replaceable driver by default. Verification: npm run links:check; native browser
popup behavior remains manual.
