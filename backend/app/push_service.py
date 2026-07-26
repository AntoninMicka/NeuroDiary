from __future__ import annotations

import json
import os
from datetime import UTC, datetime
from urllib.parse import urlparse

try:
    from pywebpush import WebPushException, webpush
    WEB_PUSH_LIBRARY_AVAILABLE = True
except ImportError:
    WEB_PUSH_LIBRARY_AVAILABLE = False

    class WebPushException(Exception):
        response = None

    def webpush(**_kwargs):
        raise RuntimeError("pywebpush is not installed.")


class PushService:
    def __init__(self) -> None:
        self.public_key = os.getenv("NEURODIARY_VAPID_PUBLIC_KEY", "").strip()
        self.private_key = os.getenv("NEURODIARY_VAPID_PRIVATE_KEY", "").strip()
        self.subject = os.getenv("NEURODIARY_VAPID_SUBJECT", "").strip()
        configured_hosts = os.getenv(
            "NEURODIARY_PUSH_ENDPOINT_HOSTS",
            "googleapis.com,mozilla.com,apple.com,windows.com,microsoft.com",
        )
        self.allowed_endpoint_hosts = {
            host.strip().lower().lstrip(".")
            for host in configured_hosts.split(",")
            if host.strip()
        }

    @property
    def enabled(self) -> bool:
        return bool(
            WEB_PUSH_LIBRARY_AVAILABLE
            and self.public_key
            and self.private_key
            and self.subject
        )

    def send_generic_medication_reminder(self, subscription_info: dict[str, object]) -> None:
        if not self.enabled:
            raise RuntimeError("Web Push is not configured.")
        payload = json.dumps(
            {
                "type": "medication",
                "title": "NeuroDiary",
                "body": "Mate naplanovanou pripominku lecby.",
                "url": "/",
                "sentAt": datetime.now(UTC).isoformat(),
            },
            separators=(",", ":"),
        )
        webpush(
            subscription_info=subscription_info,
            data=payload,
            vapid_private_key=self.private_key,
            vapid_claims={"sub": self.subject},
            ttl=3600,
            timeout=10,
        )

    def is_endpoint_allowed(self, endpoint: str) -> bool:
        hostname = (urlparse(endpoint).hostname or "").lower()
        return any(
            hostname == allowed or hostname.endswith(f".{allowed}")
            for allowed in self.allowed_endpoint_hosts
        )

    @staticmethod
    def is_expired_subscription(error: WebPushException) -> bool:
        return error.response is not None and error.response.status_code in {404, 410}
