from __future__ import annotations

import sqlite3
from contextlib import contextmanager
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path


@dataclass
class DeviceRecord:
    device_id: str
    name: str
    created_at: datetime
    last_seen_at: datetime
    revoked_at: datetime | None
    trust_status: str


class SqliteDeviceStore:
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
            connection.execute("""
                CREATE TABLE IF NOT EXISTS trusted_devices (
                  user_id TEXT NOT NULL,
                  device_id TEXT NOT NULL,
                  name TEXT NOT NULL,
                  created_at TEXT NOT NULL,
                  last_seen_at TEXT NOT NULL,
                  revoked_at TEXT,
                  trust_status TEXT NOT NULL DEFAULT 'trusted',
                  PRIMARY KEY (user_id, device_id)
                )
            """)
            columns = {row[1] for row in connection.execute("PRAGMA table_info(trusted_devices)").fetchall()}
            if "trust_status" not in columns:
                connection.execute("ALTER TABLE trusted_devices ADD COLUMN trust_status TEXT NOT NULL DEFAULT 'trusted'")
            connection.commit()

    def upsert(self, user_id: str, device_id: str, name: str) -> DeviceRecord:
        now = datetime.now(UTC)
        with self._connect() as connection:
            has_devices = connection.execute("SELECT 1 FROM trusted_devices WHERE user_id = ? LIMIT 1", (user_id,)).fetchone() is not None
            initial_status = "pending" if has_devices else "trusted"
            connection.execute("""
                INSERT INTO trusted_devices (user_id, device_id, name, created_at, last_seen_at, revoked_at, trust_status)
                VALUES (?, ?, ?, ?, ?, NULL, ?)
                ON CONFLICT(user_id, device_id) DO UPDATE SET
                  name = excluded.name,
                  last_seen_at = CASE WHEN trusted_devices.revoked_at IS NULL THEN excluded.last_seen_at ELSE trusted_devices.last_seen_at END
            """, (user_id, device_id, name, now.isoformat(), now.isoformat(), initial_status))
            connection.commit()
        return self.get(user_id, device_id)

    def get(self, user_id: str, device_id: str) -> DeviceRecord | None:
        with self._connect() as connection:
            row = connection.execute(
                "SELECT device_id, name, created_at, last_seen_at, revoked_at, trust_status FROM trusted_devices WHERE user_id = ? AND device_id = ?",
                (user_id, device_id),
            ).fetchone()
        return self._record(row)

    def list(self, user_id: str) -> list[DeviceRecord]:
        with self._connect() as connection:
            rows = connection.execute(
                "SELECT device_id, name, created_at, last_seen_at, revoked_at, trust_status FROM trusted_devices WHERE user_id = ? ORDER BY last_seen_at DESC",
                (user_id,),
            ).fetchall()
        return [self._record(row) for row in rows]

    def is_active(self, user_id: str, device_id: str) -> bool:
        record = self.get(user_id, device_id)
        return bool(record and record.revoked_at is None and record.trust_status == "trusted")

    def is_registered(self, user_id: str, device_id: str) -> bool:
        record = self.get(user_id, device_id)
        return bool(record and record.revoked_at is None)

    def trust(self, user_id: str, device_id: str) -> None:
        with self._connect() as connection:
            connection.execute("UPDATE trusted_devices SET trust_status = 'trusted' WHERE user_id = ? AND device_id = ? AND revoked_at IS NULL", (user_id, device_id))
            connection.commit()

    def emergency_reactivate(self, user_id: str, device_id: str) -> None:
        with self._connect() as connection:
            connection.execute("UPDATE trusted_devices SET revoked_at = NULL, trust_status = 'trusted', last_seen_at = ? WHERE user_id = ? AND device_id = ?", (datetime.now(UTC).isoformat(), user_id, device_id))
            connection.commit()

    def revoke(self, user_id: str, device_id: str) -> None:
        with self._connect() as connection:
            connection.execute(
                "UPDATE trusted_devices SET revoked_at = ? WHERE user_id = ? AND device_id = ?",
                (datetime.now(UTC).isoformat(), user_id, device_id),
            )
            connection.commit()

    def rename(self, user_id: str, device_id: str, name: str) -> DeviceRecord | None:
        with self._connect() as connection:
            cursor = connection.execute(
                "UPDATE trusted_devices SET name = ? WHERE user_id = ? AND device_id = ? AND revoked_at IS NULL",
                (name, user_id, device_id),
            )
            connection.commit()
        return self.get(user_id, device_id) if cursor.rowcount == 1 else None

    def revoke_others(self, user_id: str, current_device_id: str) -> int:
        with self._connect() as connection:
            cursor = connection.execute(
                "UPDATE trusted_devices SET revoked_at = ? WHERE user_id = ? AND device_id <> ? AND revoked_at IS NULL",
                (datetime.now(UTC).isoformat(), user_id, current_device_id),
            )
            connection.commit()
            return cursor.rowcount

    @staticmethod
    def _record(row):
        if row is None:
            return None
        return DeviceRecord(
            device_id=row["device_id"], name=row["name"],
            created_at=datetime.fromisoformat(row["created_at"]),
            last_seen_at=datetime.fromisoformat(row["last_seen_at"]),
            revoked_at=datetime.fromisoformat(row["revoked_at"]) if row["revoked_at"] else None,
            trust_status=row["trust_status"],
        )


class PostgresDeviceStore:
    def __init__(self, database_url: str) -> None:
        self.database_url = database_url

    def _connect(self):
        from psycopg import connect
        from psycopg.rows import dict_row
        return connect(self.database_url, row_factory=dict_row)

    def initialize(self) -> None:
        with self._connect() as connection:
            connection.execute("""
                CREATE TABLE IF NOT EXISTS trusted_devices (
                  user_id TEXT NOT NULL, device_id TEXT NOT NULL, name TEXT NOT NULL,
                  created_at TIMESTAMPTZ NOT NULL, last_seen_at TIMESTAMPTZ NOT NULL,
                  revoked_at TIMESTAMPTZ, PRIMARY KEY (user_id, device_id)
                )
            """)
            connection.execute("ALTER TABLE trusted_devices ADD COLUMN IF NOT EXISTS trust_status TEXT NOT NULL DEFAULT 'trusted'")

    def upsert(self, user_id: str, device_id: str, name: str) -> DeviceRecord:
        now = datetime.now(UTC)
        with self._connect() as connection:
            has_devices = connection.execute("SELECT 1 FROM trusted_devices WHERE user_id = %s LIMIT 1", (user_id,)).fetchone() is not None
            initial_status = "pending" if has_devices else "trusted"
            connection.execute("""
                INSERT INTO trusted_devices (user_id, device_id, name, created_at, last_seen_at, revoked_at, trust_status)
                VALUES (%s, %s, %s, %s, %s, NULL, %s)
                ON CONFLICT(user_id, device_id) DO UPDATE SET
                  name = excluded.name,
                  last_seen_at = CASE WHEN trusted_devices.revoked_at IS NULL THEN excluded.last_seen_at ELSE trusted_devices.last_seen_at END
            """, (user_id, device_id, name, now, now, initial_status))
        return self.get(user_id, device_id)

    def get(self, user_id: str, device_id: str) -> DeviceRecord | None:
        with self._connect() as connection:
            row = connection.execute(
                "SELECT device_id, name, created_at, last_seen_at, revoked_at, trust_status FROM trusted_devices WHERE user_id = %s AND device_id = %s",
                (user_id, device_id),
            ).fetchone()
        return self._record(row)

    def list(self, user_id: str) -> list[DeviceRecord]:
        with self._connect() as connection:
            rows = connection.execute(
                "SELECT device_id, name, created_at, last_seen_at, revoked_at, trust_status FROM trusted_devices WHERE user_id = %s ORDER BY last_seen_at DESC",
                (user_id,),
            ).fetchall()
        return [self._record(row) for row in rows]

    def is_active(self, user_id: str, device_id: str) -> bool:
        record = self.get(user_id, device_id)
        return bool(record and record.revoked_at is None and record.trust_status == "trusted")

    def is_registered(self, user_id: str, device_id: str) -> bool:
        record = self.get(user_id, device_id)
        return bool(record and record.revoked_at is None)

    def trust(self, user_id: str, device_id: str) -> None:
        with self._connect() as connection:
            connection.execute("UPDATE trusted_devices SET trust_status = 'trusted' WHERE user_id = %s AND device_id = %s AND revoked_at IS NULL", (user_id, device_id))

    def emergency_reactivate(self, user_id: str, device_id: str) -> None:
        with self._connect() as connection:
            connection.execute("UPDATE trusted_devices SET revoked_at = NULL, trust_status = 'trusted', last_seen_at = %s WHERE user_id = %s AND device_id = %s", (datetime.now(UTC), user_id, device_id))

    def revoke(self, user_id: str, device_id: str) -> None:
        with self._connect() as connection:
            connection.execute("UPDATE trusted_devices SET revoked_at = %s WHERE user_id = %s AND device_id = %s", (datetime.now(UTC), user_id, device_id))

    def rename(self, user_id: str, device_id: str, name: str) -> DeviceRecord | None:
        with self._connect() as connection:
            cursor = connection.execute(
                "UPDATE trusted_devices SET name = %s WHERE user_id = %s AND device_id = %s AND revoked_at IS NULL",
                (name, user_id, device_id),
            )
        return self.get(user_id, device_id) if cursor.rowcount == 1 else None

    def revoke_others(self, user_id: str, current_device_id: str) -> int:
        with self._connect() as connection:
            cursor = connection.execute(
                "UPDATE trusted_devices SET revoked_at = %s WHERE user_id = %s AND device_id <> %s AND revoked_at IS NULL",
                (datetime.now(UTC), user_id, current_device_id),
            )
            return cursor.rowcount

    @staticmethod
    def _record(row):
        if row is None:
            return None
        return DeviceRecord(
            device_id=row["device_id"], name=row["name"], created_at=row["created_at"],
            last_seen_at=row["last_seen_at"], revoked_at=row["revoked_at"],
            trust_status=row["trust_status"],
        )


def create_device_store(*, database_url: str | None, database_path: str):
    if database_url and (database_url.startswith("postgresql://") or database_url.startswith("postgres://")):
        return PostgresDeviceStore(database_url)
    if database_url and database_url.startswith("sqlite:///"):
        database_path = database_url.removeprefix("sqlite:///")
    return SqliteDeviceStore(database_path)
