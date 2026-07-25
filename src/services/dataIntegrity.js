import {
  HOUR_STATES,
  TRACKING_HOURS,
  UNDEFINED_ENTRY_VALUE,
  createDefaultHours,
  normalizeHourState,
  normalizeState,
  resolveHourStateRecords,
} from "../domain/diary.js";

const VALID_HOUR_STATE_KEYS = new Set(HOUR_STATES.map((item) => item.key));
const VALID_SLEEP_QUALITY_VALUES = new Set(["poor", "mixed", "good", UNDEFINED_ENTRY_VALUE]);
const VALID_OVERALL_STATUS_VALUES = new Set(["hard", "stable", "good", UNDEFINED_ENTRY_VALUE]);
const DATE_KEY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const TIME_PATTERN = /^\d{2}:\d{2}$/;
const YEAR_PATTERN = /^\d{4}$/;

function cloneSerializable(value) {
  return JSON.parse(JSON.stringify(value));
}

function isValidDateKey(dateKey) {
  if (!DATE_KEY_PATTERN.test(dateKey)) {
    return false;
  }

  const parsed = new Date(`${dateKey}T12:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === dateKey;
}

function isFutureDateKey(dateKey) {
  if (!isValidDateKey(dateKey)) {
    return false;
  }

  const todayKey = new Date().toISOString().slice(0, 10);
  return dateKey > todayKey;
}

function isIsoDateTime(value) {
  if (typeof value !== "string" || !value.trim()) {
    return false;
  }

  return !Number.isNaN(Date.parse(value));
}

function isMeaningfulEntry(entry) {
  if (!entry || typeof entry !== "object") {
    return false;
  }

  if (typeof entry.notes === "string" && entry.notes.trim()) {
    return true;
  }

  if (Array.isArray(entry.medications) && entry.medications.length > 0) {
    return true;
  }

  if (entry.sleepQuality && entry.sleepQuality !== UNDEFINED_ENTRY_VALUE) {
    return true;
  }

  if (entry.overallStatus && entry.overallStatus !== UNDEFINED_ENTRY_VALUE) {
    return true;
  }

  return TRACKING_HOURS.some((hourLabel) => (entry.hourRecords?.[hourLabel]?.length ?? 0) > 0);
}

function buildHourRecordDuplicateKey(record) {
  const recordedAt = typeof record?.recordedAt === "string" ? record.recordedAt : "";
  const stateKey = normalizeHourState(record?.stateKey) ?? "";
  const source = typeof record?.source === "string" ? record.source : "";
  return `${recordedAt}|${stateKey}|${source}`;
}

function pushIssue(target, severity, message, details = {}) {
  target.push({
    severity,
    message,
    ...details,
  });
}

export function auditDiaryState(inputState) {
  const state = normalizeState(cloneSerializable(inputState));
  const issues = [];
  const warnings = [];
  const seenMedicationIds = new Map();
  const seenHourRecordIds = new Map();

  const summary = {
    checkedAt: new Date().toISOString(),
    selectedDate: state.selectedDate,
    entryCount: 0,
    nonEmptyEntryCount: 0,
    medicationCount: 0,
    hourRecordCount: 0,
    deletedDateCount: Object.keys(state.deletedEntryDates ?? {}).length,
    deletedMedicationCount: Object.keys(state.deletedMedicationIds ?? {}).length,
    issueCount: 0,
    warningCount: 0,
  };

  if (!isValidDateKey(state.selectedDate)) {
    pushIssue(issues, "error", "Vybrane datum aplikace nema platny format.", {
      scope: "state",
      field: "selectedDate",
      value: state.selectedDate,
    });
  }

  if (typeof state.birthYear === "string" && state.birthYear.trim() && !YEAR_PATTERN.test(state.birthYear.trim())) {
    pushIssue(warnings, "warning", "Rok narozeni nema ocekavany ctyrmistny format.", {
      scope: "profile",
      field: "birthYear",
      value: state.birthYear,
    });
  }

  for (const [dateKey, deletedAt] of Object.entries(state.deletedEntryDates ?? {})) {
    if (!isValidDateKey(dateKey)) {
      pushIssue(issues, "error", "Mazaci znacka odkazuje na neplatne datum.", {
        scope: "deletedEntryDates",
        dateKey,
        value: deletedAt,
      });
      continue;
    }

    if (!isIsoDateTime(deletedAt)) {
      pushIssue(issues, "error", "Mazaci znacka nema platny cas smazani.", {
        scope: "deletedEntryDates",
        dateKey,
        value: deletedAt,
      });
    }
  }

  for (const [medicationId, deletedAt] of Object.entries(state.deletedMedicationIds ?? {})) {
    if (!medicationId.trim()) {
      pushIssue(issues, "error", "Mazaci znacka davky nema platne ID.", {
        scope: "deletedMedicationIds",
        value: deletedAt,
      });
    }

    if (!isIsoDateTime(deletedAt)) {
      pushIssue(issues, "error", "Mazaci znacka davky nema platny cas smazani.", {
        scope: "deletedMedicationIds",
        value: medicationId,
      });
    }
  }

  for (const [dateKey, entry] of Object.entries(state.entries ?? {})) {
    summary.entryCount += 1;
    if (isMeaningfulEntry(entry)) {
      summary.nonEmptyEntryCount += 1;
    }

    if (!isValidDateKey(dateKey)) {
      pushIssue(issues, "error", "Zaznam ma neplatny klic data.", {
        scope: "entry",
        dateKey,
      });
      continue;
    }

    if (isFutureDateKey(dateKey)) {
      pushIssue(warnings, "warning", "Zaznam je ulozen pro budoucí datum.", {
        scope: "entry",
        dateKey,
      });
    }

    if (entry.updatedAt && !isIsoDateTime(entry.updatedAt)) {
      pushIssue(warnings, "warning", "Zaznam ma neplatny timestamp posledni zmeny.", {
        scope: "entry",
        dateKey,
        field: "updatedAt",
        value: entry.updatedAt,
      });
    }

    if (!VALID_SLEEP_QUALITY_VALUES.has(entry.sleepQuality)) {
      pushIssue(issues, "error", "Zaznam ma neplatnou hodnotu kvality spanku.", {
        scope: "entry",
        dateKey,
        field: "sleepQuality",
        value: entry.sleepQuality,
      });
    }

    if (!VALID_OVERALL_STATUS_VALUES.has(entry.overallStatus)) {
      pushIssue(issues, "error", "Zaznam ma neplatnou hodnotu celkoveho dne.", {
        scope: "entry",
        dateKey,
        field: "overallStatus",
        value: entry.overallStatus,
      });
    }

    const medicationDuplicateKeys = new Set();
    for (const medication of entry.medications ?? []) {
      summary.medicationCount += 1;

      if (!TIME_PATTERN.test(medication.time)) {
        pushIssue(issues, "error", "Davka ma neplatny cas.", {
          scope: "medication",
          dateKey,
          value: `${medication.name} ${medication.dose} @ ${medication.time}`,
        });
      }

      const duplicateKey = `${medication.time}|${medication.name}|${medication.dose}`;
      if (medicationDuplicateKeys.has(duplicateKey)) {
        pushIssue(warnings, "warning", "Den obsahuje duplicitni davku se stejnym casem, nazvem a mnozstvim.", {
          scope: "medication",
          dateKey,
          value: duplicateKey,
        });
      } else {
        medicationDuplicateKeys.add(duplicateKey);
      }

      if (medication.id) {
        const existingMedicationDate = seenMedicationIds.get(medication.id);
        if (existingMedicationDate && existingMedicationDate !== dateKey) {
          pushIssue(warnings, "warning", "Stejne medication id se vyskytuje ve vice dnech.", {
            scope: "medication",
            dateKey,
            value: medication.id,
          });
        } else {
          seenMedicationIds.set(medication.id, dateKey);
        }
      }
    }

    const normalizedHours = {
      ...createDefaultHours(),
      ...(entry.hours ?? {}),
    };

    for (const [hourLabel, records] of Object.entries(entry.hourRecords ?? {})) {
      if (!TRACKING_HOURS.includes(hourLabel)) {
        pushIssue(issues, "error", "Zaznam obsahuje neplatnou hodinu.", {
          scope: "hourRecords",
          dateKey,
          hourLabel,
        });
        continue;
      }

      const duplicateRecordKeys = new Set();
      for (const record of records ?? []) {
        summary.hourRecordCount += 1;

        if (!VALID_HOUR_STATE_KEYS.has(record.stateKey)) {
          pushIssue(issues, "error", "Hodinovy zaznam ma neplatny stav.", {
            scope: "hourRecord",
            dateKey,
            hourLabel,
            value: record.stateKey,
          });
        }

        if (!isIsoDateTime(record.recordedAt)) {
          pushIssue(issues, "error", "Hodinovy zaznam nema platny timestamp.", {
            scope: "hourRecord",
            dateKey,
            hourLabel,
            value: record.recordedAt,
          });
        }

        const duplicateRecordKey = buildHourRecordDuplicateKey(record);
        if (duplicateRecordKeys.has(duplicateRecordKey)) {
          pushIssue(warnings, "warning", "Hodina obsahuje duplicitni hodinovy zaznam se stejnym casem a stavem.", {
            scope: "hourRecord",
            dateKey,
            hourLabel,
            value: duplicateRecordKey,
          });
        } else {
          duplicateRecordKeys.add(duplicateRecordKey);
        }

        if (record.id) {
          const existingHourRecord = seenHourRecordIds.get(record.id);
          const currentLocation = `${dateKey}:${hourLabel}`;
          if (existingHourRecord && existingHourRecord !== currentLocation) {
            pushIssue(warnings, "warning", "Stejne hour record id se vyskytuje na vice mistech.", {
              scope: "hourRecord",
              dateKey,
              hourLabel,
              value: record.id,
            });
          } else {
            seenHourRecordIds.set(record.id, currentLocation);
          }
        }
      }
    }

    for (const hourLabel of TRACKING_HOURS) {
      const resolvedState = resolveHourStateRecords(entry.hourRecords?.[hourLabel] ?? [], "latest");
      const storedState = normalizeHourState(normalizedHours[hourLabel]);

      if (storedState !== resolvedState) {
        pushIssue(warnings, "warning", "Souhrnny stav hodiny neodpovida poslednimu detailnimu zaznamu.", {
          scope: "entry",
          dateKey,
          hourLabel,
          value: `hours=${storedState ?? "null"} vs records=${resolvedState ?? "null"}`,
        });
      }
    }

    const deletionAt = state.deletedEntryDates?.[dateKey] ?? "";
    if (deletionAt && entry.updatedAt && isIsoDateTime(deletionAt) && isIsoDateTime(entry.updatedAt)) {
      if (Date.parse(deletionAt) >= Date.parse(entry.updatedAt)) {
        pushIssue(warnings, "warning", "Den ma zaroven obsah i mazaci znacku, ktera je novejsi nebo stejne nova jako obsah.", {
          scope: "entry",
          dateKey,
          field: "deletedEntryDates",
          value: deletionAt,
        });
      }
    }

    if (!isMeaningfulEntry(entry) && dateKey !== state.selectedDate) {
      pushIssue(warnings, "warning", "Den obsahuje pouze prazdny placeholder bez skutecnych dat.", {
        scope: "entry",
        dateKey,
      });
    }
  }

  summary.issueCount = issues.length;
  summary.warningCount = warnings.length;

  return {
    summary,
    issues,
    warnings,
    isHealthy: issues.length === 0,
  };
}
