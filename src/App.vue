<script setup>
import { computed, nextTick, onMounted, onUnmounted, reactive, ref, watch } from "vue";
import DailyOverview from "./components/DailyOverview.vue";
import MedicationPlan from "./components/MedicationPlan.vue";
import HourMatrix from "./components/HourMatrix.vue";
import DaySummary from "./components/DaySummary.vue";
import DailyTimeline from "./components/DailyTimeline.vue";
import ManualSection from "./components/ManualSection.vue";
import {
  HOUR_STATES,
  appendHourStateRecord,
  createMedication,
  ensureEntry,
  formatLongDate,
  getHourRecordCount,
  getStateDefinition,
  mergeDiaryStatesAppendOnly,
  shiftDateKey,
  getTodayKey,
  getTrackableHourLabel,
} from "./domain/diary.js";
import { createDiaryRepository } from "./repositories/index.js";
import { parseJsonBackup, serializeJsonBackup } from "./services/jsonTransfer.js";
import { openDoctorReportPrint } from "./services/doctorReport.js";
import { activateServiceWorkerUpdate, OFFLINE_READY_EVENT, UPDATE_READY_EVENT } from "./pwa.js";
import {
  hasStoredRecoverySecret,
  hasStoredSyncMasterKey,
  initializeCloudSync,
  loadSyncSettings,
  pullCloudState,
  pushCloudState,
  saveRecoverySecret,
  saveSyncSettings,
} from "./services/syncService.js";
import {
  appendBootstrapLog,
  BOOTSTRAP_LOG_EVENT,
  getBootstrapLogEntries,
} from "./services/bootstrapLogger.js";

const diaryRepository = ref(null);
const fileInput = ref(null);
const jsonFileInput = ref(null);
const floatingMenu = ref(null);
const isReady = ref(false);
const repositoryMode = ref("loading");
const storageMessage = ref("");
const bootstrapStatus = ref("Starting application bootstrap.");
const currentHourLabel = ref(getTrackableHourLabel());
const selectedStateKey = ref("on");
const deferredInstallPrompt = ref(null);
const canInstallApp = ref(false);
const isInstalledApp = ref(false);
const platformInstallMode = ref("browser");
const isOnline = ref(globalThis.navigator?.onLine ?? true);
const pwaOfflineReady = ref(false);
const pwaUpdateRegistration = ref(null);
const activePanelId = ref("sekce-home");
const isUtilityMenuOpen = ref(false);
const isBootstrapLogOpen = ref(false);
const syncSettings = reactive(loadSyncSettings());
const recoverySecretInput = ref("");
const generatedRecoverySecret = ref("");
const isSyncBusy = ref(false);
const isApplyingExternalState = ref(false);
const bootstrapLogEntries = ref(getBootstrapLogEntries());
const isCapturingBootstrapProgress = ref(true);
const state = reactive({
  selectedDate: getTodayKey(),
  patientName: "",
  birthYear: "",
  entries: {},
});

const selectedEntry = computed(() => state.entries[state.selectedDate] ?? null);
const selectedDateLabel = computed(() => formatLongDate(state.selectedDate));
const sortedMedications = computed(() =>
  [...(selectedEntry.value?.medications ?? [])].sort((left, right) => left.time.localeCompare(right.time)),
);
const PANEL_ITEMS = [
  { id: "sekce-home", label: "Rychly zapis" },
  { id: "sekce-udaje", label: "Udaje" },
  { id: "sekce-matice", label: "Hodinova matice" },
  { id: "sekce-osa", label: "Casova osa" },
  { id: "sekce-prehled", label: "Denni zapis" },
  { id: "sekce-leky", label: "Lecba" },
  { id: "sekce-souhrn", label: "Souhrn" },
  { id: "sekce-manualy", label: "Manualy" },
];
const DATE_NAV_PANEL_IDS = new Set([
  "sekce-udaje",
  "sekce-matice",
  "sekce-osa",
  "sekce-prehled",
  "sekce-leky",
  "sekce-souhrn",
]);
const installHelpText = computed(() => {
  if (isInstalledApp.value) {
    return "App is installed and ready for offline use from your device.";
  }

  if (platformInstallMode.value === "ios-share-sheet") {
    return "Na iPhonu nebo iPadu otevřete menu Sdilet a zvolte Pridat na plochu, tim aplikaci nainstalujete.";
  }

  if (platformInstallMode.value === "install-prompt") {
    return "Browser uz umi aplikaci nainstalovat. Pouzijte tlacitko Install app.";
  }

  return "PWA support is enabled. Once the browser allows installation, the install action will appear here.";
});
const showIosInstallGuide = computed(
  () => !isInstalledApp.value && platformInstallMode.value === "ios-share-sheet",
);
const isSelectedDateEditable = computed(() => state.selectedDate === getTodayKey());
const showQuickCapture = computed(() => activePanelId.value === "sekce-home");
const quickCaptureStateLabel = computed(() => getStateDefinition(selectedStateKey.value).label);
const canUseDemoTools = computed(() => state.account?.isAuthenticated !== true);
const currentHourRecordCount = computed(() => getHourRecordCount(selectedEntry.value, currentHourLabel.value));
const activePanelIndex = computed(() =>
  PANEL_ITEMS.findIndex((item) => item.id === activePanelId.value),
);
const activePanelLabel = computed(
  () => PANEL_ITEMS[activePanelIndex.value]?.label ?? "Rychly zapis",
);
const canGoToPreviousPanel = computed(() => activePanelIndex.value > 0);
const canGoToNextPanel = computed(() => activePanelIndex.value < PANEL_ITEMS.length - 1);
const canGoToNextDate = computed(() => state.selectedDate < getTodayKey());
const showDateSwitcher = computed(() => DATE_NAV_PANEL_IDS.has(activePanelId.value));
const hasRecoverySecretStored = computed(() => hasStoredRecoverySecret());
const hasSyncMasterKeyStored = computed(() => hasStoredSyncMasterKey());
const syncStatusSummary = computed(() => {
  if (!syncSettings.endpoint) {
    return "Cloud sync zatim neni nastaven.";
  }

  const revision = Number(syncSettings.revision ?? 0);
  const syncedAt = syncSettings.lastSyncAt
    ? new Intl.DateTimeFormat("cs-CZ", { dateStyle: "medium", timeStyle: "short" }).format(
        new Date(syncSettings.lastSyncAt),
      )
    : "zatim nikdy";

  return `Revize ${revision} · posledni sync ${syncedAt}`;
});
const bootstrapLogCountLabel = computed(() => `${bootstrapLogEntries.value.length} kroku`);

let menuResizeObserver = null;
let mediaQueryList = null;
const SERVICE_WORKER_RELOAD_GUARD_KEY = "neurodiary-sw-reload-guard-v1";

function setBootstrapStatus(message, level = "info") {
  if (!isCapturingBootstrapProgress.value) {
    return;
  }

  bootstrapStatus.value = message;
  appendBootstrapLog(message, level);
}

function syncBootstrapLogEntries(event = null) {
  bootstrapLogEntries.value = event?.detail?.entries ?? getBootstrapLogEntries();
}

watch(
  state,
  () => {
    if (!isReady.value || !diaryRepository.value || isApplyingExternalState.value) {
      return;
    }
    diaryRepository.value.saveState(state);
  },
  { deep: true },
);

onMounted(async () => {
  globalThis.addEventListener(BOOTSTRAP_LOG_EVENT, syncBootstrapLogEntries);
  setBootstrapStatus("Initializing install and connectivity state.");
  initializeInstallState();
  globalThis.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
  globalThis.addEventListener("appinstalled", handleAppInstalled);
  globalThis.addEventListener("online", handleConnectionChange);
  globalThis.addEventListener("offline", handleConnectionChange);
  globalThis.addEventListener(OFFLINE_READY_EVENT, handleOfflineReady);
  globalThis.addEventListener(UPDATE_READY_EVENT, handleUpdateReady);

  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.addEventListener("controllerchange", handleControllerChange);
  }

  setBootstrapStatus("Starting local repository initialization.");
  const repository = await createDiaryRepository({
    onProgress(message) {
      setBootstrapStatus(message);
    },
  });
  setBootstrapStatus("Repository ready. Loading saved diary state.");
  const initialState = repository.loadState();
  setBootstrapStatus("Applying loaded state to the application.");
  Object.assign(state, initialState);
  diaryRepository.value = repository;
  repositoryMode.value = repository.getMode();
  if (repository.bootstrapWarning) {
    storageMessage.value = repository.bootstrapWarning;
    appendBootstrapLog(repository.bootstrapWarning, "warning");
  }
  setBootstrapStatus("Initialization completed.");
  isReady.value = true;

  await nextTick();
  setBootstrapStatus("Synchronizing floating menu layout.");
  syncFloatingMenuHeight();

  if (globalThis.ResizeObserver && floatingMenu.value) {
    menuResizeObserver = new ResizeObserver(() => {
      syncFloatingMenuHeight();
    });
    menuResizeObserver.observe(floatingMenu.value);
  }

  isCapturingBootstrapProgress.value = false;
});

onUnmounted(() => {
  globalThis.removeEventListener(BOOTSTRAP_LOG_EVENT, syncBootstrapLogEntries);
  menuResizeObserver?.disconnect();
  mediaQueryList?.removeEventListener?.("change", syncInstallState);
  globalThis.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
  globalThis.removeEventListener("appinstalled", handleAppInstalled);
  globalThis.removeEventListener("online", handleConnectionChange);
  globalThis.removeEventListener("offline", handleConnectionChange);
  globalThis.removeEventListener(OFFLINE_READY_EVENT, handleOfflineReady);
  globalThis.removeEventListener(UPDATE_READY_EVENT, handleUpdateReady);
  navigator.serviceWorker?.removeEventListener?.("controllerchange", handleControllerChange);
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

function updateSyncSetting(field, value) {
  syncSettings[field] = value;
  Object.assign(syncSettings, saveSyncSettings(syncSettings));
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
  const userAgent = globalThis.navigator?.userAgent ?? "";
  const platform = globalThis.navigator?.platform ?? "";
  const isTouchMac = platform === "MacIntel" && globalThis.navigator?.maxTouchPoints > 1;
  const isIosDevice = /iPad|iPhone|iPod/.test(userAgent) || isTouchMac;
  isInstalledApp.value = isStandalone || isIosStandalone;
  canInstallApp.value = Boolean(deferredInstallPrompt.value) && !isInstalledApp.value;

  if (isInstalledApp.value) {
    platformInstallMode.value = "installed";
    return;
  }

  if (canInstallApp.value) {
    platformInstallMode.value = "install-prompt";
    return;
  }

  platformInstallMode.value = isIosDevice ? "ios-share-sheet" : "browser";
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

function handleConnectionChange() {
  isOnline.value = globalThis.navigator?.onLine ?? true;
}

function handleOfflineReady() {
  pwaOfflineReady.value = true;
}

function handleUpdateReady(event) {
  pwaUpdateRegistration.value = event.detail?.registration ?? null;
}

function handleControllerChange() {
  const guardValue = globalThis.sessionStorage?.getItem?.(SERVICE_WORKER_RELOAD_GUARD_KEY);
  if (guardValue === "done") {
    return;
  }

  globalThis.sessionStorage?.setItem?.(SERVICE_WORKER_RELOAD_GUARD_KEY, "done");
  globalThis.location.reload();
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

function applyAppUpdate() {
  activateServiceWorkerUpdate(pwaUpdateRegistration.value);
}

function dismissOfflineReady() {
  pwaOfflineReady.value = false;
}

function toggleUtilityMenu() {
  isUtilityMenuOpen.value = !isUtilityMenuOpen.value;
  void nextTick(() => {
    syncFloatingMenuHeight();
  });
}

function closeUtilityMenu() {
  if (!isUtilityMenuOpen.value) {
    return;
  }

  isUtilityMenuOpen.value = false;
  void nextTick(() => {
    syncFloatingMenuHeight();
  });
}

function handleUtilityAction(action) {
  closeUtilityMenu();
  action();
}

function openBootstrapLogPanel() {
  closeUtilityMenu();
  isBootstrapLogOpen.value = true;
}

function closeBootstrapLogPanel() {
  isBootstrapLogOpen.value = false;
}

function markCloudAuthenticated() {
  state.account = {
    ...state.account,
    isAuthenticated: true,
    provider: state.account.provider || "cloud-token",
    userId: state.account.userId || "cloud-user",
  };
}

function selectPanel(panelId) {
  activePanelId.value = panelId;
  closeUtilityMenu();
  void nextTick(() => {
    syncFloatingMenuHeight();
  });
}

function goToPreviousPanel() {
  if (!canGoToPreviousPanel.value) {
    return;
  }

  selectPanel(PANEL_ITEMS[activePanelIndex.value - 1].id);
}

function goToNextPanel() {
  if (!canGoToNextPanel.value) {
    return;
  }

  selectPanel(PANEL_ITEMS[activePanelIndex.value + 1].id);
}

function goToPreviousDate() {
  updateSelectedDate(shiftDateKey(state.selectedDate, -1));
}

function goToNextDate() {
  if (!canGoToNextDate.value) {
    return;
  }

  updateSelectedDate(shiftDateKey(state.selectedDate, 1));
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
  appendHourStateRecord(selectedEntry.value, label, stateKey, { source: "manual" });
  storageMessage.value = `Stav ${getStateDefinition(stateKey).label} pridan pro hodinu ${label}.`;
}

function writeCurrentState() {
  appendHourStateRecord(selectedEntry.value, currentHourLabel.value, selectedStateKey.value, {
    source: "manual",
  });
  storageMessage.value = `Stav ${getStateDefinition(selectedStateKey.value).label} zapsan pro hodinu ${currentHourLabel.value}.`;
}

function resetDemo() {
  if (!canUseDemoTools.value) {
    storageMessage.value = "Demo data jsou pro prihlaseny ucet zakazana.";
    return;
  }

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

async function initializeSync() {
  if (!syncSettings.endpoint.trim()) {
    storageMessage.value = "Nejprve vyplnte sync endpoint.";
    return;
  }

  isSyncBusy.value = true;
  generatedRecoverySecret.value = "";
  try {
    const result = await initializeCloudSync({
      state,
      settings: syncSettings,
      recoverySecret: recoverySecretInput.value,
    });
    Object.assign(syncSettings, saveSyncSettings({
      ...syncSettings,
      revision: result.revision,
      lastSyncAt: result.updatedAt,
      lastSyncStatus: "ok",
      lastSyncMessage: "Cloud sync initialized.",
    }));
    generatedRecoverySecret.value = result.generatedRecoverySecret;
    markCloudAuthenticated();
    storageMessage.value = result.generatedRecoverySecret
      ? "Cloud sync inicializovan. Ulozte si recovery secret."
      : "Cloud sync inicializovan.";
  } catch (error) {
    console.error("Sync initialization failed", error);
    Object.assign(syncSettings, saveSyncSettings({
      ...syncSettings,
      lastSyncStatus: "error",
      lastSyncMessage: error.message,
    }));
    storageMessage.value = `Inicializace syncu selhala: ${error.message}`;
  } finally {
    isSyncBusy.value = false;
  }
}

async function pullSync() {
  if (!syncSettings.endpoint.trim()) {
    storageMessage.value = "Nejprve vyplnte sync endpoint.";
    return;
  }

  isSyncBusy.value = true;
  try {
    storageMessage.value = "Nacitam sifrovany stav ze serveru.";
    const result = await pullCloudState(syncSettings);
    if (!result.state) {
      storageMessage.value = "Na serveru zatim nejsou zadna data.";
      return;
    }

    storageMessage.value = "Slučuji cloud data s lokalnimi zaznamy.";
    const mergedState = mergeDiaryStatesAppendOnly(state, result.state);
    storageMessage.value = "Zapisuji slouceny stav do lokalniho uloziste.";
    applyImportedState(mergedState);
    Object.assign(syncSettings, saveSyncSettings({
      ...syncSettings,
      revision: result.revision,
      lastSyncAt: result.updatedAt,
      lastSyncStatus: "ok",
      lastSyncMessage: "Cloud pull completed.",
    }));
    markCloudAuthenticated();
    storageMessage.value = "Data byla doplnena ze serveru bez mazani lokalnich zaznamu.";
  } catch (error) {
    console.error("Sync pull failed", error);
    Object.assign(syncSettings, saveSyncSettings({
      ...syncSettings,
      lastSyncStatus: "error",
      lastSyncMessage: error.message,
    }));
    storageMessage.value = `Synchronizace ze serveru selhala: ${error.message}`;
  } finally {
    isSyncBusy.value = false;
  }
}

async function pushSync(force = false) {
  if (!syncSettings.endpoint.trim()) {
    storageMessage.value = "Nejprve vyplnte sync endpoint.";
    return;
  }

  isSyncBusy.value = true;
  try {
    storageMessage.value = "Pripravuji lokalni stav pro odeslani do cloud syncu.";
    const result = await pushCloudState({
      state,
      settings: syncSettings,
      baseRevision: Number(syncSettings.revision ?? 0),
      force,
    });

    if (result.status === "conflict" && result.remoteState) {
      storageMessage.value = "Server hlasi konflikt. Slucuji cloud a lokalni data.";
      const mergedState = mergeDiaryStatesAppendOnly(result.remoteState, state);
      applyImportedState(mergedState);
      storageMessage.value = "Odesilam slouceny stav znovu na server.";
      const retryResult = await pushCloudState({
        state: mergedState,
        settings: {
          ...syncSettings,
          revision: result.revision,
        },
        baseRevision: result.revision,
        force: true,
      });

      Object.assign(syncSettings, saveSyncSettings({
        ...syncSettings,
        revision: retryResult.revision,
        lastSyncAt: retryResult.updatedAt,
        lastSyncStatus: "ok",
        lastSyncMessage: "Conflict merged and pushed.",
      }));
      markCloudAuthenticated();
      storageMessage.value = "Konflikt byl sloucen append-only a synchronizace dokoncena.";
      return;
    }

    Object.assign(syncSettings, saveSyncSettings({
      ...syncSettings,
      revision: result.revision,
      lastSyncAt: result.updatedAt,
      lastSyncStatus: "ok",
      lastSyncMessage: "Cloud push completed.",
    }));
    markCloudAuthenticated();
    storageMessage.value = "Lokalni data byla odeslana do cloud syncu.";
  } catch (error) {
    console.error("Sync push failed", error);
    Object.assign(syncSettings, saveSyncSettings({
      ...syncSettings,
      lastSyncStatus: "error",
      lastSyncMessage: error.message,
    }));
    storageMessage.value = `Synchronizace na server selhala: ${error.message}`;
  } finally {
    isSyncBusy.value = false;
  }
}

function persistRecoverySecret() {
  if (!recoverySecretInput.value.trim()) {
    storageMessage.value = "Zadejte recovery secret.";
    return;
  }

  saveRecoverySecret(recoverySecretInput.value);
  storageMessage.value = "Recovery secret byl ulozen lokalne do tohoto zarizeni.";
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
  isApplyingExternalState.value = true;
  try {
    state.selectedDate = nextState.selectedDate;
    state.patientName = nextState.patientName ?? "";
    state.birthYear = nextState.birthYear ?? "";
    state.account = nextState.account ?? state.account;
    state.entries = nextState.entries ?? {};
    ensureEntry(state, state.selectedDate);
    diaryRepository.value?.saveState(state);
  } finally {
    isApplyingExternalState.value = false;
  }
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
      <p class="boot-detail">{{ bootstrapStatus }}</p>
      <div v-if="bootstrapLogEntries.length" class="bootstrap-history bootstrap-history-inline">
        <p class="boot-history-title">Prubeh inicializace</p>
        <ol class="bootstrap-history-list">
          <li
            v-for="entry in bootstrapLogEntries"
            :key="entry.id"
            class="bootstrap-history-item"
            :data-level="entry.level"
          >
            <span class="bootstrap-history-time">{{ entry.timeLabel }}</span>
            <p class="bootstrap-history-message">{{ entry.message }}</p>
          </li>
        </ol>
      </div>
      <p v-if="storageMessage" class="boot-detail boot-detail-warning">{{ storageMessage }}</p>
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
            <p class="hero-install-note">{{ installHelpText }}</p>
          </div>
          <div v-if="showIosInstallGuide" class="ios-install-card" aria-label="iOS install guide">
            <p class="ios-install-title">Install on iPhone or iPad</p>
            <ol class="ios-install-steps">
              <li>Open the browser share menu.</li>
              <li>Select <strong>Add to Home Screen</strong>.</li>
            </ol>
          </div>
        </div>
      </header>

      <section ref="floatingMenu" class="floating-menu" aria-label="Rychla navigace a akce">
        <div class="floating-menu-top">
          <div class="floating-menu-status">
            <p class="hero-label">Selected day · {{ repositoryMode }}</p>
            <p class="hero-date">{{ selectedDateLabel }}</p>
            <div class="status-chips" aria-label="Application status">
              <span :class="['status-chip', isOnline ? 'status-chip-online' : 'status-chip-offline']">
                {{ isOnline ? "Online" : "Offline" }}
              </span>
              <span v-if="pwaOfflineReady" class="status-chip status-chip-ready">Offline cache ready</span>
              <span v-if="pwaUpdateRegistration" class="status-chip status-chip-update">Update ready</span>
            </div>
          </div>

          <div class="floating-menu-actions">
            <div class="utility-menu">
              <button
                class="ghost-button utility-menu-trigger"
                type="button"
                :aria-expanded="isUtilityMenuOpen ? 'true' : 'false'"
                aria-haspopup="menu"
                @click="toggleUtilityMenu"
              >
                <span class="utility-menu-trigger-icon" aria-hidden="true">☰</span>
                <span>Vice</span>
              </button>

              <div v-if="isUtilityMenuOpen" class="utility-menu-panel" role="menu" aria-label="Export a zalohy">
                <button class="utility-menu-item" type="button" role="menuitem" @click="openBootstrapLogPanel">
                  Diagnostika startu
                </button>
                <button class="utility-menu-item" type="button" role="menuitem" @click="handleUtilityAction(printDoctorReport)">
                  Print report
                </button>
                <button class="utility-menu-item" type="button" role="menuitem" @click="handleUtilityAction(exportDatabase)">
                  Export .sqlite
                </button>
                <button class="utility-menu-item" type="button" role="menuitem" @click="handleUtilityAction(exportJson)">
                  Export JSON
                </button>
                <button class="utility-menu-item" type="button" role="menuitem" @click="handleUtilityAction(openImportPicker)">
                  Import .sqlite
                </button>
                <button class="utility-menu-item" type="button" role="menuitem" @click="handleUtilityAction(openJsonImportPicker)">
                  Import JSON
                </button>
                <button
                  v-if="canUseDemoTools"
                  class="utility-menu-item utility-menu-item-danger"
                  type="button"
                  role="menuitem"
                  @click="handleUtilityAction(resetDemo)"
                >
                  Reset demo data
                </button>
              </div>
            </div>
          </div>
        </div>

        <div class="panel-switcher" aria-label="Prepinani panelu a data">
          <div class="panel-switcher-row">
            <button class="ghost-button" type="button" :disabled="!canGoToPreviousPanel" @click="goToPreviousPanel">
              Predchozi panel
            </button>
            <div class="panel-switcher-current">
              <p class="hero-label">Aktivni panel</p>
              <p class="panel-switcher-title">{{ activePanelLabel }}</p>
            </div>
            <button class="ghost-button" type="button" :disabled="!canGoToNextPanel" @click="goToNextPanel">
              Dalsi panel
            </button>
          </div>

          <div class="panel-switcher-pills" aria-label="Vyber panelu">
            <button
              v-for="item in PANEL_ITEMS"
              :key="item.id"
              class="panel-pill"
              :class="{ 'panel-pill-active': item.id === activePanelId }"
              type="button"
              @click="selectPanel(item.id)"
            >
              {{ item.label }}
            </button>
          </div>

          <div v-if="showDateSwitcher" class="date-switcher">
            <button class="ghost-button" type="button" @click="goToPreviousDate">Predchozi den</button>
            <label class="date-switcher-picker">
              <span>Datum</span>
              <input
                :value="state.selectedDate"
                type="date"
                :max="getTodayKey()"
                @input="updateSelectedDate($event.target.value)"
              />
            </label>
            <button class="ghost-button" type="button" :disabled="!canGoToNextDate" @click="goToNextDate">
              Dalsi den
            </button>
            <button class="ghost-button" type="button" :disabled="state.selectedDate === getTodayKey()" @click="updateSelectedDate(getTodayKey())">
              Dnes
            </button>
          </div>
        </div>

        <div v-if="showQuickCapture" class="floating-quick-capture">
          <div class="floating-quick-capture-copy">
            <p class="section-kicker">Rychly zapis</p>
            <h3>Zapsat aktualni stav</h3>
            <p class="panel-tip">
              Vyberte hodinu a stav. Pro detailni upravy pak muzete prejit do hodinove matice.
            </p>
            <p v-if="currentHourRecordCount > 1" class="panel-tip">
              Pro tuto hodinu uz existuje {{ currentHourRecordCount }} zaznamu. Zobrazuje se posledni.
            </p>
          </div>
          <div class="floating-quick-capture-form">
            <label>
              <span>Aktualni hodina</span>
              <select
                :value="currentHourLabel"
                :disabled="!isSelectedDateEditable"
                @input="updateCurrentHourLabel($event.target.value)"
              >
                <option v-for="hourLabel in Object.keys(selectedEntry.hours)" :key="hourLabel" :value="hourLabel">
                  {{ hourLabel }}
                </option>
              </select>
            </label>

            <label>
              <span>Aktualni stav</span>
              <select
                :value="selectedStateKey"
                :disabled="!isSelectedDateEditable"
                @input="updateSelectedStateKey($event.target.value)"
              >
                <option v-for="item in HOUR_STATES" :key="item.key" :value="item.key">
                  {{ item.label }}
                </option>
              </select>
            </label>

            <button
              class="primary-button"
              type="button"
              :disabled="!isSelectedDateEditable"
              @click="writeCurrentState"
            >
              Zapsat {{ quickCaptureStateLabel }}
            </button>
          </div>
          <p v-if="!isSelectedDateEditable" class="matrix-readonly-note floating-quick-capture-note">
            Rychly zapis je dostupny jen pro dnesni datum. Pro historicky den pouzijte jen nahled.
          </p>
        </div>

        <div v-if="!isOnline" class="status-banner status-banner-offline" role="status">
          <p>Pracujete offline. Zaznamy se ukladaji lokalne a synchronni akce zavisle na siti nejsou potreba.</p>
        </div>

        <div v-if="pwaOfflineReady" class="status-banner status-banner-ready" role="status">
          <p>Aplikace je pripravena k offline pouziti i po dalsim otevreni.</p>
          <button class="ghost-button" type="button" @click="dismissOfflineReady">Rozumim</button>
        </div>

        <div v-if="pwaUpdateRegistration" class="status-banner status-banner-update" role="status">
          <p>Je pripravena nova verze aplikace. Pro nacteni aktualizace staci obnovit aplikaci.</p>
          <button class="primary-button" type="button" @click="applyAppUpdate">Aktualizovat ted</button>
        </div>

        <p v-if="storageMessage" class="storage-message floating-menu-message">{{ storageMessage }}</p>
      </section>

      <main class="single-panel-shell">
        <section v-if="activePanelId === 'sekce-udaje'" class="panel panel-wide layout-profile">
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

          <div class="sync-settings-card">
            <div class="panel-heading sync-settings-heading">
              <div>
                <p class="section-kicker">Synchronizace</p>
                <h2>Cloud sync</h2>
              </div>
              <p class="panel-tip">{{ syncStatusSummary }}</p>
            </div>

            <form class="stack-form">
              <label>
                <span>Sync endpoint</span>
                <input
                  :value="syncSettings.endpoint"
                  type="url"
                  placeholder="https://your-api.run.app"
                  @input="updateSyncSetting('endpoint', $event.target.value)"
                />
              </label>

              <label>
                <span>API token</span>
                <input
                  :value="syncSettings.apiToken"
                  type="password"
                  placeholder="Bearer token pro prvni backend"
                  @input="updateSyncSetting('apiToken', $event.target.value)"
                />
              </label>

              <label>
                <span>Recovery secret</span>
                <input
                  v-model="recoverySecretInput"
                  type="text"
                  placeholder="vlozte existujici recovery secret nebo nechte vygenerovat"
                />
              </label>
            </form>

            <div class="sync-actions">
              <button class="primary-button" type="button" :disabled="isSyncBusy" @click="initializeSync">
                Inicializovat cloud sync
              </button>
              <button class="ghost-button" type="button" :disabled="isSyncBusy" @click="pullSync">
                Pull ze serveru
              </button>
              <button class="ghost-button" type="button" :disabled="isSyncBusy" @click="pushSync">
                Push na server
              </button>
              <button class="ghost-button" type="button" :disabled="isSyncBusy" @click="persistRecoverySecret">
                Ulozit recovery secret
              </button>
            </div>

            <div class="sync-meta">
              <p class="panel-tip">Lokalni klic: {{ hasSyncMasterKeyStored ? "ulozen" : "chybi" }}</p>
              <p class="panel-tip">Recovery secret: {{ hasRecoverySecretStored ? "ulozen" : "chybi" }}</p>
              <p v-if="syncSettings.lastSyncMessage" class="panel-tip">{{ syncSettings.lastSyncMessage }}</p>
            </div>

            <div v-if="generatedRecoverySecret" class="sync-warning-card">
              <strong>Ulozte si recovery secret</strong>
              <p>{{ generatedRecoverySecret }}</p>
              <span>Bez tohoto tajemstvi nepujde na novem zarizeni data desifrovat.</span>
            </div>
          </div>
        </section>

        <HourMatrix
          v-else-if="activePanelId === 'sekce-matice'"
          class="layout-matrix"
          :hours="selectedEntry.hours"
          :hour-records="selectedEntry.hourRecords"
          :selected-date="state.selectedDate"
          @update-hour="updateHour"
          @select-date="updateSelectedDate"
        />

        <DailyOverview
          v-else-if="activePanelId === 'sekce-prehled'"
          class="layout-overview"
          :model-value="selectedEntry"
          @patch-entry="updateEntry"
        />

        <MedicationPlan
          v-else-if="activePanelId === 'sekce-leky'"
          class="layout-medication"
          :medications="sortedMedications"
          @add-medication="addMedication"
          @remove-medication="removeMedication"
        />

        <DailyTimeline
          v-else-if="activePanelId === 'sekce-osa'"
          class="layout-timeline"
          :entries="state.entries"
          :selected-date="state.selectedDate"
          @select-date="updateSelectedDate"
        />
        <DaySummary
          v-else-if="activePanelId === 'sekce-souhrn'"
          class="layout-summary"
          :entry="selectedEntry"
          :entries="state.entries"
          :selected-date="state.selectedDate"
        />
        <ManualSection v-else-if="activePanelId === 'sekce-manualy'" class="layout-manuals" />
        <section v-else class="panel panel-wide home-panel">
          <div class="panel-heading">
            <div>
              <p class="section-kicker">Rychly zapis</p>
              <h2>Aktualni zachyt dne</h2>
            </div>
          </div>
          <p class="panel-tip">
            Pro rychly zapis pouzijte horni blok. Ostatni panely otevrite pres prepinac nahore.
          </p>
        </section>
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
      <div
        v-if="isBootstrapLogOpen"
        class="diagnostic-dialog-backdrop"
        role="presentation"
        @click.self="closeBootstrapLogPanel"
      >
        <section
          class="diagnostic-dialog"
          role="dialog"
          aria-modal="true"
          aria-labelledby="bootstrap-log-dialog-title"
        >
          <div class="diagnostic-dialog-header">
            <div>
              <p class="section-kicker">Diagnostika</p>
              <h2 id="bootstrap-log-dialog-title">Historie startu aplikace</h2>
              <p class="panel-tip">{{ bootstrapLogCountLabel }}</p>
            </div>
            <button class="ghost-button" type="button" @click="closeBootstrapLogPanel">
              Zavrit
            </button>
          </div>
          <div class="bootstrap-history">
            <ol class="bootstrap-history-list">
              <li
                v-for="entry in bootstrapLogEntries"
                :key="entry.id"
                class="bootstrap-history-item"
                :data-level="entry.level"
              >
                <span class="bootstrap-history-time">{{ entry.timeLabel }}</span>
                <p class="bootstrap-history-message">{{ entry.message }}</p>
              </li>
            </ol>
          </div>
        </section>
      </div>
    </template>
  </div>
</template>
