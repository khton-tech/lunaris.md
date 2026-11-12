# External links SDK

ExternalLinks.open(url) returns a structured result and requires links.open.
ExternalLinksDriver implements the same API with links.native provision permission.
The provider validates and delegates without awaiting before driver invocation,
preserving the browser user-activation stack. Only HTTP(S), mailto and tel URLs
without embedded credentials/control characters are accepted. Native file,
JavaScript, data and arbitrary application schemes are rejected.

Browser and Tauri drivers are replaceable at application composition. Consumers
never import window APIs or Tauri modules. No events are published.
