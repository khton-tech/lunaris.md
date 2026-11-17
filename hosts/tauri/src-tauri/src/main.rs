#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use lunaris_filesystem_native::{Backend, Change, ChangeCallback, Request, SharedBackend};
use std::sync::{Arc, Mutex};
use tauri::Manager;
mod desktop_background;
mod external_windows;
mod processes;

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

#[tauri::command]
async fn credentials_request(operation: String, value: serde_json::Value) -> serde_json::Value {
    tauri::async_runtime::spawn_blocking(move || lunaris_credentials_native::dispatch(&operation, value)).await
        .unwrap_or_else(|_| serde_json::json!({"ok":false,"error":{"code":"IO_ERROR","message":"Secure session worker failed."}}))
}

#[tauri::command]
async fn native_process_request(
    request: processes::Request,
    channel: tauri::ipc::Channel<processes::Event>,
    app: tauri::AppHandle,
) -> Result<Option<u32>, String> {
    let notify: processes::Notify = Box::new(move |event| channel.send(event).is_ok());
    tauri::async_runtime::spawn_blocking(move || {
        app.state::<processes::Registry>()
            .dispatch(request, Some(notify))
    })
    .await
    .map_err(|error| error.to_string())?
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            app.manage(processes::Registry::default());
            app.manage(desktop_background::Background::default());
            app.manage(Arc::new(Mutex::new(Backend::with_config_directory(
                app.path().app_config_dir()?,
            ))));
            external_windows::setup(app)?;
            Ok(())
        })
        .on_window_event(external_windows::on_window_event)
        .invoke_handler(tauri::generate_handler![
            filesystem_request,
            credentials_request,
            native_process_request,
            external_windows::external_window_request,
            desktop_background::desktop_background_request
        ])
        .run(tauri::generate_context!())
        .expect("Failed to run the Lunaris desktop host");
}
