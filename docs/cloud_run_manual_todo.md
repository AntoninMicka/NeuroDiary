# Cloud Run Manual TODO

Prakticky checklist pro rucni dokonceni nasazeni `NeuroDiary Sync API` do `Google Cloud Run`.

Pokud nechces vsechno klikat rucne, prvni cast tohohle checklistu umi automatizovat
[cloud_run_bootstrap.sh](/home/antonin/Projects/NeuroDiary/NeuroDiary/scripts/cloud_run_bootstrap.sh:1).

## 1. GitHub repo

- [ ] overit, ze projekt je pushnuty do spravneho GitHub repozitare
- [ ] overit, ze je v repu workflow [deploy-cloud-run-backend.yml](/home/antonin/Projects/NeuroDiary/NeuroDiary/.github/workflows/deploy-cloud-run-backend.yml:1)
- [ ] overit, ze deploy poběží z vetve `main`

## 2. Google Cloud projekt

- [ ] vybrat nebo vytvorit GCP projekt pro NeuroDiary
- [ ] zapsat si `PROJECT_ID`
- [ ] zapsat si cislo projektu `PROJECT_NUMBER`
- [ ] zvolit cilovy region, idealne stejny pro Cloud Run i Cloud SQL

## 3. Zapnuti API

- [ ] zapnout `run.googleapis.com`
- [ ] zapnout `sqladmin.googleapis.com`
- [ ] zapnout `artifactregistry.googleapis.com`
- [ ] zapnout `iam.googleapis.com`
- [ ] zapnout `iamcredentials.googleapis.com`
- [ ] zapnout `sts.googleapis.com`

## 4. Artifact Registry

- [ ] vytvorit Docker repository v Artifact Registry
- [ ] zapsat si jeho nazev do `GAR_REPOSITORY`

## 5. Deploy service account

- [ ] vytvorit service account pro GitHub Actions deploy
- [ ] pridelit `roles/run.admin`
- [ ] pridelit `roles/artifactregistry.writer`
- [ ] pridelit `roles/iam.serviceAccountUser`
- [ ] pokud Cloud Run poběží pod jinym runtime accountem, povolit deploy accountu i pristup k nemu

## 6. Workload Identity Federation

- [ ] vytvorit `Workload Identity Pool` pro GitHub
- [ ] vytvorit `OIDC provider` pro GitHub Actions
- [ ] povolit GitHub repozitari impersonaci deploy service accountu pres `roles/iam.workloadIdentityUser`
- [ ] zapsat si `GCP_WORKLOAD_IDENTITY_PROVIDER`
- [ ] zapsat si `GCP_DEPLOY_SERVICE_ACCOUNT`

## 7. Cloud SQL PostgreSQL

- [ ] vytvorit `Cloud SQL for PostgreSQL` instanci
- [ ] vytvorit databazi pro NeuroDiary
- [ ] vytvorit DB uzivatele
- [ ] zapsat si `INSTANCE_CONNECTION_NAME` ve formatu `PROJECT_ID:REGION:INSTANCE_ID`
- [ ] sestavit `NEURODIARY_DATABASE_URL`
- [ ] rozhodnout, jestli connection string pouzije `/cloudsql/...` socket path nebo jinou variantu podle site

## 8. GitHub repository variables

- [ ] nastavit `GCP_PROJECT_ID`
- [ ] nastavit `GCP_REGION`
- [ ] nastavit `GAR_REPOSITORY`
- [ ] nastavit `CLOUD_RUN_SERVICE`
- [ ] nastavit `GCP_WORKLOAD_IDENTITY_PROVIDER`
- [ ] nastavit `GCP_DEPLOY_SERVICE_ACCOUNT`
- [ ] nastavit `NEURODIARY_CORS_ORIGINS`
- [ ] nastavit `NEURODIARY_DEFAULT_USER_ID`
- [ ] nastavit `CLOUD_RUN_DEPLOY_FLAGS`
  doporuceny zaklad:
  `--add-cloudsql-instances=PROJECT_ID:REGION:INSTANCE_ID --min-instances=0 --max-instances=3`

## 9. GitHub repository secrets

- [ ] nastavit `NEURODIARY_API_TOKEN`
- [ ] nastavit `NEURODIARY_DATABASE_URL`

## 10. Frontend a CORS

- [ ] znat produkcni URL frontendu
- [ ] doplnit frontend URL do `NEURODIARY_CORS_ORIGINS`
- [ ] po prvnim deployi nastavit ve frontendu produkcni sync endpoint

## 11. Prvni deploy

- [ ] pripadne pripravit `scripts/cloud_run.env` podle [cloud_run.env.example](/home/antonin/Projects/NeuroDiary/NeuroDiary/scripts/cloud_run.env.example:1)
- [ ] pokud chci prvni deploy automatizovat z lokalu, spustit `bash scripts/cloud_run_bootstrap.sh`
- [ ] opsat nebo zkopirovat ze zaveru skriptu hodnoty do `GitHub -> Settings -> Secrets and variables -> Actions`
- [ ] spustit workflow rucne pres `workflow_dispatch`
- [ ] zkontrolovat, ze probehl build image
- [ ] zkontrolovat, ze probehl push do Artifact Registry
- [ ] zkontrolovat, ze vznikla nebo se aktualizovala Cloud Run sluzba

## 12. Overeni po deployi

- [ ] otevrit `/healthz`
- [ ] overit, ze vraci `status: ok`
- [ ] overit, ze vraci `storage: postgres`
- [ ] otestovat `GET /api/v1/sync/pull`
- [ ] otestovat `POST /api/v1/sync/push`
- [ ] otestovat sync mezi dvema zarizenimi

## 13. Bezpecnostni follow-up

- [ ] rozhodnout, jestli ponechat verejny endpoint s bearer tokenem, nebo pozdeji pritvrdit pristup
- [ ] oddelit testovaci a produkcni prostredi
- [ ] zalozit bezpecne ulozeni produkcnich secrets
- [ ] navazat dalsi krok: prihlaseni pres Google / Apple ID

## Poznamky

- Backend uz umi produkcni DB pres `NEURODIARY_DATABASE_URL`.
- Lokalni SQLite zustava jen jako fallback pro lokalni vyvoj.
- Souvisejici detailni dokumentace je v [cloud_run_deploy.md](/home/antonin/Projects/NeuroDiary/NeuroDiary/docs/cloud_run_deploy.md:1).
