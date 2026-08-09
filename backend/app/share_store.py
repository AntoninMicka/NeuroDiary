from __future__ import annotations

import json
import sqlite3
import uuid
from contextlib import contextmanager
from datetime import UTC, datetime
from pathlib import Path


class ShareStore:
    """Account directory and read-only diary grants. Health data never enters these tables."""

    def __init__(self, database_path: str, database_url: str | None = None) -> None:
        self.database_path = Path(database_path)
        self.database_url = database_url or ""

    @property
    def postgres(self) -> bool:
        return self.database_url.startswith(("postgresql://", "postgres://"))

    @contextmanager
    def connect(self):
        if self.postgres:
            from psycopg import connect
            from psycopg.rows import dict_row
            with connect(self.database_url, row_factory=dict_row) as connection:
                yield connection
            return
        connection = sqlite3.connect(self.database_path)
        connection.row_factory = sqlite3.Row
        try:
            yield connection
        finally:
            connection.close()

    def initialize(self) -> None:
        identity_id = "TEXT PRIMARY KEY"
        timestamp = "TIMESTAMPTZ" if self.postgres else "TEXT"
        with self.connect() as connection:
            connection.execute(f"""
                CREATE TABLE IF NOT EXISTS share_identities (
                  user_id {identity_id}, email TEXT NOT NULL UNIQUE, display_name TEXT NOT NULL,
                  updated_at {timestamp} NOT NULL
                )
            """)
            connection.execute(f"""
                CREATE TABLE IF NOT EXISTS diary_share_grants (
                  grant_id {identity_id}, owner_user_id TEXT NOT NULL, recipient_user_id TEXT NOT NULL,
                  recipient_device_id TEXT NOT NULL, key_version INTEGER NOT NULL,
                  key_envelope_json TEXT NOT NULL, created_at {timestamp} NOT NULL,
                  revoked_at {timestamp}, UNIQUE(owner_user_id, recipient_user_id, recipient_device_id)
                )
            """)
            connection.commit()

    def register_identity(self, user_id: str, email: str, name: str) -> None:
        if not email:
            return
        now = datetime.now(UTC)
        placeholder = "%s" if self.postgres else "?"
        with self.connect() as connection:
            connection.execute(f"""
                INSERT INTO share_identities (user_id, email, display_name, updated_at)
                VALUES ({placeholder}, {placeholder}, {placeholder}, {placeholder})
                ON CONFLICT(user_id) DO UPDATE SET email = excluded.email,
                  display_name = excluded.display_name, updated_at = excluded.updated_at
            """, (user_id, email.strip().lower(), name, now if self.postgres else now.isoformat()))
            connection.commit()

    def find_identity(self, email: str):
        placeholder = "%s" if self.postgres else "?"
        with self.connect() as connection:
            return connection.execute(
                f"SELECT user_id, email, display_name FROM share_identities WHERE email = {placeholder}",
                (email.strip().lower(),),
            ).fetchone()

    def save_grant(self, owner_id: str, recipient_id: str, device_id: str, key_version: int, envelope: dict):
        now = datetime.now(UTC)
        grant_id = str(uuid.uuid4())
        p = "%s" if self.postgres else "?"
        values = (grant_id, owner_id, recipient_id, device_id, key_version, json.dumps(envelope), now if self.postgres else now.isoformat())
        with self.connect() as connection:
            connection.execute(f"""
                INSERT INTO diary_share_grants
                  (grant_id, owner_user_id, recipient_user_id, recipient_device_id, key_version, key_envelope_json, created_at, revoked_at)
                VALUES ({p}, {p}, {p}, {p}, {p}, {p}, {p}, NULL)
                ON CONFLICT(owner_user_id, recipient_user_id, recipient_device_id) DO UPDATE SET
                  key_version = excluded.key_version, key_envelope_json = excluded.key_envelope_json,
                  created_at = excluded.created_at, revoked_at = NULL
            """, values)
            connection.commit()
        return self.get_outgoing(owner_id)

    def get_outgoing(self, owner_id: str):
        p = "%s" if self.postgres else "?"
        with self.connect() as connection:
            return connection.execute(f"""
                SELECT g.grant_id, g.recipient_user_id, g.recipient_device_id, g.key_version,
                       g.created_at, g.revoked_at, i.email, i.display_name
                FROM diary_share_grants g JOIN share_identities i ON i.user_id = g.recipient_user_id
                WHERE g.owner_user_id = {p} ORDER BY g.created_at DESC
            """, (owner_id,)).fetchall()

    def get_incoming(self, recipient_id: str, device_id: str):
        p = "%s" if self.postgres else "?"
        with self.connect() as connection:
            return connection.execute(f"""
                SELECT g.grant_id, g.owner_user_id, g.key_version, g.key_envelope_json,
                       g.created_at, i.email, i.display_name
                FROM diary_share_grants g JOIN share_identities i ON i.user_id = g.owner_user_id
                WHERE g.recipient_user_id = {p} AND g.recipient_device_id = {p} AND g.revoked_at IS NULL
                ORDER BY g.created_at DESC
            """, (recipient_id, device_id)).fetchall()

    def revoke(self, owner_id: str, grant_id: str) -> bool:
        p = "%s" if self.postgres else "?"
        now = datetime.now(UTC)
        with self.connect() as connection:
            cursor = connection.execute(
                f"UPDATE diary_share_grants SET revoked_at = {p} WHERE grant_id = {p} AND owner_user_id = {p} AND revoked_at IS NULL",
                (now if self.postgres else now.isoformat(), grant_id, owner_id),
            )
            connection.commit()
            return cursor.rowcount == 1

