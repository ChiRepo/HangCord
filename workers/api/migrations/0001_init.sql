-- HangCord D1 schema v1 (ACCESS_AND_SETTINGS §13, MASTER_PLAN §7.1, §8.5). cp-002.
-- Access data (hangouts, roles, members, rooms, overrides) always lives in D1 and fails closed.
-- Every write goes through src/store.ts, which appends the change to `journal` in the SAME batch
-- (write-ahead CSV journal, Layer 1). The storage-router seals journal rows into encrypted CSV chunks.

CREATE TABLE users (
  id            TEXT PRIMARY KEY,          -- Firebase uid
  display_name  TEXT NOT NULL,
  email         TEXT,
  avatar_url    TEXT,
  provider      TEXT NOT NULL,             -- google.com | password
  created_at    INTEGER NOT NULL,
  updated_at    INTEGER NOT NULL
);

CREATE TABLE user_prefs (
  user_id    TEXT PRIMARY KEY,
  version    INTEGER NOT NULL,
  prefs_json TEXT NOT NULL,                -- { key: { value, updatedAt } } incl. tombstones
  updated_at INTEGER NOT NULL
);

CREATE TABLE hangouts (
  id                 TEXT PRIMARY KEY,
  owner_id           TEXT NOT NULL,
  name               TEXT NOT NULL,
  icon               TEXT,
  settings_json      TEXT NOT NULL DEFAULT '{}',
  verification_level INTEGER NOT NULL DEFAULT 0,
  policy_flags       INTEGER NOT NULL DEFAULT 0,
  version            INTEGER NOT NULL DEFAULT 1,  -- snapshot version (ETag "h:<id>:<version>")
  perm_version       INTEGER NOT NULL DEFAULT 1,  -- bumps on any access change
  created_at         INTEGER NOT NULL,
  deleted_at         INTEGER
);

CREATE TABLE roles (
  id          TEXT PRIMARY KEY,             -- @everyone: id = hangout id
  hangout_id  TEXT NOT NULL,
  name        TEXT NOT NULL,
  color       TEXT,
  position    INTEGER NOT NULL,
  permissions TEXT NOT NULL                 -- u64 decimal string
);
CREATE INDEX roles_by_hangout ON roles(hangout_id);

CREATE TABLE members (
  hangout_id    TEXT NOT NULL,
  user_id       TEXT NOT NULL,
  nickname      TEXT,
  roles_json    TEXT NOT NULL DEFAULT '[]',
  joined_at     INTEGER NOT NULL,
  timeout_until INTEGER,
  flags         INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (hangout_id, user_id)
);
CREATE INDEX members_by_user ON members(user_id);

CREATE TABLE rooms (
  id                 TEXT PRIMARY KEY,
  hangout_id         TEXT NOT NULL,
  type               TEXT NOT NULL,
  category_id        TEXT,
  position           INTEGER NOT NULL,
  name               TEXT NOT NULL,
  topic              TEXT,
  settings_json      TEXT NOT NULL DEFAULT '{}',  -- categories: { roomDefaults, guidelinesText }
  sync_with_category INTEGER NOT NULL DEFAULT 0,
  created_at         INTEGER NOT NULL
);
CREATE INDEX rooms_by_hangout ON rooms(hangout_id);

CREATE TABLE overrides (
  room_id     TEXT NOT NULL,
  target_type TEXT NOT NULL,                -- role | member
  target_id   TEXT NOT NULL,
  allow       TEXT NOT NULL,
  deny        TEXT NOT NULL,
  PRIMARY KEY (room_id, target_type, target_id)
);

-- Layer 1 write-ahead journal (MASTER_PLAN §8.5). Never edited; truncated only by the storage-router
-- after the rows are sealed into a verified encrypted CSV chunk.
CREATE TABLE journal (
  seq        INTEGER PRIMARY KEY AUTOINCREMENT,
  at         INTEGER NOT NULL,
  db         TEXT NOT NULL,                 -- d1 | firestore
  tbl        TEXT NOT NULL,
  op         TEXT NOT NULL,                 -- insert | update | delete
  pk         TEXT NOT NULL,                 -- JSON
  cols       TEXT NOT NULL                  -- JSON
);
