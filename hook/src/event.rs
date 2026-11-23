use std::path::{Path, PathBuf};
use std::time::Duration;

use serde_json::{json, Map, Value};

use crate::input::{nonempty, now_ms, read_stdin_json, str_field, truthy, utf16_len};

const PATH_FIELDS: [&str; 6] = ["file_path", "path", "notebook_path", "Path", "TargetFile", "target_file"];

fn strings<'a>(value: &'a Value, out: &mut Vec<&'a str>) {
    match value {
        Value::String(s) => out.push(s),
        Value::Array(items) => items.iter().for_each(|i| strings(i, out)),
        Value::Object(map) => map.values().for_each(|i| strings(i, out)),
        _ => {}
    }
}

fn patch_files(text: &str, out: &mut Vec<String>) {
    for line in text.split(['\n', '\r', '\u{2028}', '\u{2029}']) {
        let rest = ["*** Add File: ", "*** Update File: ", "*** Delete File: ", "*** Move to: "]
            .iter()
            .find_map(|p| line.strip_prefix(p));
        if let Some(rest) = rest.filter(|r| !r.is_empty()) {
            out.push(rest.trim_matches(|c: char| c.is_whitespace() || c == '\u{feff}').to_string());
        }
    }
}

pub fn resolve(base: &Path, file: &str) -> PathBuf {
    let joined = if Path::new(file).is_absolute() {
        PathBuf::from(file)
    } else if base.is_absolute() {
        base.join(file)
    } else {
        std::env::current_dir().unwrap_or_default().join(base).join(file)
    };
    let mut out = PathBuf::from("/");
    for part in joined.components() {
        match part {
            std::path::Component::ParentDir => {
                out.pop();
            }
            std::path::Component::Normal(p) => out.push(p),
            _ => {}
        }
    }
    out
}

fn input_cwd(input: &Value) -> Option<&str> {
    nonempty(input, "cwd").or_else(|| input.get("workspacePaths")?.get(0)?.as_str())
}

pub fn paths_of(input: &Value) -> Vec<String> {
    let tool = match input.get("tool_input") {
        Some(t @ (Value::Object(_) | Value::Array(_))) => t,
        _ => match input.get("toolCall").and_then(|c| c.get("args")) {
            Some(a @ (Value::Object(_) | Value::Array(_))) => a,
            _ => return vec![],
        },
    };
    let cwd = input_cwd(input)
        .map(PathBuf::from)
        .unwrap_or_else(|| std::env::current_dir().unwrap_or_default());
    let mut found: Vec<String> = PATH_FIELDS
        .iter()
        .filter_map(|f| tool.get(f).and_then(Value::as_str).map(str::to_string))
        .collect();
    let mut texts = Vec::new();
    strings(tool, &mut texts);
    for text in texts {
        patch_files(text, &mut found);
    }
    let mut seen = std::collections::HashSet::new();
    found
        .iter()
        .map(|f| resolve(&cwd, f).to_string_lossy().into_owned())
        .filter(|p| seen.insert(p.clone()))
        .collect()
}

pub fn event_from(input: &Value, host: &str, at: u64) -> Option<Value> {
    if !input.is_object() {
        return None;
    }
    let session = nonempty(input, "session_id").or_else(|| nonempty(input, "conversationId"))?;
    let raw = nonempty(input, "hook_event_name").or_else(|| nonempty(input, "hookEventName"))?;
    if raw == "PreInvocation" && input.get("invocationNum").and_then(Value::as_f64).is_some_and(|n| n > 0.0) {
        return None;
    }
    let name = if raw == "PreInvocation" { "UserPromptSubmit" } else { raw };
    let host = if host == "antigravity" || (!truthy(input.get("session_id")) && str_field(input, "conversationId").is_some()) {
        "antigravity"
    } else {
        host
    };
    let mut event = Map::new();
    event.insert("host".into(), json!(host));
    event.insert("session".into(), json!(session));
    event.insert("event".into(), json!(name));
    event.insert("at".into(), json!(at));
    if name == "PreToolUse" {
        let mut paths = paths_of(input);
        paths.truncate(64);
        event.insert("paths".into(), json!(paths));
        let tool = str_field(input, "tool_name").or_else(|| input.get("toolCall")?.get("name")?.as_str());
        if let Some(tool) = tool.filter(|t| utf16_len(t) <= 64) {
            event.insert("tool".into(), json!(tool));
        }
    }
    Some(Value::Object(event))
}

pub fn run(args: &[String]) {
    crate::title::set_ryugi_title("hook");
    let at = now_ms();
    let host = match args.first().map(String::as_str) {
        Some("antigravity") => "antigravity",
        Some("claude") => "claude",
        _ => "codex",
    };
    let input = read_stdin_json(Duration::from_secs(1));
    if host == "antigravity" && input.as_ref().and_then(|i| str_field(i, "hookEventName")) != Some("PreToolUse") {
        println!("{{}}");
    }
    let Some(input) = input else { return };
    let Some(event) = event_from(&input, host, at) else { return };
    let project = input_cwd(&input)
        .and_then(|c| crate::paths::project_root(Path::new(c)))
        .or_else(|| args.get(1).map(PathBuf::from));
    if let Some(project) = project {
        crate::hub::post_to_server(&crate::paths::hub_project_of(&project), "/api/agent/event", Some(&event));
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn apply_patch_files_resolve_against_cwd() {
        let input = json!({
            "cwd": "/repo/packages/app",
            "tool_input": {"command": "*** Begin Patch\n*** Update File: ../../a.html\n*** Add File: src/new.ts\n*** Move to: b.ts \n*** End Patch"}
        });
        assert_eq!(paths_of(&input), vec!["/repo/a.html", "/repo/packages/app/src/new.ts", "/repo/packages/app/b.ts"]);
    }

    #[test]
    fn path_fields_come_first_and_duplicates_drop() {
        let input = json!({
            "cwd": "/r",
            "tool_input": {"edits": ["*** Update File: x"], "file_path": "/r/x", "path": "y"}
        });
        assert_eq!(paths_of(&input), vec!["/r/x", "/r/y"]);
    }

    #[test]
    fn antigravity_args_use_workspace_paths() {
        let input = json!({"workspacePaths": ["/w"], "toolCall": {"name": "edit_file", "args": {"TargetFile": "f"}}});
        assert_eq!(paths_of(&input), vec!["/w/f"]);
    }

    #[test]
    fn events_need_a_session_and_a_name() {
        assert!(event_from(&json!({"session_id": "s"}), "claude", 1).is_none());
        assert!(event_from(&json!({"hook_event_name": "Stop"}), "claude", 1).is_none());
        assert_eq!(
            event_from(&json!({"session_id": "s", "hook_event_name": "Stop"}), "claude", 7).unwrap(),
            json!({"host": "claude", "session": "s", "event": "Stop", "at": 7})
        );
    }

    #[test]
    fn mid_turn_pre_invocation_is_dropped() {
        let base = json!({"conversationId": "c", "hookEventName": "PreInvocation", "invocationNum": 1});
        assert!(event_from(&base, "antigravity", 1).is_none());
        let first = json!({"conversationId": "c", "hookEventName": "PreInvocation", "invocationNum": 0});
        assert_eq!(event_from(&first, "codex", 1).unwrap()["event"], "UserPromptSubmit");
        assert_eq!(event_from(&first, "codex", 1).unwrap()["host"], "antigravity");
    }

    #[test]
    fn long_tool_names_are_left_out() {
        let input = json!({"session_id": "s", "hook_event_name": "PreToolUse", "tool_name": "x".repeat(65)});
        let event = event_from(&input, "claude", 1).unwrap();
        assert!(event.get("tool").is_none());
        assert_eq!(event["paths"], json!([]));
    }
}
