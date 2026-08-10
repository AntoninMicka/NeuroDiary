from __future__ import annotations

from enum import Enum


class AuditEventType(str, Enum):
    """Stable identifiers for security-relevant user and administrator actions."""

    ACCOUNT_ROLES_CHANGED = "account_roles_changed"
    AUTH_SESSION_CREATED = "auth_session_created"
    ADMIN_BACKUP_CREATED = "admin_backup_created"
    ADMIN_BACKUP_DELETED = "admin_backup_deleted"
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
    OTHER_DEVICES_REVOKED = "other_devices_revoked"
    PUSH_NOTIFICATIONS_ENABLED = "push_notifications_enabled"
    PUSH_NOTIFICATIONS_DISABLED = "push_notifications_disabled"
    SYNC_STATE_RESET = "sync_state_reset"
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


AUDIT_DETAIL_FIELDS: dict[AuditEventType, frozenset[str]] = {
    AuditEventType.ACCOUNT_ROLES_CHANGED: frozenset({"targetUserId", "roles"}),
    AuditEventType.AUTH_SESSION_CREATED: frozenset({"provider"}),
    AuditEventType.ADMIN_BACKUP_CREATED: frozenset({"backupId"}),
    AuditEventType.ADMIN_BACKUP_DELETED: frozenset({"backupId"}),
    AuditEventType.DEVICE_ACTIVE_ROLES_CHANGED: frozenset({"roles"}),
    AuditEventType.SELF_ASSIGNABLE_ROLES_CHANGED: frozenset({"roles"}),
    AuditEventType.EMERGENCY_REVOKED_DEVICE_REACTIVATED: frozenset(),
    AuditEventType.EMERGENCY_DEVICE_REGISTRATION_ACCEPTED: frozenset(),
    AuditEventType.DEVICE_BOOTSTRAP_TRUSTED: frozenset({"fingerprint"}),
    AuditEventType.DEVICE_MIGRATION_TRUSTED: frozenset({"fingerprint"}),
    AuditEventType.DEVICE_KEY_VERIFIED: frozenset({"fingerprint"}),
    AuditEventType.EMERGENCY_DEVICE_KEY_ACCEPTED: frozenset({"fingerprint"}),
    AuditEventType.IDENTITY_KEY_MIGRATION_DISABLED: frozenset(),
    AuditEventType.MASTER_KEY_REQUESTED: frozenset({"requestId"}),
    AuditEventType.MASTER_KEY_TRANSFER_CREATED: frozenset(
        {"requestId", "transferId", "targetDeviceId", "keyVersion"},
    ),
    AuditEventType.MASTER_KEY_TRANSFER_CONFIRMED: frozenset({"transferId"}),
    AuditEventType.DEVICE_ALIAS_CHANGED: frozenset({"targetDeviceId"}),
    AuditEventType.DEVICE_REVOKED: frozenset({"revokedDeviceId"}),
    AuditEventType.OTHER_DEVICES_REVOKED: frozenset({"affected"}),
    AuditEventType.PUSH_NOTIFICATIONS_ENABLED: frozenset({"scheduledCount"}),
    AuditEventType.PUSH_NOTIFICATIONS_DISABLED: frozenset(),
    AuditEventType.SYNC_STATE_RESET: frozenset(),
    AuditEventType.ROTATION_KEY_DISTRIBUTED: frozenset(
        {"transferId", "targetDeviceId", "keyVersion"},
    ),
    AuditEventType.KEY_ROTATED: frozenset({"keyVersion", "targetCount"}),
    AuditEventType.DIARY_SHARE_INVITATION_CREATED: frozenset({"invitationId"}),
    AuditEventType.DIARY_SHARE_INVITATION_ACCEPTED: frozenset({"invitationId"}),
    AuditEventType.DIARY_SHARE_INVITATION_DECLINED: frozenset({"invitationId"}),
    AuditEventType.DIARY_SHARE_INVITATION_CANCELLED: frozenset({"invitationId"}),
    AuditEventType.DIARY_SHARE_ACTIVATED: frozenset({"invitationId", "grantId"}),
    AuditEventType.DIARY_SHARE_CREATED: frozenset({"recipientUserId", "recipientDeviceId"}),
    AuditEventType.DIARY_SHARE_REVOKED: frozenset({"grantId"}),
    AuditEventType.TREATMENT_PROPOSAL_CREATED: frozenset({"proposalId", "grantId"}),
    AuditEventType.TREATMENT_PROPOSAL_APPROVED: frozenset({"proposalId"}),
    AuditEventType.TREATMENT_PROPOSAL_DECLINED: frozenset({"proposalId"}),
    AuditEventType.TREATMENT_PROPOSAL_RETURNED: frozenset({"proposalId"}),
    AuditEventType.TREATMENT_PROPOSAL_CANCELLED: frozenset({"proposalId"}),
}

AUDIT_EVENT_LABELS: dict[AuditEventType, str] = {
    event: event.value.replace("_", " ").capitalize()
    for event in AuditEventType
}
AUDIT_EVENT_LABELS.update({
    AuditEventType.ACCOUNT_ROLES_CHANGED: "Změněny role účtu",
    AuditEventType.AUTH_SESSION_CREATED: "Úspěšné přihlášení",
    AuditEventType.ADMIN_BACKUP_CREATED: "Vytvořena cloudová záloha",
    AuditEventType.ADMIN_BACKUP_DELETED: "Odstraněna cloudová záloha",
    AuditEventType.DEVICE_ACTIVE_ROLES_CHANGED: "Změněny aktivní role zařízení",
    AuditEventType.SELF_ASSIGNABLE_ROLES_CHANGED: "Změněny role uživatele",
    AuditEventType.EMERGENCY_REVOKED_DEVICE_REACTIVATED: "Nouzově obnoveno odvolané zařízení",
    AuditEventType.EMERGENCY_DEVICE_REGISTRATION_ACCEPTED: "Nouzově přijata registrace zařízení",
    AuditEventType.DEVICE_BOOTSTRAP_TRUSTED: "Nastaveno první důvěryhodné zařízení",
    AuditEventType.DEVICE_MIGRATION_TRUSTED: "Zařízení přijato během migrace klíčů",
    AuditEventType.DEVICE_KEY_VERIFIED: "Ověřen klíč zařízení",
    AuditEventType.EMERGENCY_DEVICE_KEY_ACCEPTED: "Nouzově přijat klíč zařízení",
    AuditEventType.IDENTITY_KEY_MIGRATION_DISABLED: "Ukončena migrace identitních klíčů",
    AuditEventType.MASTER_KEY_REQUESTED: "Vyžádán hlavní šifrovací klíč",
    AuditEventType.MASTER_KEY_TRANSFER_CREATED: "Připraven přenos hlavního klíče",
    AuditEventType.MASTER_KEY_TRANSFER_CONFIRMED: "Potvrzen přenos hlavního klíče",
    AuditEventType.DEVICE_ALIAS_CHANGED: "Přejmenováno zařízení",
    AuditEventType.DEVICE_REVOKED: "Odvoláno důvěryhodné zařízení",
    AuditEventType.OTHER_DEVICES_REVOKED: "Odvolána ostatní zařízení",
    AuditEventType.PUSH_NOTIFICATIONS_ENABLED: "Zapnuty push notifikace",
    AuditEventType.PUSH_NOTIFICATIONS_DISABLED: "Vypnuty push notifikace",
    AuditEventType.SYNC_STATE_RESET: "Odstraněna cloudová data deníku",
    AuditEventType.ROTATION_KEY_DISTRIBUTED: "Distribuován obnovený šifrovací klíč",
    AuditEventType.KEY_ROTATED: "Obnoven šifrovací klíč",
    AuditEventType.DIARY_SHARE_INVITATION_CREATED: "Vytvořena pozvánka ke sdílení",
    AuditEventType.DIARY_SHARE_INVITATION_ACCEPTED: "Přijata pozvánka ke sdílení",
    AuditEventType.DIARY_SHARE_INVITATION_DECLINED: "Odmítnuta pozvánka ke sdílení",
    AuditEventType.DIARY_SHARE_INVITATION_CANCELLED: "Zrušena pozvánka ke sdílení",
    AuditEventType.DIARY_SHARE_ACTIVATED: "Aktivováno sdílení deníku",
    AuditEventType.DIARY_SHARE_CREATED: "Vytvořeno sdílení deníku",
    AuditEventType.DIARY_SHARE_REVOKED: "Odvoláno sdílení deníku",
    AuditEventType.TREATMENT_PROPOSAL_CREATED: "Vytvořen návrh změny léčby",
    AuditEventType.TREATMENT_PROPOSAL_APPROVED: "Schválen návrh změny léčby",
    AuditEventType.TREATMENT_PROPOSAL_DECLINED: "Odmítnut návrh změny léčby",
    AuditEventType.TREATMENT_PROPOSAL_RETURNED: "Vrácen návrh změny léčby",
    AuditEventType.TREATMENT_PROPOSAL_CANCELLED: "Zrušen návrh změny léčby",
})


def audit_event_label(event_type: str) -> str:
    try:
        return AUDIT_EVENT_LABELS[AuditEventType(event_type)]
    except ValueError:
        return "Bezpečnostní událost"


def validate_audit_details(event_type: AuditEventType, details: dict[str, object]) -> dict[str, object]:
    """Accept only small, explicitly catalogued, non-sensitive audit metadata."""

    unexpected = set(details) - AUDIT_DETAIL_FIELDS[event_type]
    if unexpected:
        raise ValueError(f"Unexpected audit detail fields: {', '.join(sorted(unexpected))}")

    for field, value in details.items():
        if isinstance(value, str):
            if len(value) > 256:
                raise ValueError(f"Audit detail field {field} exceeds 256 characters.")
        elif isinstance(value, bool):
            continue
        elif isinstance(value, int):
            if value < 0:
                raise ValueError(f"Audit detail field {field} must not be negative.")
        elif isinstance(value, list):
            if len(value) > 16 or any(not isinstance(item, str) or len(item) > 64 for item in value):
                raise ValueError(f"Audit detail field {field} contains an invalid list.")
        else:
            raise ValueError(f"Audit detail field {field} has an unsupported value type.")

    return details
