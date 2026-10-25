//! Desktop OAuth: system browser, S256 PKCE and a short-lived loopback callback.
//! https://developers.google.com/identity/protocols/oauth2/native-app
//! https://www.rfc-editor.org/rfc/rfc8252#section-7.3
use crate::native::{fail, NativeResult};
use aes_gcm::aead::{rand_core::RngCore, OsRng};
use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine};
use sha2::{Digest, Sha256};
use tokio::{
    io::{AsyncReadExt, AsyncWriteExt},
    net::TcpListener,
    sync::oneshot,
    time::{timeout, Duration},
};
use url::Url;

pub fn random_secret() -> String {
    let mut bytes = [0u8; 32];
    OsRng.fill_bytes(&mut bytes);
    URL_SAFE_NO_PAD.encode(bytes)
}
pub fn challenge(verifier: &str) -> String {
    URL_SAFE_NO_PAD.encode(Sha256::digest(verifier.as_bytes()))
}

pub fn authorization_url(client_id: &str, redirect: &str, state: &str, verifier: &str) -> String {
    let mut url =
        Url::parse("https://accounts.google.com/o/oauth2/v2/auth").expect("static origin");
    url.query_pairs_mut().extend_pairs([
        ("client_id", client_id),
        ("redirect_uri", redirect),
        ("response_type", "code"),
        ("scope", "openid email profile"),
        ("state", state),
        ("code_challenge", &challenge(verifier)),
        ("code_challenge_method", "S256"),
        ("prompt", "select_account"),
    ]);
    url.into()
}

/// Strict origin-form target only. Ignore unrelated loopback traffic; never accept a code before state.
fn callback(target: &str, expected_state: &str) -> NativeResult<String> {
    if target.len() > 8192
        || !target.starts_with("/oauth/callback?")
        || target.contains('#')
        || target.contains('\\')
    {
        return Err(fail("invalid_callback"));
    }
    let url =
        Url::parse(&format!("http://127.0.0.1{target}")).map_err(|_| fail("invalid_callback"))?;
    if url.path() != "/oauth/callback" {
        return Err(fail("invalid_callback"));
    }
    let mut state = None;
    let mut code = None;
    let mut error = None;
    let mut seen = std::collections::HashSet::new();
    for (key, value) in url.query_pairs() {
        if !seen.insert(key.to_string()) {
            return Err(fail("invalid_callback"));
        }
        match key.as_ref() {
            "state" => state = Some(value.into_owned()),
            "code" => code = Some(value.into_owned()),
            "error" => error = Some(value.into_owned()),
            // RFC 9207: compare the decoded issuer exactly, including on error responses.
            "iss" if value == "https://accounts.google.com" => (),
            // Google's documented optional response metadata is ignored, never reflected.
            "scope" | "authuser" | "prompt" | "hd" | "error_description" | "error_uri" => (),
            _ => return Err(fail("invalid_callback")),
        }
    }
    if state.as_deref() != Some(expected_state) {
        return Err(fail("invalid_state"));
    }
    if error.is_some() {
        return Err(fail("auth_cancelled"));
    }
    code.filter(|s| !s.is_empty() && s.len() <= 4096)
        .ok_or_else(|| fail("invalid_callback"))
}

pub async fn listen(
    listener: TcpListener,
    state: &str,
    mut cancel: oneshot::Receiver<()>,
) -> NativeResult<String> {
    tokio::select! {
        _ = &mut cancel => Err(fail("auth_cancelled")),
        result = timeout(Duration::from_secs(180), async {
            loop {
                let (mut stream, peer) = listener.accept().await.map_err(|_| fail("auth_unavailable"))?;
                if !peer.ip().is_loopback() { continue; }
                let request = timeout(Duration::from_secs(3), async {
                    let mut bytes = Vec::with_capacity(1024);
                    let mut chunk = [0u8; 1024];
                    while bytes.len() < 12_288 {
                        let n = stream.read(&mut chunk).await.ok()?;
                        if n == 0 { return None; }
                        bytes.extend_from_slice(&chunk[..n]);
                        if bytes.windows(4).any(|s| s == b"\r\n\r\n") { return String::from_utf8(bytes).ok(); }
                    }
                    None
                }).await.ok().flatten();
                let result = request.as_deref().and_then(|r| r.lines().next()).and_then(|line| {
                    let mut words = line.split_whitespace();
                    match (words.next(), words.next(), words.next(), words.next()) {
                        (Some("GET"), Some(target), Some("HTTP/1.1"), None) => Some(callback(target, state)),
                        _ => None,
                    }
                });
                let accepted = matches!(&result, Some(Ok(_))) || matches!(&result, Some(Err(e)) if e.code == "auth_cancelled");
                let (status, body) = if accepted { ("200 OK", "You can return to HangCord. This window can be closed.") }
                    else { ("400 Bad Request", "This sign-in callback was not accepted.") };
                let response = format!("HTTP/1.1 {status}\r\nContent-Type: text/plain; charset=utf-8\r\nContent-Length: {}\r\nCache-Control: no-store\r\nContent-Security-Policy: default-src 'none'\r\nConnection: close\r\n\r\n{body}", body.len());
                let _ = timeout(Duration::from_secs(1), stream.write_all(response.as_bytes())).await;
                if accepted { return result.expect("accepted callback"); }
            }
        }) => result.map_err(|_| fail("auth_timeout"))?,
    }
}

pub fn open_browser(url: &str) -> NativeResult<()> {
    // The URL is created solely by authorization_url, never supplied by the webview.
    #[cfg(target_os = "macos")]
    let mut command = {
        let mut c = std::process::Command::new("/usr/bin/open");
        c.arg(url);
        c
    };
    #[cfg(target_os = "linux")]
    let mut command = {
        let mut c = std::process::Command::new("xdg-open");
        c.arg(url);
        c
    };
    #[cfg(target_os = "windows")]
    let mut command = {
        let mut c = std::process::Command::new("rundll32.exe");
        c.arg("url.dll,FileProtocolHandler").arg(url);
        c
    };
    command
        .stdin(std::process::Stdio::null())
        .stdout(std::process::Stdio::null())
        .stderr(std::process::Stdio::null())
        .spawn()
        .map_err(|_| fail("browser_unavailable"))?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn pkce_rfc7636_fixture() {
        assert_eq!(
            challenge("dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk"),
            "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM"
        );
        assert_eq!(random_secret().len(), 43);
        assert_ne!(random_secret(), random_secret());
    }
    #[test]
    fn callback_checks_state_and_rejects_duplicate_or_ambiguous_parameters() {
        assert_eq!(
            callback("/oauth/callback?code=ok&state=expected", "expected").unwrap(),
            "ok"
        );
        for target in [
            "/oauth/callback?code=ok",
            "/oauth/callback?state=wrong&code=ok",
            "/oauth/callback?state=expected&state=wrong&code=ok",
            "/oauth/callback?state=expected&code=a&code=b",
            "/wrong?state=expected&code=ok",
            "http://attacker/oauth/callback?state=expected&code=ok",
            "//attacker/oauth/callback?state=expected&code=ok",
            "/oauth/callback?state=expected&code=ok#fragment",
        ] {
            assert!(callback(target, "expected").is_err(), "{target}");
        }
        assert_eq!(
            callback(
                "/oauth/callback?state=wrong&error=access_denied",
                "expected"
            )
            .unwrap_err()
            .code,
            "invalid_state"
        );
        assert_eq!(
            callback(
                "/oauth/callback?state=expected&error=access_denied",
                "expected"
            )
            .unwrap_err()
            .code,
            "auth_cancelled"
        );
    }
    #[tokio::test]
    async fn google_issuer_callback_is_accepted_by_listener() {
        let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
        let addr = listener.local_addr().unwrap();
        let (_tx, rx) = oneshot::channel();
        let task = tokio::spawn(async move { listen(listener, "expected", rx).await });
        let mut stream = tokio::net::TcpStream::connect(addr).await.unwrap();
        stream.write_all(b"GET /oauth/callback?state=expected&iss=https%3A%2F%2Faccounts.google.com&code=synthetic-code&scope=openid%20email%20profile&authuser=0&prompt=consent HTTP/1.1\r\nHost: localhost\r\n\r\n").await.unwrap();
        let mut response = String::new();
        timeout(Duration::from_secs(5), stream.read_to_string(&mut response))
            .await
            .unwrap()
            .unwrap();
        assert!(response.starts_with("HTTP/1.1 200 OK\r\n"));
        assert_eq!(task.await.unwrap().unwrap(), "synthetic-code");
    }
    #[test]
    fn google_issuer_is_exact_unique_and_does_not_bypass_state() {
        for issuer in [
            "https://attacker.example",
            "https://accounts.google.com/",
            "",
            "http://accounts.google.com",
        ] {
            let target = format!("/oauth/callback?state=expected&code=synthetic-code&iss={issuer}");
            assert_eq!(
                callback(&target, "expected").unwrap_err().code,
                "invalid_callback"
            );
        }
        assert_eq!(callback("/oauth/callback?state=expected&code=synthetic-code&iss=https://accounts.google.com&iss=https://accounts.google.com", "expected").unwrap_err().code, "invalid_callback");
        assert_eq!(
            callback(
                "/oauth/callback?state=wrong&code=synthetic-code&iss=https://accounts.google.com",
                "expected"
            )
            .unwrap_err()
            .code,
            "invalid_state"
        );
        assert_eq!(callback("/oauth/callback?state=expected&error=access_denied&iss=https://accounts.google.com", "expected").unwrap_err().code, "auth_cancelled");
        assert_eq!(
            callback(
                "/oauth/callback?state=expected&error=access_denied&iss=https://attacker.example",
                "expected"
            )
            .unwrap_err()
            .code,
            "invalid_callback"
        );
    }
    #[tokio::test]
    async fn cancellation_closes_bound_listener() {
        let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
        let addr = listener.local_addr().unwrap();
        let (tx, rx) = oneshot::channel();
        tx.send(()).unwrap();
        assert_eq!(
            listen(listener, "state", rx).await.unwrap_err().code,
            "auth_cancelled"
        );
        assert!(tokio::net::TcpStream::connect(addr).await.is_err());
    }
}
