# First installable TypeScript plugin

Extract the Lunaris Plugin SDK archive. Use Node >=26.13.0 <27 and npm >=11 <12.
A first install needs npm registry access or the locked dependencies in the
local cache. The archive and generated project supply the compiler and CLI.

From the extracted toolchain root:

```sh
npm ci --ignore-scripts
npm exec -- lunaris-core create-plugin ./projects/my-plugin --id local.my-plugin
cd projects/my-plugin
npm install --ignore-scripts
npm run check
npm test
npm run pack
npm run core -- inspect-package ./local.my-plugin-0.1.0.lup
```

Open a Vault in Lunaris, then choose Settings / Third-party plugins / Add plugin
and select `local.my-plugin-0.1.0.lup`. Confirm to run it, or choose Install
disabled to keep it inactive. The generated plugin logs its readiness through
Logger. Disable it in Settings to end its activation.

Edit `src/plugin.ts` and declare all used or provided contracts in
`manifest.json`. The scaffold includes Logger, a focused test and vendored SDK
tarballs. Increase the plugin manifest version when packaging an update for an
already installed ID. Use [the authoring guide](../guides/plugin-authoring.md)
for contract discovery, provider selection and the next development steps.
