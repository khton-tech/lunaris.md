/** Host-visible lifecycle vocabulary; runtime operations arrive in P3. */
export type PluginState =
  | "registered"
  | "resolving"
  | "starting"
  | "active"
  | "stopping"
  | "stopped"
  | "failed";
