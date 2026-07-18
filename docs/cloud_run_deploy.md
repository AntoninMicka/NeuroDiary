# Cloud Run Deploy

Tento projekt ma pripraveny GitHub Actions deploy backendu do `Google Cloud Run`.

Workflow je v [deploy-cloud-run-backend.yml](/home/antonin/Projects/NeuroDiary/NeuroDiary/.github/workflows/deploy-cloud-run-backend.yml:1)
a nasazuje `backend/` pri pushi do `main` nebo rucne pres `workflow_dispatch`.

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

## Co workflow dela

1. overi GitHub job vuci Google Cloud pres OIDC
2. postavi image z `backend/Dockerfile`
3. pushne image do Artifact Registry
4. nasadi novou revizi do Cloud Run
5. preda backendu API token, DB URL a Cloud SQL connection konfiguraci
