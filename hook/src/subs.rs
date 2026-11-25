use std::path::{Path, PathBuf};
use std::process::Command;

use serde_json::{json, Value};

use crate::text::is_uuid;

pub const HOSTS: [(&str, &str); 4] = [
    ("codex", "CODEX_THREAD_ID"),
    ("claude", "CLAUDE_CODE_SESSION_ID"),
    ("pi", "PI_SESSION_ID"),
    ("antigravity", "ANTIGRAVITY_CONVERSATION_ID"),
];

fn env(name: &str) -> Option<String> {
    std::env::var(name).ok().filter(|v| !v.is_empty())
}

pub fn session_of(host: &str) -> Option<String> {
    let var = HOSTS.iter().find(|(h, _)| *h == host)?.1;
    let session = env(var).or_else(|| if host == "codex" { env("CODEX_SESSION_ID") } else { None })?;
    is_uuid(&session).then_some(session)
}

#[derive(Clone, Debug)]
pub struct Proc {
    pub pid: i64,
    pub parent: i64,
    pub started: String,
    pub name: String,
}

fn ps(args: &[&str]) -> Option<String> {
    for bin in ["ps", "/bin/ps", "/usr/bin/ps"] {
        if let Ok(out) = Command::new(bin).args(args).env("LC_ALL", "C").output() {
            if out.status.success() {
                return Some(String::from_utf8_lossy(&out.stdout).into_owned());
            }
            return None;
        }
    }
    None
}

fn parse_row(line: &str) -> Option<Proc> {
    let mut rest = line.trim_start();
    let mut field = || {
        let end = rest.find(char::is_whitespace)?;
        let (f, r) = rest.split_at(end);
        rest = r.trim_start();
        Some(f.to_string())
    };
    let pid: i64 = field()?.parse().ok()?;
    let parent: i64 = field()?.parse().ok()?;
    let parts: Vec<String> = (0..5).map(|_| field()).collect::<Option<_>>()?;
    let ok = parts[0].len() == 3
        && parts[1].len() == 3
        && parts[2].bytes().all(|b| b.is_ascii_digit())
        && parts[3].split(':').count() == 3
        && parts[4].len() == 4
        && parts[4].bytes().all(|b| b.is_ascii_digit());
    if !ok || rest.is_empty() {
        return None;
    }
    let started = {
        let start = line.find(&parts[0])?;
        let end = line[start..].find(&parts[4])? + start + 4;
        line[start..end].to_string()
    };
    let name = Path::new(rest.trim_end()).file_name()?.to_string_lossy().into_owned();
    Some(Proc { pid, parent, started, name })
}

extern "C" {
    fn getppid() -> i32;
}

pub fn lineage() -> Vec<Proc> {
    let Some(out) = ps(&["-axo", "pid=,ppid=,lstart=,comm="]) else { return vec![] };
    let all: Vec<Proc> = out.lines().filter_map(parse_row).collect();
    let mut result = Vec::new();
    let mut seen = std::collections::HashSet::new();
    let mut pid = unsafe { getppid() } as i64;
    while pid > 1 && seen.insert(pid) {
        let Some(p) = all.iter().find(|p| p.pid == pid) else { break };
        result.push(p.clone());
        pid = p.parent;
    }
    result
}

fn is_shell(name: &str) -> bool {
    let n = name.to_ascii_lowercase();
    let n = n.strip_suffix(".exe").unwrap_or(&n);
    matches!(n, "sh" | "bash" | "zsh" | "fish" | "dash" | "cmd" | "powershell" | "pwsh")
}

fn is_codex(name: &str) -> bool {
    let n = name.to_ascii_lowercase();
    n == "codex" || n == "codex.exe"
}

fn cache_dir() -> PathBuf {
    env("XDG_CACHE_HOME")
        .map(PathBuf::from)
        .unwrap_or_else(|| crate::paths::home().unwrap_or_default().join(".cache"))
        .join("ryugi")
}

pub fn binding_file(session: &str) -> PathBuf {
    cache_dir().join("codex-comment-watch/contexts").join(format!("{session}.json"))
}

fn read_json(file: &Path) -> Option<Value> {
    serde_json::from_str(&std::fs::read_to_string(file).ok()?).ok()
}

pub fn write_private(file: &Path, text: &str) -> std::io::Result<()> {
    use std::os::unix::fs::OpenOptionsExt;
    if let Some(dir) = file.parent() {
        std::fs::create_dir_all(dir)?;
    }
    let temporary = PathBuf::from(format!("{}.{}.tmp", file.display(), std::process::id()));
    {
        use std::io::Write;
        let mut f = std::fs::OpenOptions::new().write(true).create(true).truncate(true).mode(0o600).open(&temporary)?;
        f.write_all(text.as_bytes())?;
    }
    std::fs::rename(&temporary, file)
}

fn sha256_hex(text: &str) -> String {
    use sha2::{Digest, Sha256};
    Sha256::digest(text.as_bytes()).iter().map(|b| format!("{b:02x}")).collect()
}

pub fn bind_codex_session(session: &str) -> Result<Option<String>, String> {
    if !is_uuid(session) {
        return Ok(None);
    }
    let ancestors = lineage();
    let owner = ancestors
        .iter()
        .find(|p| is_codex(&p.name))
        .or_else(|| ancestors.iter().find(|p| !is_shell(&p.name)))
        .ok_or("Cannot identify the process owning this Codex session.")?;
    let file = binding_file(session);
    let previous = read_json(&file);
    let generation = sha256_hex(&crate::evidence::js_stringify(&json!([session, owner.pid, owner.started])));
    let kept = previous.as_ref().filter(|p| {
        p["owner"]["pid"].as_i64() == Some(owner.pid)
            && p["owner"]["started"].as_str() == Some(&owner.started)
            && p["token"].as_str().is_some_and(is_uuid)
    });
    let token = match kept {
        Some(p) => p["token"].as_str().unwrap_or_default().to_string(),
        None => format!(
            "{}-{}-{}-{}-{}",
            &generation[0..8],
            &generation[8..12],
            &generation[12..16],
            &generation[16..20],
            &generation[20..32]
        ),
    };
    let inherited: serde_json::Map<String, Value> =
        HOSTS.iter().map(|(h, _)| (h.to_string(), session_of(h).map_or(Value::Null, Value::from))).collect();
    let record = json!({
        "session": session,
        "token": token,
        "owner": {"pid": owner.pid, "started": owner.started},
        "inherited": inherited,
        "updatedAt": crate::ids::iso_now(),
    });
    write_private(&file, &crate::evidence::js_stringify(&record)).map_err(|e| e.to_string())?;
    Ok(Some(format!("{session}:{token}")))
}

pub fn unbind_codex_session(session: &str) {
    if is_uuid(session) {
        let _ = std::fs::remove_file(binding_file(session));
    }
}

fn bound_codex_session(proof: Option<&str>) -> Result<Option<String>, String> {
    let dir = binding_file("unused").parent().map(Path::to_path_buf).unwrap_or_default();
    let Ok(entries) = std::fs::read_dir(&dir) else { return Ok(None) };
    let now = crate::input::now_ms() as f64;
    let contexts: Vec<Value> = entries
        .flatten()
        .filter(|e| is_uuid(e.file_name().to_string_lossy().strip_suffix(".json").unwrap_or("")))
        .filter_map(|e| read_json(&e.path()))
        .filter(|c| {
            c["session"].as_str().is_some_and(is_uuid)
                && c["updatedAt"].as_str().and_then(crate::wake::parse_date).is_some_and(|t| now - t < 86_400_000.0)
        })
        .collect();
    for owner in lineage() {
        let mut candidates: Vec<&Value> = contexts
            .iter()
            .filter(|c| c["owner"]["pid"].as_i64() == Some(owner.pid) && c["owner"]["started"].as_str() == Some(&owner.started))
            .collect();
        if candidates.is_empty() {
            continue;
        }
        if let Some(proof) = proof {
            let parts: Vec<&str> = proof.split(':').collect();
            let bound = (parts.len() == 2)
                .then(|| candidates.iter().find(|c| c["session"].as_str() == Some(parts[0]) && c["token"].as_str() == Some(parts[1])))
                .flatten();
            return match bound {
                Some(c) => Ok(c["session"].as_str().map(str::to_string)),
                None => Err("Artifact feedback session binding does not belong to this host process.".into()),
            };
        }
        candidates.retain(|c| {
            ["claude", "pi", "antigravity"].iter().all(|h| match session_of(h) {
                None => true,
                Some(s) => c["inherited"][*h].as_str() == Some(s.as_str()),
            })
        });
        if candidates.is_empty() {
            continue;
        }
        if candidates.len() == 1 {
            return Ok(candidates[0]["session"].as_str().map(str::to_string));
        }
        let hints: Vec<String> = [session_of("codex"), env("CODEX_SESSION_ID").filter(|s| is_uuid(s))].into_iter().flatten().collect();
        let matching: Vec<&&Value> = candidates.iter().filter(|c| c["session"].as_str().is_some_and(|s| hints.iter().any(|h| h == s))).collect();
        if matching.len() == 1 {
            let only = matching[0];
            let shadowed = candidates.iter().any(|c| !std::ptr::eq(*c, *only) && c["inherited"]["codex"] == only["session"]);
            if !shadowed {
                return Ok(only["session"].as_str().map(str::to_string));
            }
        }
        return Err("Artifact feedback has ambiguous Codex session bindings; refusing to use an inherited parent id.".into());
    }
    Ok(None)
}

fn identity(proof: Option<&str>) -> Result<Option<(String, String)>, String> {
    if let Some(custom) = crate::hosts::match_custom_host()? {
        return Ok(Some((custom.host, custom.session)));
    }
    if proof.is_some() || session_of("codex").is_some() {
        if let Some(session) = bound_codex_session(proof)? {
            return Ok(Some(("codex".into(), session)));
        }
        if proof.is_some() {
            return Err("Artifact feedback session binding is no longer active.".into());
        }
    }
    if env("ANTIGRAVITY_AGENT").is_some() {
        if let Some(s) = session_of("antigravity") {
            return Ok(Some(("antigravity".into(), s)));
        }
    }
    let hosts: Vec<(&str, String)> = ["claude", "pi"].iter().filter_map(|h| session_of(h).map(|s| (*h, s))).collect();
    match hosts.len() {
        1 => return Ok(Some((hosts[0].0.into(), hosts[0].1.clone()))),
        n if n > 1 => return Err("Artifact feedback has ambiguous agent session markers.".into()),
        _ => {}
    }
    if session_of("codex").is_some() {
        return Err("Artifact feedback needs a current Codex hook session binding.".into());
    }
    Ok(session_of("antigravity").map(|s| ("antigravity".into(), s)))
}

fn option<'a>(args: &'a [String], name: &str) -> Option<&'a str> {
    if let Some(i) = args.iter().position(|a| a == name) {
        return args.get(i + 1).map(String::as_str);
    }
    let prefix = format!("{name}=");
    args.iter().find_map(|a| a.strip_prefix(&prefix))
}

pub fn subscription_for(args: &[String], proof: Option<&str>) -> Result<Option<Value>, String> {
    let start = args.first().is_some_and(|a| a == "start");
    let preview_read = args.first().is_some_and(|a| a == "comment") && args.get(1).is_some_and(|a| a == "list" || a == "read");
    if !start && !preview_read {
        return Ok(None);
    }
    let Some(artifact) = option(args, "--artifact").filter(|a| crate::channel::valid_artifact(a)) else { return Ok(None) };
    if preview_read && !artifact.starts_with("preview/") {
        return Ok(None);
    }
    let Some((host, session)) = identity(proof)? else { return Ok(None) };
    let dir = option(args, "--project-dir").map(PathBuf::from).unwrap_or_else(|| std::env::current_dir().unwrap_or_default());
    let project = crate::paths::project_root(&dir).ok_or_else(|| format!("ENOENT: no such file or directory, realpath '{}'", dir.display()))?;
    Ok(Some(json!({"host": host, "session": session, "project": project, "artifact": artifact})))
}

fn report(message: &str) {
    eprintln!("{}", json!({"type": "comment-watch-error", "message": message}));
}

fn has_marker() -> bool {
    ["CODEX_THREAD_ID", "CODEX_SESSION_ID", "CLAUDE_CODE_SESSION_ID", "PI_SESSION_ID", "ANTIGRAVITY_CONVERSATION_ID"]
        .iter()
        .any(|k| env(k).is_some())
}

pub fn launch_prepare(args: &[String]) {
    let (proof, rest) = match args.iter().position(|a| a == "--") {
        Some(i) => (&args[..i], &args[i + 1..]),
        None => (&args[..0], args),
    };
    let proof = proof.iter().position(|a| a == "--ryugi-session").and_then(|i| proof.get(i + 1)).map(String::as_str);
    let custom = match crate::hosts::match_custom_host() {
        Ok(c) => c,
        Err(e) => {
            report(&e);
            None
        }
    };
    let mut subscription = None;
    if custom.is_some() || proof.is_some() || has_marker() {
        match subscription_for(rest, proof) {
            Ok(s) => subscription = s,
            Err(e) => report(&e),
        }
    }
    let project = option(rest, "--project-dir").map(str::to_string);
    let project_args: Vec<String> = project.into_iter().collect();
    if custom.is_some() && (subscription.is_some() || rest.first().is_some_and(|a| a == "start")) {
        crate::cmd::ensure(&project_args);
    } else if custom.is_none() && env("ANTIGRAVITY_CONVERSATION_ID").is_some() && env("ANTIGRAVITY_LS_ADDRESS").is_some() {
        crate::agy::ensure(&project_args);
    }
    if let Some(s) = subscription {
        println!("{s}");
    } else if matches!(rest.first().map(String::as_str), Some("comment" | "write-document")) {
        match identity(proof) {
            Ok(Some((host, session))) => println!("{}", json!({ "host": host, "session": session })),
            Err(error) => report(&error),
            Ok(None) => {}
        }
    }
}

fn opened_file(cache: &Path, host: &str, session: &str) -> PathBuf {
    cache.join("sessions").join(host).join(format!("{}.json", crate::http::encode_component(session)))
}

fn opened_in(cache: &Path, project: &Path, host: &str, session: &str) -> Vec<String> {
    let project = std::fs::canonicalize(project).unwrap_or_else(|_| project.to_path_buf());
    read_json(&opened_file(cache, host, session))
        .and_then(|v| v["projects"][project.to_string_lossy().as_ref()].as_array().cloned())
        .map(|items| items.iter().filter_map(|i| i.as_str().map(str::to_string)).collect())
        .unwrap_or_default()
}

pub fn opened(project: &Path, host: &str, session: &str) -> Vec<String> {
    opened_in(&cache_dir(), project, host, session)
}

fn record_in(cache: &Path, subscription: &Value) {
    let (Some(host), Some(session), Some(project), Some(artifact)) = (
        subscription["host"].as_str().filter(|h| crate::hosts::valid_host_name(h)),
        subscription["session"].as_str().filter(|s| crate::hosts::valid_session(s)),
        subscription["project"].as_str(),
        subscription["artifact"].as_str().filter(|a| crate::channel::valid_artifact(a)),
    ) else {
        return;
    };
    let file = opened_file(cache, host, session);
    let mut record = read_json(&file).filter(|r| r["projects"].is_object()).unwrap_or_else(|| json!({"projects": {}}));
    let artifacts = &mut record["projects"][project];
    if !artifacts.is_array() {
        *artifacts = json!([]);
    }
    let Some(list) = artifacts.as_array_mut() else { return };
    if list.iter().any(|a| a.as_str() == Some(artifact)) {
        return;
    }
    list.push(json!(artifact));
    record["updatedAt"] = json!(crate::ids::iso_now());
    let _ = write_private(&file, &crate::evidence::js_stringify(&record));
}

pub fn subscribe() {
    let Some(subscription) = crate::input::read_stdin_json(std::time::Duration::from_secs(5)) else { return };
    let Some(project) = subscription["project"].as_str().map(PathBuf::from) else { return };
    record_in(&cache_dir(), &subscription);
    crate::hub::post_to_server(&crate::paths::hub_project_of(&project), "/api/agent/subscribe", Some(&subscription));
    let default_home = crate::paths::home().unwrap_or_default().join(".ryugi/server");
    if let Some(own) = env("RYUGI_SERVER_HOME") {
        let own = crate::event::resolve(&std::env::current_dir().unwrap_or_default(), &own);
        if own != default_home {
            crate::hub::post_to_hub(&default_home.join("server-info"), &project, "/api/agent/subscribe", Some(&subscription));
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn ps_rows_keep_the_start_time_as_printed() {
        let p = parse_row("  412     1 Mon Nov 23 10:00:01 2026     /Applications/Codex.app/Contents/MacOS/codex").unwrap();
        assert_eq!((p.pid, p.parent, p.started.as_str(), p.name.as_str()), (412, 1, "Mon Nov 23 10:00:01 2026", "codex"));
        let p = parse_row("9 8 Tue Nov  3 09:05:00 2026 /bin/zsh -l").unwrap();
        assert_eq!((p.started.as_str(), p.name.as_str()), ("Tue Nov  3 09:05:00 2026", "zsh -l"));
        assert!(parse_row("garbage").is_none());
    }

    #[test]
    fn opened_artifacts_are_recorded_once_per_session_and_project() {
        let cache = crate::testdir::TestDir::new("subs-cache");
        let project = crate::testdir::TestDir::new("subs-project");
        let other = crate::testdir::TestDir::new("subs-other");
        let a = "11111111-1111-4111-8111-111111111111";
        let sub = |session: &str, project: &Path, artifact: &str| {
            record_in(cache.path(), &json!({"host": "claude", "session": session, "project": project, "artifact": artifact}))
        };
        sub(a, project.path(), "artboard/mine");
        sub(a, project.path(), "document/notes");
        sub(a, project.path(), "artboard/mine");
        sub(a, project.path(), "../escape");
        sub(a, other.path(), "artboard/elsewhere");
        assert_eq!(opened_in(cache.path(), project.path(), "claude", a), vec!["artboard/mine", "document/notes"]);
        assert_eq!(opened_in(cache.path(), other.path(), "claude", a), vec!["artboard/elsewhere"]);
        assert!(opened_in(cache.path(), project.path(), "claude", "22222222-2222-4222-8222-222222222222").is_empty());
        assert!(opened_in(cache.path(), project.path(), "codex", a).is_empty());
        assert!(!project.path().join(".ryugi").exists());
    }
}
