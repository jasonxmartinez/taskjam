//! Google Calendar (read-only) for the Mac app.
//!
//! Sign-in uses the "desktop app" OAuth flow with PKCE and a loopback redirect:
//! we open the system browser, Google redirects to http://127.0.0.1:<port>, we read
//! the code from that one request, and exchange it for tokens. Events are fetched here
//! (not in the web view) so there are no CORS problems.

use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine};
use rand::RngCore;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use std::io::{Read, Write};
use std::net::TcpListener;
use std::time::{Duration, Instant};

const AUTH_URL: &str = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL: &str = "https://oauth2.googleapis.com/token";
const API: &str = "https://www.googleapis.com/calendar/v3";
const SCOPE: &str = "https://www.googleapis.com/auth/calendar.readonly";
const MAX_CALENDARS: usize = 12;

#[derive(Serialize)]
pub struct Connected {
    pub refresh_token: String,
}

#[derive(Deserialize)]
struct TokenResponse {
    access_token: String,
    refresh_token: Option<String>,
}

fn random_url_safe(bytes: usize) -> String {
    let mut buf = vec![0u8; bytes];
    rand::thread_rng().fill_bytes(&mut buf);
    URL_SAFE_NO_PAD.encode(buf)
}

pub fn pkce_challenge(verifier: &str) -> String {
    URL_SAFE_NO_PAD.encode(Sha256::digest(verifier.as_bytes()))
}

pub fn build_auth_url(client_id: &str, redirect_uri: &str, challenge: &str, state: &str) -> String {
    let mut url = url::Url::parse(AUTH_URL).expect("static url");
    url.query_pairs_mut()
        .append_pair("client_id", client_id)
        .append_pair("redirect_uri", redirect_uri)
        .append_pair("response_type", "code")
        .append_pair("scope", SCOPE)
        .append_pair("code_challenge", challenge)
        .append_pair("code_challenge_method", "S256")
        .append_pair("state", state)
        // offline + consent so Google returns a refresh token every time.
        .append_pair("access_type", "offline")
        .append_pair("prompt", "consent");
    url.to_string()
}

/// Pulls `code` and `state` out of "GET /?code=...&state=... HTTP/1.1".
pub fn parse_redirect_request(request: &str) -> Result<(String, String), String> {
    let line = request.lines().next().ok_or("empty request")?;
    let target = line.split_whitespace().nth(1).ok_or("malformed request")?;
    let url = url::Url::parse(&format!("http://127.0.0.1{target}")).map_err(|e| e.to_string())?;
    let mut code = None;
    let mut state = None;
    for (k, v) in url.query_pairs() {
        match k.as_ref() {
            "code" => code = Some(v.into_owned()),
            "state" => state = Some(v.into_owned()),
            "error" => return Err(format!("Google sign-in was cancelled or failed: {v}")),
            _ => {}
        }
    }
    match (code, state) {
        (Some(c), Some(s)) => Ok((c, s)),
        _ => Err("Google did not return a sign-in code".into()),
    }
}

/// Waits (up to 3 minutes) for the browser to hit the loopback URL, then answers it.
fn wait_for_redirect(listener: TcpListener) -> Result<(String, String), String> {
    listener.set_nonblocking(true).map_err(|e| e.to_string())?;
    let deadline = Instant::now() + Duration::from_secs(180);
    loop {
        match listener.accept() {
            Ok((mut stream, _)) => {
                stream.set_nonblocking(false).ok();
                stream.set_read_timeout(Some(Duration::from_secs(5))).ok();
                let mut buf = [0u8; 4096];
                let n = stream.read(&mut buf).map_err(|e| e.to_string())?;
                let request = String::from_utf8_lossy(&buf[..n]).to_string();
                let result = parse_redirect_request(&request);
                // Browsers also request /favicon.ico; ignore anything without a code.
                if result.is_err() && !request.contains("error=") && !request.contains("code=") {
                    let _ = stream.write_all(b"HTTP/1.1 404 Not Found\r\nContent-Length: 0\r\n\r\n");
                    continue;
                }
                let body = if result.is_ok() {
                    "<html><body style=\"font-family:sans-serif;padding:3em\"><h2>Todojam is connected to Google Calendar.</h2><p>You can close this tab.</p></body></html>"
                } else {
                    "<html><body style=\"font-family:sans-serif;padding:3em\"><h2>Sign-in did not finish.</h2><p>Go back to Todojam and try again.</p></body></html>"
                };
                let response = format!(
                    "HTTP/1.1 200 OK\r\nContent-Type: text/html; charset=utf-8\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
                    body.len(),
                    body
                );
                let _ = stream.write_all(response.as_bytes());
                return result;
            }
            Err(e) if e.kind() == std::io::ErrorKind::WouldBlock => {
                if Instant::now() > deadline {
                    return Err("Timed out waiting for Google sign-in".into());
                }
                std::thread::sleep(Duration::from_millis(200));
            }
            Err(e) => return Err(e.to_string()),
        }
    }
}

async fn token_request(params: &[(&str, &str)]) -> Result<TokenResponse, String> {
    let res = reqwest::Client::new()
        .post(TOKEN_URL)
        .form(params)
        .send()
        .await
        .map_err(|e| format!("Could not reach Google: {e}"))?;
    if !res.status().is_success() {
        let status = res.status();
        let text = res.text().await.unwrap_or_default();
        return Err(format!("Google rejected the request ({status}): {text}"));
    }
    res.json::<TokenResponse>().await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn google_connect(client_id: String, client_secret: String) -> Result<Connected, String> {
    let listener = TcpListener::bind("127.0.0.1:0").map_err(|e| e.to_string())?;
    let port = listener.local_addr().map_err(|e| e.to_string())?.port();
    let redirect_uri = format!("http://127.0.0.1:{port}");
    let verifier = random_url_safe(48);
    let state = random_url_safe(16);
    let url = build_auth_url(&client_id, &redirect_uri, &pkce_challenge(&verifier), &state);
    open::that(&url).map_err(|e| format!("Could not open the browser: {e}"))?;

    let (code, returned_state) = tauri::async_runtime::spawn_blocking(move || wait_for_redirect(listener))
        .await
        .map_err(|e| e.to_string())??;
    if returned_state != state {
        return Err("Sign-in response did not match the request. Try again.".into());
    }
    let tokens = token_request(&[
        ("client_id", &client_id),
        ("client_secret", &client_secret),
        ("code", &code),
        ("code_verifier", &verifier),
        ("grant_type", "authorization_code"),
        ("redirect_uri", &redirect_uri),
    ])
    .await?;
    let refresh_token = tokens
        .refresh_token
        .ok_or("Google did not return a refresh token. Remove Todojam at myaccount.google.com/permissions and try again.")?;
    Ok(Connected { refresh_token })
}

async fn access_token(client_id: &str, client_secret: &str, refresh_token: &str) -> Result<String, String> {
    Ok(token_request(&[
        ("client_id", client_id),
        ("client_secret", client_secret),
        ("refresh_token", refresh_token),
        ("grant_type", "refresh_token"),
    ])
    .await?
    .access_token)
}

async fn get_json(client: &reqwest::Client, token: &str, url: &str, query: &[(&str, &str)]) -> Result<Value, String> {
    let res = client
        .get(url)
        .bearer_auth(token)
        .query(query)
        .send()
        .await
        .map_err(|e| format!("Could not reach Google Calendar: {e}"))?;
    if !res.status().is_success() {
        let status = res.status();
        let text = res.text().await.unwrap_or_default();
        return Err(format!("Google Calendar returned {status}: {text}"));
    }
    res.json::<Value>().await.map_err(|e| e.to_string())
}

/// Events from every calendar you have selected, between two RFC 3339 times.
/// Returns `{ calendars: [{ id, summary, color, events: [...] }] }` for the web view to normalise.
#[tauri::command]
pub async fn google_fetch_events(
    client_id: String,
    client_secret: String,
    refresh_token: String,
    time_min: String,
    time_max: String,
) -> Result<Value, String> {
    let token = access_token(&client_id, &client_secret, &refresh_token).await?;
    let client = reqwest::Client::new();
    let list = get_json(&client, &token, &format!("{API}/users/me/calendarList"), &[("minAccessRole", "reader")]).await?;
    let mut calendars = Vec::new();
    for cal in list["items"].as_array().cloned().unwrap_or_default().into_iter().filter(|c| c["selected"].as_bool().unwrap_or(false)).take(MAX_CALENDARS) {
        let id = cal["id"].as_str().unwrap_or_default().to_string();
        let url = format!("{API}/calendars/{}/events", url::form_urlencoded::byte_serialize(id.as_bytes()).collect::<String>());
        let events = get_json(
            &client,
            &token,
            &url,
            &[
                ("singleEvents", "true"),
                ("orderBy", "startTime"),
                ("timeMin", &time_min),
                ("timeMax", &time_max),
                ("maxResults", "250"),
            ],
        )
        .await?;
        calendars.push(json!({
            "id": id,
            "summary": cal["summaryOverride"].as_str().or(cal["summary"].as_str()).unwrap_or(""),
            "color": cal["backgroundColor"].as_str().unwrap_or("#64748b"),
            "events": events["items"],
        }));
    }
    Ok(json!({ "calendars": calendars }))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn pkce_matches_the_rfc_7636_example() {
        assert_eq!(
            pkce_challenge("dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk"),
            "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM"
        );
    }

    #[test]
    fn auth_url_has_pkce_offline_access_and_readonly_scope() {
        let url = build_auth_url("cid", "http://127.0.0.1:5000", "chal", "st");
        assert!(url.starts_with(AUTH_URL));
        for part in ["client_id=cid", "code_challenge=chal", "code_challenge_method=S256", "access_type=offline", "state=st", "calendar.readonly"] {
            assert!(url.contains(part), "missing {part} in {url}");
        }
    }

    #[test]
    fn parses_the_redirect_request() {
        let ok = parse_redirect_request("GET /?code=4%2F0abc&state=xyz HTTP/1.1\r\nHost: 127.0.0.1\r\n\r\n").unwrap();
        assert_eq!(ok, ("4/0abc".to_string(), "xyz".to_string()));
        assert!(parse_redirect_request("GET /?error=access_denied&state=xyz HTTP/1.1\r\n").unwrap_err().contains("access_denied"));
        assert!(parse_redirect_request("GET /favicon.ico HTTP/1.1\r\n").is_err());
    }
}
