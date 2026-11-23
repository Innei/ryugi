use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::time::{Duration, Instant};

use serde_json::{json, Value};

fn read_json(file: &Path) -> Option<Value> {
    serde_json::from_str(&std::fs::read_to_string(file).ok()?).ok()
}

fn truthy(v: Option<&Value>) -> bool {
    crate::input::truthy(v)
}

pub fn server_home() -> PathBuf {
    match std::env::var("RYUGI_SERVER_HOME").ok().filter(|v| !v.is_empty()) {
        Some(dir) => PathBuf::from(dir),
        None => crate::paths::home().unwrap_or_default().join(".ryugi/server"),
    }
}

fn published(project: &Path) -> bool {
    let Some(config) = read_json(&project.join(".ryugi/config.json")) else { return false };
    let Some(artifacts) = config.get("artifacts").and_then(Value::as_object) else { return false };
    artifacts.iter().any(|(key, entry)| {
        key.starts_with("document/")
            && truthy(Some(entry))
            && truthy(entry.get("cloud"))
            && entry["cloud"].get("id").is_some_and(Value::is_string)
    })
}

fn signed_in() -> bool {
    let home = crate::paths::home().unwrap_or_default();
    read_json(&crate::context::credentials_path(&home))
        .is_some_and(|c| c.get("token").is_some_and(Value::is_string))
}

fn register(project: &Path) {
    let Some(info) = read_json(&server_home().join("server-info")) else { return };
    let Some(url) = info.get("url").and_then(Value::as_str).and_then(crate::http::parse_url) else { return };
    let key = crate::http::query_param(&url.query, "key").unwrap_or_default();
    let host = if url.host == "localhost" { "127.0.0.1" } else { url.host.as_str() };
    let body = json!({"dir": project.to_string_lossy()}).to_string();
    let _ = crate::http::request(
        host,
        url.port,
        "POST",
        &format!("/api/hub/projects?key={}", crate::http::encode_component(&key)),
        &[("Content-Type", "application/json".into())],
        Some(body.as_bytes()),
        Instant::now() + Duration::from_secs(5),
    );
}

pub fn run(args: &[String]) {
    crate::title::set_ryugi_title("hook");
    let Some(project) = args.first().filter(|p| !p.is_empty()).map(PathBuf::from) else { return };
    if !published(&project) || !signed_in() {
        return register(&project);
    }
    let child = Command::new("node")
        .arg(crate::context::launcher())
        .args(["start", "--background", "--format", "json", "--no-open", "--project-dir"])
        .arg(&project)
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .spawn();
    let Ok(mut child) = child else { return };
    let deadline = Instant::now() + Duration::from_secs(60);
    while Instant::now() < deadline {
        if child.try_wait().ok().flatten().is_some() {
            return;
        }
        std::thread::sleep(Duration::from_millis(50));
    }
    let _ = child.kill();
    let _ = child.wait();
}

pub fn agy_cwd() {
    let Some(input) = crate::input::read_stdin_json(Duration::from_secs(1)) else { return };
    let cwd = crate::input::nonempty(&input, "cwd").or_else(|| input.get("workspacePaths")?.get(0)?.as_str());
    if let Some(cwd) = cwd.filter(|c| !c.is_empty()) {
        print!("{cwd}");
    }
}

pub fn detach(args: &[String]) {
    let payload = crate::input::read_stdin(Duration::from_secs(1)).unwrap_or_default();
    let args: Vec<&str> = args.iter().map(String::as_str).collect();
    spawn_detached(&args, &std::env::current_dir().unwrap_or_default(), &[], &payload);
}

pub fn spawn_detached(args: &[&str], cwd: &Path, envs: &[(&str, &str)], payload: &[u8]) {
    use std::io::Write;
    use std::os::unix::process::CommandExt;
    let Ok(exe) = std::env::current_exe() else { return };
    let mut command = Command::new(exe);
    command.args(args).current_dir(cwd).envs(envs.iter().copied()).stdin(Stdio::piped()).stdout(Stdio::null()).stderr(Stdio::null());
    unsafe {
        command.pre_exec(|| {
            extern "C" {
                fn setsid() -> i32;
            }
            setsid();
            Ok(())
        });
    }
    if let Ok(mut child) = command.spawn() {
        if let Some(mut stdin) = child.stdin.take() {
            let _ = stdin.write_all(payload);
        }
    }
}
