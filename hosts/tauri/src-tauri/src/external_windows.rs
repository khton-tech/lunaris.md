use serde::Deserialize;
use std::{collections::HashMap, sync::Mutex};
use tauri::{
    webview::{NewWindowFeatures, NewWindowResponse},
    App, AppHandle, Emitter, LogicalPosition, LogicalSize, Manager, State, Url, WebviewUrl,
    WebviewWindow, WebviewWindowBuilder, WindowEvent, Wry,
};

#[derive(Deserialize)]
pub struct Size {
    width: f64,
    height: f64,
}

impl Size {
    fn valid(&self) -> bool {
        (1.0..=16384.0).contains(&self.width) && (1.0..=16384.0).contains(&self.height)
    }
}

#[derive(Deserialize)]
pub struct Position {
    x: f64,
    y: f64,
}

impl Position {
    fn valid(&self) -> bool {
        self.x.abs() <= 100000.0 && self.y.abs() <= 100000.0
    }
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Options {
    title: String,
    size: Size,
    position: Option<Position>,
    always_on_top: Option<bool>,
    skip_taskbar: Option<bool>,
    focusable: Option<bool>,
}

#[derive(Deserialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum Request {
    Prepare { options: Options },
    Show,
    Hide,
    Move { position: Position },
    Resize { size: Size },
    Close,
}

#[derive(Default)]
pub struct Pending(Mutex<HashMap<String, (Url, Options)>>);

fn valid_id(id: &str) -> bool {
    id.strip_prefix("external-").is_some_and(|suffix| {
        suffix.len() == 36
            && suffix
                .chars()
                .all(|character| character == '-' || character.is_ascii_hexdigit())
    })
}

#[tauri::command]
pub async fn external_window_request(
    window: WebviewWindow,
    app: AppHandle,
    pending: State<'_, Pending>,
    id: String,
    request: Request,
) -> Result<(), String> {
    if window.label() != "main" || !valid_id(&id) {
        return Err("Invalid external window request.".into());
    }

    if let Request::Prepare { options } = request {
        if options.title.trim().is_empty()
            || options.title.encode_utf16().count() > 1024
            || options.title.chars().any(|character| character <= '\u{1f}')
            || !options.size.valid()
            || options
                .position
                .as_ref()
                .is_some_and(|value| !value.valid())
        {
            return Err("Invalid external window options.".into());
        }
        let mut url = window.url().map_err(|error| error.to_string())?;
        url.set_path("/external-window.html");
        url.set_query(None);
        url.set_fragment(None);
        url.query_pairs_mut().append_pair("id", &id);
        let mut tickets = pending.0.lock().map_err(|error| error.to_string())?;
        if tickets.contains_key(&id) || app.get_webview_window(&id).is_some() {
            return Err("The external window already exists.".into());
        }
        tickets.insert(id, (url, options));
        return Ok(());
    }

    let child = app.get_webview_window(&id);
    if matches!(request, Request::Close) {
        pending
            .0
            .lock()
            .map_err(|error| error.to_string())?
            .remove(&id);
        return child.map_or(Ok(()), |child| {
            child.destroy().map_err(|error| error.to_string())
        });
    }
    let child = child.ok_or("The external window is closed.")?;
    match request {
        Request::Show => child.show(),
        Request::Hide => child.hide(),
        Request::Move { position } if position.valid() => {
            child.set_position(LogicalPosition::new(position.x, position.y))
        }
        Request::Resize { size } if size.valid() => {
            child.set_size(LogicalSize::new(size.width, size.height))
        }
        _ => return Err("Invalid external window operation.".into()),
    }
    .map_err(|error| error.to_string())
}

fn open_popup(app: &AppHandle, url: Url, features: NewWindowFeatures) -> NewWindowResponse<Wry> {
    let Some(id) = url
        .query_pairs()
        .find(|(name, _)| name == "id")
        .map(|(_, value)| value.into_owned())
    else {
        return NewWindowResponse::Deny;
    };
    if !valid_id(&id) {
        return NewWindowResponse::Deny;
    }
    let options = app
        .state::<Pending>()
        .0
        .lock()
        .ok()
        .and_then(|mut tickets| {
            if tickets
                .get(&id)
                .is_some_and(|(expected, _)| expected == &url)
            {
                tickets.remove(&id).map(|(_, options)| options)
            } else {
                None
            }
        });
    let Some(options) = options else {
        return NewWindowResponse::Deny;
    };

    let blank = Url::parse("about:blank").expect("the built-in blank URL is valid");
    let mut builder = WebviewWindowBuilder::new(app, &id, WebviewUrl::External(blank.clone()))
        .window_features(features)
        .on_navigation(move |next| next == &url || next == &blank)
        .on_new_window(|_, _| NewWindowResponse::Deny)
        .title(options.title)
        .inner_size(options.size.width, options.size.height)
        .decorations(false)
        .visible(false)
        .focused(false)
        .focusable(options.focusable.unwrap_or(true))
        .skip_taskbar(options.skip_taskbar.unwrap_or(false))
        .always_on_top(options.always_on_top.unwrap_or(false));
    if let Some(position) = options.position {
        builder = builder.position(position.x, position.y);
    }
    match builder.build() {
        Ok(window) => NewWindowResponse::Create { window },
        Err(_) => NewWindowResponse::Deny,
    }
}

pub fn setup(app: &mut App) -> tauri::Result<()> {
    app.manage(Pending::default());
    let handle = app.handle().clone();
    let config = app
        .config()
        .app
        .windows
        .iter()
        .find(|window| window.label == "main")
        .expect("main window configuration");
    WebviewWindowBuilder::from_config(app, config)?
        .on_new_window(move |url, features| open_popup(&handle, url, features))
        .build()?;
    Ok(())
}

pub fn on_window_event(window: &tauri::Window, event: &WindowEvent) {
    if valid_id(window.label()) && matches!(event, WindowEvent::Destroyed) {
        let _ =
            window
                .app_handle()
                .emit_to("main", "lunaris://external-window-closed", window.label());
    }
}
