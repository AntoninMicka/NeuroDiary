#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
ENV_FILE="${1:-${SCRIPT_DIR}/cloud_pull.env}"

if [[ -f "${ENV_FILE}" ]]; then
  # shellcheck disable=SC1090
  source "${ENV_FILE}"
fi

GCP_PROJECT_ID="${GCP_PROJECT_ID:-}"
GCP_REGION="${GCP_REGION:-europe-west1}"
CLOUD_RUN_SERVICE="${CLOUD_RUN_SERVICE:-neurodiary-sync}"
GAR_REPOSITORY="${GAR_REPOSITORY:-neurodiary}"
IMAGE_NAME="${IMAGE_NAME:-neurodiary-sync}"
UPDATE_GIT_REPOSITORY="${UPDATE_GIT_REPOSITORY:-https://github.com/AntoninMicka/NeuroDiary.git}"
UPDATE_GIT_BRANCH="${UPDATE_GIT_BRANCH:-main}"
UPDATE_GIT_TAG_LIMIT="${UPDATE_GIT_TAG_LIMIT:-3}"
UPDATE_SCHEDULE="${UPDATE_SCHEDULE:-17 3 * * *}"
UPDATE_TIME_ZONE="${UPDATE_TIME_ZONE:-Europe/Prague}"
UPDATE_TRIGGER_NAME="${UPDATE_TRIGGER_NAME:-neurodiary-cloud-pull}"
UPDATE_SCHEDULER_JOB="${UPDATE_SCHEDULER_JOB:-neurodiary-cloud-pull}"
UPDATE_SERVICE_ACCOUNT_NAME="${UPDATE_SERVICE_ACCOUNT_NAME:-neurodiary-cloud-updater}"

prompt_value() {
  local variable_name="$1"
  local prompt="$2"
  local current_value="${!variable_name:-}"
  local value=""
  read -r -p "${prompt} [${current_value}]: " value
  printf -v "${variable_name}" '%s' "${value:-${current_value}}"
}

prompt_yes_no() {
  local prompt="$1"
  local default_value="${2:-y}"
  local answer=""
  read -r -p "${prompt} [${default_value}]: " answer
  answer="${answer:-${default_value}}"
  [[ "${answer}" =~ ^[YyAa]$ ]]
}

require_command() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Missing required command: $1"
    exit 1
  fi
}

validate_configuration() {
  [[ "${UPDATE_GIT_REPOSITORY}" =~ ^https:// ]] || {
    echo "UPDATE_GIT_REPOSITORY must be a public HTTPS Git URL."
    exit 1
  }
  [[ "${UPDATE_GIT_BRANCH}" =~ ^[A-Za-z0-9._/-]+$ ]] || {
    echo "UPDATE_GIT_BRANCH contains unsupported characters."
    exit 1
  }
  [[ "${UPDATE_GIT_TAG_LIMIT}" =~ ^[0-3]$ ]] || {
    echo "UPDATE_GIT_TAG_LIMIT must be between 0 and 3."
    exit 1
  }
  [[ "${CLOUD_RUN_SERVICE}" =~ ^[a-z][a-z0-9-]{0,62}$ ]] || {
    echo "Invalid Cloud Run service name: ${CLOUD_RUN_SERVICE}"
    exit 1
  }
}

select_installation() {
  echo
  echo "Existing Cloud Run services in ${GCP_PROJECT_ID}/${GCP_REGION}:"
  local services
  services="$(gcloud run services list --region="${GCP_REGION}" --format='value(metadata.name,status.url)' 2>/dev/null || true)"
  if [[ -n "${services}" ]]; then
    echo "${services}"
  else
    echo "  No Cloud Run service found."
  fi

  prompt_value "CLOUD_RUN_SERVICE" "Cloud Run service to manage"
  if gcloud run services describe "${CLOUD_RUN_SERVICE}" --region="${GCP_REGION}" >/dev/null 2>&1; then
    local existing_url
    existing_url="$(gcloud run services describe "${CLOUD_RUN_SERVICE}" --region="${GCP_REGION}" --format='value(status.url)')"
    echo "Detected NeuroDiary candidate: ${CLOUD_RUN_SERVICE}"
    echo "URL: ${existing_url}"
    if prompt_yes_no "Only inspect/export this installation and exit?" "n"; then
      export_qr "${existing_url}"
      exit 0
    fi
    return
  fi

  echo "Service ${CLOUD_RUN_SERVICE} does not exist."
  if prompt_yes_no "Run the standard NeuroDiary bootstrap first?" "y"; then
    local bootstrap_env="${STANDARD_BOOTSTRAP_ENV:-${SCRIPT_DIR}/cloud_run.env}"
    bash "${SCRIPT_DIR}/cloud_run_bootstrap.sh" "${bootstrap_env}"
  else
    echo "Create the service first, then run this installer again."
    exit 1
  fi
}

ensure_service_account() {
  local updater_email="$1"
  if ! gcloud iam service-accounts describe "${updater_email}" >/dev/null 2>&1; then
    gcloud iam service-accounts create "${UPDATE_SERVICE_ACCOUNT_NAME}" \
      --display-name="NeuroDiary Cloud Pull Updater"
  fi

  local roles=(
    roles/artifactregistry.writer
    roles/cloudbuild.builds.editor
    roles/logging.logWriter
    roles/run.admin
    roles/serviceusage.serviceUsageConsumer
  )
  for role in "${roles[@]}"; do
    gcloud projects add-iam-policy-binding "${GCP_PROJECT_ID}" \
      --member="serviceAccount:${updater_email}" \
      --role="${role}" \
      --condition=None \
      --quiet >/dev/null
  done

  local runtime_email
  runtime_email="$(gcloud run services describe "${CLOUD_RUN_SERVICE}" --region="${GCP_REGION}" --format='value(spec.template.spec.serviceAccountName)')"
  if [[ -n "${runtime_email}" ]]; then
    gcloud iam service-accounts add-iam-policy-binding "${runtime_email}" \
      --member="serviceAccount:${updater_email}" \
      --role="roles/iam.serviceAccountUser" \
      --quiet >/dev/null
  fi
}

ensure_update_trigger() {
  local updater_email="$1"
  local image_uri="${GCP_REGION}-docker.pkg.dev/${GCP_PROJECT_ID}/${GAR_REPOSITORY}/${IMAGE_NAME}"
  local substitutions="_GIT_REPOSITORY=${UPDATE_GIT_REPOSITORY},_GIT_BRANCH=${UPDATE_GIT_BRANCH},_GIT_TAG_LIMIT=${UPDATE_GIT_TAG_LIMIT},_GCP_REGION=${GCP_REGION},_CLOUD_RUN_SERVICE=${CLOUD_RUN_SERVICE},_IMAGE_URI=${image_uri}"
  local service_account_resource="projects/${GCP_PROJECT_ID}/serviceAccounts/${updater_email}"

  if gcloud builds triggers describe "${UPDATE_TRIGGER_NAME}" --region="${GCP_REGION}" >/dev/null 2>&1; then
    gcloud builds triggers update manual "${UPDATE_TRIGGER_NAME}" \
      --region="${GCP_REGION}" \
      --inline-config="${SCRIPT_DIR}/cloud_pull_update.yaml" \
      --service-account="${service_account_resource}" \
      --update-substitutions="${substitutions}" \
      --no-require-approval
  else
    gcloud builds triggers create manual \
      --name="${UPDATE_TRIGGER_NAME}" \
      --region="${GCP_REGION}" \
      --inline-config="${SCRIPT_DIR}/cloud_pull_update.yaml" \
      --service-account="${service_account_resource}" \
      --substitutions="${substitutions}" \
      --no-require-approval
  fi
}

ensure_artifact_cleanup() {
  local policy_file
  policy_file="$(mktemp /tmp/neurodiary-cleanup-policy.XXXXXX.json)"
  sed "s/__IMAGE_NAME__/${IMAGE_NAME}/g" "${SCRIPT_DIR}/cloud_pull_cleanup_policy.json" >"${policy_file}"
  gcloud artifacts repositories set-cleanup-policies "${GAR_REPOSITORY}" \
    --location="${GCP_REGION}" \
    --policy="${policy_file}" \
    --no-dry-run
  rm -f "${policy_file}"
}

ensure_scheduler() {
  local updater_email="$1"
  local trigger_id
  trigger_id="$(gcloud builds triggers describe "${UPDATE_TRIGGER_NAME}" --region="${GCP_REGION}" --format='value(id)')"
  local trigger_uri="https://cloudbuild.googleapis.com/v1/projects/${GCP_PROJECT_ID}/locations/${GCP_REGION}/triggers/${trigger_id}:run"

  if gcloud scheduler jobs describe "${UPDATE_SCHEDULER_JOB}" --location="${GCP_REGION}" >/dev/null 2>&1; then
    gcloud scheduler jobs update http "${UPDATE_SCHEDULER_JOB}" \
      --location="${GCP_REGION}" \
      --schedule="${UPDATE_SCHEDULE}" \
      --time-zone="${UPDATE_TIME_ZONE}" \
      --uri="${trigger_uri}" \
      --http-method=POST \
      --oauth-service-account-email="${updater_email}" \
      --oauth-token-scope="https://www.googleapis.com/auth/cloud-platform" \
      --headers="Content-Type=application/json" \
      --message-body='{}'
  else
    gcloud scheduler jobs create http "${UPDATE_SCHEDULER_JOB}" \
      --location="${GCP_REGION}" \
      --schedule="${UPDATE_SCHEDULE}" \
      --time-zone="${UPDATE_TIME_ZONE}" \
      --uri="${trigger_uri}" \
      --http-method=POST \
      --oauth-service-account-email="${updater_email}" \
      --oauth-token-scope="https://www.googleapis.com/auth/cloud-platform" \
      --headers="Content-Type=application/json" \
      --message-body='{}'
  fi
}

export_qr() {
  local service_url="$1"
  if ! prompt_yes_no "Export service URL as QR code?" "y"; then
    return
  fi
  local qr_path="${QR_OUTPUT_PATH:-${REPO_ROOT}/neurodiary-installation-qr.svg}"
  prompt_value "qr_path" "QR output path"
  if command -v qrencode >/dev/null 2>&1; then
    qrencode -t SVG -o "${qr_path}" "${service_url}"
    echo "QR code saved to ${qr_path}"
  elif command -v node >/dev/null 2>&1 && [[ -d "${REPO_ROOT}/node_modules/qrcode" ]]; then
    node "${SCRIPT_DIR}/generate_installation_qr.mjs" "${service_url}" "${qr_path}"
  else
    echo "QR export skipped: install qrencode, or run npm install in ${REPO_ROOT}."
  fi
}

main() {
  require_command gcloud
  prompt_value "GCP_PROJECT_ID" "Google Cloud project ID"
  prompt_value "GCP_REGION" "Google Cloud region"
  gcloud config set project "${GCP_PROJECT_ID}" >/dev/null
  select_installation
  prompt_value "GAR_REPOSITORY" "Artifact Registry repository"
  prompt_value "IMAGE_NAME" "Container image name"
  prompt_value "UPDATE_GIT_REPOSITORY" "Public HTTPS Git repository"
  prompt_value "UPDATE_GIT_BRANCH" "Git branch"
  prompt_value "UPDATE_GIT_TAG_LIMIT" "Maximum recent release tags to fetch (0-3)"
  prompt_value "UPDATE_SCHEDULE" "Update schedule (cron)"
  prompt_value "UPDATE_TIME_ZONE" "Schedule time zone"
  validate_configuration

  gcloud services enable \
    artifactregistry.googleapis.com \
    cloudbuild.googleapis.com \
    cloudscheduler.googleapis.com \
    iam.googleapis.com \
    run.googleapis.com

  local updater_email="${UPDATE_SERVICE_ACCOUNT_NAME}@${GCP_PROJECT_ID}.iam.gserviceaccount.com"
  ensure_service_account "${updater_email}"
  ensure_artifact_cleanup
  ensure_update_trigger "${updater_email}"
  ensure_scheduler "${updater_email}"

  local service_url
  service_url="$(gcloud run services describe "${CLOUD_RUN_SERVICE}" --region="${GCP_REGION}" --format='value(status.url)')"
  echo
  echo "NeuroDiary installation: ${CLOUD_RUN_SERVICE}"
  echo "URL: ${service_url}"
  echo "Source: ${UPDATE_GIT_REPOSITORY} (${UPDATE_GIT_BRANCH})"
  echo "Git checkout: branch HEAD plus at most ${UPDATE_GIT_TAG_LIMIT} release tags; no other history"
  echo "Artifact Registry retention: latest 3 ${IMAGE_NAME} image versions"
  echo "Updates: ${UPDATE_SCHEDULE} ${UPDATE_TIME_ZONE}"
  export_qr "${service_url}"

  if prompt_yes_no "Run the first cloud update now?" "y"; then
    gcloud builds triggers run "${UPDATE_TRIGGER_NAME}" --region="${GCP_REGION}"
  fi
  if prompt_yes_no "Open interactive image management?" "n"; then
    bash "${SCRIPT_DIR}/cloud_pull_images.sh" "${ENV_FILE}"
  fi
}

main "$@"
