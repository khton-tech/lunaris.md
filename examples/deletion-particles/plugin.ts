import { EditorEffects } from "@lunaris/editor";
import type { EditorParticle } from "@lunaris/editor";
import { Logger } from "@lunaris/logging";
import { definePlugin } from "@lunaris/sdk";
import manifest from "../manifest.json" with { type: "json" };

export default definePlugin({
  manifest,
  activate(ctx) {
    const logger = ctx.use(Logger);
    const result = ctx.use(EditorEffects).register({
      id: ctx.pluginId + ".scatter",
      onDelete(samples) {
        const particles: EditorParticle[] = [];
        samples.forEach(({ width }, sample) => {
          const count = width >= 7 ? 4 : 3;
          for (let i = 0; i < count; i++) {
            const angle = Math.random() * Math.PI * 2;
            const distance = 10 + Math.random() * 22;
            particles.push({
              sample, x: 0.2 + Math.random() * 0.6, y: 0.25 + Math.random() * 0.5,
              dx: Math.cos(angle) * distance, dy: Math.sin(angle) * distance - 7,
              size: 1.5 + Math.random() * 2.5, durationMs: 240 + Math.random() * 200,
            });
          }
        });
        return particles;
      },
    }, ctx.signal);
    if (!result.ok) {
      logger.error(ctx.pluginId, "Cannot register deletion particles", { error: result.error });
      throw new Error("Cannot register deletion particles", { cause: result.error });
    }
    logger.info(ctx.pluginId, "Deletion particles ready");
  },
});
