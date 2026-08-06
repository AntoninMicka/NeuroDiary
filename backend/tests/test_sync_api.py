import importlib

import pytest

from backend.app.auth import AuthenticatedUser
from backend.app.models import SyncPushRequestModel


def load_app(monkeypatch, tmp_path):
    monkeypatch.setenv("NEURODIARY_DATABASE_URL", "")
    monkeypatch.setenv("NEURODIARY_DATABASE_PATH", str(tmp_path / "sync.db"))
    monkeypatch.setenv("NEURODIARY_SESSION_SECRET", "test-session-secret")
    monkeypatch.delenv("NEURODIARY_API_TOKEN", raising=False)

    import backend.app.main as main

    main = importlib.reload(main)
    main.on_startup()
    return main


def authenticated_user_id(main, user_id="google:user-a"):
    token, _ = main.auth_manager.build_session_token(
        AuthenticatedUser(
            provider="google",
            user_id=user_id,
            email=f"{user_id}@example.test",
            name=user_id,
        )
    )
    return main.auth_manager.resolve_authorization(f"Bearer {token}")


def encrypted_payload(cipher_text):
    return {
        "schemaVersion": 1,
        "algorithm": "AES-GCM",
        "keyVersion": 1,
        "iv": "test-iv",
        "cipherText": cipher_text,
    }


def encrypted_payload_version(cipher_text, key_version):
    return {**encrypted_payload(cipher_text), "keyVersion": key_version}


def test_sync_push_pull_conflict_and_reset(monkeypatch, tmp_path):
    main = load_app(monkeypatch, tmp_path)
    user_id = authenticated_user_id(main)
    first_payload = encrypted_payload("first-snapshot")
    second_payload = encrypted_payload("second-snapshot")

    initial_pull = main.pull_state(user_id)
    pushed = main.push_state(
        SyncPushRequestModel(baseRevision=0, payload=first_payload),
        user_id,
    )
    pulled = main.pull_state(user_id)
    conflict = main.push_state(
        SyncPushRequestModel(baseRevision=0, payload=second_payload),
        user_id,
    )
    reset = main.reset_state(user_id)
    after_reset = main.pull_state(user_id)

    assert initial_pull.model_dump(mode="json") == {
        "revision": 0,
        "updatedAt": None,
        "payload": None,
        "wrappedKey": None,
    }
    assert pushed.status == "ok"
    assert pushed.revision == 1
    assert pulled.payload.model_dump() == first_payload
    assert conflict.status == "conflict"
    assert conflict.revision == 1
    assert conflict.payload.model_dump() == first_payload
    assert reset.deleted is True
    assert after_reset.revision == 0
    assert after_reset.payload is None


def test_sync_snapshots_are_isolated_by_authenticated_user(monkeypatch, tmp_path):
    main = load_app(monkeypatch, tmp_path)
    user_a_id = authenticated_user_id(main, "google:user-a")
    user_b_id = authenticated_user_id(main, "google:user-b")

    main.push_state(
        SyncPushRequestModel(
            baseRevision=0,
            payload=encrypted_payload("user-a-secret"),
        ),
        user_a_id,
    )
    user_b_pull = main.pull_state(user_b_id)
    user_b_reset = main.reset_state(user_b_id)
    user_a_pull = main.pull_state(user_a_id)

    assert user_b_pull.revision == 0
    assert user_b_pull.payload is None
    assert user_b_reset.deleted is True
    assert user_a_pull.revision == 1
    assert user_a_pull.payload.cipherText == "user-a-secret"


def test_force_push_cannot_downgrade_encryption_key_version(monkeypatch, tmp_path):
    main = load_app(monkeypatch, tmp_path)
    user_id = authenticated_user_id(main)
    rotated = main.push_state(
        SyncPushRequestModel(baseRevision=0, payload=encrypted_payload_version("new-key", 2), force=True),
        user_id,
    )
    stale = main.push_state(
        SyncPushRequestModel(baseRevision=rotated.revision, payload=encrypted_payload_version("old-key", 1), force=True),
        user_id,
    )

    assert stale.status == "conflict"
    assert stale.payload.keyVersion == 2
    assert stale.payload.cipherText == "new-key"
