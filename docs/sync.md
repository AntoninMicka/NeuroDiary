# Synchronization

## Principles

- Offline first
- Server jako zdroj pro multi-device synchronizaci
- Prvni iterace synchronizuje cely snapshot deniku
- cilovy stav je end-to-end sifrovany sync

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

## End-to-End Encryption Direction

- backend nema byt zdrojem otevrenych zdravotnich dat
- klient bude pred synchronizaci sifrovat payload deniku
- server bude spravovat revize, casy zmen a dalsi metadata bez pristupu k obsahu deniku
- conflict flow musi fungovat i nad sifrovanou reprezentaci nebo po lokalnim desifrovani

## Next Iterations

- key management a recovery flow
- sync po jednotlivych dnech nebo entitach
- lepsi conflict resolution
- audit historie zmen
- autentizace po uzivatelich misto docasneho single-user tokenu
