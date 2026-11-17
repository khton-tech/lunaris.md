# Drema

This independent plugin appends an animated sleeping cat to the standard status
bar's existing document context. It consumes Logger and
`api:lunaris.application-dom@^1.0.0` from `@lunaris/components` with `ui.dom`.
It provides no API and subscribes to no SDK events.

The application still owns the status bar, including its placement, surface,
spacing and controls. Drema owns the image and its package asset. It discovers
the existing Mantine status bar through a CSS selector and adds an image as an
existing group's child. It creates no slot, replaces no component role and
changes no status bar styling. The asset honors reduced motion and is decorative
to assistive technology. A DOM observer follows status bar replacements.
Disabling Drema disconnects the observer and removes its image.

For a standalone build, generate a project with ID `example.drema` using the
plugin SDK CLI, add `@lunaris/components`, then copy this example's manifest,
entry and assets into the project. Run `npm run check` and `npm run pack`.
In the source checkout, build the contract with
`npm run build --workspace @lunaris/components` and run
`node tools/scripts/lime-drema.mjs` to produce `dist/lime-examples/drema.lup`.

Open a Vault and install the package through Settings / Third-party plugins.
Open a note, inspect the existing bar and disable the package. The image should
appear beside the filename and disappear on disable while leaving the bar
intact. Check a narrow window, a theme switch and the OS reduced-motion setting
in the desktop app. The DOM integration test checks attachment, bar replacement
and cleanup. Native geometry and animation remain manual checks.

The selector tracks the standard Mantine frontend implementation and may need
adjustment if a different renderer replaces it. `ApplicationDom` remains the
same contract in that case.
