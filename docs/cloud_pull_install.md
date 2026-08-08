# Nezavisla instalace s aktualizacemi z Gitu

Rezim `cloud pull` je urceny spravcum, kteri chteji provozovat vlastni NeuroDiary instanci bez
GitHub Actions, GitHub App, webhooku a secrets ulozenych v GitHubu. Git repozitar je pouze verejny
zdroj kodu pro cteni.

## Jak aktualizace funguje

1. Cloud Scheduler podle cron rozvrhu spusti manualni Cloud Build trigger.
2. Build provede anonymni, castecny `git clone` pouze z nakonfigurovane HTTPS adresy a vetve.
3. Commit porovna s verzi aktivni Cloud Run revize.
4. Pokud se commit nezmenil, build skonci bez sestaveni a nasazeni.
5. Pri zmene spusti frontendove i backendove testy a teprve potom sestavi image.
6. Novou Cloud Run revizi nasadi s nulovym produkcnim provozem a docasnym tagem `overeni`.
7. Pres samostatnou URL overi endpointy `/readyz` a `/healthz`.
8. Provoz prevede na novou revizi az po uspechu; pri selhani produkcni kontroly vrati 100 % provozu
   predchozi revizi.

Aktualizace zachovava runtime konfiguraci existujici Cloud Run sluzby, vcetne environment variables,
Cloud SQL napojeni a runtime service accountu.

Neuspesne testy, build nebo kontrola kandidata nemeni aktivni produkcni revizi. Kandidat zustava bez
provozu pro diagnostiku a nasledujici planovana kontrola muze stejny commit zkusit znovu.

Git checkout pouziva `--depth=1`, `--single-branch`, `--no-tags` a `--filter=blob:none`. Obsahuje tedy
HEAD zvolene vetve a nanejvys tri samostatne dotazene release tagy serazene podle verze nazvu. Release
tagy se predpokladaji na zvolene hlavni vetvi; ostatni vetve ani historie se nestahuji. Limit lze snizit
pres `UPDATE_GIT_TAG_LIMIT` az na nulu. Cloud Build po dokonceni smaze cely docasny build environment.

Instalator navic na vybrany Artifact Registry repository nastavi cleanup policy omezenou na package
`IMAGE_NAME`: vsechny verze jsou kandidaty ke smazani, ale tri nejnovejsi image zustanou zachovane.
Artifact Registry aplikuje uklid na pozadi, takze uvolneni mista nemusi byt okamzite.

## Spusteni

```bash
cp scripts/cloud_pull.env.example scripts/cloud_pull.env
bash scripts/cloud_pull_install.sh scripts/cloud_pull.env
```

Pokud je nastavené `CLOUD_SQL_INSTANCE`, aktualizátor před nasazením nové revize
vytvoří Cloud SQL zálohu. Uchovává nejvýše tři vlastní zálohy s popisem
`NeuroDiary pre-update`; jiné ruční zálohy nemaže. Nová revize nejprve proběhne
bez provozu, provede dopřednou inicializaci schématu a provoz převezme až po
úspěšných kontrolách `/readyz` a `/healthz`.

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

## Sprava container images

Interaktivni spravu lze otevrit na konci instalace nebo samostatne:

```bash
bash scripts/cloud_pull_images.sh scripts/cloud_pull.env
```

Spravce muze:

- vypsat digesty, tagy, cas vytvoreni a velikost dostupnych image,
- poznat image pouzivany aktivni Cloud Run revizi,
- provest rollback na jednu ze zachovanych verzi,
- smazat konkretni neaktivni image a jeji tagy,
- zobrazit cleanup policy a stav aktualizacniho Scheduler jobu,
- pozastavit nebo obnovit automaticke aktualizace.

Rollback nejprve pozastavi Scheduler, aby se zvolena verze pri dalsi automaticke kontrole neprepsala.
Rucni mazani aktivniho digestu skript odmitne. Mazani jine verze vyzaduje samostatne potvrzeni a je
nevratne; obnova je mozna jen novym sestavenim stejneho Git commitu.
