use serde::Deserialize;
use std::{collections::HashMap, sync::Mutex};
use tauri::{
    webview::{NewWindowFeatures, NewWindowResponse},
    App, AppHandle, Emitter, LogicalPosition, LogicalSize, Manager, PhysicalPosition, PhysicalRect,
    PhysicalSize, State, Url, WebviewUrl, WebviewWindow, WebviewWindowBuilder, Window, WindowEvent,
    Wry,
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

#[derive(Clone, Copy, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum Anchor {
    TopLeft,
    TopCenter,
    TopRight,
    CenterLeft,
    CenterRight,
    BottomLeft,
    BottomCenter,
    BottomRight,
}

#[derive(Deserialize)]
#[serde(untagged)]
pub enum Placement {
    Anchor(Anchor),
    Coordinates(Position),
}

impl Placement {
    fn valid(&self) -> bool {
        match self {
            Self::Anchor(_) => true,
            Self::Coordinates(position) => position.valid(),
        }
    }
}

#[derive(Deserialize)]
#[serde(rename_all = "lowercase")]
enum Layer {
    Bottom,
    Normal,
    Top,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Options {
    title: String,
    size: Size,
    position: Option<Placement>,
    layer: Option<Layer>,
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
    Move { position: Placement },
    Resize { size: Size },
    Close,
}

#[derive(Default)]
pub struct ExternalWindows {
    pending: Mutex<HashMap<String, (Url, Options)>>,
    anchors: Mutex<HashMap<String, Option<Anchor>>>,
}

fn anchored_position(
    anchor: Anchor,
    area: &PhysicalRect<i32, u32>,
    size: PhysicalSize<u32>,
) -> PhysicalPosition<i32> {
    let horizontal = i64::from(area.size.width.saturating_sub(size.width));
    let vertical = i64::from(area.size.height.saturating_sub(size.height));
    let x = match anchor {
        Anchor::TopLeft | Anchor::CenterLeft | Anchor::BottomLeft => 0,
        Anchor::TopCenter | Anchor::BottomCenter => horizontal / 2,
        Anchor::TopRight | Anchor::CenterRight | Anchor::BottomRight => horizontal,
    };
    let y = match anchor {
        Anchor::TopLeft | Anchor::TopCenter | Anchor::TopRight => 0,
        Anchor::CenterLeft | Anchor::CenterRight => vertical / 2,
        Anchor::BottomLeft | Anchor::BottomCenter | Anchor::BottomRight => vertical,
    };
    PhysicalPosition::new(
        (i64::from(area.position.x) + x).min(i64::from(i32::MAX)) as i32,
        (i64::from(area.position.y) + y).min(i64::from(i32::MAX)) as i32,
    )
}

fn place_at_anchor(window: &Window, anchor: Anchor) -> Result<(), String> {
    let monitor = window
        .primary_monitor()
        .map_err(|error| error.to_string())?
        .ok_or("The primary monitor is unavailable.")?;
    let size = window.outer_size().map_err(|error| error.to_string())?;
    let position = anchored_position(anchor, monitor.work_area(), size);
    if window.outer_position().ok() != Some(position) {
        window
            .set_position(position)
            .map_err(|error| error.to_string())?;
    }
    Ok(())
}

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
    registry: State<'_, ExternalWindows>,
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
        let mut tickets = registry.pending.lock().map_err(|error| error.to_string())?;
        if tickets.contains_key(&id) || app.get_webview_window(&id).is_some() {
            return Err("The external window already exists.".into());
        }
        tickets.insert(id, (url, options));
        return Ok(());
    }

    let child = app.get_webview_window(&id);
    if matches!(request, Request::Close) {
        registry
            .pending
            .lock()
            .map_err(|error| error.to_string())?
            .remove(&id);
        return child.map_or(Ok(()), |child| {
            child.destroy().map_err(|error| error.to_string())
        });
    }
    let child = child.ok_or("The external window is closed.")?;
    match request {
        Request::Show => {
            let anchor = registry
                .anchors
                .lock()
                .map_err(|error| error.to_string())?
                .get(&id)
                .copied()
                .flatten();
            if let Some(anchor) = anchor {
                place_at_anchor(&child.as_ref().window(), anchor)?;
            }
            child.show()
        }
        Request::Hide => child.hide(),
        Request::Move { position } if position.valid() => {
            let anchor = match &position {
                Placement::Anchor(anchor) => Some(*anchor),
                Placement::Coordinates(_) => None,
            };
            // Set the policy before dispatching the move. A DPI change may
            // immediately produce a resize event on the window thread.
            let previous = {
                let mut anchors = registry.anchors.lock().map_err(|error| error.to_string())?;
                let entry = anchors
                    .get_mut(&id)
                    .ok_or("The external window is closed.")?;
                std::mem::replace(entry, anchor)
            };
            let moved = match position {
                Placement::Anchor(anchor) => place_at_anchor(&child.as_ref().window(), anchor),
                Placement::Coordinates(position) => child
                    .set_position(LogicalPosition::new(position.x, position.y))
                    .map_err(|error| error.to_string()),
            };
            if moved.is_err() {
                if let Ok(mut anchors) = registry.anchors.lock() {
                    if let Some(entry) = anchors.get_mut(&id) {
                        *entry = previous;
                    }
                }
            }
            return moved;
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
    let registry = app.state::<ExternalWindows>();
    let options = registry.pending.lock().ok().and_then(|mut tickets| {
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
        .skip_taskbar(options.skip_taskbar.unwrap_or(false));
    builder = match options.layer {
        Some(Layer::Bottom) => builder.always_on_bottom(true),
        Some(Layer::Top) => builder.always_on_top(true),
        None if options.always_on_top == Some(true) => builder.always_on_top(true),
        _ => builder,
    };
    let anchor = match options.position {
        Some(Placement::Coordinates(position)) => {
            builder = builder.position(position.x, position.y);
            None
        }
        Some(Placement::Anchor(anchor)) => Some(anchor),
        None => None,
    };
    let Ok(window) = builder.build() else {
        return NewWindowResponse::Deny;
    };
    if let Ok(mut anchors) = registry.anchors.lock() {
        anchors.insert(id, anchor);
    }
    NewWindowResponse::Create { window }
}

pub fn setup(app: &mut App) -> tauri::Result<()> {
    app.manage(ExternalWindows::default());
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

pub fn on_window_event(window: &Window, event: &WindowEvent) {
    if !valid_id(window.label()) {
        return;
    }
    let app = window.app_handle();
    let registry = app.state::<ExternalWindows>();
    match event {
        WindowEvent::Destroyed => {
            if let Ok(mut anchors) = registry.anchors.lock() {
                anchors.remove(window.label());
            }
            let _ = app.emit_to("main", "lunaris://external-window-closed", window.label());
        }
        WindowEvent::Resized(_) | WindowEvent::ScaleFactorChanged { .. } => {
            let anchor = registry
                .anchors
                .lock()
                .ok()
                .and_then(|anchors| anchors.get(window.label()).copied().flatten());
            if let Some(anchor) = anchor.filter(|_| !window.is_minimized().unwrap_or(false)) {
                let _ = place_at_anchor(window, anchor);
            }
        }
        _ => {}
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn anchors_use_the_work_area_origin_and_the_entire_window_size() {
        let work_area = PhysicalRect {
            position: PhysicalPosition::new(-1920, 40),
            size: PhysicalSize::new(1920, 1000),
        };
        let window = PhysicalSize::new(320, 200);
        let expected = [
            (Anchor::TopLeft, (-1920, 40)),
            (Anchor::TopCenter, (-1120, 40)),
            (Anchor::TopRight, (-320, 40)),
            (Anchor::CenterLeft, (-1920, 440)),
            (Anchor::CenterRight, (-320, 440)),
            (Anchor::BottomLeft, (-1920, 840)),
            (Anchor::BottomCenter, (-1120, 840)),
            (Anchor::BottomRight, (-320, 840)),
        ];
        for (anchor, (x, y)) in expected {
            assert_eq!(
                anchored_position(anchor, &work_area, window),
                PhysicalPosition::new(x, y)
            );
        }
        assert_eq!(
            anchored_position(
                Anchor::BottomRight,
                &work_area,
                PhysicalSize::new(2000, 250)
            ),
            PhysicalPosition::new(-1920, 790)
        );
    }
}
