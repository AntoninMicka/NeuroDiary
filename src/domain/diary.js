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

const DEMO_NOTES = [
  "Ranni ztuhlost se zlepsila po prvni davce.",
  "Po obede prislo mirne zpomaleni a horsi jistota chuze.",
  "Odpoledne dobra hybnost, vecer unava a zpomaleni.",
  "Dopoledne stabilni, po 17. hodine kratky OFF.",
  "Po prochazce lepsi koordinace a mene tresu.",
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
    id: payload.id ?? generateId(),
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

function createSimulatedHours(dayOffset) {
  const hours = {};

  for (const label of TRACKING_HOURS) {
    const hour = Number(label);
    let stateKey = "on";

    if (hour < 8) {
      stateKey = "sleep";
    } else if (hour < 10) {
      stateKey = dayOffset % 6 === 2 && hour === 9 ? "dyskinesia" : "on";
    } else if (hour < 12) {
      stateKey = dayOffset % 3 === 0 ? "partial" : "on";
    } else if (hour < 14) {
      stateKey = "partial";
    } else if (hour < 16) {
      stateKey = dayOffset % 4 === 1 ? "off" : "on";
    } else if (hour < 18) {
      stateKey = dayOffset % 5 === 3 && hour === 17 ? "dyskinesia" : "on";
    } else if (hour < 20) {
      stateKey = dayOffset % 3 === 1 ? "partial" : "on";
    } else if (hour < 22) {
      stateKey = dayOffset % 4 === 0 ? "off" : "partial";
    } else {
      stateKey = dayOffset % 6 === 0 ? "off" : "on";
    }

    hours[label] = stateKey;
  }

  return hours;
}

function createSimulatedMedications(dayOffset, dateKey) {
  const shifts = [0, 10, -10, 15, -5];
  const morningShift = shifts[dayOffset % shifts.length];
  const noonShift = shifts[(dayOffset + 2) % shifts.length];
  const eveningShift = shifts[(dayOffset + 4) % shifts.length];

  const medications = [
    createMedication({
      id: `demo-${dateKey}-levodopa-morning`,
      name: "Levodopa",
      dose: dayOffset % 7 === 0 ? "125 mg" : "100 mg",
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

  if (dayOffset % 4 === 0) {
    medications.push(
      createMedication({
        id: `demo-${dateKey}-amantadine`,
        name: "Amantadin",
        dose: "100 mg",
        time: formatShiftedTime(15, 30, shifts[(dayOffset + 1) % shifts.length]),
      }),
    );
  }

  return medications.sort((left, right) => left.time.localeCompare(right.time));
}

function formatShiftedTime(hours, minutes, shiftMinutes) {
  const date = new Date(Date.UTC(2024, 0, 1, hours, minutes + shiftMinutes, 0));
  return date.toISOString().slice(11, 16);
}

function createSimulatedEntry(dayOffset, dateKey) {
  const statusByOffset = ["stable", "good", "stable", "hard", "good"];
  const sleepByOffset = ["good", "mixed", "good", "poor", "mixed"];

  return {
    sleepQuality: sleepByOffset[dayOffset % sleepByOffset.length],
    overallStatus: statusByOffset[dayOffset % statusByOffset.length],
    notes: DEMO_NOTES[dayOffset % DEMO_NOTES.length],
    medications: createSimulatedMedications(dayOffset, dateKey),
    hours: createSimulatedHours(dayOffset),
  };
}

export function createDemoState(days = 28) {
  const state = createInitialState();
  state.patientName = "Jan Novak";
  state.birthYear = "1958";

  for (let offset = days - 1; offset >= 0; offset -= 1) {
    const dateKey = shiftDateKey(state.selectedDate, -offset);
    state.entries[dateKey] = createSimulatedEntry(offset, dateKey);
  }

  return state;
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
