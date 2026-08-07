# Nezavisla instalace s aktualizacemi z Gitu

Rezim `cloud pull` je urceny spravcum, kteri chteji provozovat vlastni NeuroDiary instanci bez
GitHub Actions, GitHub App, webhooku a secrets ulozenych v GitHubu. Git repozitar je pouze verejny
zdroj kodu pro cteni.

## Jak aktualizace funguje

1. Cloud Scheduler podle cron rozvrhu spusti manualni Cloud Build trigger.
2. Build provede anonymni `git clone` z nakonfigurovane HTTPS adresy a vetve.
3. Commit porovna s labelem aktualni Cloud Run sluzby.
4. Pokud se commit nezmenil, build skonci bez sestaveni a nasazeni.
5. Pri zmene sestavi image, ulozi ji do Artifact Registry a aktualizuje existujici Cloud Run sluzbu.

Aktualizace zachovava runtime konfiguraci existujici Cloud Run sluzby, vcetne environment variables,
Cloud SQL napojeni a runtime service accountu.

## Spusteni

```bash
cp scripts/cloud_pull.env.example scripts/cloud_pull.env
bash scripts/cloud_pull_install.sh scripts/cloud_pull.env
```

Skript interaktivne:

- vybere Google Cloud projekt a region,
- vypise existujici Cloud Run sluzby a jejich URL,
- umozni pouze zjistit URL a exportovat ji jako QR,
- u chybejici instance muze spustit standardni bootstrap,
- nastavi verejny Git repozitar, vetev a cron rozvrh,
- vytvori omezeny service account, manualni build trigger a Scheduler job,
- muze okamzite spustit prvni cloudovou aktualizaci.

Pro QR export je potreba bud prikaz `qrencode`, nebo lokalni `npm install`, aby byl dostupny balicek
`qrcode`. Vystup je SVG soubor a neobsahuje zadne prihlasovaci udaje, pouze verejnou URL aplikace.

## Bezpecnostni omezeni

Nastavujte pouze repozitar, jehoz spravci mohou duveryhodne vydavat kod. Aktualizacni build spousti
kod z vybrane vetve a ma opravneni sestavit image a nasadit ji do konkretniho Google Cloud projektu.
Soukromy repozitar zatim podporovan neni; instalator zamerne neprenasi Git credentials do cloudu.

Automaticke aktualizace lze pozastavit:

```bash
gcloud scheduler jobs pause neurodiary-cloud-pull --location=europe-west1
```

Rucni kontrolu aktualizace lze spustit:

```bash
gcloud builds triggers run neurodiary-cloud-pull --region=europe-west1
```
