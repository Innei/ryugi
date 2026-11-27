use std::process::ExitCode;

fn main() -> ExitCode {
    adeck_hook::usage::mark_used();
    let args: Vec<String> = std::env::args().skip(1).collect();
    if let Some(role) = adeck_hook::title::role(&args) {
        adeck_hook::title::set_ryugi_title(role);
    }
    let rest = args.get(1..).unwrap_or_default();
    match args.first().map(String::as_str) {
        Some("--version") => println!("adeck-hook {}", adeck_hook::VERSION),
        Some("event") => adeck_hook::event::run(rest),
        Some("flush") => adeck_hook::flush::run(rest),
        Some("context") => adeck_hook::context::run(rest),
        Some("start") => adeck_hook::start::run(rest),
        Some("agy-cwd") => adeck_hook::start::agy_cwd(),
        Some("detach") => adeck_hook::start::detach(rest),
        Some("launch-prepare") => adeck_hook::subs::launch_prepare(rest),
        Some("subscribe") => adeck_hook::subs::subscribe(),
        Some("cmd-stop") => adeck_hook::cmd::run("stop"),
        Some("cmd-ensure") => {
            if !adeck_hook::cmd::ensure(rest) {
                return ExitCode::from(3);
            }
        }
        Some("agy-stop") => adeck_hook::agy::run("stop"),
        Some("agy-ensure") => {
            if !adeck_hook::agy::ensure(rest) {
                return ExitCode::from(3);
            }
        }
        Some("codex-bind") => adeck_hook::codex::run("bind"),
        Some("codex-watch") => adeck_hook::codex::run("watch"),
        Some("codex-stop") => adeck_hook::codex::run("stop"),
        Some("watch") => match rest.first().map(String::as_str) {
            Some("claude") => adeck_hook::watch::claude(&rest[1..]),
            Some("antigravity") => adeck_hook::agy::run("watch"),
            Some("cmd") => adeck_hook::cmd::run("watch"),
            Some("pi") => adeck_hook::watch::pi(&rest[1..]),
            Some("dsh") => adeck_hook::watch::dsh(&rest[1..]),
            _ => return ExitCode::from(2),
        },
        _ => return ExitCode::from(2),
    }
    ExitCode::SUCCESS
}
