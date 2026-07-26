# NeuroDiary Sync Backend

Prvni serverovy zaklad pro synchronizaci mezi vice zarizenimi.

## Co umi

- servirovat zabaleny frontend na `/`
- `GET /healthz`
- `GET /readyz` s kontrolou databaze
- `GET /api/v1/meta` s verzi a capabilities
- `GET /api/v1/sync/pull`
- `POST /api/v1/sync/push`
- `DELETE /api/v1/sync/reset`
- revize snapshotu a detekci konfliktu pri zapisu
- SQLite pro vyvoj a PostgreSQL pro produkci
- ukladani sifrovaneho payloadu a wrapped key metadata
- federovane Google/Apple prihlaseni s legacy token fallbackem
- strukturovane JSON request logy a korelacni `X-Request-ID`
- Web Push subscriptions a anonymni casovy plan pripominek

## Lokalni spusteni

```bash
python -m venv .venv
source .venv/bin/activate
pip install -r backend/requirements.txt
npm install
npm run build
uvicorn backend.app.main:app --reload
```

Testy:

```bash
pip install -r backend/requirements-dev.txt
pytest backend/tests
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
- `NEURODIARY_VERSION`
  Commit nebo verze zobrazena v health a metadata endpointech.
- `NEURODIARY_LOG_LEVEL`
  Uroven aplikacnich JSON logu, vychozi `INFO`.
- `NEURODIARY_VAPID_PUBLIC_KEY`, `NEURODIARY_VAPID_PRIVATE_KEY`, `NEURODIARY_VAPID_SUBJECT`
  Vsechny tri hodnoty zapinaji Web Push. Private key patri do secret manageru.
- `NEURODIARY_PUSH_SCHEDULER_TOKEN`
  Nahodny secret pro interni dispatch endpoint volany Cloud Schedulerem.
- `NEURODIARY_PUSH_ENDPOINT_HOSTS`
  Povolene suffixy push provideru; omezuje zneuziti endpointu pro SSRF.

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

Provozni endpointy, alerty, zalohy a incident postup jsou v
[docs/operations.md](/home/antonin/Projects/NeuroDiary/NeuroDiary/docs/operations.md:1).

## Poznamka

Aktualni implementace uklada cely diary snapshot jako jeden sifrovany blob. Je to nejjednodussi
bezpecny zaklad pro prvni synchronizaci. Dalsi iterace muze prejit na jemnejsi sync po entitach
nebo dnech.
