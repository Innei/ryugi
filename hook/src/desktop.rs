use std::io::{BufRead, Write};
use std::path::Path;
use std::process::Command;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::mpsc::{self, Receiver, RecvTimeoutError};
use std::sync::{Mutex, OnceLock};
use std::time::{Duration, Instant};

use serde_json::{json, Value};

const BRIDGE: &str = include_str!("desktop.cjs");
const INPUT: &str = "RYUGI_CODEX_HOOK_INPUT";

pub fn bridged() -> bool {
    std::env::var_os(INPUT).is_some()
}

pub fn bridged_input() -> Option<Value> {
    serde_json::from_str(&std::env::var(INPUT).ok()?).ok()
}

// Codex desktop only answers a pipe peer whose ancestors are all its own processes, so the
// app runtime must replace this hook process rather than run as its child.
pub fn hand_over(runtime: &Path, input: &Value) -> String {
    use std::os::unix::process::CommandExt;
    let exe = match std::env::current_exe() {
        Ok(exe) => exe,
        Err(e) => return e.to_string(),
    };
    Command::new(runtime)
        .args(["-e", BRIDGE])
        .env(INPUT, input.to_string())
        .env("RYUGI_HOOK_SELF", exe)
        .exec()
        .to_string()
}

fn replies() -> &'static Mutex<Receiver<Value>> {
    static REPLIES: OnceLock<Mutex<Receiver<Value>>> = OnceLock::new();
    REPLIES.get_or_init(|| {
        let (tx, rx) = mpsc::channel();
        std::thread::spawn(move || {
            for line in std::io::stdin().lock().lines() {
                let Ok(line) = line else { break };
                if let Ok(reply) = serde_json::from_str::<Value>(&line) {
                    if tx.send(reply).is_err() {
                        break;
                    }
                }
            }
        });
        Mutex::new(rx)
    })
}

pub fn send(session: &str, message: &str) -> Result<String, String> {
    static NEXT: AtomicU64 = AtomicU64::new(1);
    let id = NEXT.fetch_add(1, Ordering::Relaxed);
    let replies = replies().lock().unwrap_or_else(|e| e.into_inner());
    let request = json!({"ryugi": "desktop", "id": id, "session": session, "message": message, "timeoutMs": 15000});
    {
        let mut out = std::io::stdout().lock();
        writeln!(out, "{request}").and_then(|_| out.flush()).map_err(|e| format!("The Codex desktop runtime is gone: {e}"))?;
    }
    let deadline = Instant::now() + Duration::from_secs(20);
    loop {
        match replies.recv_timeout(deadline.saturating_duration_since(Instant::now())) {
            Ok(reply) if reply["id"].as_u64() == Some(id) => {
                return match (reply["receipt"].as_str(), reply["error"].as_str()) {
                    (Some(receipt), _) => Ok(receipt.into()),
                    (_, Some(error)) => Err(error.into()),
                    _ => Err("Codex desktop returned an invalid callback receipt.".into()),
                };
            }
            Ok(_) => {}
            Err(RecvTimeoutError::Timeout) => return Err("Codex desktop callback timed out. Delivery is unconfirmed.".into()),
            Err(RecvTimeoutError::Disconnected) => return Err("The Codex desktop runtime closed.".into()),
        }
    }
}
