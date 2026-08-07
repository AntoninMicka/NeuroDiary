#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
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
UPDATE_SCHEDULER_JOB="${UPDATE_SCHEDULER_JOB:-neurodiary-cloud-pull}"
IMAGE_PATH=""
ACTIVE_DIGEST=""
IMAGE_DIGESTS=()

prompt_value() {
  local variable_name="$1"
  local prompt="$2"
  local current_value="${!variable_name:-}"
  local value=""
  read -r -p "${prompt} [${current_value}]: " value
  printf -v "${variable_name}" '%s' "${value:-${current_value}}"
}

confirm() {
  local prompt="$1"
  local answer=""
  read -r -p "${prompt} [y/N]: " answer
  [[ "${answer}" =~ ^[YyAa]$ ]]
}

load_active_digest() {
  local revision
  revision="$(gcloud run services describe "${CLOUD_RUN_SERVICE}" \
    --region="${GCP_REGION}" \
    --format='value(status.latestReadyRevisionName)')"
  ACTIVE_DIGEST="$(gcloud run revisions describe "${revision}" \
    --region="${GCP_REGION}" \
    --format='value(status.imageDigest)' 2>/dev/null || true)"
  ACTIVE_DIGEST="${ACTIVE_DIGEST##*@}"
}

list_images() {
  load_active_digest
  mapfile -t IMAGE_DIGESTS < <(
    gcloud artifacts docker images list "${IMAGE_PATH}" \
      --sort-by='~UPDATE_TIME' \
      --limit=20 \
      --format='value(version)'
  )

  echo
  echo "Image: ${IMAGE_PATH}"
  echo "Active digest: ${ACTIVE_DIGEST:-unknown}"
  echo "Cleanup policy keeps the latest three versions; cleanup runs asynchronously."
  echo
  gcloud artifacts docker images list "${IMAGE_PATH}" \
    --include-tags \
    --sort-by='~UPDATE_TIME' \
    --limit=20 \
    --format='table(version:label=DIGEST,updateTime:label=UPDATED,imageSizeBytes:label=SIZE_BYTES,tags.list():label=TAGS)'
}

choose_digest() {
  local choice=""
  if [[ "${#IMAGE_DIGESTS[@]}" -eq 0 ]]; then
    echo "No image versions found."
    return 1
  fi
  echo >&2
  local index
  for index in "${!IMAGE_DIGESTS[@]}"; do
    echo "  $((index + 1)). ${IMAGE_DIGESTS[index]}" >&2
  done
  read -r -p "Select version number: " choice
  [[ "${choice}" =~ ^[0-9]+$ ]] || return 1
  (( choice >= 1 && choice <= ${#IMAGE_DIGESTS[@]} )) || return 1
  printf '%s' "${IMAGE_DIGESTS[choice - 1]}"
}

rollback_image() {
  local digest
  digest="$(choose_digest)" || {
    echo "Invalid selection."
    return
  }
  [[ "${digest}" == "${ACTIVE_DIGEST}" ]] && {
    echo "This version is already active."
    return
  }
  confirm "Deploy ${digest} and pause automatic updates?" || return
  gcloud scheduler jobs pause "${UPDATE_SCHEDULER_JOB}" --location="${GCP_REGION}" >/dev/null
  gcloud run deploy "${CLOUD_RUN_SERVICE}" \
    --image="${IMAGE_PATH}@${digest}" \
    --region="${GCP_REGION}" \
    --platform=managed \
    --update-env-vars="NEURODIARY_VERSION=rollback-${digest#sha256:}" \
    --update-labels="neurodiary-source-sha=rollback-${digest:7:12}"
  echo "Rollback deployed. Scheduled updates are paused until you resume them."
}

delete_image() {
  local digest
  digest="$(choose_digest)" || {
    echo "Invalid selection."
    return
  }
  if [[ "${digest}" == "${ACTIVE_DIGEST}" ]]; then
    echo "Refusing to delete the image used by the active Cloud Run revision."
    return
  fi
  confirm "Permanently delete ${digest} and all of its tags?" || return
  gcloud artifacts docker images delete "${IMAGE_PATH}@${digest}" --delete-tags --quiet
  echo "Image ${digest} was permanently deleted."
}

show_cleanup_policy() {
  gcloud artifacts repositories list-cleanup-policies "${GAR_REPOSITORY}" \
    --location="${GCP_REGION}"
}

show_scheduler() {
  gcloud scheduler jobs describe "${UPDATE_SCHEDULER_JOB}" \
    --location="${GCP_REGION}" \
    --format='yaml(name,state,schedule,timeZone,lastAttemptTime,status)'
}

main() {
  command -v gcloud >/dev/null 2>&1 || {
    echo "Missing required command: gcloud"
    exit 1
  }
  prompt_value "GCP_PROJECT_ID" "Google Cloud project ID"
  prompt_value "GCP_REGION" "Google Cloud region"
  prompt_value "CLOUD_RUN_SERVICE" "Cloud Run service"
  prompt_value "GAR_REPOSITORY" "Artifact Registry repository"
  prompt_value "IMAGE_NAME" "Container image name"
  gcloud config set project "${GCP_PROJECT_ID}" >/dev/null
  IMAGE_PATH="${GCP_REGION}-docker.pkg.dev/${GCP_PROJECT_ID}/${GAR_REPOSITORY}/${IMAGE_NAME}"

  while true; do
    list_images
    echo
    echo "1. Refresh"
    echo "2. Roll back to an image"
    echo "3. Delete an inactive image"
    echo "4. Show cleanup policy"
    echo "5. Show update scheduler"
    echo "6. Pause automatic updates"
    echo "7. Resume automatic updates"
    echo "0. Exit"
    local action=""
    read -r -p "Action: " action
    case "${action}" in
      1) ;;
      2) rollback_image ;;
      3) delete_image ;;
      4) show_cleanup_policy ;;
      5) show_scheduler ;;
      6) gcloud scheduler jobs pause "${UPDATE_SCHEDULER_JOB}" --location="${GCP_REGION}" ;;
      7) gcloud scheduler jobs resume "${UPDATE_SCHEDULER_JOB}" --location="${GCP_REGION}" ;;
      0) exit 0 ;;
      *) echo "Unknown action." ;;
    esac
  done
}

main "$@"
