use super::*;
use std::sync::mpsc;
use std::time::{Duration, Instant};

#[test]
fn create_location_makes_a_distinct_child_and_never_reuses_existing_content() {
    let f = Fixture::new();
    let parent = f.path.join("vault");
    std::fs::write(parent.join("parent.md"), "parent").unwrap();
    let mut backend = f.backend.lock().unwrap();
    backend.config_directory = Some(f.path.join("app-config"));
    let selected = backend.register_location(parent.clone()).unwrap();
    let reference = selected["reference"].as_str().unwrap().to_owned();
    let child = backend
        .execute(
            "test",
            Request::CreateLocation {
                reference: reference.clone(),
                name: "Notes".into(),
            },
            None,
        )
        .unwrap();
    assert_ne!(child["reference"], selected["reference"]);
    assert_eq!(
        backend
            .resolve_location(child["reference"].as_str().unwrap())
            .unwrap(),
        parent.join("Notes").canonicalize().unwrap()
    );
    assert!(!parent.join(".lunaris").exists());
    std::fs::write(parent.join("Notes/keep.md"), "keep").unwrap();
    assert_eq!(
        backend
            .execute(
                "test",
                Request::CreateLocation {
                    reference: reference.clone(),
                    name: "Notes".into()
                },
                None
            )
            .unwrap_err()
            .code,
        "ALREADY_EXISTS"
    );
    assert_eq!(
        std::fs::read_to_string(parent.join("Notes/keep.md")).unwrap(),
        "keep"
    );
    let root = backend
        .execute(
            "test",
            Request::AttachLocation {
                reference: child["reference"].as_str().unwrap().into(),
            },
            None,
        )
        .unwrap();
    let files = backend
        .execute(
            "test",
            Request::List {
                target: Target {
                    vault_id: root["id"].as_str().unwrap().into(),
                    path: "".into(),
                },
            },
            None,
        )
        .unwrap();
    assert_eq!(files.as_array().unwrap().len(), 1);
    assert_eq!(files[0]["path"], "keep.md");
    for name in ["../escape", "a/b", "CON", "name.", " leading"] {
        assert_eq!(
            backend
                .execute(
                    "test",
                    Request::CreateLocation {
                        reference: reference.clone(),
                        name: name.into()
                    },
                    None
                )
                .unwrap_err()
                .code,
            "INVALID_PATH"
        );
    }
    assert_eq!(
        backend
            .execute(
                "closed",
                Request::CreateLocation {
                    reference,
                    name: "Closed".into()
                },
                None
            )
            .unwrap_err()
            .code,
        "VAULT_CLOSED"
    );
    backend.sessions.clear();
}

#[test]
fn folder_locations_survive_backend_restart_without_preparing_or_attaching() {
    let f = Fixture::new();
    let config = f.path.join("app-config");
    let vault_path = f.path.join("vault");
    std::fs::write(vault_path.join("existing.md"), "preserved").unwrap();
    let location = {
        let mut backend = f.backend.lock().unwrap();
        backend.config_directory = Some(config.clone());
        let before = backend.sessions["test"].len();
        let selected = backend.register_location(vault_path.clone()).unwrap();
        assert_eq!(
            selected,
            backend.register_location(vault_path.clone()).unwrap()
        );
        assert_eq!(backend.sessions["test"].len(), before);
        assert!(selected.get("path").is_none());
        assert!(!vault_path.join(".lunaris").exists());
        selected
    };
    let mut restarted = Backend::with_config_directory(config);
    restarted.execute("restored", Request::Begin, None).unwrap();
    let described = restarted
        .execute(
            "restored",
            Request::DescribeLocation {
                reference: location["reference"].as_str().unwrap().into(),
            },
            None,
        )
        .unwrap();
    assert_eq!(
        described["label"],
        vault_path.canonicalize().unwrap().display().to_string()
    );
    assert_eq!(restarted.sessions["restored"].len(), 0);
    let attached = restarted
        .execute(
            "restored",
            Request::AttachLocation {
                reference: location["reference"].as_str().unwrap().into(),
            },
            None,
        )
        .unwrap();
    assert_eq!(attached["name"], "vault");
    assert_eq!(
        restarted
            .root("restored", attached["id"].as_str().unwrap())
            .unwrap()
            .read("existing.md")
            .unwrap(),
        b"preserved"
    );
    assert!(!vault_path.join(".lunaris").exists());
    restarted.sessions.clear();
}

#[test]
fn folder_locations_reject_unknown_corrupt_missing_and_closed_requests() {
    let f = Fixture::new();
    let mut backend = f.backend.lock().unwrap();
    backend.config_directory = Some(f.path.join("app-config"));
    assert_eq!(
        backend.resolve_location("../../vault").unwrap_err().code,
        "INVALID_ARGUMENT"
    );
    assert_eq!(
        backend
            .resolve_location(&format!("tauri-folder-v1-{}", "0".repeat(64)))
            .unwrap_err()
            .code,
        "NOT_FOUND"
    );
    let location = backend.register_location(f.path.join("vault")).unwrap();
    let reference = location["reference"].as_str().unwrap();
    assert_eq!(
        backend
            .execute(
                "closed",
                Request::AttachLocation {
                    reference: reference.into()
                },
                None
            )
            .unwrap_err()
            .code,
        "VAULT_CLOSED"
    );
    backend.sessions.clear();
    f.parent
        .rename(
            Path::new(&f.name).join("vault"),
            &f.parent,
            Path::new(&f.name).join("moved"),
        )
        .unwrap();
    assert_eq!(
        backend.resolve_location(reference).unwrap_err().code,
        "NOT_FOUND"
    );
    std::fs::write(
        f.path
            .join("app-config/folder-locations-v1")
            .join(format!("{reference}.json")),
        b"{}",
    )
    .unwrap();
    assert_eq!(
        backend.resolve_location(reference).unwrap_err().code,
        "CONFLICT"
    );
}

struct Fixture {
    backend: SharedBackend,
    parent: Dir,
    name: String,
    path: PathBuf,
    vault: String,
}
impl Fixture {
    fn new() -> Self {
        let temp = std::env::temp_dir().canonicalize().unwrap();
        let parent = Dir::open_ambient_dir(&temp, cap_std::ambient_authority()).unwrap();
        let name = format!("lunaris-fs-test-{}-{}", std::process::id(), next_id("test"));
        parent.create_dir(&name).unwrap();
        let path = temp.join(&name);
        parent.create_dir(Path::new(&name).join("vault")).unwrap();
        let mut backend = Backend::default();
        backend.execute("test", Request::Begin, None).unwrap();
        let vault = backend.attach("test", path.join("vault")).unwrap()["id"]
            .as_str()
            .unwrap()
            .to_owned();
        Self {
            backend: Arc::new(Mutex::new(backend)),
            parent,
            name,
            path,
            vault,
        }
    }
    fn target(&self, path: &str) -> Value {
        json!({ "vaultId": self.vault, "path": path })
    }
    fn request(&self, request: Value) -> Result<Value> {
        dispatch(
            self.backend.clone(),
            "test".into(),
            serde_json::from_value(request).unwrap(),
            None,
        )
    }
    fn write(&self, path: &str, text: &str, mode: &str, expected: Option<&str>) -> Result<Value> {
        self.request(json!({ "operation": "writeText", "target": self.target(path), "text": text, "options": { "mode": mode, "expectedVersion": expected } }))
    }
    fn read(&self, path: &str) -> Result<Value> {
        self.request(json!({ "operation": "readText", "target": self.target(path) }))
    }
}
impl Drop for Fixture {
    fn drop(&mut self) {
        self.backend.lock().unwrap().sessions.clear();
        // Delete only this test's created directory through its parent capability.
        assert!(self.name.starts_with("lunaris-fs-test-") && !self.name.contains(['/', '\\']));
        self.parent.remove_dir_all(&self.name).unwrap();
    }
}

#[test]
fn application_config_is_host_selected_scoped_and_persistent() {
    let f = Fixture::new();
    f.backend.lock().unwrap().config_directory = Some(f.path.join("app-config"));
    let root = f.request(json!({ "operation": "openConfig" })).unwrap();
    assert!(root.get("path").is_none());
    let target = json!({ "vaultId": root["id"], "path": "config.toml" });
    f.request(json!({ "operation": "writeText", "target": target, "text": "enabled = true\n", "options": { "mode": "create" } })).unwrap();
    assert_eq!(f.read("config.toml").unwrap_err().code, "NOT_FOUND");
    let outside = json!({ "vaultId": root["id"], "path": "../vault/note.md" });
    assert_eq!(
        f.request(json!({ "operation": "readText", "target": outside }))
            .unwrap_err()
            .code,
        "INVALID_PATH"
    );
    f.request(json!({ "operation": "closeVault", "vaultId": root["id"] }))
        .unwrap();
    assert_eq!(
        f.request(json!({ "operation": "readText", "target": target }))
            .unwrap_err()
            .code,
        "VAULT_CLOSED"
    );
    let reopened = f.request(json!({ "operation": "openConfig" })).unwrap();
    assert_ne!(reopened["id"], root["id"]);
    assert_eq!(f.request(json!({ "operation": "readText", "target": { "vaultId": reopened["id"], "path": "config.toml" } })).unwrap()["text"], "enabled = true\n");
    f.request(json!({ "operation": "end" })).unwrap();
    assert_eq!(
        f.request(json!({ "operation": "openConfig" }))
            .unwrap_err()
            .code,
        "VAULT_CLOSED"
    );
}

#[test]
fn application_config_requires_host_support_and_reports_unwritable_locations() {
    let f = Fixture::new();
    assert_eq!(
        f.request(json!({ "operation": "openConfig" }))
            .unwrap_err()
            .code,
        "UNSUPPORTED"
    );
    f.write("file", "not a directory", "create", None).unwrap();
    f.backend.lock().unwrap().config_directory = Some(f.path.join("vault/file/child"));
    assert!(f.request(json!({ "operation": "openConfig" })).is_err());
}

#[test]
fn text_binary_modes_and_optimistic_conflicts_preserve_originals() {
    let fixture = Fixture::new();
    assert_eq!(
        fixture
            .write("note.md", "hello", "replace", None)
            .unwrap_err()
            .code,
        "NOT_FOUND"
    );
    let first = fixture.write("note.md", "hello", "create", None).unwrap();
    assert_eq!(
        fixture
            .write("note.md", "wrong", "create", None)
            .unwrap_err()
            .code,
        "ALREADY_EXISTS"
    );
    let read = fixture.read("note.md").unwrap();
    assert_eq!(read["text"], "hello");
    assert_eq!(read["version"], first["version"]);
    // Simulate an external editor, including an equal-length content change.
    std::fs::write(fixture.path.join("vault/note.md"), "other").unwrap();
    assert_eq!(
        fixture
            .write("note.md", "stale", "replace", read["version"].as_str())
            .unwrap_err()
            .code,
        "CONFLICT"
    );
    assert_eq!(fixture.read("note.md").unwrap()["text"], "other");
    let current = fixture.read("note.md").unwrap();
    fixture
        .write("note.md", "saved", "replace", current["version"].as_str())
        .unwrap();
    assert_eq!(fixture.read("note.md").unwrap()["text"], "saved");
    fixture.request(json!({ "operation": "writeFile", "target": fixture.target("bytes.bin"), "data": [0, 255, 42], "options": { "mode": "create" } })).unwrap();
    assert_eq!(
        fixture
            .request(json!({ "operation": "readFile", "target": fixture.target("bytes.bin") }))
            .unwrap()["data"],
        json!([0, 255, 42])
    );
    assert_eq!(
        fixture.read("bytes.bin").unwrap_err().code,
        "INVALID_ENCODING"
    );
    assert!(fixture
        .backend
        .lock()
        .unwrap()
        .root("test", &fixture.vault)
        .unwrap()
        .list("")
        .unwrap()
        .as_array()
        .unwrap()
        .iter()
        .all(|entry| !entry["path"]
            .as_str()
            .unwrap()
            .starts_with(".lunaris-write-")));
}

#[test]
fn directories_transfers_and_explicit_recursive_removal() {
    let f = Fixture::new();
    f.request(json!({ "operation": "createDirectory", "target": f.target("notes/sub"), "recursive": true })).unwrap();
    f.write("notes/sub/a.md", "A", "create", None).unwrap();
    assert_eq!(
        f.request(json!({ "operation": "stat", "target": f.target("notes") }))
            .unwrap()["kind"],
        "directory"
    );
    assert_eq!(
        f.request(json!({ "operation": "list", "target": f.target("notes/sub") }))
            .unwrap()[0]["path"],
        "notes/sub/a.md"
    );
    f.request(json!({ "operation": "copy", "source": f.target("notes"), "destination": f.target("copied"), "overwrite": false })).unwrap();
    assert_eq!(f.read("copied/sub/a.md").unwrap()["text"], "A");
    assert_eq!(f.request(json!({ "operation": "copy", "source": f.target("notes"), "destination": f.target("notes/child"), "overwrite": false })).unwrap_err().code, "INVALID_PATH");
    f.request(json!({ "operation": "move", "source": f.target("copied/sub/a.md"), "destination": f.target("moved.md"), "overwrite": false })).unwrap();
    assert_eq!(f.read("copied/sub/a.md").unwrap_err().code, "NOT_FOUND");
    assert_eq!(f.request(json!({ "operation": "move", "source": f.target("moved.md"), "destination": f.target("notes/sub/a.md"), "overwrite": false })).unwrap_err().code, "ALREADY_EXISTS");
    assert_eq!(
        f.request(
            json!({ "operation": "remove", "target": f.target("notes"), "recursive": false })
        )
        .unwrap_err()
        .code,
        "DIRECTORY_NOT_EMPTY"
    );
    f.request(json!({ "operation": "remove", "target": f.target("notes"), "recursive": true }))
        .unwrap();
    assert_eq!(f.read("notes/sub/a.md").unwrap_err().code, "NOT_FOUND");
}

#[test]
fn portable_paths_and_capability_reject_escape_and_root_mutation() {
    let f = Fixture::new();
    for path in [
        "",
        "../escape",
        "/absolute",
        "C:/absolute",
        "a\\b",
        "a//b",
        "a/./b",
        "a/../b",
        "CON.txt",
        "file:stream",
        "trailing.",
    ] {
        assert_eq!(
            f.write(path, "no", "create", None).unwrap_err().code,
            "INVALID_PATH",
            "{path}"
        );
    }
    let mut backend = f.backend.lock().unwrap();
    let root = backend.root("test", &f.vault).unwrap();
    std::fs::write(f.path.join("outside.md"), "outside").unwrap();
    assert!(root.dir.read("../outside.md").is_err());
    assert_eq!(root.remove("", true).unwrap_err().code, "INVALID_PATH");
    assert_eq!(root.stat("").unwrap()["kind"], "directory");
}

#[test]
fn closed_sessions_and_vaults_cannot_be_revived_by_late_requests() {
    let f = Fixture::new();
    f.request(json!({ "operation": "closeVault", "vaultId": f.vault }))
        .unwrap();
    assert_eq!(f.read("note.md").unwrap_err().code, "VAULT_CLOSED");
    f.request(json!({ "operation": "end" })).unwrap();
    assert_eq!(
        f.request(json!({ "operation": "begin" })).unwrap_err().code,
        "VAULT_CLOSED"
    );
    assert_eq!(
        f.backend
            .lock()
            .unwrap()
            .attach("test", f.path.join("vault"))
            .unwrap_err()
            .code,
        "VAULT_CLOSED"
    );
}

#[test]
fn native_watcher_reports_relative_changes_and_is_released_on_close() {
    let f = Fixture::new();
    let (sender, receiver) = mpsc::channel();
    let watch = dispatch(
        f.backend.clone(),
        "test".into(),
        serde_json::from_value(
            json!({ "operation": "watch", "target": f.target(""), "recursive": true }),
        )
        .unwrap(),
        Some(Arc::new(move |change| {
            let _ = sender.send(change);
        })),
    )
    .unwrap();
    f.write("watched.md", "changed", "create", None).unwrap();
    let deadline = Instant::now() + Duration::from_secs(5);
    let mut observed = false;
    while Instant::now() < deadline {
        if let Ok(change) = receiver.recv_timeout(Duration::from_millis(100)) {
            assert_eq!(change.watch_id, watch.as_str().unwrap());
            assert_eq!(change.vault_id, f.vault);
            assert!(change
                .paths
                .iter()
                .all(|path| valid_path(path, true).is_ok()));
            if change.paths.iter().any(|path| path == "watched.md") {
                observed = true;
                break;
            }
        }
    }
    assert!(observed, "native watcher did not report the created file");
    f.request(json!({ "operation": "unwatch", "vaultId": f.vault, "watchId": watch }))
        .unwrap();
    assert!(f
        .backend
        .lock()
        .unwrap()
        .root("test", &f.vault)
        .unwrap()
        .watchers
        .is_empty());
    f.request(json!({ "operation": "closeVault", "vaultId": f.vault }))
        .unwrap();
    assert!(f.backend.lock().unwrap().sessions["test"].is_empty());
}

#[test]
fn competing_saves_use_one_version_and_no_replace_rename_cannot_clobber() {
    let f = Fixture::new();
    let initial = f.write("note.md", "initial", "create", None).unwrap();
    let expected = initial["version"].as_str().unwrap().to_owned();
    let mut workers = Vec::new();
    for text in ["first", "second"] {
        let backend = f.backend.clone();
        let vault = f.vault.clone();
        let expected = expected.clone();
        workers.push(std::thread::spawn(move || {
            dispatch(
                backend,
                "test".into(),
                Request::WriteText {
                    target: Target {
                        vault_id: vault,
                        path: "note.md".into(),
                    },
                    text: text.into(),
                    options: WriteOptions {
                        mode: "replace".into(),
                        expected_version: Some(expected),
                    },
                },
                None,
            )
        }));
    }
    let results: Vec<_> = workers
        .into_iter()
        .map(|worker| worker.join().unwrap())
        .collect();
    assert_eq!(results.iter().filter(|result| result.is_ok()).count(), 1);
    assert_eq!(
        results
            .iter()
            .filter(|result| result
                .as_ref()
                .err()
                .is_some_and(|error| error.code == "CONFLICT"))
            .count(),
        1
    );
    f.write("source.md", "source", "create", None).unwrap();
    f.write("destination.md", "keep", "create", None).unwrap();
    {
        let mut backend = f.backend.lock().unwrap();
        let root = backend.root("test", &f.vault).unwrap();
        assert!(crate::no_replace::rename(
            &root.dir,
            Path::new("source.md"),
            Path::new("destination.md")
        )
        .is_err());
    }
    assert_eq!(f.read("source.md").unwrap()["text"], "source");
    assert_eq!(f.read("destination.md").unwrap()["text"], "keep");
}

#[test]
fn file_size_limit_is_checked_before_loading_content() {
    let f = Fixture::new();
    {
        let mut backend = f.backend.lock().unwrap();
        let root = backend.root("test", &f.vault).unwrap();
        root.dir
            .create("large.bin")
            .unwrap()
            .set_len(MAX_FILE_BYTES + 1)
            .unwrap();
    }
    assert_eq!(f.read("large.bin").unwrap_err().code, "TOO_LARGE");
}
