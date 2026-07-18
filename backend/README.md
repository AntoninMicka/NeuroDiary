# NeuroDiary Sync Backend

Prvni serverovy zaklad pro synchronizaci mezi vice zarizenimi.

## Co umi

- `GET /healthz`
- `GET /api/v1/sync/pull`
- `POST /api/v1/sync/push`
- revize snapshotu a detekci konfliktu pri zapisu
- SQLite uloziste na serveru

## Lokalni spusteni

```bash
python -m venv .venv
source .venv/bin/activate
pip install -r backend/requirements.txt
uvicorn backend.app.main:app --reload
```

## Konfigurace

- `NEURODIARY_API_TOKEN`
  Pokud je vyplneny, API vyzaduje `Authorization: Bearer <token>`.
- `NEURODIARY_DATABASE_PATH`
  Cesta k serverove SQLite databazi.
- `NEURODIARY_CORS_ORIGINS`
  Seznam frontend originu oddelenych carkou.
- `NEURODIARY_DEFAULT_USER_ID`
  Docasny identifikator pro single-user rezim.

## Docker

```bash
docker build -f backend/Dockerfile -t neurodiary-sync .
docker run -p 8080:8080 \
  -e NEURODIARY_API_TOKEN=change-me \
  -e NEURODIARY_CORS_ORIGINS=http://localhost:5173 \
  -v $(pwd)/backend-data:/data \
  neurodiary-sync
```

## Poznamka

Aktualni implementace uklada cely stav deniku jako jeden snapshot. Je to nejjednodussi bezpecny
zaklad pro prvni synchronizaci. Dalsi iterace muze prejit na jemnejsi sync po entitach nebo dnech.
