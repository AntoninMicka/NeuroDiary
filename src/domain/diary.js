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
  "Vyraznejsi tres pred polednem, po dalsi davce zmirneni.",
  "Vecer znatelna unava a horsi obratnost pri chuzi.",
  "Dnes kolisani hybnosti bez jasneho vzorce.",
  "Dopoledne dobra kontrola hybnosti, po obede zpomaleni.",
  "Kratka epizoda mimovolnich pohybu v odpolednich hodinach.",
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
      sleepQuality: meta.sleepQuality,
      overallStatus: meta.overallStatus,
      notes: note,
      medications: createSimulatedMedications(attempt, dateKey),
      hours,
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
    sleepQuality: fallbackMeta.sleepQuality,
    overallStatus: fallbackMeta.overallStatus,
    notes: randomChoice(DEMO_NOTES),
    medications: createSimulatedMedications(randomInt(0, 999), dateKey),
    hours: fallbackHours,
  };

  return { entry: fallbackEntry, signature: buildEntrySignature(fallbackEntry) };
}

export function createDemoState(days = 120) {
  const state = createInitialState();
  state.patientName = "Jan Novak";
  state.birthYear = "1958";
  let previousSignature = null;

  for (let offset = days - 1; offset >= 0; offset -= 1) {
    const dateKey = shiftDateKey(state.selectedDate, -offset);
    const { entry, signature } = createSimulatedEntry(dateKey, previousSignature);
    state.entries[dateKey] = entry;
    previousSignature = signature;
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
