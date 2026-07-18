#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
ENV_FILE="${1:-${SCRIPT_DIR}/cloud_run.env}"

if [[ ! -f "${ENV_FILE}" ]]; then
  echo "Missing config file: ${ENV_FILE}"
  echo "Copy ${SCRIPT_DIR}/cloud_run.env.example to ${SCRIPT_DIR}/cloud_run.env and fill it in."
  exit 1
fi

# shellcheck disable=SC1090
source "${ENV_FILE}"

DEPLOY_SA_NAME="${DEPLOY_SA_NAME:-neurodiary-github-deploy}"
DEPLOY_SA_DISPLAY_NAME="${DEPLOY_SA_DISPLAY_NAME:-NeuroDiary GitHub Deploy}"
IMAGE_TAG="${IMAGE_TAG:-manual-$(date +%Y%m%d-%H%M%S)}"
WORKLOAD_IDENTITY_POOL_ID="${WORKLOAD_IDENTITY_POOL_ID:-github}"
WORKLOAD_IDENTITY_PROVIDER_ID="${WORKLOAD_IDENTITY_PROVIDER_ID:-neurodiary}"
WORKLOAD_IDENTITY_PROVIDER_DISPLAY_NAME="${WORKLOAD_IDENTITY_PROVIDER_DISPLAY_NAME:-NeuroDiary GitHub}"
GITHUB_REPOSITORY="${GITHUB_REPOSITORY:-}"
CREATE_GITHUB_WIF="${CREATE_GITHUB_WIF:-false}"
ALLOW_UNAUTHENTICATED="${ALLOW_UNAUTHENTICATED:-true}"
CLOUD_RUN_DEPLOY_FLAGS="${CLOUD_RUN_DEPLOY_FLAGS:-}"
RUNTIME_SERVICE_ACCOUNT="${RUNTIME_SERVICE_ACCOUNT:-}"

function prompt_value() {
  local var_name="$1"
  local help_text="$2"
  local example="$3"
  local secret="${4:-false}"
  local current_value="${!var_name:-}"

  if [[ -n "${current_value}" ]]; then
    return
  fi

  echo
  echo "Missing ${var_name}"
  echo "  ${help_text}"
  echo "  Example: ${example}"

  local value=""
  while [[ -z "${value}" ]]; do
    if [[ "${secret}" == "true" ]]; then
      read -r -s -p "${var_name}: " value
      echo
    else
      read -r -p "${var_name}: " value
    fi
  done

  printf -v "${var_name}" '%s' "${value}"
}

function prompt_optional_value() {
  local var_name="$1"
  local help_text="$2"
  local example="$3"
  local current_value="${!var_name:-}"

  if [[ -n "${current_value}" ]]; then
    return
  fi

  echo
  echo "Optional ${var_name}"
  echo "  ${help_text}"
  echo "  Example: ${example}"
  read -r -p "${var_name} (leave empty to skip): " current_value
  printf -v "${var_name}" '%s' "${current_value}"
}

function prompt_choice() {
  local var_name="$1"
  local help_text="$2"
  local options="$3"
  local current_value="${!var_name:-}"

  if [[ -n "${current_value}" ]]; then
    return
  fi

  echo
  echo "Missing ${var_name}"
  echo "  ${help_text}"
  echo "  Allowed values: ${options}"

  while true; do
    read -r -p "${var_name}: " current_value
    if [[ "${options}" == *"${current_value}"* ]]; then
      break
    fi
  done

  printf -v "${var_name}" '%s' "${current_value}"
}

function ensure_required_commands() {
  local required_commands=(gcloud)
  for command in "${required_commands[@]}"; do
    if ! command -v "${command}" >/dev/null 2>&1; then
      echo "Missing required command: ${command}"
      exit 1
    fi
  done
}

function collect_configuration() {
  prompt_value "GCP_PROJECT_ID" "Google Cloud project ID, kam se bude nasazovat." "my-neurodiary-prod"
  prompt_value "GCP_REGION" "Region pro Cloud Run, Artifact Registry a idealne i Cloud SQL." "europe-west1"
  prompt_value "GAR_REPOSITORY" "Nazev Docker repository v Artifact Registry." "neurodiary"
  prompt_value "CLOUD_RUN_SERVICE" "Nazev Cloud Run sluzby pro sync backend." "neurodiary-sync"
  prompt_value "IMAGE_NAME" "Nazev container image uvnitr Artifact Registry." "neurodiary-sync"
  prompt_value "NEURODIARY_API_TOKEN" "Dlouhy nahodny bearer token pro pristup k sync API." "vygenerovany-tajny-token" "true"
  prompt_value "NEURODIARY_CORS_ORIGINS" "Frontend URL nebo vice URL oddelenych carkou." "https://app.example.com"
  prompt_value "NEURODIARY_DEFAULT_USER_ID" "Docasny identifikator pro single-user rezim." "primary-user"
  prompt_choice "DATABASE_MODE" "Zvol, jestli chces jen rychly test nebo produkcnejsi PostgreSQL variantu." "sqlite postgres"

  prompt_choice "ALLOW_UNAUTHENTICATED" "Ma byt Cloud Run endpoint verejne dostupny a chraneny jen bearer tokenem?" "true false"
  prompt_optional_value "CLOUD_RUN_DEPLOY_FLAGS" "Dalsi volitelne Cloud Run flagy." "--min-instances=0 --max-instances=3"
  prompt_optional_value "RUNTIME_SERVICE_ACCOUNT" "Volitelny runtime service account pro Cloud Run." "neurodiary-runtime@my-project.iam.gserviceaccount.com"

  prompt_choice "CREATE_GITHUB_WIF" "Ma skript rovnou vytvorit Workload Identity Federation pro GitHub Actions?" "true false"
  if [[ "${CREATE_GITHUB_WIF}" == "true" ]]; then
    prompt_value "GITHUB_REPOSITORY" "GitHub repozitar ve tvaru owner/repository." "antonin/NeuroDiary"
    prompt_value "WORKLOAD_IDENTITY_POOL_ID" "ID workload identity poolu." "github"
    prompt_value "WORKLOAD_IDENTITY_PROVIDER_ID" "ID provideru uvnitr poolu." "neurodiary"
  fi

  prompt_optional_value "DEPLOY_SA_NAME" "Nazev deploy service accountu." "neurodiary-github-deploy"

  if [[ "${DATABASE_MODE}" == "postgres" ]]; then
    prompt_value "POSTGRES_INSTANCE_NAME" "Nazev Cloud SQL instance." "neurodiary-db"
    prompt_value "POSTGRES_DATABASE_NAME" "Nazev PostgreSQL databaze." "neurodiary"
    prompt_value "POSTGRES_USER" "Jmeno DB uzivatele aplikace." "neurodiary_app"
    prompt_value "POSTGRES_PASSWORD" "Silne heslo pro DB uzivatele." "silne-db-heslo" "true"
    prompt_value "CLOUD_SQL_INSTANCE" "Cloud SQL connection name ve formatu PROJECT_ID:REGION:INSTANCE_ID." "my-neurodiary-prod:europe-west1:neurodiary-db"
    prompt_optional_value "POSTGRES_TIER" "Velikost Cloud SQL instance." "db-f1-micro"
    prompt_optional_value "POSTGRES_STORAGE_GB" "Velikost disku v GB." "10"
    prompt_optional_value "POSTGRES_AVAILABILITY_TYPE" "Typ dostupnosti instance." "zonal"
    prompt_optional_value "POSTGRES_INSTANCE_FLAGS" "Dalsi raw flagy pro gcloud sql instances create." "--edition=enterprise"
  fi

  IMAGE_URI="${GCP_REGION}-docker.pkg.dev/${GCP_PROJECT_ID}/${GAR_REPOSITORY}/${IMAGE_NAME}:${IMAGE_TAG}"
}

function log_step() {
  echo
  echo "==> $1"
}

function ensure_project() {
  log_step "Selecting GCP project ${GCP_PROJECT_ID}"
  gcloud config set project "${GCP_PROJECT_ID}" >/dev/null
}

function enable_apis() {
  log_step "Enabling required APIs"
  gcloud services enable \
    run.googleapis.com \
    sqladmin.googleapis.com \
    artifactregistry.googleapis.com \
    cloudbuild.googleapis.com \
    iam.googleapis.com \
    iamcredentials.googleapis.com \
    sts.googleapis.com
}

function ensure_artifact_registry() {
  log_step "Ensuring Artifact Registry repository ${GAR_REPOSITORY}"
  if ! gcloud artifacts repositories describe "${GAR_REPOSITORY}" --location="${GCP_REGION}" >/dev/null 2>&1; then
    gcloud artifacts repositories create "${GAR_REPOSITORY}" \
      --repository-format=docker \
      --location="${GCP_REGION}" \
      --description="NeuroDiary containers"
  fi
}

function ensure_deploy_service_account() {
  local email="${DEPLOY_SA_NAME}@${GCP_PROJECT_ID}.iam.gserviceaccount.com"

  log_step "Ensuring deploy service account ${email}"
  if ! gcloud iam service-accounts describe "${email}" >/dev/null 2>&1; then
    gcloud iam service-accounts create "${DEPLOY_SA_NAME}" \
      --display-name="${DEPLOY_SA_DISPLAY_NAME}"
  fi

  gcloud projects add-iam-policy-binding "${GCP_PROJECT_ID}" \
    --member="serviceAccount:${email}" \
    --role="roles/run.admin" >/dev/null

  gcloud projects add-iam-policy-binding "${GCP_PROJECT_ID}" \
    --member="serviceAccount:${email}" \
    --role="roles/artifactregistry.writer" >/dev/null

  gcloud projects add-iam-policy-binding "${GCP_PROJECT_ID}" \
    --member="serviceAccount:${email}" \
    --role="roles/iam.serviceAccountUser" >/dev/null

  if [[ -n "${RUNTIME_SERVICE_ACCOUNT}" ]]; then
    gcloud iam service-accounts add-iam-policy-binding "${RUNTIME_SERVICE_ACCOUNT}" \
      --member="serviceAccount:${email}" \
      --role="roles/iam.serviceAccountUser" >/dev/null
  fi
}

function ensure_workload_identity() {
  if [[ "${CREATE_GITHUB_WIF}" != "true" ]]; then
    return
  fi

  if [[ -z "${GITHUB_REPOSITORY}" ]]; then
    echo "CREATE_GITHUB_WIF=true requires GITHUB_REPOSITORY=owner/repo"
    exit 1
  fi

  local project_number
  project_number="$(gcloud projects describe "${GCP_PROJECT_ID}" --format='value(projectNumber)')"
  local deploy_sa_email="${DEPLOY_SA_NAME}@${GCP_PROJECT_ID}.iam.gserviceaccount.com"

  log_step "Ensuring Workload Identity pool ${WORKLOAD_IDENTITY_POOL_ID}"
  if ! gcloud iam workload-identity-pools describe "${WORKLOAD_IDENTITY_POOL_ID}" --location="global" >/dev/null 2>&1; then
    gcloud iam workload-identity-pools create "${WORKLOAD_IDENTITY_POOL_ID}" \
      --location="global" \
      --display-name="GitHub Actions"
  fi

  log_step "Ensuring Workload Identity provider ${WORKLOAD_IDENTITY_PROVIDER_ID}"
  if ! gcloud iam workload-identity-pools providers describe "${WORKLOAD_IDENTITY_PROVIDER_ID}" \
    --location="global" \
    --workload-identity-pool="${WORKLOAD_IDENTITY_POOL_ID}" >/dev/null 2>&1; then
    gcloud iam workload-identity-pools providers create-oidc "${WORKLOAD_IDENTITY_PROVIDER_ID}" \
      --location="global" \
      --workload-identity-pool="${WORKLOAD_IDENTITY_POOL_ID}" \
      --display-name="${WORKLOAD_IDENTITY_PROVIDER_DISPLAY_NAME}" \
      --issuer-uri="https://token.actions.githubusercontent.com" \
      --attribute-mapping="google.subject=assertion.sub,attribute.actor=assertion.actor,attribute.repository=assertion.repository" \
      --attribute-condition="assertion.repository=='${GITHUB_REPOSITORY}'"
  fi

  log_step "Allowing GitHub repository ${GITHUB_REPOSITORY} to impersonate ${deploy_sa_email}"
  gcloud iam service-accounts add-iam-policy-binding "${deploy_sa_email}" \
    --role="roles/iam.workloadIdentityUser" \
    --member="principalSet://iam.googleapis.com/projects/${project_number}/locations/global/workloadIdentityPools/${WORKLOAD_IDENTITY_POOL_ID}/attribute.repository/${GITHUB_REPOSITORY}" >/dev/null
}

function ensure_cloud_sql() {
  if [[ "${DATABASE_MODE}" != "postgres" ]]; then
    return
  fi

  log_step "Ensuring Cloud SQL instance ${POSTGRES_INSTANCE_NAME}"
  if ! gcloud sql instances describe "${POSTGRES_INSTANCE_NAME}" >/dev/null 2>&1; then
    gcloud sql instances create "${POSTGRES_INSTANCE_NAME}" \
      --database-version="POSTGRES_16" \
      --region="${GCP_REGION}" \
      --tier="${POSTGRES_TIER:-db-f1-micro}" \
      --storage-size="${POSTGRES_STORAGE_GB:-10}" \
      --availability-type="${POSTGRES_AVAILABILITY_TYPE:-zonal}" \
      ${POSTGRES_INSTANCE_FLAGS:-}
  fi

  log_step "Ensuring Cloud SQL database ${POSTGRES_DATABASE_NAME}"
  if ! gcloud sql databases describe "${POSTGRES_DATABASE_NAME}" --instance="${POSTGRES_INSTANCE_NAME}" >/dev/null 2>&1; then
    gcloud sql databases create "${POSTGRES_DATABASE_NAME}" --instance="${POSTGRES_INSTANCE_NAME}"
  fi

  log_step "Ensuring Cloud SQL user ${POSTGRES_USER}"
  if ! gcloud sql users list --instance="${POSTGRES_INSTANCE_NAME}" --format='value(name)' | grep -Fxq "${POSTGRES_USER}"; then
    gcloud sql users create "${POSTGRES_USER}" \
      --instance="${POSTGRES_INSTANCE_NAME}" \
      --password="${POSTGRES_PASSWORD}"
  else
    gcloud sql users set-password "${POSTGRES_USER}" \
      --instance="${POSTGRES_INSTANCE_NAME}" \
      --password="${POSTGRES_PASSWORD}" >/dev/null
  fi
}

function build_image() {
  log_step "Configuring Docker authentication for Artifact Registry"
  gcloud auth configure-docker "${GCP_REGION}-docker.pkg.dev" --quiet >/dev/null

  log_step "Building and pushing container image ${IMAGE_URI}"
  gcloud builds submit "${REPO_ROOT}" --tag "${IMAGE_URI}"
}

function build_database_url() {
  if [[ "${DATABASE_MODE}" == "sqlite" ]]; then
    echo ""
    return
  fi

  printf 'postgresql://%s:%s@/%s?host=/cloudsql/%s' \
    "${POSTGRES_USER}" \
    "${POSTGRES_PASSWORD}" \
    "${POSTGRES_DATABASE_NAME}" \
    "${CLOUD_SQL_INSTANCE}"
}

function deploy_cloud_run() {
  local db_url
  db_url="$(build_database_url)"
  local env_vars=(
    "NEURODIARY_API_TOKEN=${NEURODIARY_API_TOKEN}"
    "NEURODIARY_CORS_ORIGINS=${NEURODIARY_CORS_ORIGINS}"
    "NEURODIARY_DEFAULT_USER_ID=${NEURODIARY_DEFAULT_USER_ID}"
  )

  if [[ -n "${db_url}" ]]; then
    env_vars+=("NEURODIARY_DATABASE_URL=${db_url}")
  fi

  log_step "Deploying Cloud Run service ${CLOUD_RUN_SERVICE}"
  local deploy_args=(
    run
    deploy
    "${CLOUD_RUN_SERVICE}"
    "--image=${IMAGE_URI}"
    "--region=${GCP_REGION}"
    "--platform=managed"
    "--port=8080"
    "--set-env-vars=$(IFS=,; echo "${env_vars[*]}")"
  )

  if [[ "${ALLOW_UNAUTHENTICATED}" == "true" ]]; then
    deploy_args+=("--allow-unauthenticated")
  else
    deploy_args+=("--no-allow-unauthenticated")
  fi

  if [[ -n "${RUNTIME_SERVICE_ACCOUNT}" ]]; then
    deploy_args+=("--service-account=${RUNTIME_SERVICE_ACCOUNT}")
  fi

  if [[ "${DATABASE_MODE}" == "postgres" ]]; then
    deploy_args+=("--add-cloudsql-instances=${CLOUD_SQL_INSTANCE}")
  else
    echo "Warning: deploying in sqlite mode. This is suitable only for temporary testing."
  fi

  if [[ -n "${CLOUD_RUN_DEPLOY_FLAGS}" ]]; then
    # Intentionally split additional flags on spaces for simple local overrides.
    # shellcheck disable=SC2206
    local extra_flags=( ${CLOUD_RUN_DEPLOY_FLAGS} )
    deploy_args+=("${extra_flags[@]}")
  fi

  gcloud "${deploy_args[@]}"
}

function print_summary() {
  local project_number
  project_number="$(gcloud projects describe "${GCP_PROJECT_ID}" --format='value(projectNumber)')"
  local cloud_run_url
  cloud_run_url="$(gcloud run services describe "${CLOUD_RUN_SERVICE}" --region="${GCP_REGION}" --format='value(status.url)')"
  local deploy_service_account
  deploy_service_account="${DEPLOY_SA_NAME}@${GCP_PROJECT_ID}.iam.gserviceaccount.com"

  echo
  echo "Done."
  echo
  echo "Cloud Run URL: ${cloud_run_url}"
  echo "Healthcheck: ${cloud_run_url}/healthz"
  echo
  echo "Where to put the values next:"
  echo "  1. GitHub repository -> Settings -> Secrets and variables -> Actions"
  echo "  2. Open the 'Variables' tab and add the values listed below"
  echo "  3. Open the 'Secrets' tab and add the secret values listed below"
  echo "  4. Keep scripts/cloud_run.env only on your machine and do not commit it"
  echo
  echo "GitHub Actions -> Variables"
  echo "  GCP_PROJECT_ID=${GCP_PROJECT_ID}"
  echo "  GCP_REGION=${GCP_REGION}"
  echo "  GAR_REPOSITORY=${GAR_REPOSITORY}"
  echo "  CLOUD_RUN_SERVICE=${CLOUD_RUN_SERVICE}"
  echo "  GCP_DEPLOY_SERVICE_ACCOUNT=${deploy_service_account}"
  if [[ "${CREATE_GITHUB_WIF}" == "true" ]]; then
    echo "  GCP_WORKLOAD_IDENTITY_PROVIDER=projects/${project_number}/locations/global/workloadIdentityPools/${WORKLOAD_IDENTITY_POOL_ID}/providers/${WORKLOAD_IDENTITY_PROVIDER_ID}"
  else
    echo "  GCP_WORKLOAD_IDENTITY_PROVIDER=<fill after you create or inspect the provider>"
  fi
  if [[ "${DATABASE_MODE}" == "postgres" ]]; then
    echo "  CLOUD_RUN_DEPLOY_FLAGS=--add-cloudsql-instances=${CLOUD_SQL_INSTANCE} ${CLOUD_RUN_DEPLOY_FLAGS}"
  else
    echo "  CLOUD_RUN_DEPLOY_FLAGS=${CLOUD_RUN_DEPLOY_FLAGS}"
  fi
  echo "  NEURODIARY_CORS_ORIGINS=${NEURODIARY_CORS_ORIGINS}"
  echo "  NEURODIARY_DEFAULT_USER_ID=${NEURODIARY_DEFAULT_USER_ID}"
  echo
  echo "GitHub Actions -> Secrets"
  echo "  NEURODIARY_API_TOKEN=<same value as local config>"
  if [[ "${DATABASE_MODE}" == "postgres" ]]; then
    echo "  NEURODIARY_DATABASE_URL=$(build_database_url)"
  else
    echo "  NEURODIARY_DATABASE_URL=<leave empty until you switch to postgres>"
  fi
  echo
  echo "Local only"
  echo "  scripts/cloud_run.env contains the same values for your local bootstrap run."
  echo "  Keep this file out of git and rotate tokens/passwords if it leaks."
  echo
  echo "Manual follow-up"
  echo "  GitHub repository -> Actions -> 'Deploy Sync Backend to Cloud Run' -> Run workflow"
  echo "  Then verify ${cloud_run_url}/healthz"
}

ensure_required_commands
collect_configuration
ensure_project
enable_apis
ensure_artifact_registry
ensure_deploy_service_account
ensure_workload_identity
ensure_cloud_sql
build_image
deploy_cloud_run
print_summary
