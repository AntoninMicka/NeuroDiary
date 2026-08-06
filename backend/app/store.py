from __future__ import annotations

import json
import sqlite3
from contextlib import contextmanager
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path
from threading import Lock
from typing import Iterator

from .models import EncryptedPayloadModel, SyncEnvelopeModel, WrappedKeyEnvelopeModel


@dataclass
class SaveResult:
    revision: int
    updated_at: datetime
    payload: EncryptedPayloadModel
    wrapped_key: WrappedKeyEnvelopeModel | None


class RevisionConflictError(Exception):
    pass


def _parse_payload(value: str | dict[str, object]) -> EncryptedPayloadModel:
    if isinstance(value, str):
        value = json.loads(value)
    return EncryptedPayloadModel.model_validate(value)


def _parse_wrapped_key(value: str | dict[str, object] | None) -> WrappedKeyEnvelopeModel | None:
    if value is None:
        return None
    if isinstance(value, str):
        value = json.loads(value)
    return WrappedKeyEnvelopeModel.model_validate(value)


def _payload_to_json(payload: EncryptedPayloadModel) -> str:
    return payload.model_dump_json()


def _wrapped_key_to_json(wrapped_key: WrappedKeyEnvelopeModel | None) -> str | None:
    if wrapped_key is None:
        return None
    return wrapped_key.model_dump_json()


class SqliteSyncStore:
    def __init__(self, database_path: str) -> None:
        self.database_path = Path(database_path)
        self.database_path.parent.mkdir(parents=True, exist_ok=True)
        self._lock = Lock()

    @contextmanager
    def _connect(self) -> Iterator[sqlite3.Connection]:
        connection = sqlite3.connect(self.database_path)
        connection.row_factory = sqlite3.Row
        try:
            yield connection
        finally:
            connection.close()

    def initialize(self) -> None:
        with self._connect() as connection:
            connection.execute(
                """
                CREATE TABLE IF NOT EXISTS sync_snapshots (
                  user_id TEXT PRIMARY KEY,
                  revision INTEGER NOT NULL,
                  updated_at TEXT NOT NULL,
                  payload_json TEXT NOT NULL,
                  wrapped_key_json TEXT
                )
                """
            )
            connection.commit()

    def check_health(self) -> None:
        with self._connect() as connection:
            connection.execute("SELECT 1").fetchone()

    def load_latest(self, user_id: str) -> SyncEnvelopeModel | None:
        with self._connect() as connection:
            row = connection.execute(
                """
                SELECT revision, updated_at, payload_json, wrapped_key_json
                FROM sync_snapshots
                WHERE user_id = ?
                """,
                (user_id,),
            ).fetchone()

        if row is None:
            return None

        return SyncEnvelopeModel(
            revision=row["revision"],
            updatedAt=datetime.fromisoformat(row["updated_at"]),
            payload=_parse_payload(row["payload_json"]),
            wrappedKey=_parse_wrapped_key(row["wrapped_key_json"]),
        )

    def save_state(
        self,
        *,
        user_id: str,
        base_revision: int,
        payload: EncryptedPayloadModel,
        wrapped_key: WrappedKeyEnvelopeModel | None = None,
        force: bool = False,
    ) -> SaveResult:
        with self._lock:
            current = self.load_latest(user_id)
            current_revision = current.revision if current else 0

            if current and payload.keyVersion < current.payload.keyVersion:
                raise RevisionConflictError

            if not force and current_revision != base_revision:
                raise RevisionConflictError

            next_revision = current_revision + 1
            updated_at = datetime.now(UTC)

            with self._connect() as connection:
                connection.execute(
                    """
                    INSERT INTO sync_snapshots (user_id, revision, updated_at, payload_json, wrapped_key_json)
                    VALUES (?, ?, ?, ?, ?)
                    ON CONFLICT(user_id) DO UPDATE SET
                      revision = excluded.revision,
                      updated_at = excluded.updated_at,
                      payload_json = excluded.payload_json,
                      wrapped_key_json = excluded.wrapped_key_json
                    """,
                    (
                        user_id,
                        next_revision,
                        updated_at.isoformat(),
                        _payload_to_json(payload),
                        _wrapped_key_to_json(wrapped_key),
                    ),
                )
                connection.commit()

            return SaveResult(
                revision=next_revision,
                updated_at=updated_at,
                payload=payload,
                wrapped_key=wrapped_key,
            )

    def delete_state(self, user_id: str) -> datetime:
        deleted_at = datetime.now(UTC)
        with self._lock:
            with self._connect() as connection:
                connection.execute(
                    """
                    DELETE FROM sync_snapshots
                    WHERE user_id = ?
                    """,
                    (user_id,),
                )
                connection.commit()

        return deleted_at


class PostgresSyncStore:
    def __init__(self, database_url: str) -> None:
        self.database_url = database_url

    def _connect(self):
        from psycopg import connect
        from psycopg.rows import dict_row

        return connect(self.database_url, row_factory=dict_row)

    def initialize(self) -> None:
        with self._connect() as connection:
            with connection.cursor() as cursor:
                cursor.execute(
                    """
                    CREATE TABLE IF NOT EXISTS sync_snapshots (
                      user_id TEXT PRIMARY KEY,
                      revision INTEGER NOT NULL,
                      updated_at TIMESTAMPTZ NOT NULL,
                      payload_json JSONB NOT NULL,
                      wrapped_key_json JSONB
                    )
                    """
                )
            connection.commit()

    def check_health(self) -> None:
        with self._connect() as connection:
            with connection.cursor() as cursor:
                cursor.execute("SELECT 1")
                cursor.fetchone()

    def load_latest(self, user_id: str) -> SyncEnvelopeModel | None:
        with self._connect() as connection:
            with connection.cursor() as cursor:
                cursor.execute(
                    """
                    SELECT revision, updated_at, payload_json, wrapped_key_json
                    FROM sync_snapshots
                    WHERE user_id = %s
                    """,
                    (user_id,),
                )
                row = cursor.fetchone()

        if row is None:
            return None

        return SyncEnvelopeModel(
            revision=row["revision"],
            updatedAt=row["updated_at"],
            payload=_parse_payload(row["payload_json"]),
            wrappedKey=_parse_wrapped_key(row["wrapped_key_json"]),
        )

    def save_state(
        self,
        *,
        user_id: str,
        base_revision: int,
        payload: EncryptedPayloadModel,
        wrapped_key: WrappedKeyEnvelopeModel | None = None,
        force: bool = False,
    ) -> SaveResult:
        updated_at = datetime.now(UTC)
        payload_json = _payload_to_json(payload)
        wrapped_key_json = _wrapped_key_to_json(wrapped_key)

        with self._connect() as connection:
            with connection.transaction():
                with connection.cursor() as cursor:
                    cursor.execute(
                        """
                        SELECT revision
                        FROM sync_snapshots
                        WHERE user_id = %s
                        FOR UPDATE
                        """,
                        (user_id,),
                    )
                    row = cursor.fetchone()
                    current_revision = row["revision"] if row else 0

                    if row:
                        cursor.execute(
                            "SELECT payload_json FROM sync_snapshots WHERE user_id = %s",
                            (user_id,),
                        )
                        current_payload = _parse_payload(cursor.fetchone()["payload_json"])
                        if payload.keyVersion < current_payload.keyVersion:
                            raise RevisionConflictError

                    if not force and current_revision != base_revision:
                        raise RevisionConflictError

                    next_revision = current_revision + 1

                    if row is None:
                        cursor.execute(
                            """
                            INSERT INTO sync_snapshots (
                              user_id,
                              revision,
                              updated_at,
                              payload_json,
                              wrapped_key_json
                            )
                            VALUES (%s, %s, %s, %s::jsonb, %s::jsonb)
                            """,
                            (user_id, next_revision, updated_at, payload_json, wrapped_key_json),
                        )
                    else:
                        cursor.execute(
                            """
                            UPDATE sync_snapshots
                            SET revision = %s,
                                updated_at = %s,
                                payload_json = %s::jsonb,
                                wrapped_key_json = %s::jsonb
                            WHERE user_id = %s
                            """,
                            (next_revision, updated_at, payload_json, wrapped_key_json, user_id),
                        )

        return SaveResult(
            revision=next_revision,
            updated_at=updated_at,
            payload=payload,
            wrapped_key=wrapped_key,
        )

    def delete_state(self, user_id: str) -> datetime:
        deleted_at = datetime.now(UTC)

        with self._connect() as connection:
            with connection.transaction():
                with connection.cursor() as cursor:
                    cursor.execute(
                        """
                        DELETE FROM sync_snapshots
                        WHERE user_id = %s
                        """,
                        (user_id,),
                    )

        return deleted_at


def create_sync_store(*, database_url: str | None, database_path: str):
    if database_url:
        if database_url.startswith("postgresql://") or database_url.startswith("postgres://"):
            return PostgresSyncStore(database_url)
        if database_url.startswith("sqlite:///"):
            return SqliteSyncStore(database_url.removeprefix("sqlite:///"))
        raise ValueError("Unsupported NEURODIARY_DATABASE_URL scheme.")

    return SqliteSyncStore(database_path)
