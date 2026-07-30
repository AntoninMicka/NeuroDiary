# Data Model

## Treatment plan versions

Polozka `treatmentPlan` predstavuje jednu casove platnou verzi planovane davky:

- `id`: stabilni identifikator verze,
- `name`, `dose`, `time`: predepsana davka a jeji cas,
- `validFrom`: prvni den platnosti ve formatu `YYYY-MM-DD`,
- `validTo`: posledni den platnosti vcetne; prazdna hodnota znamena bez konce.

Starsi zaznamy bez `validFrom` a `validTo` zustavaji kompatibilni a povazuji se za
casove neomezene. Zmena davky se uklada jako nova polozka s novym `id`; puvodni
verze se ukonci nastavenim `validTo`. Historicka adherence proto vzdy vybira
plan platny pro datum konkretniho denniho zaznamu.

SQLite schema v6 pridava sloupce `valid_from` a `valid_to` do tabulky
`treatment_plan`.

## Skutecne uzite davky

Zaznam v `medications` zachovava zpetnou kompatibilitu pres pole `time`, ktere obsahuje lokalni
cas uziti ve formatu `HH:MM`. Nove zaznamy mohou obsahovat take:

- `planItemId`: vazba na konkretni verzi planovane davky,
- `takenAt`: skutecny cas uziti jako ISO datum a cas,
- `recordedAt`: automaticky cas vytvoreni zaznamu jako ISO datum a cas,
- `source`: misto vzniku zaznamu, napriklad `quick-capture` nebo `timeline`.

Zpozdeni a adherence se pocitaji podle skutecneho casu uziti, nikoli podle `recordedAt`.
SQLite schema v7 pridava do tabulky `medications` sloupce `taken_at`, `recorded_at` a `source`.
Starsi zaznamy maji tyto hodnoty prazdne a nadale pouzivaji `time`.
