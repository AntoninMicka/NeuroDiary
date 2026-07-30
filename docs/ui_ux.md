# UI / UX

## Hlavni navigace

Plovouci hlavicka obsahuje prepinani panelu, stav online/offline, priznak lokalnich zmen a rychlou
synchronizaci. Hodinova matice je zachovana jako doplnkovy pohled v nabidce `Vice` a neni soucasti
hlavni navigace.

## Rychly zapis

Rychly zapis stavu vzdy pouzije systemovy cas v okamziku kliknuti. Zobrazuje pouze nezapsane
planovane davky v intervalu od 10 minut pred planem do 60 minut po nem, vcetne odpoctu nebo
zpozdeni. Zapis davky vytvori vazbu `planItemId` a oddelene uchova skutecny cas uziti a cas
vytvoreni zaznamu.

Petiminutovy casovy karusel umoznuje zapsat stav nejvyse 10 hodin zpet; stav se vztahuje na celou
zvolenou hodinu. Tlacitko `Ted` vraci vyber k soucasnosti. Dosud nezapsanou davku lze v karuselu
doplnit se zvolenym casem uziti pouze do 60 minut od planu. Vynechana davka po teto lhute zustane
viditelna, ale uz ji nelze zapsat.

## Lecba

Planovane a skutecne davky se parují primo nebo u starsich dat podle nazvu, davky a nejblizsiho
casu. UI rozlisuje vcas, drive, pozdeji, cekajici a vynechanou davku. Tolerance vcas je 30 minut.

## Trendy a kvalita

Trendy zobrazuji 30–365 dni po sedmidennich blocich. Vzdy ukazuji pokryti dat a upozorni na nizky
pocet zaznamenanych dni nebo hodin. Statistiky jsou orientacni.

Denni kvalita ma ctyri urovne:

- `Bez dat`: zadne hodinove, souhrnne, poznamkove ani medikacni udaje,
- `Neuplny den`: existuji jen dilci data,
- `Dostatecna data`: alespon 60 % ocekavanych hodin a alespon jedna souhrnna hodnota,
- `Kompletni den`: alespon 90 % ocekavanych hodin, kvalita spanku i celkove hodnoceni.

U dnesniho dne se pocitaji pouze hodiny, ktere uz nastaly. Souhrn nabizi prime prepnuti do
hodinove matice nebo denniho prehledu. Trendy uvadeji podil dostatecnych a kompletnich dni;
zcela prazdny den se nepovazuje za vynechani vsech planovanych leku.

## Pristupnost a mobil

Formulare pouzivaji nativni vstupy, `aria-invalid` a textove chybove zpravy. Rozlozeni adherence,
trendu a pripominek se pod 860 px sklada do jednoho nebo dvou sloupcu.
