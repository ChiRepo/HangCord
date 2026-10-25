//! Native authentication and bounded networking. IPC never exposes a token, URL chooser or headers.
//! Reqwest redirect/retry policies: https://docs.rs/reqwest/0.13.5/reqwest/struct.ClientBuilder.html
//! Socket bounds: https://docs.rs/tungstenite/latest/tungstenite/protocol/struct.WebSocketConfig.html
use crate::{cache::EncryptedStore, oauth};
use futures_util::{future::poll_fn, SinkExt, StreamExt};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use std::{
    collections::BTreeMap,
    sync::{
        atomic::{AtomicU64, Ordering},
        Arc, Mutex,
    },
    time::{Duration, SystemTime, UNIX_EPOCH},
};
use tauri::{Emitter, State};
use tokio::{
    net::TcpListener,
    sync::{mpsc, oneshot, Mutex as AsyncMutex},
    time::timeout,
};
use tokio_tungstenite::{
    connect_async_with_config,
    tungstenite::{protocol::WebSocketConfig, Message},
};
use url::Url;

const MAX_RESPONSE: usize = 2 * 1024 * 1024;
const MAX_REQUEST: usize = 64 * 1024;
const MAX_FRAME: usize = 2 * 1024 * 1024;
const MAX_QUEUED_FRAMES: usize = 8;
const GATEWAY_EVENT: &str = "gateway://event";

#[derive(Debug, Clone, Serialize)]
pub struct NativeError {
    pub code: &'static str,
}
pub type NativeResult<T> = Result<T, NativeError>;
pub fn fail(code: &'static str) -> NativeError {
    NativeError { code }
}

#[derive(Clone)]
pub struct Config {
    api: Url,
    gateway: Url,
}
impl Config {
    fn parse(api: &str, gateway: &str, allow_local: bool) -> NativeResult<Self> {
        fn origin(raw: &str, secure: &str, local: &str, allow_local: bool) -> NativeResult<Url> {
            let url = Url::parse(raw).map_err(|_| fail("auth_not_configured"))?;
            let authority = raw.split_once("://").map(|(_, tail)| tail).unwrap_or("");
            let raw_path = authority.find('/').map(|i| &authority[i..]);
            if raw.contains(['\\', '@'])
                || raw.bytes().any(|b| b.is_ascii_whitespace())
                || raw_path.is_some_and(|p| p != "/")
            {
                return Err(fail("auth_not_configured"));
            }
            let loopback = matches!(
                url.host_str(),
                Some("127.0.0.1") | Some("[::1]") | Some("localhost")
            );
            if url.host_str().is_none()
                || !url.username().is_empty()
                || url.password().is_some()
                || url.path() != "/"
                || url.query().is_some()
                || url.fragment().is_some()
                || !(url.scheme() == secure || allow_local && loopback && url.scheme() == local)
            {
                return Err(fail("auth_not_configured"));
            }
            Ok(url)
        }
        Ok(Self {
            api: origin(api, "https", "http", allow_local)?,
            gateway: origin(gateway, "wss", "ws", allow_local)?,
        })
    }
    fn from_build() -> Option<Self> {
        Self::parse(
            option_env!("HANGCORD_API_BASE_URL").unwrap_or(""),
            option_env!("HANGCORD_GATEWAY_BASE_URL").unwrap_or(""),
            cfg!(any(debug_assertions, feature = "test-hooks")),
        )
        .ok()
    }
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct User {
    id: String,
    display_name: String,
    email: Option<String>,
    avatar_url: Option<String>,
    created_at: u64,
}
#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Session {
    session: String,
    expires_at: u64,
    refresh_token: String,
    user: User,
}
impl Session {
    fn validate(&self) -> NativeResult<()> {
        if self.session.len() < 20
            || self.session.len() > 4096
            || self.refresh_token.len() < 20
            || self.refresh_token.len() > 1024
            || self.user.id.is_empty()
            || self.user.id.len() > 128
            || self.user.display_name.len() > 256
            || self.expires_at <= now_ms()
        {
            return Err(fail("invalid_response"));
        }
        Ok(())
    }
}
fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64
}

/// Tests inject memory storage. Session credentials have no file fallback, including test-hooks builds.
trait CredentialStore: Send + Sync {
    fn load(&self) -> NativeResult<Option<Session>>;
    fn save(&self, session: &Session) -> NativeResult<()>;
    fn clear(&self) -> NativeResult<()>;
}
struct KeychainStore {
    account: String,
}
impl KeychainStore {
    fn entry(&self) -> NativeResult<keyring::Entry> {
        keyring::Entry::new("app.hangcord.desktop.session", &self.account)
            .map_err(|_| fail("keychain_unavailable"))
    }
}
impl CredentialStore for KeychainStore {
    fn load(&self) -> NativeResult<Option<Session>> {
        match self.entry()?.get_password() {
            Ok(raw) => serde_json::from_str(&raw)
                .map(Some)
                .map_err(|_| fail("reauth_required")),
            Err(keyring::Error::NoEntry) => Ok(None),
            Err(_) => Err(fail("keychain_unavailable")),
        }
    }
    fn save(&self, session: &Session) -> NativeResult<()> {
        self.entry()?
            .set_password(&serde_json::to_string(session).map_err(|_| fail("invalid_response"))?)
            .map_err(|_| fail("keychain_unavailable"))
    }
    fn clear(&self) -> NativeResult<()> {
        match self.entry()?.delete_credential() {
            Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
            Err(_) => Err(fail("keychain_unavailable")),
        }
    }
}
#[derive(Default)]
struct AuthState {
    loaded: bool,
    session: Option<Session>,
}
struct GatewaySlot {
    id: String,
    room_id: String,
    sender: mpsc::Sender<Value>,
    stop: oneshot::Sender<()>,
}
pub struct NativeBridge {
    config: Option<Config>,
    client: reqwest::Client,
    credentials: Box<dyn CredentialStore>,
    auth: AsyncMutex<AuthState>,
    cache: Arc<EncryptedStore>,
    generation: AtomicU64,
    oauth: Mutex<Option<oneshot::Sender<()>>>,
    gateway: Mutex<Option<GatewaySlot>>,
    gateway_serial: AsyncMutex<()>,
}
impl NativeBridge {
    pub fn new(cache: Arc<EncryptedStore>) -> NativeResult<Self> {
        let config = Config::from_build();
        let account = format!(
            "session-v1-{:x}",
            Sha256::digest(
                config
                    .as_ref()
                    .map(|c| c.api.as_str())
                    .unwrap_or("unconfigured")
                    .as_bytes()
            )
        );
        Self::with_store(config, cache, Box::new(KeychainStore { account }))
    }
    fn with_store(
        config: Option<Config>,
        cache: Arc<EncryptedStore>,
        credentials: Box<dyn CredentialStore>,
    ) -> NativeResult<Self> {
        let client = reqwest::Client::builder()
            .redirect(reqwest::redirect::Policy::none())
            .retry(reqwest::retry::never())
            .timeout(Duration::from_secs(20))
            .connect_timeout(Duration::from_secs(10))
            .build()
            .map_err(|_| fail("network_unavailable"))?;
        Ok(Self {
            config,
            client,
            credentials,
            auth: AsyncMutex::new(AuthState::default()),
            cache,
            generation: AtomicU64::new(0),
            oauth: Mutex::new(None),
            gateway: Mutex::new(None),
            gateway_serial: AsyncMutex::new(()),
        })
    }
    fn configured(&self) -> NativeResult<&Config> {
        self.config
            .as_ref()
            .ok_or_else(|| fail("auth_not_configured"))
    }
    fn bind_cache(&self, user: Option<&User>) -> NativeResult<()> {
        let want = user.map(|u| json!(u.id).to_string());
        let existing = self.cache.get("account").unwrap_or(None);
        if want.is_none() || want != existing {
            self.cache.wipe().map_err(|_| fail("storage"))?;
            if let Some(want) = want {
                self.cache
                    .put("account", &want)
                    .map_err(|_| fail("storage"))?;
            }
        }
        Ok(())
    }
    fn load(&self, state: &mut AuthState) -> NativeResult<()> {
        if state.loaded {
            return Ok(());
        }
        match self.credentials.load() {
            Ok(session) => {
                self.bind_cache(session.as_ref().map(|s| &s.user))?;
                state.session = session;
                state.loaded = true;
                Ok(())
            }
            Err(e) => {
                self.bind_cache(None)?;
                Err(e)
            }
        }
    }
    async fn request(
        &self,
        method: reqwest::Method,
        path: &str,
        body: Option<&Value>,
        token: Option<&str>,
        etag: Option<&str>,
    ) -> NativeResult<ApiResponse> {
        let url = self
            .configured()?
            .api
            .join(path)
            .map_err(|_| fail("invalid_request"))?;
        let mut request = self
            .client
            .request(method.clone(), url)
            .header(reqwest::header::ACCEPT, "application/json");
        if let Some(token) = token {
            request = request.bearer_auth(token);
        }
        if let Some(etag) = etag {
            if etag.len() > 256 || etag.contains(['\r', '\n']) {
                return Err(fail("invalid_request"));
            }
            request = request.header(
                if method == reqwest::Method::GET {
                    "If-None-Match"
                } else {
                    "If-Match"
                },
                etag,
            );
        }
        if let Some(body) = body {
            if body.to_string().len() > MAX_REQUEST {
                return Err(fail("too_large"));
            }
            request = request.json(body);
        }
        let mut response = request
            .send()
            .await
            .map_err(|_| fail("network_unavailable"))?;
        let status = response.status().as_u16();
        let etag = response
            .headers()
            .get("etag")
            .and_then(|h| h.to_str().ok())
            .filter(|v| v.len() <= 256)
            .map(str::to_owned);
        if response
            .content_length()
            .is_some_and(|n| n > MAX_RESPONSE as u64)
        {
            return Err(fail("too_large"));
        }
        let mut bytes = Vec::new();
        while let Some(chunk) = response
            .chunk()
            .await
            .map_err(|_| fail("network_unavailable"))?
        {
            if bytes.len() + chunk.len() > MAX_RESPONSE {
                return Err(fail("too_large"));
            }
            bytes.extend_from_slice(&chunk);
        }
        let body = if status == 204 || status == 304 || bytes.is_empty() {
            Value::Null
        } else {
            serde_json::from_slice(&bytes).map_err(|_| fail("invalid_response"))?
        };
        Ok(ApiResponse { status, body, etag })
    }
    async fn token(&self) -> NativeResult<Session> {
        self.configured()?;
        let mut auth = self.auth.lock().await;
        self.load(&mut auth)?;
        let current = auth
            .session
            .as_ref()
            .ok_or_else(|| fail("reauth_required"))?;
        if current.expires_at > now_ms() + 30_000 {
            return Ok(current.clone());
        }
        // Mark the old token consumed on disk BEFORE attempting rotation. A timeout/crash can
        // mean the server rotated; replaying that token on restart would revoke the new family.
        let old = auth.session.take().expect("checked session");
        if let Err(e) = self.credentials.clear() {
            self.bind_cache(None)?;
            return Err(e);
        }
        let result = self
            .request(
                reqwest::Method::POST,
                "/v1/auth/refresh",
                Some(&json!({"refreshToken":old.refresh_token})),
                None,
                None,
            )
            .await;
        let next = result.and_then(session_response).and_then(|s| {
            if s.user.id != old.user.id {
                return Err(fail("invalid_response"));
            }
            self.credentials.save(&s)?;
            Ok(s)
        });
        match next {
            Ok(session) => {
                auth.session = Some(session.clone());
                Ok(session)
            }
            Err(_) => {
                self.bind_cache(None)?;
                self.disconnect_all();
                Err(fail("reauth_required"))
            }
        }
    }
    fn cancel(&self) {
        self.cancel_with_gateway(false);
    }
    fn cancel_with_gateway(&self, disconnect: bool) {
        self.cancel_gateway(disconnect);
        if let Ok(mut pending) = self.oauth.lock() {
            if let Some(tx) = pending.take() {
                let _ = tx.send(());
            }
        }
    }
    fn cancel_gateway(&self, disconnect: bool) {
        // Slot changes and generation changes share this lock. A late connect cannot install
        // a socket after logout has checked for one, and a socket cannot identify after logout.
        let mut gateway = self
            .gateway
            .lock()
            .unwrap_or_else(|poison| poison.into_inner());
        self.generation.fetch_add(1, Ordering::SeqCst);
        if disconnect {
            if let Some(slot) = gateway.take() {
                let _ = slot.stop.send(());
            }
        }
    }
    async fn logout_local(&self) -> NativeResult<Option<Session>> {
        self.cancel_with_gateway(true);
        let mut auth = self.auth.lock().await;
        // Load first so sign-out before auth_status can still revoke the stored family.
        let _ = self.load(&mut auth);
        auth.loaded = true;
        let previous = auth.session.take();
        let clear = self.credentials.clear();
        let wipe = self.bind_cache(None);
        clear?;
        wipe?;
        Ok(previous)
    }
    async fn revoke_previous(&self, session: Session) {
        // A token near expiry may be rejected before logout arrives. Rotate the captured
        // refresh token once, only to get a live bearer token for revocation. Never save it.
        let token = if session.expires_at > now_ms().saturating_add(30_000) {
            Some(session.session)
        } else {
            self.request(
                reqwest::Method::POST,
                "/v1/auth/refresh",
                Some(&json!({"refreshToken":session.refresh_token})),
                None,
                None,
            )
            .await
            .ok()
            .and_then(|response| session_response(response).ok())
            .filter(|next| next.user.id == session.user.id)
            .map(|next| next.session)
        };
        if let Some(token) = token {
            let _ = self
                .request(
                    reqwest::Method::POST,
                    "/v1/auth/logout",
                    None,
                    Some(&token),
                    None,
                )
                .await;
        }
    }
    async fn finish_signin(&self, response: ApiResponse, generation: u64) -> NativeResult<User> {
        let session = session_response(response)?;
        let mut auth = self.auth.lock().await;
        if generation != self.generation.load(Ordering::SeqCst) {
            return Err(fail("auth_cancelled"));
        }
        self.credentials.clear()?;
        auth.loaded = true;
        auth.session = None;
        self.disconnect_all();
        self.bind_cache(Some(&session.user))?;
        self.credentials.save(&session)?;
        let user = session.user.clone();
        auth.session = Some(session);
        Ok(user)
    }
    fn disconnect_all(&self) {
        if let Ok(mut gateway) = self.gateway.lock() {
            if let Some(slot) = gateway.take() {
                let _ = slot.stop.send(());
            }
        }
    }
    fn install_gateway(&self, generation: u64, slot: GatewaySlot) -> NativeResult<()> {
        let mut gateway = self.gateway.lock().map_err(|_| fail("busy"))?;
        if generation != self.generation.load(Ordering::SeqCst) {
            return Err(fail("auth_cancelled"));
        }
        *gateway = Some(slot);
        Ok(())
    }
    pub fn memory_pressure(&self, red: bool) {
        if red {
            self.disconnect_all();
        }
    }
}

fn session_response(response: ApiResponse) -> NativeResult<Session> {
    if !(200..300).contains(&response.status) {
        return Err(provider_error(&response.body));
    }
    let session: Session =
        serde_json::from_value(response.body).map_err(|_| fail("invalid_response"))?;
    session.validate()?;
    Ok(session)
}
fn provider_error(body: &Value) -> NativeError {
    // An explicit map prevents a server/provider payload (or attacker-controlled text) reaching IPC errors.
    match body.get("error").and_then(Value::as_str) {
        Some("invalid_credentials") => fail("invalid_credentials"),
        Some("email_unverified") => fail("email_unverified"),
        Some("account_link_required") => fail("account_link_required"),
        Some("account_link_failed") => fail("account_link_failed"),
        Some("auth_not_configured") => fail("auth_not_configured"),
        Some("auth_unavailable") => fail("auth_unavailable"),
        Some("rate_limited") => fail("rate_limited"),
        _ => fail("auth_failed"),
    }
}
#[derive(Serialize)]
pub struct AuthStatus {
    configured: bool,
    user: Option<User>,
}
#[derive(Serialize)]
pub struct ApiResponse {
    status: u16,
    body: Value,
    #[serde(skip_serializing_if = "Option::is_none")]
    etag: Option<String>,
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Password {
    email: String,
    password: String,
}
impl Password {
    fn validate(&self) -> NativeResult<()> {
        if self.email.len() > 254
            || !self.email.contains('@')
            || self.password.is_empty()
            || self.password.len() > 4096
        {
            Err(fail("invalid_request"))
        } else {
            Ok(())
        }
    }
    fn value(&self) -> Value {
        json!({"email":self.email,"password":self.password})
    }
}
#[tauri::command]
pub async fn auth_status(state: State<'_, Arc<NativeBridge>>) -> NativeResult<AuthStatus> {
    if state.config.is_none() {
        return Ok(AuthStatus {
            configured: false,
            user: None,
        });
    }
    let mut auth = state.auth.lock().await;
    state.load(&mut auth)?;
    Ok(AuthStatus {
        configured: true,
        user: auth.session.as_ref().map(|s| s.user.clone()),
    })
}
#[tauri::command]
pub async fn auth_password(
    state: State<'_, Arc<NativeBridge>>,
    email: String,
    password: String,
) -> NativeResult<User> {
    let login = Password { email, password };
    login.validate()?;
    state.configured()?;
    state.cancel();
    let generation = state.generation.load(Ordering::SeqCst);
    let response = state
        .request(
            reqwest::Method::POST,
            "/v1/auth/password",
            Some(&login.value()),
            None,
            None,
        )
        .await?;
    state.finish_signin(response, generation).await
}
#[tauri::command]
pub async fn auth_google(
    state: State<'_, Arc<NativeBridge>>,
    link: Option<Password>,
) -> NativeResult<User> {
    if let Some(link) = &link {
        link.validate()?;
    }
    state.configured()?;
    state.cancel();
    let generation = state.generation.load(Ordering::SeqCst);
    let (cancel, cancelled) = oneshot::channel();
    *state.oauth.lock().map_err(|_| fail("busy"))? = Some(cancel);
    let config = state
        .request(
            reqwest::Method::GET,
            "/v1/auth/desktop-config",
            None,
            None,
            None,
        )
        .await?;
    if config.status != 200 {
        return Err(provider_error(&config.body));
    }
    let client_id = config
        .body
        .get("googleClientId")
        .and_then(Value::as_str)
        .filter(|s| !s.is_empty() && s.len() <= 256)
        .ok_or_else(|| fail("invalid_response"))?;
    if state.generation.load(Ordering::SeqCst) != generation {
        return Err(fail("auth_cancelled"));
    }
    let listener = TcpListener::bind("127.0.0.1:0")
        .await
        .map_err(|_| fail("auth_unavailable"))?;
    let redirect = format!(
        "http://127.0.0.1:{}/oauth/callback",
        listener
            .local_addr()
            .map_err(|_| fail("auth_unavailable"))?
            .port()
    );
    let verifier = oauth::random_secret();
    let oauth_state = oauth::random_secret();
    oauth::open_browser(&oauth::authorization_url(
        client_id,
        &redirect,
        &oauth_state,
        &verifier,
    ))?;
    let code = oauth::listen(listener, &oauth_state, cancelled).await?;
    if state.generation.load(Ordering::SeqCst) != generation {
        return Err(fail("auth_cancelled"));
    }
    let mut body = json!({"code":code,"codeVerifier":verifier,"redirectUri":redirect});
    if let Some(link) = link {
        body["link"] = link.value();
    }
    let response = state
        .request(
            reqwest::Method::POST,
            "/v1/auth/google/exchange",
            Some(&body),
            None,
            None,
        )
        .await?;
    state.finish_signin(response, generation).await
}
#[tauri::command]
pub fn auth_cancel(state: State<'_, Arc<NativeBridge>>) {
    state.cancel();
}
#[tauri::command]
pub async fn auth_logout(state: State<'_, Arc<NativeBridge>>) -> NativeResult<()> {
    if let Some(session) = state.logout_local().await? {
        let bridge = state.inner().clone();
        tauri::async_runtime::spawn(async move { bridge.revoke_previous(session).await });
    }
    Ok(())
}

fn id(value: &str) -> bool {
    !value.is_empty()
        && value.len() <= 64
        && value
            .bytes()
            .all(|b| b.is_ascii_lowercase() || b.is_ascii_digit() || b"_-".contains(&b))
}
fn api_path(method: &str, path: &str) -> NativeResult<()> {
    if path.len() > 1024 || path.contains(['\\', '#', '%']) || !path.starts_with("/v1/") {
        return Err(fail("invalid_request"));
    }
    let (pathname, query) = path.split_once('?').unwrap_or((path, ""));
    let parts: Vec<_> = pathname.split('/').skip(2).collect();
    let allowed = match parts.as_slice() {
        ["me"] => matches!(method, "GET" | "PATCH"),
        ["me", "preferences"] => matches!(method, "GET" | "PATCH"),
        ["me", "limits" | "entitlements"] => method == "GET",
        ["hangouts"] => matches!(method, "GET" | "POST"),
        ["hangouts", hangout] if id(hangout) => matches!(method, "GET" | "PATCH"),
        ["hangouts", hangout, "snapshot"] if id(hangout) => method == "GET",
        ["hangouts", hangout, "rooms"] if id(hangout) => matches!(method, "GET" | "POST"),
        ["rooms", room] if id(room) => method == "PATCH",
        ["rooms", room, "messages"] if id(room) => matches!(method, "GET" | "POST"),
        _ => false,
    };
    if !allowed {
        return Err(fail("invalid_request"));
    }
    if !query.is_empty() {
        if method != "GET" || !matches!(parts.as_slice(), ["rooms", _, "messages"]) {
            return Err(fail("invalid_request"));
        }
        let mut seen = std::collections::HashSet::new();
        for (key, value) in url::form_urlencoded::parse(query.as_bytes()) {
            if !seen.insert(key.to_string()) {
                return Err(fail("invalid_request"));
            }
            match key.as_ref() {
                "before" | "after" if id(&value) => (),
                "limit" if value.parse::<u32>().is_ok_and(|n| (1..=100).contains(&n)) => (),
                _ => return Err(fail("invalid_request")),
            }
        }
        if seen.contains("before") && seen.contains("after") {
            return Err(fail("invalid_request"));
        }
    }
    Ok(())
}
#[tauri::command]
pub async fn api_request(
    state: State<'_, Arc<NativeBridge>>,
    method: String,
    path: String,
    body: Option<Value>,
    etag: Option<String>,
) -> NativeResult<ApiResponse> {
    api_path(&method, &path)?;
    if method == "GET" && body.is_some() {
        return Err(fail("invalid_request"));
    }
    let method =
        reqwest::Method::from_bytes(method.as_bytes()).map_err(|_| fail("invalid_request"))?;
    let generation = state.generation.load(Ordering::SeqCst);
    let session = state.token().await?;
    let response = state
        .request(
            method,
            &path,
            body.as_ref(),
            Some(&session.session),
            etag.as_deref(),
        )
        .await?;
    if generation != state.generation.load(Ordering::SeqCst) {
        return Err(fail("auth_cancelled"));
    }
    if response.status == 401 {
        let mut auth = state.auth.lock().await;
        if auth
            .session
            .as_ref()
            .is_some_and(|current| current.session == session.session)
        {
            auth.session = None;
            let clear = state.credentials.clear();
            state.bind_cache(None)?;
            state.disconnect_all();
            clear?;
        }
    }
    Ok(response)
}

#[derive(Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct CacheVersions {
    prefs_version: u64,
    hangouts: BTreeMap<String, u64>,
}
#[derive(Clone, Serialize)]
#[serde(tag = "kind", rename_all = "lowercase")]
enum GatewayEvent {
    Frame {
        #[serde(rename = "connectionId")]
        connection_id: String,
        frame: Value,
    },
    Closed {
        #[serde(rename = "connectionId")]
        connection_id: String,
        code: u16,
    },
}
fn outgoing(frame: &Value, room: &str) -> NativeResult<()> {
    if frame.to_string().len() > MAX_REQUEST {
        return Err(fail("too_large"));
    }
    let object = frame
        .as_object()
        .filter(|o| o.len() == 2)
        .ok_or_else(|| fail("invalid_frame"))?;
    let data = object
        .get("d")
        .and_then(Value::as_object)
        .ok_or_else(|| fail("invalid_frame"))?;
    match object.get("op").and_then(Value::as_str) {
        Some("HEARTBEAT")
            if data.len() == 1
                && data
                    .get("seq")
                    .is_some_and(|s| s.is_null() || s.as_u64().is_some()) =>
        {
            Ok(())
        }
        Some("MESSAGE_CREATE")
            if data.len() == 3
                && data.get("roomId").and_then(Value::as_str) == Some(room)
                && data
                    .get("content")
                    .and_then(Value::as_str)
                    .is_some_and(|s| !s.trim().is_empty() && s.chars().count() <= 4000)
                && data.get("nonce").and_then(Value::as_str).is_some_and(|s| {
                    (8..=64).contains(&s.len())
                        && s.bytes()
                            .all(|b| b.is_ascii_alphanumeric() || b"_-".contains(&b))
                }) =>
        {
            Ok(())
        }
        _ => Err(fail("invalid_frame")),
    }
}
#[tauri::command]
pub async fn gateway_connect(
    app: tauri::AppHandle,
    state: State<'_, Arc<NativeBridge>>,
    room_id: String,
    cache: CacheVersions,
) -> NativeResult<String> {
    if !id(&room_id) || cache.hangouts.len() > 100 || cache.hangouts.keys().any(|s| !id(s)) {
        return Err(fail("invalid_request"));
    }
    let _serial = state.gateway_serial.lock().await;
    let generation = state.generation.load(Ordering::SeqCst);
    let session = state.token().await?;
    state.disconnect_all();
    let mut url = state.configured()?.gateway.clone();
    url.set_path("/v1/gateway");
    url.query_pairs_mut().append_pair("room", &room_id);
    let config = WebSocketConfig::default()
        .max_message_size(Some(MAX_FRAME))
        .max_frame_size(Some(MAX_FRAME))
        .write_buffer_size(0)
        .max_write_buffer_size(MAX_REQUEST * 2);
    let (mut socket, _) = timeout(
        Duration::from_secs(15),
        connect_async_with_config(url.as_str(), Some(config), false),
    )
    .await
    .map_err(|_| fail("network_unavailable"))?
    .map_err(|_| fail("network_unavailable"))?;
    let connection_id = oauth::random_secret();
    let (sender, mut receiver) = mpsc::channel::<Value>(MAX_QUEUED_FRAMES);
    let (stop, mut stopped) = oneshot::channel();
    state.install_gateway(
        generation,
        GatewaySlot {
            id: connection_id.clone(),
            room_id,
            sender,
            stop,
        },
    )?;
    let bridge = state.inner().clone();
    let task_id = connection_id.clone();
    tauri::async_runtime::spawn(async move {
        let mut identified = false;
        let deadline = tokio::time::sleep(Duration::from_secs(15));
        tokio::pin!(deadline);
        let code = loop {
            tokio::select! {
                biased;
                _ = &mut stopped => { let _ = timeout(Duration::from_secs(1), socket.close(None)).await; break 1000; },
                _ = &mut deadline, if !identified => break 4001,
                outbound = receiver.recv() => match outbound {
                    Some(frame) if identified => { if timeout(Duration::from_secs(5), socket.send(Message::Text(frame.to_string().into()))).await.map_or(true, |r| r.is_err()) { break 1011; } },
                    Some(_) => break 4001,
                    None => break 1000,
                },
                inbound = socket.next() => match inbound {
                    Some(Ok(Message::Text(raw))) => {
                        let frame: Value = match serde_json::from_str(&raw) { Ok(value) => value, Err(_) => break 1007 };
                        if frame.get("op").and_then(Value::as_str) == Some("HELLO") {
                            if identified { break 1008; }
                            let identify = json!({"op":"IDENTIFY","d":{"token":session.session,"client":{"platform":"desktop","version":env!("CARGO_PKG_VERSION")},"cache":cache}});
                            if timeout(Duration::from_secs(5), poll_fn(|cx| socket.poll_ready_unpin(cx))).await.map_or(true, |r| r.is_err()) { break 1011; }
                            // Check and queue IDENTIFY while logout holds the same lock for its
                            // generation bump and slot removal. No network wait holds this lock.
                            {
                                let gateway = bridge.gateway.lock().unwrap_or_else(|poison| poison.into_inner());
                                if generation != bridge.generation.load(Ordering::SeqCst)
                                    || !gateway.as_ref().is_some_and(|slot| slot.id == task_id) { break 1000; }
                                if socket.start_send_unpin(Message::Text(identify.to_string().into())).is_err() { break 1011; }
                            }
                            tokio::select! {
                                biased;
                                _ = &mut stopped => break 1000,
                                sent = timeout(Duration::from_secs(5), socket.flush()) => {
                                    if sent.map_or(true, |r| r.is_err()) { break 1011; }
                                }
                            }
                            identified = true;
                        } else if !identified { break 1008; }
                        // Only server events; never reflect an IDENTIFY/RESUME carrying credentials.
                        if matches!(frame.get("op").and_then(Value::as_str), Some("IDENTIFY" | "RESUME")) { break 1008; }
                        if generation != bridge.generation.load(Ordering::SeqCst) { break 1000; }
                        let _ = app.emit(GATEWAY_EVENT, GatewayEvent::Frame { connection_id: task_id.clone(), frame });
                    },
                    Some(Ok(Message::Close(frame))) => break frame.map(|f| u16::from(f.code)).unwrap_or(1000),
                    Some(Ok(Message::Ping(_))) => { if timeout(Duration::from_secs(5), socket.flush()).await.map_or(true, |r| r.is_err()) { break 1011; } },
                    Some(Ok(Message::Pong(_))) => (),
                    Some(Ok(_)) => break 1003,
                    Some(Err(_)) | None => break 1006,
                }
            }
        };
        if let Ok(mut slot) = bridge.gateway.lock() {
            if slot.as_ref().is_some_and(|s| s.id == task_id) {
                slot.take();
            }
        }
        let _ = app.emit(
            GATEWAY_EVENT,
            GatewayEvent::Closed {
                connection_id: task_id,
                code,
            },
        );
    });
    Ok(connection_id)
}
#[tauri::command]
pub fn gateway_send(
    state: State<'_, Arc<NativeBridge>>,
    connection_id: String,
    frame: Value,
) -> NativeResult<()> {
    let gateway = state.gateway.lock().map_err(|_| fail("busy"))?;
    let slot = gateway
        .as_ref()
        .filter(|s| s.id == connection_id)
        .ok_or_else(|| fail("stale_connection"))?;
    outgoing(&frame, &slot.room_id)?;
    slot.sender
        .try_send(frame)
        .map_err(|_| fail("gateway_busy"))
}
#[tauri::command]
pub fn gateway_disconnect(
    state: State<'_, Arc<NativeBridge>>,
    connection_id: String,
) -> NativeResult<()> {
    let mut gateway = state.gateway.lock().map_err(|_| fail("busy"))?;
    if !gateway.as_ref().is_some_and(|s| s.id == connection_id) {
        return Err(fail("stale_connection"));
    }
    if let Some(slot) = gateway.take() {
        let _ = slot.stop.send(());
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::atomic::{AtomicBool, AtomicUsize};
    use tokio::io::{AsyncReadExt, AsyncWriteExt};
    #[derive(Default)]
    struct MemoryCredentials {
        value: Mutex<Option<Session>>,
        fail_save: AtomicBool,
    }
    impl CredentialStore for Arc<MemoryCredentials> {
        fn load(&self) -> NativeResult<Option<Session>> {
            Ok(self.value.lock().unwrap().clone())
        }
        fn save(&self, session: &Session) -> NativeResult<()> {
            if self.fail_save.load(Ordering::SeqCst) {
                return Err(fail("keychain_unavailable"));
            }
            *self.value.lock().unwrap() = Some(session.clone());
            Ok(())
        }
        fn clear(&self) -> NativeResult<()> {
            *self.value.lock().unwrap() = None;
            Ok(())
        }
    }
    fn session(token: &str, expiry: u64) -> Session {
        Session {
            session: token.repeat(24),
            refresh_token: format!("refresh-{}", token.repeat(24)),
            expires_at: expiry,
            user: User {
                id: "account-a".into(),
                display_name: "Member".into(),
                email: Some("member@example.test".into()),
                avatar_url: None,
                created_at: 1,
            },
        }
    }
    fn store() -> Arc<EncryptedStore> {
        Arc::new(EncryptedStore::open_in_memory(&[9; 32]).unwrap())
    }
    async fn server(
        response: Option<String>,
    ) -> (Config, Arc<AtomicUsize>, tokio::task::JoinHandle<()>) {
        let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
        let addr = listener.local_addr().unwrap();
        let count = Arc::new(AtomicUsize::new(0));
        let requests = count.clone();
        let task = tokio::spawn(async move {
            loop {
                let (mut socket, _) = listener.accept().await.unwrap();
                let mut raw = vec![];
                let mut chunk = [0u8; 1024];
                loop {
                    let n = socket.read(&mut chunk).await.unwrap();
                    if n == 0 {
                        break;
                    }
                    raw.extend_from_slice(&chunk[..n]);
                    if let Some(end) = raw.windows(4).position(|v| v == b"\r\n\r\n") {
                        let headers = String::from_utf8_lossy(&raw[..end]);
                        let length: usize = headers
                            .lines()
                            .find_map(|line| {
                                line.to_ascii_lowercase()
                                    .strip_prefix("content-length: ")
                                    .and_then(|n| n.parse().ok())
                            })
                            .unwrap_or(0);
                        if raw.len() >= end + 4 + length {
                            break;
                        }
                    }
                }
                requests.fetch_add(1, Ordering::SeqCst);
                if let Some(body) = &response {
                    let raw = format!("HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nConnection: close\r\nContent-Length: {}\r\n\r\n{body}", body.len());
                    socket.write_all(raw.as_bytes()).await.unwrap();
                }
            }
        });
        (
            Config::parse(&format!("http://{addr}"), &format!("ws://{addr}"), true).unwrap(),
            count,
            task,
        )
    }
    async fn logout_server(
        next: Session,
    ) -> (Config, Arc<Mutex<Vec<String>>>, tokio::task::JoinHandle<()>) {
        let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
        let addr = listener.local_addr().unwrap();
        let calls = Arc::new(Mutex::new(Vec::new()));
        let seen = calls.clone();
        let task = tokio::spawn(async move {
            loop {
                let (mut socket, _) = listener.accept().await.unwrap();
                let mut raw = Vec::new();
                let mut chunk = [0u8; 1024];
                loop {
                    let n = socket.read(&mut chunk).await.unwrap();
                    if n == 0 {
                        break;
                    }
                    raw.extend_from_slice(&chunk[..n]);
                    if let Some(end) = raw.windows(4).position(|v| v == b"\r\n\r\n") {
                        let headers = String::from_utf8_lossy(&raw[..end]);
                        let length: usize = headers
                            .lines()
                            .find_map(|line| {
                                line.to_ascii_lowercase()
                                    .strip_prefix("content-length: ")
                                    .and_then(|v| v.parse().ok())
                            })
                            .unwrap_or(0);
                        if raw.len() >= end + 4 + length {
                            break;
                        }
                    }
                }
                let request = String::from_utf8(raw).unwrap();
                let refresh = request.starts_with("POST /v1/auth/refresh ");
                seen.lock().unwrap().push(request);
                if refresh {
                    let body = serde_json::to_string(&next).unwrap();
                    let response = format!("HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nConnection: close\r\nContent-Length: {}\r\n\r\n{body}", body.len());
                    socket.write_all(response.as_bytes()).await.unwrap();
                } else {
                    socket.write_all(b"HTTP/1.1 204 No Content\r\nConnection: close\r\nContent-Length: 0\r\n\r\n").await.unwrap();
                }
            }
        });
        (
            Config::parse(&format!("http://{addr}"), &format!("ws://{addr}"), true).unwrap(),
            calls,
            task,
        )
    }
    #[test]
    fn only_fixed_secure_origins_or_debug_loopback_are_allowed() {
        assert!(Config::parse(
            "https://api.example.test",
            "wss://gateway.example.test",
            false
        )
        .is_ok());
        assert!(Config::parse("http://127.0.0.1:8787", "ws://localhost:8788", true).is_ok());
        for api in [
            "http://api.example.test",
            "https://name:pass@api.example.test",
            "https://api.example.test/v1",
            "https://api.example.test?x=1",
            "https://api.example.test#x",
            "",
            "https://api.example.test/../",
        ] {
            assert!(
                Config::parse(api, "wss://gateway.example.test", false).is_err(),
                "{api}"
            );
        }
        assert!(Config::parse("http://127.0.0.1:8787", "ws://127.0.0.1:8788", false).is_err());
        assert!(Config::parse("http://elsewhere.test", "ws://elsewhere.test", true).is_err());
    }
    #[test]
    fn ipc_paths_are_method_scoped_and_cannot_escape_or_reach_auth() {
        for (method, path) in [
            ("GET", "/v1/hangouts"),
            ("POST", "/v1/hangouts/night/rooms"),
            ("GET", "/v1/rooms/chat/messages?before=m1&limit=50"),
            ("PATCH", "/v1/me/preferences"),
        ] {
            assert!(api_path(method, path).is_ok());
        }
        for (method, path) in [
            ("GET", "https://evil.test/v1/me"),
            ("GET", "//evil.test/v1/me"),
            ("GET", "/v1/hangouts/../auth/session"),
            ("POST", "/v1/auth/refresh"),
            ("GET", "/v1/hangouts/%2e%2e/auth/session"),
            ("TRACE", "/v1/me"),
            ("GET", "/v1/me?url=evil"),
            ("GET", "/v1/rooms/chat/messages?limit=0"),
            ("GET", "/v1/rooms/chat/messages?before=a&after=b"),
            ("GET", "/v1/rooms/chat/messages?limit=1&limit=2"),
            ("GET", "/v1/me#x"),
        ] {
            assert!(api_path(method, path).is_err(), "{method} {path}");
        }
    }
    #[test]
    fn outgoing_frames_cannot_identify_impersonate_or_escape_room() {
        assert!(outgoing(&json!({"op":"HEARTBEAT","d":{"seq":null}}), "room").is_ok());
        assert!(outgoing(&json!({"op":"MESSAGE_CREATE","d":{"roomId":"room","content":"hi","nonce":"nonce-123"}}),"room").is_ok());
        for frame in [
            json!({"op":"IDENTIFY","d":{"token":"secret"}}),
            json!({"op":"READY","d":{}}),
            json!({"op":"MESSAGE_CREATE","d":{"roomId":"other","content":"hi","nonce":"nonce-123"}}),
            json!({"op":"HEARTBEAT","d":{"seq":null,"token":"secret"}}),
        ] {
            assert!(outgoing(&frame, "room").is_err());
        }
    }
    #[tokio::test]
    async fn concurrent_expired_requests_rotate_once_and_persist_before_return() {
        let next = session("new", now_ms() + 900_000);
        let (config, count, task) = server(Some(serde_json::to_string(&next).unwrap())).await;
        let vault = Arc::new(MemoryCredentials::default());
        vault.save(&session("old", now_ms() - 1)).unwrap();
        let bridge =
            NativeBridge::with_store(Some(config), store(), Box::new(vault.clone())).unwrap();
        let (a, b, c) = tokio::join!(bridge.token(), bridge.token(), bridge.token());
        for got in [a, b, c] {
            assert_eq!(got.unwrap().session, next.session);
        }
        assert_eq!(count.load(Ordering::SeqCst), 1);
        assert_eq!(
            vault.load().unwrap().unwrap().refresh_token,
            next.refresh_token
        );
        task.abort();
    }
    #[tokio::test]
    async fn ambiguous_rotation_drops_old_credential_across_restart() {
        let (config, count, task) = server(None).await;
        let vault = Arc::new(MemoryCredentials::default());
        vault.save(&session("old", now_ms() - 1)).unwrap();
        let cache = store();
        let bridge =
            NativeBridge::with_store(Some(config.clone()), cache.clone(), Box::new(vault.clone()))
                .unwrap();
        assert_eq!(bridge.token().await.err().unwrap().code, "reauth_required");
        assert!(vault.load().unwrap().is_none());
        assert_eq!(bridge.token().await.err().unwrap().code, "reauth_required");
        let restarted = NativeBridge::with_store(Some(config), cache, Box::new(vault)).unwrap();
        assert_eq!(
            restarted.token().await.err().unwrap().code,
            "reauth_required"
        );
        assert_eq!(count.load(Ordering::SeqCst), 1, "no automatic POST replay");
        task.abort();
    }
    #[tokio::test]
    async fn failed_persistence_never_releases_rotated_token() {
        let (config, count, task) = server(Some(
            serde_json::to_string(&session("new", now_ms() + 900_000)).unwrap(),
        ))
        .await;
        let vault = Arc::new(MemoryCredentials::default());
        vault.save(&session("old", now_ms() - 1)).unwrap();
        vault.fail_save.store(true, Ordering::SeqCst);
        let bridge =
            NativeBridge::with_store(Some(config), store(), Box::new(vault.clone())).unwrap();
        assert_eq!(bridge.token().await.err().unwrap().code, "reauth_required");
        assert!(vault.load().unwrap().is_none());
        assert_eq!(count.load(Ordering::SeqCst), 1);
        task.abort();
    }
    #[tokio::test]
    async fn account_cache_is_preserved_only_for_same_keychain_account() {
        let cache = store();
        let bridge = NativeBridge::with_store(
            None,
            cache.clone(),
            Box::new(Arc::new(MemoryCredentials::default())),
        )
        .unwrap();
        let a = session("a", now_ms() + 900_000).user;
        bridge.bind_cache(Some(&a)).unwrap();
        cache.put("prefs", "{}").unwrap();
        bridge.bind_cache(Some(&a)).unwrap();
        assert!(cache.get("prefs").unwrap().is_some());
        let mut b = a.clone();
        b.id = "account-b".into();
        bridge.bind_cache(Some(&b)).unwrap();
        assert!(cache.get("prefs").unwrap().is_none());
        assert_eq!(
            cache.get("account").unwrap(),
            Some(json!("account-b").to_string())
        );
        bridge.bind_cache(None).unwrap();
        assert!(cache.keys("").unwrap().is_empty());
    }
    #[tokio::test]
    async fn cancellation_rejects_late_signin_result_without_persisting() {
        let vault = Arc::new(MemoryCredentials::default());
        let bridge = NativeBridge::with_store(None, store(), Box::new(vault.clone())).unwrap();
        let response = ApiResponse {
            status: 200,
            body: serde_json::to_value(session("late", now_ms() + 900_000)).unwrap(),
            etag: None,
        };
        bridge.cancel();
        assert_eq!(
            bridge.finish_signin(response, 0).await.err().unwrap().code,
            "auth_cancelled"
        );
        assert!(vault.load().unwrap().is_none());
    }
    #[test]
    fn provider_errors_match_the_api_codes() {
        assert_eq!(
            provider_error(&json!({"error":"email_unverified"})).code,
            "email_unverified"
        );
        assert_eq!(
            provider_error(&json!({"error":"auth_unavailable"})).code,
            "auth_unavailable"
        );
    }
    #[tokio::test]
    async fn logout_with_live_access_revokes_after_local_clear() {
        let old = session("old", now_ms() + 900_000);
        let (config, calls, task) = logout_server(session("unused", now_ms() + 900_000)).await;
        let vault = Arc::new(MemoryCredentials::default());
        vault.save(&old).unwrap();
        let cache = store();
        cache.put("prefs", "{}").unwrap();
        let bridge =
            NativeBridge::with_store(Some(config), cache.clone(), Box::new(vault.clone())).unwrap();
        let previous = bridge.logout_local().await.unwrap().unwrap();
        assert!(vault.load().unwrap().is_none());
        assert!(cache.keys("").unwrap().is_empty());
        assert!(
            calls.lock().unwrap().is_empty(),
            "local logout precedes network"
        );
        let newer = session("newer", now_ms() + 900_000);
        let generation = bridge.generation.load(Ordering::SeqCst);
        bridge
            .finish_signin(
                ApiResponse {
                    status: 200,
                    body: serde_json::to_value(&newer).unwrap(),
                    etag: None,
                },
                generation,
            )
            .await
            .unwrap();
        bridge.revoke_previous(previous).await;
        assert_eq!(
            vault.load().unwrap().unwrap().session,
            newer.session,
            "old logout cannot erase a later sign-in"
        );
        let got = calls.lock().unwrap();
        assert_eq!(got.len(), 1);
        assert!(got[0].starts_with("POST /v1/auth/logout "));
        assert!(got[0]
            .to_ascii_lowercase()
            .contains(&format!("authorization: bearer {}", old.session)));
        task.abort();
    }
    #[tokio::test]
    async fn logout_with_expired_access_rotates_once_only_for_revocation() {
        let old = session("old", now_ms() - 1);
        let next = session("next", now_ms() + 900_000);
        let (config, calls, task) = logout_server(next.clone()).await;
        let vault = Arc::new(MemoryCredentials::default());
        vault.save(&old).unwrap();
        let bridge =
            NativeBridge::with_store(Some(config), store(), Box::new(vault.clone())).unwrap();
        let previous = bridge.logout_local().await.unwrap().unwrap();
        assert!(vault.load().unwrap().is_none());
        bridge.revoke_previous(previous).await;
        assert!(
            vault.load().unwrap().is_none(),
            "rotated credentials stay out of the keychain"
        );
        let got = calls.lock().unwrap();
        assert_eq!(got.len(), 2);
        assert!(got[0].starts_with("POST /v1/auth/refresh "));
        assert!(got[0].contains(&old.refresh_token));
        assert!(got[1].starts_with("POST /v1/auth/logout "));
        assert!(got[1]
            .to_ascii_lowercase()
            .contains(&format!("authorization: bearer {}", next.session)));
        task.abort();
    }
    #[tokio::test]
    async fn logout_offline_clears_local_state_and_late_gateway_install_is_rejected() {
        let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
        let addr = listener.local_addr().unwrap();
        // Fail after accepting the request instead of depending on platform-specific
        // connection-refused timing for a closed loopback port.
        let failed_connection = tokio::spawn(async move {
            let (mut stream, _) = listener.accept().await.unwrap();
            let mut request = [0u8; 4096];
            assert!(stream.read(&mut request).await.unwrap() > 0);
            // Drop without an HTTP response to simulate a lost connection.
        });
        let config =
            Config::parse(&format!("http://{addr}"), &format!("ws://{addr}"), true).unwrap();
        let vault = Arc::new(MemoryCredentials::default());
        vault.save(&session("old", now_ms() - 1)).unwrap();
        let cache = store();
        cache.put("prefs", "{}").unwrap();
        let bridge =
            NativeBridge::with_store(Some(config), cache.clone(), Box::new(vault.clone())).unwrap();
        let generation = bridge.generation.load(Ordering::SeqCst);
        let previous = bridge.logout_local().await.unwrap().unwrap();
        assert!(vault.load().unwrap().is_none());
        assert!(cache.keys("").unwrap().is_empty());
        let (sender, _) = mpsc::channel(1);
        let (stop, _) = oneshot::channel();
        let slot = GatewaySlot {
            id: "late".into(),
            room_id: "room".into(),
            sender,
            stop,
        };
        assert_eq!(
            bridge.install_gateway(generation, slot).err().unwrap().code,
            "auth_cancelled"
        );
        assert!(bridge.gateway.lock().unwrap().is_none());
        tokio::time::timeout(Duration::from_secs(5), bridge.revoke_previous(previous))
            .await
            .unwrap();
        tokio::time::timeout(Duration::from_secs(5), failed_connection)
            .await
            .unwrap()
            .unwrap();
        assert!(vault.load().unwrap().is_none());
    }
}
