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

struct TempHome(std::path::PathBuf);

impl TempHome {
    fn new(label: &str) -> Self {
        let dir = std::env::temp_dir().join(format!("ryugi-hook-{label}-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        TempHome(dir)
    }
    fn path(&self) -> &std::path::Path {
        &self.0
    }
}

impl Drop for TempHome {
    fn drop(&mut self) {
        let _ = std::fs::remove_dir_all(&self.0);
    }
}

fn installed_copy(home: &std::path::Path) -> std::path::PathBuf {
    let dir = home.join(".ryugi/hook/1.2.3");
    std::fs::create_dir_all(&dir).unwrap();
    let copy = dir.join("ryugi-hook");
    std::fs::copy(env!("CARGO_BIN_EXE_ryugi-hook"), &copy).unwrap();
    copy
}

fn age(file: &std::path::Path, seconds: u64) {
    let at = std::time::SystemTime::now() - std::time::Duration::from_secs(seconds);
    std::fs::File::options().write(true).open(file).unwrap().set_modified(at).unwrap();
}

fn modified(file: &std::path::Path) -> std::time::SystemTime {
    std::fs::metadata(file).unwrap().modified().unwrap()
}

#[test]
fn an_installed_binary_marks_its_version_used_at_most_hourly() {
    let home = TempHome::new("used");
    let copy = installed_copy(home.path());
    let used = home.path().join(".ryugi/hook/1.2.3/last-used");
    let run = || assert!(Command::new(&copy).arg("--version").env("HOME", home.path()).status().unwrap().success());
    run();
    assert!(used.exists());
    age(&used, 30 * 60);
    let before = modified(&used);
    run();
    assert_eq!(modified(&used), before);
    age(&used, 2 * 60 * 60);
    let stale = modified(&used);
    run();
    assert!(modified(&used) > stale);
}

#[test]
fn a_build_outside_the_hook_home_marks_nothing() {
    let home = TempHome::new("elsewhere");
    assert!(bin().arg("--version").env("HOME", home.path()).status().unwrap().success());
    assert!(!home.path().join(".ryugi").exists());
}
