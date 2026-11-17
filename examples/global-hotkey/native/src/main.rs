use std::io::{self, BufRead, Write};
use std::process::ExitCode;
use std::ptr::null_mut;

use windows_sys::Win32::System::Threading::GetCurrentThreadId;
use windows_sys::Win32::UI::Input::KeyboardAndMouse::{
    MOD_ALT, MOD_CONTROL, MOD_NOREPEAT, MOD_SHIFT, RegisterHotKey, UnregisterHotKey,
};
use windows_sys::Win32::UI::WindowsAndMessaging::{
    GetMessageW, MSG, PM_NOREMOVE, PeekMessageW, PostThreadMessageW, WM_HOTKEY, WM_QUIT, WM_USER,
};

const HOTKEY_ID: i32 = 1;

fn emit(output: &mut impl Write, line: &str) -> io::Result<()> {
    writeln!(output, "{line}")?;
    output.flush()
}

struct Registration;

impl Drop for Registration {
    fn drop(&mut self) {
        // A null HWND releases the shortcut registered on this thread.
        unsafe { UnregisterHotKey(null_mut(), HOTKEY_ID) };
    }
}

fn run(output: &mut impl Write) -> io::Result<()> {
    let mut message = MSG::default();
    // Create this thread's message queue before accepting shutdown from stdin.
    unsafe { PeekMessageW(&mut message, null_mut(), WM_USER, WM_USER, PM_NOREMOVE) };
    let modifiers = MOD_CONTROL | MOD_ALT | MOD_SHIFT | MOD_NOREPEAT;
    if unsafe { RegisterHotKey(null_mut(), HOTKEY_ID, modifiers, u32::from(b'H')) } == 0 {
        return Err(io::Error::last_os_error());
    }
    let _registration = Registration;
    let thread = unsafe { GetCurrentThreadId() };
    std::thread::Builder::new()
        .name("hotkey-stdin".into())
        .spawn(move || {
            for line in io::stdin().lock().lines() {
                match line.as_deref() {
                    Ok("stop") | Err(_) => break,
                    _ => {}
                }
            }
            // EOF also stops this helper. All calls after registration use this process's queue.
            unsafe { PostThreadMessageW(thread, WM_QUIT, 0, 0) };
        })?;
    emit(output, "ready")?;
    loop {
        match unsafe { GetMessageW(&mut message, null_mut(), 0, 0) } {
            -1 => return Err(io::Error::last_os_error()),
            0 => return Ok(()),
            _ if message.message == WM_HOTKEY && message.wParam == HOTKEY_ID as usize => {
                emit(output, "pressed")?;
            }
            _ => {}
        }
    }
}

fn probe(output: &mut impl Write) -> io::Result<()> {
    emit(output, "ready")?;
    for line in io::stdin().lock().lines() {
        match line?.as_str() {
            "stop" => break,
            "press" => emit(output, "pressed")?,
            _ => {}
        }
    }
    Ok(())
}

fn main() -> ExitCode {
    let mut output = io::stdout().lock();
    let args: Vec<_> = std::env::args_os().skip(1).collect();
    let result = match args.as_slice() {
        [] => run(&mut output),
        [arg] if arg == "--probe" => probe(&mut output),
        _ => Err(io::Error::new(
            io::ErrorKind::InvalidInput,
            "Unknown arguments",
        )),
    };
    match result {
        Ok(()) => ExitCode::SUCCESS,
        Err(error) => {
            let _ = emit(
                &mut output,
                &format!("error:{}", error.raw_os_error().unwrap_or(0)),
            );
            ExitCode::FAILURE
        }
    }
}
