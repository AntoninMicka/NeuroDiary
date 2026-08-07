from __future__ import annotations

import json
import hmac
import logging
import os
import time
import uuid
import base64
import hashlib
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Annotated
from cryptography.hazmat.primitives.asymmetric import padding, rsa
from cryptography.hazmat.primitives import hashes

from fastapi import Depends, FastAPI, Header, HTTPException, Request, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse

from .auth import AuthManager
from .models import (
    AuthConfigResponseModel,
    AuthSessionResponseModel,
    AuthenticatedUserModel,
    IdentityExchangeRequestModel,
    SyncPullResponseModel,
    SyncPushRequestModel,
    SyncPushResponseModel,
    SyncResetResponseModel,
    PushConfigResponseModel,
    PushDispatchResponseModel,
    PushRegistrationRequestModel,
    PushRegistrationResponseModel,
    PushUnsubscribeRequestModel,
    DeviceActionResponseModel,
    DeviceRegistrationRequestModel,
    TrustedDeviceListResponseModel,
    TrustedDeviceModel,
    DeviceKeyChallengeRequestModel,
    DeviceKeyChallengeResponseModel,
    DeviceKeyPublishRequestModel,
    DevicePublicKeyModel,
    DevicePublicKeyListResponseModel,
    DeviceKeyTransferRequestModel,
    DeviceKeyTransferModel,
    DeviceKeyRequestModel,
    DeviceKeyRequestListResponseModel,
    DeviceKeyRequestFulfillModel,
)
from .device_store import create_device_store
from .key_exchange_store import create_key_exchange_store
from .push_service import PushService, WebPushException
from .push_store import create_push_store
from .store import RevisionConflictError, create_sync_store


APP_NAME = "NeuroDiary Sync API"
APP_VERSION = os.getenv("NEURODIARY_VERSION", "0.1.0")
API_TOKEN = os.getenv("NEURODIARY_API_TOKEN", "")
DATABASE_URL = os.getenv("NEURODIARY_DATABASE_URL", "").strip()
DATABASE_PATH = os.getenv("NEURODIARY_DATABASE_PATH", "backend/data/neurodiary-sync.db")
FRONTEND_DIST = Path(
    os.getenv(
        "NEURODIARY_FRONTEND_DIST",
        str(Path(__file__).resolve().parents[2] / "dist"),
    )
)
CORS_ORIGINS = [
    origin.strip()
    for origin in os.getenv("NEURODIARY_CORS_ORIGINS", "http://localhost:5173").split(",")
    if origin.strip()
]
PUSH_SCHEDULER_TOKEN = os.getenv("NEURODIARY_PUSH_SCHEDULER_TOKEN", "").strip()

store = create_sync_store(database_url=DATABASE_URL or None, database_path=DATABASE_PATH)
device_store = create_device_store(database_url=DATABASE_URL or None, database_path=DATABASE_PATH)
key_exchange_store = create_key_exchange_store(database_url=DATABASE_URL or None, database_path=DATABASE_PATH)
push_store = create_push_store(database_url=DATABASE_URL or None, database_path=DATABASE_PATH)
push_service = PushService()
auth_manager = AuthManager()
logger = logging.getLogger("neurodiary")
if not logger.handlers:
    handler = logging.StreamHandler()
    handler.setFormatter(logging.Formatter("%(message)s"))
    logger.addHandler(handler)
logger.setLevel(os.getenv("NEURODIARY_LOG_LEVEL", "INFO").upper())
logger.propagate = False

app = FastAPI(title=APP_NAME, version=APP_VERSION)
app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

def log_event(severity: str, event: str, **details: object) -> None:
    payload = {
        "severity": severity,
        "event": event,
        "service": "neurodiary-sync",
        "version": APP_VERSION,
        **details,
    }
    logger.log(getattr(logging, severity, logging.INFO), json.dumps(payload, separators=(",", ":")))


@app.middleware("http")
async def request_logging_middleware(request: Request, call_next):
    started_at = time.perf_counter()
    incoming_request_id = request.headers.get("x-request-id", "")
    request_id = incoming_request_id[:128] if incoming_request_id else str(uuid.uuid4())
    try:
        response = await call_next(request)
    except Exception as error:
        log_event(
            "ERROR",
            "http_request_failed",
            requestId=request_id,
            method=request.method,
            path=request.url.path,
            status=500,
            durationMs=round((time.perf_counter() - started_at) * 1000, 2),
            errorType=type(error).__name__,
        )
        raise

    response.headers["x-request-id"] = request_id
    log_event(
        "INFO" if response.status_code < 500 else "ERROR",
        "http_request",
        requestId=request_id,
        method=request.method,
        path=request.url.path,
        status=response.status_code,
        durationMs=round((time.perf_counter() - started_at) * 1000, 2),
    )
    return response


@app.on_event("startup")
def on_startup() -> None:
    store.initialize()
    device_store.initialize()
    key_exchange_store.initialize()
    push_store.initialize()
    log_event(
        "INFO",
        "application_started",
        storage="postgres" if DATABASE_URL else "sqlite",
        auth="federated" if auth_manager.federated_auth_enabled else "legacy",
    )


def verify_bearer_token(
    authorization: Annotated[str | None, Header()] = None,
) -> str:
    return auth_manager.resolve_authorization(authorization)


def verify_trusted_device(
    user_id: Annotated[str, Depends(verify_bearer_token)],
    x_device_id: Annotated[str | None, Header(alias="X-Device-ID")] = None,
) -> str:
    if not x_device_id or not device_store.is_active(user_id, x_device_id):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Device is not trusted for this account.")
    return user_id


@app.get("/healthz")
def healthcheck() -> dict[str, str]:
    backend = "postgres" if DATABASE_URL else "sqlite"
    auth_mode = "federated" if auth_manager.federated_auth_enabled else "legacy"
    return {"status": "ok", "storage": backend, "auth": auth_mode, "version": APP_VERSION}


@app.get("/readyz")
def readiness_check():
    try:
        store.check_health()
    except Exception as error:
        log_event("ERROR", "readiness_failed", errorType=type(error).__name__)
        return JSONResponse(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            content={"status": "unavailable", "storage": "postgres" if DATABASE_URL else "sqlite"},
        )
    return {
        "status": "ready",
        "storage": "postgres" if DATABASE_URL else "sqlite",
        "version": APP_VERSION,
    }


@app.get("/api/v1/meta")
def api_metadata() -> dict[str, object]:
    return {
        "name": APP_NAME,
        "version": APP_VERSION,
        "capabilities": {
            "encryptedSnapshotSync": True,
            "wrappedRecoveryKey": True,
            "trustedDevices": True,
            "keyRotation": True,
            "asymmetricDeviceKeyTransfer": True,
            "federatedAuth": auth_manager.federated_auth_enabled,
            "legacyToken": bool(API_TOKEN),
            "webPush": push_service.enabled,
        },
    }


@app.get("/api/v1/auth/config", response_model=AuthConfigResponseModel)
def auth_config() -> AuthConfigResponseModel:
    return AuthConfigResponseModel(
        googleEnabled=auth_manager.google_enabled,
        googleClientId=auth_manager.google_client_ids[0] if auth_manager.google_client_ids else "",
        appleEnabled=auth_manager.apple_enabled,
        appleClientId=auth_manager.apple_client_ids[0] if auth_manager.apple_client_ids else "",
        appleRedirectPath=auth_manager.apple_redirect_path,
        legacyApiTokenEnabled=bool(API_TOKEN),
        federatedAuthEnabled=auth_manager.federated_auth_enabled,
    )


@app.get("/api/v1/push/config", response_model=PushConfigResponseModel)
def push_config() -> PushConfigResponseModel:
    return PushConfigResponseModel(
        enabled=push_service.enabled,
        publicKey=push_service.public_key if push_service.enabled else "",
    )


@app.put("/api/v1/push/registration", response_model=PushRegistrationResponseModel)
def register_push(
    payload: PushRegistrationRequestModel,
    user_id: Annotated[str, Depends(verify_trusted_device)],
) -> PushRegistrationResponseModel:
    if not push_service.enabled:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Web Push is not configured.",
        )
    if not push_service.is_endpoint_allowed(payload.subscription.endpoint):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Push endpoint host is not allowed.",
        )
    now = datetime.now(UTC)
    future_reminders = [
        reminder
        for reminder in payload.reminders
        if reminder.scheduledAt > now and reminder.scheduledAt <= now + timedelta(days=32)
    ]
    safe_payload = payload.model_copy(update={"reminders": future_reminders})
    scheduled_count = push_store.replace_registration(user_id, safe_payload)
    return PushRegistrationResponseModel(status="ok", scheduledCount=scheduled_count)


@app.delete("/api/v1/push/registration", response_model=PushRegistrationResponseModel)
def unregister_push(
    payload: PushUnsubscribeRequestModel,
    user_id: Annotated[str, Depends(verify_trusted_device)],
) -> PushRegistrationResponseModel:
    push_store.delete_subscription(user_id, payload.endpoint)
    return PushRegistrationResponseModel(status="ok", scheduledCount=0)


@app.post("/api/v1/internal/push/dispatch", response_model=PushDispatchResponseModel)
def dispatch_push(
    x_scheduler_token: Annotated[str | None, Header()] = None,
) -> PushDispatchResponseModel:
    if not PUSH_SCHEDULER_TOKEN or not hmac.compare_digest(
        x_scheduler_token or "",
        PUSH_SCHEDULER_TOKEN,
    ):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid scheduler token.")
    if not push_service.enabled:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Web Push is not configured.",
        )

    sent = 0
    failed = 0
    removed_subscriptions = 0
    for reminder in push_store.load_due(datetime.now(UTC)):
        subscription = {
            "endpoint": reminder.endpoint,
            "keys": {"p256dh": reminder.p256dh, "auth": reminder.auth},
        }
        try:
            push_service.send_generic_medication_reminder(subscription)
            push_store.mark_sent(reminder)
            sent += 1
        except WebPushException as error:
            failed += 1
            if push_service.is_expired_subscription(error):
                push_store.delete_subscription(reminder.user_id, reminder.endpoint)
                removed_subscriptions += 1
            else:
                push_store.mark_failed(reminder)
            log_event(
                "WARNING",
                "push_delivery_failed",
                errorType=type(error).__name__,
                expiredSubscription=push_service.is_expired_subscription(error),
            )
        except Exception as error:
            failed += 1
            push_store.mark_failed(reminder)
            log_event(
                "ERROR",
                "push_delivery_failed",
                errorType=type(error).__name__,
                expiredSubscription=False,
            )

    return PushDispatchResponseModel(
        status="ok",
        sent=sent,
        failed=failed,
        removedSubscriptions=removed_subscriptions,
    )


@app.post("/api/v1/auth/exchange", response_model=AuthSessionResponseModel)
def exchange_identity_token(payload: IdentityExchangeRequestModel) -> AuthSessionResponseModel:
    user, access_token, expires_at = auth_manager.exchange_identity_token(
        provider=payload.provider,
        id_token_value=payload.idToken,
        nonce=payload.nonce or None,
        profile=payload.profile.model_dump() if payload.profile else None,
    )
    return AuthSessionResponseModel(
        accessToken=access_token,
        expiresAt=expires_at,
        user=AuthenticatedUserModel(
            provider=user.provider,
            userId=user.user_id,
            email=user.email,
            name=user.name,
        ),
    )


def resolve_frontend_path(path: str) -> Path:
    base_dir = FRONTEND_DIST.resolve()
    candidate = (base_dir / path).resolve()

    try:
        candidate.relative_to(base_dir)
    except ValueError as error:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not Found") from error

    return candidate


def serve_frontend(path: str) -> FileResponse:
    if not FRONTEND_DIST.exists():
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Frontend bundle is not available.",
        )

    candidate = resolve_frontend_path(path)
    if candidate.is_file():
        return FileResponse(candidate)

    # Missing static assets must stay 404. Returning index.html for JS/CSS/WASM files
    # breaks the app bootstrap because the browser receives HTML instead of the asset.
    if path and "." in Path(path).name:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not Found")

    index_file = FRONTEND_DIST / "index.html"
    if index_file.is_file():
        return FileResponse(index_file)

    raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Frontend bundle is missing index.html.")


@app.put("/api/v1/devices/current", response_model=TrustedDeviceModel)
def register_current_device(
    payload: DeviceRegistrationRequestModel,
    user_id: Annotated[str, Depends(verify_bearer_token)],
) -> TrustedDeviceModel:
    record = device_store.upsert(user_id, payload.deviceId, payload.name)
    if record.revoked_at is not None:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Device has been revoked.")
    return TrustedDeviceModel(
        deviceId=record.device_id, name=record.name, createdAt=record.created_at,
        lastSeenAt=record.last_seen_at, revokedAt=record.revoked_at, current=True,
    )


def canonical_jwk(jwk: dict[str, object]) -> str:
    return json.dumps(jwk, sort_keys=True, separators=(",", ":"))


def decode_base64url_integer(value: object) -> int:
    encoded = str(value or "")
    decoded = base64.urlsafe_b64decode(encoded + "=" * (-len(encoded) % 4))
    return int.from_bytes(decoded, "big")


def validate_device_public_key(jwk: dict[str, object]):
    if jwk.get("kty") != "RSA" or jwk.get("alg") not in (None, "RSA-OAEP-256"):
        raise HTTPException(status_code=400, detail="Device key must be an RSA-OAEP-256 JWK.")
    try:
        exponent = decode_base64url_integer(jwk.get("e"))
        modulus = decode_base64url_integer(jwk.get("n"))
        public_key = rsa.RSAPublicNumbers(exponent, modulus).public_key()
    except Exception as error:
        raise HTTPException(status_code=400, detail="Device public key is invalid.") from error
    if public_key.key_size < 3072 or exponent != 65537:
        raise HTTPException(status_code=400, detail="Device key must be RSA 3072+ with exponent 65537.")
    return public_key


@app.post("/api/v1/devices/key-challenge", response_model=DeviceKeyChallengeResponseModel)
def create_device_key_challenge(
    payload: DeviceKeyChallengeRequestModel,
    user_id: Annotated[str, Depends(verify_bearer_token)],
    x_device_id: Annotated[str | None, Header(alias="X-Device-ID")] = None,
) -> DeviceKeyChallengeResponseModel:
    if x_device_id != payload.deviceId or not device_store.is_active(user_id, payload.deviceId):
        raise HTTPException(status_code=403, detail="A device may only publish its own key.")
    public_key = validate_device_public_key(payload.publicKeyJwk)
    secret = base64.urlsafe_b64encode(os.urandom(32)).decode().rstrip("=")
    encrypted = public_key.encrypt(secret.encode(), padding.OAEP(mgf=padding.MGF1(hashes.SHA256()), algorithm=hashes.SHA256(), label=None))
    challenge_id = str(uuid.uuid4())
    expires_at = datetime.now(UTC) + timedelta(minutes=5)
    jwk_json = canonical_jwk(payload.publicKeyJwk)
    fingerprint = hashlib.sha256(jwk_json.encode()).hexdigest()
    key_exchange_store.create_challenge(challenge_id, user_id, payload.deviceId, jwk_json, fingerprint, hashlib.sha256(secret.encode()).hexdigest(), expires_at)
    return DeviceKeyChallengeResponseModel(challengeId=challenge_id, encryptedChallenge=base64.b64encode(encrypted).decode(), expiresAt=expires_at)


@app.put("/api/v1/devices/current/key", response_model=DevicePublicKeyModel)
def publish_current_device_key(
    payload: DeviceKeyPublishRequestModel,
    user_id: Annotated[str, Depends(verify_bearer_token)],
    x_device_id: Annotated[str | None, Header(alias="X-Device-ID")] = None,
) -> DevicePublicKeyModel:
    if x_device_id != payload.deviceId or not device_store.is_active(user_id, payload.deviceId):
        raise HTTPException(status_code=403, detail="A device may only publish its own key.")
    validate_device_public_key(payload.publicKeyJwk)
    jwk_json = canonical_jwk(payload.publicKeyJwk)
    secret_hash = hashlib.sha256(payload.challengeSecret.encode()).hexdigest()
    if not key_exchange_store.consume_challenge(payload.challengeId, user_id, payload.deviceId, jwk_json, secret_hash):
        raise HTTPException(status_code=403, detail="Device key ownership proof is invalid or expired.")
    fingerprint = hashlib.sha256(jwk_json.encode()).hexdigest()
    record = key_exchange_store.put_key(user_id, payload.deviceId, jwk_json, fingerprint)
    return DevicePublicKeyModel(deviceId=record.device_id, publicKeyJwk=json.loads(record.public_key_jwk), fingerprint=record.fingerprint, verifiedAt=record.verified_at)


@app.get("/api/v1/devices/keys", response_model=DevicePublicKeyListResponseModel)
def list_device_keys(user_id: Annotated[str, Depends(verify_trusted_device)]) -> DevicePublicKeyListResponseModel:
    active_ids = {item.device_id for item in device_store.list(user_id) if item.revoked_at is None}
    return DevicePublicKeyListResponseModel(keys=[
        DevicePublicKeyModel(deviceId=item.device_id, publicKeyJwk=json.loads(item.public_key_jwk), fingerprint=item.fingerprint, verifiedAt=item.verified_at)
        for item in key_exchange_store.list_keys(user_id) if item.device_id in active_ids
    ])


@app.post("/api/v1/devices/current/key-request", response_model=DeviceKeyRequestModel)
def request_current_device_key(
    user_id: Annotated[str, Depends(verify_trusted_device)],
    x_device_id: Annotated[str | None, Header(alias="X-Device-ID")] = None,
) -> DeviceKeyRequestModel:
    if not key_exchange_store.get_key(user_id, x_device_id):
        raise HTTPException(status_code=409, detail="Current device must publish a verified public key first.")
    request_id = str(uuid.uuid4())
    record = key_exchange_store.create_request(request_id, user_id, x_device_id, datetime.now(UTC) + timedelta(hours=24))
    return DeviceKeyRequestModel(requestId=record["request_id"], targetDeviceId=record["target_device_id"], createdAt=record["created_at"], expiresAt=record["expires_at"])


@app.get("/api/v1/devices/key-requests", response_model=DeviceKeyRequestListResponseModel)
def list_device_key_requests(
    user_id: Annotated[str, Depends(verify_trusted_device)],
    x_device_id: Annotated[str | None, Header(alias="X-Device-ID")] = None,
) -> DeviceKeyRequestListResponseModel:
    return DeviceKeyRequestListResponseModel(requests=[
        DeviceKeyRequestModel(requestId=item["request_id"], targetDeviceId=item["target_device_id"], createdAt=datetime.fromisoformat(item["created_at"]) if isinstance(item["created_at"], str) else item["created_at"], expiresAt=datetime.fromisoformat(item["expires_at"]) if isinstance(item["expires_at"], str) else item["expires_at"])
        for item in key_exchange_store.list_requests(user_id, x_device_id)
    ])


@app.post("/api/v1/devices/key-transfers", response_model=DeviceKeyTransferModel)
def create_device_key_transfer(
    payload: DeviceKeyTransferRequestModel,
    user_id: Annotated[str, Depends(verify_trusted_device)],
    x_device_id: Annotated[str | None, Header(alias="X-Device-ID")] = None,
) -> DeviceKeyTransferModel:
    if not x_device_id or payload.targetDeviceId == x_device_id:
        raise HTTPException(status_code=400, detail="Key transfer target must be another device.")
    target_key = key_exchange_store.get_key(user_id, payload.targetDeviceId)
    if not device_store.is_active(user_id, payload.targetDeviceId) or not target_key:
        raise HTTPException(status_code=404, detail="Target device has no verified public key.")
    if payload.envelope.targetFingerprint != target_key.fingerprint:
        raise HTTPException(status_code=400, detail="Transfer envelope is not bound to the target device key.")
    snapshot = store.load_latest(user_id)
    if not snapshot or payload.keyVersion != snapshot.payload.keyVersion:
        raise HTTPException(status_code=409, detail="Transfer key version is not the current account key version.")
    transfer_id = str(uuid.uuid4())
    expires_at = datetime.now(UTC) + timedelta(seconds=payload.expiresInSeconds)
    record = key_exchange_store.create_transfer(transfer_id, user_id, x_device_id, payload.targetDeviceId, payload.keyVersion, payload.envelope.model_dump_json(), expires_at)
    return DeviceKeyTransferModel(transferId=record.transfer_id, sourceDeviceId=record.source_device_id, targetDeviceId=record.target_device_id, keyVersion=record.key_version, envelope=json.loads(record.envelope_json), createdAt=record.created_at, expiresAt=record.expires_at)


@app.post("/api/v1/devices/key-requests/fulfill", response_model=DeviceKeyTransferModel)
def fulfill_device_key_request(
    payload: DeviceKeyRequestFulfillModel,
    user_id: Annotated[str, Depends(verify_trusted_device)],
    x_device_id: Annotated[str | None, Header(alias="X-Device-ID")] = None,
) -> DeviceKeyTransferModel:
    pending = {item["request_id"]: item for item in key_exchange_store.list_requests(user_id, x_device_id)}
    request_record = pending.get(payload.requestId)
    if not request_record or request_record["target_device_id"] != payload.transfer.targetDeviceId:
        raise HTTPException(status_code=404, detail="Key request is missing or expired.")
    result = create_device_key_transfer(payload.transfer, user_id, x_device_id)
    if not key_exchange_store.fulfill_request(user_id, payload.requestId, payload.transfer.targetDeviceId):
        raise HTTPException(status_code=409, detail="Key request was already fulfilled.")
    return result


@app.get("/api/v1/devices/current/key-transfer", response_model=DeviceKeyTransferModel | None)
def consume_current_device_key_transfer(
    user_id: Annotated[str, Depends(verify_trusted_device)],
    x_device_id: Annotated[str | None, Header(alias="X-Device-ID")] = None,
) -> DeviceKeyTransferModel | None:
    record = key_exchange_store.consume_transfer(user_id, x_device_id)
    if not record:
        return None
    return DeviceKeyTransferModel(transferId=record.transfer_id, sourceDeviceId=record.source_device_id, targetDeviceId=record.target_device_id, keyVersion=record.key_version, envelope=json.loads(record.envelope_json), createdAt=record.created_at, expiresAt=record.expires_at)


@app.get("/api/v1/devices", response_model=TrustedDeviceListResponseModel)
def list_trusted_devices(
    user_id: Annotated[str, Depends(verify_bearer_token)],
    x_device_id: Annotated[str | None, Header(alias="X-Device-ID")] = None,
) -> TrustedDeviceListResponseModel:
    if not x_device_id or not device_store.is_active(user_id, x_device_id):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Current device is not trusted.")
    return TrustedDeviceListResponseModel(devices=[
        TrustedDeviceModel(
            deviceId=item.device_id, name=item.name, createdAt=item.created_at,
            lastSeenAt=item.last_seen_at, revokedAt=item.revoked_at,
            current=item.device_id == x_device_id,
        )
        for item in device_store.list(user_id)
    ])


@app.delete("/api/v1/devices/{device_id}", response_model=DeviceActionResponseModel)
def revoke_trusted_device(
    device_id: str,
    user_id: Annotated[str, Depends(verify_bearer_token)],
    x_device_id: Annotated[str | None, Header(alias="X-Device-ID")] = None,
) -> DeviceActionResponseModel:
    if not x_device_id or not device_store.is_active(user_id, x_device_id):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Current device is not trusted.")
    if device_id == x_device_id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Current device cannot revoke itself.")
    device_store.revoke(user_id, device_id)
    key_exchange_store.delete_device(user_id, device_id)
    return DeviceActionResponseModel(status="ok", affected=1)


@app.post("/api/v1/devices/revoke-others", response_model=DeviceActionResponseModel)
def revoke_other_devices(
    user_id: Annotated[str, Depends(verify_bearer_token)],
    x_device_id: Annotated[str | None, Header(alias="X-Device-ID")] = None,
) -> DeviceActionResponseModel:
    if not x_device_id or not device_store.is_active(user_id, x_device_id):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Current device is not trusted.")
    return DeviceActionResponseModel(status="ok", affected=device_store.revoke_others(user_id, x_device_id))


@app.get("/api/v1/sync/pull", response_model=SyncPullResponseModel)
def pull_state(user_id: Annotated[str, Depends(verify_trusted_device)]) -> SyncPullResponseModel:
    snapshot = store.load_latest(user_id)
    if snapshot is None:
        return SyncPullResponseModel(revision=0, updatedAt=None, payload=None, wrappedKey=None)

    return SyncPullResponseModel(
        revision=snapshot.revision,
        updatedAt=snapshot.updatedAt,
        payload=snapshot.payload,
        wrappedKey=snapshot.wrappedKey,
    )


@app.post("/api/v1/sync/push", response_model=SyncPushResponseModel)
def push_state(
    payload: SyncPushRequestModel,
    user_id: Annotated[str, Depends(verify_trusted_device)],
) -> SyncPushResponseModel:
    try:
        result = store.save_state(
            user_id=user_id,
            base_revision=payload.baseRevision,
            payload=payload.payload,
            wrapped_key=payload.wrappedKey,
            force=payload.force,
        )
        return SyncPushResponseModel(
            status="ok",
            revision=result.revision,
            updatedAt=result.updated_at,
            payload=result.payload,
            wrappedKey=result.wrapped_key,
        )
    except RevisionConflictError:
        snapshot = store.load_latest(user_id)
        if snapshot is None:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Revision conflict, but no server snapshot was found.",
            ) from None

        return SyncPushResponseModel(
            status="conflict",
            revision=snapshot.revision,
            updatedAt=snapshot.updatedAt,
            payload=snapshot.payload,
            wrappedKey=snapshot.wrappedKey,
        )


@app.delete("/api/v1/sync/reset", response_model=SyncResetResponseModel)
def reset_state(user_id: Annotated[str, Depends(verify_trusted_device)]) -> SyncResetResponseModel:
    deleted_at = store.delete_state(user_id)
    return SyncResetResponseModel(status="ok", deleted=True, updatedAt=deleted_at)


@app.get("/", include_in_schema=False)
def frontend_root() -> FileResponse:
    return serve_frontend("")


@app.get("/{full_path:path}", include_in_schema=False)
def frontend_fallback(full_path: str) -> FileResponse:
    if full_path.startswith("api/"):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not Found")

    return serve_frontend(full_path)
