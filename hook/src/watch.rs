use std::io::Write;
use std::path::PathBuf;

use crate::channel::{open, Options, Signal};

fn claude_session() -> Option<String> {
    std::env::var("CLAUDE_CODE_SESSION_ID").ok().filter(|s| crate::text::is_uuid(s))
}

pub fn claude(args: &[String]) {
    crate::title::set_ryugi_title("watch-comments");
    if matches!(crate::hosts::match_custom_host(), Ok(Some(_))) {
        return;
    }
    let project = args
        .first()
        .filter(|p| !p.is_empty())
        .map(PathBuf::from)
        .unwrap_or_else(|| std::env::current_dir().unwrap_or_default());
    let Some(session) = claude_session() else { return };
    let cowork = std::env::var("CLAUDE_CODE_IS_COWORK").is_ok_and(|v| !v.is_empty());
    let agent = if cowork { "Claude Cowork" } else { "Claude Code" };
    crate::sys::exit_on_interrupt();
    let (_channel, thread) = open(Options::new(project, "claude", &session, agent), |channel, signal| match signal {
        Signal::Event(event, id) => {
            let text = crate::wake::wake_message(&event, Some(crate::wake::NOTIFICATION_LIMIT));
            let mut out = std::io::stdout().lock();
            if writeln!(out, "{text}").and_then(|_| out.flush()).is_err() {
                std::process::exit(0);
            }
            channel.delivered(&id);
        }
        Signal::Replaced => std::process::exit(0),
        _ => {}
    });
    let _ = thread.join();
}

pub fn pi(args: &[String]) {
    stdio_watch(args, "pi", false);
}

pub fn dsh(args: &[String]) {
    stdio_watch(args, "dsh", true);
}

fn stdio_watch(args: &[String], agent: &str, needs_artifacts: bool) {
    use std::io::BufRead;
    crate::title::set_ryugi_title("watch-comments");
    let cwd = args.first().map(PathBuf::from).unwrap_or_else(|| std::env::current_dir().unwrap_or_default());
    let Some(session) = args.get(1).filter(|s| !s.is_empty()).cloned() else { return };
    let project = crate::paths::project_root(&cwd).unwrap_or(cwd);
    if needs_artifacts && !project.join(".ryugi/artifacts").exists() {
        return;
    }
    let (channel, thread) = open(Options::new(project, "pi", &session, agent), |_, signal| match signal {
        Signal::Event(event, id) => {
            let line = serde_json::json!({
                "id": id,
                "type": event.get("type"),
                "artifact": event.get("artifact"),
                "content": crate::wake::wake_message(&event, None),
            });
            let mut out = std::io::stdout().lock();
            if writeln!(out, "{line}").and_then(|_| out.flush()).is_err() {
                std::process::exit(0);
            }
        }
        Signal::Replaced => std::process::exit(0),
        _ => {}
    });
    let acks = channel.clone();
    std::thread::spawn(move || {
        for line in std::io::stdin().lock().lines() {
            let Ok(line) = line else { break };
            if let Ok(message) = serde_json::from_str::<serde_json::Value>(&line) {
                if let Some(id) = message.get("delivered") {
                    acks.delivered(id);
                }
            }
        }
        std::process::exit(0);
    });
    crate::sys::exit_on_interrupt();
    let _ = thread.join();
}
