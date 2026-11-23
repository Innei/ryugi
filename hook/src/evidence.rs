use serde_json::Value;
use sha2::{Digest, Sha256};

pub fn js_number(f: f64) -> String {
    if !f.is_finite() {
        return "null".into();
    }
    if f == 0.0 {
        return "0".into();
    }
    let sci = format!("{:e}", f.abs());
    let (mantissa, exp) = sci.split_once('e').unwrap_or((&sci, "0"));
    let digits: String = mantissa.chars().filter(|c| *c != '.').collect();
    let k = digits.len() as i32;
    let n = exp.parse::<i32>().unwrap_or(0) + 1;
    let body = if k <= n && n <= 21 {
        format!("{digits}{}", "0".repeat((n - k) as usize))
    } else if 0 < n && n <= 21 {
        format!("{}.{}", &digits[..n as usize], &digits[n as usize..])
    } else if -6 < n && n <= 0 {
        format!("0.{}{digits}", "0".repeat((-n) as usize))
    } else {
        let e = n - 1;
        let m = if k == 1 { digits.clone() } else { format!("{}.{}", &digits[..1], &digits[1..]) };
        format!("{m}e{}{}", if e >= 0 { '+' } else { '-' }, e.abs())
    };
    if f < 0.0 {
        format!("-{body}")
    } else {
        body
    }
}

fn js_string(s: &str, out: &mut String) {
    out.push('"');
    for c in s.chars() {
        match c {
            '"' => out.push_str("\\\""),
            '\\' => out.push_str("\\\\"),
            '\u{8}' => out.push_str("\\b"),
            '\u{c}' => out.push_str("\\f"),
            '\n' => out.push_str("\\n"),
            '\r' => out.push_str("\\r"),
            '\t' => out.push_str("\\t"),
            c if (c as u32) < 0x20 => out.push_str(&format!("\\u{:04x}", c as u32)),
            c => out.push(c),
        }
    }
    out.push('"');
}

fn array_index(key: &str) -> Option<u32> {
    if key == "0" {
        return Some(0);
    }
    if key.starts_with('0') || !key.bytes().all(|b| b.is_ascii_digit()) {
        return None;
    }
    key.parse::<u32>().ok().filter(|n| *n < u32::MAX)
}

fn write_js(value: &Value, out: &mut String) {
    match value {
        Value::Null => out.push_str("null"),
        Value::Bool(b) => out.push_str(if *b { "true" } else { "false" }),
        Value::Number(n) => out.push_str(&js_number(n.as_f64().unwrap_or(f64::NAN))),
        Value::String(s) => js_string(s, out),
        Value::Array(items) => {
            out.push('[');
            for (i, item) in items.iter().enumerate() {
                if i > 0 {
                    out.push(',');
                }
                write_js(item, out);
            }
            out.push(']');
        }
        Value::Object(map) => {
            let mut keys: Vec<&String> = map.keys().collect();
            let mut indexed: Vec<(u32, &String)> = keys.iter().filter_map(|k| array_index(k).map(|i| (i, *k))).collect();
            indexed.sort();
            keys.retain(|k| array_index(k).is_none());
            out.push('{');
            for (i, key) in indexed.into_iter().map(|(_, k)| k).chain(keys).enumerate() {
                if i > 0 {
                    out.push(',');
                }
                js_string(key, out);
                out.push(':');
                write_js(&map[key.as_str()], out);
            }
            out.push('}');
        }
    }
}

pub fn js_stringify(value: &Value) -> String {
    let mut out = String::new();
    write_js(value, &mut out);
    out
}

fn hash(value: &Value) -> String {
    Sha256::digest(js_stringify(value).as_bytes()).iter().map(|b| format!("{b:02x}")).collect()
}

pub fn review_state_key(artifact: &str, agent: &str) -> String {
    hash(&serde_json::json!([artifact, agent]))
}

pub struct Token {
    pub token: String,
    pub at: Option<Value>,
}

fn field(v: &Value, key: &str) -> Value {
    v.get(key).cloned().unwrap_or(Value::Null)
}

pub fn human_tokens(thread: &Value) -> Option<Vec<Token>> {
    if thread.is_null() {
        return None;
    }
    let id = field(thread, "id");
    let mut values = Vec::new();
    for message in thread.get("messages")?.as_array()? {
        if message.is_null() {
            return None;
        }
        if message.get("author").and_then(Value::as_str) != Some("human") {
            continue;
        }
        let token = hash(&Value::Array(vec![
            id.clone(),
            "message".into(),
            field(message, "id"),
            field(message, "at"),
            field(message, "editedAt"),
            field(message, "deleted"),
            field(message, "text"),
        ]));
        let at = match message.get("editedAt") {
            Some(v) if !v.is_null() => Some(v.clone()),
            _ => message.get("at").cloned(),
        };
        values.push(Token { token, at });
    }
    if thread.get("statusBy").and_then(Value::as_str) == Some("human") {
        values.push(Token {
            token: hash(&Value::Array(vec![
                id,
                "status".into(),
                field(thread, "statusAt"),
                field(thread, "status"),
            ])),
            at: thread.get("statusAt").cloned(),
        });
    }
    Some(values)
}

pub fn unread_thread_count(file: Option<&Value>, consumed: &[String]) -> Option<usize> {
    let threads = match file.filter(|f| !f.is_null()).and_then(|f| f.get("threads")) {
        None | Some(Value::Null) => return Some(0),
        Some(t) => t.as_array()?,
    };
    let mut count = 0;
    for thread in threads {
        let anchor = thread.get("anchor").filter(|a| !a.is_null())?;
        if ["ask", "choice", "submit"].iter().any(|k| anchor.get(k).is_some()) {
            continue;
        }
        if human_tokens(thread)?.iter().any(|t| !consumed.contains(&t.token)) {
            count += 1;
        }
    }
    Some(count)
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn fixture() -> Value {
        serde_json::from_str(include_str!("../tests/fixtures/review-evidence.json")).unwrap()
    }

    #[test]
    fn stringify_matches_javascript() {
        let cases = [
            (json!([1.5e21, 1e-7, -0.0, 12.5, 1e21, 123456789012345680000.0, 0.30000000000000004]),
             "[1.5e+21,1e-7,0,12.5,1e+21,123456789012345680000,0.30000000000000004]"),
            (json!(["\u{1}\u{8}\u{c}\n\r\t\"\\ \u{2028}\u{7f}é", null, true, {"a": [1, {}]}]),
             "[\"\\u0001\\b\\f\\n\\r\\t\\\"\\\\ \u{2028}\u{7f}é\",null,true,{\"a\":[1,{}]}]"),
            (json!([100, 1e20, 0.000001, 5e-324]), "[100,100000000000000000000,0.000001,5e-324]"),
        ];
        for (value, expected) in cases {
            assert_eq!(js_stringify(&value), expected);
        }
    }

    #[test]
    fn review_state_keys_match_the_fixture() {
        for case in fixture()["reviewStateKey"].as_array().unwrap() {
            assert_eq!(
                review_state_key(case["artifact"].as_str().unwrap(), case["agent"].as_str().unwrap()),
                case["key"].as_str().unwrap()
            );
        }
    }

    #[test]
    fn human_tokens_match_the_fixture() {
        for case in fixture()["humanTokens"].as_array().unwrap() {
            let got: Vec<Value> = human_tokens(&case["thread"])
                .unwrap()
                .into_iter()
                .map(|t| match t.at {
                    Some(at) => json!({"token": t.token, "at": at}),
                    None => json!({"token": t.token}),
                })
                .collect();
            assert_eq!(Value::Array(got), case["tokens"], "thread {}", case["thread"]["id"]);
        }
    }

    #[test]
    fn unread_counts_match_the_fixture() {
        for case in fixture()["unreadThreadCount"].as_array().unwrap() {
            let consumed: Vec<String> = case["consumed"]
                .as_array()
                .unwrap()
                .iter()
                .map(|v| v.as_str().unwrap().to_string())
                .collect();
            let file = Some(&case["file"]).filter(|f| !f.is_null());
            assert_eq!(unread_thread_count(file, &consumed), Some(case["count"].as_u64().unwrap() as usize));
        }
    }

    #[test]
    fn malformed_threads_have_no_count() {
        assert_eq!(unread_thread_count(Some(&json!({"threads": [{"id": "t"}]})), &[]), None);
        assert_eq!(unread_thread_count(Some(&json!({"threads": {}})), &[]), None);
    }
}
