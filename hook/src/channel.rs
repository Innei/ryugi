use std::io::{BufRead, BufReader, Write};
use std::os::unix::net::UnixStream;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

use serde_json::{json, Value};

const PROTOCOL: u64 = 1;
const MAX_RETRY_MS: u64 = 30000;
const START_TIMEOUT: Duration = Duration::from_secs(60);
const USER_STOPS: [&str; 3] = ["stop", "stale_pid", "SIGINT"];

pub fn quote(text: &str) -> String {
    format!("'{}'", text.replace('\'', "'\"'\"'"))
}

fn section_for(event: &Value) -> &'static str {
    match event.get("type").and_then(Value::as_str) {
        Some("ryugi-choices") => "groups",
        Some("ryugi-answers") => "asks",
        _ => "threads",
    }
}

fn section_flags(section: &str) -> &'static [&'static str] {
    match section {
        "groups" => &["--kind", "choose"],
        "asks" => &["--status", "submitted"],
        _ => &[],
    }
}

pub fn command(launcher: &str, project: &str, artifact: &str, section: &str) -> String {
    if let Some(id) = artifact.strip_prefix("preview/") {
        return format!("node {} preview comments --id {id} --project-dir {}", quote(launcher), quote(project));
    }
    let flags: String = section_flags(section).iter().map(|f| format!(" {f}")).collect();
    format!(
        "node {} comment list --section {section}{flags} --detail --format brief --project-dir {} --artifact {artifact}",
        quote(launcher),
        quote(project)
    )
}

pub fn list_argv(launcher: &str, project: &str, artifact: &str, section: &str) -> Vec<String> {
    if let Some(id) = artifact.strip_prefix("preview/") {
        return [launcher, "preview", "comments", "--id", id, "--project-dir", project].map(String::from).to_vec();
    }
    let mut argv: Vec<String> = [launcher, "comment", "list", "--section", section].map(String::from).to_vec();
    argv.extend(section_flags(section).iter().map(|f| f.to_string()));
    argv.extend(["--detail", "--format", "brief", "--project-dir", project, "--artifact", artifact].map(String::from));
    argv
}

fn env(name: &str) -> Option<String> {
    std::env::var(name).ok().filter(|v| !v.is_empty())
}

fn default_server_home() -> PathBuf {
    crate::paths::home().unwrap_or_default().join(".ryugi/server")
}

pub fn hub_socket_path() -> PathBuf {
    if let Some(p) = env("RYUGI_HUB_SOCKET") {
        return PathBuf::from(p);
    }
    let cwd = std::env::current_dir().unwrap_or_default();
    let home = env("RYUGI_SERVER_HOME").map(|h| crate::event::resolve(&cwd, &h));
    let own = match home {
        Some(h) if h != default_server_home() => {
            use sha2::{Digest, Sha256};
            let digest: String = Sha256::digest(h.to_string_lossy().as_bytes()).iter().map(|b| format!("{b:02x}")).collect();
            format!("-{}", &digest[..12])
        }
        _ => String::new(),
    };
    let runtime = env("RYUGI_RUNTIME_DIR").unwrap_or_else(|| format!("/tmp/ryugi-{}", crate::sys::uid()));
    PathBuf::from(runtime).join(format!("hub{own}.sock"))
}

fn safe_socket_dir(socket: &Path) -> bool {
    use std::os::unix::fs::MetadataExt;
    let Some(dir) = socket.parent() else { return true };
    match std::fs::symlink_metadata(dir) {
        Ok(m) => m.is_dir() && m.uid() == crate::sys::uid() && m.mode() & 0o022 == 0,
        Err(_) => true,
    }
}

pub fn valid_artifact(artifact: &str) -> bool {
    let Some((kind, id)) = artifact.split_once('/') else { return false };
    ["document", "artboard", "whiteboard", "slides", "storyboard", "report", "preview"].contains(&kind)
        && id.bytes().next().is_some_and(|b| b.is_ascii_lowercase() || b.is_ascii_digit())
        && id.bytes().all(|b| b.is_ascii_lowercase() || b.is_ascii_digit() || b == b'-')
}

fn well_formed(event: &Value) -> bool {
    event.get("project").and_then(Value::as_str).is_some_and(|p| Path::new(p).is_absolute())
        && event.get("artifact").and_then(Value::as_str).is_some_and(valid_artifact)
}

pub fn server_home() -> PathBuf {
    env("RYUGI_SERVER_HOME").map(PathBuf::from).unwrap_or_else(default_server_home)
}

pub fn stopped_by_user(home: &Path) -> bool {
    std::fs::read_to_string(home.join("server-stopped"))
        .ok()
        .and_then(|t| serde_json::from_str::<Value>(&t).ok())
        .and_then(|v| v.get("reason").and_then(Value::as_str).map(|r| USER_STOPS.contains(&r)))
        .unwrap_or(false)
}

pub fn launch_hub(project: &Path) {
    let child = std::process::Command::new("node")
        .arg(crate::context::launcher())
        .args(["start", "--background", "--no-open", "--project-dir"])
        .arg(project)
        .env("RYUGI_NO_UPDATE_CHECK", "1")
        .stdin(std::process::Stdio::null())
        .stdout(std::process::Stdio::null())
        .stderr(std::process::Stdio::null())
        .spawn();
    let Ok(mut child) = child else { return };
    let deadline = Instant::now() + START_TIMEOUT;
    loop {
        if child.try_wait().ok().flatten().is_some() {
            return;
        }
        if Instant::now() >= deadline {
            let _ = child.kill();
            let _ = child.wait();
            return;
        }
        std::thread::sleep(Duration::from_millis(50));
    }
}

pub fn plugin_version() -> String {
    env("RYUGI_PLUGIN_ROOT")
        .and_then(|root| crate::title::manifest_version(Path::new(&root)))
        .or_else(crate::title::version)
        .unwrap_or_default()
}

pub enum Signal {
    Event(Value, Value),
    Retract(Value),
    Replaced,
    Waiting(&'static str),
}

pub struct Options {
    pub socket: PathBuf,
    pub server_home: PathBuf,
    pub project: PathBuf,
    pub host: String,
    pub session: String,
    pub agent: String,
    pub retry: Duration,
    pub start_hub: Box<dyn Fn(&Path) + Send>,
    pub follow: Option<PathBuf>,
}

impl Options {
    pub fn new(project: PathBuf, host: &str, session: &str, agent: &str) -> Options {
        Options {
            socket: hub_socket_path(),
            server_home: server_home(),
            project,
            host: host.into(),
            session: session.into(),
            agent: agent.into(),
            retry: Duration::from_secs(1),
            start_hub: Box::new(launch_hub),
            follow: None,
        }
    }
}

#[derive(Clone)]
pub struct Channel {
    writer: Arc<Mutex<Option<UnixStream>>>,
    closed: Arc<AtomicBool>,
}

impl Channel {
    fn send(&self, message: &Value) -> bool {
        let mut guard = self.writer.lock().unwrap();
        match guard.as_mut() {
            Some(stream) => stream.write_all(format!("{message}\n").as_bytes()).is_ok(),
            None => false,
        }
    }

    pub fn delivered(&self, id: &Value) {
        self.send(&json!({"t": "delivered", "id": id}));
    }

    pub fn unsubscribe(&self) {
        self.closed.store(true, Ordering::SeqCst);
        self.send(&json!({"t": "unsubscribe"}));
        if let Some(stream) = self.writer.lock().unwrap().as_ref() {
            let _ = stream.shutdown(std::net::Shutdown::Write);
        }
    }

    pub fn close(&self) {
        self.closed.store(true, Ordering::SeqCst);
        if let Some(stream) = self.writer.lock().unwrap().take() {
            let _ = stream.shutdown(std::net::Shutdown::Both);
        }
    }

    pub fn is_closed(&self) -> bool {
        self.closed.load(Ordering::SeqCst)
    }
}

fn decorate(mut event: Value) -> Value {
    let launcher = crate::context::launcher();
    let project = event["project"].as_str().unwrap_or_default().to_string();
    let artifact = event["artifact"].as_str().unwrap_or_default().to_string();
    let section = section_for(&event);
    if let Some(map) = event.as_object_mut() {
        map.insert("command".into(), json!(command(&launcher, &project, &artifact, section)));
        map.insert("argv".into(), json!(list_argv(&launcher, &project, &artifact, section)));
    }
    event
}

struct Backoff {
    gap: u64,
    since: u64,
    max: u64,
}

pub fn open(options: Options, mut on: impl FnMut(&Channel, Signal) + Send + 'static) -> (Channel, std::thread::JoinHandle<()>) {
    let channel = Channel { writer: Arc::new(Mutex::new(None)), closed: Arc::new(AtomicBool::new(false)) };
    let handle = channel.clone();
    let following = Arc::new(Mutex::new(String::new()));
    if let Some(file) = options.follow.clone() {
        let (handle, following, every) = (channel.clone(), following.clone(), options.retry);
        std::thread::spawn(move || {
            while !handle.is_closed() {
                std::thread::sleep(every);
                let Some(now) = crate::follow::current(&file) else { continue };
                if *following.lock().unwrap() == now {
                    continue;
                }
                if let Some(stream) = handle.writer.lock().unwrap().as_ref() {
                    let _ = stream.shutdown(std::net::Shutdown::Both);
                }
            }
        });
    }
    let socket_path = options.socket.clone();
    let thread = std::thread::spawn(move || {
        let retry_ms = options.retry.as_millis().max(1) as u64;
        let mut backoff = Backoff { gap: 1, since: u64::MAX, max: (MAX_RETRY_MS as f64 / retry_ms as f64).round().max(1.0) as u64 };
        let unreachable = |backoff: &mut Backoff, on: &mut dyn FnMut(&Channel, Signal)| {
            if stopped_by_user(&options.server_home) {
                on(&handle, Signal::Waiting("stopped"));
            } else if !options.project.join(".ryugi/artifacts").exists() {
                on(&handle, Signal::Waiting("not-a-ryugi-project"));
            } else {
                backoff.since = backoff.since.saturating_add(1);
                if backoff.since >= backoff.gap {
                    backoff.since = 0;
                    backoff.gap = (backoff.gap * 2).min(backoff.max);
                    (options.start_hub)(&options.project);
                }
            }
        };
        while !handle.is_closed() {
            if !safe_socket_dir(&socket_path) {
                on(&handle, Signal::Waiting("unsafe-socket-dir"));
                std::thread::sleep(options.retry);
                continue;
            }
            let stream = match UnixStream::connect(&socket_path) {
                Ok(s) => s,
                Err(_) => {
                    unreachable(&mut backoff, &mut on);
                    if !handle.is_closed() {
                        std::thread::sleep(options.retry);
                    }
                    continue;
                }
            };
            let session = options
                .follow
                .as_deref()
                .and_then(crate::follow::current)
                .unwrap_or_else(|| options.session.clone());
            *following.lock().unwrap() = session.clone();
            let hello = json!({
                "t": "hello",
                "protocol": PROTOCOL,
                "version": plugin_version(),
                "host": options.host,
                "session": session,
                "agent": options.agent,
            });
            let Ok(reader) = stream.try_clone() else { continue };
            *handle.writer.lock().unwrap() = Some(stream);
            if handle.is_closed() {
                handle.close();
                break;
            }
            handle.send(&hello);
            let mut welcomed = false;
            for line in BufReader::new(reader).lines() {
                let Ok(line) = line else { break };
                let Ok(message) = serde_json::from_str::<Value>(&line) else { continue };
                match message.get("t").and_then(Value::as_str) {
                    Some("welcome") => {
                        welcomed = true;
                        backoff.gap = 1;
                        backoff.since = u64::MAX;
                    }
                    Some("event") => {
                        if let Some(event) = message.get("event").filter(|e| well_formed(e)) {
                            let id = message.get("id").cloned().unwrap_or(Value::Null);
                            on(&handle, Signal::Event(decorate(event.clone()), id));
                        }
                    }
                    Some("retract") => on(&handle, Signal::Retract(message)),
                    Some("bye") if message.get("reason").and_then(Value::as_str) == Some("replaced") => {
                        handle.close();
                        on(&handle, Signal::Replaced);
                        break;
                    }
                    Some("refuse") => {
                        if let Some(s) = handle.writer.lock().unwrap().take() {
                            let _ = s.shutdown(std::net::Shutdown::Both);
                        }
                        break;
                    }
                    _ => {}
                }
                if handle.is_closed() {
                    break;
                }
            }
            handle.writer.lock().unwrap().take();
            if handle.is_closed() {
                break;
            }
            if !welcomed {
                unreachable(&mut backoff, &mut on);
            }
            if !handle.is_closed() {
                std::thread::sleep(options.retry);
            }
        }
    });
    (channel, thread)
}

#[cfg(test)]
#[path = "channel_tests.rs"]
mod tests;
