# UI / UX

## Hlavni navigace

Plovouci hlavicka obsahuje prepinani panelu, stav online/offline, priznak lokalnich zmen a rychlou
synchronizaci. Hodinova hlavicka casove osy je sticky a pouziva stejny grid jako datove bunky.

## Rychly zapis

Rychly zapis stavu vzdy pouzije systemovy cas v okamziku kliknuti. Rucni opravy patri do hodinove
matice. Zapis davky z lecebneho planu vytvori vazbu `planItemId`.

## Lecba

Planovane a skutecne davky se parují primo nebo u starsich dat podle nazvu, davky a nejblizsiho
casu. UI rozlisuje vcas, drive, pozdeji, cekajici a vynechanou davku. Tolerance vcas je 30 minut.

## Trendy a kvalita

Trendy zobrazuji 30–365 dni po sedmidennich blocich. Vzdy ukazuji pokryti dat a upozorni na nizky
pocet zaznamenanych dni nebo hodin. Statistiky jsou orientacni.

## Pristupnost a mobil

Formulare pouzivaji nativni vstupy, `aria-invalid` a textove chybove zpravy. Rozlozeni adherence,
trendu a pripominek se pod 860 px sklada do jednoho nebo dvou sloupcu.
