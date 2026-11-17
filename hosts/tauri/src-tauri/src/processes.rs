use serde::{Deserialize, Serialize};

#[derive(Deserialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum Request {
    Start {
        owner: String,
        bytes: Vec<u8>,
        args: Vec<String>,
    },
    Write {
        owner: String,
        id: u32,
        line: String,
    },
    Stop {
        owner: String,
        id: u32,
    },
}

#[derive(Serialize)]
#[serde(untagged)]
pub enum Event {
    Line { line: String },
    Exit { exit: Option<i32> },
}

pub type Notify = Box<dyn Fn(Event) -> bool + Send + 'static>;

#[cfg(windows)]
mod windows {
    use super::{Event, Notify, Request};
    use std::{
        collections::HashMap,
        fs,
        io::{self, BufRead, BufReader, Read, Write},
        mem::size_of,
        os::windows::{
            io::{AsRawHandle, FromRawHandle, OwnedHandle},
            process::CommandExt,
        },
        process::{ChildStdout, Command, Stdio},
        ptr::{null, null_mut},
        sync::{
            atomic::{AtomicU32, Ordering},
            mpsc::{self, SyncSender},
            Arc, Condvar, Mutex,
        },
        thread,
        time::{Duration, Instant},
    };
    use windows_sys::Win32::System::JobObjects::{
        AssignProcessToJobObject, CreateJobObjectW, JobObjectExtendedLimitInformation,
        SetInformationJobObject, TerminateJobObject, JOBOBJECT_EXTENDED_LIMIT_INFORMATION,
        JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE,
    };

    const MAX_BYTES: usize = 16 * 1024 * 1024;
    const MAX_LINE: usize = 16 * 1024;
    const MAX_PROCESSES: usize = 16;
    const MAX_LINES_PER_SECOND: usize = 256;
    const CREATE_NO_WINDOW: u32 = 0x0800_0000;

    struct Job(OwnedHandle);

    impl Job {
        fn create() -> io::Result<Self> {
            // The handle is private and closes with the parent process. The job
            // provides deterministic lifetime cleanup, not process confinement.
            let handle = unsafe { CreateJobObjectW(null(), null_mut()) };
            if handle.is_null() {
                return Err(io::Error::last_os_error());
            }
            let job = Self(unsafe { OwnedHandle::from_raw_handle(handle) });
            let mut limits = JOBOBJECT_EXTENDED_LIMIT_INFORMATION::default();
            limits.BasicLimitInformation.LimitFlags = JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE;
            let set = unsafe {
                SetInformationJobObject(
                    job.0.as_raw_handle(),
                    JobObjectExtendedLimitInformation,
                    (&limits as *const JOBOBJECT_EXTENDED_LIMIT_INFORMATION).cast(),
                    size_of::<JOBOBJECT_EXTENDED_LIMIT_INFORMATION>() as u32,
                )
            };
            if set == 0 {
                return Err(io::Error::last_os_error());
            }
            Ok(job)
        }

        fn assign(&self, child: &std::process::Child) -> io::Result<()> {
            if unsafe { AssignProcessToJobObject(self.0.as_raw_handle(), child.as_raw_handle()) }
                == 0
            {
                return Err(io::Error::last_os_error());
            }
            Ok(())
        }

        fn terminate(&self) {
            // A second request for a process that has already exited is harmless.
            unsafe { TerminateJobObject(self.0.as_raw_handle(), 1) };
        }
    }

    struct Process {
        owner: String,
        job: Job,
        input: Mutex<Option<SyncSender<String>>>,
        finished: (Mutex<bool>, Condvar),
    }

    impl Process {
        fn stop(&self) -> Result<(), String> {
            self.job.terminate();
            let (lock, ready) = &self.finished;
            let done = lock.lock().map_err(|error| error.to_string())?;
            let (done, _) = ready
                .wait_timeout_while(done, Duration::from_secs(3), |done| !*done)
                .map_err(|error| error.to_string())?;
            if !*done {
                return Err("Timed out waiting for the native helper to stop.".into());
            }
            Ok(())
        }
    }

    #[derive(Default)]
    pub struct Registry {
        processes: Arc<Mutex<HashMap<u32, Arc<Process>>>>,
        sequence: AtomicU32,
    }

    impl Drop for Registry {
        fn drop(&mut self) {
            if let Ok(processes) = self.processes.lock() {
                for process in processes.values() {
                    process.job.terminate();
                }
            }
        }
    }

    fn valid_owner(owner: &str) -> bool {
        !owner.is_empty() && owner.len() <= 512 && owner.bytes().all(|byte| byte.is_ascii_graphic())
    }

    fn read_output(stdout: ChildStdout, process: &Process, notify: &Notify) {
        let mut reader = BufReader::new(stdout);
        let mut buffer = Vec::new();
        let mut window = Instant::now();
        let mut lines = 0;
        loop {
            buffer.clear();
            let limit = MAX_LINE + 3;
            let count = match Read::by_ref(&mut reader)
                .take(limit as u64)
                .read_until(b'\n', &mut buffer)
            {
                Ok(0) => return,
                Ok(count) => count,
                Err(_) => break,
            };
            if count >= limit {
                break;
            }
            if window.elapsed() >= Duration::from_secs(1) {
                window = Instant::now();
                lines = 0;
            }
            lines += 1;
            if lines > MAX_LINES_PER_SECOND {
                break;
            }
            if buffer.last() == Some(&b'\n') {
                buffer.pop();
            }
            if buffer.last() == Some(&b'\r') {
                buffer.pop();
            }
            if buffer.len() > MAX_LINE {
                break;
            }
            let Ok(line) = std::str::from_utf8(&buffer) else {
                break;
            };
            if !notify(Event::Line {
                line: line.to_owned(),
            }) {
                break;
            }
        }
        process.job.terminate();
    }

    impl Registry {
        pub fn dispatch(
            &self,
            request: Request,
            notify: Option<Notify>,
        ) -> Result<Option<u32>, String> {
            let owner = match &request {
                Request::Start { owner, .. }
                | Request::Write { owner, .. }
                | Request::Stop { owner, .. } => owner,
            };
            if !valid_owner(owner) {
                return Err("Invalid activation identity.".into());
            }
            match request {
                Request::Start { owner, bytes, args } => self
                    .start(
                        owner,
                        bytes,
                        args,
                        notify.ok_or("Native helper requires an output channel.")?,
                    )
                    .map(Some),
                Request::Write { owner, id, line } => {
                    if line.len() > MAX_LINE || line.contains(['\r', '\n', '\0']) {
                        return Err("Expected one bounded line.".into());
                    }
                    let process = self
                        .find(&owner, id)?
                        .ok_or("Native helper is no longer running.")?;
                    let input = process.input.lock().map_err(|error| error.to_string())?;
                    input
                        .as_ref()
                        .ok_or("Native helper input is closed.")?
                        .try_send(line)
                        .map_err(|_| "Native helper input is busy or closed.")?;
                    Ok(None)
                }
                Request::Stop { owner, id } => {
                    if let Some(process) = self.find(&owner, id)? {
                        process.stop()?;
                    }
                    Ok(None)
                }
            }
        }

        fn find(&self, owner: &str, id: u32) -> Result<Option<Arc<Process>>, String> {
            let all = self.processes.lock().map_err(|error| error.to_string())?;
            let process = all.get(&id);
            if process.is_some_and(|process| process.owner != owner) {
                return Err("Native helper belongs to another activation.".into());
            }
            Ok(process.cloned())
        }

        fn start(
            &self,
            owner: String,
            bytes: Vec<u8>,
            args: Vec<String>,
            notify: Notify,
        ) -> Result<u32, String> {
            if bytes.len() > MAX_BYTES
                || !bytes.starts_with(b"MZ")
                || args.len() > 32
                || args
                    .iter()
                    .any(|arg| arg.len() > 1024 || arg.contains('\0'))
            {
                return Err(
                    "Expected a packaged Windows executable and bounded argument data.".into(),
                );
            }
            let mut all = self.processes.lock().map_err(|error| error.to_string())?;
            if all.len() == MAX_PROCESSES {
                return Err("Too many active native helpers.".into());
            }
            let id = self
                .sequence
                .load(Ordering::Relaxed)
                .checked_add(1)
                .ok_or("Native helper sequence is exhausted.")?;
            self.sequence.store(id, Ordering::Relaxed);
            let temporary = tempfile::Builder::new()
                .prefix("lunaris-helper-")
                .tempdir()
                .map_err(|error| error.to_string())?;
            let executable = temporary.path().join("helper.exe");
            fs::write(&executable, bytes).map_err(|error| error.to_string())?;
            let job = Job::create().map_err(|error| error.to_string())?;
            let mut child = Command::new(executable)
                .args(args)
                .current_dir(temporary.path())
                .creation_flags(CREATE_NO_WINDOW)
                .stdin(Stdio::piped())
                .stdout(Stdio::piped())
                .stderr(Stdio::null())
                .spawn()
                .map_err(|error| error.to_string())?;
            if let Err(error) = job.assign(&child) {
                if child.try_wait().ok().flatten().is_none() {
                    let _ = child.kill();
                    let _ = child.wait();
                    return Err(error.to_string());
                }
            }
            let mut stdin = child.stdin.take().expect("piped stdin");
            let stdout = child.stdout.take().expect("piped stdout");
            let (sender, input) = mpsc::sync_channel::<String>(16);
            let process = Arc::new(Process {
                owner,
                job,
                input: Mutex::new(Some(sender)),
                finished: (Mutex::new(false), Condvar::new()),
            });
            all.insert(id, Arc::clone(&process));
            let registry = Arc::clone(&self.processes);
            thread::spawn(move || {
                let writer = thread::spawn(move || {
                    while let Ok(line) = input.recv() {
                        if writeln!(stdin, "{line}").is_err() {
                            break;
                        }
                    }
                });
                let watcher = Arc::clone(&process);
                let reader = thread::spawn(move || {
                    read_output(stdout, &watcher, &notify);
                    notify
                });
                let exit = child.wait().ok().and_then(|status| status.code());
                process.job.terminate();
                if let Ok(mut input) = process.input.lock() {
                    input.take();
                }
                let _ = writer.join();
                let final_notification = reader.join();
                drop(temporary);
                if let Ok(mut done) = process.finished.0.lock() {
                    *done = true;
                    process.finished.1.notify_all();
                }
                if let Ok(mut registry) = registry.lock() {
                    registry.remove(&id);
                }
                if let Ok(notify) = final_notification {
                    notify(Event::Exit { exit });
                }
            });
            Ok(id)
        }
    }

    #[cfg(test)]
    mod tests {
        use super::*;

        #[test]
        fn only_bounded_portable_messages_are_accepted() {
            let registry = Registry::default();
            let notify: Notify = Box::new(|_| true);
            assert!(registry
                .dispatch(
                    Request::Start {
                        owner: "author.plugin/1".into(),
                        bytes: b"not an executable".into(),
                        args: vec![],
                    },
                    Some(notify)
                )
                .unwrap_err()
                .contains("Windows executable"));
            assert!(registry
                .dispatch(
                    Request::Write {
                        owner: "author.plugin/1".into(),
                        id: 1,
                        line: "two\nlines".into(),
                    },
                    None
                )
                .unwrap_err()
                .contains("one bounded line"));
            assert!(registry
                .dispatch(
                    Request::Stop {
                        owner: " ".into(),
                        id: 1
                    },
                    None
                )
                .is_err());
            assert!(registry
                .dispatch(
                    Request::Stop {
                        owner: "author.plugin/1".into(),
                        id: 1
                    },
                    None
                )
                .unwrap()
                .is_none());
        }

        #[test]
        fn runs_a_packaged_process_with_owned_pipes_and_awaited_shutdown() {
            let fixture = tempfile::tempdir().unwrap();
            let source = fixture.path().join("probe.rs");
            let binary = fixture.path().join("probe.exe");
            fs::write(
                &source,
                r#"
use std::io::{self, BufRead};
fn main() {
    println!("ready:{}", std::env::args().nth(1).unwrap());
    for line in io::stdin().lock().lines() {
        println!("echo:{}", line.unwrap());
    }
}
"#,
            )
            .unwrap();
            assert!(Command::new("rustc")
                .arg(&source)
                .arg("-o")
                .arg(&binary)
                .status()
                .unwrap()
                .success());
            let registry = Registry::default();
            let owner = "author.probe/2".to_owned();
            let (tx, rx) = mpsc::channel();
            let id = registry
                .dispatch(
                    Request::Start {
                        owner: owner.clone(),
                        bytes: fs::read(binary).unwrap(),
                        args: vec!["one two".into()],
                    },
                    Some(Box::new(move |event| tx.send(event).is_ok())),
                )
                .unwrap()
                .unwrap();
            let receive = || rx.recv_timeout(Duration::from_secs(3)).unwrap();
            assert!(matches!(receive(), Event::Line { line } if line == "ready:one two"));
            assert!(registry
                .dispatch(
                    Request::Stop {
                        owner: "foreign.plugin/1".into(),
                        id
                    },
                    None
                )
                .is_err());
            registry
                .dispatch(
                    Request::Write {
                        owner: owner.clone(),
                        id,
                        line: "ping".into(),
                    },
                    None,
                )
                .unwrap();
            assert!(matches!(receive(), Event::Line { line } if line == "echo:ping"));
            registry
                .dispatch(
                    Request::Stop {
                        owner: owner.clone(),
                        id,
                    },
                    None,
                )
                .unwrap();
            assert!(matches!(receive(), Event::Exit { exit: Some(1) }));
            assert!(registry.find(&owner, id).unwrap().is_none());
        }
    }
}

#[cfg(windows)]
pub use windows::Registry;

#[cfg(not(windows))]
#[derive(Default)]
pub struct Registry;

#[cfg(not(windows))]
impl Registry {
    pub fn dispatch(
        &self,
        _request: Request,
        _notify: Option<Notify>,
    ) -> Result<Option<u32>, String> {
        Err("Packaged native helpers are supported on Windows.".into())
    }
}
