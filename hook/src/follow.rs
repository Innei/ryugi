use std::path::{Path, PathBuf};

pub fn file(home: &Path, pid: &str) -> PathBuf {
    home.join("claude-sessions").join(pid)
}

fn valid_pid(pid: &str) -> bool {
    !pid.is_empty() && pid.len() <= 10 && pid.bytes().all(|b| b.is_ascii_digit())
}

pub fn record(home: &Path, pid: &str, session: &str) {
    if !valid_pid(pid) || !crate::hosts::valid_session(session) {
        return;
    }
    let file = file(home, pid);
    if current(&file).as_deref() == Some(session) {
        return;
    }
    let _ = crate::subs::write_private(&file, session);
}

pub fn current(file: &Path) -> Option<String> {
    let text = std::fs::read_to_string(file).ok()?;
    let session = text.trim();
    crate::hosts::valid_session(session).then(|| session.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::testdir::TestDir;

    #[test]
    fn the_session_a_claude_process_moved_to_reads_back() {
        let dir = TestDir::new("follow");
        let home = dir.mkdir("home");
        record(&home, "4242", "3f0c6b1e-2d1a-4c7e-9a55-0b8f1c2d3e4f");
        record(&home, "4242", "9d2b7c11-5e3f-4a8b-8c6d-1a2b3c4d5e6f");
        assert_eq!(current(&file(&home, "4242")).as_deref(), Some("9d2b7c11-5e3f-4a8b-8c6d-1a2b3c4d5e6f"));
    }

    #[test]
    fn a_process_id_or_session_that_could_escape_the_folder_is_not_recorded() {
        let dir = TestDir::new("follow-bad");
        let home = dir.mkdir("home");
        record(&home, "../x", "3f0c6b1e-2d1a-4c7e-9a55-0b8f1c2d3e4f");
        record(&home, "4242", "../../etc");
        assert!(!home.join("claude-sessions").join("4242").exists());
        assert!(!home.join("x").exists());
    }
}
