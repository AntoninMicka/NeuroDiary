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

export function generateId() {
  if (globalThis.crypto?.randomUUID) {
    return globalThis.crypto.randomUUID();
  }

  return `id-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function getTodayKey() {
  return new Date().toISOString().slice(0, 10);
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
  const hours = {};

  for (const label of TRACKING_HOURS) {
    const hour = Number(label);
    hours[label] = hour < 8 ? "sleep" : hour < 11 ? "on" : hour < 14 ? "partial" : "on";
  }

  return hours;
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
    id: generateId(),
    name: payload.name.trim(),
    dose: payload.dose.trim(),
    time: payload.time,
  };
}

export function createDefaultEntry() {
  return {
    sleepQuality: "good",
    overallStatus: "stable",
    notes: "Morning stiffness improved after first dose. Energy stable in the afternoon.",
    medications: [
      createMedication({ name: "Levodopa", dose: "100 mg", time: "08:00" }),
      createMedication({ name: "Levodopa", dose: "100 mg", time: "13:00" }),
      createMedication({ name: "Levodopa", dose: "100 mg", time: "18:00" }),
    ],
    hours: createDefaultHours(),
  };
}

export function createInitialState() {
  return {
    selectedDate: getTodayKey(),
    patientName: "",
    birthYear: "",
    entries: {},
  };
}

export function normalizeHourState(stateKey) {
  const mapping = {
    slow: "partial",
  };

  const normalizedKey = mapping[stateKey] ?? stateKey;
  return HOUR_STATES.some((item) => item.key === normalizedKey) ? normalizedKey : "on";
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

export function ensureEntry(state, dateKey) {
  if (!state.entries[dateKey]) {
    state.entries[dateKey] = createDefaultEntry();
  }

  state.entries[dateKey].hours = normalizeEntryHours(state.entries[dateKey].hours);

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

  for (const entry of Object.values(state.entries)) {
    entry.hours = normalizeEntryHours(entry.hours);
  }

  ensureEntry(state, state.selectedDate);

  return state;
}

export function summarizeHours(hours) {
  return Object.values(hours).reduce((accumulator, item) => {
    accumulator[item] = (accumulator[item] ?? 0) + 1;
    return accumulator;
  }, {});
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
