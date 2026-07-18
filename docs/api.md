# REST API

## Base

- `GET /healthz`
- `GET /api/v1/sync/pull`
- `POST /api/v1/sync/push`

## Authentication

- Pro prvni serverovy zaklad je podporovan bearer token:
  `Authorization: Bearer <NEURODIARY_API_TOKEN>`
- Pokud token neni nastaveny, backend bezi v docasnem single-user rezimu.

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
