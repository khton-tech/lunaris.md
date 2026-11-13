fn main() {
    tauri_build::try_build(tauri_build::Attributes::new().app_manifest(
        tauri_build::AppManifest::new().commands(&["filesystem_request", "credentials_request"]),
    ))
    .expect("Failed to build the host permission manifest");
}
