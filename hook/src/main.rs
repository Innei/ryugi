use std::process::ExitCode;

fn main() -> ExitCode {
    let args: Vec<String> = std::env::args().skip(1).collect();
    let rest = args.get(1..).unwrap_or_default();
    match args.first().map(String::as_str) {
        Some("--version") => println!("ryugi-hook {}", ryugi_hook::VERSION),
        Some("event") => ryugi_hook::event::run(rest),
        Some("flush") => ryugi_hook::flush::run(rest),
        Some("context") => ryugi_hook::context::run(rest),
        Some("start") => ryugi_hook::start::run(rest),
        Some("agy-cwd") => ryugi_hook::start::agy_cwd(),
        Some("detach") => ryugi_hook::start::detach(rest),
        Some("launch-prepare") => ryugi_hook::subs::launch_prepare(rest),
        Some("subscribe") => ryugi_hook::subs::subscribe(),
        Some("cmd-stop") => ryugi_hook::cmd::run("stop"),
        Some("cmd-ensure") => {
            if !ryugi_hook::cmd::ensure(rest) {
                return ExitCode::from(3);
            }
        }
        Some("agy-stop") => ryugi_hook::agy::run("stop"),
        Some("agy-ensure") => {
            if !ryugi_hook::agy::ensure(rest) {
                return ExitCode::from(3);
            }
        }
        Some("codex-bind") => ryugi_hook::codex::run("bind"),
        Some("codex-watch") => ryugi_hook::codex::run("watch"),
        Some("codex-stop") => ryugi_hook::codex::run("stop"),
        Some("watch") => match rest.first().map(String::as_str) {
            Some("claude") => ryugi_hook::watch::claude(&rest[1..]),
            Some("antigravity") => ryugi_hook::agy::run("watch"),
            Some("cmd") => ryugi_hook::cmd::run("watch"),
            Some("pi") => ryugi_hook::watch::pi(&rest[1..]),
            Some("dsh") => ryugi_hook::watch::dsh(&rest[1..]),
            _ => return ExitCode::from(2),
        },
        _ => return ExitCode::from(2),
    }
    ExitCode::SUCCESS
}
