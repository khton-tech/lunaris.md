use std::{io, ptr::null_mut};
use tauri::{Position, Window};
use windows_sys::Win32::{
    Foundation::{HWND, LPARAM, LRESULT, WPARAM},
    UI::{
        Shell::{DefSubclassProc, RemoveWindowSubclass, SetWindowSubclass},
        WindowsAndMessaging::{
            SetWindowPos, MA_NOACTIVATE, PA_NOACTIVATE, SET_WINDOW_POS_FLAGS, SWP_HIDEWINDOW,
            SWP_NOACTIVATE, SWP_NOMOVE, SWP_NOOWNERZORDER, SWP_NOSIZE, SWP_NOZORDER,
            SWP_SHOWWINDOW, WM_MOUSEACTIVATE, WM_NCDESTROY, WM_POINTERACTIVATE,
        },
    },
};

unsafe extern "system" fn passive_window_proc(
    hwnd: HWND,
    message: u32,
    wparam: WPARAM,
    lparam: LPARAM,
    id: usize,
    _: usize,
) -> LRESULT {
    match message {
        WM_MOUSEACTIVATE => return MA_NOACTIVATE as LRESULT,
        WM_POINTERACTIVATE => return PA_NOACTIVATE as LRESULT,
        WM_NCDESTROY => {
            // The callback is installed on this HWND's owning thread and has no user data.
            unsafe { RemoveWindowSubclass(hwnd, Some(passive_window_proc), id) };
        }
        _ => {}
    }
    unsafe { DefSubclassProc(hwnd, message, wparam, lparam) }
}

pub(super) fn register(window: &Window) -> Result<(), String> {
    let hwnd = window.hwnd().map_err(|error| error.to_string())?.0;
    // NewWindowRequested builds the hidden popup on its owning UI thread.
    let registered = unsafe { SetWindowSubclass(hwnd, Some(passive_window_proc), 1, 0) };
    if registered == 0 {
        return Err("Cannot install the window's no-activation handler.".into());
    }
    Ok(())
}

fn position_flags(moving: bool, visible: Option<bool>) -> SET_WINDOW_POS_FLAGS {
    SWP_NOACTIVATE
        | SWP_NOSIZE
        | SWP_NOZORDER
        | SWP_NOOWNERZORDER
        | if moving { 0 } else { SWP_NOMOVE }
        | match visible {
            Some(true) => SWP_SHOWWINDOW,
            Some(false) => SWP_HIDEWINDOW,
            None => 0,
        }
}

pub(super) fn update(
    window: &Window,
    position: Option<Position>,
    visible: Option<bool>,
) -> Result<(), String> {
    if position.is_none() && visible.is_none() {
        return Ok(());
    }
    let hwnd = window.hwnd().map_err(|error| error.to_string())?.0;
    let (x, y) = match position {
        Some(Position::Physical(position)) => (position.x, position.y),
        Some(Position::Logical(position)) => {
            let physical = position
                .to_physical::<i32>(window.scale_factor().map_err(|error| error.to_string())?);
            (physical.x, physical.y)
        }
        None => (0, 0),
    };
    // Tao drops the initial `focused(false)` marker after creation. Its normal
    // show path uses SW_SHOW. Keep activation and Z ordering independent here.
    let updated = unsafe {
        SetWindowPos(
            hwnd,
            null_mut(),
            x,
            y,
            0,
            0,
            position_flags(position.is_some(), visible),
        )
    };
    if updated == 0 {
        return Err(io::Error::last_os_error().to_string());
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn passive_visibility_and_moves_do_not_activate_or_restack_the_window() {
        let preserve = SWP_NOACTIVATE | SWP_NOSIZE | SWP_NOZORDER | SWP_NOOWNERZORDER;
        assert_eq!(
            position_flags(false, Some(true)),
            preserve | SWP_NOMOVE | SWP_SHOWWINDOW
        );
        assert_eq!(
            position_flags(false, Some(false)),
            preserve | SWP_NOMOVE | SWP_HIDEWINDOW
        );
        assert_eq!(position_flags(true, Some(true)), preserve | SWP_SHOWWINDOW);
        assert_eq!(position_flags(true, None), preserve);
    }
}
