use std::path::{Component, Path, PathBuf};
use std::time::Duration;

use serde_json::{json, Value};

use crate::evidence::{review_state_key, unread_thread_count};
use crate::text::{clip, is_uuid, join, js_str, js_trim, js_trim_end, uslice, ulen};

const MAX_CONTEXT: usize = 8000;
const MAX_HTML: usize = 600;
const MAX_REMINDERS: usize = 600;

fn read_json(file: &Path) -> Option<Value> {
    serde_json::from_str(&std::fs::read_to_string(file).ok()?).ok()
}

fn truthy(v: Option<&Value>) -> bool {
    crate::input::truthy(v)
}

fn env(name: &str) -> Option<String> {
    std::env::var(name).ok().filter(|v| !v.is_empty())
}

pub fn relative(from: &Path, to: &Path) -> String {
    let a: Vec<Component> = from.components().collect();
    let b: Vec<Component> = to.components().collect();
    let common = a.iter().zip(&b).take_while(|(x, y)| x == y).count();
    let mut parts: Vec<String> = vec!["..".into(); a.len() - common];
    parts.extend(b[common..].iter().map(|c| c.as_os_str().to_string_lossy().into_owned()));
    parts.join("/")
}

fn sorted_dir(dir: &Path) -> Vec<String> {
    let mut names: Vec<String> = std::fs::read_dir(dir)
        .map(|r| r.flatten().map(|e| e.file_name().to_string_lossy().into_owned()).collect())
        .unwrap_or_default();
    names.sort_by(|a, b| a.encode_utf16().cmp(b.encode_utf16()));
    names
}

fn dir_entries(dir: &Path) -> Option<Vec<String>> {
    Some(
        std::fs::read_dir(dir)
            .ok()?
            .flatten()
            .map(|e| e.file_name().to_string_lossy().into_owned())
            .collect(),
    )
}

struct Mine(Option<std::collections::HashSet<String>>);

impl Mine {
    fn of(opened: Vec<String>) -> Mine {
        let opened: std::collections::HashSet<String> = opened.into_iter().collect();
        Mine((!opened.is_empty()).then_some(opened))
    }

    fn has(&self, artifact: &str) -> bool {
        self.0.as_ref().is_none_or(|opened| opened.contains(artifact))
    }
}

struct Selection {
    file: PathBuf,
    value: Value,
}

fn selection_files(state: &Path, mine: &Mine) -> Vec<Selection> {
    let mut files = Vec::new();
    for kind in dir_entries(state).unwrap_or_default() {
        let Some(ids) = dir_entries(&state.join(&kind)) else { continue };
        for id in ids {
            if !mine.has(&format!("{kind}/{id}")) {
                continue;
            }
            let file = state.join(&kind).join(&id).join("selection.json");
            let Some(value) = read_json(&file) else { continue };
            if ["selected", "tweaks", "nodes"].iter().all(|k| value.get(k).is_some_and(Value::is_array)) {
                files.push(Selection { file, value });
            }
        }
    }
    files
}

fn arr<'a>(v: &'a Value, key: &str) -> &'a [Value] {
    v.get(key).and_then(Value::as_array).map(Vec::as_slice).unwrap_or_default()
}

fn s(v: &Value, key: &str) -> String {
    js_str(v.get(key))
}

fn where_(node: &Value) -> String {
    format!("{} <{}> in {} at `{}`", s(node, "id"), s(node, "tag"), s(node, "file"), s(node, "path"))
}

fn change(item: &Value) -> String {
    format!("{}: {} → {}", s(item, "property"), s(item, "from"), s(item, "value"))
}

fn clip_value(v: Option<&Value>, max: usize) -> String {
    match v {
        Some(Value::String(text)) => clip(text, max),
        other => js_str(other),
    }
}

fn named_suffix(node: &Value) -> String {
    if truthy(node.get("name")) {
        format!(" \"{}\"", s(node, "name"))
    } else {
        String::new()
    }
}

fn typed_ids(board: &str, prompt: &str, out: &mut std::collections::HashSet<String>) {
    let needle = format!("{board}#");
    let mut i = 0;
    while i <= prompt.len() {
        let Some(found) = prompt[i..].find(&needle).map(|p| p + i) else { break };
        let before = prompt[..found].chars().next_back();
        let ok_before = !before.is_some_and(|c| c.is_ascii_alphanumeric() || c == '_' || c == '-');
        let after = &prompt[found + needle.len()..];
        let digits: String = after.chars().take_while(char::is_ascii_digit).collect();
        if ok_before && !digits.is_empty() {
            out.insert(format!("{board}#{digits}"));
            i = found + needle.len() + digits.len();
        } else {
            i = found + prompt[found..].chars().next().map_or(1, char::len_utf8);
        }
    }
}

fn typed_nodes<'a>(nodes: &'a [Value], prompt: &str) -> Vec<&'a Value> {
    let mut boards: Vec<String> = Vec::new();
    for node in nodes {
        let b = s(node, "board");
        if !boards.contains(&b) {
            boards.push(b);
        }
    }
    let mut typed = std::collections::HashSet::new();
    for board in &boards {
        typed_ids(board, prompt, &mut typed);
    }
    nodes
        .iter()
        .filter(|n| n.get("id").and_then(Value::as_str).is_some_and(|id| typed.contains(id)))
        .collect()
}

fn describe(session: &Path, sel: &Selection, prompt: &str, budget: usize) -> String {
    let value = &sel.value;
    let selected = arr(value, "selected");
    let tweaks = arr(value, "tweaks");
    let named = typed_nodes(arr(value, "nodes"), prompt);
    let removed = arr(value, "removed");
    if selected.is_empty() && tweaks.is_empty() && removed.is_empty() && named.is_empty() {
        return String::new();
    }
    let mut head = vec![format!(
        "Artboard {}, open in the viewer (updated {}):",
        s(value, "artifact"),
        s(value, "updatedAt")
    )];
    if !named.is_empty() {
        head.push("Nodes named in this message:".into());
        for node in &named {
            head.push(format!("- {}{}", where_(node), named_suffix(node)));
        }
    }
    let tail = format!("Full selection and node map: {}", relative(session, &sel.file));
    let mut body = Vec::new();
    if !selected.is_empty() {
        let html = (budget / 2 / selected.len()).clamp(80, MAX_HTML);
        body.push("Selected nodes:".to_string());
        for node in selected {
            let text = if truthy(node.get("text")) {
                format!(" \"{}\"", clip_value(node.get("text"), 120))
            } else {
                String::new()
            };
            body.push(format!("- {}{}", where_(node), text));
            if truthy(node.get("html")) {
                body.push(format!("  html: {}", clip_value(node.get("html"), html)));
            }
            let node_tweaks = arr(node, "tweaks");
            if !node_tweaks.is_empty() {
                body.push(format!(
                    "  preview tweaks: {}",
                    node_tweaks.iter().map(change).collect::<Vec<_>>().join("; ")
                ));
            }
        }
        if truthy(value.get("more")) {
            body.push(format!("({} more selected, listed in the file below)", s(value, "more")));
        }
    }
    if !tweaks.is_empty() {
        body.push("Preview tweaks on other nodes (not in the source yet):".into());
        for tweak in tweaks {
            body.push(format!("- {}: {}", where_(tweak), change(tweak)));
        }
    }
    if !removed.is_empty() {
        body.push("Deleted in the preview (still in the source; delete them there):".into());
        for node in removed {
            body.push(format!("- {}{}", where_(node), named_suffix(node)));
        }
    }
    let head = head.join("\n");
    let fixed = ulen(&head) + ulen(&tail) + 2;
    let room = budget.saturating_sub(fixed);
    let middle = body.join("\n");
    let kept = if ulen(&middle) > room {
        format!("{}\n(more in the file below)", uslice(&middle, room.saturating_sub(40)))
    } else {
        middle
    };
    [head, kept, tail].into_iter().filter(|p| !p.is_empty()).collect::<Vec<_>>().join("\n")
}

fn consumed_of(root: &Path, scope: &str, key: &str) -> Vec<String> {
    let file = root.join(".state/agent-review").join(format!("agent-{}.json", review_state_key(scope, key)));
    read_json(&file)
        .and_then(|v| v.get("consumed").and_then(Value::as_array).cloned())
        .map(|items| items.iter().filter_map(|i| i.as_str().map(str::to_string)).collect())
        .unwrap_or_default()
}

fn open_unread(file: &Value, consumed: &[String]) -> Option<usize> {
    let threads: Vec<Value> = file
        .get("threads")?
        .as_array()?
        .iter()
        .filter(|t| t.get("status").and_then(Value::as_str) != Some("resolved"))
        .cloned()
        .collect();
    let mut copy = file.clone();
    copy["threads"] = Value::Array(threads);
    unread_thread_count(Some(&copy), consumed)
}

fn comment_reminders(root: &Path, key: &str, mine: &Mine) -> String {
    let mut waiting: Vec<(String, usize)> = Vec::new();
    for kind in ["document", "artboard", "whiteboard", "slides", "storyboard", "report"] {
        for id in sorted_dir(&root.join(kind)) {
            if !mine.has(&format!("{kind}/{id}")) {
                continue;
            }
            let Some(file) = read_json(&root.join(kind).join(&id).join("comments.json")) else { continue };
            if !truthy(Some(&file)) {
                continue;
            }
            let scope = format!("{kind}/{id}");
            let count = open_unread(&file, &consumed_of(root, &scope, key)).unwrap_or(0);
            if count > 0 {
                waiting.push((scope, count));
            }
        }
    }
    if waiting.is_empty() {
        return String::new();
    }
    let head = "Unread comment evidence: ";
    let mut named: Vec<String> = Vec::new();
    for (index, (artifact, count)) in waiting.iter().enumerate() {
        let more = waiting.len() - index - 1;
        let mut next = named.clone();
        next.push(format!("{artifact} ({count})"));
        let tail = if more > 0 { format!(", and {more} more artifact(s)") } else { String::new() };
        if ulen(head) + ulen(&next.join(", ")) + ulen(&tail) + 1 > MAX_REMINDERS {
            break;
        }
        named = next;
    }
    let left = waiting.len() - named.len();
    let rest = if left > 0 {
        format!("{}{left} more artifact(s)", if named.is_empty() { "" } else { ", and " })
    } else {
        String::new()
    };
    format!("{head}{}{rest}.", named.join(", "))
}

fn preview_reminders(root: &Path, key: &str, mine: &Mine) -> String {
    let preview_root = root.parent().unwrap_or(root).join("preview");
    let Some(mut ids) = dir_entries(&preview_root) else { return String::new() };
    ids.sort_by(|a, b| a.encode_utf16().cmp(b.encode_utf16()));
    let mut waiting = Vec::new();
    for id in ids.into_iter().filter(|id| mine.has(&format!("preview/{id}"))) {
        let Some(file) = read_json(&preview_root.join(&id).join("comments.json")) else { continue };
        if !file.get("threads").is_some_and(Value::is_array) {
            continue;
        }
        let scope = format!("preview/{id}");
        let count = open_unread(&file, &consumed_of(root, &scope, key)).unwrap_or(0);
        if count > 0 {
            waiting.push((id, count));
        }
    }
    if waiting.is_empty() {
        return String::new();
    }
    let summary = waiting.iter().map(|(id, c)| format!("{id} ({c})")).collect::<Vec<_>>().join(", ");
    format!("Unread local preview comments: {summary}.")
}

pub fn credentials_path(home: &Path) -> PathBuf {
    env("XDG_CONFIG_HOME").map(PathBuf::from).unwrap_or_else(|| home.join(".config")).join("ryugi/credentials.json")
}

fn read_text(file: &Path) -> String {
    std::fs::read_to_string(file).map(|t| js_trim(&t).to_string()).unwrap_or_default()
}

fn remember(file: &Path, value: &str) {
    let _ = std::fs::write(file, format!("{value}\n"));
}

fn sha16(text: &str) -> String {
    use sha2::{Digest, Sha256};
    Sha256::digest(text.as_bytes()).iter().take(8).map(|b| format!("{b:02x}")).collect()
}

fn auto_publish_context(project: &str, session_id: &str, launcher: &str) -> String {
    let state = crate::paths::artifacts_root(Path::new(project)).join(".state");
    let home = crate::paths::home().unwrap_or_default();
    let credentials = credentials_path(&home);
    let token = read_json(&credentials).and_then(|c| c.get("token").and_then(Value::as_str).map(str::to_string));
    let settings = read_json(&credentials.with_file_name("config.json")).unwrap_or(Value::Null);
    let auto = settings.get("autoPublish").and_then(Value::as_bool);
    let mut lines = Vec::new();
    let sign_in_file = state.join("auto-publish-sign-in");
    let seen = token.as_deref().map(sha16).unwrap_or_else(|| "signed-out".into());
    let previous = read_text(&sign_in_file);
    if previous != seen {
        remember(&sign_in_file, &seen);
        if let (false, Some(_), Some(on)) = (previous.is_empty(), &token, auto) {
            lines.push(format!(
                "Your human partner just signed in to Ryugi Cloud; auto-publish is {}. Tell them in one line, in their language, and that they can change it any time from Settings (their avatar at the top right of the artifact list) or with `node \"{launcher}\" config --auto-publish on|off`.",
                if on { "on: when your turn ends, artifacts changed during it are published as private copies they can open from another device" } else { "off" }
            ));
        }
    }
    let asked_file = state.join("auto-publish-asked");
    if token.is_some() && auto.is_none() && read_text(&asked_file) != session_id {
        remember(&asked_file, session_id);
        lines.push("Ryugi auto-publish is not decided yet. Ask your human partner once, in their language: when your turn ends, artifacts changed during it can be published automatically as private copies on Ryugi Cloud, so they can open them from another device (only they can see them; ryugi.innei.dev lists them when signed in). Nothing is published until they answer.".into());
        lines.push(format!("Then run `node \"{launcher}\" config --auto-publish on` or `node \"{launcher}\" config --auto-publish off` with their answer."));
    }
    let notice = read_json(&state.join("auto-publish.json")).and_then(|v| v.get("notice").cloned());
    let notified_file = state.join("auto-publish-notified");
    if let Some(notice) = notice.filter(|n| truthy(Some(n))) {
        if let Some(id) = notice.get("id").and_then(Value::as_str) {
            if read_text(&notified_file) != id {
                remember(&notified_file, id);
                let message = clip(&js_str(notice.get("message")), 200);
                match notice.get("kind").and_then(Value::as_str) {
                    Some("signed-out") => lines.push(format!(
                        "Ryugi auto-publish paused: the Ryugi Cloud sign-in expired. Tell your human partner and offer to sign in again with `node \"{launcher}\" publish --login --format brief --project-dir \"{project}\"`."
                    )),
                    Some("failing") => lines.push(format!(
                        "Ryugi auto-publish could not publish {message}. It keeps retrying. Tell your human partner, and fix the artifact's warnings if there are any."
                    )),
                    Some("cap") => match notice.get("upgradeUrl").and_then(Value::as_str) {
                        Some(url) => lines.push(format!(
                            "Ryugi Cloud refused a new cloud copy: {message} Existing copies still update. Tell your human partner they can upgrade at {}.",
                            clip(url, 200)
                        )),
                        None => lines.push(format!(
                            "Ryugi auto-publish could not create a new cloud copy ({message}). Existing copies still update. Tell your human partner; they can delete old copies with `node \"{launcher}\" publish --list --format brief --project-dir \"{project}\"` and `--delete <cloud-id>`."
                        )),
                    },
                    _ => {}
                }
            }
        }
    }
    lines.join("\n")
}

fn document_selections(session: &Path, root: &Path, budget: i64, mine: &Mine) -> Vec<String> {
    let mut sections = Vec::new();
    let mut left = budget;
    for id in sorted_dir(&root.join("document")).into_iter().filter(|id| mine.has(&format!("document/{id}"))) {
        let file = root.join(".state/document").join(&id).join("selection.json");
        let Some(value) = read_json(&file) else { continue };
        let Some(quote) = value.get("quote").and_then(Value::as_str).filter(|q| !q.is_empty()) else { continue };
        let Some(block_ids) = value.get("blockIds").and_then(Value::as_array) else { continue };
        let heading = truthy(value.get("heading"));
        let blocks = if block_ids.is_empty() {
            String::new()
        } else {
            format!("{} blocks {}", if heading { "," } else { " in" }, join(block_ids, ", "))
        };
        let under = if heading { format!(" under \"{}\"", s(&value, "heading")) } else { String::new() };
        let head = format!(
            "Document document/{id}, open in the viewer (updated {}):\nSelected{under}{blocks}:",
            s(&value, "updatedAt")
        );
        let tail = format!("Full selection: {}", relative(session, &file));
        let room = left - ulen(&head) as i64 - ulen(&tail) as i64 - 4;
        if room < 40 {
            break;
        }
        let quoted = clip(quote, room as usize).split('\n').map(|l| format!("> {l}")).collect::<Vec<_>>().join("\n");
        let section = [head, quoted, tail].join("\n");
        left -= ulen(&section) as i64 + 2;
        sections.push(section);
    }
    sections
}

fn element(item: &Value) -> String {
    let mut out = format!("- {} {}", s(item, "id"), s(item, "type"));
    if truthy(item.get("text")) {
        out.push_str(&format!(" \"{}\"", clip_value(item.get("text"), 120)));
    }
    if truthy(item.get("frameId")) {
        out.push_str(&format!(" in frame {}", s(item, "frameId")));
    }
    if truthy(item.get("author")) {
        out.push_str(&format!(" · {}", s(item, "author")));
    }
    out
}

fn whiteboard_selections(session: &Path, root: &Path, budget: i64, mine: &Mine) -> Vec<String> {
    let mut sections = Vec::new();
    let mut left = budget;
    for id in sorted_dir(&root.join(".state/whiteboard")).into_iter().filter(|id| mine.has(&format!("whiteboard/{id}"))) {
        let file = root.join(".state/whiteboard").join(&id).join("selection.json");
        let Some(value) = read_json(&file) else { continue };
        let selected = arr(&value, "selected");
        if selected.is_empty() {
            continue;
        }
        let head = format!(
            "Whiteboard whiteboard/{id}, open in the viewer (updated {}):\nSelected elements:",
            s(&value, "updatedAt")
        );
        let tail = format!("Full selection: {}", relative(session, &file));
        let room = left - ulen(&head) as i64 - ulen(&tail) as i64 - 4;
        if room < 40 {
            break;
        }
        let list = selected.iter().map(element).collect::<Vec<_>>().join("\n");
        let section = [head, clip(&list, room as usize), tail].join("\n");
        left -= ulen(&section) as i64 + 2;
        sections.push(section);
    }
    sections
}

fn preview_selections(session: &Path, root: &Path, budget: i64, mine: &Mine) -> Vec<String> {
    let mut sections = Vec::new();
    let mut left = budget;
    for id in sorted_dir(&root.join(".state/preview")).into_iter().filter(|id| mine.has(&format!("preview/{id}"))) {
        let file = root.join(".state/preview").join(&id).join("selection.json");
        let Some(value) = read_json(&file) else { continue };
        let Some(sel) = value.get("selected").filter(|v| v.is_object() || v.is_array()) else { continue };
        let Some(route) = sel.get("route").and_then(Value::as_str) else { continue };
        let mut parts = vec![route.to_string()];
        if sel.get("kind").and_then(Value::as_str) == Some("box") && truthy(sel.get("rect")) {
            let r = &sel["rect"];
            parts.push(format!("box ({},{} {}x{})", s(r, "x"), s(r, "y"), s(r, "w"), s(r, "h")));
        }
        if let Some(selector) = sel.get("selector").and_then(Value::as_str).filter(|v| !v.is_empty()) {
            parts.push(selector.into());
        } else if let Some(tag) = sel.get("tag").and_then(Value::as_str).filter(|v| !v.is_empty()) {
            parts.push(format!("<{tag}>"));
        }
        let source = sel.get("source").filter(|v| truthy(Some(v)));
        if let Some(f) = source.and_then(|src| src.get("file")).and_then(Value::as_str) {
            let line = source.and_then(|src| src.get("line"));
            parts.push(if truthy(line) { format!("{f}:{}", js_str(line)) } else { f.into() });
        } else if let Some(c) = source.and_then(|src| src.get("component")).and_then(Value::as_str) {
            parts.push(format!("<{c}>"));
        }
        let text = match sel.get("text").and_then(Value::as_str).filter(|t| !t.is_empty()) {
            Some(t) => format!(" \"{}\"", clip(t, 120)),
            None => String::new(),
        };
        let head = format!(
            "Local preview ({id}), open in Hub (updated {}):\nSelected: {}{text}",
            s(&value, "updatedAt"),
            parts.join(" · ")
        );
        let section = [head, format!("Full selection: {}", relative(session, &file))].join("\n");
        if ulen(&section) as i64 + 2 > left {
            break;
        }
        left -= ulen(&section) as i64 + 2;
        sections.push(section);
    }
    sections
}

pub fn launcher() -> String {
    let root = env("RYUGI_PLUGIN_ROOT").map(PathBuf::from).or_else(|| {
        let exe = std::env::current_exe().ok()?;
        exe.ancestors().nth(4).map(Path::to_path_buf)
    });
    root.unwrap_or_default().join("skills/artifacts/app/ryugi.cjs").to_string_lossy().into_owned()
}

fn spawn_antigravity_watch(project: &str, session: &str) {
    crate::start::spawn_detached(
        &["watch", "antigravity"],
        Path::new(project),
        &[("ANTIGRAVITY_CONVERSATION_ID", session)],
        json!({"conversationId": session, "cwd": project}).to_string().as_bytes(),
    );
}

pub fn run(args: &[String]) {
    let input = crate::input::read_stdin(Duration::from_secs(10))
        .and_then(|b| serde_json::from_slice::<Value>(&b).ok())
        .filter(Value::is_object)
        .unwrap_or_else(|| json!({}));
    let agy = input.get("hookEventName").and_then(Value::as_str) == Some("PreInvocation")
        || ((env("ANTIGRAVITY_AGENT").is_some() || env("PLUGIN_ROOT").is_some() || env("PLUGIN_DATA").is_some())
            && env("CLAUDE_PROJECT_DIR").is_none()
            && env("CLAUDE_PLUGIN_ROOT").is_none()
            && env("CURSOR_PLUGIN_ROOT").is_none()
            && input.get("hook_event_name").is_none());
    let empty = || {
        if agy {
            println!("{{}}");
        }
    };
    if agy && input.get("invocationNum").and_then(Value::as_f64).is_some_and(|n| n > 0.0) {
        return println!("{{}}");
    }
    let raw_cwd = crate::input::nonempty(&input, "cwd")
        .or_else(|| input.get("workspacePaths")?.get(0)?.as_str())
        .map(PathBuf::from)
        .unwrap_or_else(|| std::env::current_dir().unwrap_or_default());
    let session = match (args.get(1).filter(|a| !a.is_empty()), args.first().filter(|a| !a.is_empty())) {
        (Some(s), _) => Some(PathBuf::from(s)),
        (None, Some(p)) => Some(PathBuf::from(p)),
        (None, None) => std::fs::canonicalize(&raw_cwd).ok(),
    };
    let Some(session) = session else { return empty() };
    let project = match args.first().filter(|a| !a.is_empty()) {
        Some(p) => PathBuf::from(p),
        None => match crate::paths::project_root(&session) {
            Some(p) => p,
            None => return empty(),
        },
    };
    let project_text = project.to_string_lossy().into_owned();
    let root = crate::paths::artifacts_root(&project);
    let state = root.join(".state");
    let raw_session = crate::input::nonempty(&input, "session_id")
        .or_else(|| crate::input::nonempty(&input, "conversationId"))
        .unwrap_or("");
    let session_id = if is_uuid(raw_session) {
        Some(raw_session.to_string())
    } else {
        env("ANTIGRAVITY_CONVERSATION_ID").or_else(|| env("CLAUDE_CODE_SESSION_ID"))
    };
    if agy && env("ANTIGRAVITY_LS_ADDRESS").is_some() {
        if let Some(id) = session_id.as_deref().filter(|s| is_uuid(s)) {
            spawn_antigravity_watch(&project_text, id);
        }
    }
    if agy && !state.join("server-info").exists() {
        return println!("{{}}");
    }
    let prompt = input
        .get("prompt")
        .and_then(Value::as_str)
        .or_else(|| input.get("lastUserInput").and_then(Value::as_str))
        .unwrap_or("");
    let launcher = launcher();
    let auto_publish = auto_publish_context(
        &project_text,
        session_id.as_deref().filter(|s| !s.is_empty()).unwrap_or(raw_session),
        &launcher,
    );
    let key = if agy {
        "Antigravity"
    } else if env("CLAUDE_CODE_IS_COWORK").is_some() {
        "Claude Cowork"
    } else {
        "Claude Code"
    };
    let host = if agy { "antigravity" } else { "claude" };
    let mine = Mine::of(session_id.as_deref().map(|id| crate::subs::opened(&project, host, id)).unwrap_or_default());
    let reminders = [
        preview_reminders(&root, key, &mine),
        comment_reminders(&root, key, &mine),
        auto_publish,
    ]
    .into_iter()
    .filter(|r| !r.is_empty())
    .collect::<Vec<_>>()
    .join("\n\n");
    let mut files = selection_files(&state, &mine);
    files.sort_by(|a, b| s(&b.value, "updatedAt").encode_utf16().cmp(s(&a.value, "updatedAt").encode_utf16()));
    let mut sections = Vec::new();
    let mut left = MAX_CONTEXT as i64 - if reminders.is_empty() { 0 } else { ulen(&reminders) as i64 + 2 };
    for entry in &files {
        if left <= 0 {
            break;
        }
        let section = describe(&session, entry, prompt, left as usize);
        if section.is_empty() {
            continue;
        }
        left -= ulen(&section) as i64 + 2;
        sections.push(section);
    }
    let documents = document_selections(&session, &root, left, &mine);
    for section in &documents {
        left -= ulen(section) as i64 + 2;
    }
    sections.extend(documents);
    sections.extend(whiteboard_selections(&session, &root, left, &mine));
    sections.extend(preview_selections(&session, &root, left, &mine));
    if !reminders.is_empty() {
        sections.push(reminders);
    }
    if sections.is_empty() {
        return empty();
    }
    let text = format!("{}\n", sections.join("\n\n"));
    if agy {
        let out = json!({"injectSteps": [{"systemMessage": {"systemMessage": js_trim_end(&text)}}]});
        println!("{}", crate::evidence::js_stringify(&out));
    } else {
        print!("{text}");
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn relative_paths_climb_out_of_the_session() {
        assert_eq!(relative(Path::new("/r/packages/app"), Path::new("/r/.ryugi/x.json")), "../../.ryugi/x.json");
        assert_eq!(relative(Path::new("/r"), Path::new("/r/a/b")), "a/b");
    }

    #[test]
    fn typed_ids_respect_word_boundaries() {
        let mut out = std::collections::HashSet::new();
        typed_ids("hero-2", "看看：**hero-2#5** 和 hero-2#50 xhero-2#7 _hero-2#8", &mut out);
        let mut got: Vec<_> = out.into_iter().collect();
        got.sort();
        assert_eq!(got, vec!["hero-2#5", "hero-2#50"]);
    }

    fn two_artboards(t: &crate::testdir::TestDir) -> PathBuf {
        let comments = r#"{"version":1,"threads":[{"id":"t1","anchor":{"x":1,"y":1},"status":"open","messages":[{"id":"m1","author":"human","text":"bigger","at":"2026-11-20T08:00:00.000Z"}]}]}"#;
        for id in ["one", "two"] {
            t.write(&format!(".ryugi/artifacts/artboard/{id}/comments.json"), comments);
            t.write(
                &format!(".ryugi/artifacts/.state/artboard/{id}/selection.json"),
                &format!(r#"{{"artifact":"artboard/{id}","updatedAt":"2026-11-20T08:00:00.000Z","selected":[{{"id":"{id}#1","board":"{id}","file":"{id}.html","tag":"div","path":"body"}}],"tweaks":[],"nodes":[]}}"#),
            );
        }
        t.path().join(".ryugi/artifacts")
    }

    fn reminded(root: &Path, mine: &Mine) -> String {
        comment_reminders(root, "Claude Code", mine).lines().next().unwrap_or_default().to_string()
    }

    fn selected(root: &Path, mine: &Mine) -> Vec<String> {
        let mut got: Vec<String> = selection_files(&root.join(".state"), mine).iter().map(|f| s(&f.value, "artifact")).collect();
        got.sort();
        got
    }

    #[test]
    fn each_session_is_reminded_only_of_the_artifacts_it_opened() {
        let t = crate::testdir::TestDir::new("context-mine");
        let root = two_artboards(&t);
        let one = Mine::of(vec!["artboard/one".into()]);
        let two = Mine::of(vec!["artboard/two".into()]);
        assert_eq!(reminded(&root, &one), "Unread comment evidence: artboard/one (1).");
        assert_eq!(reminded(&root, &two), "Unread comment evidence: artboard/two (1).");
        assert_eq!(selected(&root, &one), vec!["artboard/one"]);
        assert_eq!(selected(&root, &two), vec!["artboard/two"]);
    }

    #[test]
    fn a_session_that_opened_nothing_sees_the_whole_project() {
        let t = crate::testdir::TestDir::new("context-all");
        let root = two_artboards(&t);
        let nothing = Mine::of(vec![]);
        assert_eq!(reminded(&root, &nothing), "Unread comment evidence: artboard/one (1), artboard/two (1).");
        assert_eq!(selected(&root, &nothing), vec!["artboard/one", "artboard/two"]);
    }

    #[test]
    fn a_comment_reminder_names_what_waits_and_no_command() {
        let t = crate::testdir::TestDir::new("context-no-command");
        let root = two_artboards(&t);
        let one = Mine::of(vec!["artboard/one".into()]);
        assert_eq!(
            comment_reminders(&root, "Claude Code", &one),
            "Unread comment evidence: artboard/one (1)."
        );
    }

    #[test]
    fn a_preview_reminder_names_what_waits_and_no_command() {
        let t = crate::testdir::TestDir::new("context-preview-no-command");
        let root = two_artboards(&t);
        t.write(
            ".ryugi/preview/p1/comments.json",
            r#"{"version":1,"threads":[{"id":"t1","anchor":{"x":1,"y":1},"status":"open","messages":[{"id":"m1","author":"human","text":"bigger","at":"2026-11-20T08:00:00.000Z"}]}]}"#,
        );
        assert_eq!(
            preview_reminders(&root, "Claude Code", &Mine::of(vec![])),
            "Unread local preview comments: p1 (1)."
        );
    }
}
