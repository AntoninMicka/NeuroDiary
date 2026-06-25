const STORAGE_KEY = "neurodiary-poc-v1";
const HOUR_STATES = [
  { key: "on", label: "ON", summary: "steady movement" },
  { key: "slow", label: "SLOW", summary: "slower movement" },
  { key: "off", label: "OFF", summary: "strong symptoms" },
  { key: "sleep", label: "SLEEP", summary: "resting or asleep" },
];

const template = document.getElementById("hour-card-template");
const dateInput = document.getElementById("date-input");
const dateLabel = document.getElementById("selected-date-label");
const dayForm = document.getElementById("day-form");
const sleepQuality = document.getElementById("sleep-quality");
const overallStatus = document.getElementById("overall-status");
const dailyNotes = document.getElementById("daily-notes");
const medicationForm = document.getElementById("medication-form");
const medicationName = document.getElementById("medication-name");
const medicationDose = document.getElementById("medication-dose");
const medicationTime = document.getElementById("medication-time");
const medicationList = document.getElementById("medication-list");
const hourGrid = document.getElementById("hour-grid");
const summary = document.getElementById("summary");
const resetDemoButton = document.getElementById("reset-demo");

function generateId() {
  if (globalThis.crypto?.randomUUID) {
    return globalThis.crypto.randomUUID();
  }
  return `id-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function createDefaultEntry() {
  const hours = {};
  for (let hour = 6; hour <= 21; hour += 1) {
    const label = `${String(hour).padStart(2, "0")}:00`;
    hours[label] = hour < 8 ? "sleep" : hour < 11 ? "on" : hour < 14 ? "slow" : "on";
  }

  return {
    sleepQuality: "good",
    overallStatus: "stable",
    notes: "Morning stiffness improved after first dose. Energy stable in the afternoon.",
    medications: [
      { id: generateId(), name: "Levodopa", dose: "100 mg", time: "08:00" },
      { id: generateId(), name: "Levodopa", dose: "100 mg", time: "13:00" },
      { id: generateId(), name: "Levodopa", dose: "100 mg", time: "18:00" },
    ],
    hours,
  };
}

function getTodayKey() {
  return new Date().toISOString().slice(0, 10);
}

function loadState() {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (!saved) {
    return {
      selectedDate: getTodayKey(),
      entries: {},
    };
  }

  try {
    return JSON.parse(saved);
  } catch {
    return {
      selectedDate: getTodayKey(),
      entries: {},
    };
  }
}

let state = loadState();

function getEntry(dateKey) {
  if (!state.entries[dateKey]) {
    state.entries[dateKey] = createDefaultEntry();
  }
  return state.entries[dateKey];
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function formatDate(dateKey) {
  const date = new Date(`${dateKey}T12:00:00`);
  return new Intl.DateTimeFormat("en", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(date);
}

function renderDate() {
  dateInput.value = state.selectedDate;
  dateLabel.textContent = formatDate(state.selectedDate);
}

function renderDayForm() {
  const entry = getEntry(state.selectedDate);
  sleepQuality.value = entry.sleepQuality;
  overallStatus.value = entry.overallStatus;
  dailyNotes.value = entry.notes;
}

function renderMedicationList() {
  const entry = getEntry(state.selectedDate);
  medicationList.innerHTML = "";

  entry.medications
    .slice()
    .sort((a, b) => a.time.localeCompare(b.time))
    .forEach((medication) => {
      const item = document.createElement("li");
      const copy = document.createElement("div");
      copy.className = "medication-copy";
      copy.innerHTML = `<strong>${medication.time} - ${medication.name}</strong><span>${medication.dose}</span>`;

      const removeButton = document.createElement("button");
      removeButton.type = "button";
      removeButton.textContent = "Remove";
      removeButton.addEventListener("click", () => {
        entry.medications = entry.medications.filter((item) => item.id !== medication.id);
        saveState();
        render();
      });

      item.append(copy, removeButton);
      medicationList.appendChild(item);
    });
}

function renderHourGrid() {
  const entry = getEntry(state.selectedDate);
  hourGrid.innerHTML = "";

  Object.entries(entry.hours).forEach(([label, stateKey]) => {
    const node = template.content.firstElementChild.cloneNode(true);
    node.querySelector(".hour-label").textContent = label;
    node.querySelector(".hour-state").textContent =
      HOUR_STATES.find((item) => item.key === stateKey)?.label ?? stateKey;
    node.classList.add(`state-${stateKey}`);
    node.addEventListener("click", () => {
      const currentIndex = HOUR_STATES.findIndex((item) => item.key === entry.hours[label]);
      const nextState = HOUR_STATES[(currentIndex + 1) % HOUR_STATES.length];
      entry.hours[label] = nextState.key;
      saveState();
      render();
    });
    hourGrid.appendChild(node);
  });
}

function renderSummary() {
  const entry = getEntry(state.selectedDate);
  const counts = Object.values(entry.hours).reduce((acc, item) => {
    acc[item] = (acc[item] ?? 0) + 1;
    return acc;
  }, {});

  const cards = [
    {
      title: "Medication moments",
      value: `${entry.medications.length} planned doses`,
    },
    {
      title: "Dominant state",
      value: `${Object.entries(counts)
        .sort((a, b) => b[1] - a[1])[0]?.[0]
        ?.toUpperCase() ?? "N/A"} for most hours`,
    },
    {
      title: "Sleep and notes",
      value: `${entry.sleepQuality} sleep, ${entry.overallStatus} day, ${
        entry.notes.trim() ? "notes filled in" : "no notes yet"
      }`,
    },
  ];

  summary.innerHTML = "";
  cards.forEach((card) => {
    const box = document.createElement("div");
    box.className = "summary-card";
    box.innerHTML = `<strong>${card.title}</strong><span>${card.value}</span>`;
    summary.appendChild(box);
  });
}

function render() {
  renderDate();
  renderDayForm();
  renderMedicationList();
  renderHourGrid();
  renderSummary();
}

dateInput.addEventListener("change", (event) => {
  state.selectedDate = event.target.value;
  getEntry(state.selectedDate);
  saveState();
  render();
});

dayForm.addEventListener("input", () => {
  const entry = getEntry(state.selectedDate);
  entry.sleepQuality = sleepQuality.value;
  entry.overallStatus = overallStatus.value;
  entry.notes = dailyNotes.value;
  saveState();
  renderSummary();
});

medicationForm.addEventListener("submit", (event) => {
  event.preventDefault();
  if (!medicationName.value.trim() || !medicationDose.value.trim() || !medicationTime.value) {
    return;
  }

  const entry = getEntry(state.selectedDate);
  entry.medications.push({
    id: generateId(),
    name: medicationName.value.trim(),
    dose: medicationDose.value.trim(),
    time: medicationTime.value,
  });

  medicationForm.reset();
  medicationTime.value = "08:00";
  saveState();
  render();
});

resetDemoButton.addEventListener("click", () => {
  state = {
    selectedDate: getTodayKey(),
    entries: {},
  };
  getEntry(state.selectedDate);
  saveState();
  render();
});

if (!state.selectedDate) {
  state.selectedDate = getTodayKey();
}

getEntry(state.selectedDate);
medicationTime.value = "08:00";
saveState();
render();
