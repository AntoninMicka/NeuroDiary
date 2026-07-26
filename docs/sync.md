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
5. Klient desifruje oba snapshoty a slouci denni zaznamy, hodinove udalosti a davky
6. Smazane dny a davky se prenaseji jako tombstones, aby je starsi zarizeni neobnovilo

## Why Snapshot Sync First

- jednodussi implementace
- snazsi audit a debug
- mensi riziko nekonzistence pri prvnim nasazeni

## End-to-End Encryption Direction

- backend nema byt zdrojem otevrenych zdravotnich dat
- klient bude pred synchronizaci sifrovat payload deniku
- server bude spravovat revize, casy zmen a dalsi metadata bez pristupu k obsahu deniku
- conflict flow musi fungovat i nad sifrovanou reprezentaci nebo po lokalnim desifrovani
- wrapped account key metadata mohou byt ulozena na serveru, ale ne v otevrene podobe account master key

## First E2E Key Model

- `Account Master Key`:
  hlavni symetricky klic pro sifrovani diary snapshotu
- `Recovery Secret`:
  tajemstvi drzené uzivatelem mimo backend
- `Wrapped Account Key`:
  account master key zabaleny recovery-derived klicem a ulozeny na serveru

Prakticky dopad:

1. login pres Google / Apple overi identitu
2. recovery secret umozni desifrovani dat na novem zarizeni
3. backend sam o sobe data otevrit nedokaze

## Next Iterations

- sync po jednotlivych dnech nebo entitach
- audit historie zmen
- retry s exponencialnim backoffem
- jemnejsi conflict audit zmen lecebneho planu

## Aktualni klientsky tok

- pri startu: `pull -> merge -> push`, pokud je ucet, endpoint a sifrovaci klic dostupny
- rucne: tlacitko Synchronizovat spousti stejny tok
- po zmene: persistentni dirty flag a kontrola automatickeho push jednou za minutu
- uspesny push maze dirty flag jen pokud behem requestu nevznikla dalsi lokalni zmena
- chyba pull zastavi navazujici push
- payload je sifrovan pomoci account master key; recovery secret slouzi k obnoveni na novem zarizeni
