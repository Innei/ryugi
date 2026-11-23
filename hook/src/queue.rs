use std::collections::VecDeque;
use std::sync::{Arc, Condvar, Mutex};
use std::time::{Duration, Instant};

use serde_json::Value;

const MAX_BACKOFF: Duration = Duration::from_secs(30);

pub fn key_of(project: &str, artifact: &str, kind: Option<&str>) -> String {
    let kind = match kind {
        Some("ryugi-choices") => "choices",
        Some("ryugi-answers") => "answers",
        _ => "comments",
    };
    format!("{project}\0{artifact}\0{kind}")
}

fn key_for(event: &Value) -> String {
    key_of(
        &crate::text::js_str(event.get("project")),
        &crate::text::js_str(event.get("artifact")),
        event.get("type").and_then(Value::as_str),
    )
}

struct Item {
    serial: u64,
    key: String,
    event: Value,
    ids: Vec<Value>,
}

struct State {
    pending: VecDeque<Item>,
    inflight: Option<u64>,
    failures: u32,
    next_attempt: Instant,
    closed: bool,
    serial: u64,
}

pub type Outcome = Result<(String, String), String>;

pub struct Hooks {
    pub deliver: Box<dyn Fn(&Value) -> Outcome + Send>,
    pub delivered: Box<dyn Fn(&Value) + Send>,
    pub on_success: Box<dyn Fn(&Value, &str, &str) + Send>,
    pub on_failure: Box<dyn Fn(&str) + Send>,
}

#[derive(Clone)]
pub struct Queue {
    state: Arc<(Mutex<State>, Condvar)>,
}

impl Queue {
    pub fn start(hooks: Hooks, base: Duration) -> Queue {
        let queue = Queue {
            state: Arc::new((
                Mutex::new(State {
                    pending: VecDeque::new(),
                    inflight: None,
                    failures: 0,
                    next_attempt: Instant::now(),
                    closed: false,
                    serial: 0,
                }),
                Condvar::new(),
            )),
        };
        let worker = queue.clone();
        std::thread::spawn(move || worker.run(hooks, base));
        queue
    }

    fn run(&self, hooks: Hooks, base: Duration) {
        let (lock, cv) = &*self.state;
        loop {
            let (serial, key, event, ids) = {
                let mut st = lock.lock().unwrap();
                loop {
                    if st.closed {
                        return;
                    }
                    if st.inflight.is_none() && !st.pending.is_empty() {
                        let now = Instant::now();
                        if now >= st.next_attempt {
                            break;
                        }
                        let wait = st.next_attempt - now;
                        st = cv.wait_timeout(st, wait).unwrap().0;
                        continue;
                    }
                    st = cv.wait(st).unwrap();
                }
                let item = st.pending.front().unwrap();
                let taken = (item.serial, item.key.clone(), item.event.clone(), item.ids.clone());
                st.inflight = Some(taken.0);
                taken
            };
            let result = (hooks.deliver)(&event);
            let mut st = lock.lock().unwrap();
            match &result {
                Ok(_) => {
                    if let Some(i) = st.pending.iter().position(|it| it.key == key) {
                        if st.pending[i].serial == serial {
                            st.pending.remove(i);
                        }
                    }
                    st.failures = 0;
                }
                Err(_) => {
                    let backoff = base.saturating_mul(2u32.saturating_pow(st.failures)).min(MAX_BACKOFF);
                    st.failures += 1;
                    st.next_attempt = Instant::now() + backoff;
                }
            }
            st.inflight = None;
            drop(st);
            match result {
                Ok((receipt, warning)) => {
                    for id in &ids {
                        (hooks.delivered)(id);
                    }
                    (hooks.on_success)(&event, &receipt, &warning);
                }
                Err(error) => (hooks.on_failure)(&error),
            }
        }
    }

    pub fn push(&self, event: Value, id: Value) {
        let (lock, cv) = &*self.state;
        let mut st = lock.lock().unwrap();
        let key = key_for(&event);
        let inflight = st.inflight;
        let mut carried = Vec::new();
        if let Some(i) = st.pending.iter().position(|it| it.key == key) {
            let previous = st.pending.remove(i).unwrap();
            if Some(previous.serial) != inflight {
                carried = previous.ids;
            }
        }
        carried.push(id);
        st.serial += 1;
        let serial = st.serial;
        st.pending.push_back(Item { serial, key, event, ids: carried });
        cv.notify_all();
    }

    pub fn retract(&self, message: &Value) {
        let (lock, _) = &*self.state;
        let key = key_for(message);
        lock.lock().unwrap().pending.retain(|it| it.key != key);
    }

    pub fn close(&self) {
        let (lock, cv) = &*self.state;
        lock.lock().unwrap().closed = true;
        cv.notify_all();
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;
    use std::sync::mpsc;

    fn event(artifact: &str, n: u64) -> Value {
        json!({"type": "ryugi-comments", "project": "/p", "artifact": artifact, "n": n})
    }

    fn queue(results: Arc<Mutex<VecDeque<Outcome>>>) -> (Queue, mpsc::Receiver<String>) {
        let (tx, rx) = mpsc::channel();
        let (t1, t2, t3) = (tx.clone(), tx.clone(), tx);
        let q = Queue::start(
            Hooks {
                deliver: Box::new(move |e| {
                    let _ = t1.send(format!("deliver {}", e["n"]));
                    std::thread::sleep(Duration::from_millis(30));
                    results.lock().unwrap().pop_front().unwrap_or(Ok(("r".into(), String::new())))
                }),
                delivered: Box::new(move |id| {
                    let _ = t2.send(format!("ack {id}"));
                }),
                on_success: Box::new(|_, _, _| {}),
                on_failure: Box::new(move |e| {
                    let _ = t3.send(format!("fail {e}"));
                }),
            },
            Duration::from_millis(20),
        );
        (q, rx)
    }

    fn next(rx: &mpsc::Receiver<String>) -> String {
        rx.recv_timeout(Duration::from_secs(5)).unwrap()
    }

    #[test]
    fn a_newer_event_for_the_same_artifact_replaces_the_waiting_one_and_carries_its_ids() {
        let (q, rx) = queue(Arc::default());
        q.push(event("document/a", 1), json!(1));
        assert_eq!(next(&rx), "deliver 1");
        q.push(event("document/b", 2), json!(2));
        q.push(event("document/b", 3), json!(3));
        assert_eq!(next(&rx), "ack 1");
        assert_eq!(next(&rx), "deliver 3");
        assert_eq!(next(&rx), "ack 2");
        assert_eq!(next(&rx), "ack 3");
        q.close();
    }

    #[test]
    fn an_event_pushed_while_its_key_is_delivering_is_delivered_again() {
        let (q, rx) = queue(Arc::default());
        q.push(event("document/a", 1), json!(1));
        assert_eq!(next(&rx), "deliver 1");
        q.push(event("document/a", 2), json!(2));
        assert_eq!(next(&rx), "ack 1");
        assert_eq!(next(&rx), "deliver 2");
        assert_eq!(next(&rx), "ack 2");
        q.close();
    }

    #[test]
    fn failures_retry_and_only_success_acknowledges() {
        let results = Arc::new(Mutex::new(VecDeque::from([Err("offline".to_string())])));
        let (q, rx) = queue(results);
        q.push(event("document/a", 1), json!(7));
        assert_eq!(next(&rx), "deliver 1");
        assert_eq!(next(&rx), "fail offline");
        assert_eq!(next(&rx), "deliver 1");
        assert_eq!(next(&rx), "ack 7");
        q.close();
    }

    #[test]
    fn a_retract_drops_a_waiting_event() {
        let results = Arc::new(Mutex::new(VecDeque::from([Err("offline".to_string())])));
        let (q, rx) = queue(results);
        q.push(event("document/a", 1), json!(1));
        assert_eq!(next(&rx), "deliver 1");
        assert_eq!(next(&rx), "fail offline");
        q.retract(&json!({"project": "/p", "artifact": "document/a", "type": "ryugi-comments"}));
        assert!(rx.recv_timeout(Duration::from_millis(300)).is_err());
        q.close();
    }
}
