CREATE TABLE results (
  date TEXT NOT NULL,          -- player's local date, YYYY-MM-DD
  player_id TEXT NOT NULL,     -- anonymous UUID from localStorage
  name TEXT NOT NULL,          -- display name at submit time, '' if none
  won INTEGER NOT NULL,        -- 0 or 1, client-reported (D29)
  fainted INTEGER NOT NULL,    -- player Pokemon fainted, client-reported
  turns INTEGER NOT NULL,      -- client-reported
  log TEXT NOT NULL,           -- JSON {"seed":"...","lead":n,"choices":[...]} as submitted, for later verification
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (date, player_id)
);
