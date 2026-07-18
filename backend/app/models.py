from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field


HourStateKey = Literal["dyskinesia", "on", "partial", "off", "sleep"]
SleepQualityKey = Literal["poor", "mixed", "good"]
OverallStatusKey = Literal["hard", "stable", "good"]


class MedicationModel(BaseModel):
    id: str = Field(min_length=1)
    name: str = Field(min_length=1)
    dose: str = Field(min_length=1)
    time: str = Field(pattern=r"^\d{2}:\d{2}$")


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


class SyncEnvelopeModel(BaseModel):
    revision: int = Field(ge=0)
    updatedAt: datetime
    state: DiaryStateModel


class SyncPullResponseModel(BaseModel):
    revision: int = Field(ge=0)
    updatedAt: datetime | None = None
    state: DiaryStateModel | None = None


class SyncPushRequestModel(BaseModel):
    baseRevision: int = Field(ge=0)
    state: DiaryStateModel
    force: bool = False


class SyncPushResponseModel(BaseModel):
    status: Literal["ok", "conflict"]
    revision: int = Field(ge=0)
    updatedAt: datetime
    state: DiaryStateModel
