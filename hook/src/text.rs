use serde_json::Value;

pub fn ulen(s: &str) -> usize {
    s.encode_utf16().count()
}

pub fn uslice(s: &str, n: usize) -> String {
    let mut out = String::new();
    let mut used = 0;
    for c in s.chars() {
        let w = c.len_utf16();
        if used + w > n {
            if used < n {
                out.push('\u{fffd}');
            }
            break;
        }
        out.push(c);
        used += w;
    }
    out
}

pub fn clip(s: &str, max: usize) -> String {
    if ulen(s) > max {
        format!("{}…", uslice(s, max))
    } else {
        s.to_string()
    }
}

pub fn js_str(v: Option<&Value>) -> String {
    match v {
        None => "undefined".into(),
        Some(Value::Null) => "null".into(),
        Some(Value::Bool(b)) => b.to_string(),
        Some(Value::Number(n)) => crate::evidence::js_number(n.as_f64().unwrap_or(f64::NAN)),
        Some(Value::String(s)) => s.clone(),
        Some(Value::Array(items)) => join(items, ","),
        Some(Value::Object(_)) => "[object Object]".into(),
    }
}

pub fn join(items: &[Value], sep: &str) -> String {
    items
        .iter()
        .map(|v| if v.is_null() { String::new() } else { js_str(Some(v)) })
        .collect::<Vec<_>>()
        .join(sep)
}

pub fn js_trim(s: &str) -> &str {
    s.trim_matches(|c: char| c.is_whitespace() || c == '\u{feff}')
}

pub fn js_trim_end(s: &str) -> &str {
    s.trim_end_matches(|c: char| c.is_whitespace() || c == '\u{feff}')
}

pub fn is_uuid(s: &str) -> bool {
    let parts: Vec<&str> = s.split('-').collect();
    parts.len() == 5
        && [8, 4, 4, 4, 12].iter().zip(&parts).all(|(n, p)| p.len() == *n && p.bytes().all(|b| b.is_ascii_hexdigit()))
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn clips_by_utf16_units() {
        assert_eq!(clip("abcdef", 3), "abc…");
        assert_eq!(clip("ab😀cd", 3), "ab\u{fffd}…");
        assert_eq!(clip("中文", 2), "中文");
    }

    #[test]
    fn interpolates_like_template_strings() {
        assert_eq!(js_str(None), "undefined");
        assert_eq!(js_str(Some(&json!(["a", null, 2]))), "a,,2");
        assert_eq!(js_str(Some(&json!({"a": 1}))), "[object Object]");
        assert_eq!(js_str(Some(&json!(1.0))), "1");
    }

    #[test]
    fn uuids_match_the_hub_pattern() {
        assert!(is_uuid("01A18CAA-a157-7071-ac28-96aa9066af5f"));
        assert!(!is_uuid("01a18caa-a157-7071-ac28-96aa9066af5"));
        assert!(!is_uuid("s1"));
    }
}
