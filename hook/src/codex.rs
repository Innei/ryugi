use std::io::Write;
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

use serde_json::{json, Map, Value};

use crate::channel::{open, Options, Signal};
use crate::queue::{Hooks, Outcome, Queue};
use crate::text::is_uuid;

fn env(name: &str) -> Option<String> {
    std::env::var(name).ok().filter(|v| !v.is_empty())
}

fn read_json(file: &Path) -> Option<Value> {
    serde_json::from_str(&std::fs::read_to_string(file).ok()?).ok()
}

pub fn endpoint(value: &str) -> Option<String> {
    if value.is_empty() || value.chars().any(|c| (c as u32) < 33 || c.is_whitespace() || c == '\u{feff}') {
        return None;
    }
    if value.starts_with("unix://") {
        return Some(value.into());
    }
    let rest = value.strip_prefix("ws://").or_else(|| value.strip_prefix("wss://"))?;
    let authority = rest.split(['/', '?', '#']).next().unwrap_or("");
    (!authority.is_empty() && !authority.contains('@')).then(|| value.into())
}

fn ps_field(pid: i64, field: &str) -> Option<String> {
    for bin in ["ps", "/bin/ps"] {
        if let Ok(out) = Command::new(bin).args(["-p", &pid.to_string(), "-o", field]).output() {
            return out.status.success().then(|| String::from_utf8_lossy(&out.stdout).trim().to_string());
        }
    }
    None
}

extern "C" {
    fn getppid() -> i32;
}

fn listen_arg(args: &str) -> Option<String> {
    let at = args.find("--listen")?;
    let rest = &args[at + "--listen".len()..];
    let rest = match rest.strip_prefix('=') {
        Some(r) => r,
        None if rest.starts_with(char::is_whitespace) => rest.trim_start(),
        None => return None,
    };
    let value = if let Some(r) = rest.strip_prefix('"') {
        r.split('"').next()?
    } else if let Some(r) = rest.strip_prefix('\'') {
        r.split('\'').next()?
    } else {
        rest.split(char::is_whitespace).next()?
    };
    (!value.is_empty()).then(|| value.to_string())
}

fn host_endpoint() -> Option<String> {
    let mut pid = unsafe { getppid() } as i64;
    for _ in 0..8 {
        if pid <= 1 {
            break;
        }
        let info = ps_field(pid, "ppid=,comm=")?;
        let (ppid, comm) = info.split_once(char::is_whitespace)?;
        let comm = comm.trim();
        if Path::new(comm).file_name()?.to_string_lossy().starts_with("codex") {
            if let Some(found) = ps_field(pid, "args=").and_then(|a| listen_arg(&a)) {
                return endpoint(&found);
            }
        }
        pid = ppid.trim().parse().ok()?;
    }
    None
}

fn cli_endpoint() -> Option<String> {
    env("RYUGI_CODEX_REMOTE").and_then(|v| endpoint(&v)).or_else(host_endpoint)
}

fn has_desktop_pipe() -> bool {
    std::env::var("CODEX_APP_TOOLS_PIPE_PATH").is_ok_and(|p| !crate::text::js_trim(&p).is_empty())
}

fn desktop_runtime() -> Result<PathBuf, String> {
    let runtime = env("CODEX_MCP_NODE_PATH").map(PathBuf::from).filter(|p| p.is_absolute()).ok_or(
        "Codex desktop must provide an absolute CODEX_MCP_NODE_PATH. Restart this chat in Codex desktop.",
    )?;
    use std::os::unix::fs::PermissionsExt;
    match std::fs::metadata(&runtime) {
        Ok(m) if m.is_file() && m.permissions().mode() & 0o111 != 0 => Ok(runtime),
        _ => Err("The inherited CODEX_MCP_NODE_PATH is not an executable file. Restart this chat in Codex desktop.".into()),
    }
}

struct Ctx {
    session: String,
    project: PathBuf,
    file: PathBuf,
}

fn context(input: &Value) -> Option<Ctx> {
    let session = input.get("session_id").and_then(Value::as_str).filter(|s| is_uuid(s))?;
    let cwd = input.get("cwd").and_then(Value::as_str)?;
    let project = crate::paths::project_root(Path::new(cwd))?;
    let data = env("PLUGIN_DATA")
        .or_else(|| env("CLAUDE_PLUGIN_DATA"))
        .map(PathBuf::from)
        .unwrap_or_else(|| project.join(".ryugi/artifacts/.state"));
    Some(Ctx {
        session: session.into(),
        file: data.join("codex-comment-watch/workers").join(format!("{session}.json")),
        project,
    })
}

fn write_state(file: &Path, state: &Value) {
    let _ = crate::subs::write_private(file, &state.to_string());
}

fn notice(input: &Value, message: &str) {
    let event = input.get("hook_event_name").filter(|v| crate::input::truthy(Some(v))).cloned().unwrap_or(json!("SessionStart"));
    let out = json!({"hookSpecificOutput": {"hookEventName": event, "additionalContext": message}});
    println!("{}", crate::evidence::js_stringify(&out));
}

fn run_with_timeout(mut command: Command, input: Option<Vec<u8>>, timeout: Duration, limit: usize) -> Result<(bool, String, String), String> {
    command.stdin(if input.is_some() { Stdio::piped() } else { Stdio::null() }).stdout(Stdio::piped()).stderr(Stdio::piped());
    let mut child = command.spawn().map_err(|e| e.to_string())?;
    if let (Some(data), Some(mut stdin)) = (input, child.stdin.take()) {
        std::thread::spawn(move || {
            let _ = stdin.write_all(&data);
        });
    }
    let read = |r: Option<Box<dyn std::io::Read + Send>>| {
        std::thread::spawn(move || {
            let mut buf = Vec::new();
            if let Some(r) = r {
                let _ = std::io::Read::read_to_end(&mut std::io::Read::take(r, limit as u64 + 1), &mut buf);
            }
            buf
        })
    };
    let out = read(child.stdout.take().map(|s| Box::new(s) as Box<dyn std::io::Read + Send>));
    let err = read(child.stderr.take().map(|s| Box::new(s) as Box<dyn std::io::Read + Send>));
    let deadline = Instant::now() + timeout;
    let status = loop {
        match child.try_wait() {
            Ok(Some(status)) => break Some(status),
            Ok(None) if Instant::now() < deadline => std::thread::sleep(Duration::from_millis(20)),
            _ => {
                let _ = child.kill();
                let _ = child.wait();
                break None;
            }
        }
    };
    let (out, err) = (out.join().unwrap_or_default(), err.join().unwrap_or_default());
    let text = |b: &[u8]| String::from_utf8_lossy(b).trim().to_string();
    match status {
        None => Err(format!("{} timed out", text(&err))),
        Some(_) if out.len() > limit || err.len() > limit => Err(format!("{}\nmaxBuffer exceeded", text(&err)).trim().into()),
        Some(st) => Ok((st.success(), text(&out), text(&err))),
    }
}

fn queue_cli(ctx: &Ctx, remote: &str, message: &str) -> Outcome {
    let mut command = Command::new("codex");
    command
        .args(["queue", "--remote", remote, "--thread", &ctx.session, "--message", message, "--resume"])
        .current_dir(&ctx.project)
        .env("CODEX_THREAD_ID", &ctx.session)
        .env("CODEX_SESSION_ID", &ctx.session);
    if let Some(token_env) = env("RYUGI_CODEX_REMOTE_AUTH_TOKEN_ENV") {
        let b = token_env.as_bytes();
        if (b[0].is_ascii_alphabetic() || b[0] == b'_') && b.iter().all(|c| c.is_ascii_alphanumeric() || *c == b'_') {
            command.args(["--remote-auth-token-env", &token_env]);
        }
    }
    match run_with_timeout(command, None, Duration::from_secs(15), 16384)? {
        (true, out, err) => Ok((out, err)),
        (false, _, err) => Err(if err.is_empty() { "Command failed: codex queue".into() } else { err }),
    }
}

fn queue_desktop(ctx: &Ctx, message: &str) -> Outcome {
    if !is_uuid(&ctx.session) {
        return Err("Desktop callback requires the valid hook session ID.".into());
    }
    if crate::text::js_trim(message).is_empty() {
        return Err("Desktop callback requires a message.".into());
    }
    if !has_desktop_pipe() {
        return Err("Codex did not provide CODEX_APP_TOOLS_PIPE_PATH. Restart this chat in Codex desktop.".into());
    }
    if let Some(host) = std::env::var("CODEX_APP_TOOLS_CALLER_HOST_ID").ok().map(|h| crate::text::js_trim(&h).to_string()) {
        if !host.is_empty() && host != "local" {
            return Err("Ryugi desktop callbacks support the local host only; remote and cloud chats are unsupported.".into());
        }
    }
    crate::desktop::send(&ctx.session, message).map(|receipt| (receipt, String::new()))
}

fn watch(ctx: Ctx, input: &Value, remote: Option<String>) {
    if matches!(crate::hosts::match_custom_host(), Ok(Some(_))) {
        return;
    }
    let desktop = remote.is_none() && has_desktop_pipe();
    if !desktop && remote.is_none() {
        return notice(
            input,
            "Ryugi comment watch needs the current Codex App Server endpoint. Set RYUGI_CODEX_REMOTE for a host that does not expose --listen.",
        );
    }
    let mut base = Map::new();
    base.insert("project".into(), json!(ctx.project));
    base.insert("session".into(), json!(ctx.session));
    let Some(mut state) = crate::worker::claim(&ctx.file, base, |_| false) else { return };
    match &remote {
        Some(r) => state.insert("remote".into(), json!(r)),
        None => state.insert("transport".into(), json!("desktop")),
    };
    let state = Value::Object(state);
    write_state(&ctx.file, &state);
    let token = state["token"].clone();
    let file = ctx.file.clone();
    let update = {
        let (file, state, token) = (file.clone(), state.clone(), token.clone());
        move |fields: Value| {
            if read_json(&file).map(|v| v["token"].clone()) == Some(token.clone()) {
                let mut next = state.as_object().cloned().unwrap_or_default();
                next.extend(fields.as_object().cloned().unwrap_or_default());
                write_state(&file, &Value::Object(next));
            }
        }
    };
    let update = Arc::new(update);
    let channel_slot: Arc<Mutex<Option<crate::channel::Channel>>> = Arc::default();
    let ctx = Arc::new(ctx);
    let (on_ok, on_err) = (update.clone(), update.clone());
    let slot = channel_slot.clone();
    let deliver_ctx = ctx.clone();
    let queue = Queue::start(
        Hooks {
            deliver: Box::new(move |event| {
                let message = crate::wake::wake_message(event, None);
                match &remote {
                    Some(r) => queue_cli(&deliver_ctx, r, &message),
                    None => queue_desktop(&deliver_ctx, &message),
                }
            }),
            delivered: Box::new(move |id| {
                if let Some(ch) = slot.lock().unwrap().as_ref() {
                    ch.delivered(id);
                }
            }),
            on_success: Box::new(move |event, receipt, warning| {
                on_ok(json!({"artifact": event["artifact"], "receipt": receipt, "warning": warning, "queuedAt": crate::ids::iso_now()}));
            }),
            on_failure: Box::new(move |error| {
                on_err(json!({"lastError": error.chars().take(800).collect::<String>()}));
            }),
        },
        Duration::from_secs(1),
    );
    let stop = {
        let (queue, slot, file, token) = (queue.clone(), channel_slot.clone(), file.clone(), token.clone());
        move || {
            queue.close();
            if let Some(ch) = slot.lock().unwrap().as_ref() {
                ch.close();
            }
            if read_json(&file).map(|v| v["token"].clone()) == Some(token.clone()) {
                let _ = std::fs::remove_file(&file);
            }
            std::process::exit(0);
        }
    };
    let stop = Arc::new(stop);
    crate::sys::on_terminate({
        let stop = stop.clone();
        move || stop()
    });
    let pusher = queue.clone();
    let on_stop = stop.clone();
    let (channel, thread) = open(Options::new(ctx.project.clone(), "codex", &ctx.session, "Codex"), move |_, signal| match signal {
        Signal::Event(event, id) => pusher.push(event, id),
        Signal::Retract(message) => pusher.retract(&message),
        Signal::Replaced => on_stop(),
        Signal::Waiting(_) => {}
    });
    *channel_slot.lock().unwrap() = Some(channel);
    let _ = thread.join();
}

pub fn run(mode: &str) {
    if (mode == "watch" || mode == "bind") && matches!(crate::hosts::match_custom_host(), Ok(Some(_))) {
        return;
    }
    let remote = if mode == "watch" { cli_endpoint() } else { None };
    let failure = if mode == "watch" && remote.is_none() && has_desktop_pipe() { desktop_runtime().err() } else { None };
    let input = if crate::desktop::bridged() {
        crate::desktop::bridged_input()
    } else {
        crate::input::read_stdin(Duration::from_secs(30)).and_then(|b| serde_json::from_slice::<Value>(&b).ok())
    };
    let Some(input) = input else { return };
    let Some(ctx) = context(&input) else { return };
    match mode {
        "stop" => {
            crate::worker::stop_worker(&ctx.file);
            crate::subs::unbind_codex_session(&ctx.session);
        }
        "bind" => match crate::subs::bind_codex_session(&ctx.session) {
            Ok(Some(proof)) => {
                let launcher = crate::evidence::js_stringify(&json!(crate::context::launcher()));
                notice(
                    &input,
                    &format!(
                        "Ryugi artifact commands for this session must use the bound launcher below. It targets this hook session even when parent session environment variables were inherited. Keep --ryugi-session in follow-up commands.\nnode {launcher} --ryugi-session {proof}"
                    ),
                );
            }
            Ok(None) => {}
            Err(e) => {
                eprintln!("{e}");
                std::process::exit(1);
            }
        },
        "watch" => {
            if let Some(failure) = failure {
                return notice(&input, &failure);
            }
            if crate::desktop::bridged() {
                return watch(ctx, &input, remote);
            }
            if let Err(e) = crate::subs::bind_codex_session(&ctx.session) {
                eprintln!("{e}");
                std::process::exit(1);
            }
            if remote.is_none() && has_desktop_pipe() {
                if let Ok(runtime) = desktop_runtime() {
                    let failure = crate::desktop::hand_over(&runtime, &input);
                    return notice(&input, &format!("Ryugi could not start the Codex desktop runtime: {failure}"));
                }
            }
            watch(ctx, &input, remote);
        }
        _ => {}
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn endpoints_are_unix_sockets_or_websockets_without_credentials() {
        assert_eq!(endpoint("unix:///tmp/x.sock").as_deref(), Some("unix:///tmp/x.sock"));
        assert_eq!(endpoint("ws://127.0.0.1:4500").as_deref(), Some("ws://127.0.0.1:4500"));
        assert!(endpoint("ws://u:p@host").is_none());
        assert!(endpoint("http://host").is_none());
        assert!(endpoint("ws://a b").is_none());
    }

    #[test]
    fn listen_flags_are_read_in_every_quoting() {
        assert_eq!(listen_arg("codex app-server --listen ws://a:1 x").as_deref(), Some("ws://a:1"));
        assert_eq!(listen_arg("codex --listen='unix:///t/s.sock'").as_deref(), Some("unix:///t/s.sock"));
        assert_eq!(listen_arg("codex --listen \"ws://b\"").as_deref(), Some("ws://b"));
        assert!(listen_arg("codex --listener x").is_none());
    }
}
