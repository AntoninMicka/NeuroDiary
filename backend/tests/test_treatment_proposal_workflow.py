import importlib

import pytest
from fastapi import HTTPException

from backend.app.auth import AuthenticatedUser
from backend.app.models import (
    SyncPushRequestModel,
    TreatmentProposalCreateModel,
    TreatmentProposalDecisionModel,
)


def load_app(monkeypatch, tmp_path):
    monkeypatch.setenv("NEURODIARY_DATABASE_URL", "")
    monkeypatch.setenv("NEURODIARY_DATABASE_PATH", str(tmp_path / "workflow.db"))
    monkeypatch.setenv("NEURODIARY_SESSION_SECRET", "workflow-test-secret")
    monkeypatch.delenv("NEURODIARY_API_TOKEN", raising=False)
    import backend.app.main as main
    main = importlib.reload(main)
    main.on_startup()
    return main


def encrypted_payload(cipher_text):
    return {
        "schemaVersion": 1, "algorithm": "AES-GCM-256", "keyVersion": 1,
        "iv": "opaque-iv", "cipherText": cipher_text,
    }


def account(user_id, email, name):
    return AuthenticatedUser(provider="google", user_id=user_id, email=email, name=name)


def test_doctor_proposal_patient_approval_and_synced_plan_reaches_shared_record(monkeypatch, tmp_path):
    main = load_app(monkeypatch, tmp_path)
    patient = account("google:patient", "patient@example.test", "Jan Pacient")
    doctor = account("google:doctor", "doctor@example.test", "MUDr. Eva Lékařová")
    patient_device = "patient-device-0001"
    doctor_device = "doctor-device-00001"

    for user, device in ((patient, patient_device), (doctor, doctor_device)):
        main.share_store.register_identity(user.user_id, user.email, user.name)
        main.device_store.upsert(user.user_id, device, device)
    main.share_store.set_roles(patient.user_id, ["patient"])
    main.share_store.set_active_roles(patient.user_id, patient_device, ["patient"])
    main.share_store.set_roles(doctor.user_id, ["doctor"])
    main.share_store.set_active_roles(doctor.user_id, doctor_device, ["doctor"])

    initial = main.push_state(
        SyncPushRequestModel(baseRevision=0, payload=encrypted_payload("initial-treatment-plan")),
        patient.user_id,
    )
    grant_id = main.share_store.save_grant(
        patient.user_id, doctor.user_id, doctor_device, 1,
        {"algorithm": "RSA-OAEP-3072-SHA256", "cipherText": "wrapped-key", "targetFingerprint": "a" * 64},
    )

    created = main.create_treatment_proposal(
        TreatmentProposalCreateModel(
            grantId=grant_id, baseRevision=initial.revision,
            payload=encrypted_payload("batch-with-three-treatment-changes"),
        ),
        doctor,
        doctor_device,
    )
    patient_queue = main.list_treatment_proposals(patient, patient_device)["proposals"]
    assert created["status"] == "pending"
    assert patient_queue[0]["payload"]["cipherText"] == "batch-with-three-treatment-changes"
    assert patient_queue[0]["proposerName"] == doctor.name

    decision = main.decide_treatment_proposal(
        created["proposalId"], TreatmentProposalDecisionModel(decision="approved"), patient, patient_device,
    )
    assert decision["status"] == "approved"

    applied = main.push_state(
        SyncPushRequestModel(baseRevision=initial.revision, payload=encrypted_payload("approved-treatment-plan")),
        patient.user_id,
    )
    doctor_record = main.list_shares(doctor, doctor_device, True)["incoming"][0]
    assert applied.revision == 2
    assert doctor_record["revision"] == 2
    assert doctor_record["payload"]["cipherText"] == "approved-treatment-plan"
    assert main.list_treatment_proposals(doctor, doctor_device)["proposals"][0]["status"] == "approved"


def test_family_role_cannot_create_treatment_proposal(monkeypatch, tmp_path):
    main = load_app(monkeypatch, tmp_path)
    patient = account("google:patient", "patient@example.test", "Patient")
    family = account("google:family", "family@example.test", "Family")
    patient_device = "patient-device-0001"
    family_device = "family-device-00001"
    for user, device in ((patient, patient_device), (family, family_device)):
        main.share_store.register_identity(user.user_id, user.email, user.name)
        main.device_store.upsert(user.user_id, device, device)
    main.share_store.set_roles(family.user_id, ["family"])
    main.share_store.set_active_roles(family.user_id, family_device, ["family"])
    grant_id = main.share_store.save_grant(patient.user_id, family.user_id, family_device, 1, {"cipherText": "key"})

    with pytest.raises(HTTPException) as denied:
        main.create_treatment_proposal(
            TreatmentProposalCreateModel(grantId=grant_id, baseRevision=0, payload=encrypted_payload("forbidden")),
            family,
            family_device,
        )
    assert denied.value.status_code == 403


def test_patient_can_return_proposal_and_doctor_creates_next_version(monkeypatch, tmp_path):
    main = load_app(monkeypatch, tmp_path)
    patient = account("google:patient", "patient@example.test", "Patient")
    doctor = account("google:doctor", "doctor@example.test", "Doctor")
    patient_device, doctor_device = "patient-device-0001", "doctor-device-00001"
    for user, device, role in ((patient, patient_device, "patient"), (doctor, doctor_device, "doctor")):
        main.share_store.register_identity(user.user_id, user.email, user.name)
        main.device_store.upsert(user.user_id, device, device)
        main.share_store.set_roles(user.user_id, [role])
        main.share_store.set_active_roles(user.user_id, device, [role])
    grant_id = main.share_store.save_grant(patient.user_id, doctor.user_id, doctor_device, 1, {"cipherText": "key"})
    first = main.create_treatment_proposal(
        TreatmentProposalCreateModel(grantId=grant_id, baseRevision=1, payload=encrypted_payload("version-1")), doctor, doctor_device,
    )
    returned = main.decide_treatment_proposal(
        first["proposalId"],
        TreatmentProposalDecisionModel(decision="returned", responsePayload=encrypted_payload("patient-comment")),
        patient, patient_device,
    )
    second = main.create_treatment_proposal(
        TreatmentProposalCreateModel(
            grantId=grant_id, baseRevision=1, payload=encrypted_payload("version-2"), previousProposalId=first["proposalId"],
        ), doctor, doctor_device,
    )
    proposals = main.list_treatment_proposals(doctor, doctor_device)["proposals"]
    assert returned["status"] == "returned"
    assert second["status"] == "pending"
    assert proposals[0]["version"] == 2
    assert proposals[0]["previousProposalId"] == first["proposalId"]
    assert proposals[1]["responsePayload"]["cipherText"] == "patient-comment"
