import importlib
from datetime import UTC, datetime, timedelta

from backend.app.auth import AuthenticatedUser
from backend.app.audit_events import (
    AuditEventType,
    INVITATION_DECISION_EVENTS,
    TREATMENT_PROPOSAL_DECISION_EVENTS,
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
