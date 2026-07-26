# NeuroDiary Operations

## Provozni endpointy

- `GET /healthz` je lehka liveness kontrola procesu. Neprovadi databazovy dotaz.
- `GET /readyz` overuje dostupnost databaze pomoci `SELECT 1`.
- `GET /api/v1/meta` vraci verzi nasazeni a verejne capability API.

Tyto tri provozni endpointy jsou verejne a nesmi vracet secrets, identitu uzivatele ani obsah deniku.

## Web Push scheduler

Po nastaveni VAPID klicu vytvor Cloud Scheduler HTTP job, ktery jednou za minutu vola
`POST /api/v1/internal/push/dispatch` a posila `X-Scheduler-Token`. Token uchovavej v
Secret Manageru a pravidelne jej rotuj. Endpoint neposila na push infrastrukturu zdravotni
obsah, pouze obecnou zpravu o naplanovane pripomince.

VAPID par vygeneruj jednou a dlouhodobe jej zachovej, napriklad oficialnim CLI:

```bash
npx web-push generate-vapid-keys --json
openssl rand -base64 48
```

Prvni prikaz vrati public/private VAPID klic, druhy lze pouzit pro scheduler token.

Pro produkci sleduj pocet `push_delivery_failed`. HTTP 404/410 od push provideru znamena
zaniklou subscription a backend ji automaticky odstrani. VAPID private key pri bezne
aktualizaci aplikace nemen; zmena zneplatni stavajici subscriptions.

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

Smoke test standardne pouziva URL vracenou Cloud Run deploy akci. Pokud je vychozi `run.app`
URL vypnuta, omezena ingress pravidly nebo aplikace pouziva vlastni domenu, nastav repository
variable `CLOUD_RUN_PUBLIC_URL` na verejnou zakladni URL aplikace bez cesty. Workflow ji pro
overeni uprednostni pred URL vracenou deploy akci.

Workflow nastavuje `--ingress=all` a `--default-url`, protoze verejny Cloud Run endpoint je
soucasti architektury aplikace a pristup k uzivatelskym datum dale chrani autentizace API.
Tyto dva flagy jsou aplikovany az po `CLOUD_RUN_DEPLOY_FLAGS`, aby je volitelna konfigurace
nemohla omylem prepsat. Workflow pred smoke testem vypise efektivni ingress, stav vychozi URL
a rozdeleni trafficu.

Po deployi workflow explicitne nastavi `allUsers` roli `roles/run.invoker` a overi efektivni
IAM policy. Jde o verejnou dostupnost HTTP sluzby; sifrovana uzivatelska data a zapisove API
zustavaji chranene aplikacni autentizaci.
