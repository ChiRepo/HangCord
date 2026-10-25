//! HangCord desktop — Rust core. The webview only draws UI; storage, memory policy and (later)
//! media, crypto and networking live here (MASTER_PLAN §4).

pub mod cache;
pub mod device_key;
pub mod governor;
pub mod native;
pub mod oauth;

use cache::{CacheError, EncryptedStore};
use device_key::KeyStorage;
use governor::{Governor, Status};
use serde::Serialize;
use std::sync::{Arc, Mutex};
use std::time::Duration;
use tauri::{Emitter, Manager, State};

pub const GOVERNOR_EVENT: &str = "governor://status";
const SAMPLE_EVERY: Duration = Duration::from_secs(5);

pub struct AppState {
    store: Arc<EncryptedStore>,
    governor: Arc<Mutex<Governor>>,
    last: Arc<Mutex<Option<Status>>>,
    key_storage: KeyStorage,
}

/// Errors cross IPC as short codes only — never paths, SQL or key material.
#[derive(Debug, Serialize)]
pub struct IpcError {
    code: &'static str,
}

impl From<CacheError> for IpcError {
    fn from(e: CacheError) -> Self {
        let code = match e {
            CacheError::BadKey => "bad_key",
            CacheError::TooLarge => "too_large",
            CacheError::Storage => "storage",
            CacheError::Corrupt => "corrupt",
            CacheError::Full => "full",
        };
        IpcError { code }
    }
}

type IpcResult<T> = Result<T, IpcError>;

const BUSY: IpcError = IpcError { code: "busy" };

#[tauri::command]
fn cache_get(state: State<'_, AppState>, key: String) -> IpcResult<Option<String>> {
    match state.store.get(&key) {
        Err(CacheError::Corrupt) => Ok(None), // row removed; the caller re-fetches from the server
        r => Ok(r?),
    }
}

#[tauri::command]
fn cache_put(state: State<'_, AppState>, key: String, value: String) -> IpcResult<()> {
    if value.len() > cache::MAX_VALUE_BYTES {
        return Err(IpcError { code: "too_large" }); // check size before parsing anything
    }
    serde_json::from_str::<serde_json::Value>(&value)
        .map_err(|_| IpcError { code: "bad_value" })?;
    Ok(state.store.put(&key, &value)?)
}

#[tauri::command]
fn cache_delete(state: State<'_, AppState>, key: String) -> IpcResult<()> {
    Ok(state.store.delete(&key)?)
}

#[tauri::command]
fn cache_keys(state: State<'_, AppState>, prefix: String) -> IpcResult<Vec<String>> {
    Ok(state.store.keys(&prefix)?)
}

#[tauri::command]
fn cache_wipe(state: State<'_, AppState>) -> IpcResult<()> {
    Ok(state.store.wipe()?)
}

#[tauri::command]
fn governor_status(state: State<'_, AppState>) -> IpcResult<Status> {
    if let Some(s) = state.last.lock().map_err(|_| BUSY)?.clone() {
        return Ok(s);
    }
    let s = state.governor.lock().map_err(|_| BUSY)?.sample();
    Ok(s)
}

#[tauri::command]
fn set_lightweight(state: State<'_, AppState>, on: bool) -> IpcResult<Status> {
    let mut g = state.governor.lock().map_err(|_| BUSY)?;
    g.lightweight = on;
    let s = g.sample();
    if let Ok(mut last) = state.last.lock() {
        *last = Some(s.clone());
    }
    Ok(s)
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct AppInfo {
    version: &'static str,
    platform: &'static str,
    key_storage: KeyStorage,
}

#[tauri::command]
fn app_info(state: State<'_, AppState>) -> AppInfo {
    AppInfo {
        version: env!("CARGO_PKG_VERSION"),
        platform: std::env::consts::OS,
        key_storage: state.key_storage,
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        // Must be first: a second launch focuses the running window instead of opening another app.
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            if let Some(w) = app.get_webview_window("main") {
                let _ = w.unminimize();
                let _ = w.set_focus();
            }
        }))
        .plugin(tauri_plugin_window_state::Builder::default().build())
        .setup(|app| {
            let data_dir = app.path().app_data_dir()?;
            std::fs::create_dir_all(&data_dir)?;
            device_key::restrict(&data_dir)?; // 0700 on unix
            let (key, key_storage) = device_key::load_or_create(&data_dir)?;
            let store = Arc::new(
                EncryptedStore::open(&data_dir.join("cache.sqlite3"), &key)
                    .map_err(|e| format!("cache: {e}"))?,
            );
            let native = Arc::new(native::NativeBridge::new(store.clone()).map_err(|e| e.code)?);
            app.manage(native.clone());
            let governor = Arc::new(Mutex::new(Governor::new()));
            let last = Arc::new(Mutex::new(None));
            app.manage(AppState {
                store,
                governor: governor.clone(),
                last: last.clone(),
                key_storage,
            });

            // Governor loop: sample every 5 s and publish to the UI (MASTER_PLAN §11).
            let handle = app.handle().clone();
            std::thread::Builder::new()
                .name("governor".into())
                .spawn(move || loop {
                    let status = match governor.lock() {
                        Ok(mut g) => g.sample(),
                        Err(_) => break,
                    };
                    if let Ok(mut l) = last.lock() {
                        *l = Some(status.clone());
                    }
                    native.memory_pressure(status.zone == governor::Zone::Red);
                    let _ = handle.emit(GOVERNOR_EVENT, &status);
                    std::thread::sleep(SAMPLE_EVERY);
                })?;
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            cache_get,
            cache_put,
            cache_delete,
            cache_keys,
            cache_wipe,
            governor_status,
            set_lightweight,
            app_info,
            native::auth_status,
            native::auth_password,
            native::auth_google,
            native::auth_cancel,
            native::auth_logout,
            native::api_request,
            native::gateway_connect,
            native::gateway_send,
            native::gateway_disconnect
        ])
        .run(tauri::generate_context!())
        .expect("error while running HangCord");
}
