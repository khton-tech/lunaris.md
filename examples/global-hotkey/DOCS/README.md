# Global Hotkey

This Windows x64 example registers **Ctrl+Alt+Shift+H**, logs the press and emits
the public SDK event example.global-hotkey-pressed@1.0.0 so another plugin can
react. The separate program in native/src/main.rs implements the Windows
RegisterHotKey message loop. Lunaris provides the same NativeProcesses API
to plugins and does not know about the shortcut or interpret its events.

The plugin requires Logger and NativeProcesses from the SDK and provides
GlobalHotkeyPressed from contract.ts. Other plugins import the token from their
shared contract dependency, declare it in requires and subscribe with
ctx.events.on(GlobalHotkeyPressed, listener). The payload contains the shortcut
string Ctrl+Alt+Shift+H.

## Build and install

Run **npm run lime:hotkey** from this repository on Windows with the Rust MSVC
and Node toolchains installed. It creates an external authoring project from
the packed SDK and writes **dist/lime-examples/global-hotkey.lup**.

An independent author can reproduce the example from an extracted Lunaris SDK.
Generate a project with ID example.global-hotkey, add the @lunaris/execution
contract and install dependencies. Copy manifest.json to the project root,
plugin.ts and contract.ts to src, and the native directory beside src.
From that directory run these commands in PowerShell.

~~~powershell
cargo build --locked --release --target x86_64-pc-windows-msvc --manifest-path native/Cargo.toml
New-Item -ItemType Directory -Force assets/bin
Copy-Item native/target/x86_64-pc-windows-msvc/release/hotkey.exe assets/bin/hotkey.exe
npm run check
npm run pack
~~~

The LUP contains the bundled JavaScript and the author's executable. The
activation opens only that package's assets/bin/hotkey.exe through
NativeProcesses.start. Its output is line based. The ready line confirms the
registration, pressed announces a hotkey and error:N reports a Windows error.
The helper unregisters on stop or stdin closure. The process also belongs to the
plugin's activation scope, so disabling the plugin or closing the Vault ends it.
If another program owns the combination, activation reports the Windows failure.

## Verification

The build script installs the resulting LUP in the shared application runtime
fixture. It compares the packed executable with the bytes delivered to the
standard process driver, runs the executable in probe mode, checks delivery to
a second plugin and checks that disable ends the process. Probe mode uses
stdin and stdout and never registers a system hotkey.

For native acceptance, open a scratch Vault in the Windows application, install
the LUP and check the Global hotkey registered record in the developer log.
Focus a different Windows application and press Ctrl+Alt+Shift+H. The Lunaris
developer log should show Global hotkey pressed. Disable the plugin and press
the combination again. The log should have no new press record. Re-enable the
plugin and verify it can register the same shortcut again.
