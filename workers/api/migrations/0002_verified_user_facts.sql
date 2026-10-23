-- Server-owned gate facts. Existing users fail closed until a verified sign-in refreshes them.
-- Adult confirmation has no write endpoint in cp-002; never infer it from a client preference.
ALTER TABLE users ADD COLUMN email_verified INTEGER NOT NULL DEFAULT 0 CHECK (email_verified IN (0, 1));
ALTER TABLE users ADD COLUMN adult_confirmed INTEGER NOT NULL DEFAULT 0 CHECK (adult_confirmed IN (0, 1));
