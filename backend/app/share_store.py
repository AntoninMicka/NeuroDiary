from __future__ import annotations

import json
import sqlite3
import uuid
from contextlib import contextmanager
from datetime import UTC, datetime, timedelta
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
            connection.execute(f"""
                CREATE TABLE IF NOT EXISTS diary_share_invitations (
                  invitation_id {identity_id}, owner_user_id TEXT NOT NULL,
                  recipient_email TEXT NOT NULL, recipient_user_id TEXT,
                  recipient_device_id TEXT, status TEXT NOT NULL,
                  created_at {timestamp} NOT NULL, updated_at {timestamp} NOT NULL,
                  expires_at {timestamp} NOT NULL, grant_id TEXT
                )
            """)
            connection.execute("""
                CREATE TABLE IF NOT EXISTS account_roles (
                  user_id TEXT NOT NULL, role TEXT NOT NULL,
                  PRIMARY KEY (user_id, role)
                )
            """)
            connection.execute("""
                CREATE TABLE IF NOT EXISTS device_active_roles (
                  user_id TEXT NOT NULL, device_id TEXT NOT NULL, role TEXT NOT NULL,
                  PRIMARY KEY (user_id, device_id, role)
                )
            """)
            connection.execute(f"""
                CREATE TABLE IF NOT EXISTS treatment_plan_proposals (
                  proposal_id {identity_id}, grant_id TEXT NOT NULL, owner_user_id TEXT NOT NULL,
                  proposer_user_id TEXT NOT NULL, base_revision INTEGER NOT NULL,
                  payload_json TEXT NOT NULL, status TEXT NOT NULL,
                  created_at {timestamp} NOT NULL, decided_at {timestamp}
                )
            """)
            connection.execute("""
                INSERT INTO account_roles (user_id, role)
                SELECT identities.user_id, 'patient' FROM share_identities identities
                WHERE NOT EXISTS (
                  SELECT 1 FROM account_roles roles WHERE roles.user_id = identities.user_id
                )
            """)
            connection.execute(
                "CREATE INDEX IF NOT EXISTS idx_share_invitation_owner ON diary_share_invitations(owner_user_id, created_at)"
            )
            connection.execute(
                "CREATE INDEX IF NOT EXISTS idx_share_invitation_recipient ON diary_share_invitations(recipient_email, status)"
            )
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
            has_roles = connection.execute(
                f"SELECT 1 FROM account_roles WHERE user_id = {placeholder} LIMIT 1", (user_id,),
            ).fetchone()
            if not has_roles:
                connection.execute(f"""
                    INSERT INTO account_roles (user_id, role) VALUES ({placeholder}, 'patient')
                    ON CONFLICT(user_id, role) DO NOTHING
                """, (user_id,))
            connection.execute(f"""
                UPDATE diary_share_invitations SET recipient_user_id = {placeholder}, updated_at = {placeholder}
                WHERE recipient_email = {placeholder} AND recipient_user_id IS NULL
                  AND status IN ('pending', 'accepted')
            """, (user_id, now if self.postgres else now.isoformat(), email.strip().lower()))
            connection.commit()

    def get_roles(self, user_id: str) -> list[str]:
        p = "%s" if self.postgres else "?"
        with self.connect() as connection:
            rows = connection.execute(
                f"SELECT role FROM account_roles WHERE user_id = {p} ORDER BY role", (user_id,),
            ).fetchall()
        return [row["role"] for row in rows]

    def has_role(self, user_id: str, role: str) -> bool:
        return role in self.get_roles(user_id)

    def add_role(self, user_id: str, role: str) -> None:
        p = "%s" if self.postgres else "?"
        with self.connect() as connection:
            connection.execute(f"""
                INSERT INTO account_roles (user_id, role) VALUES ({p}, {p})
                ON CONFLICT(user_id, role) DO NOTHING
            """, (user_id, role))
            connection.commit()

    def set_roles(self, user_id: str, roles: list[str]) -> bool:
        p = "%s" if self.postgres else "?"
        with self.connect() as connection:
            exists = connection.execute(
                f"SELECT 1 FROM share_identities WHERE user_id = {p}", (user_id,),
            ).fetchone()
            if not exists:
                return False
            connection.execute(f"DELETE FROM account_roles WHERE user_id = {p}", (user_id,))
            for role in roles:
                connection.execute(
                    f"INSERT INTO account_roles (user_id, role) VALUES ({p}, {p})", (user_id, role),
                )
            # Device preferences may only contain roles still assigned to the account.
            if roles:
                placeholders = ", ".join([p] * len(roles))
                connection.execute(
                    f"DELETE FROM device_active_roles WHERE user_id = {p} AND role NOT IN ({placeholders})",
                    (user_id, *roles),
                )
            else:
                connection.execute(f"DELETE FROM device_active_roles WHERE user_id = {p}", (user_id,))
            connection.commit()
        return True

    def list_users(self):
        with self.connect() as connection:
            rows = connection.execute(
                "SELECT user_id, email, display_name, updated_at FROM share_identities ORDER BY display_name, email"
            ).fetchall()
        return [{**dict(row), "roles": self.get_roles(row["user_id"])} for row in rows]

    def get_active_roles(self, user_id: str, device_id: str) -> list[str]:
        p = "%s" if self.postgres else "?"
        with self.connect() as connection:
            rows = connection.execute(f"""
                SELECT role FROM device_active_roles WHERE user_id = {p} AND device_id = {p} ORDER BY role
            """, (user_id, device_id)).fetchall()
        return [row["role"] for row in rows] or self.get_roles(user_id)

    def set_active_roles(self, user_id: str, device_id: str, roles: list[str]) -> None:
        p = "%s" if self.postgres else "?"
        with self.connect() as connection:
            connection.execute(
                f"DELETE FROM device_active_roles WHERE user_id = {p} AND device_id = {p}", (user_id, device_id),
            )
            for role in roles:
                connection.execute(
                    f"INSERT INTO device_active_roles (user_id, device_id, role) VALUES ({p}, {p}, {p})",
                    (user_id, device_id, role),
                )
            connection.commit()

    def find_identity(self, email: str):
        placeholder = "%s" if self.postgres else "?"
        with self.connect() as connection:
            return connection.execute(
                f"SELECT user_id, email, display_name FROM share_identities WHERE email = {placeholder}",
                (email.strip().lower(),),
            ).fetchone()

    def create_invitation(self, owner_id: str, recipient_email: str, recipient_id: str | None = None):
        now = datetime.now(UTC)
        expires_at = now + timedelta(days=14)
        invitation_id = str(uuid.uuid4())
        p = "%s" if self.postgres else "?"
        timestamp = lambda value: value if self.postgres else value.isoformat()
        with self.connect() as connection:
            connection.execute(f"""
                UPDATE diary_share_invitations SET status = 'cancelled', updated_at = {p}
                WHERE owner_user_id = {p} AND recipient_email = {p}
                  AND status IN ('pending', 'accepted')
            """, (timestamp(now), owner_id, recipient_email))
            connection.execute(f"""
                INSERT INTO diary_share_invitations
                  (invitation_id, owner_user_id, recipient_email, recipient_user_id,
                   recipient_device_id, status, created_at, updated_at, expires_at, grant_id)
                VALUES ({p}, {p}, {p}, {p}, NULL, 'pending', {p}, {p}, {p}, NULL)
            """, (invitation_id, owner_id, recipient_email, recipient_id, timestamp(now), timestamp(now), timestamp(expires_at)))
            connection.commit()
        return invitation_id

    def expire_invitations(self) -> None:
        now = datetime.now(UTC)
        p = "%s" if self.postgres else "?"
        value = now if self.postgres else now.isoformat()
        with self.connect() as connection:
            connection.execute(f"""
                UPDATE diary_share_invitations SET status = 'expired', updated_at = {p}
                WHERE status = 'pending' AND expires_at <= {p}
            """, (value, value))
            connection.commit()

    def list_outgoing_invitations(self, owner_id: str):
        self.expire_invitations()
        p = "%s" if self.postgres else "?"
        with self.connect() as connection:
            return connection.execute(f"""
                SELECT invitation_id, recipient_email, recipient_user_id, recipient_device_id,
                       status, created_at, updated_at, expires_at, grant_id
                FROM diary_share_invitations WHERE owner_user_id = {p}
                ORDER BY created_at DESC
            """, (owner_id,)).fetchall()

    def list_incoming_invitations(self, recipient_id: str, recipient_email: str):
        self.expire_invitations()
        p = "%s" if self.postgres else "?"
        with self.connect() as connection:
            return connection.execute(f"""
                SELECT inv.invitation_id, inv.owner_user_id, inv.status, inv.created_at,
                       inv.updated_at, inv.expires_at, owner.email AS owner_email,
                       owner.display_name AS owner_name
                FROM diary_share_invitations inv
                JOIN share_identities owner ON owner.user_id = inv.owner_user_id
                WHERE (inv.recipient_user_id = {p} OR (inv.recipient_user_id IS NULL AND inv.recipient_email = {p}))
                  AND inv.status IN ('pending', 'accepted')
                ORDER BY inv.created_at DESC
            """, (recipient_id, recipient_email)) .fetchall()

    def respond_to_invitation(self, invitation_id: str, recipient_id: str, recipient_email: str, device_id: str, accept: bool) -> bool:
        now = datetime.now(UTC)
        p = "%s" if self.postgres else "?"
        value = now if self.postgres else now.isoformat()
        status = "accepted" if accept else "declined"
        with self.connect() as connection:
            cursor = connection.execute(f"""
                UPDATE diary_share_invitations
                SET recipient_user_id = {p}, recipient_device_id = {p}, status = {p}, updated_at = {p}
                WHERE invitation_id = {p} AND recipient_email = {p} AND status = 'pending' AND expires_at > {p}
            """, (recipient_id, device_id, status, value, invitation_id, recipient_email, value))
            connection.commit()
            return cursor.rowcount == 1

    def get_invitation_for_owner(self, owner_id: str, invitation_id: str):
        p = "%s" if self.postgres else "?"
        with self.connect() as connection:
            return connection.execute(f"""
                SELECT * FROM diary_share_invitations
                WHERE invitation_id = {p} AND owner_user_id = {p}
            """, (invitation_id, owner_id)).fetchone()

    def activate_invitation(self, owner_id: str, invitation_id: str, grant_id: str) -> bool:
        now = datetime.now(UTC)
        p = "%s" if self.postgres else "?"
        value = now if self.postgres else now.isoformat()
        with self.connect() as connection:
            cursor = connection.execute(f"""
                UPDATE diary_share_invitations SET status = 'active', grant_id = {p}, updated_at = {p}
                WHERE invitation_id = {p} AND owner_user_id = {p} AND status = 'accepted'
            """, (grant_id, value, invitation_id, owner_id))
            connection.commit()
            return cursor.rowcount == 1

    def cancel_invitation(self, owner_id: str, invitation_id: str) -> bool:
        now = datetime.now(UTC)
        p = "%s" if self.postgres else "?"
        value = now if self.postgres else now.isoformat()
        with self.connect() as connection:
            cursor = connection.execute(f"""
                UPDATE diary_share_invitations SET status = 'cancelled', updated_at = {p}
                WHERE invitation_id = {p} AND owner_user_id = {p} AND status IN ('pending', 'accepted')
            """, (value, invitation_id, owner_id))
            connection.commit()
            return cursor.rowcount == 1

    def mark_grant_revoked(self, owner_id: str, grant_id: str) -> None:
        now = datetime.now(UTC)
        p = "%s" if self.postgres else "?"
        value = now if self.postgres else now.isoformat()
        with self.connect() as connection:
            connection.execute(f"""
                UPDATE diary_share_invitations SET status = 'revoked', updated_at = {p}
                WHERE owner_user_id = {p} AND grant_id = {p} AND status = 'active'
            """, (value, owner_id, grant_id))
            connection.commit()

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
            row = connection.execute(f"""
                SELECT grant_id FROM diary_share_grants
                WHERE owner_user_id = {p} AND recipient_user_id = {p} AND recipient_device_id = {p}
            """, (owner_id, recipient_id, device_id)).fetchone()
        return row["grant_id"]

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

    def create_treatment_proposal(self, grant_id: str, proposer_id: str, base_revision: int, payload: dict):
        p = "%s" if self.postgres else "?"
        now = datetime.now(UTC)
        value = now if self.postgres else now.isoformat()
        proposal_id = str(uuid.uuid4())
        with self.connect() as connection:
            grant = connection.execute(f"""
                SELECT owner_user_id FROM diary_share_grants
                WHERE grant_id = {p} AND recipient_user_id = {p} AND revoked_at IS NULL
            """, (grant_id, proposer_id)).fetchone()
            if not grant:
                return None
            connection.execute(f"""
                INSERT INTO treatment_plan_proposals
                  (proposal_id, grant_id, owner_user_id, proposer_user_id, base_revision, payload_json, status, created_at, decided_at)
                VALUES ({p}, {p}, {p}, {p}, {p}, {p}, 'pending', {p}, NULL)
            """, (proposal_id, grant_id, grant["owner_user_id"], proposer_id, base_revision, json.dumps(payload), value))
            connection.commit()
        return proposal_id

    def list_treatment_proposals(self, user_id: str):
        p = "%s" if self.postgres else "?"
        with self.connect() as connection:
            return connection.execute(f"""
                SELECT proposals.proposal_id AS "proposalId", proposals.grant_id AS "grantId",
                       proposals.owner_user_id AS "ownerUserId", owner.display_name AS "ownerName",
                       proposals.proposer_user_id AS "proposerUserId", proposer.display_name AS "proposerName",
                       proposals.base_revision AS "baseRevision", proposals.payload_json, proposals.status,
                       proposals.created_at AS "createdAt", proposals.decided_at AS "decidedAt"
                FROM treatment_plan_proposals proposals
                JOIN share_identities owner ON owner.user_id = proposals.owner_user_id
                JOIN share_identities proposer ON proposer.user_id = proposals.proposer_user_id
                WHERE proposals.owner_user_id = {p} OR proposals.proposer_user_id = {p}
                ORDER BY proposals.created_at DESC
            """, (user_id, user_id)).fetchall()

    def get_treatment_proposal(self, proposal_id: str):
        p = "%s" if self.postgres else "?"
        with self.connect() as connection:
            return connection.execute(
                f"SELECT * FROM treatment_plan_proposals WHERE proposal_id = {p}", (proposal_id,),
            ).fetchone()

    def decide_treatment_proposal(self, proposal_id: str, owner_id: str, status: str) -> bool:
        p = "%s" if self.postgres else "?"
        now = datetime.now(UTC)
        with self.connect() as connection:
            cursor = connection.execute(f"""
                UPDATE treatment_plan_proposals SET status = {p}, decided_at = {p}
                WHERE proposal_id = {p} AND owner_user_id = {p} AND status = 'pending'
            """, (status, now if self.postgres else now.isoformat(), proposal_id, owner_id))
            connection.commit()
            return cursor.rowcount == 1

    def cancel_treatment_proposal(self, proposal_id: str, proposer_id: str) -> bool:
        p = "%s" if self.postgres else "?"
        now = datetime.now(UTC)
        with self.connect() as connection:
            cursor = connection.execute(f"""
                UPDATE treatment_plan_proposals SET status = 'cancelled', decided_at = {p}
                WHERE proposal_id = {p} AND proposer_user_id = {p} AND status = 'pending'
            """, (now if self.postgres else now.isoformat(), proposal_id, proposer_id))
            connection.commit()
            return cursor.rowcount == 1
