use super::*;

const PREFIX: &str = "tauri-folder-v1-";

impl Backend {
    fn location_registry(&self) -> Result<Root> {
        let base = self
            .config_directory
            .as_ref()
            .ok_or_else(|| fail("UNSUPPORTED", "The host cannot persist folder locations."))?;
        std::fs::create_dir_all(base)?;
        let dir = Dir::open_ambient_dir(base, cap_std::ambient_authority())?;
        dir.create_dir_all("folder-locations-v1")?;
        Ok(Root {
            dir: dir.open_dir("folder-locations-v1")?,
            path: base.join("folder-locations-v1"),
            watchers: HashMap::new(),
        })
    }

    /// Called only after native user selection, never with a plugin-supplied path.
    pub(crate) fn register_location(&self, path: PathBuf) -> Result<Value> {
        let path = path.canonicalize()?;
        Dir::open_ambient_dir(&path, cap_std::ambient_authority())?;
        let data = serde_json::to_vec(&path)
            .map_err(|_| fail("INVALID_PATH", "The selected folder cannot be persisted."))?;
        let digest = operations::version(&data);
        let reference = format!("{PREFIX}{}", &digest[7..]);
        let file = format!("{reference}.json");
        let registry = self.location_registry()?;
        match registry.write(
            &file,
            &data,
            &WriteOptions {
                mode: "create".into(),
                expected_version: None,
            },
        ) {
            Ok(_) => (),
            Err(error) if error.code == "ALREADY_EXISTS" => {
                if registry.read(&file)? != data {
                    return Err(fail("CONFLICT", "The folder location record has changed."));
                }
            }
            Err(error) => return Err(error),
        }
        let label = path.display().to_string();
        Ok(json!({ "reference": reference, "label": label }))
    }

    pub(crate) fn resolve_location(&self, reference: &str) -> Result<PathBuf> {
        let suffix = reference
            .strip_prefix(PREFIX)
            .ok_or_else(|| fail("INVALID_ARGUMENT", "Unsupported folder location reference."))?;
        if suffix.len() != 64
            || !suffix
                .bytes()
                .all(|b| b.is_ascii_digit() || (b'a'..=b'f').contains(&b))
        {
            return Err(fail(
                "INVALID_ARGUMENT",
                "Invalid folder location reference.",
            ));
        }
        let registry = self.location_registry()?;
        let data = registry.read(&format!("{reference}.json"))?;
        if operations::version(&data) != format!("sha256:{suffix}") {
            return Err(fail("CONFLICT", "The folder location record has changed."));
        }
        let path: PathBuf = serde_json::from_slice(&data)
            .map_err(|_| fail("INVALID_ARGUMENT", "Invalid folder location record."))?;
        if !path.is_absolute() {
            return Err(fail(
                "INVALID_PATH",
                "The folder location must be absolute.",
            ));
        }
        let resolved = path.canonicalize()?;
        if resolved != path {
            return Err(fail(
                "CONFLICT",
                "The stored folder location has been redirected.",
            ));
        }
        Ok(resolved)
    }
}
