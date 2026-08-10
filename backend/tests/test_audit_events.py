from backend.app.audit_events import (
    AuditEventType,
    INVITATION_DECISION_EVENTS,
    TREATMENT_PROPOSAL_DECISION_EVENTS,
)


def test_audit_event_catalog_has_unique_stable_values():
    values = [event.value for event in AuditEventType]

    assert len(values) == len(set(values))
    assert all(value == value.lower() and " " not in value for value in values)


def test_dynamic_workflow_outcomes_are_explicitly_catalogued():
    assert set(INVITATION_DECISION_EVENTS) == {"accepted", "declined"}
    assert set(TREATMENT_PROPOSAL_DECISION_EVENTS) == {"approved", "declined", "returned"}
    assert all(isinstance(event, AuditEventType) for event in INVITATION_DECISION_EVENTS.values())
    assert all(isinstance(event, AuditEventType) for event in TREATMENT_PROPOSAL_DECISION_EVENTS.values())
