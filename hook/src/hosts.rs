use std::path::PathBuf;

use serde_json::Value;

pub const DEFAULT_TIMEOUT_MS: u64 = 15000;
const BUILTIN: [&str; 4] = ["codex", "claude", "pi", "antigravity"];

#[derive(Clone, Debug, PartialEq)]
pub struct CustomHost {
    pub host: String,
    pub env: String,
    pub agent: String,
    pub command: Vec<String>,
    pub timeout_ms: u64,
    pub session: String,
}

fn env(name: &str) -> Option<String> {
    std::env::var(name).ok()
}

pub fn config_file() -> PathBuf {
    if let Some(p) = env("RYUGI_HOSTS_CONFIG").filter(|p| !crate::text::js_trim(p).is_empty()) {
        return crate::event::resolve(&std::env::current_dir().unwrap_or_default(), crate::text::js_trim(&p));
    }
    env("XDG_CONFIG_HOME")
        .filter(|v| !v.is_empty())
        .map(PathBuf::from)
        .unwrap_or_else(|| crate::paths::home().unwrap_or_default().join(".config"))
        .join("ryugi/config.json")
}

pub fn valid_host_name(name: &str) -> bool {
    let b = name.as_bytes();
    !b.is_empty()
        && b.len() <= 32
        && b[0].is_ascii_lowercase()
        && b[1..].iter().all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || *c == b'_' || *c == b'-')
}

fn valid_env_name(name: &str) -> bool {
    let b = name.as_bytes();
    !b.is_empty()
        && (b[0].is_ascii_alphabetic() || b[0] == b'_')
        && b[1..].iter().all(|c| c.is_ascii_alphanumeric() || *c == b'_')
}

pub fn valid_session(s: &str) -> bool {
    !s.is_empty()
        && s.len() <= 128
        && s != "."
        && s != ".."
        && !s.contains("..")
        && s.bytes().all(|c| c.is_ascii_alphanumeric() || b"_.:-".contains(&c))
}

fn parse_command(raw: &Value) -> Option<Vec<String>> {
    match raw {
        Value::String(s) => {
            let t = crate::text::js_trim(s);
            (!t.is_empty()).then(|| vec![t.to_string()])
        }
        Value::Array(items) if !items.is_empty() => {
            let parts: Option<Vec<String>> = items.iter().map(|i| i.as_str().map(str::to_string)).collect();
            let mut parts = parts?;
            let bin = crate::text::js_trim(&parts[0]).to_string();
            if bin.is_empty() {
                return None;
            }
            parts[0] = bin;
            Some(parts)
        }
        _ => None,
    }
}

fn parse_timeout(raw: Option<&Value>) -> u64 {
    match raw.and_then(Value::as_f64).filter(|f| f.is_finite()) {
        Some(f) => f.round().clamp(1000.0, 120000.0) as u64,
        None => DEFAULT_TIMEOUT_MS,
    }
}

pub fn load() -> Vec<(String, String, String, Vec<String>, u64)> {
    let Some(raw) = std::fs::read_to_string(config_file()).ok().and_then(|t| serde_json::from_str::<Value>(&t).ok()) else {
        return vec![];
    };
    let Some(hosts) = raw.get("hosts").and_then(Value::as_object) else { return vec![] };
    let mut out = Vec::new();
    for (name, entry) in hosts {
        if !valid_host_name(name) || BUILTIN.contains(&name.as_str()) || !entry.is_object() {
            continue;
        }
        let Some(env_name) = entry.get("env").and_then(Value::as_str).filter(|e| valid_env_name(e)) else { continue };
        let Some(command) = entry.get("command").and_then(parse_command) else { continue };
        let agent = entry
            .get("agent")
            .and_then(Value::as_str)
            .map(crate::text::js_trim)
            .filter(|a| !a.is_empty())
            .unwrap_or(name)
            .to_string();
        out.push((name.clone(), env_name.to_string(), agent, command, parse_timeout(entry.get("timeoutMs"))));
    }
    out
}

pub fn match_custom_host() -> Result<Option<CustomHost>, String> {
    let mut matches = Vec::new();
    for (host, env_name, agent, command, timeout_ms) in load() {
        if let Some(session) = env(&env_name).filter(|v| valid_session(v)) {
            matches.push(CustomHost { host, env: env_name, agent, command, timeout_ms, session });
        }
    }
    match matches.len() {
        0 => Ok(None),
        1 => Ok(matches.pop()),
        _ => Err("Artifact feedback has ambiguous custom host session markers.".into()),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn session_ids_follow_the_custom_host_pattern() {
        assert!(valid_session("abc:1.2-x_y"));
        assert!(!valid_session(".."));
        assert!(!valid_session("a..b"));
        assert!(!valid_session("a/b"));
        assert!(!valid_session(&"x".repeat(129)));
    }

    #[test]
    fn host_names_are_short_lowercase_words() {
        assert!(valid_host_name("my-host_2"));
        assert!(!valid_host_name("2host"));
        assert!(!valid_host_name("Host"));
        assert!(!valid_host_name(&"a".repeat(33)));
    }
}
