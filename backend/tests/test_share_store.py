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


def test_invitation_is_claimed_by_existing_or_later_registered_account(tmp_path):
    store = ShareStore(str(tmp_path / "shares.db"))
    store.initialize()
    store.register_identity("owner-a", "owner@example.test", "Owner")
    invitation_id = store.create_invitation("owner-a", "reader@example.test")

    assert store.list_incoming_invitations("reader-b", "reader@example.test")[0]["invitation_id"] == invitation_id
    store.register_identity("reader-b", "reader@example.test", "Reader")
    invitation = store.list_outgoing_invitations("owner-a")[0]
    assert invitation["recipient_user_id"] == "reader-b"


def test_invitation_requires_recipient_response_before_activation(tmp_path):
    store = ShareStore(str(tmp_path / "shares.db"))
    store.initialize()
    store.register_identity("owner-a", "owner@example.test", "Owner")
    store.register_identity("reader-b", "reader@example.test", "Reader")
    invitation_id = store.create_invitation("owner-a", "reader@example.test", "reader-b")

    assert store.activate_invitation("owner-a", invitation_id, "grant-1") is False
    assert store.respond_to_invitation(
        invitation_id, "reader-b", "reader@example.test", "reader-device-0001", True,
    ) is True
    assert store.activate_invitation("other-owner", invitation_id, "grant-1") is False
    assert store.activate_invitation("owner-a", invitation_id, "grant-1") is True
    assert store.list_outgoing_invitations("owner-a")[0]["status"] == "active"


def test_invitation_cannot_be_accepted_by_another_email(tmp_path):
    store = ShareStore(str(tmp_path / "shares.db"))
    store.initialize()
    store.register_identity("owner-a", "owner@example.test", "Owner")
    invitation_id = store.create_invitation("owner-a", "reader@example.test")

    assert store.respond_to_invitation(
        invitation_id, "attacker-c", "attacker@example.test", "attacker-device-1", True,
    ) is False
    assert store.list_outgoing_invitations("owner-a")[0]["status"] == "pending"


def test_account_roles_and_device_active_roles_are_separate(tmp_path):
    store = ShareStore(str(tmp_path / "shares.db"))
    store.initialize()
    store.register_identity("multi-role", "roles@example.test", "Role User")
    assert store.get_roles("multi-role") == ["patient"]

    assert store.set_roles("multi-role", ["patient", "doctor"]) is True
    store.set_active_roles("multi-role", "device-1", ["doctor"])
    store.set_active_roles("multi-role", "device-2", ["patient"])
    assert store.get_active_roles("multi-role", "device-1") == ["doctor"]
    assert store.get_active_roles("multi-role", "device-2") == ["patient"]

    # Re-registering the identity must not silently restore a role removed by an administrator.
    store.set_roles("multi-role", ["doctor"])
    store.register_identity("multi-role", "roles@example.test", "Role User")
    assert store.get_roles("multi-role") == ["doctor"]
    assert store.get_active_roles("multi-role", "device-2") == ["doctor"]


def test_treatment_proposal_is_scoped_to_active_grant_and_decided_by_owner(tmp_path):
    store = ShareStore(str(tmp_path / "shares.db"))
    store.initialize()
    store.register_identity("patient", "patient@example.test", "Patient")
    store.register_identity("doctor", "doctor@example.test", "Doctor")
    store.save_grant("patient", "doctor", "doctor-device-01", 1, {"cipherText": "key"})
    grant_id = store.get_outgoing("patient")[0]["grant_id"]

    proposal_id = store.create_treatment_proposal(grant_id, "doctor", 7, {"cipherText": "opaque"})
    assert proposal_id
    assert store.create_treatment_proposal(grant_id, "other", 7, {"cipherText": "opaque"}) is None
    assert store.list_treatment_proposals("patient")[0]["status"] == "pending"
    assert store.decide_treatment_proposal(proposal_id, "doctor", "approved") is False
    assert store.decide_treatment_proposal(proposal_id, "patient", "approved") is True
    assert store.list_treatment_proposals("doctor")[0]["status"] == "approved"


def test_doctor_can_cancel_only_own_pending_treatment_proposal(tmp_path):
    store = ShareStore(str(tmp_path / "shares.db"))
    store.initialize()
    store.register_identity("patient", "patient@example.test", "Patient")
    store.register_identity("doctor", "doctor@example.test", "Doctor")
    store.save_grant("patient", "doctor", "doctor-device-01", 1, {"cipherText": "key"})
    grant_id = store.get_outgoing("patient")[0]["grant_id"]
    proposal_id = store.create_treatment_proposal(grant_id, "doctor", 1, {"cipherText": "opaque"})

    assert store.cancel_treatment_proposal(proposal_id, "other") is False
    assert store.cancel_treatment_proposal(proposal_id, "doctor") is True
    assert store.cancel_treatment_proposal(proposal_id, "doctor") is False
    assert store.list_treatment_proposals("patient")[0]["status"] == "cancelled"
