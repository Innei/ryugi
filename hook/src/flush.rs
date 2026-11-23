use std::path::{Path, PathBuf};
use std::time::Duration;

use crate::input::{nonempty, now_ms, read_stdin_json};

fn env_set(name: &str) -> bool {
    std::env::var_os(name).is_some_and(|v| !v.is_empty())
}

pub fn run(args: &[String]) {
    let at = now_ms();
    let fallback = args.first().filter(|p| !p.is_empty()).map(PathBuf::from);
    let antigravity = fallback.is_none()
        && !env_set("CLAUDE_PROJECT_DIR")
        && !env_set("CLAUDE_PLUGIN_ROOT")
        && !env_set("CURSOR_PLUGIN_ROOT")
        && (env_set("ANTIGRAVITY_AGENT") || env_set("PLUGIN_ROOT") || env_set("PLUGIN_DATA"));
    if antigravity {
        println!("{{}}");
    }
    let early = fallback.clone().map(|project| {
        std::thread::spawn(move || crate::hub::post_to_server(&project, "/api/cloud/flush", None))
    });
    if let Some(input) = read_stdin_json(Duration::from_secs(1)) {
        let cwd = nonempty(&input, "cwd").or_else(|| input.get("workspacePaths")?.get(0)?.as_str());
        let project = cwd.and_then(|c| crate::paths::project_root(Path::new(c))).or(fallback);
        if let Some(project) = project {
            if antigravity {
                crate::hub::post_to_server(&project, "/api/cloud/flush", None);
            }
            let host = if antigravity { "antigravity" } else { "claude" };
            if let Some(event) = crate::event::event_from(&input, host, at) {
                crate::hub::post_to_server(&crate::paths::hub_project_of(&project), "/api/agent/event", Some(&event));
            }
        }
    }
    if let Some(early) = early {
        let _ = early.join();
    }
}
