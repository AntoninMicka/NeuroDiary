import importlib

import pytest
from fastapi import HTTPException

from backend.app.auth import AuthenticatedUser


def load_app(monkeypatch, tmp_path):
    monkeypatch.setenv("NEURODIARY_DATABASE_URL", "")
    monkeypatch.setenv("NEURODIARY_DATABASE_PATH", str(tmp_path / "admin.db"))
    monkeypatch.setenv("NEURODIARY_SESSION_SECRET", "admin-test-secret")
    monkeypatch.setenv("NEURODIARY_ADMIN_EMAILS", "admin@example.cz")

    import backend.app.main as main

    main = importlib.reload(main)
    main.on_startup()
    return main


def session_header(main, email):
    token, _ = main.auth_manager.build_session_token(AuthenticatedUser(
        provider="google",
        user_id=f"google:{email}",
        email=email,
        name=email,
    ))
    return f"Bearer {token}"


def test_admin_requires_allowlisted_federated_email(monkeypatch, tmp_path):
    main = load_app(monkeypatch, tmp_path)

    admin = main.verify_admin(session_header(main, "admin@example.cz"))
    assert admin.email == "admin@example.cz"

    with pytest.raises(HTTPException) as denied:
        main.verify_admin(session_header(main, "user@example.cz"))
    assert denied.value.status_code == 403

    main.auth_manager.api_token = "legacy-token"
    with pytest.raises(HTTPException) as legacy_denied:
        main.verify_admin("Bearer legacy-token")
    assert legacy_denied.value.status_code == 403


def test_admin_status_does_not_expose_secrets(monkeypatch, tmp_path):
    main = load_app(monkeypatch, tmp_path)
    monkeypatch.setattr(main.cloud_admin_service, "get_status", lambda: {"configured": False, "warnings": []})
    admin = main.verify_admin(session_header(main, "admin@example.cz"))

    result = main.admin_status(admin)

    assert result["administrator"] == "admin@example.cz"
    assert result["application"]["adminCount"] == 1
    assert "accessToken" not in str(result)
    assert "admin-test-secret" not in str(result)
