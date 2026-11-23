use std::io::{IsTerminal, Read};
use std::time::Duration;

use serde_json::Value;

pub fn read_stdin(timeout: Duration) -> Option<Vec<u8>> {
    if std::io::stdin().is_terminal() {
        return None;
    }
    let (tx, rx) = std::sync::mpsc::channel();
    std::thread::spawn(move || {
        let mut buf = Vec::new();
        let ok = std::io::stdin().read_to_end(&mut buf).is_ok();
        let _ = tx.send(ok.then_some(buf));
    });
    rx.recv_timeout(timeout).ok().flatten()
}

pub fn read_stdin_json(timeout: Duration) -> Option<Value> {
    serde_json::from_slice(&read_stdin(timeout)?).ok()
}

pub fn str_field<'a>(v: &'a Value, key: &str) -> Option<&'a str> {
    v.get(key)?.as_str()
}

pub fn nonempty<'a>(v: &'a Value, key: &str) -> Option<&'a str> {
    str_field(v, key).filter(|s| !s.is_empty())
}

pub fn truthy(v: Option<&Value>) -> bool {
    match v {
        None | Some(Value::Null) => false,
        Some(Value::Bool(b)) => *b,
        Some(Value::Number(n)) => n.as_f64().is_some_and(|f| f != 0.0 && !f.is_nan()),
        Some(Value::String(s)) => !s.is_empty(),
        Some(_) => true,
    }
}

pub fn utf16_len(s: &str) -> usize {
    s.encode_utf16().count()
}

pub fn now_ms() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}
