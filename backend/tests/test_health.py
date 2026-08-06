import asyncio
import importlib

import pytest
from fastapi import HTTPException
from fastapi.responses import JSONResponse
from starlette.requests import Request


def load_app(monkeypatch, tmp_path):
    monkeypatch.setenv("NEURODIARY_DATABASE_URL", "")
    monkeypatch.setenv("NEURODIARY_DATABASE_PATH", str(tmp_path / "sync.db"))
    monkeypatch.setenv("NEURODIARY_VERSION", "test-version")

    import backend.app.main as main

    main = importlib.reload(main)
    main.on_startup()
    return main


def test_health_readiness_and_metadata(monkeypatch, tmp_path):
    main = load_app(monkeypatch, tmp_path)

    health = main.healthcheck()
    readiness = main.readiness_check()
    metadata = main.api_metadata()

    assert health["status"] == "ok"
    assert health["version"] == "test-version"
    assert readiness["status"] == "ready"
    assert metadata["capabilities"]["encryptedSnapshotSync"] is True


def test_request_id_is_preserved(monkeypatch, tmp_path):
    main = load_app(monkeypatch, tmp_path)
    request = Request({
        "type": "http",
        "method": "GET",
        "path": "/healthz",
        "headers": [(b"x-request-id", b"diagnostic-request")],
    })

    async def call_next(_request):
        return JSONResponse({"status": "ok"})

    response = asyncio.run(main.request_logging_middleware(request, call_next))

    assert response.headers["x-request-id"] == "diagnostic-request"


def test_push_is_disabled_without_vapid_configuration(monkeypatch, tmp_path):
    monkeypatch.delenv("NEURODIARY_VAPID_PUBLIC_KEY", raising=False)
    monkeypatch.delenv("NEURODIARY_VAPID_PRIVATE_KEY", raising=False)
    monkeypatch.delenv("NEURODIARY_VAPID_SUBJECT", raising=False)
    main = load_app(monkeypatch, tmp_path)

    config = main.push_config()
    with pytest.raises(HTTPException) as error:
        main.dispatch_push()

    assert config.model_dump() == {"enabled": False, "publicKey": ""}
    assert error.value.status_code == 401
