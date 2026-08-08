from __future__ import annotations

import os
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from functools import cached_property
from typing import Any
from urllib.error import URLError

import jwt
from fastapi import HTTPException, status
from google.auth.transport import requests as google_requests
from google.oauth2 import id_token as google_id_token


SESSION_LIFETIME_DAYS = 30
APPLE_JWKS_URL = "https://appleid.apple.com/auth/keys"
LEGACY_API_TOKEN_USER_ID = "legacy-token-user"


def _split_csv(value: str) -> list[str]:
    return [item.strip() for item in value.split(",") if item.strip()]


@dataclass
class AuthenticatedUser:
    provider: str
    user_id: str
    email: str
    name: str


class AuthManager:
    def __init__(self) -> None:
        self.api_token = os.getenv("NEURODIARY_API_TOKEN", "").strip()
        self.session_secret = (
            os.getenv("NEURODIARY_SESSION_SECRET", "").strip()
            or self.api_token
            or "neurodiary-dev-session-secret"
        )
        self.google_client_ids = _split_csv(
            os.getenv("NEURODIARY_GOOGLE_CLIENT_IDS", os.getenv("NEURODIARY_GOOGLE_CLIENT_ID", "")),
        )
        self.apple_client_ids = _split_csv(
            os.getenv("NEURODIARY_APPLE_CLIENT_IDS", os.getenv("NEURODIARY_APPLE_CLIENT_ID", "")),
        )
        self.apple_redirect_path = os.getenv("NEURODIARY_APPLE_REDIRECT_PATH", "/auth/apple/callback").strip()

    @property
    def google_enabled(self) -> bool:
        return bool(self.google_client_ids)

    @property
    def apple_enabled(self) -> bool:
        return bool(self.apple_client_ids)

    @property
    def federated_auth_enabled(self) -> bool:
        return self.google_enabled or self.apple_enabled

    @cached_property
    def apple_jwk_client(self) -> jwt.PyJWKClient:
        return jwt.PyJWKClient(APPLE_JWKS_URL)

    def build_session_token(self, user: AuthenticatedUser) -> tuple[str, datetime]:
        expires_at = datetime.now(UTC) + timedelta(days=SESSION_LIFETIME_DAYS)
        token = jwt.encode(
            {
                "sub": user.user_id,
                "provider": user.provider,
                "email": user.email,
                "name": user.name,
                "iat": int(datetime.now(UTC).timestamp()),
                "exp": int(expires_at.timestamp()),
            },
            self.session_secret,
            algorithm="HS256",
        )
        return token, expires_at

    def decode_session_token(self, token: str) -> AuthenticatedUser:
        try:
            payload = jwt.decode(token, self.session_secret, algorithms=["HS256"])
        except jwt.PyJWTError as error:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Missing or invalid authentication token.",
            ) from error

        return AuthenticatedUser(
            provider=str(payload.get("provider") or "session"),
            user_id=str(payload.get("sub") or ""),
            email=str(payload.get("email") or ""),
            name=str(payload.get("name") or ""),
        )

    def resolve_authorization(self, authorization: str | None) -> str:
        return self.resolve_authenticated_user(authorization).user_id

    def resolve_authenticated_user(self, authorization: str | None) -> AuthenticatedUser:
        if not authorization:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Missing authentication token.",
            )

        if self.api_token and authorization == f"Bearer {self.api_token}":
            return AuthenticatedUser(
                provider="cloud-token",
                user_id=LEGACY_API_TOKEN_USER_ID,
                email="",
                name="Legacy cloud token",
            )

        if not authorization.startswith("Bearer "):
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Missing or invalid authentication token.",
            )

        user = self.decode_session_token(authorization.removeprefix("Bearer ").strip())
        if not user.user_id:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Missing or invalid authentication token.",
            )
        return user

    def exchange_identity_token(
        self,
        *,
        provider: str,
        id_token_value: str,
        nonce: str | None,
        profile: dict[str, Any] | None,
    ) -> tuple[AuthenticatedUser, str, datetime]:
        if provider == "google":
            user = self.verify_google_identity_token(id_token_value)
        elif provider == "apple":
            user = self.verify_apple_identity_token(id_token_value, nonce=nonce, profile=profile)
        else:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Unsupported identity provider.",
            )

        session_token, expires_at = self.build_session_token(user)
        return user, session_token, expires_at

    def verify_google_identity_token(self, token: str) -> AuthenticatedUser:
        if not self.google_client_ids:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Google sign-in is not configured on the server.",
            )

        request = google_requests.Request()
        decoded_token = None
        last_error: Exception | None = None

        for client_id in self.google_client_ids:
            try:
                decoded_token = google_id_token.verify_oauth2_token(token, request, client_id)
                break
            except (ValueError, URLError) as error:
                last_error = error

        if decoded_token is None:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Google identity token is invalid.",
            ) from last_error

        user_id = str(decoded_token.get("sub") or "")
        if not user_id:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Google identity token is missing subject.",
            )

        return AuthenticatedUser(
            provider="google",
            user_id=f"google:{user_id}",
            email=str(decoded_token.get("email") or ""),
            name=str(decoded_token.get("name") or decoded_token.get("email") or "Google user"),
        )

    def verify_apple_identity_token(
        self,
        token: str,
        *,
        nonce: str | None,
        profile: dict[str, Any] | None,
    ) -> AuthenticatedUser:
        if not self.apple_client_ids:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Sign in with Apple is not configured on the server.",
            )

        try:
            signing_key = self.apple_jwk_client.get_signing_key_from_jwt(token)
            decoded_token = jwt.decode(
                token,
                signing_key.key,
                algorithms=["RS256", "ES256"],
                audience=self.apple_client_ids,
                issuer="https://appleid.apple.com",
            )
        except jwt.PyJWTError as error:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Apple identity token is invalid.",
            ) from error

        if nonce and decoded_token.get("nonce") != nonce:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Apple identity token has invalid nonce.",
            )

        user_id = str(decoded_token.get("sub") or "")
        if not user_id:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Apple identity token is missing subject.",
            )

        email = str(decoded_token.get("email") or profile.get("email") if profile else "")
        full_name = ""
        if profile:
            first_name = str(profile.get("firstName") or "").strip()
            last_name = str(profile.get("lastName") or "").strip()
            full_name = " ".join(part for part in [first_name, last_name] if part)

        return AuthenticatedUser(
            provider="apple",
            user_id=f"apple:{user_id}",
            email=email,
            name=full_name or email or "Apple user",
        )
