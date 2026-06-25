export const HOUR_STATES = [
  { key: "on", label: "ON", description: "steady movement" },
  { key: "slow", label: "SLOW", description: "slower movement" },
  { key: "off", label: "OFF", description: "strong symptoms" },
  { key: "sleep", label: "SLEEP", description: "resting or asleep" },
];

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

  for (let hour = 6; hour <= 21; hour += 1) {
    const label = `${String(hour).padStart(2, "0")}:00`;
    hours[label] = hour < 8 ? "sleep" : hour < 11 ? "on" : hour < 14 ? "slow" : "on";
  }

  return hours;
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
    entries: {},
  };
}

export function ensureEntry(state, dateKey) {
  if (!state.entries[dateKey]) {
    state.entries[dateKey] = createDefaultEntry();
  }

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

  ensureEntry(state, state.selectedDate);

  return state;
}
