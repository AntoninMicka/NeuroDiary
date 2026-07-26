from __future__ import annotations

import sqlite3
from contextlib import contextmanager
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from pathlib import Path
from threading import Lock
from typing import Iterator

from .models import PushRegistrationRequestModel


@dataclass
class DuePushReminder:
    user_id: str
    endpoint: str
    p256dh: str
    auth: str
    reminder_id: str
    scheduled_at: datetime
    attempts: int


class SqlitePushStore:
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
            connection.executescript(
                """
                CREATE TABLE IF NOT EXISTS push_subscriptions (
                  user_id TEXT NOT NULL,
                  endpoint TEXT NOT NULL,
                  p256dh TEXT NOT NULL,
                  auth TEXT NOT NULL,
                  updated_at TEXT NOT NULL,
                  PRIMARY KEY (user_id, endpoint)
                );
                CREATE TABLE IF NOT EXISTS push_reminders (
                  user_id TEXT NOT NULL,
                  endpoint TEXT NOT NULL,
                  reminder_id TEXT NOT NULL,
                  scheduled_at TEXT NOT NULL,
                  sent_at TEXT,
                  attempts INTEGER NOT NULL DEFAULT 0,
                  next_attempt_at TEXT,
                  failed_at TEXT,
                  PRIMARY KEY (user_id, endpoint, reminder_id),
                  FOREIGN KEY (user_id, endpoint)
                    REFERENCES push_subscriptions(user_id, endpoint)
                    ON DELETE CASCADE
                );
                CREATE INDEX IF NOT EXISTS push_reminders_due_idx
                  ON push_reminders(scheduled_at, sent_at);
                """
            )
            connection.commit()

    def replace_registration(self, user_id: str, payload: PushRegistrationRequestModel) -> int:
        now = datetime.now(UTC).isoformat()
        subscription = payload.subscription
        with self._lock, self._connect() as connection:
            connection.execute("PRAGMA foreign_keys = ON")
            connection.execute(
                """
                INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth, updated_at)
                VALUES (?, ?, ?, ?, ?)
                ON CONFLICT(user_id, endpoint) DO UPDATE SET
                  p256dh = excluded.p256dh,
                  auth = excluded.auth,
                  updated_at = excluded.updated_at
                """,
                (user_id, subscription.endpoint, subscription.keys.p256dh, subscription.keys.auth, now),
            )
            connection.execute(
                "DELETE FROM push_reminders WHERE user_id = ? AND endpoint = ? AND sent_at IS NULL",
                (user_id, subscription.endpoint),
            )
            connection.executemany(
                """
                INSERT INTO push_reminders (
                  user_id, endpoint, reminder_id, scheduled_at, sent_at
                ) VALUES (?, ?, ?, ?, NULL)
                ON CONFLICT(user_id, endpoint, reminder_id) DO UPDATE SET
                  scheduled_at = excluded.scheduled_at,
                  sent_at = NULL,
                  attempts = 0,
                  next_attempt_at = NULL,
                  failed_at = NULL
                """,
                [
                    (
                        user_id,
                        subscription.endpoint,
                        reminder.id,
                        reminder.scheduledAt.astimezone(UTC).isoformat(),
                    )
                    for reminder in payload.reminders
                ],
            )
            connection.commit()
        return len(payload.reminders)

    def delete_subscription(self, user_id: str, endpoint: str) -> bool:
        with self._lock, self._connect() as connection:
            connection.execute("PRAGMA foreign_keys = ON")
            cursor = connection.execute(
                "DELETE FROM push_subscriptions WHERE user_id = ? AND endpoint = ?",
                (user_id, endpoint),
            )
            connection.commit()
            return cursor.rowcount > 0

    def load_due(self, due_before: datetime, limit: int = 500) -> list[DuePushReminder]:
        with self._connect() as connection:
            rows = connection.execute(
                """
                SELECT r.user_id, r.endpoint, s.p256dh, s.auth, r.reminder_id,
                       r.scheduled_at, r.attempts
                FROM push_reminders r
                JOIN push_subscriptions s
                  ON s.user_id = r.user_id AND s.endpoint = r.endpoint
                WHERE r.sent_at IS NULL
                  AND r.failed_at IS NULL
                  AND r.scheduled_at <= ?
                  AND (r.next_attempt_at IS NULL OR r.next_attempt_at <= ?)
                ORDER BY r.scheduled_at
                LIMIT ?
                """,
                (
                    due_before.astimezone(UTC).isoformat(),
                    due_before.astimezone(UTC).isoformat(),
                    limit,
                ),
            ).fetchall()
        return [
            DuePushReminder(
                user_id=row["user_id"],
                endpoint=row["endpoint"],
                p256dh=row["p256dh"],
                auth=row["auth"],
                reminder_id=row["reminder_id"],
                scheduled_at=datetime.fromisoformat(row["scheduled_at"]),
                attempts=row["attempts"],
            )
            for row in rows
        ]

    def mark_sent(self, reminder: DuePushReminder) -> None:
        with self._connect() as connection:
            connection.execute(
                """
                UPDATE push_reminders SET sent_at = ?
                WHERE user_id = ? AND endpoint = ? AND reminder_id = ?
                """,
                (datetime.now(UTC).isoformat(), reminder.user_id, reminder.endpoint, reminder.reminder_id),
            )
            connection.commit()

    def mark_failed(self, reminder: DuePushReminder) -> None:
        attempts = reminder.attempts + 1
        failed_at = datetime.now(UTC).isoformat() if attempts >= 5 else None
        delay_minutes = min(5 * (2 ** (attempts - 1)), 360)
        retry_base = max(datetime.now(UTC), reminder.scheduled_at.astimezone(UTC))
        next_attempt_at = (retry_base + timedelta(minutes=delay_minutes)).isoformat()
        with self._connect() as connection:
            connection.execute(
                """
                UPDATE push_reminders
                SET attempts = ?, next_attempt_at = ?, failed_at = ?
                WHERE user_id = ? AND endpoint = ? AND reminder_id = ?
                """,
                (
                    attempts,
                    next_attempt_at,
                    failed_at,
                    reminder.user_id,
                    reminder.endpoint,
                    reminder.reminder_id,
                ),
            )
            connection.commit()


class PostgresPushStore:
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
                    CREATE TABLE IF NOT EXISTS push_subscriptions (
                      user_id TEXT NOT NULL,
                      endpoint TEXT NOT NULL,
                      p256dh TEXT NOT NULL,
                      auth TEXT NOT NULL,
                      updated_at TIMESTAMPTZ NOT NULL,
                      PRIMARY KEY (user_id, endpoint)
                    );
                    CREATE TABLE IF NOT EXISTS push_reminders (
                      user_id TEXT NOT NULL,
                      endpoint TEXT NOT NULL,
                      reminder_id TEXT NOT NULL,
                      scheduled_at TIMESTAMPTZ NOT NULL,
                      sent_at TIMESTAMPTZ,
                      attempts INTEGER NOT NULL DEFAULT 0,
                      next_attempt_at TIMESTAMPTZ,
                      failed_at TIMESTAMPTZ,
                      PRIMARY KEY (user_id, endpoint, reminder_id),
                      FOREIGN KEY (user_id, endpoint)
                        REFERENCES push_subscriptions(user_id, endpoint)
                        ON DELETE CASCADE
                    );
                    CREATE INDEX IF NOT EXISTS push_reminders_due_idx
                      ON push_reminders(scheduled_at, sent_at);
                    """
                )
            connection.commit()

    def replace_registration(self, user_id: str, payload: PushRegistrationRequestModel) -> int:
        subscription = payload.subscription
        with self._connect() as connection:
            with connection.transaction(), connection.cursor() as cursor:
                cursor.execute(
                    """
                    INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth, updated_at)
                    VALUES (%s, %s, %s, %s, %s)
                    ON CONFLICT(user_id, endpoint) DO UPDATE SET
                      p256dh = excluded.p256dh,
                      auth = excluded.auth,
                      updated_at = excluded.updated_at
                    """,
                    (
                        user_id,
                        subscription.endpoint,
                        subscription.keys.p256dh,
                        subscription.keys.auth,
                        datetime.now(UTC),
                    ),
                )
                cursor.execute(
                    """
                    DELETE FROM push_reminders
                    WHERE user_id = %s AND endpoint = %s AND sent_at IS NULL
                    """,
                    (user_id, subscription.endpoint),
                )
                cursor.executemany(
                    """
                    INSERT INTO push_reminders (
                      user_id, endpoint, reminder_id, scheduled_at, sent_at
                    ) VALUES (%s, %s, %s, %s, NULL)
                    ON CONFLICT(user_id, endpoint, reminder_id) DO UPDATE SET
                      scheduled_at = excluded.scheduled_at,
                      sent_at = NULL,
                      attempts = 0,
                      next_attempt_at = NULL,
                      failed_at = NULL
                    """,
                    [
                        (
                            user_id,
                            subscription.endpoint,
                            reminder.id,
                            reminder.scheduledAt.astimezone(UTC),
                        )
                        for reminder in payload.reminders
                    ],
                )
        return len(payload.reminders)

    def delete_subscription(self, user_id: str, endpoint: str) -> bool:
        with self._connect() as connection:
            with connection.cursor() as cursor:
                cursor.execute(
                    "DELETE FROM push_subscriptions WHERE user_id = %s AND endpoint = %s",
                    (user_id, endpoint),
                )
                deleted = cursor.rowcount > 0
            connection.commit()
        return deleted

    def load_due(self, due_before: datetime, limit: int = 500) -> list[DuePushReminder]:
        with self._connect() as connection:
            with connection.cursor() as cursor:
                cursor.execute(
                    """
                    SELECT r.user_id, r.endpoint, s.p256dh, s.auth, r.reminder_id,
                           r.scheduled_at, r.attempts
                    FROM push_reminders r
                    JOIN push_subscriptions s
                      ON s.user_id = r.user_id AND s.endpoint = r.endpoint
                    WHERE r.sent_at IS NULL
                      AND r.failed_at IS NULL
                      AND r.scheduled_at <= %s
                      AND (r.next_attempt_at IS NULL OR r.next_attempt_at <= %s)
                    ORDER BY r.scheduled_at
                    LIMIT %s
                    """,
                    (due_before.astimezone(UTC), due_before.astimezone(UTC), limit),
                )
                rows = cursor.fetchall()
        return [
            DuePushReminder(
                user_id=row["user_id"],
                endpoint=row["endpoint"],
                p256dh=row["p256dh"],
                auth=row["auth"],
                reminder_id=row["reminder_id"],
                scheduled_at=row["scheduled_at"],
                attempts=row["attempts"],
            )
            for row in rows
        ]

    def mark_sent(self, reminder: DuePushReminder) -> None:
        with self._connect() as connection:
            with connection.cursor() as cursor:
                cursor.execute(
                    """
                    UPDATE push_reminders SET sent_at = %s
                    WHERE user_id = %s AND endpoint = %s AND reminder_id = %s
                    """,
                    (datetime.now(UTC), reminder.user_id, reminder.endpoint, reminder.reminder_id),
                )
            connection.commit()

    def mark_failed(self, reminder: DuePushReminder) -> None:
        attempts = reminder.attempts + 1
        failed_at = datetime.now(UTC) if attempts >= 5 else None
        delay_minutes = min(5 * (2 ** (attempts - 1)), 360)
        retry_base = max(datetime.now(UTC), reminder.scheduled_at.astimezone(UTC))
        next_attempt_at = retry_base + timedelta(minutes=delay_minutes)
        with self._connect() as connection:
            with connection.cursor() as cursor:
                cursor.execute(
                    """
                    UPDATE push_reminders
                    SET attempts = %s, next_attempt_at = %s, failed_at = %s
                    WHERE user_id = %s AND endpoint = %s AND reminder_id = %s
                    """,
                    (
                        attempts,
                        next_attempt_at,
                        failed_at,
                        reminder.user_id,
                        reminder.endpoint,
                        reminder.reminder_id,
                    ),
                )
            connection.commit()


def create_push_store(*, database_url: str | None, database_path: str):
    if database_url:
        if database_url.startswith(("postgresql://", "postgres://")):
            return PostgresPushStore(database_url)
        if database_url.startswith("sqlite:///"):
            return SqlitePushStore(database_url.removeprefix("sqlite:///"))
        raise ValueError("Unsupported NEURODIARY_DATABASE_URL scheme.")
    return SqlitePushStore(database_path)
