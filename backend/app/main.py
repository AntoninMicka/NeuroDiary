from __future__ import annotations

import json
import hmac
import logging
import os
import time
import uuid
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Annotated

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
)
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
    user_id: Annotated[str, Depends(verify_bearer_token)],
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
    user_id: Annotated[str, Depends(verify_bearer_token)],
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


@app.get("/api/v1/sync/pull", response_model=SyncPullResponseModel)
def pull_state(user_id: Annotated[str, Depends(verify_bearer_token)]) -> SyncPullResponseModel:
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
    user_id: Annotated[str, Depends(verify_bearer_token)],
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
def reset_state(user_id: Annotated[str, Depends(verify_bearer_token)]) -> SyncResetResponseModel:
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
