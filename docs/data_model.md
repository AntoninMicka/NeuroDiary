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
