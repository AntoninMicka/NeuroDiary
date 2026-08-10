from __future__ import annotations

import hashlib
import hmac
import sqlite3
from contextlib import contextmanager
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from pathlib import Path


def _as_datetime(value) -> datetime:
    return value if isinstance(value, datetime) else datetime.fromisoformat(value)


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
    def __init__(self, database_path: str, audit_retention_days: int = 730, audit_integrity_key: str = "") -> None:
        self.database_path = Path(database_path)
        self.audit_retention_days = max(30, min(audit_retention_days, 3650))
        self.audit_integrity_key = audit_integrity_key.encode()

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
                CREATE TABLE IF NOT EXISTS device_key_requests (
                  request_id TEXT PRIMARY KEY, user_id TEXT NOT NULL, target_device_id TEXT NOT NULL,
                  created_at TEXT NOT NULL, expires_at TEXT NOT NULL, fulfilled_at TEXT
                );
                CREATE TABLE IF NOT EXISTS security_audit_events (
                  event_id TEXT PRIMARY KEY, user_id TEXT NOT NULL, device_id TEXT NOT NULL,
                  event_type TEXT NOT NULL, details_json TEXT NOT NULL, created_at TEXT NOT NULL,
                  previous_hash TEXT, event_hash TEXT
                );
                CREATE TABLE IF NOT EXISTS security_audit_heads (
                  user_id TEXT PRIMARY KEY, event_id TEXT NOT NULL, event_hash TEXT NOT NULL
                );
                CREATE INDEX IF NOT EXISTS idx_security_audit_user_created
                  ON security_audit_events (user_id, created_at DESC, event_id DESC);
                CREATE TABLE IF NOT EXISTS identity_key_migrations (
                  user_id TEXT PRIMARY KEY, enabled INTEGER NOT NULL, created_at TEXT NOT NULL,
                  disabled_at TEXT, disabled_by_device_id TEXT,
                  emergency_registration_open INTEGER NOT NULL DEFAULT 1
                );
            """)
            migration_columns = {row[1] for row in connection.execute("PRAGMA table_info(identity_key_migrations)").fetchall()}
            if "emergency_registration_open" not in migration_columns:
                connection.execute("ALTER TABLE identity_key_migrations ADD COLUMN emergency_registration_open INTEGER NOT NULL DEFAULT 1")
            audit_columns = {row[1] for row in connection.execute("PRAGMA table_info(security_audit_events)").fetchall()}
            if "previous_hash" not in audit_columns:
                connection.execute("ALTER TABLE security_audit_events ADD COLUMN previous_hash TEXT")
            if "event_hash" not in audit_columns:
                connection.execute("ALTER TABLE security_audit_events ADD COLUMN event_hash TEXT")
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
            valid = bool(row and _as_datetime(row["expires_at"]) > now
                         and row["public_key_jwk"] == public_key_jwk and row["secret_hash"] == secret_hash)
            connection.execute("DELETE FROM device_key_challenges WHERE challenge_id = ?", (challenge_id,))
            connection.commit()
        return valid

    def put_key(self, user_id, device_id, public_key_jwk, fingerprint) -> DeviceKeyRecord:
        now = datetime.now(UTC)
        with self._connect() as connection:
            connection.execute("""
                INSERT INTO device_public_keys (user_id, device_id, public_key_jwk, fingerprint, verified_at)
                VALUES (?, ?, ?, ?, ?)
                ON CONFLICT(user_id, device_id) DO UPDATE SET
                  public_key_jwk = excluded.public_key_jwk, fingerprint = excluded.fingerprint,
                  verified_at = excluded.verified_at
            """, (user_id, device_id, public_key_jwk, fingerprint, now.isoformat()))
            connection.commit()
        return DeviceKeyRecord(device_id, public_key_jwk, fingerprint, now)

    def put_key_with_bootstrap(self, user_id, device_id, public_key_jwk, fingerprint):
        """Store a proven key and elect exactly one bootstrap device when no key exists."""
        now = datetime.now(UTC)
        with self._connect() as connection:
            connection.execute("BEGIN IMMEDIATE")
            is_first_key = connection.execute(
                "SELECT 1 FROM device_public_keys WHERE user_id = ? LIMIT 1", (user_id,),
            ).fetchone() is None
            connection.execute("""
                INSERT INTO device_public_keys (user_id, device_id, public_key_jwk, fingerprint, verified_at)
                VALUES (?, ?, ?, ?, ?)
                ON CONFLICT(user_id, device_id) DO UPDATE SET
                  public_key_jwk = excluded.public_key_jwk, fingerprint = excluded.fingerprint,
                  verified_at = excluded.verified_at
            """, (user_id, device_id, public_key_jwk, fingerprint, now.isoformat()))
            connection.commit()
        return DeviceKeyRecord(device_id, public_key_jwk, fingerprint, now), is_first_key

    def list_keys(self, user_id) -> list[DeviceKeyRecord]:
        with self._connect() as connection:
            rows = connection.execute(
                "SELECT device_id, public_key_jwk, fingerprint, verified_at FROM device_public_keys WHERE user_id = ?",
                (user_id,),
            ).fetchall()
        return [DeviceKeyRecord(row["device_id"], row["public_key_jwk"], row["fingerprint"], _as_datetime(row["verified_at"])) for row in rows]

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

    def create_request(self, request_id, user_id, target_device_id, expires_at):
        now = datetime.now(UTC)
        with self._connect() as connection:
            connection.execute("DELETE FROM device_key_requests WHERE user_id = ? AND target_device_id = ? AND fulfilled_at IS NULL", (user_id, target_device_id))
            connection.execute("INSERT INTO device_key_requests VALUES (?, ?, ?, ?, ?, NULL)", (request_id, user_id, target_device_id, now.isoformat(), expires_at.isoformat()))
            connection.commit()
        return {"request_id": request_id, "target_device_id": target_device_id, "created_at": now, "expires_at": expires_at}

    def list_requests(self, user_id, exclude_device_id):
        now = datetime.now(UTC)
        with self._connect() as connection:
            rows = connection.execute("""
                SELECT request_id, target_device_id, created_at, expires_at FROM device_key_requests
                WHERE user_id = ? AND target_device_id <> ? AND fulfilled_at IS NULL AND expires_at > ?
                ORDER BY created_at
            """, (user_id, exclude_device_id, now.isoformat())).fetchall()
        return [dict(row) for row in rows]

    def fulfill_request(self, user_id, request_id, target_device_id) -> bool:
        now = datetime.now(UTC)
        with self._connect() as connection:
            cursor = connection.execute("""
                UPDATE device_key_requests SET fulfilled_at = ? WHERE request_id = ? AND user_id = ?
                  AND target_device_id = ? AND fulfilled_at IS NULL AND expires_at > ?
            """, (now.isoformat(), request_id, user_id, target_device_id, now.isoformat()))
            connection.commit()
            return cursor.rowcount == 1

    def get_transfer(self, user_id, target_device_id):
        now = datetime.now(UTC)
        with self._connect() as connection:
            row = connection.execute("""
                SELECT * FROM device_key_transfers WHERE user_id = ? AND target_device_id = ?
                  AND consumed_at IS NULL AND expires_at > ? ORDER BY created_at DESC LIMIT 1
            """, (user_id, target_device_id, now.isoformat())).fetchone()
        if not row:
            return None
        return TransferRecord(row["transfer_id"], row["source_device_id"], row["target_device_id"], row["key_version"], row["envelope_json"], _as_datetime(row["created_at"]), _as_datetime(row["expires_at"]))

    def confirm_transfer(self, user_id, target_device_id, transfer_id) -> bool:
        now = datetime.now(UTC)
        with self._connect() as connection:
            cursor = connection.execute("""
                UPDATE device_key_transfers SET consumed_at = ? WHERE transfer_id = ? AND user_id = ?
                  AND target_device_id = ? AND consumed_at IS NULL AND expires_at > ?
            """, (now.isoformat(), transfer_id, user_id, target_device_id, now.isoformat()))
            connection.commit()
            return cursor.rowcount == 1

    def delete_device(self, user_id, device_id):
        with self._connect() as connection:
            connection.execute("DELETE FROM device_public_keys WHERE user_id = ? AND device_id = ?", (user_id, device_id))
            connection.execute("DELETE FROM device_key_transfers WHERE user_id = ? AND (source_device_id = ? OR target_device_id = ?)", (user_id, device_id, device_id))
            connection.execute("DELETE FROM device_key_requests WHERE user_id = ? AND target_device_id = ?", (user_id, device_id))
            connection.commit()

    def _lock_audit_writer(self, connection, user_id) -> None:
        connection.execute("BEGIN IMMEDIATE")

    def record_audit(self, event_id, user_id, device_id, event_type, details_json):
        now = datetime.now(UTC)
        retention_cutoff = now - timedelta(days=self.audit_retention_days)
        with self._connect() as connection:
            self._lock_audit_writer(connection, user_id)
            connection.execute("DELETE FROM security_audit_events WHERE user_id = ? AND created_at < ?", (user_id, retention_cutoff.isoformat()))
            head = connection.execute(
                "SELECT event_hash FROM security_audit_heads WHERE user_id = ?", (user_id,),
            ).fetchone()
            previous_hash = head["event_hash"] if head else ""
            created_at = now.isoformat()
            canonical = "\n".join((event_id, user_id, device_id, event_type, details_json, created_at, previous_hash))
            event_hash = hmac.new(self.audit_integrity_key, canonical.encode(), hashlib.sha256).hexdigest()
            connection.execute("""
                INSERT INTO security_audit_events
                  (event_id, user_id, device_id, event_type, details_json, created_at, previous_hash, event_hash)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """, (event_id, user_id, device_id, event_type, details_json, created_at, previous_hash, event_hash))
            connection.execute("""
                INSERT INTO security_audit_heads (user_id, event_id, event_hash) VALUES (?, ?, ?)
                ON CONFLICT(user_id) DO UPDATE SET event_id = excluded.event_id, event_hash = excluded.event_hash
            """, (user_id, event_id, event_hash))
            connection.commit()

    def verify_audit(self, user_id):
        with self._connect() as connection:
            rows = connection.execute("""
                SELECT event_id, user_id, device_id, event_type, details_json, created_at,
                       previous_hash, event_hash
                FROM security_audit_events WHERE user_id = ? AND event_hash IS NOT NULL
                ORDER BY created_at, event_id
            """, (user_id,)).fetchall()
            head = connection.execute(
                "SELECT event_id, event_hash FROM security_audit_heads WHERE user_id = ?", (user_id,),
            ).fetchone()
        previous = rows[0]["previous_hash"] if rows else ""
        for row in rows:
            if row["previous_hash"] != previous:
                return {"status": "failed", "checked": len(rows)}
            canonical = "\n".join((row["event_id"], row["user_id"], row["device_id"], row["event_type"], row["details_json"], _as_datetime(row["created_at"]).isoformat(), row["previous_hash"]))
            expected = hmac.new(self.audit_integrity_key, canonical.encode(), hashlib.sha256).hexdigest()
            if not hmac.compare_digest(expected, row["event_hash"]):
                return {"status": "failed", "checked": len(rows)}
            previous = row["event_hash"]
        if rows and (not head or head["event_id"] != rows[-1]["event_id"] or head["event_hash"] != rows[-1]["event_hash"]):
            return {"status": "failed", "checked": len(rows)}
        return {"status": "verified" if rows else "empty", "checked": len(rows)}

    def list_audit(self, user_id, limit=100, before_event_id=None):
        with self._connect() as connection:
            if before_event_id:
                cursor = connection.execute(
                    "SELECT created_at, event_id FROM security_audit_events WHERE user_id = ? AND event_id = ?",
                    (user_id, before_event_id),
                ).fetchone()
                if cursor is None:
                    return []
                rows = connection.execute("""
                    SELECT event_id, device_id, event_type, details_json, created_at
                    FROM security_audit_events
                    WHERE user_id = ? AND (created_at < ? OR (created_at = ? AND event_id < ?))
                    ORDER BY created_at DESC, event_id DESC LIMIT ?
                """, (user_id, cursor["created_at"], cursor["created_at"], cursor["event_id"], limit)).fetchall()
            else:
                rows = connection.execute("""
                    SELECT event_id, device_id, event_type, details_json, created_at
                    FROM security_audit_events WHERE user_id = ?
                    ORDER BY created_at DESC, event_id DESC LIMIT ?
                """, (user_id, limit)).fetchall()
            return [dict(row) for row in rows]

    def get_migration(self, user_id):
        now = datetime.now(UTC)
        with self._connect() as connection:
            row = connection.execute("SELECT * FROM identity_key_migrations WHERE user_id = ?", (user_id,)).fetchone()
            if row is None:
                connection.execute("INSERT INTO identity_key_migrations (user_id, enabled, created_at, disabled_at, disabled_by_device_id, emergency_registration_open) VALUES (?, 1, ?, NULL, NULL, 1)", (user_id, now.isoformat()))
                connection.commit()
                return {"enabled": True, "created_at": now, "disabled_at": None, "disabled_by_device_id": None}
        return {"enabled": bool(row["emergency_registration_open"]), "created_at": row["created_at"], "disabled_at": row["disabled_at"], "disabled_by_device_id": row["disabled_by_device_id"]}

    def disable_migration(self, user_id, device_id) -> bool:
        self.get_migration(user_id)
        now = datetime.now(UTC)
        with self._connect() as connection:
            cursor = connection.execute("""
                UPDATE identity_key_migrations SET enabled = 0, emergency_registration_open = 0,
                  disabled_at = ?, disabled_by_device_id = ?
                WHERE user_id = ? AND emergency_registration_open = 1
            """, (now.isoformat(), device_id, user_id))
            connection.commit()
            return cursor.rowcount == 1


class PostgresKeyExchangeStore(SqliteKeyExchangeStore):
    def __init__(self, database_url: str, audit_retention_days: int = 730, audit_integrity_key: str = "") -> None:
        self.database_url = database_url
        self.audit_retention_days = max(30, min(audit_retention_days, 3650))
        self.audit_integrity_key = audit_integrity_key.encode()

    def _connect(self):
        from psycopg import connect
        from psycopg.rows import dict_row
        return connect(self.database_url, row_factory=dict_row)

    def _lock_audit_writer(self, connection, user_id) -> None:
        connection.execute("SELECT pg_advisory_xact_lock(hashtext(?))", (user_id,))

    # PostgreSQL uses the same logical schema, but placeholder syntax differs. Keep deployment safe
    # by failing explicitly until its migration-backed implementation is enabled.
    def initialize(self) -> None:
        with self._connect() as connection:
            statements = ["""
                CREATE TABLE IF NOT EXISTS device_public_keys (
                  user_id TEXT NOT NULL, device_id TEXT NOT NULL, public_key_jwk TEXT NOT NULL,
                  fingerprint TEXT NOT NULL, verified_at TIMESTAMPTZ NOT NULL, PRIMARY KEY (user_id, device_id))
            """, """
                CREATE TABLE IF NOT EXISTS device_key_challenges (
                  challenge_id TEXT PRIMARY KEY, user_id TEXT NOT NULL, device_id TEXT NOT NULL,
                  public_key_jwk TEXT NOT NULL, fingerprint TEXT NOT NULL, secret_hash TEXT NOT NULL, expires_at TIMESTAMPTZ NOT NULL)
            """, """
                CREATE TABLE IF NOT EXISTS device_key_transfers (
                  transfer_id TEXT PRIMARY KEY, user_id TEXT NOT NULL, source_device_id TEXT NOT NULL,
                  target_device_id TEXT NOT NULL, key_version INTEGER NOT NULL, envelope_json TEXT NOT NULL,
                  created_at TIMESTAMPTZ NOT NULL, expires_at TIMESTAMPTZ NOT NULL, consumed_at TIMESTAMPTZ)
            """, """
                CREATE TABLE IF NOT EXISTS device_key_requests (
                  request_id TEXT PRIMARY KEY, user_id TEXT NOT NULL, target_device_id TEXT NOT NULL,
                  created_at TIMESTAMPTZ NOT NULL, expires_at TIMESTAMPTZ NOT NULL, fulfilled_at TIMESTAMPTZ)
            """, """
                CREATE TABLE IF NOT EXISTS security_audit_events (
                  event_id TEXT PRIMARY KEY, user_id TEXT NOT NULL, device_id TEXT NOT NULL,
                  event_type TEXT NOT NULL, details_json TEXT NOT NULL, created_at TIMESTAMPTZ NOT NULL,
                  previous_hash TEXT, event_hash TEXT)
            """, """
                CREATE TABLE IF NOT EXISTS security_audit_heads (
                  user_id TEXT PRIMARY KEY, event_id TEXT NOT NULL, event_hash TEXT NOT NULL)
            """, """
                CREATE TABLE IF NOT EXISTS identity_key_migrations (
                  user_id TEXT PRIMARY KEY, enabled INTEGER NOT NULL, created_at TIMESTAMPTZ NOT NULL,
                  disabled_at TIMESTAMPTZ, disabled_by_device_id TEXT,
                  emergency_registration_open INTEGER NOT NULL DEFAULT 1)
            """]
            for statement in statements:
                connection.execute(statement)
            connection.execute("""
                CREATE INDEX IF NOT EXISTS idx_security_audit_user_created
                ON security_audit_events (user_id, created_at DESC, event_id DESC)
            """)
            connection.execute("ALTER TABLE identity_key_migrations ADD COLUMN IF NOT EXISTS emergency_registration_open INTEGER NOT NULL DEFAULT 1")
            # Early key-exchange builds used JSONB. Canonical key ownership proofs compare
            # the exact serialized JWK, so normalize legacy deployments to TEXT.
            connection.execute("ALTER TABLE device_public_keys ALTER COLUMN public_key_jwk TYPE TEXT USING public_key_jwk::text")
            connection.execute("ALTER TABLE device_key_challenges ALTER COLUMN public_key_jwk TYPE TEXT USING public_key_jwk::text")
            connection.execute("ALTER TABLE device_key_transfers ALTER COLUMN envelope_json TYPE TEXT USING envelope_json::text")
            connection.execute("ALTER TABLE security_audit_events ADD COLUMN IF NOT EXISTS previous_hash TEXT")
            connection.execute("ALTER TABLE security_audit_events ADD COLUMN IF NOT EXISTS event_hash TEXT")
            connection.commit()

    def get_migration(self, user_id):
        # Keep this path self-healing because registration is the recovery mechanism
        # for deployments that may have missed an earlier schema migration.
        self.initialize()
        return super().get_migration(user_id)

    def put_key_with_bootstrap(self, user_id, device_id, public_key_jwk, fingerprint):
        now = datetime.now(UTC)
        from psycopg import connect
        from psycopg.rows import dict_row
        with connect(self.database_url, row_factory=dict_row) as connection:
            with connection.transaction():
                connection.execute("SELECT pg_advisory_xact_lock(hashtext(%s))", (user_id,))
                is_first_key = connection.execute("SELECT 1 FROM device_public_keys WHERE user_id = %s LIMIT 1", (user_id,)).fetchone() is None
                column = connection.execute("""
                    SELECT data_type FROM information_schema.columns
                    WHERE table_schema = current_schema() AND table_name = 'device_public_keys'
                      AND column_name = 'public_key_jwk'
                """).fetchone()
                if not column:
                    raise RuntimeError("device_public_keys.public_key_jwk is missing")
                key_placeholder = "%s::jsonb" if column["data_type"] == "jsonb" else "%s"
                connection.execute(f"""
                    INSERT INTO device_public_keys
                      (user_id, device_id, public_key_jwk, fingerprint, verified_at)
                    VALUES (%s, %s, {key_placeholder}, %s, %s)
                    ON CONFLICT(user_id, device_id) DO UPDATE SET
                      public_key_jwk = excluded.public_key_jwk,
                      fingerprint = excluded.fingerprint,
                      verified_at = excluded.verified_at
                """, (user_id, device_id, public_key_jwk, fingerprint, now))
        return DeviceKeyRecord(device_id, public_key_jwk, fingerprint, now), is_first_key

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


def create_key_exchange_store(*, database_url: str | None, database_path: str, audit_retention_days: int = 730, audit_integrity_key: str = ""):
    if database_url and database_url.startswith(("postgresql://", "postgres://")):
        return PostgresKeyExchangeStore(database_url, audit_retention_days, audit_integrity_key)
    if database_url and database_url.startswith("sqlite:///"):
        database_path = database_url.removeprefix("sqlite:///")
    return SqliteKeyExchangeStore(database_path, audit_retention_days, audit_integrity_key)
