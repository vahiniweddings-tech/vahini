-- VAHINI WEDDINGS production D1 schema. Apply to the CLIENT'S D1 database.
CREATE TABLE IF NOT EXISTS media (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  category TEXT NOT NULL CHECK (category IN ('general','film','indoor')),
  kind TEXT NOT NULL CHECK (kind IN ('image','video')),
  mime TEXT NOT NULL,
  byte_size INTEGER NOT NULL,
  object_key TEXT NOT NULL UNIQUE,
  poster_key TEXT,
  upload_id TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','published')),
  is_hero INTEGER NOT NULL DEFAULT 0,
  sort_order INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS media_visibility ON media(status, category, sort_order DESC);
CREATE INDEX IF NOT EXISTS media_order ON media(status, sort_order DESC);
CREATE TABLE IF NOT EXISTS login_attempts (
  ip_hash TEXT PRIMARY KEY,
  attempts INTEGER NOT NULL DEFAULT 0,
  first_at INTEGER NOT NULL DEFAULT 0
);
