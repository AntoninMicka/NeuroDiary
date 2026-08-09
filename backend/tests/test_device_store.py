from backend.app.device_store import SqliteDeviceStore


def test_device_registry_revoke_and_revoke_others(tmp_path):
    store = SqliteDeviceStore(str(tmp_path / "devices.db"))
    store.initialize()
    first = store.upsert("user", "device-0000000001", "Telefon")
    store.upsert("user", "device-0000000002", "Notebook")

    assert first.revoked_at is None
    assert store.is_active("user", "device-0000000001") is True
    assert store.is_active("user", "device-0000000002") is False
    store.trust("user", "device-0000000002")
    assert store.revoke_others("user", "device-0000000001") == 1
    assert store.is_active("user", "device-0000000002") is False

    # A revoked installation cannot reactivate itself by registering again.
    store.upsert("user", "device-0000000002", "Notebook renamed")
    assert store.is_active("user", "device-0000000002") is False

    store.revoke("user", "device-0000000001")
    assert store.is_active("user", "device-0000000001") is False


def test_device_alias_can_only_rename_an_active_device_of_same_user(tmp_path):
    store = SqliteDeviceStore(str(tmp_path / "devices.db"))
    store.initialize()
    store.upsert("user-a", "device-0000000001", "Firefox")

    renamed = store.rename("user-a", "device-0000000001", "Domácí notebook")
    assert renamed.name == "Domácí notebook"
    store.upsert("user-a", "device-0000000001", "Automatický název prohlížeče")
    assert store.get("user-a", "device-0000000001").name == "Domácí notebook"
    assert store.rename("user-b", "device-0000000001", "Cizí alias") is None
    store.revoke("user-a", "device-0000000001")
    assert store.rename("user-a", "device-0000000001", "Odvolané") is None
