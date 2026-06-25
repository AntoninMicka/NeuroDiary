# NeuroDiary – Roadmap

## Fáze 0 – Produktová vize

### [pending] 0.1. Definovat cílové uživatele

* Parkinsonovi pacienti
* Rodinní příslušníci
* Lékaři

### [pending] 0.2. Definovat hlavní scénáře použití

* Každodenní evidence stavu
* Dlouhodobé sledování vývoje
* Sdílení dat s lékařem
* Tvorba reportů

### [pending] 0.3. Stanovit MVP

Cíl MVP:

> Pacient si několik dní zapisuje stav, zobrazí si základní grafy a během několika sekund vytvoří PDF report pro lékaře – vše funguje kompletně offline.

---

# Fáze 1 – Analýza a návrh

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

### [pending] 1.4 Návrh doménové architektury

* DiaryService
* MedicationService
* StatisticsService
* ExportService
* SyncService
* NotificationService

### [pending] 1.5 Návrh databázových migrací

* verzování schématu
* migrace mezi verzemi

---

# Fáze 2 – Lokální offline aplikace (MVP)

### [pending] 2.1 Inicializace projektu

### [pending] 2.2 Lokální SQLite databáze

### [pending] 2.3 Správa léků

* název
* dávkování
* časy užívání

### [pending] 2.4 Denní záznam

* hodinové sloty
* spánek
* stav
* poznámky

### [pending] 2.5 Offline ukládání

### [pending] 2.6 PWA

* Manifest
* Service Worker
* Offline režim

---

# Fáze 3 – Analýza dat

### [pending] 3.1 Agregační algoritmy

### [pending] 3.2 Denní časová osa

### [pending] 3.3 Rozložení stavů

### [pending] 3.4 Wearing-off analýza

### [pending] 3.5 Dlouhodobé trendy

* týden
* měsíc
* rok

---

# Fáze 4 – Export a zálohy

### [pending] 4.1 PDF engine

### [pending] 4.2 Report

* tabulka
* grafy
* shrnutí

### [pending] 4.3 Export JSON

### [pending] 4.4 Import JSON

### [pending] 4.5 Automatické lokální zálohy

---

# Fáze 5 – Bezpečnost

### [pending] 5.1 Přihlášení

* Passkeys
* WebAuthn
* JWT

### [pending] 5.2 Šifrování dat

* lokální šifrování
* cloudové E2EE

### [pending] 5.3 Audit log

### [pending] 5.4 GDPR

---

# Fáze 6 – Cloud

### [pending] 6.1 Backend

### [pending] 6.2 REST API v1

### [pending] 6.3 Synchronizace

* upload
* download
* řešení konfliktů
* verzování

### [pending] 6.4 Sdílení s lékařem

---

# Fáze 7 – Notifikace

### [pending] 7.1 Připomenutí léků

### [pending] 7.2 Připomenutí vyplnění deníku

### [pending] 7.3 Chytré připomenutí

---

# Fáze 8 – AI analýza

### [pending] 8.1 Týdenní shrnutí

### [pending] 8.2 Vyhledávání trendů

### [pending] 8.3 Detekce změn zdravotního stavu

### [pending] 8.4 Doporučení vhodného období pro konzultaci s lékařem

### [pending] 8.5 AI komentář k reportům

---

# Fáze 9 – Infrastruktura

### [pending] 9.1 GitHub Actions

### [pending] 9.2 CI/CD

### [pending] 9.3 Monitoring

* backend
* frontend
* výkon

### [pending] 9.4 Crash reporting

---

# Fáze 10 – Testování

### [pending] 10.1 Jednotkové testy

### [pending] 10.2 Integrační testy

### [pending] 10.3 UI testy

### [pending] 10.4 Offline testy

### [pending] 10.5 Synchronizační testy

### [pending] 10.6 Bezpečnostní audit

### [pending] 10.7 Beta test s pacienty

---

# Fáze 11 – Budoucí rozvoj

### [pending] 11.1 Plugin architektura

### [pending] 11.2 Další diagnózy

* Migréna
* Roztroušená skleróza
* Epilepsie
* Diabetes

### [pending] 11.3 Veřejné API

### [pending] 11.4 Integrace s wearables

* chytré hodinky
* krokoměry
* měření spánku

### [pending] 11.5 Výzkumný anonymizovaný export dat
