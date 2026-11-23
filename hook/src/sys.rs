use std::ffi::{c_char, c_int, c_long};

#[repr(C)]
struct Tm {
    tm_sec: c_int,
    tm_min: c_int,
    tm_hour: c_int,
    tm_mday: c_int,
    tm_mon: c_int,
    tm_year: c_int,
    tm_wday: c_int,
    tm_yday: c_int,
    tm_isdst: c_int,
    tm_gmtoff: c_long,
    tm_zone: *const c_char,
}

extern "C" {
    fn getuid() -> u32;
    fn localtime_r(time: *const i64, out: *mut Tm) -> *mut Tm;
    fn mktime(tm: *mut Tm) -> i64;
    fn signal(signum: c_int, handler: extern "C" fn(c_int)) -> usize;
    fn _exit(code: c_int) -> !;
    fn kill(pid: c_int, sig: c_int) -> c_int;
}

pub fn uid() -> u32 {
    unsafe { getuid() }
}

fn blank() -> Tm {
    Tm {
        tm_sec: 0,
        tm_min: 0,
        tm_hour: 0,
        tm_mday: 0,
        tm_mon: 0,
        tm_year: 0,
        tm_wday: 0,
        tm_yday: 0,
        tm_isdst: -1,
        tm_gmtoff: 0,
        tm_zone: std::ptr::null(),
    }
}

pub fn local_hour_minute(epoch_ms: f64) -> Option<(i32, i32)> {
    let secs = (epoch_ms / 1000.0).floor() as i64;
    let mut tm = blank();
    let ok = unsafe { !localtime_r(&secs, &mut tm).is_null() };
    ok.then_some((tm.tm_hour, tm.tm_min))
}

pub fn local_to_epoch_ms(year: i64, month: i64, day: i64, hour: i64, minute: i64, second: i64, ms: f64) -> Option<f64> {
    let mut tm = blank();
    tm.tm_year = (year - 1900) as c_int;
    tm.tm_mon = (month - 1) as c_int;
    tm.tm_mday = day as c_int;
    tm.tm_hour = hour as c_int;
    tm.tm_min = minute as c_int;
    tm.tm_sec = second as c_int;
    let t = unsafe { mktime(&mut tm) };
    (t != -1).then_some(t as f64 * 1000.0 + ms)
}

extern "C" fn exit_quietly(_: c_int) {
    unsafe { _exit(0) }
}

pub fn exit_on_interrupt() {
    unsafe {
        signal(2, exit_quietly);
        signal(15, exit_quietly);
    }
}

pub fn alive(pid: i64) -> bool {
    if pid <= 0 || pid > i32::MAX as i64 {
        return false;
    }
    let r = unsafe { kill(pid as c_int, 0) };
    r == 0 || std::io::Error::last_os_error().raw_os_error() == Some(1)
}

pub fn terminate(pid: i64) {
    if pid > 0 && pid <= i32::MAX as i64 {
        unsafe {
            kill(pid as c_int, 15);
        }
    }
}

static TERMINATED: std::sync::atomic::AtomicBool = std::sync::atomic::AtomicBool::new(false);

extern "C" fn mark_terminated(_: c_int) {
    TERMINATED.store(true, std::sync::atomic::Ordering::SeqCst);
}

pub fn on_terminate(cleanup: impl Fn() + Send + 'static) {
    unsafe {
        signal(2, mark_terminated);
        signal(15, mark_terminated);
    }
    std::thread::spawn(move || loop {
        if TERMINATED.load(std::sync::atomic::Ordering::SeqCst) {
            cleanup();
            unsafe { _exit(0) }
        }
        std::thread::sleep(std::time::Duration::from_millis(50));
    });
}
