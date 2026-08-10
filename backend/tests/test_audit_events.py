import importlib
from datetime import UTC, datetime, timedelta

import pytest

from backend.app.auth import AuthenticatedUser
from backend.app.audit_events import (
    AUDIT_DETAIL_FIELDS,
    AuditEventType,
    INVITATION_DECISION_EVENTS,
    TREATMENT_PROPOSAL_DECISION_EVENTS,
    validate_audit_details,
)
from backend.app.models import DeviceRegistrationRequestModel, IdentityExchangeRequestModel


def load_app(monkeypatch, tmp_path):
    monkeypatch.setenv("NEURODIARY_DATABASE_URL", "")
    monkeypatch.setenv("NEURODIARY_DATABASE_PATH", str(tmp_path / "audit.db"))
    monkeypatch.setenv("NEURODIARY_SESSION_SECRET", "audit-test-secret")

    import backend.app.main as main

    main = importlib.reload(main)
    main.on_startup()
    return main


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
