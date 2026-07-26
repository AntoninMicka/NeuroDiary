# Wearing-off analysis

## Ucel

Analyza hleda opakovane casove souvislosti mezi planovanou a skutecne uzitou
medikaci a hodinovymi stavy `ON`, `MID`, `OFF` a `dyskinesia`. Vystup je pouze
orientacni podklad pro rozhovor s neurologem.

## Pravidla prvni verze

- pouzivaji se jen dny klasifikovane jako dostatecne nebo kompletni,
- pred planovanou davkou se vyhodnocuje dvouhodinove okno,
- zhorseni znamena stav `MID` nebo `OFF`,
- kandidat na wearing-off navic vyzaduje `ON` nebo dyskinezi v predchozich
  ctyrech hodinach,
- po skutecne uzite davce se v trihodinovem okne hleda prvni `ON` nebo
  dyskineze,
- opakujici se denni doba vyzaduje nejmene tri pozorovani a zhorseni alespon
  v polovine z nich,
- pro stabilnejsi souhrn UI vyzaduje nejmene sedm spolehlivych dni a pet
  vyhodnotitelnych davek.

Hodinove zaznamy neumoznuji presne merit nastup ucinku v minutach. Vypocteny
cas je proto hruby odhad s presnosti priblizne jedne hodiny.

## Bezpecnost interpretace

Wearing-off se bezne popisuje jako navrat nebo zhorseni priznaku pred dalsi
davkou. Samotna casova souvislost v deniku ale nestaci k diagnoze: vysledek
mohou ovlivnit chybejici zaznamy, jidlo, traveni, stres, spanek, infekce a dalsi
okolnosti. Aplikace proto nepodava navrh na upravu davky nebo casu medikace.

Pri motorickych fluktuacich vcetne wearing-off ma zmenu lecby posoudit
odbornik na Parkinsonovu nemoc:

- NICE NG71, recommendation 1.3.9:
  https://www.nice.org.uk/guidance/ng71/chapter/Recommendations
- Movement Disorder Society review of wearing-off scales and motor fluctuation diaries:
  https://www.movementdisorders.org/MDS-Files1/PDFs/Task-Force-Papers/WearingOffScale.pdf
