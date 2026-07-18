# Synchronization

## Principles

- Offline first
- Server jako zdroj pro multi-device synchronizaci
- Prvni iterace synchronizuje cely snapshot deniku

## First Sync Strategy

1. Klient nacte server pres `GET /api/v1/sync/pull`
2. Ulozi si posledni `revision`
3. Po lokalnich zmenach odesle `POST /api/v1/sync/push`
4. Pokud `baseRevision` nesedi se serverem, backend vrati `status: "conflict"`
5. Konflikt se v dalsi iteraci vyresi pres porovnani lokalniho a serveroveho snapshotu

## Why Snapshot Sync First

- jednodussi implementace
- snazsi audit a debug
- mensi riziko nekonzistence pri prvnim nasazeni

## Next Iterations

- sync po jednotlivych dnech nebo entitach
- lepsi conflict resolution
- audit historie zmen
- autentizace po uzivatelich misto docasneho single-user tokenu
