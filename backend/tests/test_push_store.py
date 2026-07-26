from datetime import UTC, datetime, timedelta

from backend.app.models import PushRegistrationRequestModel
from backend.app.push_store import SqlitePushStore


def test_sqlite_push_registration_replaces_pending_schedule(tmp_path):
    store = SqlitePushStore(str(tmp_path / "push.db"))
    store.initialize()
    endpoint = "https://push.example/subscription"
    first_due = datetime.now(UTC) + timedelta(minutes=5)
    payload = PushRegistrationRequestModel.model_validate(
        {
            "subscription": {
                "endpoint": endpoint,
                "keys": {"p256dh": "public-key", "auth": "auth-key"},
            },
            "reminders": [
                {"id": "first", "scheduledAt": first_due.isoformat(), "type": "medication"},
            ],
        }
    )
    assert store.replace_registration("user", payload) == 1
    due = store.load_due(first_due + timedelta(seconds=1))
    assert len(due) == 1
    store.mark_failed(due[0])
    assert store.load_due(first_due + timedelta(minutes=1)) == []

    replacement = PushRegistrationRequestModel.model_validate(
        {
            "subscription": {
                "endpoint": endpoint,
                "keys": {"p256dh": "public-key", "auth": "auth-key"},
            },
            "reminders": [],
        }
    )
    assert store.replace_registration("user", replacement) == 0
    assert store.load_due(first_due + timedelta(seconds=1)) == []
