from __future__ import annotations

import os
from typing import Annotated

from fastapi import Depends, FastAPI, Header, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware

from .models import SyncPullResponseModel, SyncPushRequestModel, SyncPushResponseModel
from .store import RevisionConflictError, SyncStore


APP_NAME = "NeuroDiary Sync API"
DEFAULT_USER_ID = os.getenv("NEURODIARY_DEFAULT_USER_ID", "default")
API_TOKEN = os.getenv("NEURODIARY_API_TOKEN", "")
DATABASE_PATH = os.getenv("NEURODIARY_DATABASE_PATH", "backend/data/neurodiary-sync.db")
CORS_ORIGINS = [
    origin.strip()
    for origin in os.getenv("NEURODIARY_CORS_ORIGINS", "http://localhost:5173").split(",")
    if origin.strip()
]

store = SyncStore(DATABASE_PATH)
app = FastAPI(title=APP_NAME, version="0.1.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
def on_startup() -> None:
    store.initialize()


def verify_bearer_token(
    authorization: Annotated[str | None, Header()] = None,
) -> str:
    if not API_TOKEN:
        return DEFAULT_USER_ID

    expected_value = f"Bearer {API_TOKEN}"
    if authorization != expected_value:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing or invalid bearer token.",
        )

    return DEFAULT_USER_ID


@app.get("/healthz")
def healthcheck() -> dict[str, str]:
    return {"status": "ok"}


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
