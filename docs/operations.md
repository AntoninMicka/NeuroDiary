# NeuroDiary Operations

## Provozni endpointy

- `GET /healthz` je lehka liveness kontrola procesu. Neprovadi databazovy dotaz.
- `GET /readyz` overuje dostupnost databaze pomoci `SELECT 1`.
- `GET /api/v1/meta` vraci verzi nasazeni a verejne capability API.

Vsechny endpointy jsou verejne a nesmi vracet secrets, identitu uzivatele ani obsah deniku.

## Logy

Backend zapisuje na standardni vystup JSON zaznam pro kazdy HTTP request:

- `requestId`
- HTTP metoda a cesta bez query stringu
- status
- doba zpracovani
- verze nasazeni

Sync payload, authorization header, e-mail ani user ID se neloguji. Klient muze poslat vlastni
`X-Request-ID`; stejne ID backend vrati v response headeru.

## Doporucena upozorneni v Cloud Monitoring

Po prvnim produkcnim deployi nastav:

1. uptime check na `/healthz`,
2. uptime check na `/readyz`,
3. alert na podil HTTP 5xx,
4. alert na rostouci latenci,
5. alert na neuspesne Cloud Run revision deploymenty,
6. budget alert pro cely GCP projekt.

Prvni prijemce upozorneni ma byt konkretni provozni e-mail, ne osobni zdravotni kontakt pacienta.

## Zalohy

Pro produkcni Cloud SQL zapni automaticke zalohy a point-in-time recovery. Pred migraci databaze
vytvor rucni on-demand backup. Obnovu pravidelne over na oddelene testovaci instanci; existence
zalohy sama o sobe nestaci.

SQLite backend je pouze vyvojovy fallback. Souborova SQLite databaze uvnitr Cloud Run instance
neni produkcni zaloha a muze zmizet s instanci.

## Incident: synchronizace nefunguje

1. Over `/healthz`. Pokud selze, zkontroluj posledni Cloud Run revision a container logy.
2. Over `/readyz`. Pokud selze jen tento endpoint, zkontroluj Cloud SQL, connection string a
   pripojeni Cloud SQL instance ke Cloud Run revision.
3. V logu vyhledej `requestId` z klienta a HTTP status; nezkousej logovat sifrovany payload.
4. Pri regresi presmeruj traffic na posledni funkcni revision.
5. Pred zasahem do dat vytvor Cloud SQL backup.
6. Po oprave otestuj pull, lokalni merge a push na testovacim uctu.

## Overeni nove verze

Deploy workflow automaticky vola `/healthz`, `/readyz` a `/api/v1/meta`. Nasazeni je povazovano
za uspesne az po projiti techto smoke testu. Synchronizaci dvou zarizeni je nadale potreba overit
manualne, protoze vyzaduje realny ucet a recovery secret.
