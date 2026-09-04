import base64
import hashlib
import json

import pytest
from fastapi import HTTPException

from backend.app.auth import AuthManager


def test_local_user_file_authentication(monkeypatch, tmp_path):
    salt = b"0123456789abcdef"
    digest = hashlib.scrypt(b"correct horse battery staple", salt=salt, n=16384, r=8, p=1, dklen=32)
    users_file = tmp_path / "users.json"
    users_file.write_text(json.dumps({"version": 1, "users": [{
        "username": "antonin", "userId": "owner", "name": "Antonín", "email": "a@example.test",
        "password": {"algorithm": "scrypt", "n": 16384, "r": 8, "p": 1,
                     "salt": base64.b64encode(salt).decode(), "hash": base64.b64encode(digest).decode()},
    }]}))
    monkeypatch.setenv("NEURODIARY_LOCAL_USERS_FILE", str(users_file))
    monkeypatch.setenv("NEURODIARY_SESSION_SECRET", "test-secret")
    manager = AuthManager()

    user, token, _ = manager.authenticate_local_user("ANTONIN", "correct horse battery staple")
    assert user.user_id == "local:owner"
    assert manager.decode_session_token(token).provider == "local"
    with pytest.raises(HTTPException) as error:
        manager.authenticate_local_user("antonin", "wrong password")
    assert error.value.status_code == 401


def test_local_user_management_preserves_an_admin(monkeypatch, tmp_path):
    users_file = tmp_path / "users.json"
    users_file.write_text(json.dumps({"version": 1, "users": [{
        "username": "owner", "userId": "owner", "name": "Owner", "email": "",
        "password": {"algorithm": "scrypt", "n": 16384, "r": 8, "p": 1,
                     "salt": base64.b64encode(b"0123456789abcdef").decode(), "hash": base64.b64encode(b"x" * 32).decode()},
    }]}))
    monkeypatch.setenv("NEURODIARY_LOCAL_USERS_FILE", str(users_file))
    manager = AuthManager()

    assert manager.local_user_roles("local:owner") == ["admin", "patient"]
    manager.save_local_user(username="patient", password="long-enough-password", name="Patient", email="", roles=["patient"])
    assert len(manager.list_local_users()) == 2
    manager.delete_local_user("local:patient")
    with pytest.raises(HTTPException) as error:
        manager.delete_local_user("local:owner")
    assert error.value.status_code == 400
