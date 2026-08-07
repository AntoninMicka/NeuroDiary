# NeuroDiary
Take control of your daily rhythm. NeuroDiary turns the traditional paper diary into a secure, accessible app. Record ON/OFF states with a single touch, track medication effects, and securely share reports with your neurologist. It works fully offline and protects your sensitive health data with modern encryption.

## Prototype

An initial offline proof of concept lives in [poc/README.md](/home/antonin/Projects/NeuroDiary/NeuroDiary/poc/README.md:1).

## Frontend Skeleton

The current application skeleton uses Vue + Vite.

```bash
npm install
npm run dev
```

The app now attempts to bootstrap a local SQLite/WASM repository first and falls back to
`localStorage` if SQLite initialization fails.

It also includes:

- SQLite schema versioning via migrations
- export of a local `.sqlite` backup
- import of an existing `.sqlite` backup
- printable doctor report for the selected diary day
- installable PWA shell with manifest and service worker caching
- treatment plan compared with actually recorded doses and daily adherence
- long-term ON/MID/OFF trends with explicit data-quality coverage
- browser medication reminders for Firefox and Chrome
- encrypted multi-device synchronization with automatic pull/push and conflict merging
- input validation, integrity diagnostics, and deletion tombstones

## Sync Backend

The repository now also contains a first backend sync scaffold in [backend/README.md](/home/antonin/Projects/NeuroDiary/NeuroDiary/backend/README.md:1)
with a FastAPI-based `pull/push` snapshot API intended as the first step toward multi-device use.

Cloud Run deployment notes and the GitHub Actions workflow are documented in
[docs/cloud_run_deploy.md](/home/antonin/Projects/NeuroDiary/NeuroDiary/docs/cloud_run_deploy.md:1).
Independent installations can instead pull scheduled updates from a public Git repository without
GitHub Actions or repository secrets; see [docs/cloud_pull_install.md](/home/antonin/Projects/NeuroDiary/NeuroDiary/docs/cloud_pull_install.md:1).
Monitoring, backups, and incident handling are documented in
[docs/operations.md](/home/antonin/Projects/NeuroDiary/NeuroDiary/docs/operations.md:1).

## E2E Encryption

The first end-to-end encryption design is described in [docs/e2e_encryption.md](/home/antonin/Projects/NeuroDiary/NeuroDiary/docs/e2e_encryption.md:1).
Client-side crypto scaffolding for future sync integration lives in [src/services/e2eCrypto.js](/home/antonin/Projects/NeuroDiary/NeuroDiary/src/services/e2eCrypto.js:1).
