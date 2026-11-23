use std::process::Command;

fn bin() -> Command {
    Command::new(env!("CARGO_BIN_EXE_ryugi-hook"))
}

#[test]
fn version_prints_the_build_version() {
    let out = bin().arg("--version").output().unwrap();
    assert!(out.status.success());
    assert_eq!(
        String::from_utf8(out.stdout).unwrap(),
        format!("ryugi-hook {}\n", ryugi_hook::VERSION)
    );
}

#[test]
fn unknown_command_fails_without_stdout() {
    let out = bin().arg("no-such-command").output().unwrap();
    assert_eq!(out.status.code(), Some(2));
    assert!(out.stdout.is_empty());
}
