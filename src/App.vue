<script setup>
import { computed, nextTick, onMounted, onUnmounted, reactive, ref, watch, watchEffect } from "vue";
import DailyOverview from "./components/DailyOverview.vue";
import MedicationPlan from "./components/MedicationPlan.vue";
import HourMatrix from "./components/HourMatrix.vue";
import DaySummary from "./components/DaySummary.vue";
import DailyTimeline from "./components/DailyTimeline.vue";
import ManualSection from "./components/ManualSection.vue";
import {
  HOUR_STATES,
  appendHourStateRecord,
  clearHourStateRecords,
  createInitialState,
  createMedication,
  createTreatmentPlanItem,
  ensureEntry,
  formatLongDate,
  getHourRecordCount,
  getStateDefinition,
  markEntryDeleted,
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
  clearAuthSession,
  createDefaultAuthConfig,
  exchangeIdentityToken,
  fetchAuthConfig,
  loadStoredAuthSession,
  renderGoogleSignInButton,
  startAppleSignIn,
} from "./services/authService.js";
import {
  canScanRecoveryQrFromCamera,
  downloadRecoveryQr,
  importRecoverySecretFromQrImage,
  readRecoverySecretFromQrSource,
  renderRecoverySecretQr,
  canReadRecoveryQrFromImage,
} from "./services/recoveryTransfer.js";
import {
  clearSyncKeyMaterial,
  clearSyncState,
  deriveSyncEndpoint,
  getEffectiveSyncEndpoint,
  hasStoredRecoverySecret,
  hasStoredSyncMasterKey,
  initializeCloudSync,
  loadSyncKeyMaterial,
  loadSyncSettings,
  pullCloudState,
  pushCloudState,
  recoverLocalSyncKey,
  resetCloudState,
  saveRecoverySecret,
  saveSyncSettings,
} from "./services/syncService.js";
import { generateRecoverySecret } from "./services/e2eCrypto.js";
import {
  appendBootstrapLog,
  BOOTSTRAP_LOG_EVENT,
  getBootstrapLogEntries,
} from "./services/bootstrapLogger.js";

const diaryRepository = ref(null);
const fileInput = ref(null);
const jsonFileInput = ref(null);
const qrFileInput = ref(null);
const floatingMenu = ref(null);
const googleSignInTarget = ref(null);
const recoveryQrCanvas = ref(null);
const recoveryQrVideo = ref(null);
const isReady = ref(false);
const repositoryMode = ref("loading");
const storageMessage = ref("");
const bootstrapStatus = ref("Starting application bootstrap.");
const currentHourLabel = ref(getTrackableHourLabel());
const selectedStateKey = ref("on");
const selectedTreatmentPlanId = ref("");
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
const isRecoveryTransferOpen = ref(false);
const isRecoveryCameraOpen = ref(false);
const syncSettings = reactive(loadSyncSettings());
const authConfig = reactive(createDefaultAuthConfig());
const authSession = ref(loadStoredAuthSession());
const previousAuthUserId = ref(authSession.value?.user?.userId ?? "");
const recoverySecretInput = ref("");
const generatedRecoverySecret = ref("");
const storedRecoverySecret = ref(loadSyncKeyMaterial().recoverySecret ?? "");
const syncKeyMaterialRefreshToken = ref(0);
const isSyncBusy = ref(false);
const isAuthBusy = ref(false);
const isAutoRecoveringSyncKey = ref(false);
const isRecoveryCameraBusy = ref(false);
const isApplyingExternalState = ref(false);
const bootstrapLogEntries = ref(getBootstrapLogEntries());
const isCapturingBootstrapProgress = ref(true);
const recoveryCameraMessage = ref("");
const state = reactive({
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
  entries: {},
});

const selectedEntry = computed(() => state.entries[state.selectedDate] ?? null);
const selectedDateLabel = computed(() => formatLongDate(state.selectedDate));
const sortedMedications = computed(() =>
  [...(selectedEntry.value?.medications ?? [])].sort((left, right) => left.time.localeCompare(right.time)),
);
const sortedTreatmentPlan = computed(() =>
  [...(state.treatmentPlan ?? [])].sort((left, right) => left.time.localeCompare(right.time)),
);
const selectedTreatmentPlanItem = computed(() =>
  sortedTreatmentPlan.value.find((item) => item.id === selectedTreatmentPlanId.value) ?? null,
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
const quickCaptureMedicationLabel = computed(() => {
  const item = selectedTreatmentPlanItem.value;
  return item ? `${item.name} ${item.dose}` : "Davku z planu";
});
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
const hasRecoverySecretStored = computed(() => {
  syncKeyMaterialRefreshToken.value;
  return hasStoredRecoverySecret();
});
const hasSyncMasterKeyStored = computed(() => {
  syncKeyMaterialRefreshToken.value;
  return hasStoredSyncMasterKey();
});
const syncStatusSummary = computed(() => {
  const revision = Number(syncSettings.revision ?? 0);
  const syncedAt = syncSettings.lastSyncAt
    ? new Intl.DateTimeFormat("cs-CZ", { dateStyle: "medium", timeStyle: "short" }).format(
        new Date(syncSettings.lastSyncAt),
      )
    : "zatim nikdy";

  return `Revize ${revision} · posledni sync ${syncedAt}`;
});
const bootstrapLogCountLabel = computed(() => `${bootstrapLogEntries.value.length} kroku`);
const effectiveSyncEndpoint = computed(() => getEffectiveSyncEndpoint(syncSettings));
const buildInfo = __APP_BUILD_INFO__;
const buildTimestampLabel = computed(() => {
  if (!buildInfo?.builtAt) {
    return "nezname";
  }

  return new Intl.DateTimeFormat("cs-CZ", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(buildInfo.builtAt));
});
const buildVersionLabel = computed(() =>
  buildInfo?.commit ? `v${buildInfo.version} · ${buildInfo.commit}` : `v${buildInfo?.version ?? "0.0.0"}`,
);
const environmentLabel = computed(() => {
  const derivedEndpoint = deriveSyncEndpoint();
  if (!derivedEndpoint) {
    return "nezname prostredi";
  }

  return derivedEndpoint.includes("localhost") || derivedEndpoint.includes("127.0.0.1")
    ? "lokalni beh"
    : "cloud";
});
const isFederatedAuthEnabled = computed(() => authConfig.federatedAuthEnabled);
const showLegacyApiTokenField = computed(() => !isFederatedAuthEnabled.value || authConfig.legacyApiTokenEnabled);
const requiresSignedInUserForSync = computed(() => isFederatedAuthEnabled.value);
const authSummary = computed(() => {
  if (!authSession.value?.user) {
    return "Neprihlaseno";
  }

  return authSession.value.user.email || authSession.value.user.name || authSession.value.user.userId;
});
const effectiveRecoverySecret = computed(
  () => recoverySecretInput.value.trim() || generatedRecoverySecret.value.trim() || storedRecoverySecret.value.trim(),
);
const canDisplayRecoveryQr = computed(() => effectiveRecoverySecret.value.length > 0);
const canImportRecoveryQr = computed(() => canReadRecoveryQrFromImage());
const canScanRecoveryQrLive = computed(() => canScanRecoveryQrFromCamera());

let recoveryCameraStream = null;
let recoveryCameraScanTimeoutId = 0;

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

function applyAuthenticatedAccount(user = null) {
  if (!user) {
    state.account = {
      ...state.account,
      isAuthenticated: false,
      provider: "",
      userId: "",
    };
    return;
  }

  state.account = {
    ...state.account,
    isAuthenticated: true,
    provider: user.provider,
    userId: user.userId,
  };
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
  try {
    Object.assign(authConfig, await fetchAuthConfig());
  } catch (error) {
    console.error("Unable to load auth config", error);
  }
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
  selectedTreatmentPlanId.value = state.treatmentPlan?.[0]?.id ?? "";
  diaryRepository.value = repository;
  repositoryMode.value = repository.getMode();
  if (authSession.value?.user) {
    applyAuthenticatedAccount(authSession.value.user);
  }
  if (repository.bootstrapWarning) {
    storageMessage.value = repository.bootstrapWarning;
    appendBootstrapLog(repository.bootstrapWarning, "warning");
  }
  setBootstrapStatus("Initialization completed.");
  isReady.value = true;
  await tryAutoRecoverLocalSyncKey();

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

watchEffect(() => {
  if (!googleSignInTarget.value || !authConfig.googleEnabled || !authConfig.googleClientId || authSession.value?.user) {
    return;
  }

  void renderGoogleSignInButton(googleSignInTarget.value, authConfig.googleClientId, async (credential) => {
    await signInWithGoogleCredential(credential);
  });
});

watchEffect(() => {
  if (!isRecoveryTransferOpen.value || !recoveryQrCanvas.value || !canDisplayRecoveryQr.value) {
    return;
  }

  void renderRecoverySecretQr(recoveryQrCanvas.value, effectiveRecoverySecret.value).catch((error) => {
    console.error("Unable to render recovery QR", error);
    storageMessage.value = `QR kod recovery secretu se nepodarilo pripravit: ${error.message}`;
  });
});

onUnmounted(() => {
  closeRecoveryCameraScanner();
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
    updatedAt: new Date().toISOString(),
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

function refreshSyncKeyMaterialStatus() {
  syncKeyMaterialRefreshToken.value += 1;
  storedRecoverySecret.value = loadSyncKeyMaterial().recoverySecret ?? "";
}

function getCurrentTimeLabel() {
  return new Date().toTimeString().slice(0, 5);
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

function markCloudAuthenticated(user = null) {
  if (user ?? authSession.value?.user) {
    applyAuthenticatedAccount(user ?? authSession.value?.user);
    return;
  }

  if (!isFederatedAuthEnabled.value && syncSettings.apiToken?.trim()) {
    applyAuthenticatedAccount({
      provider: "cloud-token",
      userId: "legacy-token-user",
    });
  }
}

function ensureSyncIdentity() {
  if (requiresSignedInUserForSync.value && !authSession.value?.user) {
    storageMessage.value = "Pro cloud sync se nejprve prihlaste pres Google nebo Apple.";
    return false;
  }

  if (!requiresSignedInUserForSync.value && !syncSettings.apiToken?.trim()) {
    storageMessage.value = "Cloud sync neni overen. Prihlaste se nebo zapnete legacy API token.";
    return false;
  }

  return true;
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
  selectedEntry.value.updatedAt = new Date().toISOString();
}

function removeMedication(medicationId) {
  selectedEntry.value.medications = selectedEntry.value.medications.filter(
    (item) => item.id !== medicationId,
  );
  selectedEntry.value.updatedAt = new Date().toISOString();
}

function addTreatmentPlanItem(payload) {
  state.treatmentPlan.push(createTreatmentPlanItem(payload));
  state.treatmentPlan.sort((left, right) => left.time.localeCompare(right.time));
  if (!selectedTreatmentPlanId.value) {
    selectedTreatmentPlanId.value = state.treatmentPlan[0]?.id ?? "";
  }
}

function removeTreatmentPlanItem(planItemId) {
  state.treatmentPlan = state.treatmentPlan.filter((item) => item.id !== planItemId);
  if (selectedTreatmentPlanId.value === planItemId) {
    selectedTreatmentPlanId.value = state.treatmentPlan[0]?.id ?? "";
  }
}

function recordMedicationFromPlan() {
  if (!isSelectedDateEditable.value) {
    return;
  }

  const planItem = selectedTreatmentPlanItem.value;
  if (!planItem) {
    storageMessage.value = "Nejprve vyberte nebo vytvorte davku v planu lecby.";
    return;
  }

  const currentTime = getCurrentTimeLabel();
  addMedication({
    name: planItem.name,
    dose: planItem.dose,
    time: currentTime,
  });
  storageMessage.value = `Davka ${planItem.name} ${planItem.dose} byla zapsana na ${currentTime}.`;
}

function updateHour({ label, stateKey }) {
  if (!stateKey) {
    clearHourStateRecords(selectedEntry.value, label);
    storageMessage.value = `Zaznam pro hodinu ${label} byl vymazan.`;
    return;
  }

  appendHourStateRecord(selectedEntry.value, label, stateKey, { source: "manual" });
  storageMessage.value = `Stav ${getStateDefinition(stateKey).label} pridan pro hodinu ${label}.`;
}

function writeCurrentState() {
  appendHourStateRecord(selectedEntry.value, currentHourLabel.value, selectedStateKey.value, {
    source: "manual",
  });
  storageMessage.value = `Stav ${getStateDefinition(selectedStateKey.value).label} zapsan pro hodinu ${currentHourLabel.value}.`;
}

async function resetSelectedDateEverywhere() {
  const dateKey = state.selectedDate;
  const confirmed = globalThis.confirm(
    `Tato akce vynucene smaze zaznamy pro den ${dateKey} a rozesle smazani do vsech synchronizovanych zarizeni. Pokracovat?`,
  );
  if (!confirmed) {
    storageMessage.value = "Reset vybraneho dne byl zrusen.";
    return;
  }

  markEntryDeleted(state, dateKey);
  ensureEntry(state, dateKey);
  storageMessage.value = `Den ${dateKey} byl lokalne oznacen ke smazani. Odesilam reset do cloud syncu.`;

  if (ensureSyncIdentity()) {
    await pushSync(true);
    storageMessage.value = `Den ${dateKey} byl vynucene smazan a reset byl odeslan do cloud syncu.`;
  }
}

function resetAllData() {
  const confirmed = globalThis.confirm(
    "Tato akce smaze vsechny zaznamy deniku, lecbu i udaje o pacientovi v tomto zarizeni. Pokracovat?",
  );
  if (!confirmed) {
    storageMessage.value = "Uplny reset dat byl zrusen.";
    return;
  }

  const emptyState = createInitialState();
  applyImportedState({
    ...emptyState,
    account: state.account ?? emptyState.account,
  });
  Object.assign(syncSettings, clearSyncState(syncSettings));
  clearSyncKeyMaterial();
  refreshSyncKeyMaterialStatus();
  recoverySecretInput.value = "";
  generatedRecoverySecret.value = "";
  storageMessage.value =
    "Vsechna lokalni data deniku byla smazana. Cloud sync byl na tomto zarizeni odpojen, serverova data zustala zachovana.";
}

async function resetCloudData() {
  if (!ensureSyncIdentity()) {
    return;
  }

  const confirmed = globalThis.confirm(
    "Tato akce smaze sifrovany snapshot pro aktualni cloud ucet na serveru. Lokalni data v tomto zarizeni zustanou zachovana, ale sync se zde odpoji. Pokracovat?",
  );
  if (!confirmed) {
    storageMessage.value = "Reset serverovych dat byl zrusen.";
    return;
  }

  isSyncBusy.value = true;
  try {
    await resetCloudState(syncSettings);
    Object.assign(syncSettings, clearSyncState(syncSettings));
    clearSyncKeyMaterial();
    refreshSyncKeyMaterialStatus();
    recoverySecretInput.value = "";
    generatedRecoverySecret.value = "";
    storageMessage.value =
      "Serverova data pro tento cloud ucet byla smazana. Lokalni denik zustal zachovan a sync byl na tomto zarizeni odpojen.";
  } catch (error) {
    console.error("Cloud reset failed", error);
    Object.assign(syncSettings, saveSyncSettings({
      ...syncSettings,
      lastSyncStatus: "error",
      lastSyncMessage: error.message,
    }));
    storageMessage.value = `Reset serverovych dat selhal: ${error.message}`;
  } finally {
    isSyncBusy.value = false;
  }
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

async function signInWithGoogleCredential(credential) {
  isAuthBusy.value = true;
  try {
    const session = await exchangeIdentityToken({
      provider: "google",
      idToken: credential,
    });
    authSession.value = session;
    applyAuthenticatedAccount(session.user);
    await tryAutoRecoverLocalSyncKey();
    storageMessage.value = `Prihlaseni pres Google uspesne: ${session.user.email || session.user.name}.`;
  } catch (error) {
    console.error("Google sign-in failed", error);
    storageMessage.value = `Prihlaseni pres Google selhalo: ${error.message}`;
  } finally {
    isAuthBusy.value = false;
  }
}

async function signInWithApple() {
  isAuthBusy.value = true;
  try {
    const result = await startAppleSignIn({
      clientId: authConfig.appleClientId,
      redirectPath: authConfig.appleRedirectPath,
    });
    const session = await exchangeIdentityToken({
      provider: "apple",
      idToken: result.idToken,
      nonce: result.nonce,
      profile: result.profile,
    });
    authSession.value = session;
    applyAuthenticatedAccount(session.user);
    await tryAutoRecoverLocalSyncKey();
    storageMessage.value = `Prihlaseni pres Apple uspesne: ${session.user.email || session.user.name}.`;
  } catch (error) {
    console.error("Apple sign-in failed", error);
    storageMessage.value = `Prihlaseni pres Apple selhalo: ${error.message}`;
  } finally {
    isAuthBusy.value = false;
  }
}

function signOut() {
  clearAuthSession();
  authSession.value = null;
  applyAuthenticatedAccount(null);
  storageMessage.value = "Prihlaseni bylo odpojeno. Lokalni data zustala zachovana.";
}

async function tryAutoRecoverLocalSyncKey() {
  if (
    isAutoRecoveringSyncKey.value
    || !isReady.value
    || !authSession.value?.user
    || hasSyncMasterKeyStored.value
    || !hasRecoverySecretStored.value
  ) {
    return;
  }

  isAutoRecoveringSyncKey.value = true;
  try {
    const result = await recoverLocalSyncKey({
      ...syncSettings,
      userId: authSession.value.user.userId ?? syncSettings.userId,
    });
    refreshSyncKeyMaterialStatus();

    if (!result.recovered) {
      return;
    }

    Object.assign(syncSettings, saveSyncSettings({
      ...syncSettings,
      userId: authSession.value.user.userId ?? syncSettings.userId,
      revision: result.revision ?? syncSettings.revision,
      lastSyncAt: result.updatedAt || syncSettings.lastSyncAt,
      lastSyncStatus: "ok",
      lastSyncMessage: "Lokalni sifrovaci klic byl automaticky obnoven z recovery secretu.",
    }));
    storageMessage.value = "Lokalni sifrovaci klic byl automaticky obnoven z recovery secretu.";
  } catch (error) {
    console.error("Automatic local sync key recovery failed", error);
    Object.assign(syncSettings, saveSyncSettings({
      ...syncSettings,
      lastSyncStatus: "error",
      lastSyncMessage: error.message,
    }));
  } finally {
    isAutoRecoveringSyncKey.value = false;
  }
}

function generateNewRecoverySecret() {
  recoverySecretInput.value = generateRecoverySecret();
  storageMessage.value = "Byl vygenerovan novy recovery secret. Ulozte si jej i mimo zarizeni.";
}

function openRecoveryTransfer() {
  if (!effectiveRecoverySecret.value) {
    generateNewRecoverySecret();
  }

  isRecoveryTransferOpen.value = true;
}

function closeRecoveryTransfer() {
  isRecoveryTransferOpen.value = false;
}

function clearRecoveryCameraScanLoop() {
  if (recoveryCameraScanTimeoutId) {
    globalThis.clearTimeout(recoveryCameraScanTimeoutId);
    recoveryCameraScanTimeoutId = 0;
  }
}

function stopRecoveryCameraStream() {
  clearRecoveryCameraScanLoop();

  if (recoveryQrVideo.value) {
    recoveryQrVideo.value.pause?.();
    recoveryQrVideo.value.srcObject = null;
  }

  if (recoveryCameraStream) {
    for (const track of recoveryCameraStream.getTracks()) {
      track.stop();
    }
    recoveryCameraStream = null;
  }
}

function closeRecoveryCameraScanner() {
  stopRecoveryCameraStream();
  isRecoveryCameraOpen.value = false;
  isRecoveryCameraBusy.value = false;
  recoveryCameraMessage.value = "";
}

function scheduleRecoveryCameraScan(delay = 250) {
  clearRecoveryCameraScanLoop();
  recoveryCameraScanTimeoutId = globalThis.setTimeout(() => {
    void scanRecoveryQrFromCamera();
  }, delay);
}

async function scanRecoveryQrFromCamera() {
  if (!isRecoveryCameraOpen.value || isRecoveryCameraBusy.value) {
    return;
  }

  const video = recoveryQrVideo.value;
  if (!video || video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
    recoveryCameraMessage.value = "Cekam na snimek z kamery.";
    scheduleRecoveryCameraScan(200);
    return;
  }

  isRecoveryCameraBusy.value = true;
  try {
    const secret = await readRecoverySecretFromQrSource(video);
    if (!secret) {
      recoveryCameraMessage.value = "QR kod zatim nevidim. Namirte kameru primo na kod.";
      scheduleRecoveryCameraScan(250);
      return;
    }

    recoverySecretInput.value = secret;
    closeRecoveryCameraScanner();
    storageMessage.value = "Recovery secret byl nacten z QR kodu z kamery.";
  } catch (error) {
    console.error("Recovery camera scan failed", error);
    closeRecoveryCameraScanner();
    storageMessage.value = `Skenovani recovery QR kamerou selhalo: ${error.message}`;
  } finally {
    isRecoveryCameraBusy.value = false;
  }
}

async function openRecoveryCameraScanner() {
  if (!canScanRecoveryQrLive.value) {
    openRecoveryQrImageImport();
    return;
  }

  stopRecoveryCameraStream();
  isRecoveryCameraOpen.value = true;
  recoveryCameraMessage.value = "Spoustim zadni kameru pro QR skener.";

  try {
    recoveryCameraStream = await globalThis.navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: { ideal: "environment" },
      },
      audio: false,
    });

    await nextTick();

    if (!recoveryQrVideo.value) {
      throw new Error("Video nahled kamery neni pripraven.");
    }

    recoveryQrVideo.value.srcObject = recoveryCameraStream;
    recoveryQrVideo.value.setAttribute("playsinline", "true");
    recoveryQrVideo.value.muted = true;
    await recoveryQrVideo.value.play();
    recoveryCameraMessage.value = "Namirte kameru na recovery QR kod.";
    scheduleRecoveryCameraScan(200);
  } catch (error) {
    console.error("Unable to open recovery camera scanner", error);
    closeRecoveryCameraScanner();
    storageMessage.value = `Kameru se nepodarilo otevrit: ${error.message}`;
  }
}

function downloadRecoveryQrCode() {
  try {
    downloadRecoveryQr(recoveryQrCanvas.value);
    storageMessage.value = "QR kod recovery secretu byl ulozen jako PNG.";
  } catch (error) {
    storageMessage.value = error.message;
  }
}

function openRecoveryQrImageImport() {
  if (isRecoveryCameraOpen.value) {
    closeRecoveryCameraScanner();
  }

  qrFileInput.value?.click();
}

function openRecoveryQrImport() {
  if (canScanRecoveryQrLive.value) {
    void openRecoveryCameraScanner();
    return;
  }

  openRecoveryQrImageImport();
}

async function importRecoveryQr(event) {
  const [file] = event.target.files ?? [];
  if (!file) {
    return;
  }

  try {
    const secret = await importRecoverySecretFromQrImage(file);
    recoverySecretInput.value = secret;
    storageMessage.value = "Recovery secret byl nacten z QR kodu.";
  } catch (error) {
    console.error("Recovery QR import failed", error);
    storageMessage.value = `QR import recovery secretu selhal: ${error.message}`;
  } finally {
    event.target.value = "";
  }
}

async function initializeSync() {
  if (!ensureSyncIdentity()) {
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
      userId: authSession.value?.user?.userId ?? syncSettings.userId,
      revision: result.revision,
      lastSyncAt: result.updatedAt,
      lastSyncStatus: "ok",
      lastSyncMessage: "Cloud sync initialized.",
    }));
    generatedRecoverySecret.value = result.generatedRecoverySecret;
    if (result.generatedRecoverySecret) {
      recoverySecretInput.value = result.generatedRecoverySecret;
    }
    refreshSyncKeyMaterialStatus();
    markCloudAuthenticated(authSession.value?.user ?? null);
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
  if (!ensureSyncIdentity()) {
    return;
  }

  isSyncBusy.value = true;
  try {
    storageMessage.value = "Nacitam sifrovany stav ze serveru.";
    const result = await pullCloudState(syncSettings);
    refreshSyncKeyMaterialStatus();
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
      userId: authSession.value?.user?.userId ?? syncSettings.userId,
      revision: result.revision,
      lastSyncAt: result.updatedAt,
      lastSyncStatus: "ok",
      lastSyncMessage: "Cloud pull completed.",
    }));
    markCloudAuthenticated(authSession.value?.user ?? null);
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
  const shouldForce = force === true;

  if (!ensureSyncIdentity()) {
    return;
  }

  isSyncBusy.value = true;
  try {
    storageMessage.value = "Pripravuji lokalni stav pro odeslani do cloud syncu.";
    const result = await pushCloudState({
      state,
      settings: syncSettings,
      baseRevision: Number(syncSettings.revision ?? 0),
      force: shouldForce,
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
        userId: authSession.value?.user?.userId ?? syncSettings.userId,
        revision: retryResult.revision,
        lastSyncAt: retryResult.updatedAt,
        lastSyncStatus: "ok",
        lastSyncMessage: "Conflict merged and pushed.",
      }));
      markCloudAuthenticated(authSession.value?.user ?? null);
      refreshSyncKeyMaterialStatus();
      storageMessage.value = "Konflikt byl sloucen append-only a synchronizace dokoncena.";
      return;
    }

    Object.assign(syncSettings, saveSyncSettings({
      ...syncSettings,
      userId: authSession.value?.user?.userId ?? syncSettings.userId,
      revision: result.revision,
      lastSyncAt: result.updatedAt,
      lastSyncStatus: "ok",
      lastSyncMessage: "Cloud push completed.",
    }));
    markCloudAuthenticated(authSession.value?.user ?? null);
    refreshSyncKeyMaterialStatus();
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
  const secret = effectiveRecoverySecret.value;
  if (!secret) {
    storageMessage.value = "Zadejte recovery secret.";
    return;
  }

  recoverySecretInput.value = secret;
  saveRecoverySecret(secret);
  refreshSyncKeyMaterialStatus();
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
    state.treatmentPlan = nextState.treatmentPlan ?? [];
    state.deletedEntryDates = nextState.deletedEntryDates ?? {};
    state.account = nextState.account ?? state.account;
    state.entries = nextState.entries ?? {};
    ensureEntry(state, state.selectedDate);
    if (!selectedTreatmentPlanId.value || !state.treatmentPlan.some((item) => item.id === selectedTreatmentPlanId.value)) {
      selectedTreatmentPlanId.value = state.treatmentPlan[0]?.id ?? "";
    }
    diaryRepository.value?.saveState(state);
  } finally {
    isApplyingExternalState.value = false;
  }
}

watch(
  () => authSession.value?.user?.userId ?? "",
  (nextUserId, previousUserId) => {
    previousAuthUserId.value = nextUserId;
    if (!previousUserId || !nextUserId || previousUserId === nextUserId) {
      return;
    }

    Object.assign(syncSettings, clearSyncState(syncSettings));
    clearSyncKeyMaterial();
    refreshSyncKeyMaterialStatus();
    recoverySecretInput.value = "";
    generatedRecoverySecret.value = "";
    storageMessage.value =
      "Byl zvolen jiny cloud ucet. Lokalni data zustala zachovana, ale sync tohoto zarizeni byl odpojen. Nejprve provedte Pull nebo znovu inicializujte sync pro novy ucet.";
  },
);

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
            <p class="panel-tip">Sestaveni {{ buildTimestampLabel }} · {{ buildVersionLabel }} · {{ environmentLabel }}</p>
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
            <button class="ghost-button utility-menu-item-danger" type="button" @click="resetSelectedDateEverywhere">
              Vynucene smazat tento den
            </button>
          </div>
        </div>

        <div v-if="showQuickCapture" class="floating-quick-capture">
          <div class="floating-quick-capture-copy">
            <p class="section-kicker">Rychly zapis</p>
            <h3>Zapsat aktualni stav</h3>
            <p class="panel-tip">
              Vyberte hodinu, stav nebo davku z planu lecby. Pro detailni upravy pak muzete prejit do hodinove matice.
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

            <label>
              <span>Davka z planu</span>
              <select
                :value="selectedTreatmentPlanId"
                :disabled="!isSelectedDateEditable || sortedTreatmentPlan.length === 0"
                @input="selectedTreatmentPlanId = $event.target.value"
              >
                <option value="">Vyberte planovanou davku</option>
                <option v-for="item in sortedTreatmentPlan" :key="item.id" :value="item.id">
                  {{ item.time }} · {{ item.name }} · {{ item.dose }}
                </option>
              </select>
            </label>

            <button
              class="ghost-button"
              type="button"
              :disabled="!isSelectedDateEditable || !selectedTreatmentPlanItem"
              @click="recordMedicationFromPlan"
            >
              Zapsat {{ quickCaptureMedicationLabel }} ted
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

          <div class="sync-warning-card">
            <strong>Uplny reset lokalnich dat</strong>
            <p>Smaze vsechny denni zaznamy, lecbu i udaje o pacientovi v tomto zarizeni. Prihlaseni a sync nastaveni zustanou zachovane.</p>
            <div class="sync-actions">
              <button class="ghost-button utility-menu-item-danger" type="button" @click="resetAllData">
                Smazat vsechna lokalni data
              </button>
            </div>
          </div>

          <div class="sync-warning-card">
            <strong>Reset cloud dat na serveru</strong>
            <p>Smaze sifrovany cloud snapshot pouze pro aktualne prihlaseny cloud ucet. Lokalni data zustanou zachovana, ale toto zarizeni se od syncu odpoji a bude nutna nova inicializace.</p>
            <div class="sync-actions">
              <button class="ghost-button utility-menu-item-danger" type="button" :disabled="isSyncBusy" @click="resetCloudData">
                Smazat cloud data na serveru
              </button>
            </div>
          </div>

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
                  :value="effectiveSyncEndpoint"
                  type="url"
                  readonly
                />
              </label>

              <label v-if="showLegacyApiTokenField">
                <span>API token</span>
                <input
                  :value="syncSettings.apiToken"
                  type="password"
                  placeholder="Bearer token pro prvni backend"
                  @input="updateSyncSetting('apiToken', $event.target.value)"
                />
              </label>

              <div v-if="isFederatedAuthEnabled" class="auth-panel">
                <div class="auth-panel-copy">
                  <span>Prihlaseni</span>
                  <p class="panel-tip">
                    {{ authSession?.user ? `Prihlaseno jako ${authSummary}.` : "Prihlaste se pres Google nebo Apple a bearer token uz nebude potreba." }}
                  </p>
                </div>
                <div class="auth-panel-actions">
                  <div v-if="!authSession?.user && authConfig.googleEnabled" ref="googleSignInTarget" class="google-signin-slot"></div>
                  <button
                    v-if="!authSession?.user && authConfig.appleEnabled"
                    class="ghost-button"
                    type="button"
                    :disabled="isAuthBusy"
                    @click="signInWithApple"
                  >
                    Prihlasit pres Apple
                  </button>
                  <button
                    v-if="authSession?.user"
                    class="ghost-button"
                    type="button"
                    :disabled="isAuthBusy"
                    @click="signOut"
                  >
                    Odhlasit
                  </button>
                </div>
              </div>

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
              <button class="ghost-button" type="button" :disabled="isSyncBusy" @click="generateNewRecoverySecret">
                Vygenerovat secret
              </button>
              <button class="ghost-button" type="button" :disabled="!canDisplayRecoveryQr" @click="openRecoveryTransfer">
                Zobrazit QR
              </button>
              <button
                class="ghost-button"
                type="button"
                :disabled="!canImportRecoveryQr"
                @click="openRecoveryQrImport"
              >
                Nacist z QR
              </button>
            </div>

            <div class="sync-meta">
              <p class="panel-tip">Odvozeno z URL aplikace: {{ effectiveSyncEndpoint }}</p>
              <p v-if="isFederatedAuthEnabled" class="panel-tip">
                Federated auth:
                {{ authConfig.googleEnabled ? "Google " : "" }}{{ authConfig.appleEnabled ? "Apple" : "" }}
              </p>
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
          :treatment-plan="sortedTreatmentPlan"
          :recorded-medications="sortedMedications"
          @add-plan-item="addTreatmentPlanItem"
          @remove-plan-item="removeTreatmentPlanItem"
          @remove-recorded-medication="removeMedication"
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
      <input
        ref="qrFileInput"
        class="visually-hidden"
        type="file"
        accept="image/*"
        capture="environment"
        @change="importRecoveryQr"
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
      <div
        v-if="isRecoveryCameraOpen"
        class="diagnostic-dialog-backdrop"
        role="presentation"
        @click.self="closeRecoveryCameraScanner"
      >
        <section
          class="diagnostic-dialog recovery-camera-dialog"
          role="dialog"
          aria-modal="true"
          aria-labelledby="recovery-camera-dialog-title"
        >
          <div class="diagnostic-dialog-header">
            <div>
              <p class="section-kicker">Recovery</p>
              <h2 id="recovery-camera-dialog-title">Nacist QR z kamery</h2>
              <p class="panel-tip">Na mobilu se pokusim otevrit zadni kameru. Pokud to prohlizec nedovoli, muzete vybrat obrazek rucne.</p>
            </div>
            <button class="ghost-button" type="button" @click="closeRecoveryCameraScanner">
              Zavrit
            </button>
          </div>

          <div class="recovery-camera-card">
            <video ref="recoveryQrVideo" class="recovery-camera-video" autoplay muted playsinline></video>
            <p class="panel-tip">{{ recoveryCameraMessage }}</p>
          </div>

          <div class="recovery-transfer-actions">
            <button class="ghost-button" type="button" @click="openRecoveryQrImageImport">
              Vybrat QR obrazek
            </button>
            <button class="ghost-button" type="button" @click="closeRecoveryCameraScanner">
              Zavrit skener
            </button>
          </div>
        </section>
      </div>
      <div
        v-if="isRecoveryTransferOpen"
        class="diagnostic-dialog-backdrop"
        role="presentation"
        @click.self="closeRecoveryTransfer"
      >
        <section
          class="diagnostic-dialog recovery-transfer-dialog"
          role="dialog"
          aria-modal="true"
          aria-labelledby="recovery-transfer-dialog-title"
        >
          <div class="diagnostic-dialog-header">
            <div>
              <p class="section-kicker">Recovery</p>
              <h2 id="recovery-transfer-dialog-title">Prenos recovery secretu</h2>
              <p class="panel-tip">Tento secret drzte mimo repozitar a beznych screenshotu. Slouzi k obnove sifrovaciho klice.</p>
            </div>
            <button class="ghost-button" type="button" @click="closeRecoveryTransfer">
              Zavrit
            </button>
          </div>

          <div class="recovery-transfer-grid">
            <div class="recovery-secret-preview">
              <p class="section-kicker">Aktivni secret</p>
              <code class="recovery-secret-code">{{ effectiveRecoverySecret }}</code>
              <div class="recovery-transfer-actions">
                <button class="ghost-button" type="button" @click="persistRecoverySecret">
                  Ulozit lokalne
                </button>
                <button class="ghost-button" type="button" @click="downloadRecoveryQrCode">
                  Ulozit QR PNG
                </button>
              </div>
            </div>

            <div class="recovery-qr-card">
              <canvas ref="recoveryQrCanvas" class="recovery-qr-canvas"></canvas>
              <p class="panel-tip">Druhe zarizeni muze nahrat QR obrazek a secret nacist bez opisovani.</p>
            </div>
          </div>
        </section>
      </div>
    </template>
  </div>
</template>
