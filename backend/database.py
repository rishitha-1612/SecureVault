"""
database.py
-----------
SQLite database layer for SecureVault (production upgrade).
Tables:
  - users                  : credentials, face encoding, active status
  - login_attempts         : every auth event with full location JSON & image
  - otp_tokens             : time-limited OTP codes
  - password_reset_tokens  : secure password reset tokens (UUID + expiry)
  - vault_files            : metadata for per-user file vault
  - failed_attempts        : per-user attempt counter + lockout timestamp
"""

import json
import logging
import sqlite3
from datetime import datetime, timedelta
from pathlib import Path

DB_PATH = Path(__file__).parent / "secure_vault.db"
logger  = logging.getLogger(__name__)


# ── Connection ────────────────────────────────────────────────────────────────

def get_connection() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA foreign_keys=ON")
    return conn


# ── Schema ────────────────────────────────────────────────────────────────────

def initialize_db() -> None:
    with get_connection() as conn:
        conn.executescript("""
            CREATE TABLE IF NOT EXISTS users (
                id              INTEGER PRIMARY KEY AUTOINCREMENT,
                username        TEXT    NOT NULL UNIQUE,
                email           TEXT    NOT NULL UNIQUE,
                password_hash   TEXT    NOT NULL,
                face_encoding   TEXT,
                is_active       INTEGER NOT NULL DEFAULT 1,
                created_at      TEXT    NOT NULL DEFAULT (datetime('now'))
            );

            CREATE TABLE IF NOT EXISTS login_attempts (
                id           INTEGER PRIMARY KEY AUTOINCREMENT,
                username     TEXT    NOT NULL,
                status       TEXT    NOT NULL,
                stage        TEXT,
                location     TEXT,
                location_json TEXT,
                image_path   TEXT,
                attempt_no   INTEGER,
                ip_address   TEXT,
                user_agent   TEXT,
                created_at   TEXT    NOT NULL DEFAULT (datetime('now'))
            );

            CREATE TABLE IF NOT EXISTS otp_tokens (
                id         INTEGER PRIMARY KEY AUTOINCREMENT,
                username   TEXT NOT NULL,
                token      TEXT NOT NULL,
                expires_at TEXT NOT NULL,
                used       INTEGER NOT NULL DEFAULT 0
            );

            CREATE TABLE IF NOT EXISTS password_reset_tokens (
                id         INTEGER PRIMARY KEY AUTOINCREMENT,
                username   TEXT NOT NULL,
                token      TEXT NOT NULL UNIQUE,
                expires_at TEXT NOT NULL,
                used       INTEGER NOT NULL DEFAULT 0,
                created_at TEXT NOT NULL DEFAULT (datetime('now'))
            );

            CREATE TABLE IF NOT EXISTS vault_files (
                id            INTEGER PRIMARY KEY AUTOINCREMENT,
                username      TEXT    NOT NULL,
                stored_name   TEXT    NOT NULL,
                original_name TEXT    NOT NULL,
                file_type     TEXT    NOT NULL DEFAULT 'other',
                mime_type     TEXT,
                file_size     INTEGER NOT NULL DEFAULT 0,
                created_at    TEXT    NOT NULL DEFAULT (datetime('now'))
            );

            CREATE TABLE IF NOT EXISTS failed_attempts (
                username      TEXT    PRIMARY KEY,
                count         INTEGER NOT NULL DEFAULT 0,
                locked_until  TEXT,
                last_attempt  TEXT    NOT NULL DEFAULT (datetime('now'))
            );
        """)

        # --- MIGRATION: add location_json column if it doesn't exist yet ---
        cols = [r[1] for r in conn.execute("PRAGMA table_info(login_attempts)").fetchall()]
        if "location_json" not in cols:
            conn.execute("ALTER TABLE login_attempts ADD COLUMN location_json TEXT")

    logger.info("Database initialised at %s", DB_PATH)


# ── Users ─────────────────────────────────────────────────────────────────────

def create_user(username: str, email: str, password_hash: str,
                face_encoding: list | None = None) -> bool:
    enc_json = json.dumps(face_encoding) if face_encoding else None
    try:
        with get_connection() as conn:
            conn.execute(
                "INSERT INTO users (username, email, password_hash, face_encoding) "
                "VALUES (?, ?, ?, ?)",
                (username.strip().lower(), email.strip().lower(), password_hash, enc_json)
            )
        return True
    except sqlite3.IntegrityError as exc:
        logger.warning("Registration failed for '%s': %s", username, exc)
        return False


def get_user(username: str) -> sqlite3.Row | None:
    with get_connection() as conn:
        return conn.execute(
            "SELECT * FROM users WHERE username = ? AND is_active = 1",
            (username.strip().lower(),)
        ).fetchone()


def get_user_by_email(email: str) -> sqlite3.Row | None:
    with get_connection() as conn:
        return conn.execute(
            "SELECT * FROM users WHERE email = ? AND is_active = 1",
            (email.strip().lower(),)
        ).fetchone()


def update_password(username: str, new_hash: str) -> None:
    with get_connection() as conn:
        conn.execute(
            "UPDATE users SET password_hash = ? WHERE username = ?",
            (new_hash, username.strip().lower())
        )


def update_face_encoding(username: str, encoding: list) -> None:
    with get_connection() as conn:
        conn.execute(
            "UPDATE users SET face_encoding = ? WHERE username = ?",
            (json.dumps(encoding), username.strip().lower())
        )


# ── Login Attempts ────────────────────────────────────────────────────────────

def log_attempt(username: str, status: str, stage: str = None,
                location: str = None, location_dict: dict = None,
                image_path: str = None, attempt_no: int = None,
                ip_address: str = None, user_agent: str = None) -> None:
    loc_json = json.dumps(location_dict) if location_dict else None
    with get_connection() as conn:
        conn.execute(
            "INSERT INTO login_attempts "
            "(username, status, stage, location, location_json, image_path, attempt_no, ip_address, user_agent) "
            "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
            (username, status, stage, location, loc_json, image_path,
             attempt_no, ip_address, user_agent)
        )


def update_attempt_image(username: str, stage: str, attempt_no: int,
                         image_path: str) -> None:
    if not image_path:
        return
    with get_connection() as conn:
        conn.execute(
            """
            UPDATE login_attempts
               SET image_path = ?
             WHERE id = (
                SELECT id
                  FROM login_attempts
                 WHERE username = ?
                   AND stage = ?
                   AND attempt_no = ?
                 ORDER BY id DESC
                 LIMIT 1
             )
            """,
            (image_path, username, stage, attempt_no)
        )


def get_recent_attempts(username: str, limit: int = 20) -> list:
    with get_connection() as conn:
        rows = conn.execute(
            "SELECT * FROM login_attempts WHERE username = ? "
            "ORDER BY created_at DESC LIMIT ?",
            (username, limit)
        ).fetchall()
    result = []
    for r in rows:
        d = dict(r)
        # Parse location_json so frontend gets rich object
        if d.get("location_json"):
            try:
                d["location_data"] = json.loads(d["location_json"])
            except Exception:
                d["location_data"] = None
        result.append(d)
    return result


def count_recent_failures(username: str, minutes: int = 30) -> int:
    with get_connection() as conn:
        row = conn.execute(
            "SELECT COUNT(*) as cnt FROM login_attempts "
            "WHERE username = ? AND status IN ('fail','intruder') "
            "AND created_at >= datetime('now', ? || ' minutes')",
            (username, f"-{minutes}")
        ).fetchone()
    return row["cnt"] if row else 0


# ── Failed Attempts (Attempt Counter) ────────────────────────────────────────

def get_failed_attempts(username: str) -> int:
    """Return current failed attempt count for a user (0 if no record)."""
    with get_connection() as conn:
        row = conn.execute(
            "SELECT count FROM failed_attempts WHERE username = ?",
            (username.strip().lower(),)
        ).fetchone()
    return row["count"] if row else 0


def increment_failed_attempts(username: str) -> int:
    """Increment failed attempts counter and return the new count."""
    username = username.strip().lower()
    with get_connection() as conn:
        conn.execute(
            """
            INSERT INTO failed_attempts (username, count, last_attempt)
            VALUES (?, 1, datetime('now'))
            ON CONFLICT(username) DO UPDATE SET
                count = count + 1,
                last_attempt = datetime('now')
            """,
            (username,)
        )
        row = conn.execute(
            "SELECT count FROM failed_attempts WHERE username = ?",
            (username,)
        ).fetchone()
    return row["count"] if row else 1


def reset_failed_attempts(username: str) -> None:
    """Reset the failed attempts counter to 0."""
    username = username.strip().lower()
    with get_connection() as conn:
        conn.execute(
            """
            INSERT INTO failed_attempts (username, count, locked_until, last_attempt)
            VALUES (?, 0, NULL, datetime('now'))
            ON CONFLICT(username) DO UPDATE SET
                count = 0,
                locked_until = NULL,
                last_attempt = datetime('now')
            """,
            (username,)
        )


def set_lockout(username: str, seconds: int = 30) -> None:
    """Lock the account for the given number of seconds."""
    username   = username.strip().lower()
    until_str  = (datetime.utcnow() + timedelta(seconds=seconds)).strftime("%Y-%m-%d %H:%M:%S")
    with get_connection() as conn:
        conn.execute(
            """
            INSERT INTO failed_attempts (username, count, locked_until, last_attempt)
            VALUES (?, 0, ?, datetime('now'))
            ON CONFLICT(username) DO UPDATE SET
                locked_until = ?,
                last_attempt = datetime('now')
            """,
            (username, until_str, until_str)
        )


def is_locked_out(username: str) -> bool:
    """Return True if account is currently locked out."""
    with get_connection() as conn:
        row = conn.execute(
            "SELECT locked_until FROM failed_attempts WHERE username = ?",
            (username.strip().lower(),)
        ).fetchone()
    if not row or not row["locked_until"]:
        return False
    try:
        until = datetime.strptime(row["locked_until"], "%Y-%m-%d %H:%M:%S")
        return datetime.utcnow() < until
    except Exception:
        return False


def get_lockout_remaining_seconds(username: str) -> int:
    """Return how many seconds remain in the lockout (0 if not locked)."""
    with get_connection() as conn:
        row = conn.execute(
            "SELECT locked_until FROM failed_attempts WHERE username = ?",
            (username.strip().lower(),)
        ).fetchone()
    if not row or not row["locked_until"]:
        return 0
    try:
        until = datetime.strptime(row["locked_until"], "%Y-%m-%d %H:%M:%S")
        delta = (until - datetime.utcnow()).total_seconds()
        return max(0, int(delta))
    except Exception:
        return 0


# ── OTP ───────────────────────────────────────────────────────────────────────

def store_otp(username: str, token: str, expires_at: str) -> None:
    with get_connection() as conn:
        conn.execute("UPDATE otp_tokens SET used=1 WHERE username=?", (username,))
        conn.execute(
            "INSERT INTO otp_tokens (username, token, expires_at) VALUES (?, ?, ?)",
            (username, token, expires_at)
        )


def verify_otp(username: str, token: str) -> bool:
    with get_connection() as conn:
        row = conn.execute(
            "SELECT * FROM otp_tokens "
            "WHERE username=? AND token=? AND used=0 "
            "AND expires_at >= datetime('now')",
            (username, token)
        ).fetchone()
        if row:
            conn.execute("UPDATE otp_tokens SET used=1 WHERE id=?", (row["id"],))
            return True
    return False


# ── Password Reset ────────────────────────────────────────────────────────────

def store_reset_token(username: str, token: str, expires_at: str) -> None:
    with get_connection() as conn:
        conn.execute(
            "UPDATE password_reset_tokens SET used=1 WHERE username=?", (username,)
        )
        conn.execute(
            "INSERT INTO password_reset_tokens (username, token, expires_at) "
            "VALUES (?, ?, ?)",
            (username, token, expires_at)
        )


def get_reset_token(token: str) -> sqlite3.Row | None:
    with get_connection() as conn:
        return conn.execute(
            "SELECT * FROM password_reset_tokens "
            "WHERE token=? AND used=0 AND expires_at >= datetime('now')",
            (token,)
        ).fetchone()


def mark_reset_token_used(token: str) -> None:
    with get_connection() as conn:
        conn.execute(
            "UPDATE password_reset_tokens SET used=1 WHERE token=?", (token,)
        )


# ── Vault Files ───────────────────────────────────────────────────────────────

def add_vault_file(username: str, stored_name: str, original_name: str,
                   file_type: str, mime_type: str, file_size: int) -> int:
    with get_connection() as conn:
        cur = conn.execute(
            "INSERT INTO vault_files "
            "(username, stored_name, original_name, file_type, mime_type, file_size) "
            "VALUES (?, ?, ?, ?, ?, ?)",
            (username, stored_name, original_name, file_type, mime_type, file_size)
        )
        return cur.lastrowid


def get_vault_files(username: str) -> list[dict]:
    with get_connection() as conn:
        rows = conn.execute(
            "SELECT * FROM vault_files WHERE username = ? ORDER BY created_at DESC",
            (username,)
        ).fetchall()
    return [dict(r) for r in rows]


def get_vault_file(file_id: int, username: str) -> dict | None:
    with get_connection() as conn:
        row = conn.execute(
            "SELECT * FROM vault_files WHERE id = ? AND username = ?",
            (file_id, username)
        ).fetchone()
    return dict(row) if row else None


def delete_vault_file(file_id: int, username: str) -> bool:
    with get_connection() as conn:
        cur = conn.execute(
            "DELETE FROM vault_files WHERE id = ? AND username = ?",
            (file_id, username)
        )
    return cur.rowcount > 0
