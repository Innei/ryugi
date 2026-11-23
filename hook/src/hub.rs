use std::path::Path;
use std::time::{Duration, Instant};

pub const DEADLINE: Duration = Duration::from_millis(1500);

pub fn post_to_hub(info_file: &Path, project: &Path, pathname: &str, body: Option<&serde_json::Value>) {
    let deadline = Instant::now() + DEADLINE;
    let Some(info) = std::fs::read_to_string(info_file)
        .ok()
        .and_then(|t| serde_json::from_str::<serde_json::Value>(&t).ok())
    else {
        return;
    };
    let Some(url) = info.get("url").and_then(|u| u.as_str()).and_then(crate::http::parse_url) else {
        return;
    };
    let key = crate::http::query_param(&url.query, "key").unwrap_or_default();
    let host = if url.host == "localhost" { "127.0.0.1" } else { url.host.as_str() };
    let target = format!("{pathname}?key={}", crate::http::encode_component(&key));
    let mut headers = vec![(
        "X-Ryugi-Project",
        crate::http::encode_component(&project.to_string_lossy()),
    )];
    let payload = body.map(|b| b.to_string().into_bytes());
    if payload.is_some() {
        headers.push(("Content-Type", "application/json".into()));
    }
    let _ = crate::http::request(host, url.port, "POST", &target, &headers, payload.as_deref(), deadline);
}

pub fn post_to_server(project: &Path, pathname: &str, body: Option<&serde_json::Value>) {
    post_to_hub(&crate::paths::server_info(project), project, pathname, body)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::http::tests::serve_once;
    use crate::testdir::TestDir;

    #[test]
    fn posts_json_with_the_key_and_project_header() {
        let t = TestDir::new("hub-post");
        let (port, rx) = serve_once(b"HTTP/1.1 200 OK\r\nContent-Length: 2\r\n\r\n{}");
        let info = t.write(
            "server-info",
            &format!("{{\"type\":\"server-started\",\"url\":\"http://localhost:{port}/?key=a%2Fb\"}}"),
        );
        let body = serde_json::json!({"host": "claude", "n": 1});
        post_to_hub(&info, Path::new("/tmp/项目 x"), "/api/agent/event", Some(&body));
        let got = String::from_utf8(rx.recv_timeout(Duration::from_secs(3)).unwrap()).unwrap();
        assert!(got.starts_with("POST /api/agent/event?key=a%2Fb HTTP/1.1\r\n"), "{got}");
        assert!(got.contains("X-Ryugi-Project: %2Ftmp%2F%E9%A1%B9%E7%9B%AE%20x\r\n"), "{got}");
        assert!(got.contains("Content-Type: application/json\r\n"), "{got}");
        assert!(got.ends_with("\r\n\r\n{\"host\":\"claude\",\"n\":1}"), "{got}");
    }

    #[test]
    fn posts_no_body_without_content_type() {
        let t = TestDir::new("hub-empty");
        let (port, rx) = serve_once(b"HTTP/1.1 200 OK\r\nContent-Length: 0\r\n\r\n");
        let info = t.write("server-info", &format!("{{\"url\":\"http://127.0.0.1:{port}/\"}}"));
        post_to_hub(&info, Path::new("/p"), "/api/cloud/flush", None);
        let got = String::from_utf8(rx.recv_timeout(Duration::from_secs(3)).unwrap()).unwrap();
        assert!(got.starts_with("POST /api/cloud/flush?key= HTTP/1.1\r\n"), "{got}");
        assert!(!got.to_lowercase().contains("content-type"), "{got}");
    }

    #[test]
    fn a_missing_server_info_returns_at_once() {
        let start = Instant::now();
        post_to_hub(Path::new("/nonexistent/server-info"), Path::new("/p"), "/x", None);
        assert!(start.elapsed() < Duration::from_millis(100));
    }
}
