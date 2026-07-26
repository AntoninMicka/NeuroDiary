import importlib

from fastapi.testclient import TestClient


def load_app(monkeypatch, tmp_path):
    monkeypatch.setenv("NEURODIARY_DATABASE_URL", "")
    monkeypatch.setenv("NEURODIARY_DATABASE_PATH", str(tmp_path / "sync.db"))
    monkeypatch.setenv("NEURODIARY_VERSION", "test-version")

    import backend.app.main as main

    return importlib.reload(main).app


def test_health_readiness_and_metadata(monkeypatch, tmp_path):
    app = load_app(monkeypatch, tmp_path)

    with TestClient(app) as client:
        health = client.get("/healthz")
        readiness = client.get("/readyz")
        metadata = client.get("/api/v1/meta")

    assert health.status_code == 200
    assert health.json()["status"] == "ok"
    assert health.json()["version"] == "test-version"
    assert readiness.status_code == 200
    assert readiness.json()["status"] == "ready"
    assert metadata.status_code == 200
    assert metadata.json()["capabilities"]["encryptedSnapshotSync"] is True
    assert health.headers["x-request-id"]


def test_request_id_is_preserved(monkeypatch, tmp_path):
    app = load_app(monkeypatch, tmp_path)

    with TestClient(app) as client:
        response = client.get("/healthz", headers={"x-request-id": "diagnostic-request"})

    assert response.headers["x-request-id"] == "diagnostic-request"


def test_push_is_disabled_without_vapid_configuration(monkeypatch, tmp_path):
    monkeypatch.delenv("NEURODIARY_VAPID_PUBLIC_KEY", raising=False)
    monkeypatch.delenv("NEURODIARY_VAPID_PRIVATE_KEY", raising=False)
    monkeypatch.delenv("NEURODIARY_VAPID_SUBJECT", raising=False)
    app = load_app(monkeypatch, tmp_path)

    with TestClient(app) as client:
        config = client.get("/api/v1/push/config")
        dispatch = client.post("/api/v1/internal/push/dispatch")

    assert config.status_code == 200
    assert config.json() == {"enabled": False, "publicKey": ""}
    assert dispatch.status_code == 401
