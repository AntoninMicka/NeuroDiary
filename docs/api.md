# REST API

## Base

- `GET /healthz`
- `GET /readyz`
- `GET /api/v1/meta`
- `GET /api/v1/sync/pull`
- `POST /api/v1/sync/push`
- `DELETE /api/v1/sync/reset`

## Provozni endpointy

- `/healthz` kontroluje proces a vraci storage, auth rezim a verzi.
- `/readyz` provadi databazovy dotaz a pri nedostupne DB vraci HTTP 503.
- `/api/v1/meta` vraci verzi a verejne capabilities bez secrets.
- Kazda HTTP odpoved obsahuje `X-Request-ID`; klient muze vlastni ID poslat ve stejnem headeru.

## Authentication

- Preferovany rezim pouziva Google/Apple identity exchange a kratkodobou NeuroDiary session.
- Jako docasny fallback je podporovan bearer token:
  `Authorization: Bearer <NEURODIARY_API_TOKEN>`
- Pokud je zapnuta federovana autentizace, sync endpointy vyzaduji platnou session.

## Pull

`GET /api/v1/sync/pull`

Odpoved:

```json
{
  "revision": 3,
  "updatedAt": "2026-07-18T10:11:12.000000+00:00",
  "payload": {
    "schemaVersion": 1,
    "algorithm": "AES-GCM-256",
    "keyVersion": 1,
    "iv": "<base64>",
    "cipherText": "<base64>"
  },
  "wrappedKey": {
    "wrappedKey": "<base64>",
    "wrappingAlgorithm": "PBKDF2-AES-GCM-256",
    "wrappingSalt": "<base64>",
    "wrappingIv": "<base64>",
    "wrappingIterations": 250000,
    "keyVersion": 1
  }
}
```

Pokud server jeste nema zadna data:

```json
{
  "revision": 0,
  "updatedAt": null,
  "payload": null,
  "wrappedKey": null
}
```

## Push

`POST /api/v1/sync/push`

```json
{
  "baseRevision": 3,
  "force": false,
  "payload": {
    "schemaVersion": 1,
    "algorithm": "AES-GCM-256",
    "keyVersion": 1,
    "iv": "<base64>",
    "cipherText": "<base64>"
  },
  "wrappedKey": {
    "wrappedKey": "<base64>",
    "wrappingAlgorithm": "PBKDF2-AES-GCM-256",
    "wrappingSalt": "<base64>",
    "wrappingIv": "<base64>",
    "wrappingIterations": 250000,
    "keyVersion": 1
  }
}
```

Uspesna odpoved:

```json
{
  "status": "ok",
  "revision": 4,
  "updatedAt": "2026-07-18T10:25:00.000000+00:00",
  "payload": {
    "schemaVersion": 1,
    "algorithm": "AES-GCM-256",
    "keyVersion": 1,
    "iv": "<base64>",
    "cipherText": "<base64>"
  },
  "wrappedKey": {
    "wrappedKey": "<base64>",
    "wrappingAlgorithm": "PBKDF2-AES-GCM-256",
    "wrappingSalt": "<base64>",
    "wrappingIv": "<base64>",
    "wrappingIterations": 250000,
    "keyVersion": 1
  }
}
```

Konflikt:

```json
{
  "status": "conflict",
  "revision": 4,
  "updatedAt": "2026-07-18T10:25:00.000000+00:00",
  "payload": {
    "schemaVersion": 1,
    "algorithm": "AES-GCM-256",
    "keyVersion": 1,
    "iv": "<base64>",
    "cipherText": "<base64>"
  },
  "wrappedKey": {
    "wrappedKey": "<base64>",
    "wrappingAlgorithm": "PBKDF2-AES-GCM-256",
    "wrappingSalt": "<base64>",
    "wrappingIv": "<base64>",
    "wrappingIterations": 250000,
    "keyVersion": 1
  }
}
```

## Versioning

- API prefix: `/api/v1`
- revize jsou monotonicky rostouci snapshot counter
- server uklada sifrovany payload a metadata, nikoliv otevreny diary state
- build commit je dostupny pres `/healthz`, `/readyz` a `/api/v1/meta`
