use serde::Deserialize;
use std::{collections::HashMap, sync::Mutex};
use tauri::{
    webview::{NewWindowFeatures, NewWindowResponse},
    App, AppHandle, Emitter, LogicalPosition, LogicalSize, Manager, PhysicalPosition, PhysicalRect,
    PhysicalSize, Position as NativePosition, Url, WebviewUrl, WebviewWindow, WebviewWindowBuilder,
    Window, WindowEvent, Wry,
};

#[cfg(windows)]
mod windows;

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

#[derive(Clone, Copy, Deserialize)]
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

#[derive(Clone, Copy, Deserialize)]
pub struct AnchoredPosition {
    anchor: Anchor,
    offset: Position,
}

impl From<Anchor> for AnchoredPosition {
    fn from(anchor: Anchor) -> Self {
        Self {
            anchor,
            offset: Position { x: 0.0, y: 0.0 },
        }
    }
}

#[derive(Deserialize)]
#[serde(untagged)]
pub enum Placement {
    Anchor(Anchor),
    Anchored(AnchoredPosition),
    Coordinates(Position),
}

impl Placement {
    fn valid(&self) -> bool {
        match self {
            Self::Anchor(_) => true,
            Self::Anchored(position) => position.offset.valid(),
            Self::Coordinates(position) => position.valid(),
        }
    }

    fn anchor(&self) -> Option<AnchoredPosition> {
        match self {
            Self::Anchor(anchor) => Some((*anchor).into()),
            Self::Anchored(position) => Some(*position),
            Self::Coordinates(_) => None,
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
    entries: Mutex<HashMap<String, Entry>>,
}

enum Entry {
    Prepared { url: Url, options: Options },
    Opening { cancelled: bool },
    Open(WindowPolicy),
}

#[derive(Clone, Copy)]
struct WindowPolicy {
    anchor: Option<AnchoredPosition>,
    focusable: bool,
}

fn take_prepared(entries: &mut HashMap<String, Entry>, id: &str, url: &Url) -> Option<Options> {
    let entry = entries.get_mut(id)?;
    if !matches!(entry, Entry::Prepared { url: expected, .. } if expected == url) {
        return None;
    }
    match std::mem::replace(entry, Entry::Opening { cancelled: false }) {
        Entry::Prepared { options, .. } => Some(options),
        _ => unreachable!("entry was prepared"),
    }
}

fn complete_open(
    entries: &mut HashMap<String, Entry>,
    id: &str,
    policy: Option<WindowPolicy>,
) -> bool {
    if let (Some(entry @ Entry::Opening { cancelled: false }), Some(policy)) =
        (entries.get_mut(id), policy)
    {
        *entry = Entry::Open(policy);
        return true;
    }
    entries.remove(id);
    false
}

/// Return the policy of a live window that still needs a native close.
fn cancel_or_close(entries: &mut HashMap<String, Entry>, id: &str) -> Option<WindowPolicy> {
    match entries.get_mut(id) {
        Some(Entry::Prepared { .. }) => {
            entries.remove(id);
            None
        }
        Some(Entry::Opening { cancelled }) => {
            *cancelled = true;
            None
        }
        Some(Entry::Open(policy)) => Some(*policy),
        None => None,
    }
}

fn anchored_position(
    placement: AnchoredPosition,
    area: &PhysicalRect<i32, u32>,
    size: PhysicalSize<u32>,
    scale: f64,
) -> PhysicalPosition<i32> {
    let horizontal = i64::from(area.size.width.saturating_sub(size.width));
    let vertical = i64::from(area.size.height.saturating_sub(size.height));
    let x = match placement.anchor {
        Anchor::TopLeft | Anchor::CenterLeft | Anchor::BottomLeft => 0,
        Anchor::TopCenter | Anchor::BottomCenter => horizontal / 2,
        Anchor::TopRight | Anchor::CenterRight | Anchor::BottomRight => horizontal,
    };
    let y = match placement.anchor {
        Anchor::TopLeft | Anchor::TopCenter | Anchor::TopRight => 0,
        Anchor::CenterLeft | Anchor::CenterRight => vertical / 2,
        Anchor::BottomLeft | Anchor::BottomCenter | Anchor::BottomRight => vertical,
    };
    let clamp = |origin: i32, position: i64, offset: f64, limit: i64| {
        (i64::from(origin) + (position + (offset * scale).round() as i64).clamp(0, limit))
            .min(i64::from(i32::MAX)) as i32
    };
    PhysicalPosition::new(
        clamp(area.position.x, x, placement.offset.x, horizontal),
        clamp(area.position.y, y, placement.offset.y, vertical),
    )
}

fn anchor_position(
    window: &Window,
    anchor: AnchoredPosition,
) -> Result<Option<NativePosition>, String> {
    let monitor = window
        .primary_monitor()
        .map_err(|error| error.to_string())?
        .ok_or("The primary monitor is unavailable.")?;
    let size = window.outer_size().map_err(|error| error.to_string())?;
    let position = anchored_position(anchor, monitor.work_area(), size, monitor.scale_factor());
    Ok((window.outer_position().ok() != Some(position)).then_some(position.into()))
}

fn update_window(
    window: &Window,
    focusable: bool,
    position: Option<NativePosition>,
    visible: Option<bool>,
) -> Result<(), String> {
    #[cfg(windows)]
    if !focusable {
        return windows::update(window, position, visible);
    }
    let _ = focusable;
    if let Some(position) = position {
        window
            .set_position(position)
            .map_err(|error| error.to_string())?;
    }
    match visible {
        Some(true) => window.show(),
        Some(false) => window.hide(),
        None => Ok(()),
    }
    .map_err(|error| error.to_string())
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
        if app.get_webview_window(&id).is_some() {
            return Err("The external window already exists.".into());
        }
        let registry = app.state::<ExternalWindows>();
        let mut entries = registry.entries.lock().map_err(|error| error.to_string())?;
        match entries.entry(id) {
            std::collections::hash_map::Entry::Vacant(entry) => {
                entry.insert(Entry::Prepared { url, options });
            }
            std::collections::hash_map::Entry::Occupied(_) => {
                return Err("The external window already exists.".into())
            }
        }
        return Ok(());
    }

    // Serialize each geometry update on the window thread. Monitor, size and
    // position lookups then happen within one dispatch before changing HWND.
    let (send, mut receive) = tauri::async_runtime::channel(1);
    window
        .run_on_main_thread(move || {
            let _ = send.try_send(operate(&app, &id, request));
        })
        .map_err(|error| error.to_string())?;
    receive
        .recv()
        .await
        .ok_or_else(|| "External window operation was interrupted.".to_string())?
}

fn operate(app: &AppHandle, id: &str, request: Request) -> Result<(), String> {
    let registry = app.state::<ExternalWindows>();
    if matches!(request, Request::Close) {
        let policy = {
            let mut entries = registry.entries.lock().map_err(|error| error.to_string())?;
            cancel_or_close(&mut entries, id)
        };
        if let (Some(policy), Some(child)) = (policy, app.get_webview_window(id)) {
            // Tauri queues destruction. Hide the window before agreeing
            // to close so the next notification can reuse its screen position.
            let hidden = update_window(
                &child.as_ref().window(),
                policy.focusable,
                None,
                Some(false),
            );
            let destroyed = child.destroy().map_err(|error| error.to_string());
            return hidden.and(destroyed);
        }
        return Ok(());
    }
    let policy = registry
        .entries
        .lock()
        .map_err(|error| error.to_string())?
        .get(id)
        .and_then(|entry| match entry {
            Entry::Open(policy) => Some(*policy),
            _ => None,
        })
        .ok_or("The external window is closed.")?;
    let child = app
        .get_webview_window(id)
        .ok_or("The external window is closed.")?;
    let window = child.as_ref().window();
    match request {
        Request::Show => {
            let position = policy
                .anchor
                .map(|anchor| anchor_position(&window, anchor))
                .transpose()?
                .flatten();
            update_window(&window, policy.focusable, position, Some(true))
        }
        Request::Hide => update_window(&window, policy.focusable, None, Some(false)),
        Request::Move { position } if position.valid() => {
            let anchor = position.anchor();
            let target = match position {
                Placement::Coordinates(position) => {
                    Some(LogicalPosition::new(position.x, position.y).into())
                }
                _ => anchor_position(&window, anchor.expect("placement has an anchor"))?,
            };
            // Set the policy before dispatching the move. A DPI change may
            // immediately produce a resize event on the window thread.
            if let Some(Entry::Open(policy)) = registry
                .entries
                .lock()
                .map_err(|error| error.to_string())?
                .get_mut(id)
            {
                policy.anchor = anchor;
            }
            let moved = update_window(&window, policy.focusable, target, None);
            if moved.is_err() {
                if let Ok(mut entries) = registry.entries.lock() {
                    if let Some(Entry::Open(entry)) = entries.get_mut(id) {
                        entry.anchor = policy.anchor;
                    }
                }
            }
            moved
        }
        Request::Resize { size } if size.valid() => window
            .set_size(LogicalSize::new(size.width, size.height))
            .map_err(|error| error.to_string()),
        _ => Err("Invalid external window operation.".into()),
    }
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
    let options = registry
        .entries
        .lock()
        .ok()
        .and_then(|mut entries| take_prepared(&mut entries, &id, &url));
    let Some(options) = options else {
        return NewWindowResponse::Deny;
    };

    let blank = Url::parse("about:blank").expect("the built-in blank URL is valid");
    let focusable = options.focusable.unwrap_or(true);
    let mut builder = WebviewWindowBuilder::new(app, &id, WebviewUrl::External(blank.clone()))
        .window_features(features)
        .on_navigation(move |next| next == &url || next == &blank)
        .on_new_window(|_, _| NewWindowResponse::Deny)
        .title(options.title)
        .inner_size(options.size.width, options.size.height)
        .decorations(false)
        .visible(false)
        .focused(false)
        .focusable(focusable)
        .skip_taskbar(options.skip_taskbar.unwrap_or(false));
    #[cfg(windows)]
    if !focusable {
        // Wry focuses its controller on WM_ENTERSIZEMOVE. Keep native chrome
        // gestures off passive windows. SDK size and position remain available.
        builder = builder
            .resizable(false)
            .minimizable(false)
            .maximizable(false);
    }
    builder = match options.layer {
        Some(Layer::Bottom) => builder.always_on_bottom(true),
        Some(Layer::Top) => builder.always_on_top(true),
        None if options.always_on_top == Some(true) => builder.always_on_top(true),
        _ => builder,
    };
    if let Some(Placement::Coordinates(position)) = &options.position {
        builder = builder.position(position.x, position.y);
    }
    let policy = WindowPolicy {
        anchor: options.position.as_ref().and_then(Placement::anchor),
        focusable,
    };
    let window = builder.build().ok();
    let accepted = window.as_ref().is_some_and(|window| {
        #[cfg(windows)]
        if !focusable {
            return windows::register(&window.as_ref().window()).is_ok();
        }
        let _ = window;
        true
    });
    let completed =
        registry.entries.lock().ok().is_some_and(|mut entries| {
            complete_open(&mut entries, &id, accepted.then_some(policy))
        });
    match window {
        Some(window) if completed => NewWindowResponse::Create { window },
        Some(window) => {
            let _ = window.destroy();
            NewWindowResponse::Deny
        }
        None => NewWindowResponse::Deny,
    }
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
            if let Ok(mut entries) = registry.entries.lock() {
                entries.remove(window.label());
            }
            let _ = app.emit_to("main", "lunaris://external-window-closed", window.label());
        }
        WindowEvent::Resized(_) | WindowEvent::ScaleFactorChanged { .. } => {
            let anchored = registry.entries.lock().ok().and_then(|entries| {
                match entries.get(window.label()) {
                    Some(Entry::Open(policy)) => {
                        policy.anchor.map(|anchor| (anchor, policy.focusable))
                    }
                    _ => None,
                }
            });
            if let Some((anchor, focusable)) =
                anchored.filter(|_| !window.is_minimized().unwrap_or(false))
            {
                if let Ok(Some(position)) = anchor_position(window, anchor) {
                    let _ = update_window(window, focusable, Some(position), None);
                }
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
                anchored_position(anchor.into(), &work_area, window, 1.0),
                PhysicalPosition::new(x, y)
            );
        }
        assert_eq!(
            anchored_position(
                Anchor::BottomRight.into(),
                &work_area,
                PhysicalSize::new(2000, 250),
                1.0,
            ),
            PhysicalPosition::new(-1920, 790)
        );
    }

    #[test]
    fn offsets_use_the_monitor_scale_and_stay_within_its_work_area() {
        let work_area = PhysicalRect {
            position: PhysicalPosition::new(-1920, 40),
            size: PhysicalSize::new(1920, 1000),
        };
        let window = PhysicalSize::new(240, 80);
        let request: Request = serde_json::from_value(serde_json::json!({
            "kind": "move",
            "position": { "anchor": "bottom-right", "offset": { "x": -8, "y": -72 } }
        }))
        .unwrap();
        let Request::Move { position } = request else {
            panic!("move expected")
        };
        assert!(position.valid());
        assert_eq!(
            anchored_position(position.anchor().unwrap(), &work_area, window, 1.25),
            PhysicalPosition::new(-250, 870)
        );
        let far = AnchoredPosition {
            anchor: Anchor::BottomRight,
            offset: Position { x: 12.0, y: -900.0 },
        };
        assert_eq!(
            anchored_position(far, &work_area, window, 1.25),
            PhysicalPosition::new(-240, 40)
        );
    }

    #[test]
    fn closing_during_open_rejects_the_eventual_window() {
        let id = "external-window";
        let url = Url::parse("https://lunaris.example/external-window.html").unwrap();
        let options: Options = serde_json::from_value(
            serde_json::json!({ "title": "Test", "size": { "width": 192, "height": 64 } }),
        )
        .unwrap();
        let mut entries = HashMap::from([(
            id.to_owned(),
            Entry::Prepared {
                url: url.clone(),
                options,
            },
        )]);
        assert!(take_prepared(&mut entries, id, &url).is_some());
        assert!(cancel_or_close(&mut entries, id).is_none());
        assert!(!complete_open(
            &mut entries,
            id,
            Some(WindowPolicy {
                anchor: None,
                focusable: false
            })
        ));
        assert!(entries.is_empty());
    }
}
