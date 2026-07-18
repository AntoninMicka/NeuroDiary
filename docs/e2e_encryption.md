# End-to-End Encryption

## Goal

NeuroDiary cloud sync ma umoznit synchronizaci mezi vice zarizenimi bez toho, aby backend dokazal
cist obsah zdravotnich dat v otevrene podobe.

## Security Model

- Google ID a Sign in with Apple slouzi pro identitu a pristup k API
- samotna zdravotni data jsou sifrovana na klientovi
- backend vidi jen:
  - encrypted payload
  - revision
  - timestamps
  - nejnutnejsi synchronizacni metadata
- backend nesmi znat klic pro desifrovani deniku

## First Key Strategy

### 1. Account Master Key

- pri prvnim zapnuti cloud syncu klient vygeneruje nahodny `Account Master Key` o 256 bitech
- tento klic sifruje cely diary snapshot
- je to hlavni E2E klic pro obsah deniku

### 2. Recovery Secret

- zaroven se vygeneruje `Recovery Secret`
- uzivatel ho musi ulozit mimo aplikaci
- z recovery secretu se odvozi `Key Encryption Key`
- timto klicem se zabali `Account Master Key` pro pozdejsi obnovu na novem zarizeni

### 3. Identity vs Encryption

- Google / Apple ucet potvrzuje, kdo je uzivatel
- recovery secret rozhoduje, kdo umi precist data
- samotny identity provider nesmi stacit k otevreni obsahu deniku

## Payload Format

Prvni navrh synchronizovaneho sifrovaneho payloadu:

```json
{
  "schemaVersion": 1,
  "algorithm": "AES-GCM-256",
  "keyVersion": 1,
  "iv": "<base64>",
  "cipherText": "<base64>"
}
```

Metadata mimo sifrovany payload:

```json
{
  "revision": 8,
  "updatedAt": "2026-07-18T12:00:00.000000+00:00"
}
```

## Wrapped Key Metadata

Server muze drzet i metadata potrebna pro obnovu hlavniho klice, ale ne samotny otevreny klic:

```json
{
  "wrappedKey": "<base64>",
  "wrappingAlgorithm": "PBKDF2-AES-GCM-256",
  "wrappingSalt": "<base64>",
  "wrappingIterations": 250000,
  "keyVersion": 1
}
```

## New Device Flow

1. Uzivatel se prihlasi pres Google nebo Apple
2. Zarizeni stahne wrapped master key a encrypted snapshot
3. Uzivatel zada recovery secret
4. Klient lokalne odvodi wrapping key
5. Klient rozbali account master key
6. Klient desifruje diary payload

## Recovery Notes

- bez recovery secretu nema backend ani provider umet data precist
- to je zamer E2E modelu
- pozdeji lze pridat:
  - druhy recovery faktor
  - sdileni klice mezi duveryhodnymi zarizenimi
  - rotaci klicu

## Practical First Iteration

Pro prvni implementaci je rozumne:

- sifrovat cely snapshot deniku
- nesnazit se zatim o sifrovani po dnech nebo polich
- zacit s jednim account master key na uzivatele
- resit konflikty nad sifrovanou snapshot vrstvou

## Later Evolution

- jemnejsi sync po dnech nebo entitach
- key rotation
- audit encrypted snapshots
- device management
- selective share s lekarem
