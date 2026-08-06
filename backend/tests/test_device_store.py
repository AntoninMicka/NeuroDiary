from backend.app.device_store import SqliteDeviceStore


def test_device_registry_revoke_and_revoke_others(tmp_path):
    store = SqliteDeviceStore(str(tmp_path / "devices.db"))
    store.initialize()
    first = store.upsert("user", "device-0000000001", "Telefon")
    store.upsert("user", "device-0000000002", "Notebook")

    assert first.revoked_at is None
    assert store.is_active("user", "device-0000000001") is True
    assert store.revoke_others("user", "device-0000000001") == 1
    assert store.is_active("user", "device-0000000002") is False

    # A revoked installation cannot reactivate itself by registering again.
    store.upsert("user", "device-0000000002", "Notebook renamed")
    assert store.is_active("user", "device-0000000002") is False

    store.revoke("user", "device-0000000001")
    assert store.is_active("user", "device-0000000001") is False
