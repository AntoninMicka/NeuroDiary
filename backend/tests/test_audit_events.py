import importlib
from datetime import UTC, datetime, timedelta

import pytest
from fastapi import HTTPException

from backend.app.auth import AuthenticatedUser
from backend.app.audit_events import (
    AUDIT_DETAIL_FIELDS,
    AuditEventType,
    INVITATION_DECISION_EVENTS,
    TREATMENT_PROPOSAL_DECISION_EVENTS,
    validate_audit_details,
)
from backend.app.models import DeviceRegistrationRequestModel, IdentityExchangeRequestModel
from backend.app.key_exchange_store import SqliteKeyExchangeStore


def load_app(monkeypatch, tmp_path):
    monkeypatch.setenv("NEURODIARY_DATABASE_URL", "")
    monkeypatch.setenv("NEURODIARY_DATABASE_PATH", str(tmp_path / "audit.db"))
    monkeypatch.setenv("NEURODIARY_SESSION_SECRET", "audit-test-secret")

    import backend.app.main as main

    main = importlib.reload(main)
    main.on_startup()
    return main


def authorization(main, user_id):
    token, _ = main.auth_manager.build_session_token(AuthenticatedUser(
        provider="google",
        user_id=user_id,
        email=f"{user_id.removeprefix('google:')}@example.test",
        name=user_id,
    ))
    return f"Bearer {token}"


def test_audit_event_catalog_has_unique_stable_values():
    values = [event.value for event in AuditEventType]

    assert len(values) == len(set(values))
    assert all(value == value.lower() and " " not in value for value in values)
    assert set(AUDIT_DETAIL_FIELDS) == set(AuditEventType)


def test_dynamic_workflow_outcomes_are_explicitly_catalogued():
    assert set(INVITATION_DECISION_EVENTS) == {"accepted", "declined"}
    assert set(TREATMENT_PROPOSAL_DECISION_EVENTS) == {"approved", "declined", "returned"}
    assert all(isinstance(event, AuditEventType) for event in INVITATION_DECISION_EVENTS.values())
    assert all(isinstance(event, AuditEventType) for event in TREATMENT_PROPOSAL_DECISION_EVENTS.values())


def test_successful_identity_exchange_is_audited_without_token(monkeypatch, tmp_path):
    main = load_app(monkeypatch, tmp_path)
    user = AuthenticatedUser(
        provider="google",
        user_id="google:audit-user",
        email="audit@example.test",
        name="Audit User",
    )
    monkeypatch.setattr(
        main.auth_manager,
        "exchange_identity_token",
        lambda **_kwargs: (user, "secret-session-token", datetime.now(UTC) + timedelta(days=30)),
    )

    main.exchange_identity_token(IdentityExchangeRequestModel(provider="google", idToken="identity-token"))

    [event] = main.key_exchange_store.list_audit(user.user_id)
    assert event["event_type"] == AuditEventType.AUTH_SESSION_CREATED.value
    assert event["device_id"] == "authentication"
    assert "token" not in event["details_json"].lower()


def test_bulk_device_revocation_records_affected_count(monkeypatch, tmp_path):
    main = load_app(monkeypatch, tmp_path)
    user_id = "google:audit-user"
    current = "device-0000000001"
    other = "device-0000000002"
    main.register_current_device(DeviceRegistrationRequestModel(deviceId=current, name="Current"), user_id)
    main.register_current_device(DeviceRegistrationRequestModel(deviceId=other, name="Other"), user_id)

    result = main.revoke_other_devices(user_id, current)

    assert result.affected == 1
    event = main.key_exchange_store.list_audit(user_id)[0]
    assert event["event_type"] == AuditEventType.OTHER_DEVICES_REVOKED.value
    assert event["details_json"] == '{"affected":1}'


@pytest.mark.parametrize("field", ["accessToken", "recoverySecret", "privateKey", "healthPayload"])
def test_sensitive_or_unknown_audit_metadata_is_rejected(field):
    with pytest.raises(ValueError, match="Unexpected audit detail fields"):
        validate_audit_details(AuditEventType.AUTH_SESSION_CREATED, {"provider": "google", field: "secret"})


def test_audit_metadata_rejects_large_or_structured_values():
    with pytest.raises(ValueError, match="exceeds 256"):
        validate_audit_details(AuditEventType.AUTH_SESSION_CREATED, {"provider": "x" * 257})
    with pytest.raises(ValueError, match="unsupported value type"):
        validate_audit_details(AuditEventType.AUTH_SESSION_CREATED, {"provider": {"token": "secret"}})
    with pytest.raises(ValueError, match="invalid list"):
        validate_audit_details(AuditEventType.DEVICE_ACTIVE_ROLES_CHANGED, {"roles": ["x" * 65]})


def test_invalid_metadata_is_not_persisted_and_does_not_break_operation(monkeypatch, tmp_path):
    main = load_app(monkeypatch, tmp_path)

    main.audit_security(
        "google:audit-user",
        "authentication",
        AuditEventType.AUTH_SESSION_CREATED,
        provider="google",
        accessToken="must-not-be-stored",
    )

    assert main.key_exchange_store.list_audit("google:audit-user") == []


def test_audit_api_uses_stable_cursor_pagination_and_labels(monkeypatch, tmp_path):
    main = load_app(monkeypatch, tmp_path)
    user_id = "google:audit-user"
    for _ in range(3):
        main.audit_security(user_id, "device-0000000001", AuditEventType.SYNC_STATE_RESET)

    first = main.list_security_audit(user_id, limit=2, cursor=None)
    second = main.list_security_audit(user_id, limit=2, cursor=first.nextCursor)

    assert len(first.events) == 2
    assert first.nextCursor == first.events[-1].eventId
    assert first.events[0].label == "Odstraněna cloudová data deníku"
    assert [event.eventId for event in first.events + second.events] == [
        item["event_id"] for item in main.key_exchange_store.list_audit(user_id)
    ]
    assert second.nextCursor is None


def test_recording_audit_event_removes_items_past_retention(tmp_path):
    store = SqliteKeyExchangeStore(str(tmp_path / "retention.db"), audit_retention_days=30)
    store.initialize()
    expired_at = datetime.now(UTC) - timedelta(days=31)
    with store._connect() as connection:
        connection.execute(
            """INSERT INTO security_audit_events
               (event_id, user_id, device_id, event_type, details_json, created_at)
               VALUES (?, ?, ?, ?, ?, ?)""",
            ("expired", "user", "device", "sync_state_reset", "{}", expired_at.isoformat()),
        )
        connection.commit()

    store.record_audit("current", "user", "device", "sync_state_reset", "{}")

    assert [event["event_id"] for event in store.list_audit("user")] == ["current"]


def test_audit_integrity_detects_modified_event(tmp_path):
    store = SqliteKeyExchangeStore(str(tmp_path / "integrity.db"), audit_integrity_key="test-integrity-key")
    store.initialize()
    store.record_audit("first", "user", "device", "sync_state_reset", "{}")
    store.record_audit("second", "user", "device", "device_revoked", '{"revokedDeviceId":"old"}')
    assert store.verify_audit("user") == {"status": "verified", "checked": 2}

    with store._connect() as connection:
        connection.execute(
            "UPDATE security_audit_events SET details_json = ? WHERE event_id = ?",
            ('{"revokedDeviceId":"changed"}', "second"),
        )
        connection.commit()

    assert store.verify_audit("user")["status"] == "failed"


def test_audit_integrity_detects_deleted_tail_event(tmp_path):
    store = SqliteKeyExchangeStore(str(tmp_path / "deleted.db"), audit_integrity_key="test-integrity-key")
    store.initialize()
    store.record_audit("first", "user", "device", "sync_state_reset", "{}")
    store.record_audit("second", "user", "device", "sync_state_reset", "{}")
    with store._connect() as connection:
        connection.execute("DELETE FROM security_audit_events WHERE event_id = ?", ("second",))
        connection.commit()

    assert store.verify_audit("user")["status"] == "failed"


def test_audit_endpoint_requires_authentication_and_trusted_device(monkeypatch, tmp_path):
    main = load_app(monkeypatch, tmp_path)
    user_id = "google:secured-user"
    trusted = "device-0000000001"
    untrusted = "device-0000000002"
    main.register_current_device(DeviceRegistrationRequestModel(deviceId=trusted, name="Trusted"), user_id)
    main.audit_security(user_id, trusted, AuditEventType.SYNC_STATE_RESET)

    with pytest.raises(HTTPException) as unauthenticated:
        main.verify_bearer_token(None)
    assert unauthenticated.value.status_code == 401

    resolved_user = main.verify_bearer_token(authorization(main, user_id))
    with pytest.raises(HTTPException) as untrusted_error:
        main.verify_trusted_device(resolved_user, untrusted)
    assert untrusted_error.value.status_code == 403
    assert main.verify_trusted_device(resolved_user, trusted) == user_id
    assert main.list_security_audit(resolved_user, limit=50, cursor=None).events

    main.device_store.revoke(user_id, trusted)
    with pytest.raises(HTTPException) as revoked_error:
        main.verify_trusted_device(resolved_user, trusted)
    assert revoked_error.value.status_code == 403


def test_audit_endpoint_isolates_accounts_and_rejects_foreign_cursor(monkeypatch, tmp_path):
    main = load_app(monkeypatch, tmp_path)
    user_a = "google:user-a"
    user_b = "google:user-b"
    device_a = "device-a-00000001"
    device_b = "device-b-00000001"
    main.register_current_device(DeviceRegistrationRequestModel(deviceId=device_a, name="A"), user_a)
    main.register_current_device(DeviceRegistrationRequestModel(deviceId=device_b, name="B"), user_b)
    main.audit_security(user_a, device_a, AuditEventType.SYNC_STATE_RESET)
    main.audit_security(user_b, device_b, AuditEventType.SYNC_STATE_RESET)
    main.audit_security(user_b, device_b, AuditEventType.PUSH_NOTIFICATIONS_DISABLED)

    resolved_a = main.verify_bearer_token(authorization(main, user_a))
    resolved_b = main.verify_bearer_token(authorization(main, user_b))
    main.verify_trusted_device(resolved_a, device_a)
    main.verify_trusted_device(resolved_b, device_b)
    response_a = main.list_security_audit(resolved_a, limit=100, cursor=None)
    response_b = main.list_security_audit(resolved_b, limit=1, cursor=None)

    assert response_a.events
    assert {event.deviceId for event in response_a.events} == {device_a}
    assert response_b.nextCursor

    foreign_page = main.list_security_audit(resolved_a, limit=50, cursor=response_b.nextCursor)
    assert foreign_page.events == []
