use crate::{fail, next_id, valid_path, Result, Root, WriteOptions, MAX_FILE_BYTES};
use cap_std::fs::{Metadata, OpenOptions};
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use std::io::{Read, Write};
use std::path::Path;
use std::time::UNIX_EPOCH;

pub(crate) fn version(data: &[u8]) -> String {
    format!("sha256:{:x}", Sha256::digest(data))
}
fn info(path: &str, metadata: Metadata) -> Value {
    let kind = if metadata.is_file() {
        "file"
    } else if metadata.is_dir() {
        "directory"
    } else if metadata.file_type().is_symlink() {
        "symlink"
    } else {
        "other"
    };
    let modified = metadata
        .modified()
        .ok()
        .and_then(|time| time.into_std().duration_since(UNIX_EPOCH).ok())
        .map(|time| time.as_millis() as u64);
    json!({ "path": path, "kind": kind, "size": metadata.len(), "modifiedAt": modified })
}

impl Root {
    pub fn read(&self, path: &str) -> Result<Vec<u8>> {
        let file = self.dir.open(valid_path(path, false)?)?;
        let before = file.metadata()?;
        if !before.is_file() {
            return Err(fail("NOT_FILE", "The resource is not a regular file."));
        }
        if before.len() > MAX_FILE_BYTES {
            return Err(fail(
                "TOO_LARGE",
                "The file exceeds the in-memory transfer limit.",
            ));
        }
        let mut data = Vec::new();
        (&file).take(MAX_FILE_BYTES + 1).read_to_end(&mut data)?;
        let after = file.metadata()?;
        if data.len() as u64 > MAX_FILE_BYTES {
            return Err(fail(
                "TOO_LARGE",
                "The file exceeds the in-memory transfer limit.",
            ));
        }
        if before.len() != after.len() || before.modified().ok() != after.modified().ok() {
            return Err(fail("CONFLICT", "The file changed while being read."));
        }
        Ok(data)
    }
    pub fn stat(&self, path: &str) -> Result<Value> {
        Ok(info(
            path,
            self.dir.symlink_metadata(valid_path(path, true)?)?,
        ))
    }
    pub fn list(&self, path: &str) -> Result<Value> {
        let mut entries = Vec::new();
        for entry in self.dir.read_dir(valid_path(path, true)?)? {
            let name = entry?
                .file_name()
                .into_string()
                .map_err(|_| fail("INVALID_PATH", "The directory contains a non-UTF-8 name."))?;
            let child = if path.is_empty() {
                name
            } else {
                format!("{path}/{name}")
            };
            valid_path(&child, false)?;
            entries.push(info(&child, self.dir.symlink_metadata(&child)?));
        }
        entries.sort_by(|a, b| a["path"].as_str().cmp(&b["path"].as_str()));
        Ok(json!(entries))
    }
    pub fn write(&self, path: &str, data: &[u8], options: &WriteOptions) -> Result<Value> {
        let path = valid_path(path, false)?;
        if data.len() as u64 > MAX_FILE_BYTES {
            return Err(fail(
                "TOO_LARGE",
                "The file exceeds the in-memory transfer limit.",
            ));
        }
        if !["create", "replace", "upsert"].contains(&options.mode.as_str())
            || (options.mode == "create" && options.expected_version.is_some())
        {
            return Err(fail(
                "INVALID_ARGUMENT",
                "A valid explicit write mode is required.",
            ));
        }
        let parent = self.dir.open_dir(
            path.parent()
                .filter(|p| !p.as_os_str().is_empty())
                .unwrap_or(Path::new(".")),
        )?;
        let name = path
            .file_name()
            .ok_or_else(|| fail("INVALID_PATH", "A file name is required."))?;
        let existing = match parent.symlink_metadata(name) {
            Ok(metadata) => Some(metadata),
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => None,
            Err(error) => return Err(error.into()),
        };
        if existing
            .as_ref()
            .is_some_and(|metadata| !metadata.is_file())
        {
            return Err(fail(
                "NOT_FILE",
                "The destination must be a regular file; links are not replaced.",
            ));
        }
        if options.mode == "create" && existing.is_some() {
            return Err(fail("ALREADY_EXISTS", "The destination already exists."));
        }
        if options.mode == "replace" && existing.is_none() {
            return Err(fail("NOT_FOUND", "The destination does not exist."));
        }
        if let Some(expected) = &options.expected_version {
            if existing.is_none() || &version(&self.read(path.to_str().unwrap())?) != expected {
                return Err(fail("CONFLICT", "The file changed since it was read."));
            }
        }
        let temp_name = format!(".lunaris-write-{}-{}", std::process::id(), next_id("tmp"));
        let mut temp =
            parent.open_with(&temp_name, OpenOptions::new().write(true).create_new(true))?;
        let result = (|| -> Result<Value> {
            if let Some(metadata) = existing {
                temp.set_permissions(metadata.permissions())?;
            }
            temp.write_all(data)?;
            temp.sync_all()?;
            // Recheck immediately before committing; other driver calls are serialized.
            if let Some(expected) = &options.expected_version {
                if &version(&self.read(path.to_str().unwrap())?) != expected {
                    return Err(fail("CONFLICT", "The file changed before commit."));
                }
            }
            drop(temp);
            if options.mode == "create" {
                crate::no_replace::rename(&parent, Path::new(&temp_name), Path::new(name))?;
            } else {
                parent.rename(&temp_name, &parent, name)?;
            }
            Ok(json!({ "version": version(data) }))
        })();
        if let Err(error) = parent.remove_file(&temp_name) {
            if error.kind() != std::io::ErrorKind::NotFound {
                return Err(error.into());
            }
        }
        result
    }
    pub fn remove(&self, path: &str, recursive: bool) -> Result<Value> {
        let path = valid_path(path, false)?;
        let metadata = self.dir.symlink_metadata(path)?;
        if metadata.is_dir() {
            if recursive {
                self.dir.remove_dir_all(path)?;
            } else {
                self.dir.remove_dir(path)?;
            }
        } else {
            self.dir.remove_file(path)?;
        }
        Ok(Value::Null)
    }
    pub fn transfer(
        &self,
        source: &str,
        destination: &str,
        overwrite: bool,
        moving: bool,
    ) -> Result<Value> {
        valid_path(source, false)?;
        valid_path(destination, false)?;
        let metadata = self.dir.symlink_metadata(source)?;
        if metadata.file_type().is_symlink() {
            return Err(fail(
                "UNSUPPORTED",
                "Copying or moving symbolic links is not supported.",
            ));
        }
        let destination_parent = Path::new(destination)
            .parent()
            .filter(|p| !p.as_os_str().is_empty())
            .unwrap_or(Path::new("."));
        let actual_source = self.dir.canonicalize(source)?;
        let actual_destination = self
            .dir
            .canonicalize(destination_parent)?
            .join(Path::new(destination).file_name().unwrap());
        let comparable = |path: &Path| {
            let text = path.to_string_lossy().replace('\\', "/");
            if cfg!(windows) {
                text.to_lowercase()
            } else {
                text
            }
        };
        let a = comparable(&actual_source);
        let b = comparable(&actual_destination);
        if a == b || (metadata.is_dir() && b.starts_with(&format!("{a}/"))) {
            return Err(fail(
                "INVALID_PATH",
                "The destination must not be the source or its descendant.",
            ));
        }
        if self.dir.try_exists(destination)? {
            if !overwrite {
                return Err(fail("ALREADY_EXISTS", "The destination already exists."));
            }
            if metadata.is_dir() || !self.dir.symlink_metadata(destination)?.is_file() {
                return Err(fail(
                    "UNSUPPORTED",
                    "Replacing directories or links is not supported.",
                ));
            }
        }
        if moving {
            if overwrite {
                self.dir.rename(source, &self.dir, destination)?;
            } else {
                crate::no_replace::rename(&self.dir, Path::new(source), Path::new(destination))?;
            }
        } else {
            self.copy_tree(source, destination, overwrite, 0)?;
        }
        Ok(Value::Null)
    }
    fn copy_tree(
        &self,
        source: &str,
        destination: &str,
        overwrite: bool,
        depth: usize,
    ) -> Result<()> {
        if depth > 128 {
            return Err(fail(
                "UNSUPPORTED",
                "The directory nesting limit was exceeded.",
            ));
        }
        let metadata = self.dir.symlink_metadata(source)?;
        if metadata.is_file() {
            self.write(
                destination,
                &self.read(source)?,
                &WriteOptions {
                    mode: if overwrite {
                        "upsert".into()
                    } else {
                        "create".into()
                    },
                    expected_version: None,
                },
            )?;
        } else if metadata.is_dir() {
            self.dir.create_dir(destination)?;
            for entry in self.dir.read_dir(source)? {
                let name = entry?
                    .file_name()
                    .into_string()
                    .map_err(|_| fail("INVALID_PATH", "A non-UTF-8 name cannot be copied."))?;
                valid_path(&name, false)?;
                self.copy_tree(
                    &format!("{source}/{name}"),
                    &format!("{destination}/{name}"),
                    false,
                    depth + 1,
                )?;
            }
        } else {
            return Err(fail(
                "UNSUPPORTED",
                "Only regular files and directories can be copied.",
            ));
        }
        Ok(())
    }
}
