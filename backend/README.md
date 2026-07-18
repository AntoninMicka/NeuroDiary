# NeuroDiary Sync Backend

Prvni serverovy zaklad pro synchronizaci mezi vice zarizenimi.

## Co umi

- servirovat zabaleny frontend na `/`
- `GET /healthz`
- `GET /api/v1/sync/pull`
- `POST /api/v1/sync/push`
- revize snapshotu a detekci konfliktu pri zapisu
- SQLite uloziste na serveru
- ukladani sifrovaneho payloadu a wrapped key metadata

## Lokalni spusteni

```bash
python -m venv .venv
source .venv/bin/activate
pip install -r backend/requirements.txt
npm install
npm run build
uvicorn backend.app.main:app --reload
```

## Konfigurace

- `NEURODIARY_API_TOKEN`
  Pokud je vyplneny, API vyzaduje `Authorization: Bearer <token>`.
- `NEURODIARY_DATABASE_URL`
  Preferovana produkcni cesta. Aktalne podporuje `postgresql://...` nebo `postgres://...`.
  Pokud je nastavena, ma prednost pred lokalnim SQLite souborem.
- `NEURODIARY_DATABASE_PATH`
  Cesta k serverove SQLite databazi pro lokalni vyvoj a fallback.
- `NEURODIARY_CORS_ORIGINS`
  Seznam frontend originu oddelenych carkou.
- `NEURODIARY_FRONTEND_DIST`
  Cesta k zabalenemu frontend `dist/` adresari. V Docker image je nastavena automaticky.

## Docker

```bash
docker build -f backend/Dockerfile -t neurodiary-sync .
docker run -p 8080:8080 \
  -e NEURODIARY_API_TOKEN=change-me \
  -e NEURODIARY_CORS_ORIGINS=http://localhost:5173 \
  -v $(pwd)/backend-data:/data \
  neurodiary-sync
```

## Produkcni smer

Backend uz umi bezet nad `PostgreSQL` pres `NEURODIARY_DATABASE_URL`, takze je pripraveny
pro centralni databazi vhodnou pro `Cloud Run`, a zaroven ze stejne sluzby servirovat i Vue frontend.

Lokalni SQLite varianta zustava zachovana hlavne pro lokalni vyvoj a rychle testovani.

## Poznamka

Aktualni implementace uklada cely diary snapshot jako jeden sifrovany blob. Je to nejjednodussi
bezpecny zaklad pro prvni synchronizaci. Dalsi iterace muze prejit na jemnejsi sync po entitach
nebo dnech.
