use serde::Deserialize;
use std::sync::Mutex;
use tauri::{
    menu::{Menu, MenuItem},
    tray::{TrayIcon, TrayIconBuilder},
    AppHandle, Emitter, Manager, State, WebviewWindow, Wry,
};

const OPEN: &str = "lunaris-tray-open";
const QUIT: &str = "lunaris-tray-quit";

#[derive(Deserialize)]
pub struct Labels {
    open: String,
    quit: String,
}

#[derive(Deserialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum Request {
    Configure { enabled: bool, labels: Labels },
    Hide,
    Restore,
    Exit,
}

struct Tray {
    icon: TrayIcon<Wry>,
    open: MenuItem<Wry>,
    quit: MenuItem<Wry>,
}

#[derive(Default)]
struct Policy {
    tray: Option<Tray>,
    enabled: bool,
}

#[derive(Default)]
pub struct Background(Mutex<Policy>);

fn restore(window: &WebviewWindow) -> tauri::Result<()> {
    window.show()?;
    window.unminimize()?;
    window.set_focus()
}

fn create_tray(app: &AppHandle, labels: Labels) -> tauri::Result<Tray> {
    let image = app
        .default_window_icon()
        .ok_or_else(|| tauri::Error::AssetNotFound("Lunaris tray icon".into()))?;
    let open = MenuItem::with_id(app, OPEN, labels.open, true, None::<&str>)?;
    let quit = MenuItem::with_id(app, QUIT, labels.quit, true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&open, &quit])?;
    let icon = TrayIconBuilder::with_id("lunaris-background")
        .icon(image.clone())
        .menu(&menu)
        .tooltip("Lunaris")
        .on_menu_event(|app, event| match event.id().as_ref() {
            OPEN => {
                if let Some(window) = app.get_webview_window("main") {
                    let _ = restore(&window);
                }
            }
            QUIT => {
                let _ = app.emit_to("main", "lunaris://desktop-quit", ());
            }
            _ => {}
        })
        .build(app)?;
    Ok(Tray { icon, open, quit })
}

fn configure(
    policy: &mut Policy,
    window: &WebviewWindow,
    enabled: bool,
    labels: Labels,
) -> tauri::Result<()> {
    if enabled {
        if let Some(tray) = &policy.tray {
            tray.open.set_text(labels.open)?;
            tray.quit.set_text(labels.quit)?;
            tray.icon.set_visible(true)?;
        } else {
            policy.tray = Some(create_tray(window.app_handle(), labels)?);
        }
    } else if policy.enabled {
        // Preserve a reachable application when background mode is disabled.
        if !window.is_visible()? {
            restore(window)?;
        }
        if let Some(tray) = &policy.tray {
            tray.icon.set_visible(false)?;
        }
    }
    policy.enabled = enabled;
    Ok(())
}

#[tauri::command]
pub async fn desktop_background_request(
    window: WebviewWindow,
    state: State<'_, Background>,
    request: Request,
) -> Result<bool, String> {
    if window.label() != "main" {
        return Err("Background policy is managed by the main desktop window.".into());
    }
    if matches!(request, Request::Exit) {
        window.app_handle().exit(0);
        return Ok(true);
    }
    let mut policy = state.0.lock().map_err(|error| error.to_string())?;
    match request {
        Request::Configure { enabled, labels } => {
            configure(&mut policy, &window, enabled, labels).map_err(|error| error.to_string())?;
            Ok(policy.enabled)
        }
        Request::Hide if policy.enabled => {
            window.hide().map_err(|error| error.to_string())?;
            Ok(true)
        }
        Request::Restore => {
            restore(&window).map_err(|error| error.to_string())?;
            Ok(true)
        }
        _ => Ok(false),
    }
}
