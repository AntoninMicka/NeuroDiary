export const HOUR_STATES = [
  { key: "dyskinesia", label: "Mimovolni pohyby", shortLabel: "D", description: "mimovolni pohyby" },
  { key: "on", label: 'Dobra hybnost ("ON")', shortLabel: "ON", description: "dobra hybnost" },
  { key: "partial", label: "Ne zcela dobra hybnost", shortLabel: "MID", description: "ne zcela dobra hybnost" },
  { key: "off", label: 'Tres, ztuhlost, zpomalenost ("OFF")', shortLabel: "OFF", description: "tres, ztuhlost, zpomalenost" },
  { key: "sleep", label: "Spanek", shortLabel: "S", description: "spanek" },
];

export const TRACKING_HOURS = Array.from({ length: 20 }, (_, index) => {
  const hour = index + 5;
  return String(hour);
});

const HOUR_STATE_KEYS = new Set(HOUR_STATES.map((state) => state.key));
const HOUR_RECORD_DISPLAY_MODES = new Set(["latest", "mostFrequent"]);

const DEMO_NOTES = [
  "Ranni ztuhlost se zlepsila po prvni davce.",
  "Po obede prislo mirne zpomaleni a horsi jistota chuze.",
  "Odpoledne dobra hybnost, vecer unava a zpomaleni.",
  "Dopoledne stabilni, po 17. hodine kratky OFF.",
  "Po prochazce lepsi koordinace a mene tresu.",
  "Vyraznejsi tres pred polednem, po dalsi davce zmirneni.",
  "Vecer znatelna unava a horsi obratnost pri chuzi.",
  "Dnes kolisani hybnosti bez jasneho vzorce.",
  "Dopoledne dobra kontrola hybnosti, po obede zpomaleni.",
  "Kratka epizoda mimovolnich pohybu v odpolednich hodinach.",
];

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
  return new Date().toISOString().slice(0, 10);
}

export function shiftDateKey(dateKey, deltaDays) {
  const date = new Date(`${dateKey}T12:00:00`);
  date.setDate(date.getDate() + deltaDays);
  return date.toISOString().slice(0, 10);
}

export function formatLongDate(dateKey) {
  const date = new Date(`${dateKey}T12:00:00`);
  return new Intl.DateTimeFormat("en", {
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
  if (hour === 0) {
    return "24";
  }
  if (hour < 5) {
    return "5";
  }
  if (hour > 24) {
    return "24";
  }
  return String(hour);
}

export function createMedication(payload) {
  return {
    id: payload.id ?? generateId(),
    name: payload.name.trim(),
    dose: payload.dose.trim(),
    time: payload.time,
  };
}

export function createDefaultEntry() {
  const hours = createDefaultHours();
  return {
    isDemo: false,
    sleepQuality: "good",
    overallStatus: "stable",
    notes: "",
    medications: [],
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
    entries: {},
  };
}

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomChoice(items) {
  return items[randomInt(0, items.length - 1)];
}

function maybe(probability) {
  return Math.random() < probability;
}

function randomStatus(weights) {
  const total = weights.reduce((sum, item) => sum + item.weight, 0);
  let target = Math.random() * total;

  for (const item of weights) {
    target -= item.weight;
    if (target <= 0) {
      return item.key;
    }
  }

  return weights.at(-1)?.key ?? "on";
}

function buildDayProfile() {
  return {
    morningTough: maybe(0.45),
    noonDip: maybe(0.55),
    afternoonRecovery: maybe(0.58),
    eveningWearOff: maybe(0.62),
    dyskinesia: maybe(0.22),
    strongOffDay: maybe(0.18),
    veryGoodDay: maybe(0.16),
  };
}

function createSimulatedHours(profile) {
  const hours = {};

  for (const label of TRACKING_HOURS) {
    const hour = Number(label);
    let stateKey = "on";

    if (hour < 8) {
      stateKey = "sleep";
    } else if (hour < 10) {
      stateKey = randomStatus([
        { key: "on", weight: profile.veryGoodDay ? 8 : 5 },
        { key: "partial", weight: profile.morningTough ? 4 : 1.5 },
        { key: "off", weight: profile.strongOffDay ? 2 : 0.4 },
        { key: "dyskinesia", weight: profile.dyskinesia && hour === 9 ? 1.4 : 0.1 },
      ]);
    } else if (hour < 12) {
      stateKey = randomStatus([
        { key: "on", weight: profile.veryGoodDay ? 7 : 4.5 },
        { key: "partial", weight: profile.morningTough ? 4.5 : 2 },
        { key: "off", weight: profile.strongOffDay ? 2.5 : 0.6 },
        { key: "dyskinesia", weight: profile.dyskinesia ? 0.8 : 0.1 },
      ]);
    } else if (hour < 14) {
      stateKey = randomStatus([
        { key: "on", weight: 2.8 },
        { key: "partial", weight: profile.noonDip ? 4.8 : 3 },
        { key: "off", weight: profile.strongOffDay || profile.noonDip ? 2.6 : 0.8 },
        { key: "dyskinesia", weight: profile.dyskinesia ? 0.7 : 0.1 },
      ]);
    } else if (hour < 16) {
      stateKey = randomStatus([
        { key: "on", weight: profile.afternoonRecovery ? 5.5 : 3.4 },
        { key: "partial", weight: 2.6 },
        { key: "off", weight: profile.strongOffDay ? 2.2 : 0.8 },
        { key: "dyskinesia", weight: profile.dyskinesia && maybe(0.5) ? 1.1 : 0.1 },
      ]);
    } else if (hour < 18) {
      stateKey = randomStatus([
        { key: "on", weight: profile.afternoonRecovery ? 5.2 : 3.5 },
        { key: "partial", weight: 2.4 },
        { key: "off", weight: profile.strongOffDay ? 1.8 : 0.5 },
        { key: "dyskinesia", weight: profile.dyskinesia ? 1.4 : 0.1 },
      ]);
    } else if (hour < 20) {
      stateKey = randomStatus([
        { key: "on", weight: profile.veryGoodDay ? 5 : 3.2 },
        { key: "partial", weight: profile.eveningWearOff ? 3.8 : 2.2 },
        { key: "off", weight: profile.strongOffDay ? 1.8 : 0.6 },
        { key: "dyskinesia", weight: profile.dyskinesia ? 0.9 : 0.1 },
      ]);
    } else if (hour < 22) {
      stateKey = randomStatus([
        { key: "on", weight: 1.8 },
        { key: "partial", weight: profile.eveningWearOff ? 4.2 : 2.8 },
        { key: "off", weight: profile.strongOffDay || profile.eveningWearOff ? 3 : 1.2 },
      ]);
    } else {
      stateKey = randomStatus([
        { key: "on", weight: 1.4 },
        { key: "partial", weight: 2.1 },
        { key: "off", weight: profile.eveningWearOff ? 4.4 : 2.2 },
      ]);
    }

    hours[label] = stateKey;
  }

  return hours;
}

function createSimulatedMedications(dayOffset, dateKey) {
  const morningShift = randomChoice([-15, -10, -5, 0, 10, 15]);
  const noonShift = randomChoice([-20, -10, -5, 0, 10, 15]);
  const eveningShift = randomChoice([-15, -10, 0, 5, 10, 20]);

  const medications = [
    createMedication({
      id: `demo-${dateKey}-levodopa-morning`,
      name: "Levodopa",
      dose: randomChoice(["100 mg", "100 mg", "100 mg", "125 mg"]),
      time: formatShiftedTime(8, 0, morningShift),
    }),
    createMedication({
      id: `demo-${dateKey}-levodopa-noon`,
      name: "Levodopa",
      dose: "100 mg",
      time: formatShiftedTime(13, 0, noonShift),
    }),
    createMedication({
      id: `demo-${dateKey}-levodopa-evening`,
      name: "Levodopa",
      dose: "100 mg",
      time: formatShiftedTime(18, 0, eveningShift),
    }),
  ];

  if (randomInt(0, 100) > 64) {
    medications.push(
      createMedication({
        id: `demo-${dateKey}-amantadine`,
        name: "Amantadin",
        dose: "100 mg",
        time: formatShiftedTime(15, 30, randomChoice([-15, -5, 0, 10, 20])),
      }),
    );
  }

  if (randomInt(0, 100) > 82) {
    medications.push(
      createMedication({
        id: `demo-${dateKey}-night-dose`,
        name: "Levodopa CR",
        dose: "100 mg",
        time: formatShiftedTime(21, 30, randomChoice([-10, 0, 10])),
      }),
    );
  }

  return medications.sort((left, right) => left.time.localeCompare(right.time));
}

function formatShiftedTime(hours, minutes, shiftMinutes) {
  const date = new Date(Date.UTC(2024, 0, 1, hours, minutes + shiftMinutes, 0));
  return date.toISOString().slice(11, 16);
}

function deriveDayMeta(hours) {
  const values = Object.values(hours);
  const offCount = values.filter((item) => item === "off").length;
  const partialCount = values.filter((item) => item === "partial").length;
  const dyskinesiaCount = values.filter((item) => item === "dyskinesia").length;

  let overallStatus = "stable";
  if (offCount >= 4 || partialCount >= 7) {
    overallStatus = "hard";
  } else if (offCount <= 1 && partialCount <= 3 && dyskinesiaCount <= 1) {
    overallStatus = "good";
  }

  const sleepQuality = randomStatus([
    { key: "good", weight: 4.8 },
    { key: "mixed", weight: 2.6 },
    { key: "poor", weight: 1.4 },
  ]);

  return { overallStatus, sleepQuality };
}

function buildEntrySignature(entry) {
  return JSON.stringify({
    overallStatus: entry.overallStatus,
    sleepQuality: entry.sleepQuality,
    medications: entry.medications.map((item) => `${item.name}-${item.time}-${item.dose}`),
    hours: TRACKING_HOURS.map((label) => entry.hours[label]),
  });
}

function createSimulatedEntry(dateKey, previousSignature = null) {
  let attempt = 0;

  while (attempt < 6) {
    const profile = buildDayProfile();
    const hours = createSimulatedHours(profile);
    const meta = deriveDayMeta(hours);
    const note = randomChoice(DEMO_NOTES);

    const entry = {
      isDemo: true,
      sleepQuality: meta.sleepQuality,
      overallStatus: meta.overallStatus,
      notes: note,
      medications: createSimulatedMedications(attempt, dateKey),
      hours,
      hourRecords: createHourRecordsFromHours(hours, "demo"),
    };

    const signature = buildEntrySignature(entry);
    if (signature !== previousSignature) {
      return { entry, signature };
    }

    attempt += 1;
  }

  const fallbackHours = createSimulatedHours(buildDayProfile());
  const fallbackMeta = deriveDayMeta(fallbackHours);
  const fallbackEntry = {
    isDemo: true,
    sleepQuality: fallbackMeta.sleepQuality,
    overallStatus: fallbackMeta.overallStatus,
    notes: randomChoice(DEMO_NOTES),
    medications: createSimulatedMedications(randomInt(0, 999), dateKey),
    hours: fallbackHours,
    hourRecords: createHourRecordsFromHours(fallbackHours, "demo"),
  };

  return { entry: fallbackEntry, signature: buildEntrySignature(fallbackEntry) };
}

export function createDemoState(days = 21) {
  const state = createInitialState();
  state.patientName = "Jan Novak";
  state.birthYear = "1958";
  let previousSignature = null;
  const demoDays = Math.max(days - 1, 0);

  for (let offset = demoDays; offset >= 1; offset -= 1) {
    const dateKey = shiftDateKey(state.selectedDate, -offset);
    const { entry, signature } = createSimulatedEntry(dateKey, previousSignature);
    state.entries[dateKey] = entry;
    previousSignature = signature;
  }

  state.entries[state.selectedDate] = createDefaultEntry();

  return state;
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

export function normalizeHourRecords(rawRecords = [], fallbackStateKey = "on") {
  if (!Array.isArray(rawRecords) || rawRecords.length === 0) {
    return HOUR_STATE_KEYS.has(fallbackStateKey)
      ? [createHourStateRecord({ stateKey: fallbackStateKey, source: "legacy" })]
      : [];
  }

  const normalizedRecords = rawRecords
    .map((record) =>
      createHourStateRecord({
        id: record?.id,
        stateKey: record?.stateKey ?? record,
        recordedAt: record?.recordedAt,
        source: record?.source ?? "legacy",
      }),
    )
    .sort((left, right) => {
      const leftTime = Date.parse(left.recordedAt ?? "") || 0;
      const rightTime = Date.parse(right.recordedAt ?? "") || 0;
      return leftTime - rightTime;
    });

  return normalizedRecords.length > 0
    ? normalizedRecords
    : HOUR_STATE_KEYS.has(fallbackStateKey)
      ? [createHourStateRecord({ stateKey: fallbackStateKey, source: "legacy" })]
      : [];
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
  const fallbackHours = rawHours ? normalizeEntryHours(rawHours) : createDefaultHours();
  const normalizedHourRecords = {};

  for (const hourLabel of TRACKING_HOURS) {
    const rawRecords = rawHourRecords?.[hourLabel];
    normalizedHourRecords[hourLabel] = normalizeHourRecords(rawRecords, fallbackHours[hourLabel]);
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

export function reconcileEntryHourState(entry, displayMode = "latest") {
  entry.hourRecords = normalizeEntryHourRecords(entry.hourRecords, entry.hours);
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
  return entry;
}

export function getHourRecordCount(entry, hourLabel) {
  return entry?.hourRecords?.[hourLabel]?.length ?? 0;
}

export function entryContainsDemoData(entry) {
  return entry?.isDemo === true;
}

export function stateContainsDemoData(state) {
  return Object.values(state?.entries ?? {}).some((entry) => entryContainsDemoData(entry));
}

export function ensureEntry(state, dateKey) {
  if (!state.entries[dateKey]) {
    state.entries[dateKey] = createDefaultEntry();
  }

  if (typeof state.entries[dateKey].isDemo !== "boolean") {
    state.entries[dateKey].isDemo = false;
  }

  reconcileEntryHourState(state.entries[dateKey]);

  return state.entries[dateKey];
}

export function normalizeState(parsed) {
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

  state.account.isAuthenticated = state.account.isAuthenticated === true;
  state.account.provider = typeof state.account.provider === "string" ? state.account.provider : "";
  state.account.userId = typeof state.account.userId === "string" ? state.account.userId : "";

  for (const entry of Object.values(state.entries)) {
    if (typeof entry.isDemo !== "boolean") {
      entry.isDemo = false;
    }
    reconcileEntryHourState(entry);
  }

  ensureEntry(state, state.selectedDate);

  return state;
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
  const normalizedBaseState = normalizeState(cloneSerializable(baseState));
  const normalizedIncomingState = normalizeState(cloneSerializable(incomingState));
  const mergedState = normalizeState(cloneSerializable(baseState));

  // Patient profile should follow the side that is currently being merged in,
  // including intentional clears to an empty string.
  mergedState.patientName = normalizedIncomingState.patientName ?? normalizedBaseState.patientName;
  mergedState.birthYear = normalizedIncomingState.birthYear ?? normalizedBaseState.birthYear;
  mergedState.account = {
    ...normalizedBaseState.account,
    ...normalizedIncomingState.account,
  };

  for (const [dateKey, incomingEntry] of Object.entries(normalizedIncomingState.entries)) {
    const baseEntry = mergedState.entries[dateKey] ?? createDefaultEntry();
    ensureEntry(mergedState, dateKey);

    mergedState.entries[dateKey] = {
      ...baseEntry,
      ...incomingEntry,
      isDemo: baseEntry.isDemo || incomingEntry.isDemo,
      medications: replaceMedications(baseEntry.medications, incomingEntry.medications),
      hourRecords: mergeHourRecordsAppendOnly(baseEntry.hourRecords, incomingEntry.hourRecords),
    };

    reconcileEntryHourState(mergedState.entries[dateKey]);
  }

  return normalizeState(mergedState);
}

function replaceMedications(baseMedications = [], incomingMedications = []) {
  const sourceMedications = Array.isArray(incomingMedications) ? incomingMedications : baseMedications;
  return sourceMedications
    .map((medication) => ({ ...medication }))
    .sort((left, right) => left.time.localeCompare(right.time));
}

function mergeHourRecordsAppendOnly(baseHourRecords = {}, incomingHourRecords = {}) {
  const mergedHourRecords = normalizeEntryHourRecords(baseHourRecords);

  for (const hourLabel of TRACKING_HOURS) {
    const mergedById = new Map(mergedHourRecords[hourLabel].map((record) => [record.id, record]));
    for (const record of normalizeHourRecords(incomingHourRecords[hourLabel], mergedHourRecords[hourLabel][0]?.stateKey)) {
      if (!mergedById.has(record.id)) {
        mergedById.set(record.id, record);
      }
    }
    mergedHourRecords[hourLabel] = [...mergedById.values()].sort((left, right) => {
      const leftTime = Date.parse(left.recordedAt ?? "") || 0;
      const rightTime = Date.parse(right.recordedAt ?? "") || 0;
      return leftTime - rightTime;
    });
  }

  return mergedHourRecords;
}

export function formatSleepQuality(value) {
  const mapping = {
    poor: "Spatna",
    mixed: "Promenliva",
    good: "Dobra",
  };

  return mapping[value] ?? value;
}

export function formatOverallStatus(value) {
  const mapping = {
    hard: "Narocny den",
    stable: "Stabilni den",
    good: "Dobry den",
  };

  return mapping[value] ?? value;
}
