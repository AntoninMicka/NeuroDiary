const STORAGE_KEY = "neurodiary-vue-poc-v1";

export const HOUR_STATES = [
  { key: "on", label: "ON", description: "steady movement" },
  { key: "slow", label: "SLOW", description: "slower movement" },
  { key: "off", label: "OFF", description: "strong symptoms" },
  { key: "sleep", label: "SLEEP", description: "resting or asleep" },
];

function generateId() {
  if (globalThis.crypto?.randomUUID) {
    return globalThis.crypto.randomUUID();
  }

  return `id-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function getTodayKey() {
  return new Date().toISOString().slice(0, 10);
}

function createDefaultHours() {
  const hours = {};

  for (let hour = 6; hour <= 21; hour += 1) {
    const label = `${String(hour).padStart(2, "0")}:00`;
    hours[label] = hour < 8 ? "sleep" : hour < 11 ? "on" : hour < 14 ? "slow" : "on";
  }

  return hours;
}

function createDefaultEntry() {
  return {
    sleepQuality: "good",
    overallStatus: "stable",
    notes: "Morning stiffness improved after first dose. Energy stable in the afternoon.",
    medications: [
      { id: generateId(), name: "Levodopa", dose: "100 mg", time: "08:00" },
      { id: generateId(), name: "Levodopa", dose: "100 mg", time: "13:00" },
      { id: generateId(), name: "Levodopa", dose: "100 mg", time: "18:00" },
    ],
    hours: createDefaultHours(),
  };
}

function createInitialState() {
  return {
    selectedDate: getTodayKey(),
    entries: {},
  };
}

function normalizeState(parsed) {
  const state = parsed && typeof parsed === "object" ? parsed : createInitialState();

  if (!state.selectedDate) {
    state.selectedDate = getTodayKey();
  }

  if (!state.entries || typeof state.entries !== "object") {
    state.entries = {};
  }

  if (!state.entries[state.selectedDate]) {
    state.entries[state.selectedDate] = createDefaultEntry();
  }

  return state;
}

export function loadState() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    return normalizeState(createInitialState());
  }

  try {
    return normalizeState(JSON.parse(raw));
  } catch {
    return normalizeState(createInitialState());
  }
}

export function saveState(state) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

export function resetState() {
  const state = createInitialState();
  state.entries[state.selectedDate] = createDefaultEntry();
  saveState(state);
  return state;
}

export function ensureEntry(state, dateKey) {
  if (!state.entries[dateKey]) {
    state.entries[dateKey] = createDefaultEntry();
  }

  return state.entries[dateKey];
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

export function createMedication(payload) {
  return {
    id: generateId(),
    name: payload.name.trim(),
    dose: payload.dose.trim(),
    time: payload.time,
  };
}
