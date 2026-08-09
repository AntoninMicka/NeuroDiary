import importlib

import pytest
from fastapi import HTTPException

from backend.app.auth import AuthenticatedUser
from backend.app.models import (
    ShareInvitationActivationModel,
    ShareInvitationRequestModel,
    ShareInvitationResponseModel,
)


def load_app(monkeypatch, tmp_path):
    monkeypatch.setenv("NEURODIARY_DATABASE_URL", "")
    monkeypatch.setenv("NEURODIARY_DATABASE_PATH", str(tmp_path / "sharing.db"))
    monkeypatch.setenv("NEURODIARY_SESSION_SECRET", "test-session-secret")
    import backend.app.main as main
    main = importlib.reload(main)
    main.on_startup()
    return main


def user(user_id, email, name):
    return AuthenticatedUser(provider="google", user_id=user_id, email=email, name=name)


def test_invitation_appears_in_recipient_account_and_requires_acceptance(monkeypatch, tmp_path):
    main = load_app(monkeypatch, tmp_path)
    owner = user("google:owner", "owner@example.test", "Owner")
    reader = user("google:reader", "reader@example.test", "Reader")
    owner_device = "owner-device-0001"
    reader_device = "reader-device-001"
    main.device_store.upsert(owner.user_id, owner_device, "Owner notebook")
    main.device_store.upsert(reader.user_id, reader_device, "Reader notebook")
    main.share_store.register_identity(owner.user_id, owner.email, owner.name)
    main.share_store.register_identity(reader.user_id, reader.email, reader.name)
    main.key_exchange_store.put_key(reader.user_id, reader_device, '{"kty":"RSA"}', "a" * 64)

    created = main.create_share_invitation(
        ShareInvitationRequestModel(recipientEmail=reader.email), owner, owner_device,
    )
    recipient_view = main.list_shares(reader, reader_device, False)
    assert created["status"] == "pending"
    assert recipient_view["incomingInvitations"][0]["ownerEmail"] == owner.email
    assert recipient_view["incoming"] == []

    response = main.respond_to_share_invitation(
        created["invitationId"], ShareInvitationResponseModel(accept=True), reader, reader_device,
    )
    owner_view = main.list_shares(owner, owner_device, False)
    assert response["status"] == "accepted"
    assert owner_view["outgoingInvitations"][0]["status"] == "accepted"


def test_only_owner_can_activate_an_accepted_invitation(monkeypatch, tmp_path):
    main = load_app(monkeypatch, tmp_path)
    owner = user("google:owner", "owner@example.test", "Owner")
    reader = user("google:reader", "reader@example.test", "Reader")
    attacker = user("google:attacker", "attacker@example.test", "Attacker")
    owner_device = "owner-device-0001"
    reader_device = "reader-device-001"
    attacker_device = "attacker-device-1"
    for account, device in ((owner, owner_device), (reader, reader_device), (attacker, attacker_device)):
        main.device_store.upsert(account.user_id, device, device)
        main.share_store.register_identity(account.user_id, account.email, account.name)
    main.key_exchange_store.put_key(reader.user_id, reader_device, '{"kty":"RSA"}', "b" * 64)
    invitation = main.create_share_invitation(ShareInvitationRequestModel(recipientEmail=reader.email), owner, owner_device)
    main.respond_to_share_invitation(invitation["invitationId"], ShareInvitationResponseModel(accept=True), reader, reader_device)
    activation = ShareInvitationActivationModel(keyVersion=1, keyEnvelope={
        "algorithm": "RSA-OAEP-3072-SHA256", "cipherText": "opaque", "targetFingerprint": "b" * 64,
    })

    with pytest.raises(HTTPException) as error:
        main.activate_share_invitation(invitation["invitationId"], activation, attacker, attacker_device)
    assert error.value.status_code == 409
    result = main.activate_share_invitation(invitation["invitationId"], activation, owner, owner_device)
    assert result["status"] == "active"
    assert main.list_shares(owner, owner_device, False)["outgoingInvitations"][0]["status"] == "active"
