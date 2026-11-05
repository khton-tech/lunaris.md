use cap_std::fs::Dir;
use std::io;
use std::path::Path;

/// Keep parent capabilities open and let Windows reject an existing destination
/// in the rename itself, rather than relying on a separate existence check.
#[cfg(windows)]
pub fn rename(root: &Dir, source: &Path, destination: &Path) -> io::Result<()> {
    use std::ffi::{OsStr, OsString};
    use std::os::windows::ffi::{OsStrExt, OsStringExt};
    use std::os::windows::io::AsRawHandle;
    use windows_sys::Win32::Storage::FileSystem::{GetFinalPathNameByHandleW, MoveFileExW};

    fn full_name(dir: &Dir, name: &OsStr) -> io::Result<Vec<u16>> {
        let mut buffer = vec![0u16; 512];
        loop {
            // SAFETY: the capability owns a live handle and the mutable buffer
            // has exactly the capacity passed to the Windows API.
            let length = unsafe {
                GetFinalPathNameByHandleW(
                    dir.as_raw_handle(),
                    buffer.as_mut_ptr(),
                    buffer.len() as u32,
                    0,
                )
            } as usize;
            if length == 0 {
                return Err(io::Error::last_os_error());
            }
            if length < buffer.len() {
                buffer.truncate(length);
                let path = std::path::PathBuf::from(OsString::from_wide(&buffer)).join(name);
                return Ok(path.as_os_str().encode_wide().chain(Some(0)).collect());
            }
            if length > 65535 {
                return Err(io::Error::new(
                    io::ErrorKind::InvalidInput,
                    "The native path is too long.",
                ));
            }
            buffer.resize(length + 1, 0);
        }
    }
    let parent = |path: &Path| {
        root.open_dir(
            path.parent()
                .filter(|p| !p.as_os_str().is_empty())
                .unwrap_or(Path::new(".")),
        )
    };
    let from = parent(source)?;
    let to = parent(destination)?;
    let source = full_name(
        &from,
        source.file_name().ok_or(io::ErrorKind::InvalidInput)?,
    )?;
    let destination = full_name(
        &to,
        destination.file_name().ok_or(io::ErrorKind::InvalidInput)?,
    )?;
    // SAFETY: both paths are owned, NUL-terminated UTF-16 buffers derived from
    // validated child names and live capability parents. Zero flags prohibit replacement.
    if unsafe { MoveFileExW(source.as_ptr(), destination.as_ptr(), 0) } == 0 {
        return Err(io::Error::last_os_error());
    }
    Ok(())
}

#[cfg(not(windows))]
pub fn rename(_root: &Dir, _source: &Path, _destination: &Path) -> io::Result<()> {
    Err(io::Error::new(
        io::ErrorKind::Unsupported,
        "No-replace rename is implemented for the first Windows target only.",
    ))
}
