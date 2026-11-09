import { russian } from "./locales/ru.js";
/** Consumer-owned English-first copy; every visible string goes through localization. */
export const catalogs = { en: {
  server: "Sign in to server",
  logo: "Lunaris.md", recent: "Recent vaults", empty: "No recent vaults", create: "Create vault", select: "Select vault",
  parentFolder: "Parent folder", folder: "Folder", folderPlaceholder: "Choose a folder", browse: "Browse", name: "Vault name", next: "Next", retry: "Retry",
  opened: "{name}", working: "Opening vault…", choosing: "Choosing a folder…", refreshing: "Loading recent vaults…",
  exists: "A folder with this name already exists. Choose another name or use Select vault.", invalidName: "Enter a valid folder name.",
  error: "The operation failed. Try again.", historyError: "Could not load recent vaults.",
  missing: "This folder is unavailable. Choose another folder.", denied: "Access to this folder was denied.",
  config: "The vault configuration could not be prepared.", conflict: "The folder or configuration changed. Try again.",
  busy: "Another operation is in progress. Try again.", unsupported: "Folder selection is unavailable on this platform.",
}, ru: russian };
