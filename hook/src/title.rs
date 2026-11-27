use std::path::Path;

const MANIFESTS: [&str; 3] = ["package.json", ".claude-plugin/plugin.json", ".codex-plugin/plugin.json"];

pub fn manifest_version(root: &Path) -> Option<String> {
    MANIFESTS.iter().find_map(|file| {
        let text = std::fs::read_to_string(root.join(file)).ok()?;
        let manifest: serde_json::Value = serde_json::from_str(&text).ok()?;
        if !matches!(manifest.get("name")?.as_str()?, "adeck" | "ryugi") {
            return None;
        }
        manifest.get("version")?.as_str().filter(|v| !v.is_empty()).map(str::to_string)
    })
}

fn home_version(exe: &Path, home: &Path) -> Option<String> {
    let dir = exe.parent()?;
    if !crate::paths::is_hook_home(dir.parent()?, home) {
        return None;
    }
    let version = dir.file_name()?.to_str()?;
    version.starts_with(|c: char| c.is_ascii_digit()).then(|| version.to_string())
}

pub fn version() -> Option<String> {
    if let Some(v) = option_env!("RYUGI_VERSION") {
        return Some(v.to_string());
    }
    let exe = std::env::current_exe().ok()?;
    if let Some(v) = std::env::var_os("HOME").and_then(|home| home_version(&exe, Path::new(&home))) {
        return Some(v);
    }
    manifest_version(exe.ancestors().nth(4)?)
}

pub fn role(args: &[String]) -> Option<&'static str> {
    match args.first()?.as_str() {
        "--version" => None,
        "codex-watch" | "watch" => Some("watch-comments"),
        _ => Some("hook"),
    }
}

pub fn title(role: &str, version: Option<&str>) -> String {
    match version {
        Some(v) => format!("Artideck {role} ({v})"),
        None => format!("Artideck {role}"),
    }
}

// Launch Services check-in is slow and backs up when many short-lived processes register, so
// only the long-lived watchers take a display name there; ps shows every title either way.
fn registers(role: &str) -> bool {
    role == "watch-comments"
}

pub fn set_ryugi_title(role: &str) {
    set(&title(role, version().as_deref()), registers(role));
}

#[cfg(target_os = "macos")]
fn set(text: &str, register: bool) {
    use std::ffi::{c_char, c_int, c_void, CStr, CString};

    let text = text.to_string();
    unsafe {
        overwrite_argv(&text);
    }
    let Ok(c_title) = CString::new(text) else {
        return;
    };
    unsafe {
        extern "C" {
            fn pthread_setname_np(name: *const c_char) -> c_int;
        }
        pthread_setname_np(c_title.as_ptr());
        if register {
            set_launch_services_name(&c_title);
        }
    }

    unsafe fn overwrite_argv(title: &str) {
        extern "C" {
            fn _NSGetArgc() -> *mut c_int;
            fn _NSGetArgv() -> *mut *mut *mut c_char;
        }
        let argc = *_NSGetArgc();
        let argv = *_NSGetArgv();
        if argc <= 0 || argv.is_null() {
            return;
        }
        let first = *argv;
        if first.is_null() {
            return;
        }
        let mut end = first;
        for i in 0..argc as isize {
            let arg = *argv.offset(i);
            if arg.is_null() || arg != end {
                break;
            }
            let mut p = arg;
            while *p != 0 {
                p = p.add(1);
            }
            end = p.add(1);
        }
        let cap = end.offset_from(first);
        if cap <= 1 {
            return;
        }
        let max_len = (cap as usize) - 1;
        let mut copy_len = title.len().min(max_len);
        while copy_len > 0 && !title.is_char_boundary(copy_len) {
            copy_len -= 1;
        }
        std::ptr::copy_nonoverlapping(title.as_ptr(), first as *mut u8, copy_len);
        std::ptr::write_bytes(
            (first as *mut u8).add(copy_len),
            0,
            (cap as usize) - copy_len,
        );
    }

    unsafe fn set_launch_services_name(c_title: &CStr) {
        const RTLD_LAZY: c_int = 0x1;
        const RTLD_LOCAL: c_int = 0x4;
        const K_LS_DEFAULT_SESSION_ID: c_int = -2;
        const K_CF_STRING_ENCODING_UTF8: u32 = 0x0800_0100;

        extern "C" {
            fn dlopen(path: *const c_char, mode: c_int) -> *mut c_void;
            fn dlsym(handle: *mut c_void, symbol: *const c_char) -> *mut c_void;
        }

        let cf = dlopen(
            c"/System/Library/Frameworks/CoreFoundation.framework/CoreFoundation".as_ptr(),
            RTLD_LAZY | RTLD_LOCAL,
        );
        let asvc = dlopen(
            c"/System/Library/Frameworks/ApplicationServices.framework/ApplicationServices"
                .as_ptr(),
            RTLD_LAZY | RTLD_LOCAL,
        );
        if cf.is_null() || asvc.is_null() {
            return;
        }

        type CFStringCreateWithCString =
            unsafe extern "C" fn(*const c_void, *const c_char, u32) -> *const c_void;
        type CFBundleGetMainBundle = unsafe extern "C" fn() -> *const c_void;
        type CFBundleGetInfoDictionary = unsafe extern "C" fn(*const c_void) -> *const c_void;
        type CFRelease = unsafe extern "C" fn(*const c_void);
        type LSApplicationCheckIn = unsafe extern "C" fn(c_int, *const c_void) -> *const c_void;
        type LSGetCurrentApplicationASN = unsafe extern "C" fn() -> *const c_void;
        type LSSetApplicationInformationItem = unsafe extern "C" fn(
            c_int,
            *const c_void,
            *const c_void,
            *const c_void,
            *mut *const c_void,
        ) -> c_int;

        let cf_str_create = dlsym(cf, c"CFStringCreateWithCString".as_ptr());
        let cf_release = dlsym(cf, c"CFRelease".as_ptr());
        let cf_main_bundle = dlsym(cf, c"CFBundleGetMainBundle".as_ptr());
        let cf_info_dict = dlsym(cf, c"CFBundleGetInfoDictionary".as_ptr());
        let ls_check_in = dlsym(asvc, c"_LSApplicationCheckIn".as_ptr());
        let ls_get_asn = dlsym(asvc, c"_LSGetCurrentApplicationASN".as_ptr());
        let ls_set_item = dlsym(asvc, c"_LSSetApplicationInformationItem".as_ptr());
        let ls_display_name_key = dlsym(asvc, c"_kLSDisplayNameKey".as_ptr());

        if cf_str_create.is_null()
            || cf_release.is_null()
            || ls_get_asn.is_null()
            || ls_set_item.is_null()
            || ls_display_name_key.is_null()
        {
            return;
        }

        let cf_str_create: CFStringCreateWithCString = std::mem::transmute(cf_str_create);
        let cf_release: CFRelease = std::mem::transmute(cf_release);
        let ls_get_asn: LSGetCurrentApplicationASN = std::mem::transmute(ls_get_asn);
        let ls_set_item: LSSetApplicationInformationItem = std::mem::transmute(ls_set_item);
        let display_name_key = *(ls_display_name_key as *const *const c_void);
        if display_name_key.is_null() {
            return;
        }

        if !ls_check_in.is_null() {
            let ls_check_in: LSApplicationCheckIn = std::mem::transmute(ls_check_in);
            let info = if !cf_main_bundle.is_null() && !cf_info_dict.is_null() {
                let get_bundle: CFBundleGetMainBundle = std::mem::transmute(cf_main_bundle);
                let get_info: CFBundleGetInfoDictionary = std::mem::transmute(cf_info_dict);
                let bundle = get_bundle();
                if bundle.is_null() {
                    std::ptr::null()
                } else {
                    get_info(bundle)
                }
            } else {
                std::ptr::null()
            };
            ls_check_in(K_LS_DEFAULT_SESSION_ID, info);
        }

        let asn = ls_get_asn();
        if asn.is_null() {
            return;
        }

        let cf_title = cf_str_create(
            std::ptr::null(),
            c_title.as_ptr(),
            K_CF_STRING_ENCODING_UTF8,
        );
        if cf_title.is_null() {
            return;
        }
        ls_set_item(
            K_LS_DEFAULT_SESSION_ID,
            asn,
            display_name_key,
            cf_title,
            std::ptr::null_mut(),
        );
        cf_release(cf_title);
    }
}

#[cfg(target_os = "linux")]
fn set(text: &str, _register: bool) {
    use std::ffi::{c_int, CString};

    const PR_SET_NAME: c_int = 15;
    extern "C" {
        fn prctl(option: c_int, ...) -> c_int;
    }
    let mut short = text.split(" (").next().unwrap_or(text).to_string();
    while short.len() > 15 {
        short.pop();
    }
    let Ok(name) = CString::new(short) else { return };
    unsafe {
        prctl(PR_SET_NAME, name.as_ptr(), 0usize, 0usize, 0usize);
    }
}

#[cfg(not(any(target_os = "macos", target_os = "linux")))]
fn set(_text: &str, _register: bool) {}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::testdir::TestDir;

    #[test]
    fn titles_name_the_role_and_version() {
        assert_eq!(title("hook", Some("1.2.3")), "Artideck hook (1.2.3)");
        assert_eq!(title("watch-comments", None), "Artideck watch-comments");
    }

    #[test]
    fn a_binary_in_the_hook_home_takes_its_version_from_its_directory() {
        let home = Path::new("/home/me");
        assert_eq!(home_version(Path::new("/home/me/.ryugi/hook/1.2.3/adeck-hook"), home).as_deref(), Some("1.2.3"));
        assert_eq!(home_version(Path::new("/home/me/.artideck/hook/1.2.4/adeck-hook"), home).as_deref(), Some("1.2.4"));
        assert_eq!(home_version(Path::new("/home/me/src/ryugi/hook/target/release/adeck-hook"), home), None);
    }

    #[test]
    fn only_long_lived_watchers_register_their_name_with_launch_services() {
        assert!(registers("watch-comments"));
        assert!(!registers("hook"));
    }

    #[test]
    fn roles_follow_the_command() {
        let args = |list: &[&str]| list.iter().map(|s| s.to_string()).collect::<Vec<_>>();
        assert_eq!(role(&args(&["codex-watch"])), Some("watch-comments"));
        assert_eq!(role(&args(&["watch", "claude", "/p"])), Some("watch-comments"));
        assert_eq!(role(&args(&["cmd-stop"])), Some("hook"));
        assert_eq!(role(&args(&["subscribe"])), Some("hook"));
        assert_eq!(role(&args(&["--version"])), None);
    }

    #[test]
    fn the_version_comes_from_the_first_ryugi_manifest() {
        let t = TestDir::new("title-manifest");
        t.write("package.json", r#"{"name":"other","version":"9.9.9"}"#);
        assert_eq!(manifest_version(t.path()), None);
        t.write(".claude-plugin/plugin.json", r#"{"name":"ryugi","version":"1.2.3"}"#);
        assert_eq!(manifest_version(t.path()).as_deref(), Some("1.2.3"));
        t.write("package.json", r#"{"name":"ryugi","version":"1.2.4"}"#);
        assert_eq!(manifest_version(t.path()).as_deref(), Some("1.2.4"));
    }

    #[test]
    fn the_version_comes_from_an_adeck_manifest_too() {
        let t = TestDir::new("title-manifest-adeck");
        t.write("package.json", r#"{"name":"adeck","version":"1.115.0"}"#);
        assert_eq!(manifest_version(t.path()).as_deref(), Some("1.115.0"));
    }
}
