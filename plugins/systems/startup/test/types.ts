import { createStartupProvider } from "@lunaris/startup-provider";
const controller = createStartupProvider();
controller.update({ sequence: 1, state: "loading", stage: "activation" });
// @ts-expect-error Trusted ingress accepts snapshots, not raw errors.
controller.update({ sequence: 2, state: "failed", stage: "failed", error: new Error() });
