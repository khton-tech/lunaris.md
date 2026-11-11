# Deletion Particles

This third-party example renders scattering particles when visible text is
deleted in the Markdown editor. It requires Logger and EditorEffects.
The activation signal owns the effect registration. The editor owns and clears
its overlay. The plugin contributes no settings, files or persistent data.

From a generated external project, run `npm run core -- add-contract @lunaris/editor`
and install dependencies. Replace the generated manifest with `manifest.json`
from this directory and copy `plugin.ts` to `src/plugin.ts`. Run
`npm run check` and `npm run pack`. The repository command
`npm run lime:particles` rehearses those steps with the packed distribution
and writes `dist/lime-examples/deletion-particles.lup`.

In a build with EditorEffects, open a test Vault and install the LUP through
Settings / Third-party plugins. Open a Markdown note, type a line and press
Backspace or Delete. Repeat with selected text. Disable the plugin and repeat.
The particles should stop immediately on disable. Enable the OS reduced-motion
setting to check that new particles are skipped. Use a scratch note.

The editor integration test executes this example in QuickJS and verifies
particle creation and activation cleanup using simulated text geometry.
Native positioning and animation appearance require visual verification.
