use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

use serde_json::{json, Map, Value};

use crate::channel::{open, Options, Signal};
use crate::queue::{Hooks, Outcome, Queue};
use crate::text::is_uuid;
use crate::worker::read_json;

fn env(name: &str) -> String {
    std::env::var(name).unwrap_or_default()
}

struct Ctx {
    session: String,
    project: PathBuf,
    ls_address: String,
    csrf: String,
    file: PathBuf,
}

fn worker_file(project: &Path, session: &str) -> PathBuf {
    let data = std::env::var("PLUGIN_DATA")
        .ok()
        .filter(|v| !v.is_empty())
        .map(PathBuf::from)
        .unwrap_or_else(|| project.join(".ryugi/artifacts/.state"));
    data.join("agy-comment-watch/workers").join(format!("{session}.json"))
}

fn context(input: &Value) -> Option<Ctx> {
    let pick = |v: Option<&Value>| v.and_then(Value::as_str).filter(|s| is_uuid(s)).map(str::to_string);
    let session = pick(input.get("conversationId"))
        .or_else(|| pick(input.get("session_id")))
        .or_else(|| Some(env("ANTIGRAVITY_CONVERSATION_ID")).filter(|s| is_uuid(s)))?;
    let cwd = crate::input::nonempty(input, "cwd")
        .or_else(|| input.get("workspacePaths")?.get(0)?.as_str())
        .map(PathBuf::from)
        .unwrap_or_else(|| std::env::current_dir().unwrap_or_default());
    let project = crate::paths::project_root(&cwd)?;
    Some(Ctx {
        file: worker_file(&project, &session),
        session,
        project,
        ls_address: env("ANTIGRAVITY_LS_ADDRESS"),
        csrf: env("ANTIGRAVITY_CSRF_TOKEN"),
    })
}

struct RpcError {
    status: Option<u16>,
    message: String,
}

fn ls_rpc(ctx: &Ctx, method: &str, payload: &Value) -> Result<String, RpcError> {
    let base = if ctx.ls_address.starts_with("http://") { ctx.ls_address.clone() } else { format!("http://{}", ctx.ls_address) };
    let url = crate::http::parse_url(&base).ok_or(RpcError { status: None, message: format!("Invalid URL: {base}") })?;
    let host = if url.host == "localhost" { "127.0.0.1".to_string() } else { url.host.clone() };
    let body = payload.to_string();
    let mut headers = vec![("Content-Type", "application/json".to_string())];
    if !ctx.csrf.is_empty() {
        headers.push(("x-codeium-csrf-token", ctx.csrf.clone()));
    }
    let target = format!("/exa.language_server_pb.LanguageServerService/{method}");
    let res = crate::http::request(&host, url.port, "POST", &target, &headers, Some(body.as_bytes()), Instant::now() + Duration::from_secs(5))
        .ok_or_else(|| RpcError { status: None, message: format!("LS RPC {method} timed out") })?;
    let out = String::from_utf8_lossy(&res.body).into_owned();
    if (200..300).contains(&res.status) {
        Ok(out)
    } else {
        let units: Vec<u16> = out.encode_utf16().take(200).collect();
        let snippet = String::from_utf16_lossy(&units);
        Err(RpcError { status: Some(res.status), message: format!("LS RPC {method} HTTP {}: {snippet}", res.status) })
    }
}

fn deliver(ctx: &Ctx, event: &Value) -> Result<(String, String), String> {
    if ctx.ls_address.is_empty() {
        return Err("ANTIGRAVITY_LS_ADDRESS is not set".into());
    }
    let message = crate::wake::wake_message(event, None);
    let first = ls_rpc(
        ctx,
        "SendAgentMessage",
        &json!({"recipient": ctx.session, "senderId": "ryugi-artifacts", "displayTitle": "Ryugi Artifacts", "content": message}),
    );
    match first {
        Ok(body) => Ok((crate::text::js_trim(&body).into(), "SendAgentMessage".into())),
        Err(e) if e.status.is_some_and(|s| s >= 500) => Err(e.message),
        Err(_) => ls_rpc(ctx, "SendUserCascadeMessage", &json!({"cascadeId": ctx.session, "items": [{"text": message}]}))
            .map(|body| (crate::text::js_trim(&body).into(), "SendUserCascadeMessage".into()))
            .map_err(|e| e.message),
    }
}

fn watch(ctx: Ctx) {
    if ctx.ls_address.is_empty() {
        return;
    }
    let mut base = Map::new();
    base.insert("project".into(), json!(ctx.project));
    base.insert("session".into(), json!(ctx.session));
    base.insert("lsAddress".into(), json!(ctx.ls_address));
    let ls = ctx.ls_address.clone();
    let Some(state) = crate::worker::claim(&ctx.file, base, |previous| {
        previous["lsAddress"].as_str().is_some_and(|p| !p.is_empty() && p != ls)
    }) else {
        return;
    };
    let state = Value::Object(state);
    let update = Arc::new(crate::worker::updater(&ctx.file, &state));
    let token = state["token"].clone();
    let slot: Arc<Mutex<Option<crate::channel::Channel>>> = Arc::default();
    let ctx = Arc::new(ctx);
    let (on_ok, on_err, ack, dctx) = (update.clone(), update.clone(), slot.clone(), ctx.clone());
    let queue = Queue::start(
        Hooks {
            deliver: Box::new(move |event| -> Outcome { deliver(&dctx, event) }),
            delivered: Box::new(move |id| {
                if let Some(ch) = ack.lock().unwrap().as_ref() {
                    ch.delivered(id);
                }
            }),
            on_success: Box::new(move |event, receipt, method| {
                on_ok(json!({"artifact": event["artifact"], "receipt": receipt, "method": method, "queuedAt": crate::ids::iso_now()}));
            }),
            on_failure: Box::new(move |error| {
                on_err(json!({"lastError": error.chars().take(800).collect::<String>()}));
            }),
        },
        Duration::from_millis(500),
    );
    let stop = {
        let (queue, slot, file) = (queue.clone(), slot.clone(), ctx.file.clone());
        Arc::new(move || {
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
    let (channel, thread) = open(Options::new(ctx.project.clone(), "antigravity", &ctx.session, "Antigravity"), move |_, signal| match signal {
        Signal::Event(event, id) => pusher.push(event, id),
        Signal::Retract(message) => pusher.retract(&message),
        Signal::Replaced => stop(),
        Signal::Waiting(_) => {}
    });
    *slot.lock().unwrap() = Some(channel);
    let _ = thread.join();
}

fn read_input() -> Value {
    crate::input::read_stdin(Duration::from_secs(30))
        .and_then(|b| serde_json::from_slice::<Value>(&b).ok())
        .unwrap_or_else(|| json!({}))
}

pub fn run(mode: &str) {
    crate::title::set_ryugi_title("watch-comments");
    let input = read_input();
    let Some(ctx) = context(&input) else { return };
    match mode {
        "stop" => crate::worker::stop_worker(&ctx.file),
        _ => watch(ctx),
    }
}

pub fn ensure(args: &[String]) -> bool {
    let session = env("ANTIGRAVITY_CONVERSATION_ID");
    let ls = env("ANTIGRAVITY_LS_ADDRESS");
    if !is_uuid(&session) || ls.is_empty() {
        return false;
    }
    let start = args.first().filter(|a| !a.is_empty()).map(PathBuf::from).unwrap_or_else(|| std::env::current_dir().unwrap_or_default());
    let Some(root) = crate::paths::project_root(&start) else { return false };
    let existing = read_json(&worker_file(&root, &session));
    let healthy = existing.as_ref().is_some_and(|w| {
        w["pid"].as_i64().is_some_and(crate::sys::alive) && w["lsAddress"].as_str() == Some(ls.as_str())
    });
    if healthy {
        return false;
    }
    crate::start::spawn_detached(
        &["watch", "antigravity"],
        &root,
        &[("ANTIGRAVITY_CONVERSATION_ID", session.as_str())],
        json!({"conversationId": session, "cwd": root}).to_string().as_bytes(),
    );
    true
}
