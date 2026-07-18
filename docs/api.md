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
  "state": {
    "selectedDate": "2026-07-18",
    "patientName": "Jan Novak",
    "birthYear": "1958",
    "entries": {}
  }
}
```

Pokud server jeste nema zadna data:

```json
{
  "revision": 0,
  "updatedAt": null,
  "state": null
}
```

## Push

`POST /api/v1/sync/push`

```json
{
  "baseRevision": 3,
  "force": false,
  "state": {
    "selectedDate": "2026-07-18",
    "patientName": "Jan Novak",
    "birthYear": "1958",
    "entries": {}
  }
}
```

Uspesna odpoved:

```json
{
  "status": "ok",
  "revision": 4,
  "updatedAt": "2026-07-18T10:25:00.000000+00:00",
  "state": {
    "selectedDate": "2026-07-18",
    "patientName": "Jan Novak",
    "birthYear": "1958",
    "entries": {}
  }
}
```

Konflikt:

```json
{
  "status": "conflict",
  "revision": 4,
  "updatedAt": "2026-07-18T10:25:00.000000+00:00",
  "state": {
    "selectedDate": "2026-07-18",
    "patientName": "Jan Novak",
    "birthYear": "1958",
    "entries": {}
  }
}
```

## Versioning

- API prefix: `/api/v1`
- revize jsou monotonicky rostouci snapshot counter
