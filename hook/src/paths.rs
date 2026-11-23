use std::path::{Path, PathBuf};

pub fn home() -> Option<PathBuf> {
    std::env::var_os("HOME").filter(|h| !h.is_empty()).map(PathBuf::from)
}

pub fn project_root_in(cwd: &Path, home: Option<&Path>) -> Option<PathBuf> {
    let dir = std::fs::canonicalize(cwd).ok()?;
    let home = home.and_then(|h| std::fs::canonicalize(h).ok());
    let mut chain = Vec::new();
    let mut current = dir.as_path();
    loop {
        chain.push(current);
        if current.join(".git").exists() && (Some(current) != home.as_deref() || dir == current) {
            let found = chain.iter().find(|c| c.join(".ryugi/artifacts").exists());
            return Some(found.copied().unwrap_or(current).to_path_buf());
        }
        match current.parent() {
            Some(parent) => current = parent,
            None => return Some(dir.clone()),
        }
    }
}

pub fn project_root(cwd: &Path) -> Option<PathBuf> {
    project_root_in(cwd, home().as_deref())
}

fn git_root(dir: &Path) -> Option<&Path> {
    dir.ancestors().find(|d| d.join(".git").exists())
}

fn resolve(base: &Path, rel: &str) -> PathBuf {
    let mut out = PathBuf::new();
    for part in base.join(rel).components() {
        match part {
            std::path::Component::ParentDir => {
                out.pop();
            }
            std::path::Component::CurDir => {}
            other => out.push(other),
        }
    }
    out
}

pub fn checkouts(project: &Path) -> Vec<PathBuf> {
    let mut roots = vec![project.to_path_buf()];
    let _ = (|| -> Option<()> {
        let root = git_root(project)?;
        let mut common = root.join(".git");
        if common.metadata().ok()?.is_file() {
            let text = std::fs::read_to_string(&common).ok()?;
            let gitdir = resolve(root, text.trim_start().strip_prefix("gitdir:").unwrap_or(&text).trim());
            let rel = std::fs::read_to_string(gitdir.join("commondir")).ok()?;
            common = resolve(&gitdir, rel.trim());
            roots.push(common.parent()?.to_path_buf());
        }
        for entry in std::fs::read_dir(common.join("worktrees")).ok()?.flatten() {
            let entry = entry.path();
            let Ok(link) = std::fs::read_to_string(entry.join("gitdir")) else {
                continue;
            };
            let target = resolve(&entry, link.trim());
            if let Some(real) = target.parent().and_then(|p| std::fs::canonicalize(p).ok()) {
                roots.push(real);
            }
        }
        Some(())
    })();
    let mut seen = std::collections::HashSet::new();
    roots.retain(|r| seen.insert(r.clone()));
    roots
}

pub fn server_info(project: &Path) -> PathBuf {
    project.join(".ryugi/artifacts/.state/server-info")
}

pub fn has_hub(project: &Path) -> bool {
    server_info(project).exists()
}

pub fn hub_project_of(project: &Path) -> PathBuf {
    if has_hub(project) {
        return project.to_path_buf();
    }
    checkouts(project)
        .into_iter()
        .find(|p| has_hub(p))
        .unwrap_or_else(|| project.to_path_buf())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::testdir::TestDir;

    #[test]
    fn a_directory_without_git_is_its_own_root() {
        let t = TestDir::new("root-none");
        let dir = t.mkdir("a/b");
        assert_eq!(project_root_in(&dir, None), Some(dir));
    }

    #[test]
    fn a_subdirectory_resolves_to_the_repository() {
        let t = TestDir::new("root-repo");
        t.mkdir(".git");
        let dir = t.mkdir("packages/app");
        assert_eq!(project_root_in(&dir, None), Some(t.path().to_path_buf()));
    }

    #[test]
    fn the_nearest_artifacts_directory_below_the_repository_wins() {
        let t = TestDir::new("root-nested");
        t.mkdir(".git");
        t.mkdir(".ryugi/artifacts");
        t.mkdir("packages/app/.ryugi/artifacts");
        let dir = t.mkdir("packages/app/src");
        assert_eq!(project_root_in(&dir, None), Some(t.path().join("packages/app")));
    }

    #[test]
    fn a_git_home_directory_does_not_claim_its_subdirectories() {
        let t = TestDir::new("root-home");
        t.mkdir(".git");
        let dir = t.mkdir("scratch");
        assert_eq!(project_root_in(&dir, Some(t.path())), Some(dir));
        assert_eq!(project_root_in(t.path(), Some(t.path())), Some(t.path().to_path_buf()));
    }

    #[test]
    fn a_missing_directory_has_no_root() {
        let t = TestDir::new("root-missing");
        assert_eq!(project_root_in(&t.path().join("gone"), None), None);
    }

    fn worktree(t: &TestDir, main: &str, name: &str, at: &str) -> PathBuf {
        let wt = t.mkdir(at);
        let gitdir = t.mkdir(&format!("{main}/.git/worktrees/{name}"));
        std::fs::write(gitdir.join("commondir"), "../..\n").unwrap();
        std::fs::write(gitdir.join("gitdir"), format!("{}\n", wt.join(".git").display())).unwrap();
        std::fs::write(wt.join(".git"), format!("gitdir: {}\n", gitdir.display())).unwrap();
        wt
    }

    #[test]
    fn checkouts_of_the_main_repository_list_its_worktrees() {
        let t = TestDir::new("checkouts-main");
        let main = t.mkdir("main");
        t.mkdir("main/.git");
        let wt = worktree(&t, "main", "feature", "wt/feature");
        assert_eq!(checkouts(&main), vec![main.clone(), wt]);
    }

    #[test]
    fn checkouts_of_a_linked_worktree_list_the_main_repository_and_siblings() {
        let t = TestDir::new("checkouts-linked");
        let main = t.mkdir("main");
        t.mkdir("main/.git");
        let a = worktree(&t, "main", "a", "wt/a");
        let b = worktree(&t, "main", "b", "wt/b");
        let mut got = checkouts(&a);
        got[2..].sort();
        assert_eq!(got, vec![a, main, b]);
    }

    #[test]
    fn the_hub_project_of_a_worktree_is_the_checkout_running_a_hub() {
        let t = TestDir::new("hub-project");
        let main = t.mkdir("main");
        t.mkdir("main/.git");
        let wt = worktree(&t, "main", "feature", "wt/feature");
        assert_eq!(hub_project_of(&wt), wt);
        t.write("main/.ryugi/artifacts/.state/server-info", "{}");
        assert_eq!(hub_project_of(&wt), main);
        t.write("wt/feature/.ryugi/artifacts/.state/server-info", "{}");
        assert_eq!(hub_project_of(&wt), wt);
    }
}
