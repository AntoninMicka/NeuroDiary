from __future__ import annotations

from enum import Enum


class AuditEventType(str, Enum):
    """Stable identifiers for security-relevant user and administrator actions."""

    ACCOUNT_ROLES_CHANGED = "account_roles_changed"
    DEVICE_ACTIVE_ROLES_CHANGED = "device_active_roles_changed"
    SELF_ASSIGNABLE_ROLES_CHANGED = "self_assignable_roles_changed"
    EMERGENCY_REVOKED_DEVICE_REACTIVATED = "emergency_revoked_device_reactivated"
    EMERGENCY_DEVICE_REGISTRATION_ACCEPTED = "emergency_device_registration_accepted"
    DEVICE_BOOTSTRAP_TRUSTED = "device_bootstrap_trusted"
    DEVICE_MIGRATION_TRUSTED = "device_migration_trusted"
    DEVICE_KEY_VERIFIED = "device_key_verified"
    EMERGENCY_DEVICE_KEY_ACCEPTED = "emergency_device_key_accepted"
    IDENTITY_KEY_MIGRATION_DISABLED = "identity_key_migration_disabled"
    MASTER_KEY_REQUESTED = "master_key_requested"
    MASTER_KEY_TRANSFER_CREATED = "master_key_transfer_created"
    MASTER_KEY_TRANSFER_CONFIRMED = "master_key_transfer_confirmed"
    DEVICE_ALIAS_CHANGED = "device_alias_changed"
    DEVICE_REVOKED = "device_revoked"
    ROTATION_KEY_DISTRIBUTED = "rotation_key_distributed"
    KEY_ROTATED = "key_rotated"
    DIARY_SHARE_INVITATION_CREATED = "diary_share_invitation_created"
    DIARY_SHARE_INVITATION_ACCEPTED = "diary_share_invitation_accepted"
    DIARY_SHARE_INVITATION_DECLINED = "diary_share_invitation_declined"
    DIARY_SHARE_INVITATION_CANCELLED = "diary_share_invitation_cancelled"
    DIARY_SHARE_ACTIVATED = "diary_share_activated"
    DIARY_SHARE_CREATED = "diary_share_created"
    DIARY_SHARE_REVOKED = "diary_share_revoked"
    TREATMENT_PROPOSAL_CREATED = "treatment_proposal_created"
    TREATMENT_PROPOSAL_APPROVED = "treatment_proposal_approved"
    TREATMENT_PROPOSAL_DECLINED = "treatment_proposal_declined"
    TREATMENT_PROPOSAL_RETURNED = "treatment_proposal_returned"
    TREATMENT_PROPOSAL_CANCELLED = "treatment_proposal_cancelled"


INVITATION_DECISION_EVENTS = {
    "accepted": AuditEventType.DIARY_SHARE_INVITATION_ACCEPTED,
    "declined": AuditEventType.DIARY_SHARE_INVITATION_DECLINED,
}

TREATMENT_PROPOSAL_DECISION_EVENTS = {
    "approved": AuditEventType.TREATMENT_PROPOSAL_APPROVED,
    "declined": AuditEventType.TREATMENT_PROPOSAL_DECLINED,
    "returned": AuditEventType.TREATMENT_PROPOSAL_RETURNED,
}
