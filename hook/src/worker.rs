use std::io::Write;
use std::path::Path;
use std::time::Duration;

use serde_json::{json, Map, Value};

pub fn read_json(file: &Path) -> Option<Value> {
    serde_json::from_str(&std::fs::read_to_string(file).ok()?).ok()
}

pub fn claim(file: &Path, mut state: Map<String, Value>, supersede: impl Fn(&Value) -> bool) -> Option<Map<String, Value>> {
    use std::os::unix::fs::OpenOptionsExt;
    std::fs::create_dir_all(file.parent()?).ok()?;
    state.insert("pid".into(), json!(std::process::id()));
    state.insert("token".into(), json!(crate::ids::random_uuid()));
    let mut ordered = Map::new();
    for key in ["pid", "token"] {
        ordered.insert(key.into(), state.remove(key).unwrap());
    }
    ordered.extend(state);
    for _ in 0..2 {
        match std::fs::OpenOptions::new().write(true).create_new(true).mode(0o600).open(file) {
            Ok(mut f) => {
                let _ = f.write_all(Value::Object(ordered.clone()).to_string().as_bytes());
                return Some(ordered);
            }
            Err(e) if e.kind() == std::io::ErrorKind::AlreadyExists => {
                let previous = read_json(file);
                if let Some(pid) = previous.as_ref().and_then(|p| p["pid"].as_i64()).filter(|p| crate::sys::alive(*p)) {
                    if previous.as_ref().is_some_and(&supersede) {
                        if read_json(file).map(|v| v["token"].clone()) == previous.as_ref().map(|v| v["token"].clone()) {
                            let _ = std::fs::remove_file(file);
                        }
                        crate::sys::terminate(pid);
                        continue;
                    }
                    return None;
                }
                if previous.is_none() {
                    let fresh = std::fs::metadata(file)
                        .and_then(|m| m.modified())
                        .ok()
                        .and_then(|t| t.elapsed().ok())
                        .is_some_and(|age| age < Duration::from_secs(5));
                    if fresh {
                        return None;
                    }
                }
                if read_json(file).map(|v| v["token"].clone()) == previous.map(|v| v["token"].clone()) {
                    let _ = std::fs::remove_file(file);
                }
            }
            Err(_) => return None,
        }
    }
    None
}


pub fn stop_worker(file: &Path) {
    let worker = read_json(file);
    let _ = std::fs::remove_file(file);
    if let Some(pid) = worker.and_then(|w| w["pid"].as_i64()) {
        if pid != std::process::id() as i64 && crate::sys::alive(pid) {
            crate::sys::terminate(pid);
        }
    }
}

pub fn write_state(file: &Path, state: &Value) {
    let _ = crate::subs::write_private(file, &state.to_string());
}

pub fn updater(file: &Path, state: &Value) -> impl Fn(Value) + Send + Sync + 'static {
    let (file, state) = (file.to_path_buf(), state.clone());
    move |fields: Value| {
        if read_json(&file).map(|v| v["token"].clone()) == Some(state["token"].clone()) {
            let mut next = state.as_object().cloned().unwrap_or_default();
            next.extend(fields.as_object().cloned().unwrap_or_default());
            write_state(&file, &Value::Object(next));
        }
    }
}

pub fn release(file: &Path, token: &Value) {
    if read_json(file).map(|v| v["token"].clone()) == Some(token.clone()) {
        let _ = std::fs::remove_file(file);
    }
}
