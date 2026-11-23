use std::io::Read;
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

use serde_json::{json, Map, Value};

use crate::channel::{open, Options, Signal};
use crate::hosts::{valid_host_name, valid_session, DEFAULT_TIMEOUT_MS};
use crate::queue::{Hooks, Outcome, Queue};
use crate::text::js_trim;
use crate::worker::read_json;

pub const UNSUBSCRIBE_EXIT_CODE: i32 = 10;
const MAX_OUTPUT: usize = 64 * 1024;

fn worker_file(host: &str, session: &str) -> PathBuf {
    let base = std::env::var("PLUGIN_DATA").ok().filter(|v| !v.is_empty()).map(PathBuf::from).unwrap_or_else(|| {
        std::env::var("XDG_CACHE_HOME")
            .ok()
            .filter(|v| !v.is_empty())
            .map(PathBuf::from)
            .unwrap_or_else(|| crate::paths::home().unwrap_or_default().join(".cache"))
            .join("ryugi")
    });
    base.join("cmd-comment-watch/workers")
        .join(host)
        .join(format!("{}.json", crate::http::encode_component(session)))
}

fn command_key(command: &[String], agent: &str, timeout: &Value) -> String {
    crate::evidence::js_stringify(&json!({"command": command, "agent": agent, "timeoutMs": timeout}))
}

struct Ctx {
    host: String,
    session: String,
    project: PathBuf,
    command: Option<Vec<String>>,
    agent: String,
    timeout: Value,
    key: String,
    file: PathBuf,
}

fn root_of(dir: &Path) -> PathBuf {
    crate::paths::project_root(dir).unwrap_or_else(|| crate::event::resolve(&std::env::current_dir().unwrap_or_default(), &dir.to_string_lossy()))
}

fn context(input: &Value) -> Option<Ctx> {
    let mut host = input.get("host").and_then(Value::as_str).filter(|h| valid_host_name(h)).map(str::to_string);
    let mut session = input.get("session").and_then(Value::as_str).filter(|s| valid_session(s)).map(str::to_string);
    let mut command: Option<Vec<String>> = input.get("command").and_then(Value::as_array).and_then(|parts| {
        let parts: Option<Vec<String>> = parts.iter().map(|p| p.as_str().map(str::to_string)).collect();
        parts.filter(|p| !p.is_empty() && !js_trim(&p[0]).is_empty())
    });
    let mut agent = input.get("agent").and_then(Value::as_str).map(js_trim).filter(|a| !a.is_empty()).map(str::to_string);
    let mut timeout = input.get("timeoutMs").filter(|t| t.as_f64().is_some_and(f64::is_finite)).cloned();
    if host.is_none() || session.is_none() || command.is_none() {
        let matched = match &host {
            Some(h) => crate::hosts::load().into_iter().find(|c| &c.0 == h).map(|(name, env_name, agent, command, t)| {
                let s = session.clone().or_else(|| std::env::var(&env_name).ok().filter(|v| valid_session(v)));
                (name, s, command, agent, t)
            }),
            None => match crate::hosts::match_custom_host() {
                Ok(m) => m.map(|c| (c.host, Some(c.session), c.command, c.agent, c.timeout_ms)),
                Err(_) => return None,
            },
        };
        if let Some((h, s, c, a, t)) = matched {
            host = host.or(Some(h));
            session = session.or(s);
            command = command.or(Some(c));
            agent = agent.or(Some(a));
            timeout = timeout.or(Some(json!(t)));
        }
    }
    let (host, session) = (host?, session?);
    let raw = crate::input::nonempty(input, "project")
        .or_else(|| crate::input::nonempty(input, "cwd"))
        .map(PathBuf::from)
        .unwrap_or_else(|| std::env::current_dir().unwrap_or_default());
    let agent = agent.unwrap_or_else(|| host.clone());
    let timeout = timeout.unwrap_or(json!(DEFAULT_TIMEOUT_MS));
    Some(Ctx {
        key: command.as_ref().map(|c| command_key(c, &agent, &timeout)).unwrap_or_default(),
        file: worker_file(&host, &session),
        project: root_of(&raw),
        host,
        session,
        command,
        agent,
        timeout,
    })
}

pub fn parse_receipt(stdout: &str) -> Option<Map<String, Value>> {
    let trimmed = js_trim(stdout);
    if trimmed.is_empty() {
        return None;
    }
    let mut candidates = vec![trimmed];
    if let Some(last) = trimmed.split('\n').next_back().map(js_trim) {
        if !last.is_empty() && last != trimmed {
            candidates.push(last);
        }
    }
    candidates.into_iter().find_map(|text| {
        if !text.starts_with('{') || !text.ends_with('}') {
            return None;
        }
        serde_json::from_str::<Value>(text).ok()?.as_object().cloned()
    })
}

enum Delivery {
    Delivered(String, String),
    Unsubscribe,
}

fn capture(r: Option<impl Read + Send + 'static>) -> std::thread::JoinHandle<String> {
    std::thread::spawn(move || {
        let mut buf = Vec::new();
        if let Some(r) = r {
            let _ = r.take(MAX_OUTPUT as u64 * 4).read_to_end(&mut buf);
        }
        let text = String::from_utf8_lossy(&buf).into_owned();
        let units: Vec<u16> = text.encode_utf16().take(MAX_OUTPUT).collect();
        String::from_utf16_lossy(&units)
    })
}

fn deliver(ctx: &Ctx, event: &Value) -> Result<Delivery, String> {
    use std::io::Write;
    let command = ctx.command.as_ref().ok_or("no command")?;
    let message = crate::wake::wake_message(event, None);
    let project = match event.get("project").filter(|p| crate::input::truthy(Some(p))) {
        Some(p) => crate::text::js_str(Some(p)),
        None => ctx.project.to_string_lossy().into_owned(),
    };
    let payload = json!({
        "protocol": 1,
        "host": ctx.host,
        "session": ctx.session,
        "project": project,
        "artifact": event.get("artifact"),
        "type": event.get("type"),
        "wakeMessage": message,
        "event": event,
    });
    let mut child = Command::new(&command[0])
        .args(&command[1..])
        .current_dir(&project)
        .env("RYUGI_HOST", &ctx.host)
        .env("RYUGI_SESSION", &ctx.session)
        .env("RYUGI_PROJECT", &project)
        .env("RYUGI_ARTIFACT", crate::text::js_str(event.get("artifact")))
        .env("RYUGI_EVENT_TYPE", crate::text::js_str(event.get("type")))
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| format!("spawn {} {e}", command[0]))?;
    if let Some(mut stdin) = child.stdin.take() {
        let data = crate::evidence::js_stringify(&payload).into_bytes();
        std::thread::spawn(move || {
            let _ = stdin.write_all(&data);
        });
    }
    let (out, err) = (capture(child.stdout.take()), capture(child.stderr.take()));
    let limit = Duration::from_millis(ctx.timeout.as_f64().unwrap_or(DEFAULT_TIMEOUT_MS as f64).max(0.0) as u64);
    let deadline = Instant::now() + limit;
    let mut timed_out = false;
    let status = loop {
        match child.try_wait() {
            Ok(Some(status)) => break status,
            Ok(None) => {
                if !timed_out && Instant::now() >= deadline {
                    timed_out = true;
                    crate::sys::terminate(child.id() as i64);
                }
                std::thread::sleep(Duration::from_millis(20));
            }
            Err(e) => return Err(e.to_string()),
        }
    };
    let (stdout, stderr) = (out.join().unwrap_or_default(), err.join().unwrap_or_default());
    if timed_out {
        return Err(format!("Delivery command timed out after {}ms", crate::text::js_str(Some(&ctx.timeout))));
    }
    let parsed = parse_receipt(&stdout);
    let state = parsed.as_ref().and_then(|p| p.get("status")).and_then(Value::as_str).map(str::to_lowercase);
    let code = status.code();
    if code == Some(UNSUBSCRIBE_EXIT_CODE) || state.as_deref() == Some("unsubscribe") {
        return Ok(Delivery::Unsubscribe);
    }
    if state.as_deref() == Some("retry") {
        let reason = parsed.as_ref().and_then(|p| p.get("reason")).and_then(Value::as_str).filter(|r| !r.is_empty());
        return Err(reason
            .map(str::to_string)
            .or_else(|| Some(js_trim(&stderr).to_string()).filter(|s| !s.is_empty()))
            .unwrap_or_else(|| "Delivery command requested retry".into()));
    }
    if code == Some(0) {
        return Ok(Delivery::Delivered(js_trim(&stdout).into(), state.unwrap_or_else(|| "delivered".into())));
    }
    let detail = Some(js_trim(&stderr)).filter(|s| !s.is_empty()).or_else(|| Some(js_trim(&stdout)).filter(|s| !s.is_empty()));
    Err(match (detail, code) {
        (Some(d), _) => d.to_string(),
        (None, Some(c)) => format!("Delivery command exited with code {c}"),
        (None, None) => {
            use std::os::unix::process::ExitStatusExt;
            let sig = status.signal().unwrap_or(0);
            format!("Delivery command killed by {}", if sig == 15 { "SIGTERM".to_string() } else if sig == 9 { "SIGKILL".to_string() } else { format!("signal {sig}") })
        }
    })
}

fn watch(ctx: Ctx) {
    if ctx.command.is_none() {
        return;
    }
    let mut base = Map::new();
    base.insert("host".into(), json!(ctx.host));
    base.insert("session".into(), json!(ctx.session));
    base.insert("project".into(), json!(ctx.project));
    base.insert("commandKey".into(), json!(ctx.key));
    let key = ctx.key.clone();
    let Some(state) = crate::worker::claim(&ctx.file, base, |previous| {
        previous["commandKey"].as_str().is_some_and(|p| !p.is_empty() && !key.is_empty() && p != key)
    }) else {
        return;
    };
    let state = Value::Object(state);
    let update = Arc::new(crate::worker::updater(&ctx.file, &state));
    let token = state["token"].clone();
    let stopping = Arc::new(AtomicBool::new(false));
    let slot: Arc<Mutex<Option<crate::channel::Channel>>> = Arc::default();
    let ctx = Arc::new(ctx);
    let queue_slot: Arc<Mutex<Option<Queue>>> = Arc::default();
    let unsubscribe = {
        let (stopping, slot, queue_slot, file, token) = (stopping.clone(), slot.clone(), queue_slot.clone(), ctx.file.clone(), token.clone());
        move || {
            if stopping.swap(true, Ordering::SeqCst) {
                return;
            }
            if let Some(q) = queue_slot.lock().unwrap().as_ref() {
                q.close();
            }
            crate::worker::release(&file, &token);
            if let Some(ch) = slot.lock().unwrap().as_ref() {
                ch.unsubscribe();
            }
            std::thread::sleep(Duration::from_millis(50));
            std::process::exit(0);
        }
    };
    let (on_ok, on_err, ack, dctx) = (update.clone(), update.clone(), slot.clone(), ctx.clone());
    let (s1, s2, s3) = (stopping.clone(), stopping.clone(), stopping.clone());
    let queue = Queue::start(
        Hooks {
            deliver: Box::new(move |event| -> Outcome {
                match deliver(&dctx, event)? {
                    Delivery::Delivered(receipt, status) => Ok((receipt, status)),
                    Delivery::Unsubscribe => {
                        unsubscribe();
                        Ok((String::new(), "unsubscribe".into()))
                    }
                }
            }),
            delivered: Box::new(move |id| {
                if !s1.load(Ordering::SeqCst) {
                    if let Some(ch) = ack.lock().unwrap().as_ref() {
                        ch.delivered(id);
                    }
                }
            }),
            on_success: Box::new(move |event, receipt, status| {
                if !s2.load(Ordering::SeqCst) {
                    let receipt = crate::text::uslice(receipt, 800);
                    on_ok(json!({"artifact": event["artifact"], "receipt": receipt, "status": status, "queuedAt": crate::ids::iso_now()}));
                }
            }),
            on_failure: Box::new(move |error| {
                if !s3.load(Ordering::SeqCst) {
                    on_err(json!({"lastError": error.chars().take(800).collect::<String>()}));
                }
            }),
        },
        Duration::from_millis(500),
    );
    *queue_slot.lock().unwrap() = Some(queue.clone());
    let stop = {
        let (queue, slot, file, stopping) = (queue.clone(), slot.clone(), ctx.file.clone(), stopping.clone());
        Arc::new(move || {
            if stopping.swap(true, Ordering::SeqCst) {
                return;
            }
            queue.close();
            if let Some(ch) = slot.lock().unwrap().as_ref() {
                ch.close();
            }
            crate::worker::release(&file, &token);
            std::process::exit(0);
        })
    };
    crate::sys::on_terminate({
        let stop = stop.clone();
        move || stop()
    });
    let pusher = queue.clone();
    let (channel, thread) = open(Options::new(ctx.project.clone(), &ctx.host, &ctx.session, &ctx.agent), move |_, signal| match signal {
        Signal::Event(event, id) => pusher.push(event, id),
        Signal::Retract(message) => pusher.retract(&message),
        Signal::Replaced => stop(),
        Signal::Waiting(_) => {}
    });
    *slot.lock().unwrap() = Some(channel);
    let _ = thread.join();
}

pub fn run(mode: &str) {
    let input = crate::input::read_stdin(Duration::from_secs(30))
        .and_then(|b| serde_json::from_slice::<Value>(&b).ok())
        .unwrap_or_else(|| json!({}));
    let Some(ctx) = context(&input) else { return };
    match mode {
        "stop" => crate::worker::stop_worker(&ctx.file),
        _ => watch(ctx),
    }
}

pub fn ensure(args: &[String]) -> bool {
    let Ok(Some(host)) = crate::hosts::match_custom_host() else { return false };
    let start = args.first().filter(|a| !a.is_empty()).map(PathBuf::from).unwrap_or_else(|| std::env::current_dir().unwrap_or_default());
    let root = root_of(&start);
    let timeout = json!(host.timeout_ms);
    let key = command_key(&host.command, &host.agent, &timeout);
    let existing = read_json(&worker_file(&host.host, &host.session));
    if existing.is_some_and(|w| w["pid"].as_i64().is_some_and(crate::sys::alive) && w["commandKey"].as_str() == Some(key.as_str())) {
        return false;
    }
    let payload = json!({
        "host": host.host,
        "session": host.session,
        "project": root,
        "command": host.command,
        "agent": host.agent,
        "timeoutMs": timeout,
    });
    crate::start::spawn_detached(&["watch", "cmd"], &root, &[], payload.to_string().as_bytes());
    true
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn receipts_come_from_the_whole_output_or_its_last_line() {
        assert_eq!(parse_receipt("{\"status\":\"queued\"}\n").unwrap()["status"], "queued");
        assert_eq!(parse_receipt("log line\n{\"status\":\"retry\"}").unwrap()["status"], "retry");
        assert!(parse_receipt("[1]").is_none());
        assert!(parse_receipt("nothing").is_none());
    }
}
