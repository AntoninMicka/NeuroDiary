from __future__ import annotations

import json
import sqlite3
from contextlib import contextmanager
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path
from threading import Lock
from typing import Iterator

from .models import DiaryStateModel, SyncEnvelopeModel


@dataclass
class SaveResult:
    revision: int
    updated_at: datetime
    state: DiaryStateModel


class RevisionConflictError(Exception):
    pass


class SyncStore:
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
            payload_json TEXT NOT NULL
          )
          """
        )
        connection.commit()

    def load_latest(self, user_id: str) -> SyncEnvelopeModel | None:
      with self._connect() as connection:
        row = connection.execute(
          """
          SELECT revision, updated_at, payload_json
          FROM sync_snapshots
          WHERE user_id = ?
          """,
          (user_id,),
        ).fetchone()

      if row is None:
        return None

      state = DiaryStateModel.model_validate(json.loads(row["payload_json"]))
      return SyncEnvelopeModel(
        revision=row["revision"],
        updatedAt=datetime.fromisoformat(row["updated_at"]),
        state=state,
      )

    def save_state(
      self,
      *,
      user_id: str,
      base_revision: int,
      state: DiaryStateModel,
      force: bool = False,
    ) -> SaveResult:
      with self._lock:
        current = self.load_latest(user_id)
        current_revision = current.revision if current else 0

        if not force and current_revision != base_revision:
          raise RevisionConflictError

        next_revision = current_revision + 1
        updated_at = datetime.now(UTC)
        payload_json = state.model_dump_json()

        with self._connect() as connection:
          connection.execute(
            """
            INSERT INTO sync_snapshots (user_id, revision, updated_at, payload_json)
            VALUES (?, ?, ?, ?)
            ON CONFLICT(user_id) DO UPDATE SET
              revision = excluded.revision,
              updated_at = excluded.updated_at,
              payload_json = excluded.payload_json
            """,
            (user_id, next_revision, updated_at.isoformat(), payload_json),
          )
          connection.commit()

        return SaveResult(revision=next_revision, updated_at=updated_at, state=state)
