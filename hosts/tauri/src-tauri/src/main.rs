#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use lunaris_filesystem_native::{Backend, Change, ChangeCallback, Request, SharedBackend};
use std::sync::{Arc, Mutex};
use tauri::Manager;

#[tauri::command]
async fn filesystem_request(
    session_id: String,
    request: Request,
    on_change: tauri::ipc::Channel<Change>,
    state: tauri::State<'_, SharedBackend>,
) -> Result<serde_json::Value, ()> {
    let backend = state.inner().clone();
    let callback: ChangeCallback = Arc::new(move |change| {
        let _ = on_change.send(change);
    });
    Ok(
        match tauri::async_runtime::spawn_blocking(move || {
            lunaris_filesystem_native::dispatch(backend, session_id, request, Some(callback))
        })
        .await
        {
            Ok(Ok(value)) => serde_json::json!({ "ok": true, "value": value }),
            Ok(Err(error)) => serde_json::json!({ "ok": false, "error": error }),
            Err(_) => {
                serde_json::json!({ "ok": false, "error": { "code": "IO_ERROR", "message": "The native filesystem worker failed." } })
            }
        },
    )
}

fn main() {
    tauri::Builder::default()
        .setup(|app| {
            app.manage(Arc::new(Mutex::new(Backend::with_config_directory(
                app.path().app_config_dir()?,
            ))));
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![filesystem_request])
        .run(tauri::generate_context!())
        .expect("Failed to run the Lunaris desktop host");
}
