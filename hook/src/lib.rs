pub mod agy;
pub mod channel;
pub mod cmd;
pub mod codex;
pub mod context;
pub mod desktop;
pub mod event;
pub mod evidence;
pub mod flush;
pub mod hosts;
pub mod http;
pub mod ids;
pub mod input;
pub mod hub;
pub mod paths;
pub mod start;
pub mod subs;
pub mod sys;
pub mod wake;
pub mod watch;
pub mod worker;
pub mod text;
pub mod title;
#[cfg(test)]
pub mod testdir;

pub const VERSION: &str = match option_env!("RYUGI_VERSION") {
    Some(v) => v,
    None => env!("CARGO_PKG_VERSION"),
};
pub mod queue;
