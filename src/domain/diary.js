export const HOUR_STATES = [
  { key: "dyskinesia", label: "Mimovolní pohyby", shortLabel: "D", description: "mimovolní pohyby" },
  { key: "on", label: 'Dobrá hybnost ("ON")', shortLabel: "ON", description: "dobrá hybnost" },
  { key: "partial", label: "Ne zcela dobrá hybnost", shortLabel: "MID", description: "ne zcela dobrá hybnost" },
  { key: "off", label: 'Třes, ztuhlost, zpomalenost ("OFF")', shortLabel: "OFF", description: "třes, ztuhlost, zpomalenost" },
  { key: "sleep", label: "Spánek", shortLabel: "S", description: "spánek" },
];

export const TRACKING_HOURS = Array.from({ length: 19 }, (_, index) => {
  const hour = index + 5;
  return String(hour);
});
export const UNDEFINED_ENTRY_VALUE = "undefined";

const HOUR_STATE_KEYS = new Set(HOUR_STATES.map((state) => state.key));
const HOUR_RECORD_DISPLAY_MODES = new Set(["latest", "mostFrequent"]);
const ENTRY_STATUS_VALUES = new Set(["poor", "mixed", "good", "hard", "stable", UNDEFINED_ENTRY_VALUE]);

function cloneSerializable(value) {
  return JSON.parse(JSON.stringify(value));
}

export function generateId() {
  if (globalThis.crypto?.randomUUID) {
    return globalThis.crypto.randomUUID();
  }

  return `id-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function getTodayKey() {
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, "0");
  const day = String(today.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function shiftDateKey(dateKey, deltaDays) {
  const date = new Date(`${dateKey}T12:00:00`);
  date.setDate(date.getDate() + deltaDays);
  return date.toISOString().slice(0, 10);
}

export function formatLongDate(dateKey) {
  const date = new Date(`${dateKey}T12:00:00`);
  return new Intl.DateTimeFormat("cs-CZ", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(date);
}

export function createDefaultHours() {
  return TRACKING_HOURS.reduce((hours, label) => {
    hours[label] = null;
    return hours;
  }, {});
}

export function createHourStateRecord(payload) {
  return {
    id: payload.id ?? generateId(),
    stateKey: normalizeHourState(payload.stateKey),
    recordedAt: payload.recordedAt ?? new Date().toISOString(),
    source: payload.source ?? "manual",
  };
}

export function createHourRecordsFromHours(hours, source = "seed") {
  return TRACKING_HOURS.reduce((accumulator, hourLabel) => {
    const stateKey = hours[hourLabel];
    accumulator[hourLabel] = HOUR_STATE_KEYS.has(stateKey)
      ? [createHourStateRecord({ stateKey, source })]
      : [];
    return accumulator;
  }, {});
}

export function getStateDefinition(stateKey) {
  return HOUR_STATES.find((item) => item.key === stateKey) ?? HOUR_STATES[0];
}

export function getTrackableHourLabel(date = new Date()) {
  const hour = date.getHours();
  if (hour < 5) {
    return "5";
  }
  return String(hour);
}

export function createMedication(payload) {
  const medication = {
    id: payload.id ?? generateId(),
    name: payload.name.trim(),
    dose: payload.dose.trim(),
    time: payload.time,
  };
  if (typeof payload.takenAt === "string" && payload.takenAt) {
    medication.takenAt = payload.takenAt;
  }
  if (typeof payload.recordedAt === "string" && payload.recordedAt) {
    medication.recordedAt = payload.recordedAt;
  }
  if (typeof payload.source === "string" && payload.source) {
    medication.source = payload.source;
  }
  if (typeof payload.planItemId === "string" && payload.planItemId) {
    medication.planItemId = payload.planItemId;
  }
  return medication;
}

export function createTreatmentPlanItem(payload) {
  const item = createMedication(payload);
  item.validFrom = typeof payload.validFrom === "string" ? payload.validFrom : "";
  item.validTo = typeof payload.validTo === "string" ? payload.validTo : "";
  return item;
}

export function isTreatmentPlanItemActiveOnDate(item, dateKey) {
  if (!item || typeof dateKey !== "string") {
    return false;
  }
  const validFrom = typeof item.validFrom === "string" ? item.validFrom : "";
  const validTo = typeof item.validTo === "string" ? item.validTo : "";
  return (!validFrom || validFrom <= dateKey) && (!validTo || dateKey <= validTo);
}

export function getTreatmentPlanForDate(treatmentPlan = [], dateKey) {
  return treatmentPlan
    .filter((item) => isTreatmentPlanItemActiveOnDate(item, dateKey))
    .sort((left, right) => left.time.localeCompare(right.time));
}

export function createDefaultEntry() {
  const hours = createDefaultHours();
  return {
    sleepQuality: UNDEFINED_ENTRY_VALUE,
    overallStatus: UNDEFINED_ENTRY_VALUE,
    notes: "",
    medications: [],
    updatedAt: "",
    hours,
    hourRecords: createHourRecordsFromHours(hours),
  };
}

export function createInitialState() {
  return {
    selectedDate: getTodayKey(),
    patientName: "",
    birthYear: "",
    account: {
      isAuthenticated: false,
      provider: "",
      userId: "",
    },
    treatmentPlan: [],
    deletedEntryDates: {},
    deletedMedicationIds: {},
    entries: {},
  };
}

export function normalizeHourState(stateKey) {
  const mapping = {
    slow: "partial",
  };

  if (stateKey === null || stateKey === undefined || stateKey === "") {
    return null;
  }

  const normalizedKey = mapping[stateKey] ?? stateKey;
  return HOUR_STATES.some((item) => item.key === normalizedKey) ? normalizedKey : null;
}

export function resolveHourStateRecords(records = [], displayMode = "latest") {
  const safeDisplayMode = HOUR_RECORD_DISPLAY_MODES.has(displayMode) ? displayMode : "latest";
  const normalizedRecords = records
    .filter((record) => record && HOUR_STATE_KEYS.has(record.stateKey))
    .sort((left, right) => {
      const leftTime = Date.parse(left.recordedAt ?? "") || 0;
      const rightTime = Date.parse(right.recordedAt ?? "") || 0;
      return leftTime - rightTime;
    });

  if (normalizedRecords.length === 0) {
    return null;
  }

  if (safeDisplayMode === "mostFrequent") {
    const counts = new Map();
    for (const record of normalizedRecords) {
      counts.set(record.stateKey, (counts.get(record.stateKey) ?? 0) + 1);
    }

    return [...counts.entries()].sort((left, right) => right[1] - left[1])[0]?.[0] ?? null;
  }

  return normalizedRecords.at(-1)?.stateKey ?? null;
}

export function normalizeHourRecords(rawRecords = []) {
  if (!Array.isArray(rawRecords) || rawRecords.length === 0) {
    return [];
  }

  const normalizedRecords = rawRecords
    .map((record) =>
      createHourStateRecord({
        id: record?.id,
        stateKey: record?.stateKey ?? record,
        recordedAt: record?.recordedAt,
        source: record?.source ?? "imported",
      }),
    )
    .sort((left, right) => {
      const leftTime = Date.parse(left.recordedAt ?? "") || 0;
      const rightTime = Date.parse(right.recordedAt ?? "") || 0;
      return leftTime - rightTime;
    });

  return normalizedRecords;
}

function buildHourRecordMergeKey(record) {
  const normalizedStateKey = normalizeHourState(record?.stateKey) ?? "";
  const normalizedRecordedAt = typeof record?.recordedAt === "string" ? record.recordedAt : "";
  const normalizedSource = typeof record?.source === "string" ? record.source : "";

  if (normalizedRecordedAt) {
    return `ts:${normalizedRecordedAt}|state:${normalizedStateKey}|source:${normalizedSource}`;
  }

  return `id:${record?.id ?? ""}|state:${normalizedStateKey}|source:${normalizedSource}`;
}

export function normalizeEntryHours(rawHours) {
  const normalizedHours = createDefaultHours();

  if (!rawHours || typeof rawHours !== "object") {
    return normalizedHours;
  }

  for (const [rawLabel, rawState] of Object.entries(rawHours)) {
    const normalizedLabel = rawLabel.endsWith(":00")
      ? String(Number(rawLabel.split(":")[0]))
      : String(Number(rawLabel));

    if (TRACKING_HOURS.includes(normalizedLabel)) {
      normalizedHours[normalizedLabel] = normalizeHourState(rawState);
    }
  }

  return normalizedHours;
}

export function normalizeEntryHourRecords(rawHourRecords, rawHours = null) {
  const normalizedHourRecords = {};

  for (const hourLabel of TRACKING_HOURS) {
    const rawRecords = rawHourRecords?.[hourLabel];
    normalizedHourRecords[hourLabel] = normalizeHourRecords(rawRecords);
  }

  return normalizedHourRecords;
}

export function buildResolvedHoursFromHourRecords(hourRecords, displayMode = "latest") {
  const resolvedHours = {};

  for (const hourLabel of TRACKING_HOURS) {
    const resolvedState = resolveHourStateRecords(hourRecords?.[hourLabel], displayMode);
    resolvedHours[hourLabel] = resolvedState ?? null;
  }

  return resolvedHours;
}

export function reconcileEntryHourState(entry, displayMode = "latest", options = {}) {
  const { hydrateFromHours = true } = options;
  entry.hourRecords = normalizeEntryHourRecords(entry.hourRecords, hydrateFromHours ? entry.hours : null);
  entry.hours = buildResolvedHoursFromHourRecords(entry.hourRecords, displayMode);
  return entry;
}

export function appendHourStateRecord(entry, hourLabel, stateKey, options = {}) {
  const safeHourLabel = String(hourLabel);
  if (!TRACKING_HOURS.includes(safeHourLabel)) {
    return entry;
  }

  if (!HOUR_STATE_KEYS.has(stateKey)) {
    return entry;
  }

  entry.hourRecords = normalizeEntryHourRecords(entry.hourRecords, entry.hours);
  const nextRecord = createHourStateRecord({
    stateKey,
    source: options.source ?? "manual",
    recordedAt: options.recordedAt,
  });

  entry.hourRecords[safeHourLabel].push(nextRecord);
  entry.hours[safeHourLabel] = resolveHourStateRecords(entry.hourRecords[safeHourLabel]) ?? null;
  entry.updatedAt = options.updatedAt ?? new Date().toISOString();
  return entry;
}

export function clearHourStateRecords(entry, hourLabel) {
  const safeHourLabel = String(hourLabel);
  if (!TRACKING_HOURS.includes(safeHourLabel)) {
    return entry;
  }

  entry.hourRecords = normalizeEntryHourRecords(entry.hourRecords, entry.hours);
  entry.hourRecords[safeHourLabel] = [];
  entry.hours[safeHourLabel] = null;
  entry.updatedAt = new Date().toISOString();
  return entry;
}

export function getHourRecordCount(entry, hourLabel) {
  return entry?.hourRecords?.[hourLabel]?.length ?? 0;
}

export function ensureEntry(state, dateKey) {
  if (!state.entries[dateKey]) {
    state.entries[dateKey] = createDefaultEntry();
  }

  reconcileEntryHourState(state.entries[dateKey]);

  return state.entries[dateKey];
}

function normalizeEntryStatusValue(value, allowedValues) {
  return allowedValues.has(value) ? value : UNDEFINED_ENTRY_VALUE;
}

function normalizeTreatmentPlan(rawPlan) {
  if (!Array.isArray(rawPlan)) {
    return [];
  }

  return rawPlan
    .filter((item) => item && typeof item.name === "string" && typeof item.dose === "string" && typeof item.time === "string")
    .map((item) => createTreatmentPlanItem(item))
    .sort((left, right) => left.time.localeCompare(right.time));
}

function normalizeDeletionMap(rawDeletionMap) {
  if (!rawDeletionMap || typeof rawDeletionMap !== "object") {
    return {};
  }

  return Object.fromEntries(
    Object.entries(rawDeletionMap)
      .filter(
        ([dateKey, deletedAt]) =>
          typeof dateKey === "string" && typeof deletedAt === "string" && deletedAt.trim().length > 0,
      )
      .map(([dateKey, deletedAt]) => [dateKey, deletedAt]),
  );
}

function sanitizeStateShape(parsed, { ensureSelectedDate = true, hydrateHourRecordsFromHours = true } = {}) {
  const state = parsed && typeof parsed === "object" ? parsed : createInitialState();

  if (!state.selectedDate) {
    state.selectedDate = getTodayKey();
  }

  if (!state.entries || typeof state.entries !== "object") {
    state.entries = {};
  }

  if (typeof state.patientName !== "string") {
    state.patientName = "";
  }

  if (typeof state.birthYear !== "string") {
    state.birthYear = "";
  }

  if (!state.account || typeof state.account !== "object") {
    state.account = createInitialState().account;
  }

  state.treatmentPlan = normalizeTreatmentPlan(state.treatmentPlan);
  state.deletedEntryDates = normalizeDeletionMap(state.deletedEntryDates);
  state.deletedMedicationIds = normalizeDeletionMap(state.deletedMedicationIds);

  state.account.isAuthenticated = state.account.isAuthenticated === true;
  state.account.provider = typeof state.account.provider === "string" ? state.account.provider : "";
  state.account.userId = typeof state.account.userId === "string" ? state.account.userId : "";

  for (const entry of Object.values(state.entries)) {
    if (typeof entry.notes !== "string") {
      entry.notes = "";
    }
    entry.updatedAt = typeof entry.updatedAt === "string" ? entry.updatedAt : "";
    entry.sleepQuality = normalizeEntryStatusValue(entry.sleepQuality, new Set(["poor", "mixed", "good", UNDEFINED_ENTRY_VALUE]));
    entry.overallStatus = normalizeEntryStatusValue(entry.overallStatus, new Set(["hard", "stable", "good", UNDEFINED_ENTRY_VALUE]));
    if (!Array.isArray(entry.medications)) {
      entry.medications = [];
    } else {
      entry.medications = entry.medications
        .filter((item) => item && typeof item.name === "string" && typeof item.dose === "string" && typeof item.time === "string")
        .map((item) => createMedication(item))
        .filter((item) => !state.deletedMedicationIds[item.id])
        .sort((left, right) => left.time.localeCompare(right.time));
    }
    reconcileEntryHourState(entry, "latest", { hydrateFromHours: hydrateHourRecordsFromHours });
  }

  if (ensureSelectedDate) {
    ensureEntry(state, state.selectedDate);
  }

  return state;
}

export function normalizeState(parsed) {
  return sanitizeStateShape(parsed, { ensureSelectedDate: true, hydrateHourRecordsFromHours: true });
}

export function normalizeStateForSync(parsed) {
  return sanitizeStateShape(parsed, { ensureSelectedDate: false, hydrateHourRecordsFromHours: false });
}

export function entryHasMeaningfulData(entry) {
  if (!entry || typeof entry !== "object") {
    return false;
  }

  if (typeof entry.notes === "string" && entry.notes.trim()) {
    return true;
  }

  if ((entry.medications?.length ?? 0) > 0) {
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

export function clearDeletedEntryDate(state, dateKey) {
  if (!state.deletedEntryDates || typeof state.deletedEntryDates !== "object") {
    state.deletedEntryDates = {};
  }

  delete state.deletedEntryDates[dateKey];
}

export function markEntryDeleted(state, dateKey, deletedAt = new Date().toISOString()) {
  if (!state.deletedEntryDates || typeof state.deletedEntryDates !== "object") {
    state.deletedEntryDates = {};
  }

  state.deletedEntryDates[dateKey] = deletedAt;
  delete state.entries[dateKey];
}

export function markMedicationDeleted(state, medicationId, deletedAt = new Date().toISOString()) {
  if (!state.deletedMedicationIds || typeof state.deletedMedicationIds !== "object") {
    state.deletedMedicationIds = {};
  }

  state.deletedMedicationIds[medicationId] = deletedAt;
  for (const entry of Object.values(state.entries ?? {})) {
    entry.medications = (entry.medications ?? []).filter((item) => item.id !== medicationId);
  }
}

export function prepareStateForSync(state) {
  const preparedState = normalizeStateForSync(cloneSerializable(state));

  for (const dateKey of Object.keys(preparedState.entries)) {
    const entry = preparedState.entries[dateKey];
    const deletedAt = preparedState.deletedEntryDates[dateKey] ?? "";
    const entryUpdatedAt = typeof entry.updatedAt === "string" ? entry.updatedAt : "";
    const deletionWins = deletedAt && compareIsoDateTimes(deletedAt, entryUpdatedAt || "") >= 0;

    if (deletionWins || !entryHasMeaningfulData(entry)) {
      delete preparedState.entries[dateKey];
    } else {
      entry.hours = buildResolvedHoursFromHourRecords(entry.hourRecords, "latest");
    }
  }

  return preparedState;
}

export function summarizeHours(hours) {
  return Object.values(hours).reduce((accumulator, item) => {
    if (!HOUR_STATE_KEYS.has(item)) {
      return accumulator;
    }
    accumulator[item] = (accumulator[item] ?? 0) + 1;
    return accumulator;
  }, {});
}

export function mergeDiaryStatesAppendOnly(baseState, incomingState) {
  const normalizedBaseState = normalizeStateForSync(cloneSerializable(baseState));
  const normalizedIncomingState = normalizeStateForSync(cloneSerializable(incomingState));
  const mergedState = normalizeStateForSync(cloneSerializable(baseState));
  const allDateKeys = new Set([
    ...Object.keys(normalizedBaseState.entries ?? {}),
    ...Object.keys(normalizedIncomingState.entries ?? {}),
    ...Object.keys(normalizedBaseState.deletedEntryDates ?? {}),
    ...Object.keys(normalizedIncomingState.deletedEntryDates ?? {}),
  ]);

  mergedState.patientName = selectPreferredProfileValue(
    normalizedBaseState.patientName,
    normalizedIncomingState.patientName,
  );
  mergedState.birthYear = selectPreferredProfileValue(
    normalizedBaseState.birthYear,
    normalizedIncomingState.birthYear,
  );
  mergedState.account = {
    ...normalizedBaseState.account,
    ...normalizedIncomingState.account,
  };
  mergedState.treatmentPlan = replaceTreatmentPlan(
    normalizedBaseState.treatmentPlan,
    normalizedIncomingState.treatmentPlan,
  );
  mergedState.deletedEntryDates = {
    ...normalizedBaseState.deletedEntryDates,
    ...normalizedIncomingState.deletedEntryDates,
  };
  mergedState.deletedMedicationIds = mergeDeletionMaps(
    normalizedBaseState.deletedMedicationIds,
    normalizedIncomingState.deletedMedicationIds,
  );

  for (const dateKey of allDateKeys) {
    const deletionAt = selectLatestIsoDateTime(
      normalizedBaseState.deletedEntryDates?.[dateKey] ?? "",
      normalizedIncomingState.deletedEntryDates?.[dateKey] ?? "",
    );
    const rawBaseEntry = normalizedBaseState.entries[dateKey] ?? null;
    const rawIncomingEntry = normalizedIncomingState.entries[dateKey] ?? null;
    const baseEntryUpdatedAt = rawBaseEntry?.updatedAt ?? "";
    const incomingEntryUpdatedAt = rawIncomingEntry?.updatedAt ?? "";
    const baseEntry =
      deletionAt && compareIsoDateTimes(deletionAt, baseEntryUpdatedAt) >= 0 ? null : rawBaseEntry;
    const incomingEntry =
      deletionAt && compareIsoDateTimes(deletionAt, incomingEntryUpdatedAt) >= 0 ? null : rawIncomingEntry;
    const latestEntryUpdatedAt = selectLatestIsoDateTime(baseEntryUpdatedAt, incomingEntryUpdatedAt);

    if (deletionAt && compareIsoDateTimes(deletionAt, latestEntryUpdatedAt) >= 0) {
      delete mergedState.entries[dateKey];
      mergedState.deletedEntryDates[dateKey] = deletionAt;
      continue;
    }

    const mergedEntryBase = mergedState.entries[dateKey] ?? baseEntry ?? createDefaultEntry();
    const incomingEntryIsNewer = incomingEntry && (
      !baseEntry || compareIsoDateTimes(incomingEntryUpdatedAt, baseEntryUpdatedAt) >= 0
    );
    const preferredEntry = incomingEntryIsNewer ? incomingEntry : (baseEntry ?? mergedEntryBase);
    ensureEntry(mergedState, dateKey);

    mergedState.entries[dateKey] = {
      ...mergedEntryBase,
      ...incomingEntry,
      notes: preferredEntry.notes ?? "",
      sleepQuality: preferredEntry.sleepQuality ?? UNDEFINED_ENTRY_VALUE,
      overallStatus: preferredEntry.overallStatus ?? UNDEFINED_ENTRY_VALUE,
      medications: mergeMedicationsAppendOnly(mergedEntryBase.medications, incomingEntry?.medications),
      hourRecords: mergeHourRecordsAppendOnly(mergedEntryBase.hourRecords, incomingEntry?.hourRecords),
      updatedAt: selectLatestIsoDateTime(mergedEntryBase.updatedAt ?? "", incomingEntry?.updatedAt ?? ""),
    };

    reconcileEntryHourState(mergedState.entries[dateKey]);
    if (deletionAt) {
      mergedState.deletedEntryDates[dateKey] = deletionAt;
    }
  }

  return normalizeState(mergedState);
}

function compareIsoDateTimes(leftValue = "", rightValue = "") {
  const leftTime = Date.parse(leftValue || "") || 0;
  const rightTime = Date.parse(rightValue || "") || 0;
  if (leftTime === rightTime) {
    return 0;
  }
  return leftTime > rightTime ? 1 : -1;
}

function selectLatestIsoDateTime(leftValue = "", rightValue = "") {
  return compareIsoDateTimes(leftValue, rightValue) >= 0 ? leftValue : rightValue;
}

function mergeDeletionMaps(baseMap = {}, incomingMap = {}) {
  const mergedMap = { ...baseMap };
  for (const [key, incomingDeletedAt] of Object.entries(incomingMap)) {
    mergedMap[key] = selectLatestIsoDateTime(mergedMap[key] ?? "", incomingDeletedAt);
  }
  return mergedMap;
}

function selectPreferredProfileValue(baseValue = "", incomingValue = "") {
  const normalizedBaseValue = typeof baseValue === "string" ? baseValue : "";
  const normalizedIncomingValue = typeof incomingValue === "string" ? incomingValue : "";
  if (normalizedIncomingValue.trim()) {
    return normalizedIncomingValue;
  }
  return normalizedBaseValue;
}

function replaceTreatmentPlan(basePlan = [], incomingPlan = []) {
  const mergedById = new Map();
  for (const item of [...basePlan, ...incomingPlan]) {
    const existing = mergedById.get(item.id);
    if (!existing) {
      mergedById.set(item.id, { ...item });
      continue;
    }
    mergedById.set(item.id, {
      ...existing,
      ...item,
      validFrom: item.validFrom || existing.validFrom || "",
      validTo:
        item.validTo && existing.validTo
          ? [item.validTo, existing.validTo].sort().at(-1)
          : item.validTo || existing.validTo || "",
    });
  }
  return [...mergedById.values()]
    .sort((left, right) => left.time.localeCompare(right.time));
}

function mergeMedicationsAppendOnly(baseMedications = [], incomingMedications = []) {
  const mergedById = new Map();

  for (const medication of [...baseMedications, ...incomingMedications]) {
    const mergeKey = medication.id
      ? `id:${medication.id}`
      : `legacy:${medication.time}|${medication.name}|${medication.dose}`;
    if (!mergedById.has(mergeKey)) {
      mergedById.set(mergeKey, { ...medication });
    }
  }

  return [...mergedById.values()]
    .sort((left, right) => left.time.localeCompare(right.time));
}

function mergeHourRecordsAppendOnly(baseHourRecords = {}, incomingHourRecords = {}) {
  const mergedHourRecords = normalizeEntryHourRecords(baseHourRecords);

  for (const hourLabel of TRACKING_HOURS) {
    const mergedByKey = new Map(
      mergedHourRecords[hourLabel].map((record) => [buildHourRecordMergeKey(record), record]),
    );
    for (const record of normalizeHourRecords(incomingHourRecords[hourLabel])) {
      const mergeKey = buildHourRecordMergeKey(record);
      if (!mergedByKey.has(mergeKey)) {
        mergedByKey.set(mergeKey, record);
      }
    }
    mergedHourRecords[hourLabel] = [...mergedByKey.values()].sort((left, right) => {
      const leftTime = Date.parse(left.recordedAt ?? "") || 0;
      const rightTime = Date.parse(right.recordedAt ?? "") || 0;
      return leftTime - rightTime;
    });
  }

  return mergedHourRecords;
}

export function formatSleepQuality(value) {
  const mapping = {
    poor: "Špatná",
    mixed: "Proměnlivá",
    good: "Dobrá",
    [UNDEFINED_ENTRY_VALUE]: "Nedefinováno",
  };

  return mapping[value] ?? value;
}

export function formatOverallStatus(value) {
  const mapping = {
    hard: "Náročný den",
    stable: "Stabilní den",
    good: "Dobrý den",
    [UNDEFINED_ENTRY_VALUE]: "Nedefinováno",
  };

  return mapping[value] ?? value;
}
