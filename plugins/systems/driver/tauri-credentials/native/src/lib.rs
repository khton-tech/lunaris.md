use serde_json::{json, Value};
use std::sync::Mutex;
static STORE: Mutex<()> = Mutex::new(());
fn failure(code: &str) -> Value { json!({"ok":false,"error":{"code":code,"message":"Secure session storage is unavailable."}}) }
fn valid(value: &Value) -> bool {
    let text = |key: &str, max: usize| value[key].as_str().is_some_and(|v| !v.is_empty() && v.len() <= max);
    text("server", 2048) && text("token", 1024) && value["account"]["id"].as_str().is_some_and(|v| !v.is_empty() && v.len() <= 200)
        && value["account"]["login"].as_str().is_some_and(|v| !v.is_empty() && v.chars().count() <= 64)
}
#[cfg(any(windows, target_os = "macos", target_os = "linux"))]
pub fn dispatch(operation: &str, value: Value) -> Value { dispatch_for("server-session-v1", operation, value) }
#[cfg(any(windows, target_os = "macos", target_os = "linux"))]
fn dispatch_for(user: &str, operation: &str, value: Value) -> Value {
    let Ok(_guard) = STORE.lock() else { return failure("IO_ERROR") };
    let Ok(entry) = keyring::Entry::new("app.lunaris.desktop", user) else { return failure("IO_ERROR") };
    let read = || match entry.get_password() { Ok(s) => serde_json::from_str::<Value>(&s).map_err(|_| ()), Err(keyring::Error::NoEntry) => Ok(Value::Null), Err(_) => Err(()) };
    match operation {
        "load" => match read() { Ok(v) if v.is_null() || valid(&v) => json!({"ok":true,"value":v}), _ => failure("IO_ERROR") },
        "save" => {
            if !valid(&value) { return failure("INVALID_ARGUMENT"); }
            match entry.set_password(&value.to_string()) { Ok(()) => json!({"ok":true,"value":null}), Err(_) => failure("IO_ERROR") }
        },
        "remove" => {
            let Some(token) = value.as_str() else { return failure("INVALID_ARGUMENT") };
            match read() {
                Ok(v) if v["token"].as_str() == Some(token) => match entry.delete_credential() {
                    Ok(()) | Err(keyring::Error::NoEntry) => json!({"ok":true,"value":null}), Err(_) => failure("IO_ERROR") },
                Ok(_) => json!({"ok":true,"value":null}), Err(_) => failure("IO_ERROR")
            }
        },
        _ => failure("INVALID_ARGUMENT")
    }
}
#[cfg(not(any(windows, target_os = "macos", target_os = "linux")))]
pub fn dispatch(_operation: &str, _value: Value) -> Value { failure("UNSUPPORTED") }

#[cfg(all(test, any(windows, target_os = "macos", target_os = "linux")))]
mod tests {
    use super::*;
    #[test]
    fn native_roundtrip_and_conditional_removal() {
        let key = format!("test-{}-{}", std::process::id(), std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_nanos());
        let record = json!({"server":"https://test.example","account":{"id":"a","login":"test"},"token":"test-secret"});
        assert_eq!(dispatch_for(&key, "load", Value::Null)["value"], Value::Null);
        assert_eq!(dispatch_for(&key, "save", record.clone())["ok"], true);
        assert_eq!(dispatch_for(&key, "load", Value::Null)["value"], record);
        assert_eq!(dispatch_for(&key, "remove", json!("older-token"))["ok"], true);
        assert_eq!(dispatch_for(&key, "load", Value::Null)["value"], record);
        assert_eq!(dispatch_for(&key, "remove", json!("test-secret"))["ok"], true);
        assert_eq!(dispatch_for(&key, "load", Value::Null)["value"], Value::Null);
        assert_eq!(dispatch_for(&key, "save", json!({"password":"invalid"}))["ok"], false);
    }
}
