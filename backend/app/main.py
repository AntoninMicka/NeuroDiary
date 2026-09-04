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

from fastapi import Depends, FastAPI, Header, HTTPException, Query, Request, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse

from .auth import AuthManager, AuthenticatedUser
from .audit_events import (
    AuditEventType,
    INVITATION_DECISION_EVENTS,
    TREATMENT_PROPOSAL_DECISION_EVENTS,
    audit_event_label,
    validate_audit_details,
)
from .cloud_admin import CloudAdminService
from .models import (
    AuthConfigResponseModel,
    AuthSessionResponseModel,
    AuthenticatedUserModel,
    IdentityExchangeRequestModel,
    LocalLoginRequestModel,
    LocalUserCreateModel,
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
    DeviceAliasRequestModel,
    UserRolesUpdateModel,
    DeviceActiveRolesUpdateModel,
    DeviceKeyChallengeRequestModel,
    DeviceKeyChallengeResponseModel,
    DeviceKeyPublishRequestModel,
    DevicePublicKeyModel,
    DevicePublicKeyListResponseModel,
    DeviceKeyTransferRequestModel,
    DeviceKeyTransferModel,
    DeviceKeyTransferConfirmModel,
    DeviceKeyRequestModel,
    DeviceKeyRequestListResponseModel,
    DeviceKeyRequestFulfillModel,
    SecurityAuditEventModel,
    SecurityAuditListResponseModel,
    SyncRotationRequestModel,
    IdentityKeyMigrationModel,
    ShareGrantRequestModel,
    ShareInvitationRequestModel,
    ShareInvitationResponseModel,
    ShareInvitationActivationModel,
    TreatmentProposalCreateModel,
    TreatmentProposalDecisionModel,
)
from .device_store import create_device_store
from .key_exchange_store import create_key_exchange_store
from .push_service import PushService, WebPushException
from .push_store import create_push_store
from .store import RevisionConflictError, create_sync_store
from .share_store import ShareStore


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
AUDIT_RETENTION_DAYS = max(30, min(int(os.getenv("NEURODIARY_AUDIT_RETENTION_DAYS", "730")), 3650))
AUDIT_INTEGRITY_KEY = (
    os.getenv("NEURODIARY_AUDIT_INTEGRITY_KEY", "").strip()
    or os.getenv("NEURODIARY_SESSION_SECRET", "").strip()
    or API_TOKEN
    or "neurodiary-dev-audit-integrity-key"
)
ADMIN_EMAILS = {
    email.strip().lower()
    for email in os.getenv("NEURODIARY_ADMIN_EMAILS", "").split(",")
    if email.strip()
}
ROLE_DEFINITIONS = {
    "patient": {"label": "Pacient", "primaryView": "diary", "contactLimit": None, "selfAssignable": True},
    "family": {"label": "Rodinný příslušník", "primaryView": "records", "contactLimit": 5, "selfAssignable": True},
    "doctor": {"label": "Lékař", "primaryView": "records", "contactLimit": None, "selfAssignable": False},
    "admin": {"label": "Administrátor", "primaryView": "admin", "contactLimit": None, "selfAssignable": False},
}

store = create_sync_store(database_url=DATABASE_URL or None, database_path=DATABASE_PATH)
device_store = create_device_store(database_url=DATABASE_URL or None, database_path=DATABASE_PATH)
key_exchange_store = create_key_exchange_store(
    database_url=DATABASE_URL or None,
    database_path=DATABASE_PATH,
    audit_retention_days=AUDIT_RETENTION_DAYS,
    audit_integrity_key=AUDIT_INTEGRITY_KEY,
)
push_store = create_push_store(database_url=DATABASE_URL or None, database_path=DATABASE_PATH)
push_service = PushService()
auth_manager = AuthManager()
cloud_admin_service = CloudAdminService()
share_store = ShareStore(DATABASE_PATH, DATABASE_URL or None)
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
    share_store.initialize()
    log_event(
        "INFO",
        "application_started",
        storage="postgres" if DATABASE_URL else "sqlite",
        auth="local" if auth_manager.local_auth_enabled else ("federated" if auth_manager.federated_auth_enabled else "legacy"),
    )


def verify_bearer_token(
    authorization: Annotated[str | None, Header()] = None,
) -> str:
    return auth_manager.resolve_authorization(authorization)


def verify_admin(
    authorization: Annotated[str | None, Header()] = None,
) -> AuthenticatedUser:
    user = auth_manager.resolve_authenticated_user(authorization)
    if user.provider == "local":
        if "admin" not in auth_manager.local_user_roles(user.user_id):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Administrátorský přístup byl zamítnut.")
        share_store.register_identity(user.user_id, user.email, user.name)
        share_store.set_roles(user.user_id, auth_manager.local_user_roles(user.user_id))
        return user
    if user.email:
        share_store.register_identity(user.user_id, user.email, user.name)
    if user.email and user.email.lower() in ADMIN_EMAILS:
        share_store.add_role(user.user_id, "admin")
    elif not share_store.has_role(user.user_id, "admin"):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Administrátorský přístup byl zamítnut.")
    return user


def verify_trusted_device(
    user_id: Annotated[str, Depends(verify_bearer_token)],
    x_device_id: Annotated[str | None, Header(alias="X-Device-ID")] = None,
) -> str:
    if not x_device_id or not device_store.is_active(user_id, x_device_id):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Device is not trusted for this account.")
    return user_id


def verify_registered_device(
    user_id: Annotated[str, Depends(verify_bearer_token)],
    x_device_id: Annotated[str | None, Header(alias="X-Device-ID")] = None,
) -> str:
    if not x_device_id or not device_store.is_registered(user_id, x_device_id):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Device is not registered for this account.")
    return user_id


def verify_sharing_user(
    authorization: Annotated[str | None, Header()] = None,
) -> AuthenticatedUser:
    user = auth_manager.resolve_authenticated_user(authorization)
    if not user.email:
        raise HTTPException(status_code=403, detail="Sdílení vyžaduje účet s ověřeným e-mailem.")
    share_store.register_identity(user.user_id, user.email, user.name)
    if user.email.lower() in ADMIN_EMAILS:
        share_store.add_role(user.user_id, "admin")
    return user


@app.get("/healthz")
def healthcheck() -> dict[str, str]:
    backend = "postgres" if DATABASE_URL else "sqlite"
    auth_mode = "local" if auth_manager.local_auth_enabled else ("federated" if auth_manager.federated_auth_enabled else "legacy")
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


@app.get("/api/v1/admin/status")
def admin_status(admin: Annotated[AuthenticatedUser, Depends(verify_admin)]) -> dict[str, object]:
    return {
        "administrator": admin.email,
        "application": {
            "version": APP_VERSION,
            "storage": "postgres" if DATABASE_URL else "sqlite",
            "gmailEnabled": auth_manager.google_enabled,
            "adminCount": len(ADMIN_EMAILS),
            "schemaVersion": "2",
        },
        "cloud": cloud_admin_service.get_status(),
        "gmail": {
            "enabled": os.getenv("NEURODIARY_GMAIL_SEND_ENABLED", "false").lower() == "true",
            "oauthVerified": os.getenv("NEURODIARY_GMAIL_OAUTH_VERIFIED", "false").lower() == "true",
        },
        "alerts": {
            "configured": bool(os.getenv("NEURODIARY_ADMIN_ALERT_EMAIL", "").strip()),
            "recipient": os.getenv("NEURODIARY_ADMIN_ALERT_EMAIL", "").strip(),
        },
    }


@app.get("/api/v1/admin/users")
def admin_list_users(admin: Annotated[AuthenticatedUser, Depends(verify_admin)]) -> dict[str, object]:
    users = [
        {
            "userId": item["user_id"], "email": item["email"], "name": item["display_name"],
            "roles": item["roles"], "updatedAt": item["updated_at"],
        }
        for item in share_store.list_users()
    ]
    known_ids = {item["userId"] for item in users}
    if auth_manager.local_auth_enabled:
        for item in auth_manager.list_local_users():
            local_view = {**item, "updatedAt": None}
            if item["userId"] in known_ids:
                users = [local_view if existing["userId"] == item["userId"] else existing for existing in users]
            else:
                users.append(local_view)
    return {"roles": ROLE_DEFINITIONS, "users": users}


@app.patch("/api/v1/admin/users/{target_user_id}/roles")
def admin_update_user_roles(
    target_user_id: str,
    payload: UserRolesUpdateModel,
    admin: Annotated[AuthenticatedUser, Depends(verify_admin)],
) -> dict[str, object]:
    roles = list(dict.fromkeys(payload.roles))
    if target_user_id.startswith("local:"):
        auth_manager.set_local_user_roles(target_user_id, roles)
        local_user = next(item for item in auth_manager.list_local_users() if item["userId"] == target_user_id)
        share_store.register_identity(target_user_id, local_user["email"], local_user["name"])
    if not share_store.set_roles(target_user_id, roles):
        raise HTTPException(status_code=404, detail="Uživatelský účet nebyl nalezen.")
    audit_security(admin.user_id, "admin-console", AuditEventType.ACCOUNT_ROLES_CHANGED, targetUserId=target_user_id, roles=roles)
    return {"status": "ok", "userId": target_user_id, "roles": roles}


@app.get("/api/v1/roles")
def get_current_roles(
    user: Annotated[AuthenticatedUser, Depends(verify_sharing_user)],
    x_device_id: Annotated[str | None, Header(alias="X-Device-ID")] = None,
) -> dict[str, object]:
    if not x_device_id or not device_store.is_active(user.user_id, x_device_id):
        raise HTTPException(status_code=403, detail="Role zařízení jsou dostupné jen z důvěryhodného zařízení.")
    assigned = share_store.get_roles(user.user_id)
    return {"assignedRoles": assigned, "activeRoles": share_store.get_active_roles(user.user_id, x_device_id), "definitions": ROLE_DEFINITIONS}


@app.put("/api/v1/roles/active")
def update_current_device_roles(
    payload: DeviceActiveRolesUpdateModel,
    user: Annotated[AuthenticatedUser, Depends(verify_sharing_user)],
    x_device_id: Annotated[str | None, Header(alias="X-Device-ID")] = None,
) -> dict[str, object]:
    if not x_device_id or not device_store.is_active(user.user_id, x_device_id):
        raise HTTPException(status_code=403, detail="Role zařízení lze změnit jen z důvěryhodného zařízení.")
    assigned = set(share_store.get_roles(user.user_id))
    if not set(payload.roles).issubset(assigned):
        raise HTTPException(status_code=403, detail="Zařízení nemůže aktivovat roli, která účtu nebyla přidělena.")
    share_store.set_active_roles(user.user_id, x_device_id, list(payload.roles))
    audit_security(user.user_id, x_device_id, AuditEventType.DEVICE_ACTIVE_ROLES_CHANGED, roles=list(payload.roles))
    return {"status": "ok", "assignedRoles": sorted(assigned), "activeRoles": list(payload.roles)}


@app.put("/api/v1/roles/self")
def update_self_assignable_roles(
    payload: UserRolesUpdateModel,
    user: Annotated[AuthenticatedUser, Depends(verify_sharing_user)],
    x_device_id: Annotated[str | None, Header(alias="X-Device-ID")] = None,
) -> dict[str, object]:
    if not x_device_id or not device_store.is_active(user.user_id, x_device_id):
        raise HTTPException(status_code=403, detail="Role účtu lze změnit jen z důvěryhodného zařízení.")
    requested = set(payload.roles)
    self_assignable = {role for role, definition in ROLE_DEFINITIONS.items() if definition["selfAssignable"]}
    if not requested.issubset(self_assignable):
        raise HTTPException(status_code=403, detail="Role lékaře a administrátora může přidělit pouze správce.")
    privileged = set(share_store.get_roles(user.user_id)) - self_assignable
    combined = sorted(privileged | requested)
    if not combined:
        raise HTTPException(status_code=400, detail="Účet musí mít alespoň jednu roli.")
    share_store.set_roles(user.user_id, combined)
    audit_security(user.user_id, x_device_id, AuditEventType.SELF_ASSIGNABLE_ROLES_CHANGED, roles=combined)
    return {
        "status": "ok", "assignedRoles": combined,
        "activeRoles": share_store.get_active_roles(user.user_id, x_device_id),
        "definitions": ROLE_DEFINITIONS,
    }


@app.post("/api/v1/admin/backups")
def admin_create_backup(
    admin: Annotated[AuthenticatedUser, Depends(verify_admin)],
) -> dict[str, object]:
    try:
        backup = cloud_admin_service.create_backup(f"NeuroDiary manual backup by {admin.email}")
    except RuntimeError as error:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(error)) from error
    audit_security(
        admin.user_id,
        "admin-console",
        AuditEventType.ADMIN_BACKUP_CREATED,
        backupId=str(backup.get("id", "")),
    )
    log_event("WARNING", "admin_backup_created", administrator=admin.email, backupId=str(backup.get("id", "")))
    return {"status": "created", "backup": backup}


@app.delete("/api/v1/admin/backups/{backup_id}")
def admin_delete_backup(
    backup_id: str,
    confirm: bool,
    admin: Annotated[AuthenticatedUser, Depends(verify_admin)],
) -> dict[str, str]:
    if not confirm:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Smazání zálohy nebylo potvrzeno.")
    try:
        cloud_admin_service.delete_backup(backup_id)
    except RuntimeError as error:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(error)) from error
    audit_security(admin.user_id, "admin-console", AuditEventType.ADMIN_BACKUP_DELETED, backupId=backup_id)
    log_event("WARNING", "admin_backup_deleted", administrator=admin.email, backupId=backup_id)
    return {"status": "deleted", "backupId": backup_id}


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
        localAuthEnabled=auth_manager.local_auth_enabled,
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
    x_device_id: Annotated[str | None, Header(alias="X-Device-ID")] = None,
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
    audit_security(
        user_id,
        x_device_id or "unknown-device",
        AuditEventType.PUSH_NOTIFICATIONS_ENABLED,
        scheduledCount=scheduled_count,
    )
    return PushRegistrationResponseModel(status="ok", scheduledCount=scheduled_count)


@app.delete("/api/v1/push/registration", response_model=PushRegistrationResponseModel)
def unregister_push(
    payload: PushUnsubscribeRequestModel,
    user_id: Annotated[str, Depends(verify_trusted_device)],
    x_device_id: Annotated[str | None, Header(alias="X-Device-ID")] = None,
) -> PushRegistrationResponseModel:
    removed = push_store.delete_subscription(user_id, payload.endpoint)
    if removed:
        audit_security(
            user_id,
            x_device_id or "unknown-device",
            AuditEventType.PUSH_NOTIFICATIONS_DISABLED,
        )
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
    share_store.register_identity(user.user_id, user.email, user.name)
    audit_security(user.user_id, "authentication", AuditEventType.AUTH_SESSION_CREATED, provider=user.provider)
    return AuthSessionResponseModel(
        accessToken=access_token,
        expiresAt=expires_at,
        user=AuthenticatedUserModel(
            provider=user.provider, userId=user.user_id, email=user.email, name=user.name,
        ),
    )


@app.post("/api/v1/auth/local", response_model=AuthSessionResponseModel)
def login_local_user(payload: LocalLoginRequestModel) -> AuthSessionResponseModel:
    user, access_token, expires_at = auth_manager.authenticate_local_user(payload.username, payload.password)
    share_store.register_identity(user.user_id, user.email, user.name)
    share_store.set_roles(user.user_id, auth_manager.local_user_roles(user.user_id))
    audit_security(user.user_id, "authentication", AuditEventType.AUTH_SESSION_CREATED, provider=user.provider)
    return AuthSessionResponseModel(
        accessToken=access_token,
        expiresAt=expires_at,
        user=AuthenticatedUserModel(
            provider=user.provider, userId=user.user_id, email=user.email, name=user.name,
        ),
    )


@app.get("/api/v1/admin/local-users")
def admin_list_local_users(admin: Annotated[AuthenticatedUser, Depends(verify_admin)]) -> dict[str, object]:
    return {"users": auth_manager.list_local_users()}


@app.post("/api/v1/admin/local-users", status_code=201)
def admin_create_local_user(
    payload: LocalUserCreateModel,
    admin: Annotated[AuthenticatedUser, Depends(verify_admin)],
) -> dict[str, str]:
    auth_manager.save_local_user(
        username=payload.username, password=payload.password, name=payload.name,
        email=payload.email.strip().lower(), roles=list(dict.fromkeys(payload.roles)),
    )
    return {"status": "created", "userId": f"local:{payload.username}"}


@app.delete("/api/v1/admin/local-users/{target_user_id}")
def admin_delete_local_user(
    target_user_id: str,
    admin: Annotated[AuthenticatedUser, Depends(verify_admin)],
) -> dict[str, str]:
    decoded_id = target_user_id.removeprefix("local:")
    if f"local:{decoded_id}" == admin.user_id:
        raise HTTPException(status_code=400, detail="Právě přihlášený účet nelze odstranit.")
    auth_manager.delete_local_user(decoded_id)
    return {"status": "deleted", "userId": f"local:{decoded_id}"}
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
    migration_enabled = key_exchange_store.get_migration(user_id)["enabled"]
    was_revoked = record.revoked_at is not None
    if was_revoked and migration_enabled:
        device_store.emergency_reactivate(user_id, payload.deviceId)
        record = device_store.get(user_id, payload.deviceId)
        audit_security(user_id, payload.deviceId, AuditEventType.EMERGENCY_REVOKED_DEVICE_REACTIVATED)
    elif record.revoked_at is not None:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Device has been revoked.")
    if migration_enabled:
        was_pending = record.trust_status == "pending"
        device_store.trust(user_id, payload.deviceId)
        record = device_store.get(user_id, payload.deviceId)
        if was_pending:
            audit_security(user_id, payload.deviceId, AuditEventType.EMERGENCY_DEVICE_REGISTRATION_ACCEPTED)
    return TrustedDeviceModel(
        deviceId=record.device_id, name=record.name, createdAt=record.created_at,
        lastSeenAt=record.last_seen_at, revokedAt=record.revoked_at, current=True, trustStatus=record.trust_status,
    )


def canonical_jwk(jwk: dict[str, object]) -> str:
    return json.dumps(jwk, sort_keys=True, separators=(",", ":"))


def audit_security(user_id: str, device_id: str, event_type: AuditEventType, **details: object) -> None:
    event_name = event_type.value
    try:
        safe_details = validate_audit_details(event_type, details)
        key_exchange_store.record_audit(
            str(uuid.uuid4()),
            user_id,
            device_id,
            event_name,
            json.dumps(safe_details, separators=(",", ":")),
        )
    except Exception as error:
        # Audit availability must not lock users out of the emergency registration path.
        log_event("ERROR", "security_audit_write_failed", deviceId=device_id, eventType=event_name, errorType=type(error).__name__)


def send_treatment_notification(user_id: str, body: str) -> None:
    if not push_service.enabled:
        return
    for item in push_store.list_subscriptions(user_id):
        subscription = {"endpoint": item["endpoint"], "keys": {"p256dh": item["p256dh"], "auth": item["auth"]}}
        try:
            push_service.send_treatment_proposal_notification(subscription, body)
        except WebPushException as error:
            if push_service.is_expired_subscription(error):
                push_store.delete_subscription(user_id, item["endpoint"])
            log_event("WARNING", "treatment_proposal_push_failed", errorType=type(error).__name__)
        except Exception as error:
            log_event("ERROR", "treatment_proposal_push_failed", errorType=type(error).__name__)


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
    if x_device_id != payload.deviceId or not device_store.is_registered(user_id, payload.deviceId):
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
    if x_device_id != payload.deviceId or not device_store.is_registered(user_id, payload.deviceId):
        raise HTTPException(status_code=403, detail="A device may only publish its own key.")
    validate_device_public_key(payload.publicKeyJwk)
    jwk_json = canonical_jwk(payload.publicKeyJwk)
    secret_hash = hashlib.sha256(payload.challengeSecret.encode()).hexdigest()
    if not key_exchange_store.consume_challenge(payload.challengeId, user_id, payload.deviceId, jwk_json, secret_hash):
        raise HTTPException(status_code=403, detail="Device key ownership proof is invalid or expired.")
    fingerprint = hashlib.sha256(jwk_json.encode()).hexdigest()
    migration_enabled = key_exchange_store.get_migration(user_id)["enabled"]
    record, is_bootstrap_device = key_exchange_store.put_key_with_bootstrap(user_id, payload.deviceId, jwk_json, fingerprint)
    if is_bootstrap_device or migration_enabled:
        device_store.trust(user_id, payload.deviceId)
        audit_security(user_id, payload.deviceId, AuditEventType.DEVICE_BOOTSTRAP_TRUSTED if is_bootstrap_device else AuditEventType.DEVICE_MIGRATION_TRUSTED, fingerprint=fingerprint)
    audit_security(user_id, payload.deviceId, AuditEventType.DEVICE_KEY_VERIFIED, fingerprint=fingerprint)
    return DevicePublicKeyModel(deviceId=record.device_id, publicKeyJwk=json.loads(record.public_key_jwk), fingerprint=record.fingerprint, verifiedAt=record.verified_at)


@app.put("/api/v1/devices/current/key-emergency", response_model=DevicePublicKeyModel)
def publish_current_device_key_emergency(
    payload: DeviceKeyChallengeRequestModel,
    user_id: Annotated[str, Depends(verify_registered_device)],
    x_device_id: Annotated[str | None, Header(alias="X-Device-ID")] = None,
) -> DevicePublicKeyModel:
    if x_device_id != payload.deviceId:
        raise HTTPException(status_code=403, detail="A device may only publish a key for its own device ID.")
    if not key_exchange_store.get_migration(user_id)["enabled"]:
        raise HTTPException(status_code=403, detail="Emergency identity-key migration is closed.")
    validate_device_public_key(payload.publicKeyJwk)
    jwk_json = canonical_jwk(payload.publicKeyJwk)
    fingerprint = hashlib.sha256(jwk_json.encode()).hexdigest()
    record, _ = key_exchange_store.put_key_with_bootstrap(user_id, payload.deviceId, jwk_json, fingerprint)
    device_store.trust(user_id, payload.deviceId)
    audit_security(user_id, payload.deviceId, AuditEventType.EMERGENCY_DEVICE_KEY_ACCEPTED, fingerprint=fingerprint)
    return DevicePublicKeyModel(deviceId=record.device_id, publicKeyJwk=json.loads(record.public_key_jwk), fingerprint=record.fingerprint, verifiedAt=record.verified_at)


def migration_response(record) -> IdentityKeyMigrationModel:
    parse = lambda value: datetime.fromisoformat(value) if isinstance(value, str) else value
    return IdentityKeyMigrationModel(enabled=record["enabled"], createdAt=parse(record["created_at"]), disabledAt=parse(record["disabled_at"]) if record["disabled_at"] else None, disabledByDeviceId=record["disabled_by_device_id"])


@app.get("/api/v1/devices/key-migration", response_model=IdentityKeyMigrationModel)
def get_identity_key_migration(
    user_id: Annotated[str, Depends(verify_registered_device)],
) -> IdentityKeyMigrationModel:
    return migration_response(key_exchange_store.get_migration(user_id))


@app.post("/api/v1/devices/key-migration/disable", response_model=IdentityKeyMigrationModel)
def disable_identity_key_migration(
    user_id: Annotated[str, Depends(verify_trusted_device)],
    x_device_id: Annotated[str | None, Header(alias="X-Device-ID")] = None,
) -> IdentityKeyMigrationModel:
    if key_exchange_store.disable_migration(user_id, x_device_id):
        audit_security(user_id, x_device_id, AuditEventType.IDENTITY_KEY_MIGRATION_DISABLED)
    return migration_response(key_exchange_store.get_migration(user_id))


@app.get("/api/v1/devices/keys", response_model=DevicePublicKeyListResponseModel)
def list_device_keys(user_id: Annotated[str, Depends(verify_trusted_device)]) -> DevicePublicKeyListResponseModel:
    active_ids = {item.device_id for item in device_store.list(user_id) if item.revoked_at is None}
    return DevicePublicKeyListResponseModel(keys=[
        DevicePublicKeyModel(deviceId=item.device_id, publicKeyJwk=json.loads(item.public_key_jwk), fingerprint=item.fingerprint, verifiedAt=item.verified_at)
        for item in key_exchange_store.list_keys(user_id) if item.device_id in active_ids
    ])


@app.post("/api/v1/devices/current/key-request", response_model=DeviceKeyRequestModel)
def request_current_device_key(
    user_id: Annotated[str, Depends(verify_registered_device)],
    x_device_id: Annotated[str | None, Header(alias="X-Device-ID")] = None,
) -> DeviceKeyRequestModel:
    if not key_exchange_store.get_key(user_id, x_device_id):
        raise HTTPException(status_code=409, detail="Current device must publish a verified public key first.")
    request_id = str(uuid.uuid4())
    record = key_exchange_store.create_request(request_id, user_id, x_device_id, datetime.now(UTC) + timedelta(hours=24))
    audit_security(user_id, x_device_id, AuditEventType.MASTER_KEY_REQUESTED, requestId=request_id)
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
    if not device_store.is_registered(user_id, payload.targetDeviceId) or not target_key:
        raise HTTPException(status_code=404, detail="Target device has no verified public key.")
    if payload.envelope.targetFingerprint != target_key.fingerprint:
        raise HTTPException(status_code=400, detail="Transfer envelope is not bound to the target device key.")
    snapshot = store.load_latest(user_id)
    if not snapshot or payload.keyVersion != snapshot.payload.keyVersion:
        raise HTTPException(status_code=409, detail="Transfer key version is not the current account key version.")
    transfer_id = str(uuid.uuid4())
    expires_at = datetime.now(UTC) + timedelta(seconds=payload.expiresInSeconds)
    record = key_exchange_store.create_transfer(transfer_id, user_id, x_device_id, payload.targetDeviceId, payload.keyVersion, payload.envelope.model_dump_json(), expires_at)
    audit_security(user_id, x_device_id, AuditEventType.MASTER_KEY_TRANSFER_CREATED, transferId=transfer_id, targetDeviceId=payload.targetDeviceId, keyVersion=payload.keyVersion)
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
    audit_security(user_id, x_device_id, AuditEventType.MASTER_KEY_TRANSFER_CREATED, requestId=payload.requestId, targetDeviceId=payload.transfer.targetDeviceId, keyVersion=payload.transfer.keyVersion)
    return result


@app.get("/api/v1/devices/current/key-transfer", response_model=DeviceKeyTransferModel | None)
def consume_current_device_key_transfer(
    user_id: Annotated[str, Depends(verify_registered_device)],
    x_device_id: Annotated[str | None, Header(alias="X-Device-ID")] = None,
) -> DeviceKeyTransferModel | None:
    record = key_exchange_store.get_transfer(user_id, x_device_id)
    if not record:
        return None
    return DeviceKeyTransferModel(transferId=record.transfer_id, sourceDeviceId=record.source_device_id, targetDeviceId=record.target_device_id, keyVersion=record.key_version, envelope=json.loads(record.envelope_json), createdAt=record.created_at, expiresAt=record.expires_at)


@app.post("/api/v1/devices/current/key-transfer/confirm", response_model=DeviceActionResponseModel)
def confirm_current_device_key_transfer(
    payload: DeviceKeyTransferConfirmModel,
    user_id: Annotated[str, Depends(verify_registered_device)],
    x_device_id: Annotated[str | None, Header(alias="X-Device-ID")] = None,
) -> DeviceActionResponseModel:
    if not key_exchange_store.confirm_transfer(user_id, x_device_id, payload.transferId):
        raise HTTPException(status_code=404, detail="Key transfer is missing, expired, or already confirmed.")
    device_store.trust(user_id, x_device_id)
    audit_security(user_id, x_device_id, AuditEventType.MASTER_KEY_TRANSFER_CONFIRMED, transferId=payload.transferId)
    return DeviceActionResponseModel(status="ok", affected=1)


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
            trustStatus="revoked" if item.revoked_at else item.trust_status,
        )
        for item in device_store.list(user_id)
    ])


@app.patch("/api/v1/devices/{device_id}", response_model=TrustedDeviceModel)
def rename_trusted_device(
    device_id: str,
    payload: DeviceAliasRequestModel,
    user_id: Annotated[str, Depends(verify_bearer_token)],
    x_device_id: Annotated[str | None, Header(alias="X-Device-ID")] = None,
) -> TrustedDeviceModel:
    if not x_device_id or not device_store.is_active(user_id, x_device_id):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Current device is not trusted.")
    record = device_store.rename(user_id, device_id, payload.name)
    if not record:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Aktivní zařízení nebylo nalezeno.")
    audit_security(user_id, x_device_id, AuditEventType.DEVICE_ALIAS_CHANGED, targetDeviceId=device_id)
    return TrustedDeviceModel(
        deviceId=record.device_id, name=record.name, createdAt=record.created_at,
        lastSeenAt=record.last_seen_at, revokedAt=record.revoked_at,
        current=record.device_id == x_device_id, trustStatus=record.trust_status,
    )


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
    audit_security(user_id, x_device_id, AuditEventType.DEVICE_REVOKED, revokedDeviceId=device_id)
    return DeviceActionResponseModel(status="ok", affected=1)


@app.get("/api/v1/security/audit", response_model=SecurityAuditListResponseModel)
def list_security_audit(
    user_id: Annotated[str, Depends(verify_trusted_device)],
    limit: Annotated[int, Query(ge=1, le=100)] = 50,
    cursor: Annotated[str | None, Query(max_length=128)] = None,
) -> SecurityAuditListResponseModel:
    page = key_exchange_store.list_audit(user_id, limit=limit + 1, before_event_id=cursor)
    has_more = len(page) > limit
    items = page[:limit]
    integrity = key_exchange_store.verify_audit(user_id)
    return SecurityAuditListResponseModel(
        events=[
            SecurityAuditEventModel(
                eventId=item["event_id"],
                deviceId=item["device_id"],
                eventType=item["event_type"],
                label=audit_event_label(item["event_type"]),
                details=json.loads(item["details_json"]),
                createdAt=datetime.fromisoformat(item["created_at"]) if isinstance(item["created_at"], str) else item["created_at"],
            )
            for item in items
        ],
        nextCursor=items[-1]["event_id"] if has_more else None,
        integrityStatus=integrity["status"],
        integrityCheckedEvents=integrity["checked"],
    )


@app.post("/api/v1/devices/revoke-others", response_model=DeviceActionResponseModel)
def revoke_other_devices(
    user_id: Annotated[str, Depends(verify_bearer_token)],
    x_device_id: Annotated[str | None, Header(alias="X-Device-ID")] = None,
) -> DeviceActionResponseModel:
    if not x_device_id or not device_store.is_active(user_id, x_device_id):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Current device is not trusted.")
    affected = device_store.revoke_others(user_id, x_device_id)
    audit_security(user_id, x_device_id, AuditEventType.OTHER_DEVICES_REVOKED, affected=affected)
    return DeviceActionResponseModel(status="ok", affected=affected)


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


@app.post("/api/v1/sync/rotate", response_model=SyncPushResponseModel)
def rotate_state_key(
    payload: SyncRotationRequestModel,
    user_id: Annotated[str, Depends(verify_trusted_device)],
    x_device_id: Annotated[str | None, Header(alias="X-Device-ID")] = None,
) -> SyncPushResponseModel:
    current = store.load_latest(user_id)
    expected_version = (current.payload.keyVersion if current else 0) + 1
    if payload.payload.keyVersion != expected_version or payload.wrappedKey.keyVersion != expected_version:
        raise HTTPException(status_code=409, detail="Rotation must advance the account key by exactly one version.")
    seen = set()
    validated_targets = []
    for transfer in payload.transfers:
        if transfer.targetDeviceId == x_device_id or transfer.targetDeviceId in seen:
            raise HTTPException(status_code=400, detail="Rotation contains a duplicate or current target device.")
        target_key = key_exchange_store.get_key(user_id, transfer.targetDeviceId)
        if not device_store.is_active(user_id, transfer.targetDeviceId) or not target_key:
            raise HTTPException(status_code=409, detail="Every rotation target must be trusted and have a verified key.")
        if transfer.envelope.targetFingerprint != target_key.fingerprint:
            raise HTTPException(status_code=400, detail="Rotation envelope fingerprint does not match its target.")
        seen.add(transfer.targetDeviceId)
        validated_targets.append(transfer)
    try:
        result = store.save_state(user_id=user_id, base_revision=payload.baseRevision, payload=payload.payload, wrapped_key=payload.wrappedKey, force=False)
    except RevisionConflictError as error:
        raise HTTPException(status_code=409, detail="Rotation base revision is stale.") from error
    expires_at = datetime.now(UTC) + timedelta(minutes=10)
    for transfer in validated_targets:
        transfer_id = str(uuid.uuid4())
        key_exchange_store.create_transfer(transfer_id, user_id, x_device_id, transfer.targetDeviceId, expected_version, transfer.envelope.model_dump_json(), expires_at)
        audit_security(user_id, x_device_id, AuditEventType.ROTATION_KEY_DISTRIBUTED, transferId=transfer_id, targetDeviceId=transfer.targetDeviceId, keyVersion=expected_version)
    audit_security(user_id, x_device_id, AuditEventType.KEY_ROTATED, keyVersion=expected_version, targetCount=len(validated_targets))
    return SyncPushResponseModel(status="ok", revision=result.revision, updatedAt=result.updated_at, payload=result.payload, wrappedKey=result.wrapped_key)


@app.delete("/api/v1/sync/reset", response_model=SyncResetResponseModel)
def reset_state(
    user_id: Annotated[str, Depends(verify_trusted_device)],
    x_device_id: Annotated[str | None, Header(alias="X-Device-ID")] = None,
) -> SyncResetResponseModel:
    deleted_at = store.delete_state(user_id)
    audit_security(user_id, x_device_id or "unknown-device", AuditEventType.SYNC_STATE_RESET)
    return SyncResetResponseModel(status="ok", deleted=True, updatedAt=deleted_at)


@app.get("/api/v1/shares")
def list_shares(
    user: Annotated[AuthenticatedUser, Depends(verify_sharing_user)],
    x_device_id: Annotated[str | None, Header(alias="X-Device-ID")] = None,
    includeIncoming: bool = False,
) -> dict[str, object]:
    if not x_device_id or not device_store.is_active(user.user_id, x_device_id):
        raise HTTPException(status_code=403, detail="Sdílení je dostupné jen z důvěryhodného zařízení.")
    outgoing = [
        {
            "grantId": row["grant_id"], "recipientEmail": row["email"],
            "recipientName": row["display_name"], "recipientDeviceId": row["recipient_device_id"],
            "createdAt": row["created_at"], "revokedAt": row["revoked_at"],
        }
        for row in share_store.get_outgoing(user.user_id)
    ]
    incoming = []
    for row in share_store.get_incoming(user.user_id, x_device_id) if includeIncoming else []:
        snapshot = store.load_latest(row["owner_user_id"])
        if snapshot is None:
            continue
        incoming.append({
            "grantId": row["grant_id"], "ownerEmail": row["email"], "ownerName": row["display_name"],
            "createdAt": row["created_at"], "revision": snapshot.revision, "updatedAt": snapshot.updatedAt,
            "payload": snapshot.payload.model_dump(mode="json"), "keyVersion": row["key_version"],
            "keyEnvelope": json.loads(row["key_envelope_json"]),
        })
    outgoing_invitations = [
        {
            "invitationId": row["invitation_id"], "recipientEmail": row["recipient_email"],
            "status": row["status"], "createdAt": row["created_at"], "updatedAt": row["updated_at"],
            "expiresAt": row["expires_at"], "grantId": row["grant_id"],
        }
        for row in share_store.list_outgoing_invitations(user.user_id)
    ]
    incoming_invitations = [
        {
            "invitationId": row["invitation_id"], "ownerEmail": row["owner_email"],
            "ownerName": row["owner_name"], "status": row["status"],
            "createdAt": row["created_at"], "updatedAt": row["updated_at"], "expiresAt": row["expires_at"],
        }
        for row in share_store.list_incoming_invitations(user.user_id, user.email.strip().lower())
    ]
    return {
        "currentUser": {"email": user.email, "name": user.name},
        "outgoing": outgoing, "incoming": incoming,
        "outgoingInvitations": outgoing_invitations, "incomingInvitations": incoming_invitations,
    }


@app.post("/api/v1/share-invitations")
def create_share_invitation(
    payload: ShareInvitationRequestModel,
    user: Annotated[AuthenticatedUser, Depends(verify_sharing_user)],
    x_device_id: Annotated[str | None, Header(alias="X-Device-ID")] = None,
) -> dict[str, str]:
    if not x_device_id or not device_store.is_active(user.user_id, x_device_id):
        raise HTTPException(status_code=403, detail="Pozvánku lze vytvořit jen z důvěryhodného zařízení.")
    if payload.recipientEmail == user.email.strip().lower():
        raise HTTPException(status_code=400, detail="Deník nelze sdílet s vlastním účtem.")
    recipient = share_store.find_identity(payload.recipientEmail)
    invitation_id = share_store.create_invitation(
        user.user_id, payload.recipientEmail, recipient["user_id"] if recipient else None,
    )
    audit_security(user.user_id, x_device_id, AuditEventType.DIARY_SHARE_INVITATION_CREATED, invitationId=invitation_id)
    # The response intentionally does not reveal whether the e-mail already has an account.
    return {"status": "pending", "invitationId": invitation_id}


@app.post("/api/v1/share-invitations/{invitation_id}/respond")
def respond_to_share_invitation(
    invitation_id: str,
    payload: ShareInvitationResponseModel,
    user: Annotated[AuthenticatedUser, Depends(verify_sharing_user)],
    x_device_id: Annotated[str | None, Header(alias="X-Device-ID")] = None,
) -> dict[str, str]:
    if not x_device_id or not device_store.is_active(user.user_id, x_device_id):
        raise HTTPException(status_code=403, detail="Na pozvánku lze odpovědět jen z důvěryhodného zařízení.")
    if payload.accept and not key_exchange_store.get_key(user.user_id, x_device_id):
        raise HTTPException(status_code=409, detail="Nejprve je nutné publikovat ověřený klíč tohoto zařízení.")
    if not share_store.respond_to_invitation(
        invitation_id, user.user_id, user.email.strip().lower(), x_device_id, payload.accept,
    ):
        raise HTTPException(status_code=404, detail="Aktivní pozvánka nebyla nalezena.")
    next_status = "accepted" if payload.accept else "declined"
    audit_security(user.user_id, x_device_id, INVITATION_DECISION_EVENTS[next_status], invitationId=invitation_id)
    return {"status": next_status}


@app.get("/api/v1/share-invitations/{invitation_id}/recipient-key")
def get_invitation_recipient_key(
    invitation_id: str,
    user: Annotated[AuthenticatedUser, Depends(verify_sharing_user)],
) -> dict[str, object]:
    invitation = share_store.get_invitation_for_owner(user.user_id, invitation_id)
    if not invitation or invitation["status"] != "accepted" or not invitation["recipient_user_id"] or not invitation["recipient_device_id"]:
        raise HTTPException(status_code=409, detail="Pozvánka zatím nebyla přijata.")
    key = key_exchange_store.get_key(invitation["recipient_user_id"], invitation["recipient_device_id"])
    if not key or not device_store.is_active(invitation["recipient_user_id"], invitation["recipient_device_id"]):
        raise HTTPException(status_code=409, detail="Přijímající zařízení už není důvěryhodné.")
    return {"deviceId": key.device_id, "publicKeyJwk": json.loads(key.public_key_jwk), "fingerprint": key.fingerprint}


@app.post("/api/v1/share-invitations/{invitation_id}/activate")
def activate_share_invitation(
    invitation_id: str,
    payload: ShareInvitationActivationModel,
    user: Annotated[AuthenticatedUser, Depends(verify_sharing_user)],
    x_device_id: Annotated[str | None, Header(alias="X-Device-ID")] = None,
) -> dict[str, str]:
    if not x_device_id or not device_store.is_active(user.user_id, x_device_id):
        raise HTTPException(status_code=403, detail="Sdílení lze aktivovat jen z důvěryhodného zařízení.")
    invitation = share_store.get_invitation_for_owner(user.user_id, invitation_id)
    if not invitation or invitation["status"] != "accepted":
        raise HTTPException(status_code=409, detail="Pozvánka není připravena k aktivaci.")
    target_key = key_exchange_store.get_key(invitation["recipient_user_id"], invitation["recipient_device_id"])
    if not target_key or payload.keyEnvelope.targetFingerprint != target_key.fingerprint:
        raise HTTPException(status_code=400, detail="Obálka klíče nepatří přijímajícímu zařízení.")
    grant_id = share_store.save_grant(
        user.user_id, invitation["recipient_user_id"], invitation["recipient_device_id"],
        payload.keyVersion, payload.keyEnvelope.model_dump(),
    )
    if not share_store.activate_invitation(user.user_id, invitation_id, grant_id):
        raise HTTPException(status_code=409, detail="Pozvánku se nepodařilo aktivovat.")
    audit_security(user.user_id, x_device_id, AuditEventType.DIARY_SHARE_ACTIVATED, invitationId=invitation_id, grantId=grant_id)
    return {"status": "active", "grantId": grant_id}


@app.delete("/api/v1/share-invitations/{invitation_id}")
def cancel_share_invitation(
    invitation_id: str,
    user: Annotated[AuthenticatedUser, Depends(verify_sharing_user)],
    x_device_id: Annotated[str | None, Header(alias="X-Device-ID")] = None,
) -> dict[str, str]:
    if not x_device_id or not device_store.is_active(user.user_id, x_device_id):
        raise HTTPException(status_code=403, detail="Pozvánku lze zrušit jen z důvěryhodného zařízení.")
    if not share_store.cancel_invitation(user.user_id, invitation_id):
        raise HTTPException(status_code=404, detail="Čekající pozvánka nebyla nalezena.")
    audit_security(user.user_id, x_device_id, AuditEventType.DIARY_SHARE_INVITATION_CANCELLED, invitationId=invitation_id)
    return {"status": "cancelled"}


@app.get("/api/v1/shares/recipient-key")
def get_share_recipient_key(
    email: str,
    user: Annotated[AuthenticatedUser, Depends(verify_sharing_user)],
) -> dict[str, object]:
    identity = share_store.find_identity(email)
    if not identity or identity["user_id"] == user.user_id:
        raise HTTPException(status_code=404, detail="Příjemce se sdílením nebyl nalezen.")
    keys = [key for key in key_exchange_store.list_keys(identity["user_id"]) if device_store.is_active(identity["user_id"], key.device_id)]
    if not keys:
        raise HTTPException(status_code=409, detail="Příjemce zatím nemá důvěryhodné zařízení s ověřeným klíčem.")
    key = max(keys, key=lambda item: item.verified_at)
    return {"deviceId": key.device_id, "publicKeyJwk": json.loads(key.public_key_jwk), "fingerprint": key.fingerprint}


@app.post("/api/v1/shares")
def create_share(
    payload: ShareGrantRequestModel,
    user: Annotated[AuthenticatedUser, Depends(verify_sharing_user)],
    x_device_id: Annotated[str | None, Header(alias="X-Device-ID")] = None,
) -> dict[str, str]:
    if not x_device_id or not device_store.is_active(user.user_id, x_device_id):
        raise HTTPException(status_code=403, detail="Sdílení je dostupné jen z důvěryhodného zařízení.")
    recipient = share_store.find_identity(payload.recipientEmail)
    if not recipient or recipient["user_id"] == user.user_id:
        raise HTTPException(status_code=404, detail="Příjemce se sdílením nebyl nalezen.")
    target_key = key_exchange_store.get_key(recipient["user_id"], payload.recipientDeviceId)
    if not target_key or not device_store.is_active(recipient["user_id"], payload.recipientDeviceId):
        raise HTTPException(status_code=409, detail="Zařízení příjemce už není důvěryhodné.")
    if payload.keyEnvelope.targetFingerprint != target_key.fingerprint:
        raise HTTPException(status_code=400, detail="Obálka klíče nepatří zařízení příjemce.")
    share_store.save_grant(user.user_id, recipient["user_id"], payload.recipientDeviceId, payload.keyVersion, payload.keyEnvelope.model_dump())
    audit_security(user.user_id, x_device_id, AuditEventType.DIARY_SHARE_CREATED, recipientUserId=recipient["user_id"], recipientDeviceId=payload.recipientDeviceId)
    return {"status": "ok"}


@app.delete("/api/v1/shares/{grant_id}")
def revoke_share(
    grant_id: str,
    user: Annotated[AuthenticatedUser, Depends(verify_sharing_user)],
    x_device_id: Annotated[str | None, Header(alias="X-Device-ID")] = None,
) -> dict[str, str]:
    if not x_device_id or not device_store.is_active(user.user_id, x_device_id):
        raise HTTPException(status_code=403, detail="Sdílení je dostupné jen z důvěryhodného zařízení.")
    if not share_store.revoke(user.user_id, grant_id):
        raise HTTPException(status_code=404, detail="Aktivní sdílení nebylo nalezeno.")
    share_store.mark_grant_revoked(user.user_id, grant_id)
    audit_security(user.user_id, x_device_id, AuditEventType.DIARY_SHARE_REVOKED, grantId=grant_id)
    return {"status": "ok"}


@app.post("/api/v1/treatment-proposals")
def create_treatment_proposal(
    payload: TreatmentProposalCreateModel,
    user: Annotated[AuthenticatedUser, Depends(verify_sharing_user)],
    x_device_id: Annotated[str | None, Header(alias="X-Device-ID")] = None,
) -> dict[str, str]:
    if not x_device_id or not device_store.is_active(user.user_id, x_device_id):
        raise HTTPException(status_code=403, detail="Návrh lze odeslat jen z důvěryhodného zařízení.")
    if "doctor" not in share_store.get_active_roles(user.user_id, x_device_id):
        raise HTTPException(status_code=403, detail="Změnu léčby může navrhnout pouze lékař.")
    proposal_id = share_store.create_treatment_proposal(
        payload.grantId, user.user_id, payload.baseRevision, payload.payload.model_dump(), payload.previousProposalId,
    )
    if not proposal_id:
        raise HTTPException(status_code=404, detail="Aktivní sdílení nebylo nalezeno.")
    audit_security(user.user_id, x_device_id, AuditEventType.TREATMENT_PROPOSAL_CREATED, proposalId=proposal_id, grantId=payload.grantId)
    proposal = share_store.get_treatment_proposal(proposal_id)
    send_treatment_notification(proposal["owner_user_id"], "Lékař odeslal nový návrh změn léčby.")
    return {"status": "pending", "proposalId": proposal_id}


@app.get("/api/v1/treatment-proposals")
def list_treatment_proposals(
    user: Annotated[AuthenticatedUser, Depends(verify_sharing_user)],
    x_device_id: Annotated[str | None, Header(alias="X-Device-ID")] = None,
) -> dict[str, object]:
    if not x_device_id or not device_store.is_active(user.user_id, x_device_id):
        raise HTTPException(status_code=403, detail="Návrhy jsou dostupné jen z důvěryhodného zařízení.")
    return {"proposals": [dict(row) | {
        "payload": json.loads(row["payload_json"]),
        "responsePayload": json.loads(row["response_payload_json"]) if row["response_payload_json"] else None,
    } for row in share_store.list_treatment_proposals(user.user_id)]}


@app.post("/api/v1/treatment-proposals/{proposal_id}/decision")
def decide_treatment_proposal(
    proposal_id: str,
    payload: TreatmentProposalDecisionModel,
    user: Annotated[AuthenticatedUser, Depends(verify_sharing_user)],
    x_device_id: Annotated[str | None, Header(alias="X-Device-ID")] = None,
) -> dict[str, str]:
    if not x_device_id or not device_store.is_active(user.user_id, x_device_id):
        raise HTTPException(status_code=403, detail="Návrh lze schválit jen z důvěryhodného zařízení.")
    if "patient" not in share_store.get_active_roles(user.user_id, x_device_id):
        raise HTTPException(status_code=403, detail="Návrh může schválit pouze pacient.")
    status = payload.decision
    if status == "returned" and payload.responsePayload is None:
        raise HTTPException(status_code=400, detail="Vrácený návrh musí obsahovat šifrovaný komentář pacienta.")
    if not share_store.decide_treatment_proposal(
        proposal_id, user.user_id, status, payload.responsePayload.model_dump() if payload.responsePayload else None,
    ):
        raise HTTPException(status_code=404, detail="Čekající návrh nebyl nalezen.")
    audit_security(user.user_id, x_device_id, TREATMENT_PROPOSAL_DECISION_EVENTS[status], proposalId=proposal_id)
    proposal = share_store.get_treatment_proposal(proposal_id)
    decision_label = {"approved": "schválil", "declined": "zamítl", "returned": "vrátil k přepracování"}[status]
    send_treatment_notification(proposal["proposer_user_id"], f"Pacient návrh léčby {decision_label}.")
    return {"status": status}


@app.delete("/api/v1/treatment-proposals/{proposal_id}")
def cancel_treatment_proposal(
    proposal_id: str,
    user: Annotated[AuthenticatedUser, Depends(verify_sharing_user)],
    x_device_id: Annotated[str | None, Header(alias="X-Device-ID")] = None,
) -> dict[str, str]:
    if not x_device_id or not device_store.is_active(user.user_id, x_device_id):
        raise HTTPException(status_code=403, detail="Návrh lze stáhnout jen z důvěryhodného zařízení.")
    if "doctor" not in share_store.get_active_roles(user.user_id, x_device_id):
        raise HTTPException(status_code=403, detail="Návrh může stáhnout pouze lékař.")
    if not share_store.cancel_treatment_proposal(proposal_id, user.user_id):
        raise HTTPException(status_code=404, detail="Čekající návrh nebyl nalezen.")
    audit_security(user.user_id, x_device_id, AuditEventType.TREATMENT_PROPOSAL_CANCELLED, proposalId=proposal_id)
    return {"status": "cancelled"}


@app.get("/", include_in_schema=False)
def frontend_root() -> FileResponse:
    return serve_frontend("")


@app.get("/{full_path:path}", include_in_schema=False)
def frontend_fallback(full_path: str) -> FileResponse:
    if full_path.startswith("api/"):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not Found")

    return serve_frontend(full_path)
