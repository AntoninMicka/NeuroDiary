# NeuroDiary – Roadmap

## Fáze 0 – Produktová vize

### [pending] 0.1 Definovat cílové uživatele

* Parkinsonovi pacienti
* Rodinní příslušníci
* Lékaři

### [pending] 0.2 Definovat hlavní scénáře použití

* Každodenní evidence zdravotního stavu
* Dlouhodobé sledování vývoje
* Sdílení dat s lékařem
* Tvorba reportů

### [pending] 0.3 Definovat MVP

Cíl MVP:

> Pacient si několik dní zapisuje zdravotní stav, zobrazí základní grafy a během několika sekund vytvoří PDF report pro lékaře – vše funguje kompletně offline.

---

## Fáze 1 – Analýza a návrh

### [done] 1.1 Výběr technologického stacku

* Svelte/Vue
* SQLite (WASM)
* Python FastAPI
* Google Cloud Run

### [analysed/ready_to_implementation] 1.2 Návrh datového modelu

* Pacient
* Denní záznam
* Hodinový stav
* Užívání léků
* Nastavení aplikace

### [analysed/ready_to_implementation] 1.3 Návrh UI/UX

* Desktopová matice
* Mobilní timeline
* Dialogové zadávání
* Přístupnost

### [done] 1.6 Pravidla validace a kvality dat

* validace časů, dávek a povinných polí
* detekce nekonzistentních denních záznamů
* pravidla pro chybějící nebo neúplná data

Aktuální stav:

* sdílená validace názvu léku, dávky a skutečně platného času
* kontrola roku narození, budoucích a neplatných dat
* ochrana proti duplicitní plánované i skutečně užité dávce
* audit nekonzistentních záznamů, tombstones a duplicitních identifikátorů
* dny jsou klasifikovane jako bez dat, neuplne, dostatecne nebo kompletni
* dnesni den zohlednuje pouze hodiny, ktere uz nastaly
* trendy a reporty rozlisuji zaznamenane a spolehlive dny

### [pending] 1.4 Návrh doménové architektury

* DiaryService
* MedicationService
* StatisticsService
* ExportService
* SyncService
* NotificationService

### [in_progress] 1.5 Návrh databázových migrací

Základní schema versioning přes SQLite `PRAGMA user_version` a první migration runner.

---

# 🎯 Milník M0 – Architektura připravena

Projekt má dokončený návrh architektury a je připraven k implementaci.

Výstup:

* technologický stack
* datový model
* UI návrh
* doménová architektura

---

## Fáze 2 – Lokální offline aplikace (MVP)

### [poc_done] 2.1 Inicializace projektu

Statický offline PoC ve složce `poc/` a navazující Vue skeleton v `src/`.

### [in_progress] 2.2 Lokální SQLite databáze

Připraven Vue repository layer, `LocalStorageDiaryRepository` a první `SqliteDiaryRepository`
s fallbackem na localStorage, včetně import/export `.sqlite`.

### [poc_done] 2.3 Správa léků

### [in_progress] 2.7 Léčebný plán vs. skutečně užité dávky

* definice pravidelné medikace
* odlišení plánované a skutečně užité dávky
* příprava podkladů pro pozdější adherence analýzy
* evidence skutečně užitých léčiv včetně času a dávky

Aktuální stav:

* nové skutečné dávky mají přímou vazbu na položku léčebného plánu
* starší dávky se párují podle názvu, množství a nejbližšího času
* den zobrazuje dávky užité včas, dříve, později, čekající a vynechané
* dostupný je denní souhrn adherence a přehled neplánovaných dávek
* léčebný plán je verzovaný pomocí období platnosti `od–do`
* historická i dlouhodobá adherence používá plán platný v konkrétní den
* [pending] v detailu dávky zobrazit plánovaný čas, skutečný čas užití a čas vytvoření zápisu
* zbývá detailnější dlouhodobá adherence analýza

### [poc_done] 2.4 Denní záznam

* hodinové sloty
* zdravotní stav
* spánek
* poznámky

### [poc_done] 2.5 Offline ukládání

Lokální persistence přes `localStorage` jako PoC vrstva před SQLite.

### [done] 2.6 PWA

Manifest, Service Worker, offline režim, instalační prompt a základní update/offline hlášky.

---

# 🎯 Milník M1 – Offline MVP

Pacient může aplikaci používat každý den bez připojení k internetu.

Výstup:

* evidence léků
* denní deník
* hodinová matice
* lokální databáze
* plně funkční PWA

---

## Fáze 3 – Analýza dat

### [done] 3.1 Agregační algoritmy

První implementační vlna pro analytickou vrstvu:

* počty hodin `ON / MID / OFF / sleep` za den
* převládající stav dne
* počet dávek léků za den a průměr za období
* souhrn za posledních 7 dní pro reporty a budoucí grafy

### [done] 3.2 Denní časová osa

### [done] 3.3 Rozložení stavů

Pouze jako drobná doplňková informace pro orientaci v datech.

Poznámka:

> Užitečnost a interpretační hodnotu těchto statistik bude potřeba ověřit se specializovaným lékařem, aby se do další fáze neposouvaly metriky, které nejsou klinicky přínosné.

### [done] 3.4 Wearing-off analýza

Aktuální stav:

* zhoršení `MID/OFF` v dvouhodinovém okně před plánovanou dávkou
* silnější kandidát vyžaduje předchozí `ON` nebo dyskinezi
* orientační čas do prvního `ON` nebo dyskineze po skutečné dávce
* agregace podle názvu, dávky a plánovaného času
* opakující se denní doby se zhoršením
* pouze dostatečné a kompletní dny, s minimálním doporučeným vzorkem
* souhrn v dlouhodobých trendech a lékařském reportu
* výslovné upozornění, že nejde o diagnózu ani doporučení změny léčby

### [in_progress] 3.5 Dlouhodobé trendy

Aktuální stav:

* samostatný pohled pro období 30, 90, 180 a 365 dní
* týdenní rozložení ON / MID / OFF / dyskineze / spánek
* porovnání podílu ON a OFF mezi první a druhou polovinou období
* pokrytí dat a průměrný počet zaznamenaných hodin
* orientační adherence po týdnech podle léčebného plánu platného v daném období
* dlouhodobá adherence respektuje historické verze léčebného plánu
* zbývá klinické ověření interpretace metrik

### [done] 3.6 Kvalita dat pro analýzy

* práce s chybějícími dny
* označení neúplných nebo málo spolehlivých období
* pravidla pro interpretaci neúplných dat v reportech

Aktualni stav:

* prazdne dny se nepocitaji jako dny s daty ani jako automaticky vynechana medikace
* souhrn ukazuje chybejici hodinove useky a chybejici denni hodnoty
* dlouhodobe trendy pouzivaji pokryti spolehlivymi dny
* lekarsky report uvadi kvalitu a hodinove pokryti dne

---

## Fáze 4 – Export a zálohy

### [pending] 4.1 PDF engine

### [done] 4.2 Lékařský report

Tiskový report pro lékaře v A4 landscape podobě s kompaktní hlavičkou, 4 dny na první stránce,
hodinovou maticí, barevně zvýrazněnými stavy a timeline medikace.

Navazující rozšíření:

* promítnutí skutečně užitých léčiv do časové osy reportu
* odlišení plánované medikace a skutečně užité dávky v reportu

### [done] 4.3 Export JSON

Ruční export JSON zálohy z aplikace.

### [done] 4.4 Import JSON

Import JSON zálohy s potvrzením a nouzovým předimportním exportem.

### [pending] 4.5 Automatické lokální zálohy

### [pending] 4.6 Mobilní cloudové zálohy

* Android: záloha/export na Google Drive
* Apple ekosystém: záloha/export do iCloud Drive nebo Files
* obnova dat ze vzdálené zálohy

### [pending] 4.8 Zálohování na Google Drive

* ruční export databáze nebo zálohy přímo na Google Drive
* později možnost navázat automatické cloudové zálohy
* vhodné i jako mezikrok před plnou mobilní integrací

### [pending] 4.9 Zálohování do Apple úložiště

* ruční export databáze nebo zálohy do iCloud Drive / Files
* později možnost navázat automatické cloudové zálohy v Apple ekosystému
* vhodné jako paralelní varianta ke Google Drive pro iPhone a iPad

### [pending] 4.7 Export pro podporu a diagnostiku

* export anonymizovaného debug balíčku
* přiložení verze aplikace a stavu databáze
* bezpečné sdílení technických podkladů při řešení chyb

### [pending] 4.10 Odeslání reportu e-mailem

* možnost odeslat lékařský report e-mailem přímo z aplikace
* možnost uložit a spravovat cílový e-mailový kontakt pro odeslání
* report nebo příloha musí být šifrovaná
* přístup k souboru pouze pomocí předem domluveného hesla sdíleného jiným kanálem
* vhodné jako řízená varianta sdílení před plnou implementací bezpečného cloudového sdílení
* zvážit efektivnější formát přenosu podle scénáře:
  PDF pro rychlé čtení a tisk
  JSON report pro strojové načtení, import a další zpracování

---

# 🎯 Milník M2 – Analýza a reporty

Nasbíraná data mají praktickou hodnotu.

Výstup:

* analytické grafy
* dlouhodobé trendy
* PDF report
* export/import
* lokální zálohování

---

## Fáze 5 – Bezpečnost

### [in_progress] 5.1 Přihlášení

Rozhodnutí pro první cloudovou iteraci:

* Google ID
* Sign in with Apple
* serverové ověření identity tokenu
* návazné vydání vlastní session / JWT pro NeuroDiary API

Aktualni stav:

* backend i frontend uz maji pripraveny prvni federated auth scaffold
* Google login ma pripravenou serverovou verifikaci ID tokenu
* Apple login ma pripravenou integracni kostru a ceka hlavne na produkcni konfiguraci `Services ID`
* legacy bearer token zatim zustava jako docasny fallback pro plynuly prechod

Navazující kroky:

* návrh account linking při použití více providerů
* fallback strategie pro zařízení bez Apple / Google přihlášení
* později zvážit passkeys jako doplňkovou nebo pokročilejší variantu

### [in_progress] 5.2 Šifrování dat

Aktualni stav:

* diary snapshot se pred odeslanim sifruje v klientovi pomoci `AES-GCM-256`
* nahodny account master key se bali klicem odvozenym z recovery secretu pomoci `PBKDF2`
* backend uklada pouze sifrovany payload, zabaleny klic a synchronizacni metadata
* nove zarizeni umi lokalne obnovit klic a desifrovat snapshot pomoci recovery secretu
* automaticke testy pokryvaji sifrovany round-trip, chybny recovery secret, obnovu noveho zarizeni a konflikt revizi

Poznamka k recovery flow:

* recovery secret se da vygenerovat v klientovi
* novy prenosovy flow umi zobrazit secret jako QR a nacist jej z QR obrazku
* QR lze nacist ze souboru i live kamerou
* zbyva navrhnout rotaci klicu, spravu duveryhodnych zarizeni a bezpecnejsi multi-device onboarding flow

### [in_progress] 5.3 Cloud deploy a sync infrastruktura

Aktuální stav:

* připraven workflow `GitHub Actions -> Cloud Run`
* připraven deploy přes `Workload Identity Federation`
* backend umí `PostgreSQL` přes `NEURODIARY_DATABASE_URL`
* SQLite zůstává jako lokální vývojový fallback

Navazující kroky:

* připravit konkrétní `Cloud SQL` provisioning a connection string variantu
* doplnit produkční konfiguraci Cloud Run služby
* oddělit testovací deploy od ostrého sync prostředí

Rozhodnutí pro cloudovou synchronizaci:

* end-to-end šifrování dat deníku
* server ukládá pouze šifrované payloady a metadata nutná pro synchronizaci
* dešifrování probíhá pouze na zařízení uživatele

Navazující kroky:

* návrh key managementu pro Google ID / Apple ID účty
* bezpečné odvození nebo zabalení šifrovacího klíče
* obnova přístupu při novém zařízení
* řešení rotace klíčů
* rozhodnout, která metadata mohou zůstat mimo šifrovaný obsah

### [pending] 5.4 Audit log

### [pending] 5.5 GDPR

### [pending] 5.6 Bezpečné sdílení a souhlas

* potvrzení uživatele před sdílením reportu nebo exportu
* možnost anonymizace vybraných výstupů
* evidence, co a kdy bylo exportováno nebo sdíleno

---

## Fáze 6 – Cloud

### [in_progress] 6.1 Backend

První FastAPI backend scaffold v `backend/`:

* healthcheck
* snapshot sync storage v serverové SQLite
* Dockerfile
* základní konfigurace přes env variables

Rozhodnutí pro první deployment target:

* Google Cloud Run

### [in_progress] 6.2 REST API v1

První kontrakt zdokumentovaný a implementovaný:

* `GET /healthz`
* `GET /api/v1/sync/pull`
* `POST /api/v1/sync/push`
* bearer token pro dočasný single-user režim

Navazující kroky:

* stabilizovat request/response kontrakty
* doplnit endpoint pro zjištění verze a capability discovery
* oddělit interní a veřejné API modely

### [done] 6.3 Napojení frontendu na synchronizaci

* Sync settings v klientovi
* ruční `pull` a `push`
* indikace poslední synchronizace
* zobrazení konfliktu a chybového stavu
* bezpečné chování při offline režimu
* příprava pro sync šifrovaného payloadu místo otevřeného JSON snapshotu

Aktualni stav:

* klient podporuje inicializaci, rucni pull, push a rychly sync
* zobrazuje revizi, posledni synchronizaci, cekajici zmeny a chybovy stav
* offline rezim sitove akce nespousti a lokalni zmeny zustavaji zachovane
* klient synchronizuje pouze E2E sifrovany snapshot

### [done] 6.4 Automatická synchronizace

* sync při startu aplikace
* debounce po lokálních změnách
* manuální vynucení synchronizace
* strategie retry a backoff
* ochrana proti paralelním zápisům

Aktualni stav:

* automaticky pull a push se spousti pri dostupnem pripojeni
* lokalni zmeny jsou oznacene jako cekajici a po kratkem debounce nasledne odeslane
* soubezne synchronizaci brani klientsky busy stav
* prerusene spojeni spousti omezeny exponencialni retry/backoff od 5 sekund do 5 minut
* automaticky test overuje opakovani po vypadku, rust prodlevy a reset po uspesnem syncu

### [done] 6.5 Konflikty a verzování

* snapshot conflict flow
* rozhodnutí lokalní vs. serverová verze
* pozdější jemnější merge po dnech nebo entitách
* audit posledních konfliktů
* ověřit, jak bude conflict workflow fungovat nad end-to-end šifrovanými daty

Aktualni stav:

* backend kontroluje `baseRevision` a vraci aktualni sifrovany snapshot pri konfliktu
* klient konflikt desifruje, provede merge a odesle slouceny snapshot s novou revizi
* automaticke testy overuji desifrovani vzdaleneho stavu a serverovy tok push, pull, konflikt a reset
* izolace snapshotu dvou prihlasenych uzivatelu je overena integracnim testem
* novější denní hodnoty vyhrávají podle `updatedAt`, souběžné hodinové záznamy a dávky zůstávají zachované
* tombstone smazané dávky brání jejímu obnovení ze staršího zařízení
* lokální audit posledních 20 konfliktů ukládá pouze čas, zařízení, revize, strategii a výsledek bez zdravotních dat

### [ready_for_external_setup] 6.6 Deploy backendu

* zvolit první cílovou platformu
  Google Cloud Run
* produkční env variables a tokeny
* persistentní serverové úložiště
* CORS a základní hardening
* runbook pro nasazení nové verze

Navazující kroky pro Cloud Run:

* Artifact Registry / image build
* Cloud Run service
* perzistentní data přes navázané serverové úložiště nebo přechod na managed DB
* bezpečné uložení secrets
* vlastní doména pro frontend API komunikaci
* oddělit metadata synchronizace od šifrovaných uživatelských dat

Repozitar obsahuje image build, Workload Identity deploy workflow, startup/liveness probes a
automaticky smoke test nasazene URL. Dokonceni vyzaduje konkretni GCP projekt, Cloud SQL,
repository variables a secrets podle `docs/cloud_run_manual_todo.md`.

### [in_progress] 6.7 Monitoring a provoz

* structured logging
* základní error reporting
* healthcheck monitoring
* zálohy serverové databáze
* jednoduchý incident / recovery postup

Aktualni stav:

* strukturovane JSON request logy bez payloadu a identity uzivatele
* korelacni `X-Request-ID`
* oddelene liveness `/healthz` a DB readiness `/readyz`
* capability/version endpoint a post-deploy smoke test
* CI build frontendu a backendove health testy
* provozni runbook v `docs/operations.md`
* zbyva zapnout Cloud Monitoring alerty a Cloud SQL zalohy v konkretnim GCP projektu

### [pending] 6.8 Integrace mobilních úložišť

* Android sdílení a export do Google Drive
* Apple sdílení a export do iCloud Drive / Files
* napojení na nativní systémové dialogy pro výběr umístění zálohy

### [pending] 6.9 Více profilů a role pečující osoby

* pacient
* rodinný příslušník / pečující
* oddělení dat a oprávnění mezi profily

### [pending] 6.10 Sdílení s lékařem

### [pending] 6.11 Lékařský režim / kartotéka

* speciální režim pro ambulanci nebo poradnu
* načítání doručených reportů a jejich evidence
* ukládání kontaktů pacientů pro příjem reportů
* evidence dohodnutých přístupových údajů nebo pravidel pro otevření šifrovaných reportů
* centrální tisk reportů v ordinaci nebo poradně
* jednoduchá kartotéka pacientů s vazbou na doručené reporty a historii přijetí
* zvážit oddělený lékařský klient nebo samostatné rozhraní, aby pacientská a ambulantní část nebyly zbytečně promíchané

Poznámka:

> Ukládání hesel pacientů v přímé podobě není vhodné. Pokud bude tento scénář dále rozpracován, je potřeba navrhnout bezpečnější provozní model pro práci se šifrovanými reporty.

---

# 🎯 Milník M3 – Bezpečný cloud

Data jsou bezpečně synchronizována mezi zařízeními.

Výstup:

* první nasazený backend
* klient napojený na sync API
* bezpečné přihlášení
* šifrování
* synchronizace mezi zařízeními
* sdílení dat

---

## Doporučené pořadí dalších implementací

### [done] R1 Klientský sync základ

Nejbližší praktický krok po backend scaffoldingu:

* uložit sync endpoint a token do nastavení
* přidat ruční `Synchronizovat nyní`
* umět `pull` při prvním napojení
* zobrazit `revision`, čas posledního syncu a conflict stav

Poznámka:

* implementace by už měla počítat s budoucím end-to-end šifrováním, aby se sync kontrakt nemusel znovu zásadně lámat
* splneno sifrovanym snapshot kontraktem a klientskym recovery flow

### [recommended] R2 První nasazení backendu

Po ručním klientském syncu:

* nasadit backend na Google Cloud Run
* dořešit persistentní serverové úložiště
* nastavit CORS pro frontend doménu
* otestovat synchronizaci mezi dvěma zařízeními

### [recommended] R3 Až potom validace a automatizace

Jakmile bude základní sync fungovat:

* validace a kvalita dat
* automatická synchronizace
* řešení konfliktů
* autentizace více uživatelů

### [recommended] R4 Přihlášení přes Apple / Google

Jakmile bude první sync end-to-end funkční:

* Google Sign-In v klientovi
* Sign in with Apple
* ověření identity tokenů na backendu
* mapování uživatele na serverový sync prostor

### [in_progress] R0 Návrh E2E šifrování

Ještě před plným napojením klienta na produkční sync:

* vybrat model klíčů
* určit hranici mezi šifrovanými daty a synchronizačními metadaty
* rozhodnout recovery flow pro nové zařízení
* potvrdit, co backend smí a nesmí být schopen přečíst

Aktualni stav:

* prvni model klicu, hranice sifrovaneho payloadu a recovery flow jsou navrzene i implementovane
* pred produkcnim provozem zbyva rozhodnout rotaci klicu a spravu duveryhodnych zarizeni

---

## Fáze 7 – Notifikace

### [in_progress] 7.1 Připomenutí léků

Aktuální stav:

* lokální systémová upozornění podle časů v léčebném plánu
* volba upozornění v čase dávky nebo 5–30 minut předem
* ochrana proti duplicitním upozorněním a přeskočení již užité dávky
* persistentní notifikace přes Service Worker pro Firefox a Chrome na Linuxu, Windows a Androidu
* lokální fallback plánovač vyžaduje otevřenou nebo běžící aplikaci
* Web Push subscription, anonymní UTC plán a Service Worker příjem po zavření aplikace
* server neukládá názvy léků ani dávky a posílá pouze obecný text připomínky
* plán se obnovuje na 31 dní při spuštění aplikace a při změně léčby
* interní dispatch endpoint je chráněný scheduler tokenem
* zbývá nastavit produkční VAPID klíče a Cloud Scheduler job
* Apple platformy jsou pro tuto fázi vědomě odloženy; kompatibilita se vyhodnotí později

### [pending] 7.2 Připomenutí vyplnění deníku

### [pending] 7.3 Chytré notifikace

---

## Fáze 8 – AI analýza

### [pending] 8.1 Týdenní shrnutí

### [pending] 8.2 Vyhledávání trendů

### [pending] 8.3 Detekce změn zdravotního stavu

### [pending] 8.4 Doporučení vhodného období pro konzultaci s lékařem

### [pending] 8.5 AI komentáře k reportům

---

# 🎯 Milník M4 – Chytrý zdravotní deník

NeuroDiary aktivně pomáhá pacientovi porozumět jeho zdravotnímu stavu.

Výstup:

* připomenutí
* AI shrnutí
* analýza trendů
* doporučení
* inteligentní reporty

---

## Fáze 9 – Infrastruktura

### [pending] 9.1 GitHub Actions

### [pending] 9.2 CI/CD

### [pending] 9.3 Monitoring

### [pending] 9.4 Crash reporting

### [pending] 9.5 Výkon a škálování lokálních dat

* výkon při stovkách až tisících dnů záznamů
* velikost lokální databáze a exportů
* odezva reportů a analýz nad delší historií

---

## Fáze 10 – Testování

### [pending] 10.1 Jednotkové testy

### [pending] 10.2 Integrační testy

### [pending] 10.3 UI testy

### [pending] 10.4 Offline testy

### [pending] 10.5 Synchronizační testy

### [pending] 10.6 Bezpečnostní audit

### [pending] 10.7 Beta test s pacienty

### [pending] 10.8 Přístupnost a usability testy

* ověření čitelnosti pro cílovou skupinu
* testování ovládání na mobilu i desktopu
* validace reportů a exportů s reálnými uživateli

---

## Fáze 11 – Rozšiřitelnost

### [pending] 11.1 Plugin architektura

### [pending] 11.2 Podpora dalších diagnóz

* Migréna
* Roztroušená skleróza
* Epilepsie
* Diabetes

### [pending] 11.3 Veřejné API

### [pending] 11.4 Integrace s wearables

Wearable data mají sloužit jako podklad pro návrh stavu k potvrzení, nikoli jako diagnóza
nebo doporučení změny léčby. Ručně potvrzené záznamy se nesmí automaticky přepisovat.

#### [pending] 11.4.1 Vymezit produkt, regulatorní hranici a podporované platformy

* potvrdit metriky pro první verzi: tep, aktivita, kroky a případně spánek
* posoudit dopad MDR před veřejným zdravotnickým nasazením
* stanovit minimální Wear OS a Android API, podporované modely a režim bez telefonu
* detekovat capabilities za běhu a zobrazit skutečně dostupné funkce

#### [pending] 11.4.2 Zvolit architekturu přenosu

* porovnat přímý přenos `Wear OS → backend → PWA` s Android companion vrstvou
* rozhodnout mezi samostatným Wear OS modulem a balením PWA pomocí Capacitoru
* Health Connect a vlastní Capacitor plugin přidat pouze tehdy, pokud budou potřeba data uložená v telefonu
* pro wearable klienta znovu použít existující identitu, E2E sync kontrakt a conflict strategii z fází 5 a 6

#### [pending] 11.4.3 Implementovat sběr na Wear OS

* vytvořit Kotlin modul s Health Services (`PassiveMonitoringClient`, `PassiveListenerService`)
* registrovat pouze podporované datové typy a minimální nutná oprávnění
* vysvětlit uživateli účel, rozsah, odesílání a vypnutí sběru
* obnovit registraci po restartu hodinek
* vytvořit offline Room frontu s dávkovým uploadem a bezpečným odstraněním potvrzených položek
* změřit spotřebu baterie při běžném provozu, v noci, offline a při opakovaném selhání přenosu

#### [pending] 11.4.4 Rozšířit datový model wearable měření

* oddělit `source_measurement`, agregovaný `interval_feature`, `state_suggestion` a potvrzený `user_entry`
* evidovat čas měření a přijetí, UTC, původní offset, zdroj, zařízení, pokrytí a výpadky
* u návrhu uložit stav, confidence, coverage, důvody, verzi pravidel a vstupní období
* navázat potvrzení nebo opravu na původní návrh a zachovat auditní historii
* pro měření použít existující UUID, append-only slučování a tombstones; doplnit pouze ingest pozdě doručených dat

#### [pending] 11.4.5 Implementovat agregaci a návrhy stavu

* normalizovat jednotky a původ tepu, kroků, vzdálenosti, aktivity a dostupných údajů o spánku
* agregovat měření do časových intervalů včetně minima, maxima, průměru, počtu vzorků a mezer
* vyhodnotit pokrytí, pravděpodobné nošení hodinek, nabíjení a konfliktní zdroje
* vytvořit osobní baseline podle denní doby, aktivity, tepu, spánku a odezvy po léku
* používat léčebný plán pouze jako kontext
* verzovat pravidla, podporovat zpětný přepočet a nikdy nepřepsat potvrzený stav

#### [pending] 11.4.6 Doplnit human-in-the-loop UX

* vizuálně odlišit návrh, potvrzený stav, ruční záznam a chybějící data
* samostatně zobrazit confidence, coverage a hlavní důvody návrhu
* umožnit potvrdit, opravit, zamítnout nebo označit „nevím“
* hromadně potvrzovat pouze jednoznačné návrhy a nabídnout vrácení změny
* zpřístupnit všechny akce také tlačítky, klávesnicí a dotykovým ovládáním
* zobrazit poslední data z hodinek, poslední upload, čekající data a chybějící oprávnění

#### [pending] 11.4.7 Doplnit wearable souhlas, soukromí a provoz

* umožnit vypnout sběr, odebrat jednotlivé datové typy a odpojit zařízení
* rozšířit existující export a odstranění dat o zdrojová wearable měření a retenční pravidla
* připravit Google Play Health Apps declaration, Data Safety a veřejnou privacy policy
* monitorovat stáří posledních dat, chybovost syncu a verzi pravidel bez citlivých hodnot v logách
* bezpečnost přenosu, tokenů a zdravotních dat řešit společně s existujícími body 5.2, 5.5 a 6.5

#### [pending] 11.4.8 Ověřit integraci a kalibrovat návrhy

* přidat wearable scénáře do testovací fáze 10 místo vytváření paralelního obecného testovacího plánu
* testovat syntetická data, alespoň dva modely hodinek a více verzí Wear OS
* ověřit restart, aktualizaci, force stop, změnu oprávnění, dlouhý offline režim a přerušený upload
* ověřit změny časového pásma, letní čas, změnu času zařízení a pozdní doručení
* kalibrovat návrhy proti ručnímu deníku podle uživatele i modelu zařízení
* měřit shody, opravy, záměny `ON/OFF` a záměny klidu s `OFF`

Doporučené pořadí prvního wearable MVP:

1. Nativní Wear OS modul a Health Services.
2. Room fronta a dávkový upload přes existující sync infrastrukturu.
3. Zdrojová měření s provenance a kontrolou kvality.
4. Intervalová agregace a jednoduché vysvětlitelné návrhy.
5. Potvrzení nebo oprava v PWA a sběr oprav pro kalibraci.

### [pending] 11.5 Anonymizovaný export dat pro výzkum

---

# 🎯 Milník M5 – Otevřená platforma

NeuroDiary je připraveno pro dlouhodobý rozvoj a spolupráci s komunitou.

Výstup:

* pluginy
* veřejné API
* wearables
* další diagnózy
* výzkumné integrace

---

# 🚀 Meta milník – Verze 1.0

První veřejné produkční vydání aplikace.

## Funkčnost

* dokončeny všechny milníky M0–M5
* stabilní architektura
* ověřená synchronizace
* bezpečné šifrování
* kvalitní AI analýzy

## Kvalita

* úspěšně dokončené testování
* bezpečnostní audit
* beta test s pacienty
* odstraněny kritické chyby

## Dokumentace

* uživatelská příručka
* vývojářská dokumentace
* architektura systému
* API dokumentace

## Open Source

* automatické buildy
* GitHub Releases
* CHANGELOG
* CONTRIBUTING.md
* CODE_OF_CONDUCT.md
* Issue Templates
* Pull Request Template
* licence

## Cíl

NeuroDiary je připraveno pro každodenní používání pacienty, testování lékaři a otevřenou spolupráci komunity.
