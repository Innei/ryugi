use std::io::Write;
use std::path::PathBuf;

use crate::channel::{open, Options, Signal};

fn claude_session() -> Option<String> {
    std::env::var("CLAUDE_CODE_SESSION_ID").ok().filter(|s| crate::text::is_uuid(s))
}

pub fn claude_pid() -> Option<String> {
    std::env::var("CLAUDE_PID").ok().filter(|p| !p.is_empty())
}

pub fn claude(args: &[String]) {
    if matches!(crate::hosts::match_custom_host(), Ok(Some(_))) {
        return;
    }
    let project = args
        .first()
        .filter(|p| !p.is_empty())
        .map(PathBuf::from)
        .unwrap_or_else(|| std::env::current_dir().unwrap_or_default());
    let Some(session) = claude_session() else { return };
    let agent = crate::subs::agent_of("claude");
    crate::sys::exit_on_interrupt();
    let mut options = Options::new(project, "claude", &session, &agent);
    options.follow = claude_pid().map(|pid| crate::follow::file(&crate::channel::server_home(), &pid));
    let (_channel, thread) = open(options, |channel, signal| match signal {
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
    stdio_watch(args, false);
}

/// DSH shares the `pi` channel and sets no marker of its own, so its watcher declares it.
pub fn dsh(args: &[String]) {
    std::env::set_var("AI_AGENT", "dsh");
    stdio_watch(args, true);
}

fn stdio_watch(args: &[String], needs_artifacts: bool) {
    use std::io::BufRead;
    let cwd = args.first().map(PathBuf::from).unwrap_or_else(|| std::env::current_dir().unwrap_or_default());
    let Some(session) = args.get(1).filter(|s| !s.is_empty()).cloned() else { return };
    let project = crate::paths::project_root(&cwd).unwrap_or(cwd);
    if needs_artifacts && !project.join(".ryugi/artifacts").exists() {
        return;
    }
    // The comment lists this watcher runs for a notification read as this session's agent.
    std::env::set_var("PI_SESSION_ID", &session);
    std::env::remove_var("CLAUDE_CODE_SESSION_ID");
    let agent = crate::subs::agent_of("pi");
    let (channel, thread) = open(Options::new(project, "pi", &session, &agent), |_, signal| match signal {
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
