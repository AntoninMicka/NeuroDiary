<script setup>
import { computed, nextTick, onMounted, onUnmounted, reactive, ref, watch } from "vue";
import DailyOverview from "./components/DailyOverview.vue";
import MedicationPlan from "./components/MedicationPlan.vue";
import HourMatrix from "./components/HourMatrix.vue";
import DaySummary from "./components/DaySummary.vue";
import DailyTimeline from "./components/DailyTimeline.vue";
import ManualSection from "./components/ManualSection.vue";
import {
  createMedication,
  ensureEntry,
  formatLongDate,
  getStateDefinition,
  getTodayKey,
  getTrackableHourLabel,
} from "./domain/diary.js";
import { createDiaryRepository } from "./repositories/index.js";
import { parseJsonBackup, serializeJsonBackup } from "./services/jsonTransfer.js";
import { openDoctorReportPrint } from "./services/doctorReport.js";

const diaryRepository = ref(null);
const fileInput = ref(null);
const jsonFileInput = ref(null);
const floatingMenu = ref(null);
const isReady = ref(false);
const repositoryMode = ref("loading");
const storageMessage = ref("");
const currentHourLabel = ref(getTrackableHourLabel());
const selectedStateKey = ref("on");
const deferredInstallPrompt = ref(null);
const canInstallApp = ref(false);
const isInstalledApp = ref(false);
const state = reactive({
  selectedDate: getTodayKey(),
  patientName: "",
  birthYear: "",
  entries: {},
});

const selectedEntry = computed(() => ensureEntry(state, state.selectedDate));
const selectedDateLabel = computed(() => formatLongDate(state.selectedDate));
const sortedMedications = computed(() =>
  [...selectedEntry.value.medications].sort((left, right) => left.time.localeCompare(right.time)),
);

let menuResizeObserver = null;
let mediaQueryList = null;

watch(
  state,
  () => {
    if (!isReady.value || !diaryRepository.value) {
      return;
    }
    diaryRepository.value.saveState(state);
  },
  { deep: true },
);

onMounted(async () => {
  initializeInstallState();
  globalThis.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
  globalThis.addEventListener("appinstalled", handleAppInstalled);

  const repository = await createDiaryRepository();
  const initialState = repository.loadState();
  Object.assign(state, initialState);
  diaryRepository.value = repository;
  repositoryMode.value = repository.getMode();
  isReady.value = true;

  await nextTick();
  syncFloatingMenuHeight();

  if (globalThis.ResizeObserver && floatingMenu.value) {
    menuResizeObserver = new ResizeObserver(() => {
      syncFloatingMenuHeight();
    });
    menuResizeObserver.observe(floatingMenu.value);
  }
});

onUnmounted(() => {
  menuResizeObserver?.disconnect();
  mediaQueryList?.removeEventListener?.("change", syncInstallState);
  globalThis.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
  globalThis.removeEventListener("appinstalled", handleAppInstalled);
});

function updateSelectedDate(dateKey) {
  state.selectedDate = dateKey;
  ensureEntry(state, dateKey);
}

function updateEntry(nextEntry) {
  state.entries[state.selectedDate] = {
    ...state.entries[state.selectedDate],
    ...nextEntry,
  };
}

function updateProfile(field, value) {
  state[field] = value;
}

function updateCurrentHourLabel(value) {
  currentHourLabel.value = value;
}

function updateSelectedStateKey(value) {
  selectedStateKey.value = value;
}

function initializeInstallState() {
  syncInstallState();

  if (globalThis.matchMedia) {
    mediaQueryList = globalThis.matchMedia("(display-mode: standalone)");
    mediaQueryList.addEventListener?.("change", syncInstallState);
  }
}

function syncInstallState() {
  const isStandalone = globalThis.matchMedia?.("(display-mode: standalone)")?.matches ?? false;
  const isIosStandalone = globalThis.navigator?.standalone === true;
  isInstalledApp.value = isStandalone || isIosStandalone;
  canInstallApp.value = Boolean(deferredInstallPrompt.value) && !isInstalledApp.value;
}

function handleBeforeInstallPrompt(event) {
  event.preventDefault();
  deferredInstallPrompt.value = event;
  syncInstallState();
}

function handleAppInstalled() {
  deferredInstallPrompt.value = null;
  isInstalledApp.value = true;
  canInstallApp.value = false;
  storageMessage.value = "Aplikace byla nainstalovana do zarizeni.";
}

async function promptInstall() {
  if (!deferredInstallPrompt.value) {
    return;
  }

  deferredInstallPrompt.value.prompt();
  const result = await deferredInstallPrompt.value.userChoice;

  if (result.outcome === "accepted") {
    storageMessage.value = "Instalace aplikace potvrzena.";
  }

  deferredInstallPrompt.value = null;
  syncInstallState();
}

function addMedication(payload) {
  selectedEntry.value.medications.push(createMedication(payload));
}

function removeMedication(medicationId) {
  selectedEntry.value.medications = selectedEntry.value.medications.filter(
    (item) => item.id !== medicationId,
  );
}

function updateHour({ label, stateKey }) {
  selectedEntry.value.hours[label] = stateKey;
}

function writeCurrentState() {
  selectedEntry.value.hours[currentHourLabel.value] = selectedStateKey.value;
  storageMessage.value = `Stav ${getStateDefinition(selectedStateKey.value).label} zapsan pro hodinu ${currentHourLabel.value}.`;
}

function resetDemo() {
  const fresh = diaryRepository.value.resetState();
  applyImportedState(fresh);
  storageMessage.value = "Demo data restored.";
}

function exportDatabase() {
  if (!diaryRepository.value?.supportsBinaryImportExport()) {
    storageMessage.value = "SQLite export is not available in local fallback mode.";
    return;
  }

  const bytes = diaryRepository.value.exportDatabase();
  const blob = new Blob([bytes], { type: "application/vnd.sqlite3" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `neurodiary-${state.selectedDate || "backup"}.sqlite`;
  link.click();
  URL.revokeObjectURL(url);
  storageMessage.value = "SQLite backup exported.";
}

function exportJson() {
  downloadJsonBackup();
  storageMessage.value = "JSON backup exported.";
}

function downloadJsonBackup(filenamePrefix = "neurodiary", filenameSuffix = state.selectedDate || "backup") {
  const json = serializeJsonBackup(state);
  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${filenamePrefix}-${filenameSuffix}.json`;
  link.click();
  URL.revokeObjectURL(url);
}

function openImportPicker() {
  if (!diaryRepository.value?.supportsBinaryImportExport()) {
    storageMessage.value = "SQLite import is not available in local fallback mode.";
    return;
  }

  fileInput.value?.click();
}

function openJsonImportPicker() {
  jsonFileInput.value?.click();
}

function printDoctorReport() {
  try {
    openDoctorReportPrint({
      entries: state.entries,
      selectedDate: state.selectedDate,
      patientName: state.patientName,
      birthYear: state.birthYear,
    });
    storageMessage.value = "Doctor report opened for print.";
  } catch (error) {
    console.error("Doctor report print failed", error);
    storageMessage.value = "Unable to open the printable doctor report.";
  }
}

async function importDatabase(event) {
  const [file] = event.target.files ?? [];
  if (!file) {
    return;
  }

  const confirmed = globalThis.confirm(
    `Import souboru ${file.name} prepise aktualni lokalni data v aplikaci. Pred importem bude stazena nouzova JSON zaloha. Chcete pokracovat?`,
  );
  if (!confirmed) {
    event.target.value = "";
    storageMessage.value = "SQLite import cancelled.";
    return;
  }

  try {
    downloadJsonBackup("neurodiary-preimport", state.selectedDate || "backup");
    const buffer = await file.arrayBuffer();
    const importedState = diaryRepository.value.importDatabase(buffer);
    applyImportedState(importedState);
    storageMessage.value = `Imported ${file.name}.`;
  } catch (error) {
    console.error("SQLite import failed", error);
    storageMessage.value = "Import failed. Please choose a valid NeuroDiary SQLite file.";
  } finally {
    event.target.value = "";
  }
}

async function importJson(event) {
  const [file] = event.target.files ?? [];
  if (!file) {
    return;
  }

  const confirmed = globalThis.confirm(
    `Import souboru ${file.name} prepise aktualni lokalni data v aplikaci. Pred importem bude stazena nouzova JSON zaloha. Chcete pokracovat?`,
  );
  if (!confirmed) {
    event.target.value = "";
    storageMessage.value = "JSON import cancelled.";
    return;
  }

  try {
    downloadJsonBackup("neurodiary-preimport", state.selectedDate || "backup");
    const raw = await file.text();
    const importedState = parseJsonBackup(raw);
    applyImportedState(importedState);
    storageMessage.value = `Imported ${file.name}.`;
  } catch (error) {
    console.error("JSON import failed", error);
    storageMessage.value = "Import failed. Please choose a valid NeuroDiary JSON backup.";
  } finally {
    event.target.value = "";
  }
}

function applyImportedState(nextState) {
  Object.assign(state, nextState);
  ensureEntry(state, state.selectedDate);
  diaryRepository.value?.saveState(state);
}

function syncFloatingMenuHeight() {
  const height = floatingMenu.value?.offsetHeight ?? 0;
  document.documentElement.style.setProperty("--floating-menu-height", `${height}px`);
}
</script>

<template>
  <div class="shell">
    <div v-if="!isReady" class="boot-card">
      <p class="section-kicker">Bootstrapping</p>
      <h2>Preparing local diary storage</h2>
      <p class="panel-tip">Initializing the offline repository and loading your local data.</p>
    </div>

    <template v-else>
      <header class="hero">
        <div class="hero-copy">
          <p class="eyebrow">Vue prototype</p>
          <h1>NeuroDiary</h1>
          <p class="lede">
            A structured offline diary for daily symptom tracking, medication timing, and rapid
            trend review.
          </p>
          <div class="hero-actions">
            <button
              v-if="canInstallApp"
              class="primary-button"
              type="button"
              @click="promptInstall"
            >
              Install app
            </button>
            <p v-else-if="isInstalledApp" class="hero-install-note">
              App is installed and ready for offline use from your device.
            </p>
            <p v-else class="hero-install-note">
              PWA support is enabled. Once the browser allows installation, the install action will
              appear here.
            </p>
          </div>
        </div>
      </header>

      <section ref="floatingMenu" class="floating-menu" aria-label="Rychla navigace a akce">
        <div class="floating-menu-top">
          <div class="floating-menu-status">
            <p class="hero-label">Selected day · {{ repositoryMode }}</p>
            <p class="hero-date">{{ selectedDateLabel }}</p>
          </div>

          <div class="floating-menu-actions">
            <button class="ghost-button" type="button" @click="printDoctorReport">Print report</button>
            <button class="ghost-button" type="button" @click="exportDatabase">Export .sqlite</button>
            <button class="ghost-button" type="button" @click="exportJson">Export JSON</button>
            <button class="ghost-button" type="button" @click="openImportPicker">Import .sqlite</button>
            <button class="ghost-button" type="button" @click="openJsonImportPicker">Import JSON</button>
            <button class="ghost-button" type="button" @click="resetDemo">Reset demo data</button>
          </div>
        </div>

        <nav class="section-nav" aria-label="Rychla navigace">
          <a href="#sekce-udaje">Udaje</a>
          <a href="#sekce-matice">Hodinova matice</a>
          <a href="#sekce-osa">Casova osa</a>
          <a href="#sekce-prehled">Denni zapis</a>
          <a href="#sekce-leky">Lecba</a>
          <a href="#sekce-souhrn">Souhrn</a>
          <a href="#sekce-manualy">Manualy</a>
        </nav>

        <p v-if="storageMessage" class="storage-message floating-menu-message">{{ storageMessage }}</p>
      </section>

      <main class="grid dashboard-grid">
        <section id="sekce-udaje" class="panel panel-wide layout-profile">
          <div class="panel-heading">
            <div>
              <p class="section-kicker">Udaje</p>
              <h2>Denik a pacient</h2>
            </div>
          </div>
          <form class="day-form">
            <label>
              <span>Datum</span>
              <input
                :value="state.selectedDate"
                type="date"
                @input="updateSelectedDate($event.target.value)"
              />
            </label>
            <label>
              <span>Jmeno pacienta</span>
              <input
                :value="state.patientName"
                type="text"
                placeholder="Jan Novak"
                @input="updateProfile('patientName', $event.target.value)"
              />
            </label>
            <label>
              <span>Rok narozeni</span>
              <input
                :value="state.birthYear"
                type="text"
                inputmode="numeric"
                placeholder="1958"
                @input="updateProfile('birthYear', $event.target.value)"
              />
            </label>
          </form>
        </section>

        <HourMatrix
          id="sekce-matice"
          class="layout-matrix"
          :hours="selectedEntry.hours"
          :current-hour-label="currentHourLabel"
          :selected-state-key="selectedStateKey"
          :selected-date="state.selectedDate"
          @update-hour="updateHour"
          @update-current-hour-label="updateCurrentHourLabel"
          @update-selected-state-key="updateSelectedStateKey"
          @write-current-state="writeCurrentState"
          @select-date="updateSelectedDate"
        />

        <DailyOverview
          id="sekce-prehled"
          class="layout-overview"
          :model-value="selectedEntry"
          @patch-entry="updateEntry"
        />

        <MedicationPlan
          id="sekce-leky"
          class="layout-medication"
          :medications="sortedMedications"
          @add-medication="addMedication"
          @remove-medication="removeMedication"
        />

        <DailyTimeline
          id="sekce-osa"
          class="layout-timeline"
          :entries="state.entries"
          :selected-date="state.selectedDate"
          @select-date="updateSelectedDate"
        />
        <DaySummary
          id="sekce-souhrn"
          class="layout-summary"
          :entry="selectedEntry"
          :entries="state.entries"
          :selected-date="state.selectedDate"
        />
        <ManualSection id="sekce-manualy" class="layout-manuals" />
      </main>
      <input
        ref="fileInput"
        class="visually-hidden"
        type="file"
        accept=".sqlite,.db,.sqlite3"
        @change="importDatabase"
      />
      <input
        ref="jsonFileInput"
        class="visually-hidden"
        type="file"
        accept=".json,application/json"
        @change="importJson"
      />
    </template>
  </div>
</template>
