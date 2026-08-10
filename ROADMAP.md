# Roadmap

Aktuální směr projektu:

1. Offline PWA a lokální deník jsou funkční základ.
2. Backend scaffold pro synchronizaci už existuje v `backend/`.
3. První cloud target je `Google Cloud Run`.
4. Přihlášení má jít směrem `Google ID` a `Sign in with Apple`.
5. Synchronizace má počítat s `end-to-end šifrováním`.
6. Deploy backendu má jít přes `GitHub Actions -> Artifact Registry -> Cloud Run`.
7. Sync backend má být provozovaný nad perzistentní cloudovou DB, primárně `Cloud SQL for PostgreSQL`.

## Rozcestník dokumentace

Tento soubor je pouze stručný rozcestník a shrnutí dlouhodobého směru projektu.
**Nepřidávejte sem detailní TODO, implementační checklisty ani návrhy jednotlivých funkcí.**

| Soubor | Účel | Co do něj patří |
| --- | --- | --- |
| [`development_roadmap_todolist.md`](development_roadmap_todolist.md) | Hlavní a jediná detailní produktová roadmapa | Fáze, milníky, nové funkce, jejich stav a číslované implementační kroky |
| [`docs/cloud_run_manual_todo.md`](docs/cloud_run_manual_todo.md) | Provozní checklist nasazení | Ruční kroky pro GitHub, Google Cloud, Cloud Run a produkční konfiguraci |
| [`ARCHITECTURE.md`](ARCHITECTURE.md) | Architektura aplikace | Hranice komponent, vrstev, úložišť a technická rozhodnutí |
| [`docs/data_model.md`](docs/data_model.md) | Datový model | Struktura dat, význam polí, verze schématu a pravidla kompatibility |
| [`docs/ui_ux.md`](docs/ui_ux.md) | Pravidla uživatelského rozhraní | Schválené chování obrazovek a interakcí; nikoli seznam budoucích úkolů |
| [`docs/api.md`](docs/api.md) | Kontrakt API | Endpointy, vstupy, výstupy a chování rozhraní |
| [`docs/sync.md`](docs/sync.md) | Synchronizační model | Sync strategie, konflikty, E2E principy a slučování dat |
| [`docs/operations.md`](docs/operations.md) | Provoz aplikace | Monitoring, endpointy, plánovače a provozní bezpečnost |
| [`docs/gdpr.md`](docs/gdpr.md) | GDPR a soukromí | Datový inventář, účely, retence, práva subjektů a otevřená compliance rozhodnutí |
| Tematické soubory v `docs/`, například [`docs/wearing_off.md`](docs/wearing_off.md) | Specifikace již navržené oblasti | Detailní pravidla a omezení konkrétní implementované nebo analyzované funkce |

## Kam zapsat novou položku

1. Nový produktový požadavek nebo budoucí integraci zařaďte do odpovídající fáze v
   `development_roadmap_todolist.md`.
2. Použijte číslování dané fáze; podúkoly dědí číslo rodiče, například `11.4.1`.
3. Pokud položka popisuje už schválené technické chování, rozepište ji v odpovídajícím souboru
   v `docs/` a v roadmapě ponechte jen stručný stav nebo odkaz.
4. Provozní kroky konkrétního nasazení patří do příslušného checklistu, nyní
   `docs/cloud_run_manual_todo.md`.
5. Před přidáním ověřte, zda stejný problém už není hotový, rozpracovaný nebo popsaný v jiné fázi.
   Duplicitní bod slučte s existujícím místo zakládání dalšího seznamu.

Detailní roadmapa je v [`development_roadmap_todolist.md`](development_roadmap_todolist.md).
