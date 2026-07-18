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
