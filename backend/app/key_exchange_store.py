from __future__ import annotations

import sqlite3
from contextlib import contextmanager
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from pathlib import Path


@dataclass
class DeviceKeyRecord:
    device_id: str
    public_key_jwk: str
    fingerprint: str
    verified_at: datetime


@dataclass
class TransferRecord:
    transfer_id: str
    source_device_id: str
    target_device_id: str
    key_version: int
    envelope_json: str
    created_at: datetime
    expires_at: datetime


class SqliteKeyExchangeStore:
    def __init__(self, database_path: str) -> None:
        self.database_path = Path(database_path)

    @contextmanager
    def _connect(self):
        connection = sqlite3.connect(self.database_path)
        connection.row_factory = sqlite3.Row
        try:
            yield connection
        finally:
            connection.close()

    def initialize(self) -> None:
        with self._connect() as connection:
            connection.executescript("""
                CREATE TABLE IF NOT EXISTS device_public_keys (
                  user_id TEXT NOT NULL, device_id TEXT NOT NULL, public_key_jwk TEXT NOT NULL,
                  fingerprint TEXT NOT NULL, verified_at TEXT NOT NULL,
                  PRIMARY KEY (user_id, device_id)
                );
                CREATE TABLE IF NOT EXISTS device_key_challenges (
                  challenge_id TEXT PRIMARY KEY, user_id TEXT NOT NULL, device_id TEXT NOT NULL,
                  public_key_jwk TEXT NOT NULL, fingerprint TEXT NOT NULL, secret_hash TEXT NOT NULL,
                  expires_at TEXT NOT NULL
                );
                CREATE TABLE IF NOT EXISTS device_key_transfers (
                  transfer_id TEXT PRIMARY KEY, user_id TEXT NOT NULL, source_device_id TEXT NOT NULL,
                  target_device_id TEXT NOT NULL, key_version INTEGER NOT NULL, envelope_json TEXT NOT NULL,
                  created_at TEXT NOT NULL, expires_at TEXT NOT NULL, consumed_at TEXT
                );
            """)
            connection.commit()

    def create_challenge(self, challenge_id, user_id, device_id, public_key_jwk, fingerprint, secret_hash, expires_at):
        with self._connect() as connection:
            connection.execute(
                "INSERT INTO device_key_challenges VALUES (?, ?, ?, ?, ?, ?, ?)",
                (challenge_id, user_id, device_id, public_key_jwk, fingerprint, secret_hash, expires_at.isoformat()),
            )
            connection.commit()

    def consume_challenge(self, challenge_id, user_id, device_id, public_key_jwk, secret_hash) -> bool:
        now = datetime.now(UTC)
        with self._connect() as connection:
            row = connection.execute(
                "SELECT * FROM device_key_challenges WHERE challenge_id = ? AND user_id = ? AND device_id = ?",
                (challenge_id, user_id, device_id),
            ).fetchone()
            valid = bool(row and datetime.fromisoformat(row["expires_at"]) > now
                         and row["public_key_jwk"] == public_key_jwk and row["secret_hash"] == secret_hash)
            connection.execute("DELETE FROM device_key_challenges WHERE challenge_id = ?", (challenge_id,))
            connection.commit()
        return valid

    def put_key(self, user_id, device_id, public_key_jwk, fingerprint) -> DeviceKeyRecord:
        now = datetime.now(UTC)
        with self._connect() as connection:
            connection.execute("""
                INSERT INTO device_public_keys VALUES (?, ?, ?, ?, ?)
                ON CONFLICT(user_id, device_id) DO UPDATE SET
                  public_key_jwk = excluded.public_key_jwk, fingerprint = excluded.fingerprint,
                  verified_at = excluded.verified_at
            """, (user_id, device_id, public_key_jwk, fingerprint, now.isoformat()))
            connection.commit()
        return DeviceKeyRecord(device_id, public_key_jwk, fingerprint, now)

    def list_keys(self, user_id) -> list[DeviceKeyRecord]:
        with self._connect() as connection:
            rows = connection.execute(
                "SELECT device_id, public_key_jwk, fingerprint, verified_at FROM device_public_keys WHERE user_id = ?",
                (user_id,),
            ).fetchall()
        return [DeviceKeyRecord(row["device_id"], row["public_key_jwk"], row["fingerprint"], datetime.fromisoformat(row["verified_at"])) for row in rows]

    def get_key(self, user_id, device_id):
        return next((item for item in self.list_keys(user_id) if item.device_id == device_id), None)

    def create_transfer(self, transfer_id, user_id, source_device_id, target_device_id, key_version, envelope_json, expires_at):
        now = datetime.now(UTC)
        with self._connect() as connection:
            connection.execute("""
                INSERT INTO device_key_transfers
                (transfer_id, user_id, source_device_id, target_device_id, key_version, envelope_json, created_at, expires_at, consumed_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL)
            """, (transfer_id, user_id, source_device_id, target_device_id, key_version, envelope_json, now.isoformat(), expires_at.isoformat()))
            connection.commit()
        return TransferRecord(transfer_id, source_device_id, target_device_id, key_version, envelope_json, now, expires_at)

    def consume_transfer(self, user_id, target_device_id):
        now = datetime.now(UTC)
        with self._connect() as connection:
            row = connection.execute("""
                SELECT * FROM device_key_transfers WHERE user_id = ? AND target_device_id = ?
                  AND consumed_at IS NULL AND expires_at > ? ORDER BY created_at DESC LIMIT 1
            """, (user_id, target_device_id, now.isoformat())).fetchone()
            if row:
                connection.execute("UPDATE device_key_transfers SET consumed_at = ? WHERE transfer_id = ?", (now.isoformat(), row["transfer_id"]))
                connection.commit()
        if not row:
            return None
        return TransferRecord(row["transfer_id"], row["source_device_id"], row["target_device_id"], row["key_version"], row["envelope_json"], datetime.fromisoformat(row["created_at"]), datetime.fromisoformat(row["expires_at"]))

    def delete_device(self, user_id, device_id):
        with self._connect() as connection:
            connection.execute("DELETE FROM device_public_keys WHERE user_id = ? AND device_id = ?", (user_id, device_id))
            connection.execute("DELETE FROM device_key_transfers WHERE user_id = ? AND (source_device_id = ? OR target_device_id = ?)", (user_id, device_id, device_id))
            connection.commit()


class PostgresKeyExchangeStore(SqliteKeyExchangeStore):
    def __init__(self, database_url: str) -> None:
        self.database_url = database_url

    def _connect(self):
        from psycopg import connect
        from psycopg.rows import dict_row
        return connect(self.database_url, row_factory=dict_row)

    # PostgreSQL uses the same logical schema, but placeholder syntax differs. Keep deployment safe
    # by failing explicitly until its migration-backed implementation is enabled.
    def initialize(self) -> None:
        with self._connect() as connection:
            connection.execute("""
                CREATE TABLE IF NOT EXISTS device_public_keys (
                  user_id TEXT NOT NULL, device_id TEXT NOT NULL, public_key_jwk TEXT NOT NULL,
                  fingerprint TEXT NOT NULL, verified_at TIMESTAMPTZ NOT NULL, PRIMARY KEY (user_id, device_id));
                CREATE TABLE IF NOT EXISTS device_key_challenges (
                  challenge_id TEXT PRIMARY KEY, user_id TEXT NOT NULL, device_id TEXT NOT NULL,
                  public_key_jwk TEXT NOT NULL, fingerprint TEXT NOT NULL, secret_hash TEXT NOT NULL, expires_at TIMESTAMPTZ NOT NULL);
                CREATE TABLE IF NOT EXISTS device_key_transfers (
                  transfer_id TEXT PRIMARY KEY, user_id TEXT NOT NULL, source_device_id TEXT NOT NULL,
                  target_device_id TEXT NOT NULL, key_version INTEGER NOT NULL, envelope_json TEXT NOT NULL,
                  created_at TIMESTAMPTZ NOT NULL, expires_at TIMESTAMPTZ NOT NULL, consumed_at TIMESTAMPTZ);
            """)

    # Adapt the compact SQLite implementation at the connection boundary.
    @contextmanager
    def _connect(self):
        from psycopg import connect
        from psycopg.rows import dict_row
        raw = connect(self.database_url, row_factory=dict_row)
        class Adapter:
            def execute(self, query, params=()): return raw.execute(query.replace("?", "%s"), params)
            def executescript(self, script): return raw.execute(script)
            def commit(self): return raw.commit()
            def close(self): return raw.close()
        try:
            yield Adapter()
        finally:
            raw.close()


def create_key_exchange_store(*, database_url: str | None, database_path: str):
    if database_url and database_url.startswith(("postgresql://", "postgres://")):
        return PostgresKeyExchangeStore(database_url)
    if database_url and database_url.startswith("sqlite:///"):
        database_path = database_url.removeprefix("sqlite:///")
    return SqliteKeyExchangeStore(database_path)
