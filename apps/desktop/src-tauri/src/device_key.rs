//! Per-device cache key. Kept in the OS keychain (macOS Keychain, Windows Credential Manager,
//! Linux Secret Service). If no keychain is reachable (e.g. a minimal Linux without a keyring
//! daemon), falls back to a 0600 key file in the app's data folder and says so in `app_info` —
//! acceptable only because the cache never holds secrets (MASTER_PLAN §7.1).

use aes_gcm::aead::rand_core::RngCore;
use aes_gcm::aead::OsRng;
use serde::Serialize;
use std::path::Path;

/// Tests use their own keychain entry so `cargo test` on a dev machine never touches the real key.
const SERVICE: &str = if cfg!(test) { "app.hangcord.desktop.test" } else { "app.hangcord.desktop" };
const ACCOUNT: &str = "cache-key-v1";

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "kebab-case")]
pub enum KeyStorage {
    OsKeychain,
    FileFallback,
}

pub fn new_key() -> [u8; 32] {
    let mut k = [0u8; 32];
    OsRng.fill_bytes(&mut k);
    k
}

pub fn to_hex(bytes: &[u8]) -> String {
    bytes.iter().map(|b| format!("{b:02x}")).collect()
}

pub fn from_hex(s: &str) -> Option<[u8; 32]> {
    let s = s.trim();
    if s.len() != 64 {
        return None;
    }
    let mut out = [0u8; 32];
    for (i, chunk) in s.as_bytes().chunks(2).enumerate() {
        out[i] = u8::from_str_radix(std::str::from_utf8(chunk).ok()?, 16).ok()?;
    }
    Some(out)
}

/// Test builds only (`--features test-hooks`): `HANGCORD_KEY_STORAGE=file` forces the file key so
/// automated desktop tests run without a keyring daemon. Release builds ignore the variable.
fn forced_file() -> bool {
    cfg!(feature = "test-hooks") && std::env::var("HANGCORD_KEY_STORAGE").as_deref() == Ok("file")
}

/// Load the device key, creating it on first run. Never silently replaces an existing key:
/// 1. A fallback `cache.key` from an earlier run wins (rows were written with it) and is moved
///    into the keychain as soon as the keychain works again.
/// 2. Otherwise the keychain key is used; a transient keychain error is retried once.
/// 3. A new key is made only when no key exists anywhere.
pub fn load_or_create(data_dir: &Path) -> std::io::Result<([u8; 32], KeyStorage)> {
    if let Some(k) = read_file_key(data_dir)? {
        if !forced_file() && keychain_set(&k).is_ok() {
            let _ = std::fs::remove_file(data_dir.join(KEY_FILE));
            return Ok((k, KeyStorage::OsKeychain));
        }
        return Ok((k, KeyStorage::FileFallback));
    }
    if !forced_file() {
        for attempt in 0..2 {
            match keychain_get() {
                Ok(Some(k)) => return Ok((k, KeyStorage::OsKeychain)),
                Ok(None) => {
                    let k = new_key();
                    if keychain_set(&k).is_ok() {
                        return Ok((k, KeyStorage::OsKeychain));
                    }
                    break; // keychain can't store: use the file
                }
                Err(()) if attempt == 0 => std::thread::sleep(std::time::Duration::from_millis(300)),
                Err(()) => break,
            }
        }
    }
    let k = new_key();
    write_file_key(data_dir, &k)?;
    Ok((k, KeyStorage::FileFallback))
}

const KEY_FILE: &str = "cache.key";

/// `Ok(None)` = no entry (or an unreadable one, which is repaired by writing a new key).
fn keychain_get() -> Result<Option<[u8; 32]>, ()> {
    let entry = keyring::Entry::new(SERVICE, ACCOUNT).map_err(|_| ())?;
    match entry.get_password() {
        Ok(hex) => Ok(from_hex(&hex)),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(_) => Err(()),
    }
}

fn keychain_set(k: &[u8; 32]) -> Result<(), ()> {
    keyring::Entry::new(SERVICE, ACCOUNT).and_then(|e| e.set_password(&to_hex(k))).map_err(|_| ())
}

fn read_file_key(data_dir: &Path) -> std::io::Result<Option<[u8; 32]>> {
    let path = data_dir.join(KEY_FILE);
    match std::fs::read_to_string(&path) {
        Ok(s) => {
            restrict(&path)?; // re-tighten if someone loosened it
            Ok(from_hex(&s))
        }
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(None),
        Err(e) => Err(e),
    }
}

/// Created owner-only from the first byte (no window where it's world-readable).
fn write_file_key(data_dir: &Path, k: &[u8; 32]) -> std::io::Result<()> {
    use std::io::Write;
    let path = data_dir.join(KEY_FILE);
    let mut opts = std::fs::OpenOptions::new();
    opts.write(true).create_new(true);
    #[cfg(unix)]
    {
        use std::os::unix::fs::OpenOptionsExt;
        opts.mode(0o600);
    }
    let mut f = opts.open(&path)?;
    f.write_all(to_hex(k).as_bytes())?;
    f.sync_all()
}

/// Owner-only permissions on unix (no-op elsewhere; Windows app data is per-user already).
pub fn restrict(path: &Path) -> std::io::Result<()> {
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let want = if path.is_dir() { 0o700 } else { 0o600 };
        let cur = std::fs::metadata(path)?.permissions().mode() & 0o777;
        if cur != want {
            std::fs::set_permissions(path, std::fs::Permissions::from_mode(want))?;
        }
    }
    let _ = path;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn hex_round_trip_and_rejects_junk() {
        let k = new_key();
        assert_eq!(from_hex(&to_hex(&k)), Some(k));
        assert_eq!(from_hex("zz"), None);
        assert_eq!(from_hex(&"g".repeat(64)), None);
    }

    #[test]
    fn keys_are_random() {
        assert_ne!(new_key(), new_key());
    }

    #[test]
    fn file_key_is_private_from_creation_and_never_overwritten() {
        let dir = tempfile::tempdir().unwrap();
        let k = new_key();
        write_file_key(dir.path(), &k).unwrap();
        assert_eq!(read_file_key(dir.path()).unwrap(), Some(k));
        // create_new: a second write must fail instead of replacing the key.
        assert!(write_file_key(dir.path(), &new_key()).is_err());
        assert_eq!(read_file_key(dir.path()).unwrap(), Some(k));
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            let p = dir.path().join(KEY_FILE);
            assert_eq!(std::fs::metadata(&p).unwrap().permissions().mode() & 0o777, 0o600);
            std::fs::set_permissions(&p, std::fs::Permissions::from_mode(0o644)).unwrap();
            read_file_key(dir.path()).unwrap();
            assert_eq!(std::fs::metadata(&p).unwrap().permissions().mode() & 0o777, 0o600, "loosened perms are re-tightened");
        }
    }

    #[test]
    fn an_existing_fallback_key_is_kept_across_launches() {
        // Without a reachable keychain (true in CI/sandboxes) the same key must come back every time.
        let dir = tempfile::tempdir().unwrap();
        let k = new_key();
        write_file_key(dir.path(), &k).unwrap();
        let (got, _) = load_or_create(dir.path()).unwrap();
        assert_eq!(got, k);
    }
}
