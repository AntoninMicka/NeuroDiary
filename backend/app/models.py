from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field, field_validator
from urllib.parse import urlparse


HourStateKey = Literal["dyskinesia", "on", "partial", "off", "sleep"]
SleepQualityKey = Literal["poor", "mixed", "good"]
OverallStatusKey = Literal["hard", "stable", "good"]


class MedicationModel(BaseModel):
    id: str = Field(min_length=1)
    name: str = Field(min_length=1)
    dose: str = Field(min_length=1)
    time: str = Field(pattern=r"^\d{2}:\d{2}$")
    planItemId: str | None = None


class DiaryEntryModel(BaseModel):
    sleepQuality: SleepQualityKey
    overallStatus: OverallStatusKey
    notes: str = ""
    medications: list[MedicationModel] = Field(default_factory=list)
    hours: dict[str, HourStateKey] = Field(default_factory=dict)


class DiaryStateModel(BaseModel):
    selectedDate: str = Field(pattern=r"^\d{4}-\d{2}-\d{2}$")
    patientName: str = ""
    birthYear: str = ""
    entries: dict[str, DiaryEntryModel] = Field(default_factory=dict)


class EncryptedPayloadModel(BaseModel):
    schemaVersion: int = Field(ge=1)
    algorithm: str = Field(min_length=1)
    keyVersion: int = Field(ge=1)
    iv: str = Field(min_length=1)
    cipherText: str = Field(min_length=1)


class WrappedKeyEnvelopeModel(BaseModel):
    wrappedKey: str = Field(min_length=1)
    wrappingAlgorithm: str = Field(min_length=1)
    wrappingSalt: str = Field(min_length=1)
    wrappingIv: str = Field(min_length=1)
    wrappingIterations: int = Field(ge=1)
    keyVersion: int = Field(ge=1)


class SyncEnvelopeModel(BaseModel):
    revision: int = Field(ge=0)
    updatedAt: datetime
    payload: EncryptedPayloadModel
    wrappedKey: WrappedKeyEnvelopeModel | None = None


class SyncPullResponseModel(BaseModel):
    revision: int = Field(ge=0)
    updatedAt: datetime | None = None
    payload: EncryptedPayloadModel | None = None
    wrappedKey: WrappedKeyEnvelopeModel | None = None


class SyncPushRequestModel(BaseModel):
    baseRevision: int = Field(ge=0)
    payload: EncryptedPayloadModel
    wrappedKey: WrappedKeyEnvelopeModel | None = None
    force: bool = False


class SyncPushResponseModel(BaseModel):
    status: Literal["ok", "conflict"]
    revision: int = Field(ge=0)
    updatedAt: datetime
    payload: EncryptedPayloadModel
    wrappedKey: WrappedKeyEnvelopeModel | None = None


class SyncResetResponseModel(BaseModel):
    status: Literal["ok"]
    deleted: bool = False
    updatedAt: datetime


class DeviceRegistrationRequestModel(BaseModel):
    deviceId: str = Field(pattern=r"^[A-Za-z0-9_-]{16,128}$")
    name: str = Field(min_length=1, max_length=80)


class DeviceKeyChallengeRequestModel(BaseModel):
    deviceId: str = Field(pattern=r"^[A-Za-z0-9_-]{16,128}$")
    publicKeyJwk: dict[str, object]


class DeviceKeyChallengeResponseModel(BaseModel):
    challengeId: str
    encryptedChallenge: str
    expiresAt: datetime


class DeviceKeyPublishRequestModel(BaseModel):
    deviceId: str = Field(pattern=r"^[A-Za-z0-9_-]{16,128}$")
    publicKeyJwk: dict[str, object]
    challengeId: str = Field(min_length=16, max_length=128)
    challengeSecret: str = Field(min_length=16, max_length=256)


class DevicePublicKeyModel(BaseModel):
    deviceId: str
    publicKeyJwk: dict[str, object]
    fingerprint: str
    verifiedAt: datetime


class DevicePublicKeyListResponseModel(BaseModel):
    keys: list[DevicePublicKeyModel]


class DeviceKeyTransferRequestModel(BaseModel):
    targetDeviceId: str = Field(pattern=r"^[A-Za-z0-9_-]{16,128}$")
    keyVersion: int = Field(ge=1)
    envelope: "DeviceKeyTransferEnvelopeModel"
    expiresInSeconds: int = Field(default=600, ge=60, le=3600)


class DeviceKeyTransferModel(BaseModel):
    transferId: str
    sourceDeviceId: str
    targetDeviceId: str
    keyVersion: int
    envelope: dict[str, object]
    createdAt: datetime
    expiresAt: datetime


class DeviceKeyTransferConfirmModel(BaseModel):
    transferId: str = Field(min_length=16, max_length=128)


class DeviceKeyTransferEnvelopeModel(BaseModel):
    algorithm: Literal["RSA-OAEP-3072-SHA256"]
    cipherText: str = Field(min_length=1, max_length=2048)
    targetFingerprint: str = Field(pattern=r"^[0-9a-f]{64}$")


class RotationDeviceEnvelopeModel(BaseModel):
    targetDeviceId: str = Field(pattern=r"^[A-Za-z0-9_-]{16,128}$")
    envelope: DeviceKeyTransferEnvelopeModel


class SyncRotationRequestModel(BaseModel):
    baseRevision: int = Field(ge=0)
    payload: EncryptedPayloadModel
    wrappedKey: WrappedKeyEnvelopeModel
    transfers: list[RotationDeviceEnvelopeModel] = Field(default_factory=list, max_length=50)


class DeviceKeyRequestModel(BaseModel):
    requestId: str
    targetDeviceId: str
    createdAt: datetime
    expiresAt: datetime


class DeviceKeyRequestListResponseModel(BaseModel):
    requests: list[DeviceKeyRequestModel]


class DeviceKeyRequestFulfillModel(BaseModel):
    requestId: str = Field(min_length=16, max_length=128)
    transfer: DeviceKeyTransferRequestModel


class TrustedDeviceModel(BaseModel):
    deviceId: str
    name: str
    createdAt: datetime
    lastSeenAt: datetime
    revokedAt: datetime | None = None
    current: bool = False
    trustStatus: Literal["pending", "trusted", "revoked"] = "trusted"


class TrustedDeviceListResponseModel(BaseModel):
    devices: list[TrustedDeviceModel]


class DeviceActionResponseModel(BaseModel):
    status: Literal["ok"]
    affected: int = Field(ge=0)


class SecurityAuditEventModel(BaseModel):
    eventId: str
    deviceId: str
    eventType: str
    details: dict[str, object]
    createdAt: datetime


class SecurityAuditListResponseModel(BaseModel):
    events: list[SecurityAuditEventModel]


class AuthConfigResponseModel(BaseModel):
    googleEnabled: bool = False
    googleClientId: str = ""
    appleEnabled: bool = False
    appleClientId: str = ""
    appleRedirectPath: str = "/auth/apple/callback"
    legacyApiTokenEnabled: bool = False
    federatedAuthEnabled: bool = False


class IdentityProfileModel(BaseModel):
    email: str = ""
    firstName: str = ""
    lastName: str = ""


class IdentityExchangeRequestModel(BaseModel):
    provider: Literal["google", "apple"]
    idToken: str = Field(min_length=1)
    nonce: str = ""
    profile: IdentityProfileModel | None = None


class AuthenticatedUserModel(BaseModel):
    isAuthenticated: bool = True
    provider: Literal["google", "apple", "cloud-token"]
    userId: str = Field(min_length=1)
    email: str = ""
    name: str = ""


class AuthSessionResponseModel(BaseModel):
    accessToken: str = Field(min_length=1)
    expiresAt: datetime
    user: AuthenticatedUserModel


class PushSubscriptionKeysModel(BaseModel):
    p256dh: str = Field(min_length=1, max_length=512)
    auth: str = Field(min_length=1, max_length=256)


class PushSubscriptionModel(BaseModel):
    endpoint: str = Field(min_length=1, max_length=2048)
    expirationTime: int | None = Field(default=None, ge=0)
    keys: PushSubscriptionKeysModel

    @field_validator("endpoint")
    @classmethod
    def validate_endpoint(cls, value: str) -> str:
        parsed = urlparse(value)
        if parsed.scheme != "https" or not parsed.hostname or parsed.username or parsed.password:
            raise ValueError("Push endpoint must be an HTTPS URL without credentials.")
        return value


class PushReminderModel(BaseModel):
    id: str = Field(pattern=r"^[A-Za-z0-9_-]{1,128}$")
    scheduledAt: datetime
    type: Literal["medication"] = "medication"

    @field_validator("scheduledAt")
    @classmethod
    def validate_scheduled_at(cls, value: datetime) -> datetime:
        if value.tzinfo is None or value.utcoffset() is None:
            raise ValueError("scheduledAt must include a timezone.")
        return value


class PushRegistrationRequestModel(BaseModel):
    subscription: PushSubscriptionModel
    reminders: list[PushReminderModel] = Field(default_factory=list, max_length=250)


class PushRegistrationResponseModel(BaseModel):
    status: Literal["ok"]
    scheduledCount: int = Field(ge=0)


class PushUnsubscribeRequestModel(BaseModel):
    endpoint: str = Field(min_length=1, max_length=2048)


class PushConfigResponseModel(BaseModel):
    enabled: bool
    publicKey: str = ""


class PushDispatchResponseModel(BaseModel):
    status: Literal["ok"]
    sent: int = Field(ge=0)
    failed: int = Field(ge=0)
    removedSubscriptions: int = Field(ge=0)
