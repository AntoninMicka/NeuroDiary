# Cloud Run Deploy

Tento projekt ma pripraveny GitHub Actions deploy backendu do `Google Cloud Run`.
Stejna Cloud Run sluzba nyni servíruje i zabaleny Vue frontend na root URL `/`.

Workflow je v [deploy-cloud-run-backend.yml](/home/antonin/Projects/NeuroDiary/NeuroDiary/.github/workflows/deploy-cloud-run-backend.yml:1)
a nasazuje `backend/` pri pushi do `main` nebo rucne pres `workflow_dispatch`.

Prakticky odskrtavaci seznam je v [cloud_run_manual_todo.md](/home/antonin/Projects/NeuroDiary/NeuroDiary/docs/cloud_run_manual_todo.md:1).
Pro prvni lokalni deploy je pripraven i skript [cloud_run_bootstrap.sh](/home/antonin/Projects/NeuroDiary/NeuroDiary/scripts/cloud_run_bootstrap.sh:1)
s ukazkovou konfiguraci v [cloud_run.env.example](/home/antonin/Projects/NeuroDiary/NeuroDiary/scripts/cloud_run.env.example:1).

## Rychly start lokalniho bootstrapu

1. zkopiruj `scripts/cloud_run.env.example` na `scripts/cloud_run.env`
2. vypln hodnoty
3. spust:

```bash
bash scripts/cloud_run_bootstrap.sh
```

Kdyz nechas nektere hodnoty prazdne, skript se na ne pri behu doptá a prida i kratkou napovedu
co ma byt za hodnotu a priklad formatu.

Pokud vyplnis i `BILLING_ACCOUNT_ID`, skript umi projekt zkontrolovat a pripadne ho pripojit
na aktivni billing account. Bez billing propojeni nepouzjes placene sluzby jako `Cloud Run`
nebo `Cloud SQL`.

Pokud zapnes `CONFIGURE_GITHUB_ACTIONS=true`, skript umi pres `gh` rovnou zapsat repository
`Variables` a `Secrets` pro GitHub Actions. Volitelne umi i spustit workflow, kdyz nastavis
`TRIGGER_GITHUB_WORKFLOW=true`.

Kdyz je projekt naklonovany z GitHubu a ma nastavene `origin`, skript se pokusi `GITHUB_REPOSITORY`
odvodit automaticky. Typicky tedy neni nutne ho vyplnovat rucne.

Pro zapis repository `Actions secrets` musi mit prihlaseny GitHub ucet admin pristup k danemu repozitari.
Skript to nově overuje a po zapisu vypise i kontrolni seznam `gh variable list` a `gh secret list`.

Skript umi:

- zapnout potrebna GCP API
- vytvorit Artifact Registry repository
- vytvorit deploy service account a IAM role
- volitelne vytvorit GitHub Workload Identity Federation
- zkontrolovat billing a volitelne pripojit projekt k billing accountu
- volitelne vytvorit Cloud SQL PostgreSQL instanci, DB a uzivatele
- postavit image pres `gcloud builds submit`
- nasadit prvni revizi do Cloud Run
- volitelne zapsat GitHub Actions `Variables` a `Secrets` pres `gh`
- volitelne spustit GitHub workflow pres `gh workflow run`
- po dokonceni vypsat i kam presne ziskane hodnoty zadat v GitHubu

Poznamka:

- `DATABASE_MODE=sqlite` je jen rychly test
- `DATABASE_MODE=postgres` je doporucena varianta pro realny sync

## Aktualni stav

Backend uz umi bezet nad `PostgreSQL` pres `NEURODIARY_DATABASE_URL`.
SQLite zustava jen jako lokalni fallback pro vyvoj.

## GitHub Variables

V repozitari nastav tyto `Repository variables`:

- `GCP_PROJECT_ID`
- `GCP_REGION`
- `GAR_REPOSITORY`
- `CLOUD_RUN_SERVICE`
- `GCP_WORKLOAD_IDENTITY_PROVIDER`
  format: `projects/PROJECT_NUMBER/locations/global/workloadIdentityPools/POOL_ID/providers/PROVIDER_ID`
- `GCP_DEPLOY_SERVICE_ACCOUNT`
  format: `service-account@project-id.iam.gserviceaccount.com`
- `NEURODIARY_CORS_ORIGINS`
  napriklad `https://neurodiary.example.com`
- `NEURODIARY_DEFAULT_USER_ID`
  docasna hodnota pro single-user rezim, napriklad `primary-user`
- `CLOUD_RUN_DEPLOY_FLAGS`
  volitelne dalsi Cloud Run flagy, napriklad
  `--add-cloudsql-instances=PROJECT_ID:REGION:INSTANCE_ID --min-instances=0 --max-instances=3`

## GitHub Secrets

V repozitari nastav:

- `NEURODIARY_API_TOKEN`
- `NEURODIARY_DATABASE_URL`

## Google Cloud Setup

Doporucena cesta je `Workload Identity Federation` z GitHub Actions, bez ukladani service account key do GitHubu.
To odpovida aktualnimu doporuceni Google Cloud IAM docs a `google-github-actions/auth`.

## Billing

Projekt musi byt propojeny s aktivnim `Cloud Billing` uctem.

Moznosti:

- rucne v Google Cloud Console
- nebo pres CLI:

```bash
gcloud billing accounts list
gcloud billing projects link PROJECT_ID --billing-account=000000-000000-000000
```

Pokud je billing k projektu uz pripojeny, overis to takto:

```bash
gcloud billing projects describe PROJECT_ID
```

Podle aktualni dokumentace Google Cloud je billing na projektu povazovany za aktivni, kdyz je projekt
propojeny s platnym aktivnim billing accountem. Prikaz `gcloud billing projects link` pripoji nebo zmeni
billing account projektu. To je inference z oficialnich prikazu `gcloud billing projects` a `link`.

### 1. Aktivuj potrebne API

```bash
gcloud services enable \
  run.googleapis.com \
  sqladmin.googleapis.com \
  artifactregistry.googleapis.com \
  iam.googleapis.com \
  iamcredentials.googleapis.com \
  sts.googleapis.com
```

### 2. Vytvor Artifact Registry repository

```bash
gcloud artifacts repositories create neurodiary \
  --repository-format=docker \
  --location=europe-west1 \
  --description="NeuroDiary containers"
```

Pak nastav `GAR_REPOSITORY=neurodiary`.

### 3. Vytvor deploy service account

```bash
gcloud iam service-accounts create neurodiary-github-deploy \
  --display-name="NeuroDiary GitHub Deploy"
```

### 4. Pridel role service accountu

Minimalni prakticky zaklad pro tento workflow:

```bash
gcloud projects add-iam-policy-binding PROJECT_ID \
  --member="serviceAccount:neurodiary-github-deploy@PROJECT_ID.iam.gserviceaccount.com" \
  --role="roles/run.admin"

gcloud projects add-iam-policy-binding PROJECT_ID \
  --member="serviceAccount:neurodiary-github-deploy@PROJECT_ID.iam.gserviceaccount.com" \
  --role="roles/artifactregistry.writer"

gcloud projects add-iam-policy-binding PROJECT_ID \
  --member="serviceAccount:neurodiary-github-deploy@PROJECT_ID.iam.gserviceaccount.com" \
  --role="roles/iam.serviceAccountUser"
```

Pokud bude Cloud Run sluzba bezet pod jinym runtime service accountem, pridej `roles/iam.serviceAccountUser`
na tento konkretni runtime account.

### 5. Vytvor Workload Identity Pool a Provider pro GitHub

Zakladni priklad:

```bash
gcloud iam workload-identity-pools create github \
  --project=PROJECT_ID \
  --location=global \
  --display-name="GitHub Actions"

gcloud iam workload-identity-pools providers create-oidc neurodiary \
  --project=PROJECT_ID \
  --location=global \
  --workload-identity-pool=github \
  --display-name="NeuroDiary GitHub" \
  --issuer-uri="https://token.actions.githubusercontent.com" \
  --attribute-mapping="google.subject=assertion.sub,attribute.actor=assertion.actor,attribute.repository=assertion.repository"
```

### 6. Povol GitHub repozitari impersonaci service accountu

Nahrad `OWNER/REPO` skutecnym GitHub repozitarem:

```bash
gcloud iam service-accounts add-iam-policy-binding \
  neurodiary-github-deploy@PROJECT_ID.iam.gserviceaccount.com \
  --project=PROJECT_ID \
  --role="roles/iam.workloadIdentityUser" \
  --member="principalSet://iam.googleapis.com/projects/PROJECT_NUMBER/locations/global/workloadIdentityPools/github/attribute.repository/OWNER/REPO"
```

Potom nastav do GitHub variable:

```text
GCP_WORKLOAD_IDENTITY_PROVIDER=projects/PROJECT_NUMBER/locations/global/workloadIdentityPools/github/providers/neurodiary
```

### 7. Vytvor Cloud SQL for PostgreSQL

Podle aktualni Google Cloud dokumentace je vhodne mit Cloud SQL ve stejnem regionu jako Cloud Run
sluzbu a pripojit instanci pres Cloud Run Cloud SQL connection. To je inference z doporuceneho setupu
v oficialnich docs pro `Connect from Cloud Run` a `Cloud SQL for PostgreSQL`.

Nastav:

- `NEURODIARY_DATABASE_URL`
- `CLOUD_RUN_DEPLOY_FLAGS=--add-cloudsql-instances=PROJECT_ID:REGION:INSTANCE_ID`

Prakticky pocitej s tim, ze pro Cloud SQL muze byt vhodne pouzit socket path `/cloudsql/...`
nebo jinou connection strategii podle konkretni instance a site. Presny format connection stringu
si doladis podle finalniho Cloud SQL network setupu.

Poznamka k Cloud SQL sizingu:

- od cervence 2026 je pro `PostgreSQL 16+` casto vychozi `Cloud SQL Enterprise Plus`
- `db-f1-micro` tam neplati
- pro levny prvni deploy je jednodussi explicitne zvolit `POSTGRES_EDITION=ENTERPRISE`
- pokud chces `ENTERPRISE_PLUS`, pouzij vhodny tier jako `db-perf-optimized-N-2`

## Co workflow dela

1. overi GitHub job vuci Google Cloud pres OIDC
2. postavi image z `backend/Dockerfile`
3. pushne image do Artifact Registry
4. nasadi novou revizi do Cloud Run
5. na root URL `/` servíruje frontend NeuroDiary
6. preda backendu API token, DB URL a Cloud SQL connection konfiguraci
