# Lunaris plugin project

Read `manifest.json`, `src/plugin.ts` and [the plugin README](DOCS/README.md) first. Use the [bundled authoring guide](DOCS/authoring.md) and [recipes](DOCS/plugin-recipes.md) as needed.

- Use public SDK exports. Confirm the token ID, version and method signature in the installed package declarations. Discover packages with `npm run core -- contracts`. Add a missing public package with `npm run core -- add-contract @lunaris/<package>` followed by `npm install --ignore-scripts`. Keep `tools/vendor/` archives intact.
- Declare Logger as a required API. Use `ctx.use(Logger)` with `ctx.pluginId` as the source. Scope subscriptions, views, mutations and helpers to the activation.
- Keep plugin contract documentation and developer instructions in English. Localize visible UI strings. Use shared component roles for product controls and `ApplicationDom` for changes to existing nodes.
- Use `npm run check` and relevant tests for edits. For a release, run `npm run pack` and inspect the resulting `.lup` before handing it to the developer. Document manual application checks instead of automating desktop controls.
- Use the `lunaris-plugin-development` or `lunaris-plugin-review` skill under `.agents/skills/` when it fits the task.
