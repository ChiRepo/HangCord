-- cp-002.1: messages (bodies encrypted with the room data key — never plain text at rest) and the
-- authoritative wrapped hangout keys (ACCESS_AND_SETTINGS §10, §13). The RoomDO is the hot copy;
-- D1 rows are written after the message is already delivered (MASTER_PLAN §8.2 step 1), journaled.
CREATE TABLE messages (
  id         TEXT PRIMARY KEY,
  hangout_id TEXT NOT NULL,
  room_id    TEXT NOT NULL,
  author_id  TEXT NOT NULL,
  body_enc   TEXT NOT NULL,              -- JSON {v:1,epoch,iv,ct}, AAD = hangoutId|roomId|messageId|epoch
  epoch      INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  edited_at  INTEGER,
  nonce      TEXT NOT NULL,
  seq        INTEGER NOT NULL,
  deleted_at INTEGER
);
CREATE UNIQUE INDEX messages_by_nonce ON messages(room_id, author_id, nonce);
CREATE UNIQUE INDEX messages_by_seq ON messages(room_id, seq);
CREATE INDEX messages_by_room ON messages(room_id, created_at, id);

CREATE TABLE hangout_keys (
  hangout_id  TEXT NOT NULL,
  epoch       INTEGER NOT NULL,
  kek_version INTEGER NOT NULL,
  wrapped_key TEXT NOT NULL,
  iv          TEXT NOT NULL,
  fingerprint TEXT NOT NULL,
  created_at  INTEGER NOT NULL,
  retired_at  INTEGER,
  PRIMARY KEY (hangout_id, epoch)
);
