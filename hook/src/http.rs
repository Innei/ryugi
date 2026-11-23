use std::time::{Duration, Instant};

pub struct Url {
    pub host: String,
    pub port: u16,
    pub path: String,
    pub query: String,
}

pub fn parse_url(text: &str) -> Option<Url> {
    let rest = text.strip_prefix("http://")?;
    let (authority, tail) = match rest.find(['/', '?', '#']) {
        Some(i) => (&rest[..i], &rest[i..]),
        None => (rest, ""),
    };
    let authority = authority.rsplit('@').next()?;
    let (host, port) = match authority.rsplit_once(':') {
        Some((h, p)) if !h.is_empty() => (h, p.parse().ok()?),
        _ => (authority, 80),
    };
    if host.is_empty() || host.contains(char::is_whitespace) {
        return None;
    }
    let tail = tail.split('#').next().unwrap_or("");
    let (path, query) = match tail.split_once('?') {
        Some((p, q)) => (p, q),
        None => (tail, ""),
    };
    Some(Url {
        host: host.to_string(),
        port,
        path: if path.is_empty() { "/".into() } else { path.into() },
        query: query.into(),
    })
}

fn decode(text: &str) -> String {
    let bytes = text.as_bytes();
    let mut out = Vec::with_capacity(bytes.len());
    let mut i = 0;
    while i < bytes.len() {
        match bytes[i] {
            b'+' => out.push(b' '),
            b'%' if i + 2 < bytes.len() => {
                let hex = std::str::from_utf8(&bytes[i + 1..i + 3]).ok();
                match hex.and_then(|h| u8::from_str_radix(h, 16).ok()) {
                    Some(b) => {
                        out.push(b);
                        i += 2;
                    }
                    None => out.push(b'%'),
                }
            }
            b => out.push(b),
        }
        i += 1;
    }
    String::from_utf8_lossy(&out).into_owned()
}

pub fn query_param(query: &str, name: &str) -> Option<String> {
    query.split('&').find_map(|pair| {
        let (k, v) = pair.split_once('=').unwrap_or((pair, ""));
        (decode(k) == name).then(|| decode(v))
    })
}

pub fn encode_component(text: &str) -> String {
    let mut out = String::with_capacity(text.len());
    for b in text.bytes() {
        if b.is_ascii_alphanumeric() || b"-_.!~*'()".contains(&b) {
            out.push(b as char);
        } else {
            out.push_str(&format!("%{b:02X}"));
        }
    }
    out
}

pub struct Response {
    pub status: u16,
    pub body: Vec<u8>,
}

fn remaining(deadline: Instant) -> Option<Duration> {
    deadline.checked_duration_since(Instant::now()).filter(|d| !d.is_zero())
}

pub fn request(
    host: &str,
    port: u16,
    method: &str,
    target: &str,
    headers: &[(&str, String)],
    body: Option<&[u8]>,
    deadline: Instant,
) -> Option<Response> {
    use std::io::{Read, Write};
    use std::net::{TcpStream, ToSocketAddrs};
    let addr = (host, port).to_socket_addrs().ok()?.next()?;
    let mut stream = TcpStream::connect_timeout(&addr, remaining(deadline)?).ok()?;
    let mut head = format!("{method} {target} HTTP/1.1\r\nHost: {host}:{port}\r\nConnection: close\r\n");
    for (name, value) in headers {
        head.push_str(&format!("{name}: {value}\r\n"));
    }
    if let Some(body) = body {
        head.push_str(&format!("Content-Length: {}\r\n", body.len()));
    } else if method == "POST" {
        head.push_str("Content-Length: 0\r\n");
    }
    head.push_str("\r\n");
    let mut out = head.into_bytes();
    out.extend_from_slice(body.unwrap_or_default());
    stream.set_write_timeout(remaining(deadline)).ok()?;
    stream.write_all(&out).ok()?;
    let mut got = Vec::new();
    let mut buf = [0u8; 8192];
    loop {
        stream.set_read_timeout(Some(remaining(deadline)?)).ok()?;
        match stream.read(&mut buf) {
            Ok(0) => break,
            Ok(n) => got.extend_from_slice(&buf[..n]),
            Err(_) => return None,
        }
        if let Some(res) = parse_response(&got, false) {
            return Some(res);
        }
    }
    parse_response(&got, true)
}

fn parse_response(raw: &[u8], at_eof: bool) -> Option<Response> {
    let end = raw.windows(4).position(|w| w == b"\r\n\r\n")?;
    let head = std::str::from_utf8(&raw[..end]).ok()?;
    let mut lines = head.split("\r\n");
    let status = lines.next()?.split_whitespace().nth(1)?.parse().ok()?;
    let mut length = None;
    let mut chunked = false;
    for line in lines {
        let Some((k, v)) = line.split_once(':') else { continue };
        let k = k.trim().to_ascii_lowercase();
        if k == "content-length" {
            length = v.trim().parse::<usize>().ok();
        } else if k == "transfer-encoding" && v.to_ascii_lowercase().contains("chunked") {
            chunked = true;
        }
    }
    let rest = &raw[end + 4..];
    if chunked {
        return dechunk(rest).map(|body| Response { status, body });
    }
    match length {
        Some(n) if rest.len() >= n => Some(Response { status, body: rest[..n].to_vec() }),
        None if at_eof => Some(Response { status, body: rest.to_vec() }),
        _ => None,
    }
}

fn dechunk(mut raw: &[u8]) -> Option<Vec<u8>> {
    let mut body = Vec::new();
    loop {
        let line_end = raw.windows(2).position(|w| w == b"\r\n")?;
        let size_text = std::str::from_utf8(&raw[..line_end]).ok()?;
        let size = usize::from_str_radix(size_text.split(';').next()?.trim(), 16).ok()?;
        raw = &raw[line_end + 2..];
        if size == 0 {
            return Some(body);
        }
        if raw.len() < size + 2 {
            return None;
        }
        body.extend_from_slice(&raw[..size]);
        raw = &raw[size + 2..];
    }
}

#[cfg(test)]
pub mod tests {
    use super::*;
    use std::io::{Read, Write};
    use std::net::TcpListener;

    pub fn serve_once(reply: &'static [u8]) -> (u16, std::sync::mpsc::Receiver<Vec<u8>>) {
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let port = listener.local_addr().unwrap().port();
        let (tx, rx) = std::sync::mpsc::channel();
        std::thread::spawn(move || {
            let (mut s, _) = listener.accept().unwrap();
            s.set_read_timeout(Some(Duration::from_millis(300))).unwrap();
            let mut got = Vec::new();
            let mut buf = [0u8; 4096];
            loop {
                match s.read(&mut buf) {
                    Ok(0) | Err(_) => break,
                    Ok(n) => got.extend_from_slice(&buf[..n]),
                }
                if let Some(end) = find(&got, b"\r\n\r\n") {
                    let head = String::from_utf8_lossy(&got[..end]).to_lowercase();
                    let len = head
                        .lines()
                        .find_map(|l| l.strip_prefix("content-length:").map(|v| v.trim().parse::<usize>().unwrap()))
                        .unwrap_or(0);
                    if got.len() >= end + 4 + len {
                        break;
                    }
                }
            }
            let _ = s.write_all(reply);
            tx.send(got).unwrap();
        });
        (port, rx)
    }

    fn find(hay: &[u8], needle: &[u8]) -> Option<usize> {
        hay.windows(needle.len()).position(|w| w == needle)
    }

    #[test]
    fn parses_a_hub_url() {
        let u = parse_url("http://localhost:27319/?key=a%20b+c").unwrap();
        assert_eq!((u.host.as_str(), u.port, u.path.as_str()), ("localhost", 27319, "/"));
        assert_eq!(query_param(&u.query, "key").as_deref(), Some("a b c"));
        let u = parse_url("http://127.0.0.1/x").unwrap();
        assert_eq!((u.port, u.query.as_str()), (80, ""));
        assert!(parse_url("not a url").is_none());
    }

    #[test]
    fn encodes_like_encode_uri_component() {
        assert_eq!(encode_component("/a b/项目!*'()~-_."), "%2Fa%20b%2F%E9%A1%B9%E7%9B%AE!*'()~-_.");
    }

    #[test]
    fn sends_a_request_and_reads_the_response() {
        let (port, rx) = serve_once(b"HTTP/1.1 201 Created\r\nContent-Length: 2\r\n\r\nok");
        let res = request(
            "127.0.0.1",
            port,
            "POST",
            "/p?key=k",
            &[("X-Test", "v".into())],
            Some(b"{}"),
            Instant::now() + Duration::from_secs(2),
        )
        .unwrap();
        assert_eq!((res.status, res.body.as_slice()), (201, &b"ok"[..]));
        let got = String::from_utf8(rx.recv_timeout(Duration::from_secs(3)).unwrap()).unwrap();
        assert!(got.starts_with("POST /p?key=k HTTP/1.1\r\n"), "{got}");
        assert!(got.contains(&format!("Host: 127.0.0.1:{port}\r\n")), "{got}");
        assert!(got.contains("X-Test: v\r\n"), "{got}");
        assert!(got.contains("Content-Length: 2\r\n"), "{got}");
        assert!(got.ends_with("\r\n\r\n{}"), "{got}");
    }

    #[test]
    fn gives_up_at_the_deadline() {
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let port = listener.local_addr().unwrap().port();
        let hold = std::thread::spawn(move || {
            let (s, _) = listener.accept().unwrap();
            std::thread::sleep(Duration::from_millis(1500));
            drop(s);
        });
        let start = Instant::now();
        let res = request("127.0.0.1", port, "POST", "/", &[], None, start + Duration::from_millis(300));
        assert!(res.is_none());
        assert!(start.elapsed() < Duration::from_millis(1000));
        hold.join().unwrap();
    }
}
