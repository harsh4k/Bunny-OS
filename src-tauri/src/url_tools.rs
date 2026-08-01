//! HTTPS URL validation and YouTube / Spotify URI helpers for the action broker.

const MAX_URL_LEN: usize = 2048;
/// YouTube search filter: Videos only (`sp=EgIQAQ%3D%3D`).
const YT_VIDEOS_FILTER: &str = "EgIQAQ%3D%3D";

pub fn validate_url(url: &str) -> Result<(), String> {
    if url.len() > MAX_URL_LEN {
        return Err(format!(
            "URL too long ({} chars, max {MAX_URL_LEN})",
            url.len()
        ));
    }
    if !url.starts_with("https://") {
        return Err("Only HTTPS URLs are allowed".to_string());
    }
    let after_scheme = url.strip_prefix("https://").unwrap_or("");
    let path_start = after_scheme.find('/').unwrap_or(after_scheme.len());
    if after_scheme[..path_start].contains('@') {
        return Err("URL credentials are not allowed".to_string());
    }
    if url.bytes().any(|b| b < 0x20 || b == 0x7f) {
        return Err("URL contains control characters".to_string());
    }
    Ok(())
}

pub fn extract_domain(url: &str) -> String {
    let after = url.strip_prefix("https://").unwrap_or(url);
    let end = after.find('/').unwrap_or(after.len());
    after[..end].to_string()
}

pub fn build_youtube_url(query: &str) -> String {
    format!(
        "https://www.youtube.com/results?search_query={}",
        percent_encode(query)
    )
}

pub fn build_youtube_play_url(query: &str) -> String {
    format!(
        "https://www.youtube.com/results?search_query={}&sp={YT_VIDEOS_FILTER}",
        percent_encode(query)
    )
}

/// Validate a `spotify:` URI (no `spotify://`, no nested schemes).
pub fn validate_spotify_uri(uri: &str) -> Result<(), String> {
    if uri.len() > MAX_URL_LEN {
        return Err(format!(
            "URI too long ({} chars, max {MAX_URL_LEN})",
            uri.len()
        ));
    }
    if !uri.starts_with("spotify:") {
        return Err("Only spotify: URIs are allowed".to_string());
    }
    let rest = &uri["spotify:".len()..];
    if rest.starts_with("//") || rest.contains("://") {
        return Err("Malformed Spotify URI".to_string());
    }
    if uri.bytes().any(|b| b < 0x20 || b == 0x7f) {
        return Err("URI contains control characters".to_string());
    }
    if !uri
        .bytes()
        .all(|b| matches!(b, b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'_' | b'-' | b':' | b'%' | b'.' | b'/' | b'+' | b'?' | b'=' | b',' | b'&'))
    {
        return Err("Spotify URI contains disallowed characters".to_string());
    }
    Ok(())
}

pub fn is_open_spotify_url(url: &str) -> bool {
    extract_domain(url).eq_ignore_ascii_case("open.spotify.com")
}

pub fn build_spotify_search_uri(query: &str) -> String {
    format!("spotify:search:{}", percent_encode_path(query))
}

pub fn percent_encode(s: &str) -> String {
    let mut out = String::with_capacity(s.len() * 3);
    for byte in s.bytes() {
        match byte {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => {
                out.push(byte as char);
            }
            b' ' => out.push('+'),
            b => out.push_str(&format!("%{b:02X}")),
        }
    }
    out
}

/// Percent-encode for Spotify URI path segments (spaces as %20).
pub fn percent_encode_path(s: &str) -> String {
    let mut out = String::with_capacity(s.len() * 3);
    for byte in s.bytes() {
        match byte {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => {
                out.push(byte as char);
            }
            b => out.push_str(&format!("%{b:02X}")),
        }
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn valid_https_url_passes() {
        assert!(validate_url("https://example.com/path?q=1").is_ok());
    }

    #[test]
    fn http_url_rejected() {
        assert!(validate_url("http://example.com").is_err());
    }

    #[test]
    fn file_url_rejected() {
        assert!(validate_url("file:///etc/passwd").is_err());
    }

    #[test]
    fn url_with_credentials_rejected() {
        assert!(validate_url("https://user:pass@evil.com").is_err());
    }

    #[test]
    fn url_with_control_char_rejected() {
        assert!(validate_url("https://example.com/\x00path").is_err());
    }

    #[test]
    fn youtube_url_basic_query() {
        assert_eq!(
            build_youtube_url("cats"),
            "https://www.youtube.com/results?search_query=cats"
        );
    }

    #[test]
    fn youtube_url_spaces_encoded_as_plus() {
        assert!(build_youtube_url("cute cats").contains("cute+cats"));
    }

    #[test]
    fn percent_encode_specials() {
        assert_eq!(percent_encode("a&b"), "a%26b");
        assert_eq!(percent_encode("a=b"), "a%3Db");
    }

    #[test]
    fn domain_with_path() {
        assert_eq!(extract_domain("https://example.com/foo"), "example.com");
    }

    #[test]
    fn youtube_play_url_has_video_filter() {
        let url = build_youtube_play_url("lofi");
        assert!(url.contains("search_query=lofi"));
        assert!(url.contains("sp=EgIQAQ%3D%3D"));
    }

    #[test]
    fn spotify_uri_ok() {
        assert!(validate_spotify_uri("spotify:search:chill").is_ok());
        assert!(validate_spotify_uri("spotify:").is_ok());
    }

    #[test]
    fn spotify_uri_rejects_smuggling() {
        assert!(validate_spotify_uri("spotify://evil").is_err());
        assert!(validate_spotify_uri("http://evil").is_err());
        assert!(validate_spotify_uri("spotify:http://evil").is_err());
    }

    #[test]
    fn open_spotify_host() {
        assert!(is_open_spotify_url("https://open.spotify.com/playlist/1"));
        assert!(!is_open_spotify_url("https://evil.com/"));
    }
}
