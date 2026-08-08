#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
ENV_FILE="${1:-${SCRIPT_DIR}/cloud_run.env}"
SECRETS_FILE="${SECRETS_FILE:-${HOME}/.config/neurodiary/cloud_run.secrets.env}"

if [[ -f "${ENV_FILE}" ]]; then
  # shellcheck disable=SC1090
  source "${ENV_FILE}"
else
  echo "Config file not found, continuing with prompts: ${ENV_FILE}"
  echo "Tip: keep non-sensitive config in a file like ${ENV_FILE}"
fi

if [[ -f "${SECRETS_FILE}" ]]; then
  # shellcheck disable=SC1090
  source "${SECRETS_FILE}"
fi

DEPLOY_SA_NAME="${DEPLOY_SA_NAME:-neurodiary-github-deploy}"
DEPLOY_SA_DISPLAY_NAME="${DEPLOY_SA_DISPLAY_NAME:-NeuroDiary GitHub Deploy}"
IMAGE_TAG="${IMAGE_TAG:-manual-$(date +%Y%m%d-%H%M%S)}"
WORKLOAD_IDENTITY_POOL_ID="${WORKLOAD_IDENTITY_POOL_ID:-github}"
WORKLOAD_IDENTITY_PROVIDER_ID="${WORKLOAD_IDENTITY_PROVIDER_ID:-neurodiary}"
WORKLOAD_IDENTITY_PROVIDER_DISPLAY_NAME="${WORKLOAD_IDENTITY_PROVIDER_DISPLAY_NAME:-NeuroDiary GitHub}"
GITHUB_REPOSITORY="${GITHUB_REPOSITORY:-}"
CREATE_GITHUB_WIF="${CREATE_GITHUB_WIF:-false}"
CONFIGURE_GITHUB_ACTIONS="${CONFIGURE_GITHUB_ACTIONS:-false}"
TRIGGER_GITHUB_WORKFLOW="${TRIGGER_GITHUB_WORKFLOW:-false}"
GITHUB_WORKFLOW_FILE="${GITHUB_WORKFLOW_FILE:-deploy-cloud-run-backend.yml}"
ALLOW_UNAUTHENTICATED="${ALLOW_UNAUTHENTICATED:-true}"
CLOUD_RUN_DEPLOY_FLAGS="${CLOUD_RUN_DEPLOY_FLAGS:-}"
RUNTIME_SERVICE_ACCOUNT="${RUNTIME_SERVICE_ACCOUNT:-}"
BILLING_ACCOUNT_ID="${BILLING_ACCOUNT_ID:-}"
ENABLE_GOOGLE_AUTH="${ENABLE_GOOGLE_AUTH:-true}"
ENABLE_GMAIL_SEND="${ENABLE_GMAIL_SEND:-true}"
ENABLE_WEB_ADMIN="${ENABLE_WEB_ADMIN:-true}"
NEURODIARY_ADMIN_EMAILS="${NEURODIARY_ADMIN_EMAILS:-}"
NEURODIARY_ADMIN_ALERT_EMAIL="${NEURODIARY_ADMIN_ALERT_EMAIL:-}"
NEURODIARY_GMAIL_OAUTH_VERIFIED="${NEURODIARY_GMAIL_OAUTH_VERIFIED:-false}"
NEURODIARY_MANUAL_BACKUP_LIMIT="${NEURODIARY_MANUAL_BACKUP_LIMIT:-3}"
NEURODIARY_BACKUP_RETENTION_COUNT="${NEURODIARY_BACKUP_RETENTION_COUNT:-7}"
ENABLE_APPLE_AUTH="${ENABLE_APPLE_AUTH:-false}"
ENABLE_LEGACY_API_TOKEN="${ENABLE_LEGACY_API_TOKEN:-false}"
NEURODIARY_SESSION_SECRET="${NEURODIARY_SESSION_SECRET:-}"
NEURODIARY_GOOGLE_CLIENT_ID="${NEURODIARY_GOOGLE_CLIENT_ID:-}"
NEURODIARY_APPLE_CLIENT_ID="${NEURODIARY_APPLE_CLIENT_ID:-}"
NEURODIARY_APPLE_REDIRECT_PATH="${NEURODIARY_APPLE_REDIRECT_PATH:-/auth/apple/callback}"
NEURODIARY_VAPID_PUBLIC_KEY="${NEURODIARY_VAPID_PUBLIC_KEY:-}"
NEURODIARY_VAPID_PRIVATE_KEY="${NEURODIARY_VAPID_PRIVATE_KEY:-}"
NEURODIARY_VAPID_SUBJECT="${NEURODIARY_VAPID_SUBJECT:-}"
NEURODIARY_PUSH_SCHEDULER_TOKEN="${NEURODIARY_PUSH_SCHEDULER_TOKEN:-}"
NEURODIARY_PUSH_ENDPOINT_HOSTS="${NEURODIARY_PUSH_ENDPOINT_HOSTS:-googleapis.com,mozilla.com,apple.com,windows.com,microsoft.com}"
GENERATED_SECRETS=()

function generate_random_secret() {
  if command -v openssl >/dev/null 2>&1; then
    openssl rand -base64 48 | tr -d '\n'
    return
  fi

  python3 - <<'PY'
import secrets
print(secrets.token_urlsafe(48))
PY
}

function shell_single_quote() {
  printf "%s" "$1" | sed "s/'/'\\\\''/g"
}

function persist_secret_value() {
  local var_name="$1"
  local value="${!var_name:-}"

  if [[ -z "${value}" ]]; then
    return
  fi

  mkdir -p "$(dirname "${SECRETS_FILE}")"
  touch "${SECRETS_FILE}"
  chmod 600 "${SECRETS_FILE}"

  local escaped_value
  escaped_value="$(shell_single_quote "${value}")"
  local tmp_file
  tmp_file="$(mktemp /tmp/neurodiary-secrets.XXXXXX)"

  if [[ -f "${SECRETS_FILE}" ]]; then
    grep -v "^${var_name}=" "${SECRETS_FILE}" >"${tmp_file}" || true
  fi

  printf "%s='%s'\n" "${var_name}" "${escaped_value}" >>"${tmp_file}"
  mv "${tmp_file}" "${SECRETS_FILE}"
  chmod 600 "${SECRETS_FILE}"
}

function auto_generate_secret() {
  local var_name="$1"
  local label="$2"

  if [[ -n "${!var_name:-}" ]]; then
    return
  fi

  printf -v "${var_name}" '%s' "$(generate_random_secret)"
  GENERATED_SECRETS+=("${var_name}")
  echo
  echo "Generated ${var_name} automatically for ${label}."
}

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

function ensure_base_commands() {
  local required_commands=(gcloud)
  for command in "${required_commands[@]}"; do
    if ! command -v "${command}" >/dev/null 2>&1; then
      echo "Missing required command: ${command}"
      exit 1
    fi
  done
}

function ensure_github_cli_command() {
  if [[ "${CONFIGURE_GITHUB_ACTIONS}" == "true" || "${TRIGGER_GITHUB_WORKFLOW}" == "true" ]]; then
    if ! command -v gh >/dev/null 2>&1; then
      echo "Missing required command: gh"
      echo "Install GitHub CLI or disable GitHub automation."
      exit 1
    fi
  fi
}

function detect_github_repository() {
  if [[ -n "${GITHUB_REPOSITORY}" ]]; then
    return
  fi

  if ! command -v git >/dev/null 2>&1; then
    return
  fi

  local remote_url=""
  remote_url="$(git -C "${REPO_ROOT}" remote get-url origin 2>/dev/null || true)"
  if [[ -z "${remote_url}" ]]; then
    return
  fi

  remote_url="${remote_url%.git}"
  if [[ "${remote_url}" =~ ^https://github\.com/([^/]+/[^/]+)$ ]]; then
    GITHUB_REPOSITORY="${BASH_REMATCH[1]}"
    return
  fi

  if [[ "${remote_url}" =~ ^git@github\.com:([^/]+/[^/]+)$ ]]; then
    GITHUB_REPOSITORY="${BASH_REMATCH[1]}"
  fi
}

function collect_configuration() {
  detect_github_repository

  prompt_value "GCP_PROJECT_ID" "Google Cloud project ID, kam se bude nasazovat." "my-neurodiary-prod"
  prompt_value "GCP_REGION" "Region pro Cloud Run, Artifact Registry a idealne i Cloud SQL." "europe-west1"
  prompt_value "GAR_REPOSITORY" "Nazev Docker repository v Artifact Registry." "neurodiary"
  prompt_value "CLOUD_RUN_SERVICE" "Nazev Cloud Run sluzby pro sync backend." "neurodiary-sync"
  prompt_value "IMAGE_NAME" "Nazev container image uvnitr Artifact Registry." "neurodiary-sync"
  prompt_value "NEURODIARY_CORS_ORIGINS" "Frontend URL nebo vice URL oddelenych carkou." "https://app.example.com"
  prompt_choice "DATABASE_MODE" "Zvol, jestli chces jen rychly test nebo produkcnejsi PostgreSQL variantu." "sqlite postgres"
  prompt_choice "ENABLE_GOOGLE_AUTH" "Ma skript pripravit prihlaseni pres Google ID?" "true false"
  if [[ "${ENABLE_GOOGLE_AUTH}" == "true" ]]; then
    prompt_choice "ENABLE_GMAIL_SEND" "Ma aplikace odesilat reporty primo pres Gmail API?" "true false"
  else
    ENABLE_GMAIL_SEND="false"
  fi
  prompt_choice "ENABLE_APPLE_AUTH" "Ma skript pripravit prihlaseni pres Apple ID?" "true false"
  prompt_choice "ENABLE_LEGACY_API_TOKEN" "Chces ponechat i legacy bearer token fallback?" "true false"
  prompt_choice "ENABLE_WEB_ADMIN" "Ma byt dostupna webova administrace cloudove instalace?" "true false"

  if [[ "${ENABLE_WEB_ADMIN}" == "true" ]]; then
    prompt_value "NEURODIARY_ADMIN_EMAILS" "E-maily spravcu oddelene carkou. Prihlaseni jinym uctem administraci nezobrazi." "admin@example.com"
    prompt_optional_value "NEURODIARY_ADMIN_ALERT_EMAIL" "E-mail pro provozni upozorneni." "${NEURODIARY_ADMIN_EMAILS%%,*}"
    prompt_optional_value "NEURODIARY_MANUAL_BACKUP_LIMIT" "Maximalni pocet rucnich Cloud SQL zaloh." "3"
  fi

  if [[ "${ENABLE_GMAIL_SEND}" == "true" ]]; then
    prompt_choice "NEURODIARY_GMAIL_OAUTH_VERIFIED" "Je OAuth consent pro gmail.send jiz schvaleny Googlem?" "false true"
  fi

  if [[ "${ENABLE_GOOGLE_AUTH}" == "true" || "${ENABLE_APPLE_AUTH}" == "true" ]]; then
    auto_generate_secret "NEURODIARY_SESSION_SECRET" "session auth podpis"
  fi

  if [[ "${ENABLE_GOOGLE_AUTH}" == "true" ]]; then
    prompt_value "NEURODIARY_GOOGLE_CLIENT_ID" "Google OAuth Web Client ID pro web prihlaseni. localhost neni potreba, pokud nechces testovat Google login lokalne." "123456789012-abcdefghi123456789.apps.googleusercontent.com"
  fi

  if [[ "${ENABLE_APPLE_AUTH}" == "true" ]]; then
    prompt_value "NEURODIARY_APPLE_CLIENT_ID" "Apple Services ID pro web prihlaseni." "com.neurodiary.web"
    prompt_optional_value "NEURODIARY_APPLE_REDIRECT_PATH" "Apple redirect path vuci domeně aplikace." "/auth/apple/callback"
    if [[ -z "${NEURODIARY_APPLE_REDIRECT_PATH}" ]]; then
      NEURODIARY_APPLE_REDIRECT_PATH="/auth/apple/callback"
    fi
  fi

  if [[ "${ENABLE_LEGACY_API_TOKEN}" == "true" ]]; then
    auto_generate_secret "NEURODIARY_API_TOKEN" "legacy API fallback"
  else
    NEURODIARY_API_TOKEN=""
  fi

  prompt_choice "ALLOW_UNAUTHENTICATED" "Ma byt Cloud Run endpoint verejne dostupny a chraneny jen bearer tokenem?" "true false"
  prompt_optional_value "CLOUD_RUN_DEPLOY_FLAGS" "Dalsi volitelne Cloud Run flagy." "--min-instances=0 --max-instances=3"
  prompt_optional_value "RUNTIME_SERVICE_ACCOUNT" "Volitelny runtime service account pro Cloud Run." "neurodiary-runtime@my-project.iam.gserviceaccount.com"
  if [[ "${ENABLE_WEB_ADMIN}" == "true" && -z "${RUNTIME_SERVICE_ACCOUNT}" ]]; then
    RUNTIME_SERVICE_ACCOUNT="neurodiary-runtime@${GCP_PROJECT_ID}.iam.gserviceaccount.com"
  fi
  prompt_optional_value "BILLING_ACCOUNT_ID" "Volitelny billing account pro pripojeni projektu. Pokud ho nezadas, skript billing jen zkontroluje." "000000-000000-000000"

  prompt_choice "CREATE_GITHUB_WIF" "Ma skript rovnou vytvorit Workload Identity Federation pro GitHub Actions?" "true false"
  prompt_choice "CONFIGURE_GITHUB_ACTIONS" "Ma skript po bootstrapu rovnou nastavit GitHub Actions variables a secrets pres gh?" "true false"
  if [[ "${CREATE_GITHUB_WIF}" == "true" ]]; then
    prompt_value "GITHUB_REPOSITORY" "GitHub repozitar ve tvaru owner/repository." "${GITHUB_REPOSITORY:-AntoninMicka/NeuroDiary}"
    prompt_value "WORKLOAD_IDENTITY_POOL_ID" "ID workload identity poolu." "github"
    prompt_value "WORKLOAD_IDENTITY_PROVIDER_ID" "ID provideru uvnitr poolu." "neurodiary"
  fi

  if [[ "${CONFIGURE_GITHUB_ACTIONS}" == "true" ]]; then
    prompt_value "GITHUB_REPOSITORY" "GitHub repozitar ve tvaru owner/repository pro nastaveni Actions." "${GITHUB_REPOSITORY:-AntoninMicka/NeuroDiary}"
    prompt_choice "TRIGGER_GITHUB_WORKFLOW" "Ma skript po nastaveni values rovnou spustit deploy workflow?" "true false"
    if [[ "${TRIGGER_GITHUB_WORKFLOW}" == "true" ]]; then
      prompt_optional_value "GITHUB_WORKFLOW_FILE" "Nazev workflow souboru nebo workflow name pro workflow_dispatch." "deploy-cloud-run-backend.yml"
    fi
  fi

  prompt_optional_value "DEPLOY_SA_NAME" "Nazev deploy service accountu." "neurodiary-github-deploy"

  if [[ "${DATABASE_MODE}" == "postgres" ]]; then
    prompt_choice "POSTGRES_EDITION" "Cloud SQL edition. ENTERPRISE je levnejsi a vhodna pro prvni deploy, ENTERPRISE_PLUS je vykonnejsi." "ENTERPRISE ENTERPRISE_PLUS"
    prompt_optional_value "POSTGRES_DATABASE_VERSION" "Verze PostgreSQL pro Cloud SQL." "POSTGRES_16"
    prompt_value "POSTGRES_INSTANCE_NAME" "Nazev Cloud SQL instance." "neurodiary-db"
    prompt_value "POSTGRES_DATABASE_NAME" "Nazev PostgreSQL databaze." "neurodiary"
    prompt_value "POSTGRES_USER" "Jmeno DB uzivatele aplikace." "neurodiary_app"
    auto_generate_secret "POSTGRES_PASSWORD" "Cloud SQL databazovy uzivatel"
    prompt_value "CLOUD_SQL_INSTANCE" "Cloud SQL connection name ve formatu PROJECT_ID:REGION:INSTANCE_ID." "my-neurodiary-prod:europe-west1:neurodiary-db"

    if [[ "${POSTGRES_EDITION}" == "ENTERPRISE" ]]; then
      prompt_optional_value "POSTGRES_TIER" "Velikost Cloud SQL instance pro levnejsi Enterprise variantu." "db-f1-micro"
    else
      prompt_optional_value "POSTGRES_TIER" "Velikost Cloud SQL instance pro Enterprise Plus variantu." "db-perf-optimized-N-2"
    fi

    prompt_optional_value "POSTGRES_STORAGE_GB" "Velikost disku v GB." "10"
    prompt_optional_value "POSTGRES_AVAILABILITY_TYPE" "Typ dostupnosti instance." "zonal"
    prompt_optional_value "NEURODIARY_BACKUP_RETENTION_COUNT" "Pocet automatickych zaloh, ktere ma Cloud SQL uchovavat." "7"
    prompt_optional_value "POSTGRES_INSTANCE_FLAGS" "Dalsi raw flagy pro gcloud sql instances create." "--edition=enterprise"
  fi

  persist_secret_value "NEURODIARY_SESSION_SECRET"
  persist_secret_value "NEURODIARY_API_TOKEN"
  persist_secret_value "POSTGRES_PASSWORD"
  persist_secret_value "NEURODIARY_VAPID_PRIVATE_KEY"
  persist_secret_value "NEURODIARY_PUSH_SCHEDULER_TOKEN"

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

function verify_project_access() {
  log_step "Verifying access to project ${GCP_PROJECT_ID}"

  local active_account
  active_account="$(gcloud config get-value account 2>/dev/null || true)"

  if ! gcloud projects describe "${GCP_PROJECT_ID}" >/dev/null 2>&1; then
    echo
    echo "Cannot access project ${GCP_PROJECT_ID} with account ${active_account}."
    echo
    echo "Check these things:"
    echo "  1. The project ID is correct."
    echo "  2. The project already exists in Google Cloud."
    echo "  3. The active gcloud account has access to the project."
    echo
    echo "Useful commands:"
    echo "  gcloud auth list"
    echo "  gcloud config get-value account"
    echo "  gcloud projects list"
    echo "  gcloud config set account YOUR_ACCOUNT@gmail.com"
    echo "  gcloud auth login"
    echo
    echo "If the project does not exist yet, create it first in Google Cloud Console or with:"
    echo "  gcloud projects create ${GCP_PROJECT_ID}"
    echo
    echo "Then run the script again."
    exit 1
  fi
}

function ensure_billing_link() {
  log_step "Checking Cloud Billing for project ${GCP_PROJECT_ID}"

  local billing_output
  if ! billing_output="$(gcloud billing projects describe "${GCP_PROJECT_ID}" --format='value(billingAccountName,billingEnabled)' 2>/dev/null)"; then
    echo
    echo "Cannot read billing status for project ${GCP_PROJECT_ID}."
    echo "The active account likely misses billing-related permissions."
    echo
    echo "Useful commands:"
    echo "  gcloud billing accounts list"
    echo "  gcloud billing projects describe ${GCP_PROJECT_ID}"
    echo
    echo "Common requirement:"
    echo "  access to the billing account and permission to link the project to it"
    echo
    exit 1
  fi

  local billing_enabled="False"
  billing_enabled="$(awk '{print $2}' <<<"${billing_output}")"

  if [[ "${billing_enabled}" == "True" || "${billing_enabled}" == "true" ]]; then
    echo "Billing is already enabled for ${GCP_PROJECT_ID}."
    return
  fi

  if [[ -z "${BILLING_ACCOUNT_ID}" ]]; then
    echo
    echo "Billing is not enabled for project ${GCP_PROJECT_ID}."
    echo "Provide BILLING_ACCOUNT_ID in scripts/cloud_run.env or when prompted to let the script link billing."
    echo
    echo "Useful commands:"
    echo "  gcloud billing accounts list"
    echo "  gcloud billing projects link ${GCP_PROJECT_ID} --billing-account=000000-000000-000000"
    echo
    echo "Without billing, paid resources like Cloud Run and Cloud SQL cannot be used."
    exit 1
  fi

  echo "Linking project ${GCP_PROJECT_ID} to billing account ${BILLING_ACCOUNT_ID}."
  echo "This can incur charges once resources are created."
  gcloud billing projects link "${GCP_PROJECT_ID}" --billing-account="${BILLING_ACCOUNT_ID}"
}

function ensure_github_auth() {
  if [[ "${CONFIGURE_GITHUB_ACTIONS}" != "true" && "${TRIGGER_GITHUB_WORKFLOW}" != "true" ]]; then
    return
  fi

  ensure_github_cli_command

  log_step "Checking GitHub CLI authentication"
  if ! gh auth status >/dev/null 2>&1; then
    echo
    echo "GitHub CLI is not authenticated."
    echo "Run:"
    echo "  gh auth login"
    echo
    echo "Then run the script again."
    exit 1
  fi
}

function ensure_github_repo_access() {
  if [[ "${CONFIGURE_GITHUB_ACTIONS}" != "true" && "${TRIGGER_GITHUB_WORKFLOW}" != "true" ]]; then
    return
  fi

  log_step "Checking GitHub repository access for ${GITHUB_REPOSITORY}"

  if ! gh repo view "${GITHUB_REPOSITORY}" >/dev/null 2>&1; then
    echo
    echo "Cannot access repository ${GITHUB_REPOSITORY} through GitHub CLI."
    echo
    echo "Check these things:"
    echo "  1. gh auth status"
    echo "  2. gh repo view ${GITHUB_REPOSITORY}"
    echo "  3. You are authenticated to the correct GitHub account"
    echo "  4. The account has admin access to the repository"
    echo
    echo "Repository secrets require repository admin access."
    exit 1
  fi
}

function enable_apis() {
  log_step "Enabling required APIs"
  local required_apis=(
    run.googleapis.com
    sqladmin.googleapis.com
    artifactregistry.googleapis.com
    cloudbuild.googleapis.com
    iam.googleapis.com
    iamcredentials.googleapis.com
    sts.googleapis.com
  )

  if [[ "${ENABLE_GMAIL_SEND}" == "true" ]]; then
    required_apis+=(gmail.googleapis.com)
  fi

  gcloud services enable "${required_apis[@]}"
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

function ensure_runtime_service_account() {
  if [[ -z "${RUNTIME_SERVICE_ACCOUNT}" ]]; then
    return
  fi

  local runtime_name="${RUNTIME_SERVICE_ACCOUNT%@*}"
  if ! gcloud iam service-accounts describe "${RUNTIME_SERVICE_ACCOUNT}" >/dev/null 2>&1; then
    log_step "Creating runtime service account ${RUNTIME_SERVICE_ACCOUNT}"
    gcloud iam service-accounts create "${runtime_name}" --display-name="NeuroDiary Runtime"
  fi

  if [[ "${ENABLE_WEB_ADMIN}" == "true" ]]; then
    log_step "Granting read-only cloud status and controlled backup access"
    local role
    for role in roles/run.viewer roles/cloudbuild.builds.viewer roles/cloudsql.editor; do
      gcloud projects add-iam-policy-binding "${GCP_PROJECT_ID}" \
        --member="serviceAccount:${RUNTIME_SERVICE_ACCOUNT}" \
        --role="${role}" >/dev/null
    done
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
    local postgres_database_version="${POSTGRES_DATABASE_VERSION:-POSTGRES_16}"
    local postgres_edition="${POSTGRES_EDITION:-ENTERPRISE}"
    local postgres_tier

    if [[ "${postgres_edition}" == "ENTERPRISE_PLUS" ]]; then
      postgres_tier="${POSTGRES_TIER:-db-perf-optimized-N-2}"
    else
      postgres_tier="${POSTGRES_TIER:-db-f1-micro}"
    fi

    gcloud sql instances create "${POSTGRES_INSTANCE_NAME}" \
      --database-version="${postgres_database_version}" \
      --region="${GCP_REGION}" \
      --edition="${postgres_edition}" \
      --tier="${postgres_tier}" \
      --storage-size="${POSTGRES_STORAGE_GB:-10}" \
      --availability-type="${POSTGRES_AVAILABILITY_TYPE:-zonal}" \
      ${POSTGRES_INSTANCE_FLAGS:-}
  fi

  log_step "Applying Cloud SQL automated-backup retention (${NEURODIARY_BACKUP_RETENTION_COUNT})"
  gcloud sql instances patch "${POSTGRES_INSTANCE_NAME}" \
    --backup-start-time="03:00" \
    --retained-backups-count="${NEURODIARY_BACKUP_RETENTION_COUNT}" \
    --quiet >/dev/null

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
  local cloudbuild_file
  cloudbuild_file="$(mktemp /tmp/neurodiary-cloudbuild.XXXXXX.yaml)"

  cat >"${cloudbuild_file}" <<EOF
steps:
  - name: gcr.io/cloud-builders/docker
    args:
      - build
      - -f
      - backend/Dockerfile
      - -t
      - ${IMAGE_URI}
      - .
images:
  - ${IMAGE_URI}
EOF

  gcloud builds submit "${REPO_ROOT}" --config "${cloudbuild_file}"
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

function configure_github_actions() {
  if [[ "${CONFIGURE_GITHUB_ACTIONS}" != "true" ]]; then
    return
  fi

  log_step "Configuring GitHub Actions variables and secrets for ${GITHUB_REPOSITORY}"

  local project_number
  project_number="$(gcloud projects describe "${GCP_PROJECT_ID}" --format='value(projectNumber)')"
  local provider_value

  if [[ "${CREATE_GITHUB_WIF}" == "true" ]]; then
    provider_value="projects/${project_number}/locations/global/workloadIdentityPools/${WORKLOAD_IDENTITY_POOL_ID}/providers/${WORKLOAD_IDENTITY_PROVIDER_ID}"
  else
    provider_value="${GCP_WORKLOAD_IDENTITY_PROVIDER:-}"
  fi

  gh variable set GCP_PROJECT_ID --repo "${GITHUB_REPOSITORY}" --body "${GCP_PROJECT_ID}"
  gh variable set GCP_REGION --repo "${GITHUB_REPOSITORY}" --body "${GCP_REGION}"
  gh variable set GAR_REPOSITORY --repo "${GITHUB_REPOSITORY}" --body "${GAR_REPOSITORY}"
  gh variable set CLOUD_RUN_SERVICE --repo "${GITHUB_REPOSITORY}" --body "${CLOUD_RUN_SERVICE}"
  gh variable set GCP_DEPLOY_SERVICE_ACCOUNT --repo "${GITHUB_REPOSITORY}" --body "${DEPLOY_SA_NAME}@${GCP_PROJECT_ID}.iam.gserviceaccount.com"
  gh variable set NEURODIARY_CORS_ORIGINS --repo "${GITHUB_REPOSITORY}" --body "${NEURODIARY_CORS_ORIGINS}"
  gh variable set NEURODIARY_GOOGLE_CLIENT_ID --repo "${GITHUB_REPOSITORY}" --body "${NEURODIARY_GOOGLE_CLIENT_ID}"
  gh variable set NEURODIARY_APPLE_CLIENT_ID --repo "${GITHUB_REPOSITORY}" --body "${NEURODIARY_APPLE_CLIENT_ID}"
  gh variable set NEURODIARY_APPLE_REDIRECT_PATH --repo "${GITHUB_REPOSITORY}" --body "${NEURODIARY_APPLE_REDIRECT_PATH}"
  gh variable set NEURODIARY_VAPID_PUBLIC_KEY --repo "${GITHUB_REPOSITORY}" --body "${NEURODIARY_VAPID_PUBLIC_KEY}"
  gh variable set NEURODIARY_VAPID_SUBJECT --repo "${GITHUB_REPOSITORY}" --body "${NEURODIARY_VAPID_SUBJECT}"
  gh variable set NEURODIARY_PUSH_ENDPOINT_HOSTS --repo "${GITHUB_REPOSITORY}" --body "${NEURODIARY_PUSH_ENDPOINT_HOSTS}"
  gh variable set NEURODIARY_ADMIN_EMAILS --repo "${GITHUB_REPOSITORY}" --body "${NEURODIARY_ADMIN_EMAILS}"
  gh variable set NEURODIARY_ADMIN_ALERT_EMAIL --repo "${GITHUB_REPOSITORY}" --body "${NEURODIARY_ADMIN_ALERT_EMAIL}"
  gh variable set NEURODIARY_CLOUD_SQL_INSTANCE --repo "${GITHUB_REPOSITORY}" --body "${POSTGRES_INSTANCE_NAME:-}"
  gh variable set NEURODIARY_GMAIL_SEND_ENABLED --repo "${GITHUB_REPOSITORY}" --body "${ENABLE_GMAIL_SEND}"
  gh variable set NEURODIARY_GMAIL_OAUTH_VERIFIED --repo "${GITHUB_REPOSITORY}" --body "${NEURODIARY_GMAIL_OAUTH_VERIFIED}"
  gh variable set NEURODIARY_MANUAL_BACKUP_LIMIT --repo "${GITHUB_REPOSITORY}" --body "${NEURODIARY_MANUAL_BACKUP_LIMIT}"
  gh variable set NEURODIARY_BACKUP_RETENTION_COUNT --repo "${GITHUB_REPOSITORY}" --body "${NEURODIARY_BACKUP_RETENTION_COUNT}"

  if [[ "${DATABASE_MODE}" == "postgres" ]]; then
    gh variable set CLOUD_RUN_DEPLOY_FLAGS --repo "${GITHUB_REPOSITORY}" --body "--add-cloudsql-instances=${CLOUD_SQL_INSTANCE} ${CLOUD_RUN_DEPLOY_FLAGS}"
  else
    gh variable set CLOUD_RUN_DEPLOY_FLAGS --repo "${GITHUB_REPOSITORY}" --body "${CLOUD_RUN_DEPLOY_FLAGS}"
  fi
  if [[ -n "${NEURODIARY_VAPID_PRIVATE_KEY}" ]]; then
    gh secret set NEURODIARY_VAPID_PRIVATE_KEY --repo "${GITHUB_REPOSITORY}" --app actions --body "${NEURODIARY_VAPID_PRIVATE_KEY}"
  fi
  if [[ -n "${NEURODIARY_PUSH_SCHEDULER_TOKEN}" ]]; then
    gh secret set NEURODIARY_PUSH_SCHEDULER_TOKEN --repo "${GITHUB_REPOSITORY}" --app actions --body "${NEURODIARY_PUSH_SCHEDULER_TOKEN}"
  fi

  if [[ -n "${provider_value}" ]]; then
    gh variable set GCP_WORKLOAD_IDENTITY_PROVIDER --repo "${GITHUB_REPOSITORY}" --body "${provider_value}"
  else
    echo "Skipping GCP_WORKLOAD_IDENTITY_PROVIDER because no provider value is available."
  fi

  if [[ "${ENABLE_LEGACY_API_TOKEN}" == "true" && -n "${NEURODIARY_API_TOKEN}" ]]; then
    gh secret set NEURODIARY_API_TOKEN --repo "${GITHUB_REPOSITORY}" --app actions --body "${NEURODIARY_API_TOKEN}"
  else
    echo "Skipping NEURODIARY_API_TOKEN secret because legacy token fallback is disabled."
  fi
  if [[ -n "${NEURODIARY_SESSION_SECRET}" ]]; then
    gh secret set NEURODIARY_SESSION_SECRET --repo "${GITHUB_REPOSITORY}" --app actions --body "${NEURODIARY_SESSION_SECRET}"
  fi
  if [[ "${DATABASE_MODE}" == "postgres" ]]; then
    gh secret set NEURODIARY_DATABASE_URL --repo "${GITHUB_REPOSITORY}" --app actions --body "$(build_database_url)"
  fi

  log_step "Verifying GitHub Actions configuration"
  gh variable list --repo "${GITHUB_REPOSITORY}"
  gh secret list --repo "${GITHUB_REPOSITORY}" --app actions
}

function trigger_github_workflow() {
  if [[ "${TRIGGER_GITHUB_WORKFLOW}" != "true" ]]; then
    return
  fi

  log_step "Triggering GitHub workflow ${GITHUB_WORKFLOW_FILE} for ${GITHUB_REPOSITORY}"
  gh workflow run "${GITHUB_WORKFLOW_FILE}" --repo "${GITHUB_REPOSITORY}" --ref main
}

function deploy_cloud_run() {
  local db_url
  db_url="$(build_database_url)"
  local env_vars=(
    "NEURODIARY_CORS_ORIGINS=${NEURODIARY_CORS_ORIGINS}"
    "NEURODIARY_SESSION_SECRET=${NEURODIARY_SESSION_SECRET}"
    "NEURODIARY_GOOGLE_CLIENT_ID=${NEURODIARY_GOOGLE_CLIENT_ID}"
    "NEURODIARY_APPLE_CLIENT_ID=${NEURODIARY_APPLE_CLIENT_ID}"
    "NEURODIARY_APPLE_REDIRECT_PATH=${NEURODIARY_APPLE_REDIRECT_PATH}"
    "NEURODIARY_VAPID_PUBLIC_KEY=${NEURODIARY_VAPID_PUBLIC_KEY}"
    "NEURODIARY_VAPID_PRIVATE_KEY=${NEURODIARY_VAPID_PRIVATE_KEY}"
    "NEURODIARY_VAPID_SUBJECT=${NEURODIARY_VAPID_SUBJECT}"
    "NEURODIARY_PUSH_SCHEDULER_TOKEN=${NEURODIARY_PUSH_SCHEDULER_TOKEN}"
    "NEURODIARY_ADMIN_EMAILS=${NEURODIARY_ADMIN_EMAILS}"
    "NEURODIARY_ADMIN_ALERT_EMAIL=${NEURODIARY_ADMIN_ALERT_EMAIL}"
    "NEURODIARY_GCP_PROJECT_ID=${GCP_PROJECT_ID}"
    "NEURODIARY_GCP_REGION=${GCP_REGION}"
    "NEURODIARY_CLOUD_RUN_SERVICE=${CLOUD_RUN_SERVICE}"
    "NEURODIARY_CLOUD_SQL_INSTANCE=${POSTGRES_INSTANCE_NAME:-}"
    "NEURODIARY_GMAIL_SEND_ENABLED=${ENABLE_GMAIL_SEND}"
    "NEURODIARY_GMAIL_OAUTH_VERIFIED=${NEURODIARY_GMAIL_OAUTH_VERIFIED}"
    "NEURODIARY_MANUAL_BACKUP_LIMIT=${NEURODIARY_MANUAL_BACKUP_LIMIT}"
    "NEURODIARY_BACKUP_RETENTION_COUNT=${NEURODIARY_BACKUP_RETENTION_COUNT}"
  )

  if [[ "${ENABLE_LEGACY_API_TOKEN}" == "true" && -n "${NEURODIARY_API_TOKEN}" ]]; then
    env_vars+=("NEURODIARY_API_TOKEN=${NEURODIARY_API_TOKEN}")
  fi

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
  if [[ "${CONFIGURE_GITHUB_ACTIONS}" == "true" ]]; then
    echo "  GitHub Actions values were configured automatically via gh for ${GITHUB_REPOSITORY}."
    if [[ "${TRIGGER_GITHUB_WORKFLOW}" == "true" ]]; then
      echo "  The workflow was also triggered automatically."
    fi
  else
    echo "  1. GitHub repository -> Settings -> Secrets and variables -> Actions"
    echo "  2. Open the 'Variables' tab and add the values listed below"
    echo "  3. Open the 'Secrets' tab and add the secret values listed below"
  fi
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
  echo "  NEURODIARY_GOOGLE_CLIENT_ID=${NEURODIARY_GOOGLE_CLIENT_ID:-<leave empty if Google login is disabled>}"
  echo "  NEURODIARY_APPLE_CLIENT_ID=${NEURODIARY_APPLE_CLIENT_ID:-<leave empty if Apple login is disabled>}"
  echo "  NEURODIARY_APPLE_REDIRECT_PATH=${NEURODIARY_APPLE_REDIRECT_PATH}"
  echo "  NEURODIARY_ADMIN_EMAILS=${NEURODIARY_ADMIN_EMAILS}"
  echo "  NEURODIARY_ADMIN_ALERT_EMAIL=${NEURODIARY_ADMIN_ALERT_EMAIL}"
  echo "  NEURODIARY_CLOUD_SQL_INSTANCE=${POSTGRES_INSTANCE_NAME:-}"
  echo "  NEURODIARY_GMAIL_SEND_ENABLED=${ENABLE_GMAIL_SEND}"
  echo "  NEURODIARY_GMAIL_OAUTH_VERIFIED=${NEURODIARY_GMAIL_OAUTH_VERIFIED}"
  echo "  NEURODIARY_MANUAL_BACKUP_LIMIT=${NEURODIARY_MANUAL_BACKUP_LIMIT}"
  echo "  NEURODIARY_BACKUP_RETENTION_COUNT=${NEURODIARY_BACKUP_RETENTION_COUNT}"
  echo
  echo "GitHub Actions -> Secrets"
  if [[ "${ENABLE_LEGACY_API_TOKEN}" == "true" && -n "${NEURODIARY_API_TOKEN}" ]]; then
    echo "  NEURODIARY_API_TOKEN=<same value as local config>"
  else
    echo "  NEURODIARY_API_TOKEN=<optional, disabled in this bootstrap run>"
  fi
  echo "  NEURODIARY_SESSION_SECRET=<same generated value as local config>"
  if [[ "${DATABASE_MODE}" == "postgres" ]]; then
    echo "  NEURODIARY_DATABASE_URL=$(build_database_url)"
  else
    echo "  NEURODIARY_DATABASE_URL=<leave empty until you switch to postgres>"
  fi
  echo
  echo "Local only"
  echo "  Non-sensitive config can stay in: ${ENV_FILE}"
  echo "  Sensitive values are stored in: ${SECRETS_FILE}"
  if [[ -n "${BILLING_ACCOUNT_ID}" ]]; then
    echo "  BILLING_ACCOUNT_ID=${BILLING_ACCOUNT_ID}"
  fi
  if [[ "${#GENERATED_SECRETS[@]}" -gt 0 ]]; then
    echo "  Generated secrets this run:"
    for secret_name in "${GENERATED_SECRETS[@]}"; do
      echo "    ${secret_name}=<stored in ${SECRETS_FILE}>"
    done
  fi
  echo "  Keep the secrets file out of git and rotate tokens/passwords if it leaks."
  echo
  echo "Manual follow-up"
  if [[ "${ENABLE_GMAIL_SEND}" == "true" ]]; then
    echo "  Gmail API was enabled automatically. Complete its OAuth consent configuration:"
    echo "    1. Open https://console.cloud.google.com/auth/scopes?project=${GCP_PROJECT_ID}"
    echo "    2. Add only https://www.googleapis.com/auth/gmail.send"
    echo "    3. Add test users at https://console.cloud.google.com/auth/audience?project=${GCP_PROJECT_ID}"
    echo "    4. Before public use, submit the sensitive scope for Google verification"
  fi
  if [[ "${TRIGGER_GITHUB_WORKFLOW}" == "true" ]]; then
    echo "  GitHub workflow ${GITHUB_WORKFLOW_FILE} was triggered via gh."
  else
    echo "  GitHub repository -> Actions -> 'Deploy Sync Backend to Cloud Run' -> Run workflow"
  fi
  echo "  Then verify ${cloud_run_url}/healthz"
}

ensure_base_commands
collect_configuration
ensure_base_commands
ensure_project
verify_project_access
ensure_billing_link
ensure_github_auth
ensure_github_repo_access
enable_apis
ensure_artifact_registry
ensure_runtime_service_account
ensure_deploy_service_account
ensure_workload_identity
ensure_cloud_sql
build_image
deploy_cloud_run
configure_github_actions
trigger_github_workflow
print_summary
