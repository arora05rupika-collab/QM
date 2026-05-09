"""
SQLite database — stores connectors, migrations, logs.
Zero setup required. File lives on Desktop automatically.
"""
import sqlite3, os, json
from datetime import datetime

_default_db = os.path.join(os.path.expanduser("~"), "Desktop", "migrateai.db")
DB_PATH = os.getenv("DB_PATH", _default_db)


def get_conn():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    return conn


def init():
    conn = get_conn()
    conn.executescript("""
    CREATE TABLE IF NOT EXISTS connectors (
        id          TEXT PRIMARY KEY,
        name        TEXT NOT NULL,
        type        TEXT NOT NULL,
        config      TEXT NOT NULL,       -- JSON, credentials stored here
        schema_json TEXT,                -- cached schema
        tested_ok   INTEGER DEFAULT 0,
        created_at  TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS migrations (
        id              TEXT PRIMARY KEY,
        name            TEXT NOT NULL,
        source_id       TEXT NOT NULL,
        target_id       TEXT NOT NULL,
        entities        TEXT,            -- JSON list of {source_entity, target_entity}
        field_mapping   TEXT,            -- JSON [{source_field,target_field,transform,confidence}]
        status          TEXT DEFAULT 'draft',  -- draft|ready|running|done|failed
        config          TEXT,            -- JSON {batch_size, mode, dry_run}
        total_records   INTEGER DEFAULT 0,
        done_records    INTEGER DEFAULT 0,
        fail_records    INTEGER DEFAULT 0,
        created_at      TEXT DEFAULT (datetime('now')),
        started_at      TEXT,
        finished_at     TEXT
    );

    CREATE TABLE IF NOT EXISTS logs (
        id           INTEGER PRIMARY KEY AUTOINCREMENT,
        migration_id TEXT NOT NULL,
        level        TEXT DEFAULT 'info',  -- info|warn|error
        message      TEXT NOT NULL,
        ts           TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS mapping_feedback (
        id              INTEGER PRIMARY KEY AUTOINCREMENT,
        source_field    TEXT NOT NULL,
        target_field    TEXT NOT NULL,
        source_context  TEXT,   -- JSON: {entity, data_type, sample}
        target_context  TEXT,   -- JSON: {entity, data_type, sample}
        confirmed       INTEGER NOT NULL,  -- 1=match, 0=not a match
        migration_id    TEXT,
        ts              TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS model_state (
        key   TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at TEXT DEFAULT (datetime('now'))
    );
    """)
    conn.commit()
    conn.close()


# ── Helpers ───────────────────────────────────────────────────────────────────

def row_to_dict(row):
    return dict(row) if row else None

def rows_to_list(rows):
    return [dict(r) for r in rows]

def now():
    return datetime.utcnow().isoformat()

def log(migration_id: str, message: str, level: str = "info"):
    conn = get_conn()
    conn.execute("INSERT INTO logs (migration_id,level,message) VALUES (?,?,?)",
                 (migration_id, level, message))
    conn.commit()
    conn.close()
