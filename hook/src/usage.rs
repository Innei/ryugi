use std::path::Path;
use std::time::{Duration, SystemTime};

const REFRESH: Duration = Duration::from_secs(60 * 60);

pub fn mark_used() {
    let (Ok(exe), Some(home)) = (std::env::current_exe(), std::env::var_os("HOME")) else { return };
    mark(&exe, Path::new(&home));
}

fn mark(exe: &Path, home: &Path) {
    let Some(dir) = exe.parent() else { return };
    if exe.file_name().is_none_or(|name| name != "ryugi-hook") || !dir.parent().is_some_and(|parent| crate::paths::is_hook_home(parent, home)) {
        return;
    }
    let used = dir.join("last-used");
    let fresh = std::fs::metadata(&used)
        .and_then(|m| m.modified())
        .ok()
        .and_then(|at| SystemTime::now().duration_since(at).ok())
        .is_some_and(|age| age < REFRESH);
    if !fresh {
        let _ = std::fs::File::create(&used);
    }
}
