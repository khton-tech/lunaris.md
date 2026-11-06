mod locations;
mod no_replace;
mod operations;
#[cfg(test)]
mod tests;

use cap_std::fs::Dir;
use notify::{EventKind, RecommendedWatcher, RecursiveMode, Watcher};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::collections::{HashMap, HashSet};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, Mutex};

pub const MAX_FILE_BYTES: u64 = 64 * 1024 * 1024;
static IDS: AtomicU64 = AtomicU64::new(1);
fn next_id(prefix: &str) -> String {
    format!("{prefix}-{}", IDS.fetch_add(1, Ordering::Relaxed))
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Failure {
    pub code: &'static str,
    pub message: &'static str,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub native_code: Option<i32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub native_kind: Option<String>,
}
pub type Result<T> = std::result::Result<T, Failure>;
pub(crate) fn fail(code: &'static str, message: &'static str) -> Failure {
    Failure {
        code,
        message,
        native_code: None,
        native_kind: None,
    }
}
impl From<std::io::Error> for Failure {
    fn from(error: std::io::Error) -> Self {
        use std::io::ErrorKind;
        let (code, message) = match error.kind() {
            ErrorKind::NotFound => ("NOT_FOUND", "The resource does not exist."),
            ErrorKind::AlreadyExists => ("ALREADY_EXISTS", "The destination already exists."),
            ErrorKind::PermissionDenied => ("ACCESS_DENIED", "Filesystem access was denied."),
            ErrorKind::NotADirectory => ("NOT_DIRECTORY", "The resource is not a directory."),
            ErrorKind::IsADirectory => ("NOT_FILE", "The resource is not a file."),
            ErrorKind::DirectoryNotEmpty => ("DIRECTORY_NOT_EMPTY", "The directory is not empty."),
            ErrorKind::Unsupported => {
                ("UNSUPPORTED", "This filesystem operation is not supported.")
            }
            _ => ("IO_ERROR", "The filesystem operation failed."),
        };
        let mut failure = fail(code, message);
        failure.native_code = error.raw_os_error();
        failure.native_kind = Some(format!("{:?}", error.kind()));
        failure
    }
}

#[derive(Debug, Deserialize, Clone)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Target {
    pub vault_id: String,
    pub path: String,
}
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct WriteOptions {
    pub mode: String,
    pub expected_version: Option<String>,
}
#[derive(Debug, Deserialize)]
#[serde(
    tag = "operation",
    rename_all = "camelCase",
    rename_all_fields = "camelCase",
    deny_unknown_fields
)]
pub enum Request {
    Begin,
    End,
    SelectVault,
    SelectLocation,
    DescribeLocation {
        reference: String,
    },
    AttachLocation {
        reference: String,
    },
    OpenConfig,
    CloseVault {
        vault_id: String,
    },
    PickFile {
        vault_id: String,
    },
    PickDirectory {
        vault_id: String,
    },
    PickSaveLocation {
        vault_id: String,
    },
    ReadText {
        target: Target,
    },
    ReadFile {
        target: Target,
    },
    WriteText {
        target: Target,
        text: String,
        options: WriteOptions,
    },
    WriteFile {
        target: Target,
        data: Vec<u8>,
        options: WriteOptions,
    },
    Stat {
        target: Target,
    },
    List {
        target: Target,
    },
    CreateDirectory {
        target: Target,
        recursive: bool,
    },
    Remove {
        target: Target,
        recursive: bool,
    },
    Move {
        source: Target,
        destination: Target,
        overwrite: bool,
    },
    Copy {
        source: Target,
        destination: Target,
        overwrite: bool,
    },
    Watch {
        target: Target,
        recursive: bool,
    },
    Unwatch {
        vault_id: String,
        watch_id: String,
    },
}
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Change {
    pub vault_id: String,
    pub watch_id: String,
    pub kind: String,
    pub paths: Vec<String>,
}
pub type ChangeCallback = Arc<dyn Fn(Change) + Send + Sync>;

pub(crate) struct Root {
    pub dir: Dir,
    pub path: PathBuf,
    pub watchers: HashMap<String, RecommendedWatcher>,
}
#[derive(Default)]
pub struct Backend {
    sessions: HashMap<String, HashMap<String, Root>>,
    ended: HashSet<String>,
    config_directory: Option<PathBuf>,
}
pub type SharedBackend = Arc<Mutex<Backend>>;

pub(crate) fn valid_path(path: &str, allow_root: bool) -> Result<&Path> {
    if path.is_empty() && allow_root {
        return Ok(Path::new("."));
    }
    if path.is_empty()
        || path.split('/').any(|part| {
            let stem = part.split('.').next().unwrap_or("").to_ascii_lowercase();
            let device = ["con", "prn", "aux", "nul"].contains(&stem.as_str())
                || ((stem.starts_with("com") || stem.starts_with("lpt"))
                    && stem.len() == 4
                    && matches!(stem.as_bytes()[3], b'1'..=b'9'));
            part.is_empty()
                || part == "."
                || part == ".."
                || part.ends_with(['.', ' '])
                || device
                || part
                    .chars()
                    .any(|c| c.is_control() || "\\:*?\"<>|".contains(c))
        })
    {
        return Err(fail(
            "INVALID_PATH",
            "A canonical Vault-relative path is required.",
        ));
    }
    Ok(Path::new(path))
}

impl Backend {
    /// Only the trusted host supplies a platform-resolved application directory.
    pub fn with_config_directory(path: PathBuf) -> Self {
        Self {
            config_directory: Some(path),
            ..Self::default()
        }
    }
    pub(crate) fn root(&mut self, session: &str, id: &str) -> Result<&mut Root> {
        self.sessions
            .get_mut(session)
            .and_then(|roots| roots.get_mut(id))
            .ok_or_else(|| fail("VAULT_CLOSED", "The Vault is closed."))
    }
    fn attach(&mut self, session: &str, path: PathBuf) -> Result<Value> {
        let roots = self
            .sessions
            .get_mut(session)
            .ok_or_else(|| fail("VAULT_CLOSED", "The filesystem session is closed."))?;
        // Ambient authority is confined to user selections and the host's config root.
        let path = path.canonicalize()?;
        let dir = Dir::open_ambient_dir(&path, cap_std::ambient_authority())?;
        let id = next_id("vault");
        let name = path
            .file_name()
            .and_then(|s| s.to_str())
            .unwrap_or("Vault")
            .to_owned();
        roots.insert(
            id.clone(),
            Root {
                dir,
                path,
                watchers: HashMap::new(),
            },
        );
        Ok(json!({ "id": id, "name": name }))
    }
    fn execute(
        &mut self,
        session: &str,
        request: Request,
        callback: Option<ChangeCallback>,
    ) -> Result<Value> {
        match request {
            Request::Begin => {
                if self.ended.contains(session) {
                    return Err(fail(
                        "VAULT_CLOSED",
                        "The filesystem session was already closed.",
                    ));
                }
                self.sessions.entry(session.to_owned()).or_default();
                Ok(Value::Null)
            }
            Request::End => {
                self.sessions.remove(session);
                self.ended.insert(session.to_owned());
                Ok(Value::Null)
            }
            Request::OpenConfig => {
                if !self.sessions.contains_key(session) {
                    return Err(fail("VAULT_CLOSED", "The filesystem session is closed."));
                }
                let path = self.config_directory.clone().ok_or_else(|| {
                    fail(
                        "UNSUPPORTED",
                        "The host has no application config directory.",
                    )
                })?;
                std::fs::create_dir_all(&path)?;
                self.attach(session, path)
            }
            Request::DescribeLocation { reference } => {
                if !self.sessions.contains_key(session) {
                    return Err(fail("VAULT_CLOSED", "The filesystem session is closed."));
                }
                let path = self.resolve_location(&reference)?;
                Ok(json!({ "reference": reference, "label": path.display().to_string() }))
            }
            Request::AttachLocation { reference } => {
                if !self.sessions.contains_key(session) {
                    return Err(fail("VAULT_CLOSED", "The filesystem session is closed."));
                }
                let path = self.resolve_location(&reference)?;
                self.attach(session, path)
            }
            Request::CloseVault { vault_id } => {
                self.root(session, &vault_id)?;
                self.sessions.get_mut(session).unwrap().remove(&vault_id);
                Ok(Value::Null)
            }
            Request::ReadText { target } => {
                let data = self.root(session, &target.vault_id)?.read(&target.path)?;
                let version = operations::version(&data);
                let text = String::from_utf8(data)
                    .map_err(|_| fail("INVALID_ENCODING", "The file is not valid UTF-8."))?;
                Ok(json!({ "text": text, "version": version }))
            }
            Request::ReadFile { target } => {
                let data = self.root(session, &target.vault_id)?.read(&target.path)?;
                Ok(json!({ "version": operations::version(&data), "data": data }))
            }
            Request::WriteText {
                target,
                text,
                options,
            } => {
                self.root(session, &target.vault_id)?
                    .write(&target.path, text.as_bytes(), &options)
            }
            Request::WriteFile {
                target,
                data,
                options,
            } => self
                .root(session, &target.vault_id)?
                .write(&target.path, &data, &options),
            Request::Stat { target } => self.root(session, &target.vault_id)?.stat(&target.path),
            Request::List { target } => self.root(session, &target.vault_id)?.list(&target.path),
            Request::CreateDirectory { target, recursive } => {
                let root = self.root(session, &target.vault_id)?;
                let path = valid_path(&target.path, false)?;
                if recursive {
                    root.dir.create_dir_all(path)?;
                } else {
                    root.dir.create_dir(path)?;
                }
                Ok(Value::Null)
            }
            Request::Remove { target, recursive } => self
                .root(session, &target.vault_id)?
                .remove(&target.path, recursive),
            Request::Move {
                source,
                destination,
                overwrite,
            }
            | Request::Copy {
                source,
                destination,
                overwrite,
            } => {
                // Transfer dispatch is handled before this match to retain the operation kind.
                let _ = (source, destination, overwrite);
                unreachable!()
            }
            Request::Watch { target, recursive } => {
                let root = self.root(session, &target.vault_id)?;
                let relative = root.dir.canonicalize(valid_path(&target.path, true)?)?;
                let absolute = root.path.join(relative);
                let id = next_id("watch");
                let watch_id = id.clone();
                let base = root.path.clone();
                let vault_id = target.vault_id;
                let callback = callback
                    .ok_or_else(|| fail("INVALID_ARGUMENT", "A watch channel is required."))?;
                let mut watcher =
                    notify::recommended_watcher(move |event: notify::Result<notify::Event>| {
                        let change = match event {
                            Ok(event) => {
                                if matches!(event.kind, EventKind::Access(_)) {
                                    return;
                                }
                                let kind = match event.kind {
                                    EventKind::Create(_) => "created",
                                    EventKind::Remove(_) => "removed",
                                    EventKind::Modify(notify::event::ModifyKind::Name(_))
                                        if event.paths.len() == 2 =>
                                    {
                                        "renamed"
                                    }
                                    EventKind::Modify(notify::event::ModifyKind::Name(_)) => {
                                        "rescan"
                                    }
                                    EventKind::Modify(_) => "modified",
                                    _ => "rescan",
                                };
                                let paths: Vec<String> = event
                                    .paths
                                    .iter()
                                    .filter_map(|path| path.strip_prefix(&base).ok())
                                    .filter_map(|path| path.to_str())
                                    .map(|path| path.replace('\\', "/"))
                                    .filter(|path| valid_path(path, true).is_ok())
                                    .collect();
                                if paths.is_empty() && kind != "rescan" {
                                    return;
                                }
                                Change {
                                    vault_id: vault_id.clone(),
                                    watch_id: watch_id.clone(),
                                    kind: kind.to_owned(),
                                    paths,
                                }
                            }
                            Err(_) => Change {
                                vault_id: vault_id.clone(),
                                watch_id: watch_id.clone(),
                                kind: "rescan".to_owned(),
                                paths: vec![],
                            },
                        };
                        callback(change);
                    })
                    .map_err(|_| fail("IO_ERROR", "Cannot create a filesystem watcher."))?;
                watcher
                    .watch(
                        &absolute,
                        if recursive {
                            RecursiveMode::Recursive
                        } else {
                            RecursiveMode::NonRecursive
                        },
                    )
                    .map_err(|_| fail("IO_ERROR", "Cannot watch the selected resource."))?;
                root.watchers.insert(id.clone(), watcher);
                Ok(json!(id))
            }
            Request::Unwatch { vault_id, watch_id } => {
                self.root(session, &vault_id)?.watchers.remove(&watch_id);
                Ok(Value::Null)
            }
            _ => Err(fail("INVALID_ARGUMENT", "Invalid filesystem request.")),
        }
    }
}

fn lock(state: &SharedBackend) -> Result<std::sync::MutexGuard<'_, Backend>> {
    state
        .lock()
        .map_err(|_| fail("IO_ERROR", "The native filesystem state is unavailable."))
}

/// Called on a blocking worker. Native dialogs never hold the backend mutex.
pub fn dispatch(
    state: SharedBackend,
    session: String,
    request: Request,
    callback: Option<ChangeCallback>,
) -> Result<Value> {
    match request {
        Request::SelectVault => {
            if !lock(&state)?.sessions.contains_key(&session) {
                return Err(fail("VAULT_CLOSED", "The filesystem session is closed."));
            }
            match rfd::FileDialog::new().pick_folder() {
                Some(path) => lock(&state)?.attach(&session, path),
                None => Ok(Value::Null),
            }
        }
        Request::SelectLocation => {
            if !lock(&state)?.sessions.contains_key(&session) {
                return Err(fail("VAULT_CLOSED", "The filesystem session is closed."));
            }
            match rfd::FileDialog::new().pick_folder() {
                Some(path) => {
                    let backend = lock(&state)?;
                    if !backend.sessions.contains_key(&session) {
                        return Err(fail("VAULT_CLOSED", "The filesystem session is closed."));
                    }
                    backend.register_location(path)
                }
                None => Ok(Value::Null),
            }
        }
        Request::PickFile { ref vault_id }
        | Request::PickDirectory { ref vault_id }
        | Request::PickSaveLocation { ref vault_id } => {
            let base = lock(&state)?.root(&session, vault_id)?.path.clone();
            let dialog = rfd::FileDialog::new().set_directory(&base);
            let selected = match request {
                Request::PickFile { .. } => dialog.pick_file(),
                Request::PickDirectory { .. } => dialog.pick_folder(),
                _ => dialog.save_file(),
            };
            let mut backend = lock(&state)?;
            let root = backend.root(&session, vault_id)?;
            let Some(selected) = selected else {
                return Ok(Value::Null);
            };
            let relative = selected
                .strip_prefix(&base)
                .map_err(|_| fail("INVALID_PATH", "The selection is outside the Vault."))?;
            let relative = relative
                .to_str()
                .ok_or_else(|| fail("INVALID_PATH", "The selection is not a UTF-8 path."))?
                .replace('\\', "/");
            let path = valid_path(&relative, true)?;
            // Validate the parent through the capability, including save targets not created yet.
            if !relative.is_empty() {
                root.dir.open_dir(
                    path.parent()
                        .filter(|p| !p.as_os_str().is_empty())
                        .unwrap_or(Path::new(".")),
                )?;
            }
            if root.dir.try_exists(path)? {
                root.dir.canonicalize(path)?;
            }
            Ok(json!(relative))
        }
        Request::Move {
            source,
            destination,
            overwrite,
        } => {
            if source.vault_id != destination.vault_id {
                return Err(fail(
                    "INVALID_PATH",
                    "Transfers must stay within one Vault.",
                ));
            }
            lock(&state)?.root(&session, &source.vault_id)?.transfer(
                &source.path,
                &destination.path,
                overwrite,
                true,
            )
        }
        Request::Copy {
            source,
            destination,
            overwrite,
        } => {
            if source.vault_id != destination.vault_id {
                return Err(fail(
                    "INVALID_PATH",
                    "Transfers must stay within one Vault.",
                ));
            }
            lock(&state)?.root(&session, &source.vault_id)?.transfer(
                &source.path,
                &destination.path,
                overwrite,
                false,
            )
        }
        request => lock(&state)?.execute(&session, request, callback),
    }
}
