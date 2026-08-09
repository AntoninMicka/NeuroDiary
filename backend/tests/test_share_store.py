from backend.app.share_store import ShareStore


def test_share_grants_are_scoped_to_owner_recipient_and_device(tmp_path):
    store = ShareStore(str(tmp_path / "shares.db"))
    store.initialize()
    store.register_identity("owner-a", "owner@example.test", "Owner")
    store.register_identity("reader-b", "reader@example.test", "Reader")
    store.register_identity("other-c", "other@example.test", "Other")

    store.save_grant(
        "owner-a", "reader-b", "reader-device-0001", 2,
        {"algorithm": "RSA-OAEP-3072-SHA256", "cipherText": "opaque", "targetFingerprint": "a" * 64},
    )

    assert len(store.get_outgoing("owner-a")) == 1
    assert len(store.get_incoming("reader-b", "reader-device-0001")) == 1
    assert store.get_incoming("reader-b", "different-device-01") == []
    assert store.get_incoming("other-c", "reader-device-0001") == []


def test_only_owner_can_revoke_share(tmp_path):
    store = ShareStore(str(tmp_path / "shares.db"))
    store.initialize()
    store.register_identity("owner-a", "owner@example.test", "Owner")
    store.register_identity("reader-b", "reader@example.test", "Reader")
    store.save_grant("owner-a", "reader-b", "reader-device-0001", 1, {"cipherText": "opaque"})
    grant_id = store.get_outgoing("owner-a")[0]["grant_id"]

    assert store.revoke("reader-b", grant_id) is False
    assert len(store.get_incoming("reader-b", "reader-device-0001")) == 1
    assert store.revoke("owner-a", grant_id) is True
    assert store.get_incoming("reader-b", "reader-device-0001") == []
