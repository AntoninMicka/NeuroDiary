from __future__ import annotations

import os
from datetime import UTC, datetime
from typing import Any

import google.auth
from google.auth.transport.requests import AuthorizedSession


class CloudAdminService:
    def __init__(self) -> None:
        self.project_id = os.getenv("NEURODIARY_GCP_PROJECT_ID", os.getenv("GOOGLE_CLOUD_PROJECT", "")).strip()
        self.region = os.getenv("NEURODIARY_GCP_REGION", "").strip()
        self.service = os.getenv("K_SERVICE", os.getenv("NEURODIARY_CLOUD_RUN_SERVICE", "")).strip()
        self.revision = os.getenv("K_REVISION", "").strip()
        self.sql_instance = os.getenv("NEURODIARY_CLOUD_SQL_INSTANCE", "").strip()
        self.update_trigger = os.getenv("NEURODIARY_UPDATE_TRIGGER", "neurodiary-cloud-pull").strip()
        self.update_scheduler = os.getenv("NEURODIARY_UPDATE_SCHEDULER", "neurodiary-cloud-pull").strip()
        self.manual_backup_limit = max(1, int(os.getenv("NEURODIARY_MANUAL_BACKUP_LIMIT", "3")))
        self.automated_backup_retention = max(1, int(os.getenv("NEURODIARY_BACKUP_RETENTION_COUNT", "7")))

    @property
    def configured(self) -> bool:
        return bool(self.project_id and self.region and self.service)

    def _session(self) -> AuthorizedSession:
        credentials, _ = google.auth.default(scopes=["https://www.googleapis.com/auth/cloud-platform"])
        return AuthorizedSession(credentials)

    @staticmethod
    def _json(response) -> dict[str, Any]:
        payload = response.json() if response.content else {}
        if not response.ok:
            detail = payload.get("error", {}).get("message") or f"Google Cloud API HTTP {response.status_code}"
            raise RuntimeError(detail)
        return payload

    def get_status(self) -> dict[str, Any]:
        result: dict[str, Any] = {
            "configured": self.configured,
            "projectId": self.project_id,
            "region": self.region,
            "service": self.service,
            "revision": self.revision,
            "sqlInstance": self.sql_instance,
            "updateTrigger": self.update_trigger,
            "updateScheduler": self.update_scheduler,
            "checkedAt": datetime.now(UTC).isoformat(),
            "cloudReachable": False,
            "cloudRun": None,
            "latestBuild": None,
            "backups": [],
            "warnings": [],
            "backupPolicy": {
                "manualLimit": self.manual_backup_limit,
                "automatedRetentionCount": self.automated_backup_retention,
            },
        }
        if not self.configured:
            result["warnings"].append("Cloudová metadata nejsou nakonfigurována.")
            return result

        try:
            session = self._session()
            run_url = (
                f"https://run.googleapis.com/v2/projects/{self.project_id}/locations/"
                f"{self.region}/services/{self.service}"
            )
            service = self._json(session.get(run_url, timeout=8))
            result["cloudRun"] = {
                "uri": service.get("uri", ""),
                "latestReadyRevision": service.get("latestReadyRevision", "").split("/")[-1],
                "latestCreatedRevision": service.get("latestCreatedRevision", "").split("/")[-1],
                "reconciling": bool(service.get("reconciling")),
                "ready": service.get("terminalCondition", {}).get("state") == "CONDITION_SUCCEEDED",
                "labels": service.get("labels", {}),
            }
            if not result["cloudRun"]["ready"] or result["cloudRun"]["reconciling"]:
                result["warnings"].append("Cloud Run není v ustáleném připraveném stavu.")

            build_url = f"https://cloudbuild.googleapis.com/v1/projects/{self.project_id}/locations/{self.region}/builds"
            builds = self._json(session.get(build_url, params={"pageSize": 1}, timeout=8)).get("builds", [])
            if builds:
                build = builds[0]
                result["latestBuild"] = {
                    "id": build.get("id", ""),
                    "status": build.get("status", ""),
                    "createTime": build.get("createTime", ""),
                    "finishTime": build.get("finishTime", ""),
                    "logUrl": build.get("logUrl", ""),
                }
                if build.get("status") in {"FAILURE", "INTERNAL_ERROR", "TIMEOUT", "CANCELLED", "EXPIRED"}:
                    result["warnings"].append(f"Poslední aktualizace skončila stavem {build.get('status')}.")

            if self.sql_instance:
                backup_url = (
                    f"https://sqladmin.googleapis.com/sql/v1beta4/projects/{self.project_id}/instances/"
                    f"{self.sql_instance}/backupRuns"
                )
                backups = self._json(session.get(backup_url, params={"maxResults": 20}, timeout=8)).get("items", [])
                result["backups"] = [
                    {
                        "id": str(item.get("id", "")),
                        "status": item.get("status", ""),
                        "type": item.get("type", ""),
                        "startTime": item.get("startTime", ""),
                        "endTime": item.get("endTime", ""),
                        "description": item.get("description", ""),
                    }
                    for item in backups
                ]
                if any(item.get("status") == "FAILED" for item in backups):
                    result["warnings"].append("Nejméně jedna z posledních databázových záloh selhala.")
            result["cloudReachable"] = True
        except Exception as error:
            result["warnings"].append(f"Cloudová API nejsou dostupná: {error}")
        return result

    def create_backup(self, description: str) -> dict[str, Any]:
        if not self.sql_instance:
            raise RuntimeError("Cloud SQL instance není nakonfigurována.")
        url = (
            f"https://sqladmin.googleapis.com/sql/v1beta4/projects/{self.project_id}/instances/"
            f"{self.sql_instance}/backupRuns"
        )
        session = self._session()
        existing = self._json(session.get(url, params={"maxResults": 100}, timeout=8)).get("items", [])
        manual_count = sum(1 for item in existing if item.get("type") == "ON_DEMAND" and item.get("status") != "DELETED")
        if manual_count >= self.manual_backup_limit:
            raise RuntimeError(
                f"Limit ručních záloh ({self.manual_backup_limit}) byl dosažen. Nejprve odstraňte starší ruční zálohu."
            )
        return self._json(session.post(url, json={"description": description[:255]}, timeout=30))

    def delete_backup(self, backup_id: str) -> None:
        if not self.sql_instance or not backup_id.isdigit():
            raise RuntimeError("Neplatná Cloud SQL záloha.")
        url = (
            f"https://sqladmin.googleapis.com/sql/v1beta4/projects/{self.project_id}/instances/"
            f"{self.sql_instance}/backupRuns/{backup_id}"
        )
        self._json(self._session().delete(url, timeout=30))
