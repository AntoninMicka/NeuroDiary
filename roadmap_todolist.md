1. Analýza, návrh a výběr technologií

    [ done ] 1.1. Výběr technologického stacku (Svelte/Vue, SQLite via Wasm, Python FastAPI na Cloud Run)

    [ analysed/ready_to_implementation ] 1.2. Návrh datového modelu (Základní entity: Pacient, DenniZaznam, UzitiLeku, HodinovyStav)

    [ analysed/ready_to_implementation ] 1.3. Návrh UI/UX (Kombinovaný layout: horizontální mřížka pro desktop, vertikální timeline pro mobil + fixní tlačítko dialogu)

2. Bezpečnost, autentizace a sdílení dat

    [ analysed/ready_to_implementation ] 2.1. Implementace bezpečného přihlašování (Vlastní JWT backend s Passkeys/WebAuthn pro snadný biometrický přístup)

    [ pending ] 2.2. Šifrování citlivých zdravotních dat (E2EE lokální vs. cloud)

    [ pending ] 2.3. Systém pro bezpečné sdílení dat s lékařem

3. Základní PWA infrastruktura a CI/CD

    [ pending ] 3.1. Inicializace projektu a nastavení repozitáře na GitHubu

    [ pending ] 3.2. Konfigurace automatického nasazení (CI/CD pipeline z GitHubu na Google Cloud)

    [ pending ] 3.3. PWA konfigurace (Web App Manifest, Service Worker pro plný offline režim)

4. Vývoj hlavních funkcí (Jádro deníku)

    [ pending ] 4.1. Správa léků (Zadávání názvů medikace a fixních časů užívání)

    [ pending ] 4.2. Interaktivní matice pro denní záznam (Hodinové sloty 5:00–24:00, stavy, spánek)

    [ pending ] 4.3. Lokální ukládání do DB a mechanismus synchronizace s cloudem po obnovení připojení

5. Analýza dat a vizualizace

    [ pending ] 5.1. Vývoj algoritmů pro agregaci hodinových stavů

    [ pending ] 5.2. Graf 1: Chronologický denní profil hybnosti (Časová osa v průběhu dne)

    [ pending ] 5.3. Graf 2: Proporční rozložení stavů (Koláčový graf / Skládaný sloupec)

    [ pending ] 5.4. Graf 3: Analýza wearing-off fenoménu (Závislost stavu na čase od poslední dávky)

6. Export do PDF a reporty

    [ pending ] 6.1. Integrace a konfigurace knihovny pro generování PDF

    [ pending ] 6.2. Logika pro rychlý export dat (posledních 3 až 5 dnů)

    [ pending ] 6.3. Tvorba dvoustránkového layoutu PDF reportu (Strana 1: tabulka matice, Strana 2: analytické grafy)

7. Testování, optimalizace a nasazení

    [ pending ] 7.1. Testování UI na reálných mobilních zařízeních a simulace offline chování

    [ pending ] 7.2. Bezpečnostní audit (ověření funkčnosti Passkeys a E2EE šifrování)
