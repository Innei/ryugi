use super::*;
use crate::testdir::TestDir;
use std::io::Read;
use std::os::unix::net::UnixListener;
use std::sync::mpsc;

#[derive(Clone, Copy, PartialEq)]
enum Mode {
    Welcome,
    Refuse,
    Drop,
}

struct FakeHub {
    received: Arc<Mutex<Vec<Value>>>,
    sockets: Arc<Mutex<Vec<UnixStream>>>,
    connections: Arc<Mutex<usize>>,
    stop: Arc<AtomicBool>,
    path: PathBuf,
}

impl FakeHub {
    fn start(path: &Path, mode: Mode) -> FakeHub {
        let _ = std::fs::remove_file(path);
        let listener = UnixListener::bind(path).unwrap();
        listener.set_nonblocking(true).unwrap();
        let hub = FakeHub {
            received: Arc::default(),
            sockets: Arc::default(),
            connections: Arc::default(),
            stop: Arc::default(),
            path: path.to_path_buf(),
        };
        let (received, sockets, connections, stop) =
            (hub.received.clone(), hub.sockets.clone(), hub.connections.clone(), hub.stop.clone());
        std::thread::spawn(move || {
            while !stop.load(Ordering::SeqCst) {
                let Ok((socket, _)) = listener.accept() else {
                    std::thread::sleep(Duration::from_millis(2));
                    continue;
                };
                *connections.lock().unwrap() += 1;
                if mode == Mode::Drop {
                    drop(socket);
                    continue;
                }
                socket.set_nonblocking(false).unwrap();
                sockets.lock().unwrap().push(socket.try_clone().unwrap());
                let (received, mut writer) = (received.clone(), socket.try_clone().unwrap());
                std::thread::spawn(move || {
                    for line in BufReader::new(socket).lines() {
                        let Ok(line) = line else { break };
                        let message: Value = serde_json::from_str(&line).unwrap();
                        let hello = message["t"] == "hello";
                        received.lock().unwrap().push(message);
                        if hello && mode == Mode::Refuse {
                            let _ = writer.write_all(b"{\"t\":\"refuse\",\"reason\":\"version\"}\n");
                            let _ = writer.shutdown(std::net::Shutdown::Both);
                            break;
                        }
                        if hello {
                            let _ = writer.write_all(b"{\"t\":\"welcome\",\"version\":\"9.9.9\"}\n");
                        }
                    }
                });
            }
        });
        hub
    }

    fn send(&self, message: Value) {
        for s in self.sockets.lock().unwrap().iter_mut() {
            let _ = s.write_all(format!("{message}\n").as_bytes());
        }
    }

    fn received(&self) -> Vec<Value> {
        self.received.lock().unwrap().clone()
    }

    fn connections(&self) -> usize {
        *self.connections.lock().unwrap()
    }

    fn close(&self) {
        self.stop.store(true, Ordering::SeqCst);
        for s in self.sockets.lock().unwrap().drain(..) {
            let _ = s.shutdown(std::net::Shutdown::Both);
        }
        let _ = std::fs::remove_file(&self.path);
    }
}

impl Drop for FakeHub {
    fn drop(&mut self) {
        self.close();
    }
}

fn until(mut check: impl FnMut() -> bool) {
    let start = Instant::now();
    while !check() {
        assert!(start.elapsed() < Duration::from_secs(10), "timed out");
        std::thread::sleep(Duration::from_millis(5));
    }
}

struct Setup {
    _dir: TestDir,
    project: PathBuf,
    socket: PathBuf,
    home: PathBuf,
}

fn setup(ryugi: bool, stopped: Option<&str>) -> Setup {
    let dir = TestDir::new("channel");
    let project = dir.mkdir("project");
    if ryugi {
        dir.mkdir("project/.ryugi/artifacts");
    }
    let home = dir.mkdir("home");
    if let Some(reason) = stopped {
        dir.write("home/server-stopped", &json!({"reason": reason}).to_string());
    }
    let sock = dir.mkdir("sock");
    std::fs::set_permissions(&sock, std::os::unix::fs::PermissionsExt::from_mode(0o700)).unwrap();
    Setup { socket: sock.join("hub.sock"), project, home, _dir: dir }
}

fn options(s: &Setup, starts: Arc<Mutex<Vec<PathBuf>>>) -> Options {
    Options {
        socket: s.socket.clone(),
        server_home: s.home.clone(),
        project: s.project.clone(),
        host: "claude".into(),
        session: "s1".into(),
        agent: "Claude Code".into(),
        retry: Duration::from_millis(20),
        start_hub: Box::new(move |p| starts.lock().unwrap().push(p.to_path_buf())),
        follow: None,
    }
}

fn collect(opts: Options, deliver: bool) -> (Channel, mpsc::Receiver<Signal>) {
    let (tx, rx) = mpsc::channel();
    let (channel, _) = open(opts, move |ch, signal| {
        if let (true, Signal::Event(_, id)) = (deliver, &signal) {
            ch.delivered(id);
        }
        let _ = tx.send(signal);
    });
    (channel, rx)
}

fn comments(project: &Path, artifact: &str) -> Value {
    json!({"type": "ryugi-comments", "project": project, "artifact": artifact, "unread": 1, "threads": []})
}

#[test]
fn the_socket_path_follows_the_hub() {
    assert!(hub_socket_path().to_string_lossy().ends_with(".sock"));
}

#[test]
fn unsafe_artifacts_and_relative_projects_are_dropped_unacknowledged() {
    let s = setup(true, None);
    let hub = FakeHub::start(&s.socket, Mode::Welcome);
    let (channel, rx) = collect(options(&s, Arc::default()), true);
    until(|| hub.received().iter().any(|m| m["t"] == "hello"));
    let mut bad = comments(&s.project, "document/plan; touch WRONG");
    hub.send(json!({"t": "event", "id": 1, "event": bad.take()}));
    hub.send(json!({"t": "event", "id": 2, "event": comments(Path::new("relative/dir"), "document/plan")}));
    hub.send(json!({"t": "event", "id": 3, "event": comments(&s.project, "document/plan")}));
    match rx.recv_timeout(Duration::from_secs(5)).unwrap() {
        Signal::Event(event, id) => {
            assert_eq!((event["artifact"].as_str(), id), (Some("document/plan"), json!(3)));
        }
        _ => panic!("expected an event"),
    }
    until(|| hub.received().iter().any(|m| m["t"] == "delivered"));
    std::thread::sleep(Duration::from_millis(100));
    let delivered: Vec<Value> = hub.received().into_iter().filter(|m| m["t"] == "delivered").map(|m| m["id"].clone()).collect();
    assert_eq!(delivered, vec![json!(3)]);
    channel.close();
}

#[test]
fn a_socket_in_a_directory_others_can_write_is_not_dialled() {
    let s = setup(true, None);
    std::fs::set_permissions(s.socket.parent().unwrap(), std::os::unix::fs::PermissionsExt::from_mode(0o777)).unwrap();
    let hub = FakeHub::start(&s.socket, Mode::Welcome);
    let starts = Arc::<Mutex<Vec<PathBuf>>>::default();
    let (channel, rx) = collect(options(&s, starts.clone()), false);
    match rx.recv_timeout(Duration::from_secs(5)).unwrap() {
        Signal::Waiting(why) => assert_eq!(why, "unsafe-socket-dir"),
        _ => panic!("expected waiting"),
    }
    assert!(hub.received().is_empty());
    assert!(starts.lock().unwrap().is_empty());
    channel.close();
}

#[test]
fn a_hello_names_the_session_and_events_carry_their_commands() {
    let s = setup(true, None);
    let hub = FakeHub::start(&s.socket, Mode::Welcome);
    let (channel, rx) = collect(options(&s, Arc::default()), false);
    until(|| !hub.received().is_empty());
    let hello = hub.received()[0].clone();
    assert_eq!(
        hello,
        json!({"t": "hello", "protocol": 1, "version": hello["version"], "host": "claude", "session": "s1", "agent": "Claude Code"})
    );
    hub.send(json!({"t": "event", "id": 7, "event": comments(&s.project, "document/plan")}));
    let Signal::Event(event, id) = rx.recv_timeout(Duration::from_secs(5)).unwrap() else { panic!() };
    assert_eq!(id, json!(7));
    let command = event["command"].as_str().unwrap();
    assert!(command.contains(" comment list --section threads --detail --format brief --project-dir "), "{command}");
    assert!(command.ends_with(" --artifact document/plan"), "{command}");
    let argv: Vec<&str> = event["argv"].as_array().unwrap().iter().map(|a| a.as_str().unwrap()).collect();
    assert_eq!(&argv[argv.len() - 2..], ["--artifact", "document/plan"]);
    assert!(argv.contains(&"threads"));
    hub.send(json!({"t": "event", "id": 8, "event": {"type": "ryugi-answers", "project": s.project, "artifact": "document/plan", "submit": "s1"}}));
    let Signal::Event(event, _) = rx.recv_timeout(Duration::from_secs(5)).unwrap() else { panic!() };
    let argv: Vec<&str> = event["argv"].as_array().unwrap().iter().map(|a| a.as_str().unwrap()).collect();
    assert_eq!(&argv[argv.len() - 2..], ["--artifact", "document/plan"]);
    assert!(argv.contains(&"asks"));
    channel.delivered(&json!(7));
    until(|| hub.received().iter().any(|m| m["t"] == "delivered"));
    assert_eq!(hub.received().last().unwrap(), &json!({"t": "delivered", "id": 7}));
    channel.close();
}

#[test]
fn after_the_hub_restarts_the_channel_says_hello_again() {
    let s = setup(true, None);
    let first = FakeHub::start(&s.socket, Mode::Welcome);
    let (channel, _rx) = collect(options(&s, Arc::default()), false);
    until(|| first.received().len() == 1);
    first.close();
    let second = FakeHub::start(&s.socket, Mode::Welcome);
    until(|| second.received().iter().any(|m| m["t"] == "hello"));
    channel.close();
}

#[test]
fn a_hub_that_is_down_is_started_in_a_ryugi_project() {
    let s = setup(true, None);
    let starts = Arc::<Mutex<Vec<PathBuf>>>::default();
    let (channel, _rx) = collect(options(&s, starts.clone()), false);
    until(|| !starts.lock().unwrap().is_empty());
    assert_eq!(starts.lock().unwrap()[0], s.project);
    channel.close();
}

#[test]
fn a_hub_the_user_stopped_is_not_started_again() {
    for reason in ["stop", "stale_pid", "SIGINT"] {
        let s = setup(true, Some(reason));
        let starts = Arc::<Mutex<Vec<PathBuf>>>::default();
        let (channel, rx) = collect(options(&s, starts.clone()), false);
        let Signal::Waiting(why) = rx.recv_timeout(Duration::from_secs(5)).unwrap() else { panic!() };
        assert_eq!(why, "stopped");
        assert!(starts.lock().unwrap().is_empty());
        channel.close();
    }
}

#[test]
fn a_project_without_artifacts_does_not_start_the_hub() {
    let s = setup(false, None);
    let starts = Arc::<Mutex<Vec<PathBuf>>>::default();
    let (channel, rx) = collect(options(&s, starts.clone()), false);
    let Signal::Waiting(why) = rx.recv_timeout(Duration::from_secs(5)).unwrap() else { panic!() };
    assert_eq!(why, "not-a-ryugi-project");
    assert!(starts.lock().unwrap().is_empty());
    channel.close();
}

#[test]
fn a_refused_hello_starts_the_hub() {
    let s = setup(true, None);
    let _hub = FakeHub::start(&s.socket, Mode::Refuse);
    let starts = Arc::<Mutex<Vec<PathBuf>>>::default();
    let (channel, _rx) = collect(options(&s, starts.clone()), false);
    until(|| !starts.lock().unwrap().is_empty());
    channel.close();
}

#[test]
fn a_newer_watcher_replaces_this_one() {
    let s = setup(true, None);
    let hub = FakeHub::start(&s.socket, Mode::Welcome);
    let (_channel, rx) = collect(options(&s, Arc::default()), false);
    until(|| !hub.received().is_empty());
    hub.send(json!({"t": "bye", "reason": "replaced"}));
    assert!(matches!(rx.recv_timeout(Duration::from_secs(5)).unwrap(), Signal::Replaced));
}

#[test]
fn a_retract_is_passed_on() {
    let s = setup(true, None);
    let hub = FakeHub::start(&s.socket, Mode::Welcome);
    let (channel, rx) = collect(options(&s, Arc::default()), false);
    until(|| !hub.received().is_empty());
    hub.send(json!({"t": "retract", "project": s.project, "artifact": "document/plan", "type": "ryugi-comments"}));
    let Signal::Retract(m) = rx.recv_timeout(Duration::from_secs(5)).unwrap() else { panic!() };
    assert_eq!(m["artifact"], "document/plan");
    channel.close();
}

#[test]
fn a_hub_that_ended_on_sigterm_is_started_again() {
    let s = setup(true, Some("SIGTERM"));
    let starts = Arc::<Mutex<Vec<PathBuf>>>::default();
    let (channel, _rx) = collect(options(&s, starts.clone()), false);
    until(|| !starts.lock().unwrap().is_empty());
    channel.close();
}

#[test]
fn a_user_stopped_hub_is_dialled_every_retry() {
    let s = setup(true, Some("stop"));
    let (channel, rx) = collect(options(&s, Arc::default()), false);
    for _ in 0..8 {
        assert!(matches!(rx.recv_timeout(Duration::from_secs(5)).unwrap(), Signal::Waiting("stopped")));
    }
    channel.close();
}

fn launches_after_dials(mode: Mode) -> usize {
    let s = setup(true, None);
    let hub = FakeHub::start(&s.socket, mode);
    let starts = Arc::<Mutex<Vec<PathBuf>>>::default();
    let (channel, _rx) = collect(options(&s, starts.clone()), false);
    until(|| hub.connections() >= 16);
    channel.close();
    let n = starts.lock().unwrap().len();
    n
}

#[test]
fn launching_an_unreachable_hub_backs_off_while_dialling_does_not() {
    assert_eq!(launches_after_dials(Mode::Drop), 4);
}

#[test]
fn a_hub_that_keeps_refusing_is_launched_no_more_often() {
    assert_eq!(launches_after_dials(Mode::Refuse), 4);
}

#[test]
fn unsubscribe_tells_the_hub_and_does_not_reconnect() {
    let s = setup(true, None);
    let hub = FakeHub::start(&s.socket, Mode::Welcome);
    let (channel, _rx) = collect(options(&s, Arc::default()), false);
    until(|| hub.received().iter().any(|m| m["t"] == "hello"));
    channel.unsubscribe();
    until(|| hub.received().iter().any(|m| m["t"] == "unsubscribe"));
    let count = hub.connections();
    std::thread::sleep(Duration::from_millis(150));
    assert_eq!(hub.connections(), count);
}

#[test]
fn commands_keep_paths_with_quotes_and_substitutions_intact() {
    let t = TestDir::new("quote");
    let dir = format!("{}/a b'$(touch WRONG)", t.path().display());
    let line = command("/l/ryugi.cjs", &dir, "document/plan", "threads");
    let out = std::process::Command::new("bash")
        .args(["-c", &format!("set -- {line}; printf '%s\\0' \"$@\"")])
        .current_dir(t.path())
        .output()
        .unwrap();
    let mut buf = String::new();
    out.stdout.as_slice().read_to_string(&mut buf).unwrap();
    let args: Vec<&str> = buf.split('\0').collect();
    let at = args.iter().position(|a| *a == "--project-dir").unwrap();
    assert_eq!(args[at + 1], dir);
    assert!(!t.path().join("WRONG").exists());
}

#[test]
fn a_claude_watch_reconnects_as_the_session_its_process_moved_to() {
    let s = setup(true, None);
    let hub = FakeHub::start(&s.socket, Mode::Welcome);
    let mut opts = options(&s, Arc::default());
    opts.follow = Some(crate::follow::file(&s.home, "4242"));
    let (_channel, _rx) = collect(opts, true);
    until(|| hub.received().iter().any(|m| m["t"] == "hello" && m["session"] == "s1"));
    crate::follow::record(&s.home, "4242", "9d2b7c11-5e3f-4a8b-8c6d-1a2b3c4d5e6f");
    until(|| hub.received().iter().any(|m| m["t"] == "hello" && m["session"] == "9d2b7c11-5e3f-4a8b-8c6d-1a2b3c4d5e6f"));
}
