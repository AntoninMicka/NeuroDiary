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

### [pending] 1.6 Pravidla validace a kvality dat

* validace časů, dávek a povinných polí
* detekce nekonzistentních denních záznamů
* pravidla pro chybějící nebo neúplná data

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

### [pending] 2.7 Léčebný plán vs. skutečně užité dávky

* definice pravidelné medikace
* odlišení plánované a skutečně užité dávky
* příprava podkladů pro pozdější adherence analýzy

### [poc_done] 2.4 Denní záznam

* hodinové sloty
* zdravotní stav
* spánek
* poznámky

### [poc_done] 2.5 Offline ukládání

Lokální persistence přes `localStorage` jako PoC vrstva před SQLite.

### [pending] 2.6 PWA

* Manifest
* Service Worker
* Offline režim

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

### [in_progress] 3.1 Agregační algoritmy

První implementační vlna pro analytickou vrstvu:

* počty hodin `ON / MID / OFF / sleep` za den
* převládající stav dne
* počet dávek léků za den a průměr za období
* souhrn za posledních 7 dní pro reporty a budoucí grafy

### [pending] 3.2 Denní časová osa

### [pending] 3.3 Rozložení stavů

### [pending] 3.4 Wearing-off analýza

### [pending] 3.5 Dlouhodobé trendy

### [pending] 3.6 Kvalita dat pro analýzy

* práce s chybějícími dny
* označení neúplných nebo málo spolehlivých období
* pravidla pro interpretaci neúplných dat v reportech

---

## Fáze 4 – Export a zálohy

### [pending] 4.1 PDF engine

### [done] 4.2 Lékařský report

Tiskový report pro lékaře v A4 landscape podobě s kompaktní hlavičkou, 4 dny na první stránce,
hodinovou maticí, barevně zvýrazněnými stavy a timeline medikace.

### [pending] 4.3 Export JSON

### [pending] 4.4 Import JSON

### [pending] 4.5 Automatické lokální zálohy

### [pending] 4.6 Mobilní cloudové zálohy

* Android: záloha/export na Google Drive
* Apple ekosystém: záloha/export do iCloud Drive nebo Files
* obnova dat ze vzdálené zálohy

### [pending] 4.7 Export pro podporu a diagnostiku

* export anonymizovaného debug balíčku
* přiložení verze aplikace a stavu databáze
* bezpečné sdílení technických podkladů při řešení chyb

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

### [pending] 5.1 Přihlášení

* Passkeys
* WebAuthn
* JWT

### [pending] 5.2 Šifrování dat

### [pending] 5.3 Audit log

### [pending] 5.4 GDPR

### [pending] 5.5 Bezpečné sdílení a souhlas

* potvrzení uživatele před sdílením reportu nebo exportu
* možnost anonymizace vybraných výstupů
* evidence, co a kdy bylo exportováno nebo sdíleno

---

## Fáze 6 – Cloud

### [pending] 6.1 Backend

### [pending] 6.2 REST API v1

### [pending] 6.3 Synchronizace

* upload
* download
* konflikty
* verzování

### [pending] 6.5 Integrace mobilních úložišť

* Android sdílení a export do Google Drive
* Apple sdílení a export do iCloud Drive / Files
* napojení na nativní systémové dialogy pro výběr umístění zálohy

### [pending] 6.6 Více profilů a role pečující osoby

* pacient
* rodinný příslušník / pečující
* oddělení dat a oprávnění mezi profily

### [pending] 6.4 Sdílení s lékařem

---

# 🎯 Milník M3 – Bezpečný cloud

Data jsou bezpečně synchronizována mezi zařízeními.

Výstup:

* bezpečné přihlášení
* šifrování
* synchronizace
* sdílení dat

---

## Fáze 7 – Notifikace

### [pending] 7.1 Připomenutí léků

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

* chytré hodinky
* krokoměry
* sledování spánku

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
