//! Encrypted local cache (MASTER_PLAN §7.1, Ground 0). Backs `packages/cache`'s `CacheStore` on
//! desktop. Every value is sealed with AES-256-GCM using a per-device key from the OS keychain;
//! the key name is bound as AAD so rows can't be swapped. Nothing secret is ever stored here —
//! the cache only makes the UI instant; the server decides access.

use aes_gcm::aead::{Aead, AeadCore, KeyInit, OsRng, Payload};
use aes_gcm::{Aes256Gcm, Key, Nonce};
use rusqlite::{params, Connection, OptionalExtension};
use std::path::Path;
use std::sync::Mutex;

pub const MAX_VALUE_BYTES: usize = 2 * 1024 * 1024;
pub const MAX_KEY_LEN: usize = 200;
/// Whole-cache cap. LRU keeps hangouts far below this; it stops runaway growth from any key.
pub const MAX_DB_BYTES: i64 = 64 * 1024 * 1024;

#[derive(Debug, thiserror::Error, PartialEq)]
pub enum CacheError {
    #[error("bad_key")]
    BadKey,
    #[error("too_large")]
    TooLarge,
    #[error("storage")]
    Storage,
    #[error("corrupt")]
    Corrupt,
    #[error("full")]
    Full,
}

impl From<rusqlite::Error> for CacheError {
    fn from(_: rusqlite::Error) -> Self {
        CacheError::Storage
    }
}

/// Keys look like `prefs`, `hangout:night-owls`, `lru:hangouts` — nothing else is accepted.
pub fn valid_key(key: &str) -> bool {
    !key.is_empty()
        && key.len() <= MAX_KEY_LEN
        && key.bytes().all(|b| b.is_ascii_lowercase() || b.is_ascii_digit() || b":_.-".contains(&b))
}

fn valid_prefix(prefix: &str) -> bool {
    prefix.is_empty() || valid_key(prefix)
}

pub struct EncryptedStore {
    conn: Mutex<Connection>,
    cipher: Aes256Gcm,
}

impl EncryptedStore {
    pub fn open(path: &Path, key: &[u8; 32]) -> Result<Self, CacheError> {
        // Create the file owner-only before SQLite opens it; SQLite gives -wal/-shm the same mode.
        #[cfg(unix)]
        {
            use std::os::unix::fs::OpenOptionsExt;
            let _ = std::fs::OpenOptions::new().write(true).create(true).truncate(false).mode(0o600).open(path);
        }
        let conn = Connection::open(path)?;
        Self::init(conn, key)
    }

    pub fn open_in_memory(key: &[u8; 32]) -> Result<Self, CacheError> {
        Self::init(Connection::open_in_memory()?, key)
    }

    fn init(conn: Connection, key: &[u8; 32]) -> Result<Self, CacheError> {
        conn.execute_batch(
            "PRAGMA journal_mode=WAL;
             PRAGMA synchronous=NORMAL;
             CREATE TABLE IF NOT EXISTS kv (k TEXT PRIMARY KEY, n BLOB NOT NULL, v BLOB NOT NULL, t INTEGER NOT NULL);",
        )?;
        let cipher = Aes256Gcm::new(Key::<Aes256Gcm>::from_slice(key));
        Ok(Self { conn: Mutex::new(conn), cipher })
    }

    fn lock(&self) -> Result<std::sync::MutexGuard<'_, Connection>, CacheError> {
        self.conn.lock().map_err(|_| CacheError::Storage)
    }

    pub fn put(&self, key: &str, value: &str) -> Result<(), CacheError> {
        if !valid_key(key) {
            return Err(CacheError::BadKey);
        }
        if value.len() > MAX_VALUE_BYTES {
            return Err(CacheError::TooLarge);
        }
        {
            let conn = self.lock()?;
            let used: i64 = conn.query_row("SELECT page_count * page_size FROM pragma_page_count(), pragma_page_size()", [], |r| r.get(0))?;
            let existing: i64 = conn.query_row("SELECT COALESCE(SUM(length(v)), 0) FROM kv WHERE k = ?1", params![key], |r| r.get(0))?;
            if used - existing + value.len() as i64 > MAX_DB_BYTES {
                return Err(CacheError::Full);
            }
        }
        let nonce = Aes256Gcm::generate_nonce(&mut OsRng);
        let sealed = self
            .cipher
            .encrypt(&nonce, Payload { msg: value.as_bytes(), aad: key.as_bytes() })
            .map_err(|_| CacheError::Storage)?;
        let now = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.as_millis() as i64).unwrap_or(0);
        self.lock()?.execute(
            "INSERT INTO kv (k, n, v, t) VALUES (?1, ?2, ?3, ?4)
             ON CONFLICT(k) DO UPDATE SET n = excluded.n, v = excluded.v, t = excluded.t",
            params![key, nonce.as_slice(), sealed, now],
        )?;
        Ok(())
    }

    /// A row that fails to decrypt (tampered, or written with another key) is deleted and reported
    /// as `Corrupt`; the caller simply re-fetches from the server.
    pub fn get(&self, key: &str) -> Result<Option<String>, CacheError> {
        if !valid_key(key) {
            return Err(CacheError::BadKey);
        }
        let row: Option<(Vec<u8>, Vec<u8>)> = self
            .lock()?
            .query_row("SELECT n, v FROM kv WHERE k = ?1", params![key], |r| Ok((r.get(0)?, r.get(1)?)))
            .optional()?;
        let Some((n, v)) = row else { return Ok(None) };
        if n.len() != 12 {
            self.delete(key)?;
            return Err(CacheError::Corrupt);
        }
        match self.cipher.decrypt(Nonce::from_slice(&n), Payload { msg: &v, aad: key.as_bytes() }) {
            Ok(plain) => String::from_utf8(plain).map(Some).map_err(|_| CacheError::Corrupt),
            Err(_) => {
                self.delete(key)?;
                Err(CacheError::Corrupt)
            }
        }
    }

    pub fn delete(&self, key: &str) -> Result<(), CacheError> {
        if !valid_key(key) {
            return Err(CacheError::BadKey);
        }
        self.lock()?.execute("DELETE FROM kv WHERE k = ?1", params![key])?;
        Ok(())
    }

    pub fn keys(&self, prefix: &str) -> Result<Vec<String>, CacheError> {
        if !valid_prefix(prefix) {
            return Err(CacheError::BadKey);
        }
        let conn = self.lock()?;
        let mut stmt = conn.prepare("SELECT k FROM kv WHERE substr(k, 1, length(?1)) = ?1 ORDER BY k")?;
        let rows = stmt.query_map(params![prefix], |r| r.get::<_, String>(0))?;
        Ok(rows.filter_map(Result::ok).collect())
    }

    /// Sign-out: wipe everything on this device, including old pages in the WAL and free list.
    pub fn wipe(&self) -> Result<(), CacheError> {
        let conn = self.lock()?;
        conn.execute("DELETE FROM kv", [])?;
        conn.execute_batch("PRAGMA wal_checkpoint(TRUNCATE); VACUUM; PRAGMA wal_checkpoint(TRUNCATE);")?;
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const K1: [u8; 32] = [7u8; 32];
    const K2: [u8; 32] = [9u8; 32];

    #[test]
    fn round_trip_and_prefix_listing() {
        let s = EncryptedStore::open_in_memory(&K1).unwrap();
        s.put("hangout:night-owls", r#"{"version":12}"#).unwrap();
        s.put("hangout:pixel-club", "{}").unwrap();
        s.put("prefs", r#"{"version":4}"#).unwrap();
        assert_eq!(s.get("hangout:night-owls").unwrap().as_deref(), Some(r#"{"version":12}"#));
        assert_eq!(s.keys("hangout:").unwrap(), vec!["hangout:night-owls", "hangout:pixel-club"]);
        assert_eq!(s.keys("").unwrap().len(), 3);
        s.delete("prefs").unwrap();
        assert_eq!(s.get("prefs").unwrap(), None);
        s.wipe().unwrap();
        assert!(s.keys("").unwrap().is_empty());
    }

    #[test]
    fn persists_across_restart_and_is_encrypted_on_disk() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("cache.sqlite3");
        {
            let s = EncryptedStore::open(&path, &K1).unwrap();
            s.put("hangout:night-owls", r#"{"name":"Night Owls secret-marker"}"#).unwrap();
        }
        let s = EncryptedStore::open(&path, &K1).unwrap();
        assert_eq!(s.get("hangout:night-owls").unwrap().unwrap(), r#"{"name":"Night Owls secret-marker"}"#);
        drop(s);
        let mut raw = std::fs::read(&path).unwrap();
        if let Ok(wal) = std::fs::read(dir.path().join("cache.sqlite3-wal")) {
            raw.extend(wal);
        }
        let hay = String::from_utf8_lossy(&raw);
        assert!(!hay.contains("secret-marker"), "plaintext found on disk");
        assert!(!hay.contains("Night Owls"), "plaintext found on disk");
    }

    #[test]
    fn wrong_device_key_or_tampering_is_detected_and_self_heals() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("cache.sqlite3");
        EncryptedStore::open(&path, &K1).unwrap().put("prefs", "{}").unwrap();
        let other = EncryptedStore::open(&path, &K2).unwrap();
        assert_eq!(other.get("prefs"), Err(CacheError::Corrupt));
        assert_eq!(other.get("prefs"), Ok(None), "corrupt row is removed");
    }

    #[test]
    fn rows_cannot_be_swapped_between_keys() {
        let s = EncryptedStore::open_in_memory(&K1).unwrap();
        s.put("hangout:a", "A").unwrap();
        s.put("hangout:b", "B").unwrap();
        {
            let c = s.lock().unwrap();
            c.execute_batch("UPDATE kv SET (n, v) = (SELECT n, v FROM kv WHERE k = 'hangout:a') WHERE k = 'hangout:b';").unwrap();
        }
        assert_eq!(s.get("hangout:b"), Err(CacheError::Corrupt));
    }

    #[test]
    fn rejects_bad_keys_and_huge_values() {
        let s = EncryptedStore::open_in_memory(&K1).unwrap();
        for bad in ["", "../etc/passwd", "Prefs", "a b", "x'; DROP TABLE kv; --", &"k".repeat(201)] {
            assert_eq!(s.put(bad, "{}"), Err(CacheError::BadKey), "{bad}");
        }
        assert_eq!(s.keys("../"), Err(CacheError::BadKey));
        assert_eq!(s.put("prefs", &"x".repeat(MAX_VALUE_BYTES + 1)), Err(CacheError::TooLarge));
    }

    #[test]
    fn wipe_leaves_no_ciphertext_behind() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("cache.sqlite3");
        let s = EncryptedStore::open(&path, &K1).unwrap();
        for i in 0..50 {
            s.put(&format!("hangout:h{i}"), &"x".repeat(4000)).unwrap();
        }
        let before = std::fs::metadata(&path).unwrap().len() + std::fs::metadata(dir.path().join("cache.sqlite3-wal")).map(|m| m.len()).unwrap_or(0);
        s.wipe().unwrap();
        let after = std::fs::metadata(&path).unwrap().len() + std::fs::metadata(dir.path().join("cache.sqlite3-wal")).map(|m| m.len()).unwrap_or(0);
        assert!(after < before / 4, "old pages kept: {before} -> {after}");
    }

    #[test]
    fn db_file_is_owner_only() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("cache.sqlite3");
        EncryptedStore::open(&path, &K1).unwrap().put("prefs", "{}").unwrap();
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            assert_eq!(std::fs::metadata(&path).unwrap().permissions().mode() & 0o077, 0, "group/other can read the cache");
        }
    }

    #[test]
    fn each_write_uses_a_fresh_nonce() {
        let s = EncryptedStore::open_in_memory(&K1).unwrap();
        s.put("prefs", "same").unwrap();
        let n1: Vec<u8> = s.lock().unwrap().query_row("SELECT n FROM kv", [], |r| r.get(0)).unwrap();
        s.put("prefs", "same").unwrap();
        let n2: Vec<u8> = s.lock().unwrap().query_row("SELECT n FROM kv", [], |r| r.get(0)).unwrap();
        assert_ne!(n1, n2);
    }
}
