# Roadmap

Aktuální směr projektu:

1. Offline PWA a lokální deník jsou funkční základ.
2. Backend scaffold pro synchronizaci už existuje v `backend/`.
3. První cloud target je `Google Cloud Run`.
4. Přihlášení má jít směrem `Google ID` a `Sign in with Apple`.
5. Synchronizace má počítat s `end-to-end šifrováním`.
6. Deploy backendu má jít přes `GitHub Actions -> Artifact Registry -> Cloud Run`.
7. Sync backend má být provozovaný nad perzistentní cloudovou DB, primárně `Cloud SQL for PostgreSQL`.

Detailní roadmapa je v `development_roadmap_todolist.md`.

---

## Integrace Wear OS zdravotních dat (Checklist)

Níže je vložený checklist pro integraci Wear OS zdravotních dat do existující PWA aplikace. Slouží jako vodítko pro plánování, implementaci a testování této funkcionality.

# Checklist: Integrace Wear OS zdravotních dat do existující PWA aplikace

## 1. Vymezení funkce a architektura

- [ ] **1.1 Definovat zamýšlenou funkci**
  - [ ] Aplikace vede deník a nabízí návrh k potvrzení.
  - [ ] Návrh není automatickou diagnózou.
  - [ ] Návrh nemění dávkování ani léčbu.

- [ ] **1.2 Posoudit regulatorní hranici aplikace**
  - [ ] Rozlišit prostý záznam dat od algoritmického vyhodnocení zdravotního stavu.
  - [ ] Ověřit dopad MDR před veřejným zdravotnickým nasazením.
  - [ ] V uživatelském rozhraní používat formulaci „návrh k potvrzení“.

- [ ] **1.3 Zvolit topologii přenosu**
  - [ ] Varianta A: Wear OS → HTTPS → backend → PWA.
  - [ ] Varianta B: Wear OS → Android companion → backend → PWA.

- [ ] **1.4 Rozhodnout o balení mobilní aplikace**
  - [ ] Capacitor pro stávající PWA.
  - [ ] Vlastní nativní Capacitor plugin pro Health Connect.
  - [ ] Samostatný nativní modul/aplikace pro Wear OS.

- [ ] **1.5 Definovat podporované platformy**
  - [ ] Minimální verze Wear OS.
  - [ ] Minimální Android API.
  - [ ] Požadavek na telefon.
  - [ ] Podporované modely hodinek.
  - [ ] Režim bez telefonu.

- [ ] **1.6 Navrhnout capability detection**
  - [ ] Zjistit podporované typy dat za běhu.
  - [ ] Nezakládat aplikaci na tom, že každý model poskytne stejné metriky.
  - [ ] Zobrazit uživateli, které funkce jeho hodinky skutečně podporují.

---

## 2. Wear OS – sběr systémových dat

- [ ] **2.1 Vytvořit samostatnou Wear OS aplikaci/modul v Kotlinu**

- [ ] **2.2 Integrovat Health Services**
  - [ ] `PassiveMonitoringClient`.
  - [ ] `PassiveListenerService`.
  - [ ] Načtení capabilities.
  - [ ] Registrace pouze podporovaných datových typů.

- [ ] **2.3 Připravit oprávnění**
  - [ ] Tep.
  - [ ] Aktivita a kroky.
  - [ ] Přístup na pozadí.
  - [ ] Internet.
  - [ ] `BOOT_COMPLETED`.

- [ ] **2.4 Implementovat obrazovku vysvětlení oprávnění**
  - [ ] Co se sbírá.
  - [ ] Proč se to sbírá.
  - [ ] Kam se data odesílají.
  - [ ] Jak sběr vypnout.

- [ ] **2.5 Obnovit registraci po restartu hodinek**
  - [ ] `BOOT_COMPLETED`.
  - [ ] Jednorázový registrační Worker.
  - [ ] Kontrola, zda už registrace existuje.

- [ ] **2.6 Zavést lokální offline databázi**
  - [ ] Room.
  - [ ] Neodeslané dávky.
  - [ ] Stav synchronizace.
  - [ ] Automatické odstranění starých lokálních dat po bezpečném uploadu.

- [ ] **2.7 Zachycovat metadata kvality**
  - [ ] Čas měření.
  - [ ] Čas přijetí.
  - [ ] Typ zdroje.
  - [ ] Model zařízení.
  - [ ] Výpadky dat.
  - [ ] Odhad pokrytí.
  - [ ] Časová zóna a offset.

- [ ] **2.8 Otestovat spotřebu baterie**
  - [ ] Běžný den.
  - [ ] Noc.
  - [ ] Režim bez telefonu.
  - [ ] Slabé připojení.
  - [ ] Opakované neúspěšné synchronizace.

---

## 3. Mobilní Android / Capacitor / Health Connect

> Tato část je volitelná, pokud budou hodinky posílat data přímo na backend.

- [ ] **3.1 Implementovat Android companion vrstvu**
  - [ ] Autentizace stejného uživatele jako v PWA.
  - [ ] Příjem dat z hodinek.
  - [ ] Lokální fronta.
  - [ ] Dávková synchronizace.

- [ ] **3.2 Implementovat vlastní Capacitor plugin**
  - [ ] Kontrola dostupnosti Health Connect.
  - [ ] Žádost o oprávnění.
  - [ ] Čtení záznamů.
  - [ ] Stav poslední synchronizace.
  - [ ] Otevření systémového nastavení oprávnění.

- [ ] **3.3 Nakonfigurovat Health Connect**
  - [ ] Manifest.
  - [ ] Oprávnění pouze pro používané datové typy.
  - [ ] Background-read oprávnění, je-li skutečně potřeba.
  - [ ] Rationale activity.

- [ ] **3.4 Implementovat inkrementální synchronizaci**
  - [ ] Changes token pro každý datový typ.
  - [ ] Aktualizace.
  - [ ] Mazání.
  - [ ] Obnovení po expirovaném tokenu.
  - [ ] Odebrání oprávnění během provozu.

- [ ] **3.5 Ukládat původ dat**
  - [ ] Package/data origin.
  - [ ] Výrobce zařízení.
  - [ ] Model zařízení.
  - [ ] Zda jde o manuální nebo automatické měření.

---

## 4. Datový model a synchronizace

- [ ] **4.1 Oddělit jednotlivé vrstvy dat**
  - [ ] `source_measurement` – původní systémové měření.
  - [ ] `interval_feature` – agregované údaje za půlhodinu.
  - [ ] `state_suggestion` – návrh algoritmu.
  - [ ] `user_entry` – stav potvrzený uživatelem.
  - [ ] `medication_event` – užití léku.
  - [ ] `audit_event` – historie změn.

- [ ] **4.2 U každého návrhu ukládat**
  - [ ] Navržený stav.
  - [ ] Confidence.
  - [ ] Coverage.
  - [ ] Důvody návrhu.
  - [ ] Verzi pravidel/modelu.
  - [ ] Čas vygenerování.
  - [ ] Vstupní datové období.

- [ ] **4.3 U uživatelského záznamu ukládat**
  - [ ] Potvrzený stav.
  - [ ] Zda šlo o potvrzení nebo opravu návrhu.
  - [ ] Čas potvrzení.
  - [ ] Původní návrh.
  - [ ] Možnost vrácení změny.

- [ ] **4.4 Vyřešit idempotenci**
  - [ ] UUID záznamů.
  - [ ] Unikátní ID dávky.
  - [ ] Opakované odeslání bez duplikátů.
  - [ ] Out-of-order data.
  - [ ] Aktualizace již přijatého záznamu.

- [ ] **4.5 Vyřešit čas**
  - [ ] UTC pro ukládání.
  - [ ] Zone offset původního měření.
  - [ ] Změna časového pásma.
  - [ ] Přechod letní/zimní čas.
  - [ ] Půlnoc během cestování.

---

## 5. Backend a pravidlový engine

- [ ] **5.1 Parser a normalizátor**
  - [ ] Tep.
  - [ ] Kroky.
  - [ ] Vzdálenost.
  - [ ] Aktivita.
  - [ ] Spánek, pokud je dostupný.
  - [ ] Různé zdroje a jednotky.

- [ ] **5.2 Agregace do časových bloků**
  - [ ] Půlhodinové intervaly.
  - [ ] Průměr/minimum/maximum.
  - [ ] Počet vzorků.
  - [ ] Délka pokrytí.
  - [ ] Detekce mezer.

- [ ] **5.3 Výpočet kvality intervalu**
  - [ ] Hodinky pravděpodobně nošené.
  - [ ] Dostatečný počet měření.
  - [ ] Výpadek připojení.
  - [ ] Nabíjení hodinek.
  - [ ] Konfliktní zdroje.

- [ ] **5.4 Vytvoření osobního baseline**
  - [ ] Obvyklá aktivita podle denní doby.
  - [ ] Typická tepová frekvence.
  - [ ] Typická odezva po léku.
  - [ ] Běžný spánkový režim.

- [ ] **5.5 Implementace pravidlového enginu**
  - [ ] Spánek.
  - [ ] Nedostatek dat.
  - [ ] Pravděpodobně aktivní.
  - [ ] Pravděpodobně neaktivní.
  - [ ] Kandidát ON.
  - [ ] Kandidát částečně ON/OFF.
  - [ ] Nejasný stav.

- [ ] **5.6 Čas léčby používat pouze jako kontext**

- [ ] **5.7 Zavést minimální prahy**
  - [ ] Minimální coverage pro vytvoření návrhu.
  - [ ] Minimální confidence pro hromadné potvrzení.
  - [ ] Minimální rozdíl mezi první a druhou variantou.

- [ ] **5.8 Umožnit zpětný přepočet**
  - [ ] Nová verze pravidel.
  - [ ] Zachování starého výsledku.
  - [ ] Porovnání obou verzí.
  - [ ] Nikdy nepřepisovat ručně potvrzený stav.

- [ ] **5.9 Přidat vysvětlitelnost návrhu**
  - [ ] Zobrazit hlavní podklady návrhu.
  - [ ] Rozlišit jistotu od pokrytí dat.
  - [ ] Označit konfliktní nebo slabé podklady.

---

## 6. PWA a human-in-the-loop UX

- [ ] **6.1 Přidat vizuálně odlišnou vrstvu návrhů**
  - [ ] Draft.
  - [ ] Potvrzený stav.
  - [ ] Ručně zadaný stav.
  - [ ] Chybějící data.

- [ ] **6.2 Zobrazit odděleně**
  - [ ] Jistotu odhadu.
  - [ ] Pokrytí daty.
  - [ ] Důvody návrhu.

- [ ] **6.3 Přidat akce**
  - [ ] Potvrdit.
  - [ ] Změnit.
  - [ ] Zamítnout.
  - [ ] Nevím.
  - [ ] Rozdělit interval.
  - [ ] Sloučit sousední intervaly.
  - [ ] Vrátit změnu.

- [ ] **6.4 Drag & Drop doplnit o přístupnější alternativu**
  - [ ] Tlačítka.
  - [ ] Klávesnice.
  - [ ] Dotykové ovládání.
  - [ ] Potvrzovací dialog u velkých změn.

- [ ] **6.5 Hromadné akce omezit**
  - [ ] Schválit pouze jednoznačné návrhy.
  - [ ] Před potvrzením zobrazit počet intervalů.
  - [ ] Nevztahovat na ručně vyplněné bloky.
  - [ ] Nabídnout undo.

- [ ] **6.6 Nikdy automaticky nepřepsat uživatelský záznam**

- [ ] **6.7 Zobrazit stav synchronizace**
  - [ ] Poslední data z hodinek.
  - [ ] Poslední upload.
  - [ ] Čekající dávky.
  - [ ] Chybějící oprávnění.
  - [ ] Hodinky delší dobu neposílají data.

---

## 7. Testování a kalibrace

- [ ] **7.1 Jednotkové testy pravidel**

- [ ] **7.2 Testování syntetických Health Services dat**

- [ ] **7.3 Testování na reálných hodinkách**
  - [ ] Alespoň dva modely.
  - [ ] Několik verzí Wear OS.
  - [ ] Hodinky bez telefonu.
  - [ ] Hodinky s vypnutou Wi-Fi.
  - [ ] Nízká baterie.

- [ ] **7.4 Testování životního cyklu**
  - [ ] Restart hodinek.
  - [ ] Aktualizace aplikace.
  - [ ] Force stop.
  - [ ] Odebrání a opětovné udělení oprávnění.
  - [ ] Vyčištění dat aplikace.

- [ ] **7.5 Testování synchronizace**
  - [ ] Duplicitní dávka.
  - [ ] Dávky v nesprávném pořadí.
  - [ ] Přerušený upload.
  - [ ] Timeout.
  - [ ] Částečně přijatá dávka.
  - [ ] Dlouhý offline režim.

- [ ] **7.6 Testování časových problémů**
  - [ ] Změna časové zóny.
  - [ ] Letní čas.
  - [ ] Změna času na zařízení.
  - [ ] Pozdní doručení měření.

- [ ] **7.7 Kalibrace proti ručnímu deníku**
  - [ ] Počet shod.
  - [ ] Počet oprav.
  - [ ] Záměny ON/OFF.
  - [ ] Záměny klidu a OFF.
  - [ ] Výsledky podle uživatele.
  - [ ] Výsledky podle modelu hodinek.

- [ ] **7.8 Testování hromadného schvalování**
  - [ ] Ochrana proti chybnému dni.
  - [ ] Undo.
  - [ ] Auditní historie.

---

## 8. Bezpečnost, soukromí a produkční nasazení

- [ ] **8.1 Minimalizovat požadovaná oprávnění**

- [ ] **8.2 Šifrování**
  - [ ] TLS při přenosu.
  - [ ] Šifrování citlivých dat na serveru.
  - [ ] Bezpečné uložení tokenů.
  - [ ] Žádná zdravotní data v běžných aplikačních logách.

- [ ] **8.3 Správa souhlasu**
  - [ ] Zapnout/vypnout sběr.
  - [ ] Odebrat konkrétní datový typ.
  - [ ] Odpojit hodinky.
  - [ ] Zobrazit připojené zdroje.

- [ ] **8.4 Export a odstranění dat**
  - [ ] Export deníku.
  - [ ] Export měření.
  - [ ] Odstranění účtu.
  - [ ] Odstranění zdravotních dat.
  - [ ] Definovaná retenční politika.

- [ ] **8.5 Připravit Google Play deklarace**
  - [ ] Health apps declaration.
  - [ ] Zdůvodnění každého Health Connect datového typu.
  - [ ] Data Safety formulář.
  - [ ] Veřejná privacy policy.

- [ ] **8.6 Monitoring provozu**
  - [ ] Počet aktivních hodinek.
  - [ ] Stáří posledních dat.
  - [ ] Chybovost synchronizace.
  - [ ] Počet odebraných oprávnění.
  - [ ] Verze pravidlového enginu.
  - [ ] Bez odesílání citlivých hodnot do analytických služeb.

---

## Doporučené pořadí MVP

- [ ] 1. Nativní Wear OS aplikace.
- [ ] 2. Health Services + `PassiveMonitoringClient`.
- [ ] 3. Room fronta na hodinkách.
- [ ] 4. Dávkový upload na backend.
- [ ] 5. Ukládání zdrojových měření a provenance.
- [ ] 6. Půlhodinová agregace.
- [ ] 7. Jednoduché návrhy + coverage.
- [ ] 8. Potvrzení nebo oprava v existující PWA.
- [ ] 9. Sběr oprav pro pozdější kalibraci.

> **Poznámka:** Health Connect a Capacitor plugin je vhodné v první fázi přidat jen tehdy, pokud aplikace skutečně potřebuje data uložená v telefonu. Pro přímé načítání Health Services z Wear OS by jinak šlo o další mezivrstvu.
