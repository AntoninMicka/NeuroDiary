import base64
import importlib

import pytest
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.asymmetric import padding, rsa
from fastapi import HTTPException

from backend.app.models import (
    DeviceKeyChallengeRequestModel,
    DeviceKeyPublishRequestModel,
    DeviceKeyTransferRequestModel,
    DeviceKeyRequestFulfillModel,
    DeviceRegistrationRequestModel,
    SyncPushRequestModel,
)


def load_app(monkeypatch, tmp_path):
    monkeypatch.setenv("NEURODIARY_DATABASE_URL", "")
    monkeypatch.setenv("NEURODIARY_DATABASE_PATH", str(tmp_path / "exchange.db"))
    import backend.app.main as main
    main = importlib.reload(main)
    main.on_startup()
    return main


def key_pair():
    private = rsa.generate_private_key(public_exponent=65537, key_size=3072)
    numbers = private.public_key().public_numbers()
    encode = lambda value: base64.urlsafe_b64encode(value.to_bytes((value.bit_length() + 7) // 8, "big")).decode().rstrip("=")
    return private, {"kty": "RSA", "alg": "RSA-OAEP-256", "n": encode(numbers.n), "e": encode(numbers.e), "key_ops": ["encrypt"], "ext": True}


def register_and_publish(main, user_id, device_id):
    main.register_current_device(DeviceRegistrationRequestModel(deviceId=device_id, name=device_id), user_id)
    private, jwk = key_pair()
    challenge = main.create_device_key_challenge(DeviceKeyChallengeRequestModel(deviceId=device_id, publicKeyJwk=jwk), user_id, device_id)
    secret = private.decrypt(base64.b64decode(challenge.encryptedChallenge), padding.OAEP(mgf=padding.MGF1(hashes.SHA256()), algorithm=hashes.SHA256(), label=None)).decode()
    published = main.publish_current_device_key(DeviceKeyPublishRequestModel(deviceId=device_id, publicKeyJwk=jwk, challengeId=challenge.challengeId, challengeSecret=secret), user_id, device_id)
    return private, published


def test_device_must_prove_private_key_ownership(monkeypatch, tmp_path):
    main = load_app(monkeypatch, tmp_path)
    user = "user-a"
    device = "device-0000000001"
    main.register_current_device(DeviceRegistrationRequestModel(deviceId=device, name="Telefon"), user)
    _, jwk = key_pair()
    challenge = main.create_device_key_challenge(DeviceKeyChallengeRequestModel(deviceId=device, publicKeyJwk=jwk), user, device)
    with pytest.raises(HTTPException) as error:
        main.publish_current_device_key(DeviceKeyPublishRequestModel(deviceId=device, publicKeyJwk=jwk, challengeId=challenge.challengeId, challengeSecret="podvrzeny-secret-0000"), user, device)
    assert error.value.status_code == 403


def test_transfers_are_one_time_and_isolated_by_user(monkeypatch, tmp_path):
    main = load_app(monkeypatch, tmp_path)
    source = "device-0000000001"
    target = "device-0000000002"
    register_and_publish(main, "user-a", source)
    _, target_key = register_and_publish(main, "user-a", target)
    register_and_publish(main, "user-b", target)
    main.push_state(SyncPushRequestModel(baseRevision=0, payload={"schemaVersion": 1, "algorithm": "AES-GCM", "keyVersion": 4, "iv": "iv", "cipherText": "data"}), "user-a")
    created = main.create_device_key_transfer(DeviceKeyTransferRequestModel(targetDeviceId=target, keyVersion=4, envelope={"algorithm": "RSA-OAEP-3072-SHA256", "cipherText": "opaque", "targetFingerprint": target_key.fingerprint}), "user-a", source)
    assert main.consume_current_device_key_transfer("user-b", target) is None
    consumed = main.consume_current_device_key_transfer("user-a", target)
    assert consumed.transferId == created.transferId
    assert consumed.keyVersion == 4
    assert main.consume_current_device_key_transfer("user-a", target) is None


def test_device_cannot_publish_key_for_different_device(monkeypatch, tmp_path):
    main = load_app(monkeypatch, tmp_path)
    main.register_current_device(DeviceRegistrationRequestModel(deviceId="device-0000000001", name="A"), "user")
    _, jwk = key_pair()
    with pytest.raises(HTTPException) as error:
        main.create_device_key_challenge(DeviceKeyChallengeRequestModel(deviceId="device-0000000002", publicKeyJwk=jwk), "user", "device-0000000001")
    assert error.value.status_code == 403


def test_new_device_requests_and_trusted_device_approves_transfer(monkeypatch, tmp_path):
    main = load_app(monkeypatch, tmp_path)
    user = "user-a"
    source = "device-0000000001"
    target = "device-0000000002"
    register_and_publish(main, user, source)
    _, target_key = register_and_publish(main, user, target)
    main.push_state(SyncPushRequestModel(baseRevision=0, payload={"schemaVersion": 1, "algorithm": "AES-GCM", "keyVersion": 3, "iv": "iv", "cipherText": "data"}), user)

    requested = main.request_current_device_key(user, target)
    pending = main.list_device_key_requests(user, source)
    assert [item.requestId for item in pending.requests] == [requested.requestId]
    assert main.list_device_key_requests("different-user", source).requests == []

    fulfilled = main.fulfill_device_key_request(
        DeviceKeyRequestFulfillModel(
            requestId=requested.requestId,
            transfer={
                "targetDeviceId": target,
                "keyVersion": 3,
                "envelope": {
                    "algorithm": "RSA-OAEP-3072-SHA256",
                    "cipherText": "encrypted-master-key",
                    "targetFingerprint": target_key.fingerprint,
                },
            },
        ),
        user,
        source,
    )
    assert fulfilled.targetDeviceId == target
    assert main.list_device_key_requests(user, source).requests == []
    assert main.consume_current_device_key_transfer(user, target).transferId == fulfilled.transferId
