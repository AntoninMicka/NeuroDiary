<script setup>
import { computed, nextTick, onMounted, onUnmounted, reactive, ref, watch, watchEffect } from "vue";
import DailyOverview from "./components/DailyOverview.vue";
import MedicationPlan from "./components/MedicationPlan.vue";
import HourMatrix from "./components/HourMatrix.vue";
import DaySummary from "./components/DaySummary.vue";
import DailyTimeline from "./components/DailyTimeline.vue";
import QuickCaptureTimeline from "./components/QuickCaptureTimeline.vue";
import LongTermTrends from "./components/LongTermTrends.vue";
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
  getTreatmentPlanForDate,
  getStateDefinition,
  markMedicationDeleted,
  markEntryDeleted,
  mergeDiaryStatesAppendOnly,
  reconcileEntryHourState,
  shiftDateKey,
  getTodayKey,
  getTrackableHourLabel,
} from "./domain/diary.js";
import { createDiaryRepository } from "./repositories/index.js";
import { parseJsonBackup, serializeJsonBackup } from "./services/jsonTransfer.js";
import { downloadDoctorReportPdf, openDoctorReportPrint } from "./services/doctorReport.js";
import { auditDiaryState } from "./services/dataIntegrity.js";
import { activateServiceWorkerUpdate, OFFLINE_READY_EVENT, UPDATE_READY_EVENT } from "./pwa.js";
import {
  clearAuthSession,
  createDefaultAuthConfig,
  exchangeIdentityToken,
  fetchAuthConfig,
  loadStoredAuthSession,
  requestGoogleGmailSendAccessToken,
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
  acceptTransferredSyncKey,
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
  rotateCloudEncryption,
  saveRecoverySecret,
  saveSyncSettings,
} from "./services/syncService.js";
import {
  consumeDeviceKeyTransfer,
  ensureDeviceExchangeKeyPublished,
  fetchDeviceKeyRequests,
  fetchDevicePublicKeys,
  fetchIdentityKeyMigration,
  fulfillDeviceKeyRequest,
  requestDeviceMasterKey,
  disableIdentityKeyMigration,
  resetDeviceExchangeIdentity,
} from "./services/deviceKeyExchange.js";
import {
  fetchTrustedDevices,
  getCurrentDeviceId,
  regenerateCurrentDeviceId,
  registerCurrentDevice,
  renameTrustedDevice,
  revokeTrustedDevice,
} from "./services/trustedDevices.js";
import {
  createPlainReportAttachment,
  createProtectedReportAttachment,
  generateReportPassword,
  shareEncryptedReport,
  sharePlainReport,
} from "./services/secureReportShare.js";
import { sendGmailMessage } from "./services/gmailService.js";
import {
  activateDiaryShareInvitation,
  cancelDiaryShareInvitation,
  createDiaryShare,
  decryptSharedDiary,
  createTreatmentProposal,
  fetchTreatmentProposals,
  decryptTreatmentProposal,
  decryptTreatmentProposalResponse,
  decideTreatmentProposal,
  cancelTreatmentProposal,
  persistEncryptedTreatmentDraft,
  restoreEncryptedTreatmentDraft,
  listEncryptedTreatmentDrafts,
  removeEncryptedTreatmentDraft,
  fetchDiaryShares,
  respondToDiaryShareInvitation,
  revokeDiaryShare,
} from "./services/diarySharing.js";
import { createCloudBackup, deleteCloudBackup, fetchAdminStatus, fetchAdminUsers, updateAdminUserRoles } from "./services/adminService.js";
import { fetchCurrentRoles, updateCurrentDeviceRoles, updateSelfAssignableRoles } from "./services/roleService.js";
import { CAREGIVER_PANEL_ITEMS, canAccessClinicalAnalyses, isCaregiverOnlyRoleSet } from "./services/roleUi.js";
import { generateRecoverySecret } from "./services/e2eCrypto.js";
import { compareTreatmentPlans, TREATMENT_FIELD_LABELS } from "./services/treatmentProposal.js";
import {
  deleteContact,
  generateContactKeyPair,
  loadContacts,
  saveContact,
} from "./services/contactKeyring.js";
import {
  appendBootstrapLog,
  BOOTSTRAP_LOG_EVENT,
  getBootstrapLogEntries,
} from "./services/bootstrapLogger.js";
import {
  buildMedicationDuplicateKey,
  isValidDateKey,
  validateBirthYear,
  validateMedicationInput,
} from "./services/validation.js";
import {
  canUseMedicationNotifications,
  checkMedicationReminders,
  getMedicationNotificationPermission,
  loadMedicationReminderSettings,
  requestMedicationNotificationPermission,
  saveMedicationReminderSettings,
} from "./services/medicationReminders.js";
import {
  canUseWebPush,
  fetchWebPushConfig,
  registerWebPush,
  unregisterWebPush,
} from "./services/webPushService.js";
import {
  getMedicationWindowStatus,
  getPlannedDoseDate,
  isQuickCaptureDateValid,
  roundDownToTimelineStep,
} from "./services/quickCapture.js";
import { createSyncRetryScheduler } from "./services/syncRetry.js";
import {
  createLocalBackup,
  listLocalBackups,
  restoreLocalBackup,
  shouldCreateAutomaticBackup,
} from "./services/localBackups.js";
import {
  checkDiaryCompletionReminder,
  loadDiaryReminderSettings,
  saveDiaryReminderSettings,
} from "./services/diaryReminders.js";
import {
  clearConflictAudit,
  loadConflictAudit,
  recordConflictDetected,
  resolveConflictAudit,
} from "./services/conflictAudit.js";

const PENDING_SYNC_CHANGES_STORAGE_KEY = "neurodiary-pending-sync-changes-v1";
const TREATMENT_PROPOSAL_STATUS_STORAGE_KEY = "neurodiary-treatment-proposal-status-v1";

function formatDateKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatDateTimeLocal(date) {
  return `${formatDateKey(date)}T${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

function formatAdminTimestamp(value) {
  if (!value) return "neuvedeno";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("cs-CZ", { dateStyle: "medium", timeStyle: "short" }).format(date);
}

function loadPendingSyncChanges() {
  try {
    return globalThis.localStorage?.getItem(PENDING_SYNC_CHANGES_STORAGE_KEY) === "true";
  } catch {
    return false;
  }
}

function savePendingSyncChanges(hasPendingChanges) {
  try {
    globalThis.localStorage?.setItem(PENDING_SYNC_CHANGES_STORAGE_KEY, String(hasPendingChanges));
  } catch {
    // Local state remains authoritative even when the browser blocks localStorage.
  }
}

const diaryRepository = ref(null);
const fileInput = ref(null);
const jsonFileInput = ref(null);
const qrFileInput = ref(null);
const floatingMenu = ref(null);
const panelShell = ref(null);
const googleSignInTarget = ref(null);
const recoveryQrCanvas = ref(null);
const recoveryQrVideo = ref(null);
const isReady = ref(false);
const repositoryMode = ref("načítání");
const storageMessage = ref("");
const lastCaptureUndo = ref(null);
const birthYearValidationMessage = ref("");
const bootstrapStatus = ref("Spouštím inicializaci aplikace.");
const quickCaptureNow = ref(new Date());
const timelineSelectedTime = ref(roundDownToTimelineStep(new Date()));
const selectedStateKey = ref("on");
const selectedTreatmentPlanId = ref("");
const reportOptions = reactive({
  includeToday: false,
});
const doctorContact = reactive({ name: "", email: "" });
const contacts = ref(loadContacts());
const selectedContactId = ref(contacts.value[0]?.id ?? "");
const contactEditor = reactive({ id: "", name: "", email: "", publicKeyPem: "" });
const generatedContactPrivateKey = ref("");
const reportSharePassword = ref("");
const encryptOneTimeReport = ref(false);
const shareRecipientEmail = ref("");
const diaryShares = reactive({ outgoing: [], incoming: [], outgoingInvitations: [], incomingInvitations: [] });
const sharedDiaryViews = ref([]);
const selectedSharedGrantId = ref("");
const selectedSharedSection = ref("timeline");
const treatmentProposalDraft = ref([]);
const treatmentProposalDoctorNote = ref("");
const treatmentProposalPreviousId = ref(null);
const treatmentReturnComments = reactive({});
const treatmentProposalDraftDirty = ref(false);
const treatmentDraftItems = ref(listEncryptedTreatmentDrafts());
const treatmentDraftSavedAt = ref("");
const treatmentProposals = ref([]);
const treatmentProposalFilter = ref("all");
const selectedSharedDate = ref(getTodayKey());
const sharedRecordsSearch = ref("");
const isSharingBusy = ref(false);
const sharingMessage = ref("");
const adminStatus = ref(null);
const adminUsers = ref([]);
const adminRoleDefinitions = ref({});
const selectedAdminUserId = ref("");
const adminUserSearch = ref("");
const adminRoleDraft = ref([]);
const adminError = ref("");
const isAdminBusy = ref(false);
const accountRoles = reactive({ assignedRoles: [], activeRoles: [], definitions: {} });
const selfAssignableRoleDraft = ref(["patient"]);
const currentDeviceRoleDraft = ref([]);
const trustedDevices = ref([]);
const pendingDeviceKeyRequests = ref([]);
const rotationTargetDeviceIds = ref([]);
const identityKeyMigration = ref(null);
const identityKeyError = ref("");
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
const isIntegrityReportOpen = ref(false);
const isRecoveryTransferOpen = ref(false);
const isRecoveryCameraOpen = ref(false);
const syncSettings = reactive(loadSyncSettings());
const medicationReminderSettings = reactive(loadMedicationReminderSettings());
const diaryReminderSettings = reactive(loadDiaryReminderSettings());
const localBackupItems = ref([]);
const webPushConfig = reactive({ enabled: false, publicKey: "" });
const authConfig = reactive(createDefaultAuthConfig());
const authSession = ref(loadStoredAuthSession());
const previousAuthUserId = ref(authSession.value?.user?.userId ?? "");
const recoverySecretInput = ref("");
const generatedRecoverySecret = ref("");
const storedRecoverySecret = ref(loadSyncKeyMaterial().recoverySecret ?? "");
const syncKeyMaterialRefreshToken = ref(0);
const isSyncBusy = ref(false);
const hasPendingSyncChanges = ref(loadPendingSyncChanges());
const conflictAuditItems = ref(loadConflictAudit());
const isAuthBusy = ref(false);
const isAutoRecoveringSyncKey = ref(false);
const isRecoveryCameraBusy = ref(false);
const isApplyingExternalState = ref(false);
const bootstrapLogEntries = ref(getBootstrapLogEntries());
const isCapturingBootstrapProgress = ref(true);
const recoveryCameraMessage = ref("");
const medicationNotificationPermission = ref(getMedicationNotificationPermission());
const webPushStatus = ref("local-only");
const webPushMessage = ref("");
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
  deletedMedicationIds: {},
  entries: {},
});

const selectedEntry = computed(() => state.entries[state.selectedDate] ?? null);
const selectedSharedView = computed(() =>
  sharedDiaryViews.value.find((item) => item.grantId === selectedSharedGrantId.value) ?? sharedDiaryViews.value[0] ?? null,
);
const selectedSharedEntry = computed(() => selectedSharedView.value?.state?.entries?.[selectedSharedDate.value] ?? null);
const filteredSharedDiaryViews = computed(() => {
  const query = sharedRecordsSearch.value.trim().toLocaleLowerCase("cs");
  if (!query) return sharedDiaryViews.value;
  return sharedDiaryViews.value.filter((view) => [
    view.state?.patientName,
    view.state?.birthYear,
    view.ownerName,
    view.ownerEmail,
  ].some((value) => String(value ?? "").toLocaleLowerCase("cs").includes(query)));
});
const pendingShareInvitationCount = computed(() =>
  diaryShares.incomingInvitations.filter((item) => item.status === "pending").length,
);
const isDoctorRoleActive = computed(() => accountRoles.activeRoles.includes("doctor"));
const canUseClinicalAnalyses = computed(() => canAccessClinicalAnalyses(accountRoles.activeRoles));
const filteredTreatmentProposals = computed(() => treatmentProposals.value.filter((proposal) =>
  treatmentProposalFilter.value === "all" || proposal.status === treatmentProposalFilter.value,
));
const legacyOutgoingShares = computed(() => {
  const linkedGrantIds = new Set(diaryShares.outgoingInvitations.map((item) => item.grantId).filter(Boolean));
  return diaryShares.outgoing.filter((item) => !linkedGrantIds.has(item.grantId));
});
const filteredAdminUsers = computed(() => {
  const query = adminUserSearch.value.trim().toLocaleLowerCase("cs");
  if (!query) return adminUsers.value;
  return adminUsers.value.filter((user) => [user.name, user.email, user.userId]
    .some((value) => String(value ?? "").toLocaleLowerCase("cs").includes(query)));
});
const selectedAdminUser = computed(() =>
  adminUsers.value.find((user) => user.userId === selectedAdminUserId.value) ?? null,
);
const selectedDateLabel = computed(() => formatLongDate(state.selectedDate));
const sortedMedications = computed(() =>
  [...(selectedEntry.value?.medications ?? [])].sort((left, right) => left.time.localeCompare(right.time)),
);
const sortedTreatmentPlan = computed(() =>
  [...(state.treatmentPlan ?? [])].sort((left, right) => left.time.localeCompare(right.time)),
);
const activeTodayTreatmentPlan = computed(() =>
  getTreatmentPlanForDate(state.treatmentPlan, getTodayKey()),
);
const quickCaptureDate = computed(() => quickCaptureNow.value);
const quickCaptureDateKey = computed(() => formatDateKey(quickCaptureDate.value));
const activeQuickCaptureTreatmentPlan = computed(() =>
  getTreatmentPlanForDate(state.treatmentPlan, quickCaptureDateKey.value),
);
const selectedTreatmentPlanItem = computed(() =>
  activeQuickCaptureTreatmentPlan.value.find((item) => item.id === selectedTreatmentPlanId.value) ?? null,
);
const availablePlannedDoses = computed(() => {
  const dateKey = getTodayKey();
  const recorded = state.entries[dateKey]?.medications ?? [];
  return getTreatmentPlanForDate(state.treatmentPlan, dateKey)
    .filter((item) => !recorded.some((medication) => medication.planItemId === item.id))
    .map((item) => ({
      item,
      scheduledAt: getPlannedDoseDate(dateKey, item.time),
      status: getMedicationWindowStatus(getPlannedDoseDate(dateKey, item.time), quickCaptureNow.value),
    }))
    .filter((dose) => dose.status.isAvailable);
});
const timelineMedicationDoses = computed(() =>
  availablePlannedDoses.value.filter((dose) => {
    const selected = timelineSelectedTime.value.getTime();
    return selected >= dose.scheduledAt.getTime() - 10 * 60_000
      && selected <= dose.scheduledAt.getTime() + 60 * 60_000
      && selected <= quickCaptureNow.value.getTime();
  }),
);
const PANEL_ITEMS = [
  { id: "sekce-home", label: "Rychlý zápis" },
  { id: "sekce-matice", label: "Hodinová matice" },
  { id: "sekce-osa", label: "Časová osa" },
  { id: "sekce-prehled", label: "Denní zápis" },
  { id: "sekce-leky", label: "Léčba" },
  { id: "sekce-souhrn", label: "Souhrn" },
  { id: "sekce-manualy", label: "Manuály" },
  { id: "sekce-report", label: "Report pro lékaře" },
  { id: "sekce-sdileni", label: "Sdílení dat" },
  { id: "sekce-kartoteka", label: "Sdílená kartotéka" },
  { id: "sekce-kontakty", label: "Kontakty" },
  { id: "sekce-admin", label: "Administrace" },
];
const PATIENT_PRIMARY_PANEL_ITEMS = PANEL_ITEMS.filter((item) => !["sekce-matice", "sekce-report", "sekce-sdileni", "sekce-kartoteka", "sekce-kontakty", "sekce-admin"].includes(item.id));
const isCaregiverOnlyMode = computed(() => isCaregiverOnlyRoleSet(accountRoles.activeRoles));
const caregiverPanelItems = computed(() => CAREGIVER_PANEL_ITEMS.filter(
  (item) => item.id !== "sekce-navrhy" || accountRoles.activeRoles.includes("doctor"),
));
const ANALYSIS_PANEL_IDS = new Set(["sekce-souhrn", "sekce-trendy"]);
const filterRestrictedPanels = (items) => items.filter(
  (item) => canUseClinicalAnalyses.value || !ANALYSIS_PANEL_IDS.has(item.id),
);
const primaryPanelItems = computed(() => filterRestrictedPanels(
  isCaregiverOnlyMode.value ? caregiverPanelItems.value : PATIENT_PRIMARY_PANEL_ITEMS,
));
const visiblePanelItems = computed(() => filterRestrictedPanels(
  isCaregiverOnlyMode.value ? caregiverPanelItems.value : PANEL_ITEMS,
));
const DATE_NAV_PANEL_IDS = new Set([
  "sekce-udaje",
  "sekce-matice",
  "sekce-osa",
  "sekce-prehled",
  "sekce-leky",
  "sekce-souhrn",
  "sekce-trendy",
]);
const installHelpText = computed(() => {
  if (isInstalledApp.value) {
    return "Aplikace je nainstalovaná a připravená k použití offline.";
  }

  if (platformInstallMode.value === "ios-share-sheet") {
    return "Na iPhonu nebo iPadu otevřete nabídku Sdílet a zvolte Přidat na plochu.";
  }

  if (platformInstallMode.value === "install-prompt") {
    return "Prohlížeč umožňuje aplikaci nainstalovat. Použijte tlačítko Nainstalovat aplikaci.";
  }

  return "Podpora instalace je zapnutá. Jakmile ji prohlížeč umožní, zobrazí se zde instalační tlačítko.";
});
const showIosInstallGuide = computed(
  () => !isInstalledApp.value && platformInstallMode.value === "ios-share-sheet",
);
const isQuickCaptureTimeValid = computed(() => isQuickCaptureDateValid(timelineSelectedTime.value, quickCaptureNow.value));
const quickCaptureStateLabel = computed(() => getStateDefinition(selectedStateKey.value).label);
const quickCaptureMedicationLabel = computed(() => {
  const item = selectedTreatmentPlanItem.value;
  return item ? `${item.name} ${item.dose}` : "Dávku z plánu";
});
const currentHourLabel = computed(() => getTrackableHourLabel(quickCaptureNow.value));
const currentTimeLabel = computed(() =>
  new Intl.DateTimeFormat("cs-CZ", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(quickCaptureNow.value),
);
const currentHourRecordCount = computed(() =>
  getHourRecordCount(state.entries[getTodayKey()], currentHourLabel.value),
);
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
    : "zatím nikdy";

  return `Revize ${revision} · posledni sync ${syncedAt}`;
});
const conflictAuditCountLabel = computed(() => `${conflictAuditItems.value.length} konfliktu`);
const bootstrapLogCountLabel = computed(() => `${bootstrapLogEntries.value.length} kroku`);
const integrityReport = computed(() => auditDiaryState(state));
const integritySummary = computed(() => integrityReport.value.summary);
const integrityHeadline = computed(() => {
  if (integritySummary.value.issueCount > 0) {
    return `Nalezeno ${integritySummary.value.issueCount} chyb a ${integritySummary.value.warningCount} varovani.`;
  }

  if (integritySummary.value.warningCount > 0) {
    return `Nalezeno ${integritySummary.value.warningCount} varování, ale žádné závažné chyby.`;
  }

  return "Audit nenašel žádné chyby ani varování.";
});
const effectiveSyncEndpoint = computed(() => getEffectiveSyncEndpoint(syncSettings));
const hasSyncIdentity = computed(() =>
  requiresSignedInUserForSync.value
    ? Boolean(authSession.value?.user)
    : Boolean(syncSettings.apiToken?.trim()),
);
const isQuickSyncAvailable = computed(
  () => isOnline.value && Boolean(effectiveSyncEndpoint.value) && hasSyncIdentity.value && hasSyncMasterKeyStored.value,
);
const medicationNotificationsSupported = computed(() => canUseMedicationNotifications());
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
    return "Nepřihlášeno";
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
let panelSwipeStartX = 0;
let panelSwipeStartY = 0;
let panelSwipePointerType = "";

let menuResizeObserver = null;
let mediaQueryList = null;
let quickCaptureClockIntervalId = 0;
let localBackupTimeoutId = 0;
let treatmentDraftTimeoutId = 0;
let treatmentDraftLoadVersion = 0;
let localChangeVersion = 0;
let isUpdatingSyncMetadata = false;
let isDeviceIdentityOperation = false;
const SERVICE_WORKER_RELOAD_GUARD_KEY = "neurodiary-sw-reload-guard-v1";
const automaticSyncScheduler = createSyncRetryScheduler({
  task: runAutomaticSynchronization,
});

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
    scheduleAutomaticLocalBackup();
  },
  { deep: true },
);

watch(isCaregiverOnlyMode, (caregiverOnly) => {
  if (!caregiverOnly || visiblePanelItems.value.some((item) => item.id === activePanelId.value)) return;
  selectPanel("sekce-kartoteka");
});

watch(canUseClinicalAnalyses, (allowed) => {
  if (!allowed && ANALYSIS_PANEL_IDS.has(activePanelId.value)) {
    selectPanel(isCaregiverOnlyMode.value ? "sekce-kartoteka" : "sekce-home");
  }
  if (!allowed && selectedSharedSection.value === "summary") selectedSharedSection.value = "timeline";
});

watch(
  state,
  () => {
    if (!isReady.value || isApplyingExternalState.value || isUpdatingSyncMetadata) {
      return;
    }
    localChangeVersion += 1;
    hasPendingSyncChanges.value = true;
    savePendingSyncChanges(true);
    automaticSyncScheduler.schedule(2_000);
  },
  { deep: true, flush: "sync" },
);

onMounted(async () => {
  refreshQuickCaptureClock();
  quickCaptureClockIntervalId = globalThis.setInterval(refreshQuickCaptureClock, 30_000);
  globalThis.addEventListener("focus", refreshQuickCaptureClock);
  globalThis.document?.addEventListener("visibilitychange", refreshQuickCaptureClock);
  globalThis.addEventListener(BOOTSTRAP_LOG_EVENT, syncBootstrapLogEntries);
  setBootstrapStatus("Zjišťuji stav instalace a připojení.");
  try {
    Object.assign(authConfig, await fetchAuthConfig());
  } catch (error) {
    console.error("Unable to load auth config", error);
  }
  try {
    Object.assign(webPushConfig, await fetchWebPushConfig(getEffectiveSyncEndpoint(syncSettings)));
  } catch (error) {
    console.error("Unable to load Web Push config", error);
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
    navigator.serviceWorker.addEventListener("message", handleServiceWorkerMessage);
  }

  setBootstrapStatus("Inicializuji místní úložiště.");
  const repository = await createDiaryRepository({
    namespace: authSession.value?.user?.userId || "guest",
    onProgress(message) {
      setBootstrapStatus(message);
    },
  });
  setBootstrapStatus("Úložiště je připravené. Načítám uložený deník.");
  const initialState = repository.loadState();
  setBootstrapStatus("Přenáším načtená data do aplikace.");
  Object.assign(state, initialState);
  selectedTreatmentPlanId.value = activeTodayTreatmentPlan.value[0]?.id ?? "";
  diaryRepository.value = repository;
  repositoryMode.value = repository.getMode();
  if (authSession.value?.user) {
    applyAuthenticatedAccount(authSession.value.user);
  }
  if (repository.bootstrapWarning) {
    storageMessage.value = repository.bootstrapWarning;
    appendBootstrapLog(repository.bootstrapWarning, "warning");
  }
  setBootstrapStatus("Inicializace byla dokončena.");
  isReady.value = true;
  void refreshAdminConsole({ silent: true });
  await refreshLocalBackups();
  await createAutomaticLocalBackupIfDue();
  await checkDueMedicationReminders();
  if (medicationReminderSettings.enabled) {
    void refreshWebPushRegistration();
  }
  await tryAutoRecoverLocalSyncKey();
  if (authSession.value?.user && hasSyncIdentity.value) void refreshAccountRoles();
  if (authSession.value?.user && hasSyncIdentity.value) void refreshDiaryShares(false);
  if (authSession.value?.user && hasSyncIdentity.value) void refreshTreatmentProposals();
  if (isQuickSyncAvailable.value) {
    automaticSyncScheduler.schedule(0);
  }

  await nextTick();
  setBootstrapStatus("Dokončuji rozvržení ovládacích prvků.");
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
    storageMessage.value = `QR kód obnovovacího tajemství se nepodařilo připravit: ${error.message}`;
  });
});

onUnmounted(() => {
  globalThis.clearInterval(quickCaptureClockIntervalId);
  globalThis.clearTimeout(localBackupTimeoutId);
  globalThis.clearTimeout(treatmentDraftTimeoutId);
  automaticSyncScheduler.cancel();
  globalThis.removeEventListener("focus", refreshQuickCaptureClock);
  globalThis.document?.removeEventListener("visibilitychange", refreshQuickCaptureClock);
  closeRecoveryCameraScanner();
  globalThis.removeEventListener(BOOTSTRAP_LOG_EVENT, syncBootstrapLogEntries);
  globalThis.navigator?.serviceWorker?.removeEventListener("message", handleServiceWorkerMessage);
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
  if (!isValidDateKey(dateKey) || dateKey > getTodayKey()) {
    storageMessage.value = "Vyberte platne datum, ktere neni v budoucnosti.";
    return;
  }
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
  state[field] = field === "patientName" ? value.slice(0, 120) : value;
}

function updateBirthYear(value) {
  const validation = validateBirthYear(value);
  birthYearValidationMessage.value = validation.message;
  if (validation.isValid) {
    state.birthYear = validation.value;
  }
}

function updateSyncSetting(field, value) {
  syncSettings[field] = value;
  Object.assign(syncSettings, saveSyncSettings(syncSettings));
}

function refreshQuickCaptureClock() {
  quickCaptureNow.value = new Date();
  void checkDueMedicationReminders();
  void checkDueDiaryReminder();
}

function scheduleAutomaticLocalBackup() {
  globalThis.clearTimeout(localBackupTimeoutId);
  localBackupTimeoutId = globalThis.setTimeout(() => void createAutomaticLocalBackupIfDue(), 10_000);
}

async function refreshLocalBackups() {
  try {
    localBackupItems.value = await listLocalBackups();
  } catch (error) {
    console.error("Unable to list local backups", error);
  }
}

async function createAutomaticLocalBackupIfDue() {
  if (!isReady.value || !shouldCreateAutomaticBackup(localBackupItems.value)) return false;
  try {
    await createLocalBackup(state, { reason: "automatic" });
    await refreshLocalBackups();
    return true;
  } catch (error) {
    console.error("Automatic local backup failed", error);
    return false;
  }
}

async function createManualLocalBackup() {
  try {
    await createLocalBackup(state, { reason: "manual" });
    await refreshLocalBackups();
    storageMessage.value = "Lokální záloha byla vytvořena.";
  } catch (error) {
    storageMessage.value = `Lokální zálohu se nepodařilo vytvořit: ${error.message}`;
  }
}

async function restoreSelectedLocalBackup(backup) {
  if (!globalThis.confirm(`Obnovit lokální zálohu z ${formatBackupTimestamp(backup.createdAt)}? Aktuální stav bude nejprve zazálohován.`)) return;
  try {
    await createLocalBackup(state, { reason: "before-restore" });
    applyImportedState(await restoreLocalBackup(backup.id));
    await refreshLocalBackups();
    storageMessage.value = "Lokální záloha byla obnovena.";
  } catch (error) {
    storageMessage.value = `Obnova zálohy selhala: ${error.message}`;
  }
}

function formatBackupTimestamp(value) {
  return new Intl.DateTimeFormat("cs-CZ", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

async function updateDiaryReminderEnabled(enabled) {
  let nextEnabled = enabled;
  if (enabled) {
    const permission = await requestMedicationNotificationPermission();
    medicationNotificationPermission.value = permission;
    nextEnabled = permission === "granted";
  }
  Object.assign(diaryReminderSettings, saveDiaryReminderSettings({ ...diaryReminderSettings, enabled: nextEnabled }));
  storageMessage.value = nextEnabled ? "Pripomenuti vyplneni deniku je zapnute." : "Pripomenuti vyplneni deniku je vypnute.";
}

function updateDiaryReminderTime(time) {
  Object.assign(diaryReminderSettings, saveDiaryReminderSettings({ ...diaryReminderSettings, time }));
}

async function checkDueDiaryReminder() {
  if (!isReady.value) return;
  try {
    await checkDiaryCompletionReminder({
      entry: state.entries[getTodayKey()],
      dateKey: getTodayKey(),
      settings: diaryReminderSettings,
      now: quickCaptureNow.value,
    });
  } catch (error) {
    console.error("Diary completion reminder failed", error);
  }
}

async function setMedicationRemindersEnabled(enabled) {
  if (!enabled) {
    if (webPushStatus.value === "active") {
      try {
        await unregisterWebPush({
          endpoint: effectiveSyncEndpoint.value,
          apiToken: syncSettings.apiToken,
        });
      } catch (error) {
        console.error("Unable to unregister Web Push", error);
      }
    }
    Object.assign(medicationReminderSettings, saveMedicationReminderSettings({
      ...medicationReminderSettings,
      enabled: false,
      webPushEnabled: false,
    }));
    webPushStatus.value = "local-only";
    webPushMessage.value = "";
    storageMessage.value = "Připomenutí léků byla vypnuta.";
    return;
  }

  const permission = await requestMedicationNotificationPermission();
  medicationNotificationPermission.value = permission;
  const wasEnabled = permission === "granted";
  Object.assign(medicationReminderSettings, saveMedicationReminderSettings({
    ...medicationReminderSettings,
    enabled: wasEnabled,
    webPushEnabled: wasEnabled && webPushConfig.enabled,
  }));
  storageMessage.value = wasEnabled
    ? "Připomenutí léků jsou zapnuta."
    : "Prohlizec nepovolil systemova upozorneni.";
  if (wasEnabled) {
    await checkDueMedicationReminders();
    await refreshWebPushRegistration();
  }
}

function updateMedicationReminderLeadMinutes(value) {
  Object.assign(medicationReminderSettings, saveMedicationReminderSettings({
    ...medicationReminderSettings,
    leadMinutes: Number(value),
  }));
  void refreshWebPushRegistration();
}

async function refreshWebPushRegistration() {
  if (!medicationReminderSettings.enabled || !medicationReminderSettings.webPushEnabled) {
    webPushStatus.value = "local-only";
    return;
  }
  if (!canUseWebPush() || !webPushConfig.enabled) {
    webPushStatus.value = "unavailable";
    webPushMessage.value = "Serverovy Web Push neni nakonfigurovan.";
    return;
  }
  if (!hasSyncIdentity.value) {
    webPushStatus.value = "needs-auth";
    webPushMessage.value = "Pro Web Push je potřeba přihlášení nebo API token.";
    return;
  }
  try {
    webPushStatus.value = "registering";
    await ensureCurrentDeviceRegistered();
    const result = await registerWebPush({
      endpoint: effectiveSyncEndpoint.value,
      apiToken: syncSettings.apiToken,
      publicKey: webPushConfig.publicKey,
      treatmentPlan: state.treatmentPlan,
      entries: state.entries,
      leadMinutes: medicationReminderSettings.leadMinutes,
      startDateKey: getTodayKey(),
    });
    webPushStatus.value = "active";
    webPushMessage.value = `Naplánováno ${result.scheduledCount} obecných upozornění na příštích 31 dní.`;
  } catch (error) {
    console.error("Unable to register Web Push", error);
    webPushStatus.value = "error";
    webPushMessage.value = error.message;
  }
}

function handleServiceWorkerMessage(event) {
  if (event.data?.type === "PUSH_SUBSCRIPTION_CHANGED") {
    void refreshWebPushRegistration();
  }
}

async function checkDueMedicationReminders() {
  if (!isReady.value || !medicationReminderSettings.enabled) {
    return;
  }
  if (webPushStatus.value === "active") {
    return;
  }
  try {
    await checkMedicationReminders({
      treatmentPlan: state.treatmentPlan,
      recordedMedications: state.entries[getTodayKey()]?.medications ?? [],
      settings: medicationReminderSettings,
      todayKey: getTodayKey(),
      now: quickCaptureNow.value,
    });
  } catch (error) {
    console.error("Medication reminder check failed", error);
  }
}

function refreshSyncKeyMaterialStatus() {
  syncKeyMaterialRefreshToken.value += 1;
  storedRecoverySecret.value = loadSyncKeyMaterial().recoverySecret ?? "";
}

function getCurrentTimeLabel(date = new Date()) {
  return date.toTimeString().slice(0, 5);
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
  storageMessage.value = "Aplikace byla nainstalována do zařízení.";
}

function handleConnectionChange() {
  isOnline.value = globalThis.navigator?.onLine ?? true;
  if (isOnline.value && isQuickSyncAvailable.value) {
    automaticSyncScheduler.schedule(0);
  }
}

function formatConflictTimestamp(value) {
  if (!value) {
    return "neznamy cas";
  }
  return new Intl.DateTimeFormat("cs-CZ", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

function clearConflictHistory() {
  clearConflictAudit();
  conflictAuditItems.value = [];
  storageMessage.value = "Lokalni historie konfliktu byla smazana.";
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

function openIntegrityReportPanel() {
  closeUtilityMenu();
  isIntegrityReportOpen.value = true;
}

function closeIntegrityReportPanel() {
  isIntegrityReportOpen.value = false;
}

function markCloudAuthenticated(user = null) {
  isUpdatingSyncMetadata = true;
  try {
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
  } finally {
    isUpdatingSyncMetadata = false;
  }
}

function ensureSyncIdentity() {
  if (requiresSignedInUserForSync.value && !authSession.value?.user) {
    storageMessage.value = "Pro cloudovou synchronizaci se nejprve přihlaste přes Google nebo Apple.";
    return false;
  }

  if (!requiresSignedInUserForSync.value && !syncSettings.apiToken?.trim()) {
    storageMessage.value = "Cloudová synchronizace není ověřena. Přihlaste se nebo zapněte starší přístup přes API token.";
    return false;
  }

  return true;
}

function selectPanel(panelId) {
  if (ANALYSIS_PANEL_IDS.has(panelId) && !canUseClinicalAnalyses.value) {
    storageMessage.value = "Analytické funkce jsou dostupné pouze pro aktivní roli lékaře.";
    return;
  }
  const isVisiblePanel = visiblePanelItems.value.some((item) => item.id === panelId);
  const isAvailableAdminPanel = panelId === "sekce-admin" && Boolean(adminStatus.value);
  if (!isVisiblePanel && !isAvailableAdminPanel) {
    return;
  }
  activePanelId.value = panelId;
  closeUtilityMenu();
  if (panelId === "sekce-sdileni") {
    void refreshDiaryShares(false);
    void refreshTreatmentProposals();
  }
  if (panelId === "sekce-kartoteka") void refreshDiaryShares(true);
  if (panelId === "sekce-navrhy") void refreshTreatmentProposals();
  void nextTick(() => {
    syncFloatingMenuHeight();
  });
}

async function refreshDiaryShares(includeIncoming = activePanelId.value === "sekce-kartoteka") {
  includeIncoming = includeIncoming === true;
  if (!authSession.value?.user || !hasSyncIdentity.value) return;
  isSharingBusy.value = true;
  sharingMessage.value = "";
  try {
    const result = await fetchDiaryShares(syncSettings, includeIncoming);
    diaryShares.outgoing = result.outgoing ?? [];
    diaryShares.incoming = result.incoming ?? [];
    diaryShares.outgoingInvitations = result.outgoingInvitations ?? [];
    diaryShares.incomingInvitations = result.incomingInvitations ?? [];
    const views = includeIncoming ? [] : sharedDiaryViews.value;
    for (const grant of diaryShares.incoming) {
      try {
        views.push({ ...grant, state: await decryptSharedDiary(grant), error: "" });
      } catch (error) {
        views.push({ ...grant, state: null, error: error.message });
      }
    }
    sharedDiaryViews.value = views;
    if (!views.some((item) => item.grantId === selectedSharedGrantId.value)) {
      selectSharedDiary(views[0] ?? null);
    }
  } catch (error) {
    sharingMessage.value = error.message;
  } finally {
    isSharingBusy.value = false;
  }
}

async function selectSharedDiary(view) {
  globalThis.clearTimeout(treatmentDraftTimeoutId);
  if (treatmentProposalDraftDirty.value && selectedSharedView.value) {
    await saveCurrentTreatmentDraft();
  }
  const loadVersion = ++treatmentDraftLoadVersion;
  selectedSharedGrantId.value = view?.grantId ?? "";
  const dates = Object.keys(view?.state?.entries ?? {}).sort();
  selectedSharedDate.value = dates.at(-1) ?? getTodayKey();
  selectedSharedSection.value = "timeline";
  treatmentProposalDraft.value = structuredClone(view?.state?.treatmentPlan ?? []);
  treatmentProposalDoctorNote.value = "";
  treatmentProposalPreviousId.value = null;
  treatmentProposalDraftDirty.value = false;
  treatmentDraftSavedAt.value = "";
  if (!view) return;
  try {
    const savedDraft = await restoreEncryptedTreatmentDraft(view);
    if (loadVersion !== treatmentDraftLoadVersion || !savedDraft) return;
    treatmentProposalDraft.value = structuredClone(savedDraft.treatmentPlan ?? []);
    treatmentProposalDoctorNote.value = savedDraft.doctorNote ?? "";
    treatmentProposalPreviousId.value = savedDraft.previousProposalId ?? null;
    treatmentProposalDraftDirty.value = true;
    treatmentDraftSavedAt.value = savedDraft.updatedAt;
  } catch (error) {
    sharingMessage.value = `Koncept léčby se nepodařilo obnovit: ${error.message}`;
  }
}

function addTreatmentProposalRow() {
  treatmentProposalDraft.value.push({ id: crypto.randomUUID(), name: "", dose: "", time: "08:00", validFrom: getTodayKey(), validTo: "" });
  markTreatmentDraftDirty();
}

function markTreatmentDraftDirty() {
  treatmentProposalDraftDirty.value = true;
  globalThis.clearTimeout(treatmentDraftTimeoutId);
  treatmentDraftTimeoutId = globalThis.setTimeout(() => void saveCurrentTreatmentDraft(), 500);
}

async function saveCurrentTreatmentDraft() {
  const view = selectedSharedView.value;
  if (!view || !treatmentProposalDraftDirty.value) return;
  try {
    const saved = await persistEncryptedTreatmentDraft(
      view, treatmentProposalDraft.value, treatmentProposalDoctorNote.value, treatmentProposalPreviousId.value,
    );
    treatmentDraftSavedAt.value = saved.updatedAt;
    treatmentDraftItems.value = listEncryptedTreatmentDrafts();
  } catch (error) {
    sharingMessage.value = `Koncept léčby se nepodařilo uložit: ${error.message}`;
  }
}

async function submitTreatmentProposal() {
  if (!selectedSharedView.value || treatmentProposalDraft.value.some((item) => !item.name.trim() || !item.dose.trim())) return;
  isSharingBusy.value = true;
  try {
    await createTreatmentProposal(
      syncSettings, selectedSharedView.value, treatmentProposalDraft.value,
      treatmentProposalDoctorNote.value, treatmentProposalPreviousId.value,
    );
    removeEncryptedTreatmentDraft(selectedSharedView.value.grantId);
    treatmentDraftItems.value = listEncryptedTreatmentDrafts();
    treatmentProposalDraftDirty.value = false;
    sharingMessage.value = "Návrh změn léčby byl odeslán pacientovi ke schválení.";
  } catch (error) {
    sharingMessage.value = error.message;
  } finally {
    isSharingBusy.value = false;
  }
}

async function continueTreatmentDraft(draft) {
  const view = sharedDiaryViews.value.find((item) => item.grantId === draft.grantId);
  if (!view) {
    sharingMessage.value = "Sdílený deník pro tento koncept není momentálně dostupný. Obnovte Kartotéku.";
    return;
  }
  await selectSharedDiary(view);
  selectPanel("sekce-kartoteka");
  selectedSharedSection.value = "treatment";
}

function discardTreatmentDraft(draft) {
  removeEncryptedTreatmentDraft(draft.grantId);
  treatmentDraftItems.value = listEncryptedTreatmentDrafts();
  if (selectedSharedGrantId.value === draft.grantId) {
    treatmentProposalDraft.value = structuredClone(selectedSharedView.value?.state?.treatmentPlan ?? []);
    treatmentProposalDraftDirty.value = false;
    treatmentDraftSavedAt.value = "";
  }
  sharingMessage.value = "Rozepsaný návrh byl smazán z tohoto zařízení.";
}

async function refreshTreatmentProposals() {
  if (!authSession.value?.user || !hasSyncIdentity.value) return;
  try {
    const result = await fetchTreatmentProposals(syncSettings);
    const proposals = await Promise.all((result.proposals ?? []).map(async (proposal) => {
      try {
        const grant = sharedDiaryViews.value.find((item) => item.grantId === proposal.grantId);
        const changes = await decryptTreatmentProposal(proposal, grant);
        const response = await decryptTreatmentProposalResponse(proposal, grant);
        return { ...proposal, changes, response, error: "" };
      }
      catch (error) { return { ...proposal, changes: null, error: error.message }; }
    }));
    notifyTreatmentProposalChanges(proposals);
    treatmentProposals.value = proposals;
  } catch (error) {
    console.error("Treatment proposal refresh failed", error);
  }
}

function notifyTreatmentProposalChanges(proposals) {
  let previous = {};
  try { previous = JSON.parse(localStorage.getItem(TREATMENT_PROPOSAL_STATUS_STORAGE_KEY) || "{}"); } catch { /* ignore */ }
  const currentUserId = authSession.value?.user?.userId;
  for (const proposal of proposals) {
    const oldStatus = previous[proposal.proposalId];
    let body = "";
    if (!oldStatus && proposal.status === "pending" && proposal.ownerUserId === currentUserId) {
      body = `${proposal.proposerName || "Lékař"} poslal nový návrh změn léčby.`;
    } else if (oldStatus === "pending" && oldStatus !== proposal.status && proposal.proposerUserId === currentUserId) {
      body = `Pacient ${proposal.ownerName || ""} návrh ${proposal.status === "approved" ? "schválil" : proposal.status === "declined" ? "zamítl" : proposal.status === "returned" ? "vrátil k přepracování" : "uzavřel"}.`;
    }
    if (body) {
      storageMessage.value = body;
      if (globalThis.Notification?.permission === "granted") new Notification("NeuroDiary · léčebný plán", { body, tag: `treatment-${proposal.proposalId}` });
    }
  }
  try {
    const statuses = Object.fromEntries(proposals.map((item) => [item.proposalId, item.status]));
    localStorage.setItem(TREATMENT_PROPOSAL_STATUS_STORAGE_KEY, JSON.stringify(statuses));
  } catch { /* ignore */ }
}

function treatmentProposalDiff(proposal) {
  return compareTreatmentPlans(state.treatmentPlan, proposal.changes?.treatmentPlan ?? []);
}

function proposalStatusLabel(status) {
  return ({ pending: "Čeká na pacienta", approved: "Schváleno", declined: "Zamítnuto", returned: "Vráceno k přepracování", cancelled: "Staženo" })[status] ?? status;
}

function proposalParentVersion(proposal) {
  return treatmentProposals.value.find((item) => item.proposalId === proposal.previousProposalId)?.version ?? null;
}

async function withdrawTreatmentProposal(proposal) {
  await cancelTreatmentProposal(syncSettings, proposal.proposalId);
  sharingMessage.value = "Čekající návrh byl stažen.";
  await refreshTreatmentProposals();
}

async function respondToTreatmentProposal(proposal, decision) {
  if (decision === "approved") {
    if (proposal.baseRevision !== Number(syncSettings.revision ?? 0)) {
      sharingMessage.value = "Návrh vychází ze starší revize deníku. Nejprve synchronizujte data a požádejte lékaře o nový návrh.";
      return;
    }
  }
  const comment = treatmentReturnComments[proposal.proposalId]?.trim() ?? "";
  if (decision === "returned" && !comment) {
    sharingMessage.value = "Při vrácení návrhu napište lékaři, co má přepracovat.";
    return;
  }
  await decideTreatmentProposal(syncSettings, proposal.proposalId, decision, comment);
  if (decision === "approved") {
    state.treatmentPlan = structuredClone(proposal.changes?.treatmentPlan ?? []);
    selectedTreatmentPlanId.value = activeTodayTreatmentPlan.value[0]?.id ?? "";
  }
  sharingMessage.value = decision === "approved" ? "Navržené změny léčby byly schváleny a použity."
    : decision === "returned" ? "Návrh byl vrácen lékaři k přepracování." : "Návrh změn léčby byl zamítnut.";
  await refreshTreatmentProposals();
}

async function reviseTreatmentProposal(proposal) {
  const view = sharedDiaryViews.value.find((item) => item.grantId === proposal.grantId);
  if (!view || !proposal.changes) return;
  await selectSharedDiary(view);
  treatmentProposalDraft.value = structuredClone(proposal.changes.treatmentPlan ?? []);
  treatmentProposalDoctorNote.value = proposal.changes.doctorNote ?? "";
  treatmentProposalPreviousId.value = proposal.proposalId;
  treatmentProposalDraftDirty.value = true;
  selectPanel("sekce-kartoteka");
  selectedSharedSection.value = "treatment";
}

function printSharedDiaryReport() {
  const view = selectedSharedView.value;
  if (!view?.state) return;
  try {
    openDoctorReportPrint({
      entries: view.state.entries ?? {},
      treatmentPlan: view.state.treatmentPlan ?? [],
      selectedDate: selectedSharedDate.value,
      patientName: view.state.patientName ?? "",
      birthYear: view.state.birthYear ?? "",
      includeToday: reportOptions.includeToday,
    });
    sharingMessage.value = "Sdílený report byl otevřen k tisku.";
  } catch (error) {
    sharingMessage.value = `Report se nepodařilo otevřít: ${error.message}`;
  }
}

async function addDiaryShare() {
  if (!shareRecipientEmail.value.trim()) return;
  isSharingBusy.value = true;
  sharingMessage.value = "";
  try {
    await createDiaryShare(syncSettings, shareRecipientEmail.value);
    shareRecipientEmail.value = "";
    sharingMessage.value = "Pozvánka ke sdílení byla vytvořena.";
    await refreshDiaryShares();
  } catch (error) {
    sharingMessage.value = error.message;
  } finally {
    isSharingBusy.value = false;
  }
}

async function respondToShareInvitation(invitationId, accept) {
  isSharingBusy.value = true;
  sharingMessage.value = "";
  try {
    if (accept) await ensureDeviceExchangeKeyPublished(syncSettings);
    await respondToDiaryShareInvitation(syncSettings, invitationId, accept);
    sharingMessage.value = accept
      ? "Pozvánka byla přijata. Vlastník nyní může bezpečně aktivovat sdílení."
      : "Pozvánka byla odmítnuta.";
    await refreshDiaryShares(false);
  } catch (error) {
    sharingMessage.value = error.message;
  } finally {
    isSharingBusy.value = false;
  }
}

async function activateShareInvitation(invitationId) {
  isSharingBusy.value = true;
  sharingMessage.value = "";
  try {
    await activateDiaryShareInvitation(syncSettings, invitationId);
    sharingMessage.value = "Sdílení bylo aktivováno.";
    await refreshDiaryShares(false);
  } catch (error) {
    sharingMessage.value = error.message;
  } finally {
    isSharingBusy.value = false;
  }
}

async function cancelShareInvitation(invitationId) {
  isSharingBusy.value = true;
  sharingMessage.value = "";
  try {
    await cancelDiaryShareInvitation(syncSettings, invitationId);
    sharingMessage.value = "Pozvánka byla zrušena.";
    await refreshDiaryShares(false);
  } catch (error) {
    sharingMessage.value = error.message;
  } finally {
    isSharingBusy.value = false;
  }
}

function shareStatusLabel(status) {
  return ({
    pending: "Čeká na přijetí", accepted: "Přijato – čeká na aktivaci", active: "Aktivní",
    declined: "Odmítnuto", expired: "Vypršelo", cancelled: "Zrušeno", revoked: "Odvoláno",
  })[status] ?? status;
}

async function removeDiaryShare(grantId) {
  isSharingBusy.value = true;
  sharingMessage.value = "";
  try {
    await revokeDiaryShare(syncSettings, grantId);
    sharingMessage.value = "Sdílení bylo odvoláno.";
    await refreshDiaryShares();
  } catch (error) {
    sharingMessage.value = error.message;
  } finally {
    isSharingBusy.value = false;
  }
}

function selectAdjacentPanel(direction) {
  const panels = visiblePanelItems.value;
  const activePanelIndex = panels.findIndex((item) => item.id === activePanelId.value);
  if (activePanelIndex < 0) {
    return;
  }

  const nextIndex = activePanelIndex + direction;
  if (nextIndex < 0 || nextIndex >= panels.length) {
    return;
  }

  selectPanel(panels[nextIndex].id);
}

function isInteractiveSwipeTarget(target) {
  if (!(target instanceof Element)) {
    return false;
  }

  return Boolean(target.closest("button, input, select, textarea, label, a, summary, [role='button']"));
}

function handlePanelTouchStart(event) {
  if (event.touches.length !== 1 || isUtilityMenuOpen.value) {
    panelSwipePointerType = "";
    return;
  }

  if (isInteractiveSwipeTarget(event.target)) {
    panelSwipePointerType = "";
    return;
  }

  const [touch] = event.touches;
  panelSwipeStartX = touch.clientX;
  panelSwipeStartY = touch.clientY;
  panelSwipePointerType = "touch";
}

function handlePanelTouchEnd(event) {
  if (panelSwipePointerType !== "touch" || event.changedTouches.length !== 1) {
    panelSwipePointerType = "";
    return;
  }

  const [touch] = event.changedTouches;
  const deltaX = touch.clientX - panelSwipeStartX;
  const deltaY = touch.clientY - panelSwipeStartY;
  panelSwipePointerType = "";

  if (Math.abs(deltaX) < 56 || Math.abs(deltaX) <= Math.abs(deltaY) * 1.3) {
    return;
  }

  if (deltaX < 0) {
    selectAdjacentPanel(1);
    return;
  }

  selectAdjacentPanel(-1);
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

function addMedication(payload, dateKey = state.selectedDate) {
  const validation = validateMedicationInput(payload);
  if (!validation.isValid) {
    storageMessage.value = Object.values(validation.errors)[0] ?? "Dávku se nepodařilo zapsat.";
    return false;
  }

  const duplicateKey = buildMedicationDuplicateKey(validation.value);
  const targetEntry = ensureEntry(state, dateKey);
  if (targetEntry.medications.some((item) => buildMedicationDuplicateKey(item) === duplicateKey)) {
    storageMessage.value = "Stejná dávka je pro tento čas už zapsána.";
    return false;
  }

  targetEntry.medications.push(createMedication({
    ...validation.value,
    planItemId: payload.planItemId,
    takenAt: payload.takenAt,
    recordedAt: payload.recordedAt,
    source: payload.source,
  }));
  targetEntry.updatedAt = new Date().toISOString();
  void refreshWebPushRegistration();
  return true;
}

function removeMedication(medicationId) {
  markMedicationDeleted(state, medicationId);
  selectedEntry.value.updatedAt = new Date().toISOString();
}

function addTreatmentPlanItem(payload) {
  state.treatmentPlan.push(createTreatmentPlanItem(payload));
  state.treatmentPlan.sort((left, right) => left.time.localeCompare(right.time));
  if (!selectedTreatmentPlanId.value && getTreatmentPlanForDate([payload], getTodayKey()).length) {
    selectedTreatmentPlanId.value = state.treatmentPlan.find(
      (item) =>
        item.name === payload.name
        && item.dose === payload.dose
        && item.time === payload.time
        && item.validFrom === payload.validFrom,
    )?.id ?? activeTodayTreatmentPlan.value[0]?.id ?? "";
  }
  void refreshWebPushRegistration();
}

function endTreatmentPlanItem(planItemId, validTo) {
  const item = state.treatmentPlan.find((candidate) => candidate.id === planItemId);
  if (!item) {
    return;
  }
  item.validTo = validTo;
  if (selectedTreatmentPlanId.value === planItemId) {
    selectedTreatmentPlanId.value = activeTodayTreatmentPlan.value[0]?.id ?? "";
  }
  void refreshWebPushRegistration();
}

function recordMedicationFromPlan(planItem, takenAt = new Date(), source = "quick-capture") {
  refreshQuickCaptureClock();
  const dateKey = formatDateKey(takenAt);
  const activePlanItem = getTreatmentPlanForDate(state.treatmentPlan, dateKey)
    .find((item) => item.id === planItem?.id);
  if (!activePlanItem) {
    storageMessage.value = "Plánovaná dávka už není dostupná.";
    return;
  }
  const scheduledAt = getPlannedDoseDate(dateKey, activePlanItem.time);
  const status = getMedicationWindowStatus(scheduledAt, quickCaptureNow.value);
  if (!status.isAvailable) {
    storageMessage.value = "Dávku lze zapsat nejdříve 10 minut před plánem a nejpozději hodinu po plánu.";
    return;
  }
  const currentTime = getCurrentTimeLabel(takenAt);
  const recordedAt = new Date();
  const wasAdded = addMedication({
    name: activePlanItem.name,
    dose: activePlanItem.dose,
    time: currentTime,
    planItemId: activePlanItem.id,
    takenAt: takenAt.toISOString(),
    recordedAt: recordedAt.toISOString(),
    source,
  }, dateKey);
  if (!wasAdded) {
    return;
  }
  const medication = state.entries[dateKey]?.medications
    ?.find((item) => item.planItemId === activePlanItem.id && item.recordedAt === recordedAt.toISOString());
  if (medication) {
    lastCaptureUndo.value = {
      run() {
        markMedicationDeleted(state, medication.id);
        state.entries[dateKey].updatedAt = new Date().toISOString();
        void refreshWebPushRegistration();
      },
    };
  }
  storageMessage.value = `Dávka ${activePlanItem.name} ${activePlanItem.dose} byla zapsána jako užitá v ${currentTime}.`;
  if (lastCaptureUndo.value) {
    lastCaptureUndo.value.message = storageMessage.value;
  }
}

function updateHour({ label, stateKey }) {
  const hourStart = new Date(`${state.selectedDate}T${String(label).padStart(2, "0")}:00:00`);
  const timestamp = hourStart.getTime();
  const oldestAllowed = quickCaptureNow.value.getTime() - 10 * 60 * 60 * 1000;
  if (
    !Number.isFinite(timestamp)
    || timestamp + 60 * 60 * 1000 <= oldestAllowed
    || timestamp > quickCaptureNow.value.getTime()
  ) {
    storageMessage.value = "V hodinove matici lze upravovat pouze poslednich 10 hodin.";
    return;
  }

  if (!stateKey) {
    clearHourStateRecords(selectedEntry.value, label);
    storageMessage.value = `Záznam pro hodinu ${label} byl vymazán.`;
    return;
  }

  appendHourStateRecord(selectedEntry.value, label, stateKey, { source: "manual" });
  storageMessage.value = `Stav ${getStateDefinition(stateKey).label} pridan pro hodinu ${label}.`;
}

function writeCurrentState() {
  const recordedAt = new Date();
  quickCaptureNow.value = recordedAt;
  const hourLabel = getTrackableHourLabel(recordedAt);
  const targetEntry = ensureEntry(state, formatDateKey(recordedAt));
  appendHourStateRecord(targetEntry, hourLabel, selectedStateKey.value, {
    source: "quick-capture",
    recordedAt: recordedAt.toISOString(),
  });
  const recordId = targetEntry.hourRecords[hourLabel]?.at(-1)?.id;
  if (recordId) {
    lastCaptureUndo.value = {
      run() {
        targetEntry.hourRecords[hourLabel] =
          targetEntry.hourRecords[hourLabel].filter((record) => record.id !== recordId);
        reconcileEntryHourState(targetEntry, "latest", { hydrateFromHours: false });
        targetEntry.updatedAt = new Date().toISOString();
      },
    };
  }
  storageMessage.value = `Stav ${getStateDefinition(selectedStateKey.value).label} zapsan v ${getCurrentTimeLabel(recordedAt)} pro hodinu ${hourLabel}.`;
  if (lastCaptureUndo.value) {
    lastCaptureUndo.value.message = storageMessage.value;
  }
}

function writeTimelineState() {
  if (!isQuickCaptureTimeValid.value) {
    storageMessage.value = "V casove ose lze zapisovat pouze poslednich 10 hodin.";
    return;
  }
  const selectedAt = timelineSelectedTime.value;
  const hourLabel = getTrackableHourLabel(selectedAt);
  const targetEntry = ensureEntry(state, formatDateKey(selectedAt));
  appendHourStateRecord(targetEntry, hourLabel, selectedStateKey.value, {
    source: "timeline",
    recordedAt: new Date().toISOString(),
  });
  const recordId = targetEntry.hourRecords[hourLabel]?.at(-1)?.id;
  if (recordId) {
    lastCaptureUndo.value = {
      run() {
        targetEntry.hourRecords[hourLabel] =
          targetEntry.hourRecords[hourLabel].filter((record) => record.id !== recordId);
        reconcileEntryHourState(targetEntry, "latest", { hydrateFromHours: false });
        targetEntry.updatedAt = new Date().toISOString();
      },
    };
  }
  storageMessage.value = `Stav ${getStateDefinition(selectedStateKey.value).label} zapsan pro hodinu ${hourLabel}:00–${hourLabel}:59.`;
  if (lastCaptureUndo.value) {
    lastCaptureUndo.value.message = storageMessage.value;
  }
}

function undoLastCapture() {
  const action = lastCaptureUndo.value;
  if (!action) {
    return;
  }
  action.run();
  lastCaptureUndo.value = null;
  storageMessage.value = "Posledni zapis byl vracen.";
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
    await ensureCurrentDeviceRegistered();
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
    storageMessage.value = "Export SQLite není v záložním režimu místního úložiště dostupný.";
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
  storageMessage.value = "Záloha SQLite byla exportována.";
}

function exportJson() {
  downloadJsonBackup();
  storageMessage.value = "Záloha JSON byla exportována.";
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
    storageMessage.value = "Import SQLite není v záložním režimu místního úložiště dostupný.";
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
      treatmentPlan: state.treatmentPlan,
      selectedDate: state.selectedDate,
      patientName: state.patientName,
      birthYear: state.birthYear,
      includeToday: reportOptions.includeToday,
    });
    storageMessage.value = "Report pro lékaře byl otevřen k tisku.";
  } catch (error) {
    console.error("Doctor report print failed", error);
    storageMessage.value = "Tiskový report pro lékaře se nepodařilo otevřít.";
  }
}

async function saveDoctorReportPdf() {
  try {
    storageMessage.value = "Pripravuji PDF report v tomto zarizeni.";
    await downloadDoctorReportPdf({
      entries: state.entries,
      treatmentPlan: state.treatmentPlan,
      selectedDate: state.selectedDate,
      patientName: state.patientName,
      birthYear: state.birthYear,
      includeToday: reportOptions.includeToday,
    });
    storageMessage.value = "PDF report byl ulozen.";
  } catch (error) {
    console.error("Doctor report PDF failed", error);
    storageMessage.value = `PDF report se nepodarilo vytvorit: ${error.message}`;
  }
}

function buildCurrentReportOptions() {
  return {
    entries: state.entries,
    treatmentPlan: state.treatmentPlan,
    selectedDate: state.selectedDate,
    patientName: state.patientName,
    birthYear: state.birthYear,
    includeToday: reportOptions.includeToday,
  };
}

async function shareDoctorReportSecurely() {
  try {
    const selectedContact = contacts.value.find((contact) => contact.id === selectedContactId.value);
    if (!selectedContact) {
      if (encryptOneTimeReport.value) {
        const result = await shareEncryptedReport({
          reportOptions: buildCurrentReportOptions(),
          contact: doctorContact,
          password: generateReportPassword(),
        });
        reportSharePassword.value = result.password;
        const delivery = result.method === "native-share" ? "predana systemovemu sdileni" : "stazena a e-mail pripraven";
        storageMessage.value = `Sifrovana priloha byla ${delivery}. Heslo predejte jinym kanalem.`;
        return;
      }
      const result = await sharePlainReport({
        reportOptions: buildCurrentReportOptions(),
        contact: doctorContact,
      });
      reportSharePassword.value = "";
      const delivery = result.method === "native-share" ? "predano systemovemu sdileni" : "stazeno a e-mail pripraven";
      storageMessage.value = `Nesifrovane PDF bylo ${delivery}.`;
      return;
    }
    const password = generateReportPassword();
    const result = await shareEncryptedReport({
      reportOptions: buildCurrentReportOptions(),
      contact: selectedContact,
      password,
    });
    reportSharePassword.value = result.password;
    const delivery = result.method === "native-share" ? "predana systemovemu sdileni" : "stazena a e-mail pripraven";
    storageMessage.value = result.encryption === "public-key"
      ? `Priloha byla ${delivery}; je sifrovana verejnym klicem kontaktu.`
      : `Sifrovana priloha byla ${delivery}. Heslo predejte jinym kanalem.`;
  } catch (error) {
    if (error?.name === "AbortError") return;
    storageMessage.value = `Report se nepodarilo pripravit: ${error.message}`;
  }
}

async function sendDoctorReportWithGmail() {
  try {
    const selectedContact = contacts.value.find((contact) => contact.id === selectedContactId.value);
    const recipient = selectedContact ?? {
      name: String(doctorContact.name ?? "").trim(),
      email: String(doctorContact.email ?? "").trim(),
    };
    if (!recipient.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipient.email)) {
      throw new Error("Doplnte platny e-mail lekare.");
    }

    const accessToken = await requestGoogleGmailSendAccessToken(authConfig.googleClientId);
    storageMessage.value = "Pripravuji report a odesilam ho pres Gmail…";
    const protectReport = Boolean(selectedContact) || encryptOneTimeReport.value;
    const password = protectReport ? generateReportPassword() : "";
    const attachment = protectReport
      ? await createProtectedReportAttachment(buildCurrentReportOptions(), recipient, password)
      : await createPlainReportAttachment(buildCurrentReportOptions());
    const isEncrypted = attachment.encryption !== "none";
    const subject = isEncrypted ? "Sifrovany NeuroDiary report" : "NeuroDiary report";
    const body = attachment.encryption === "public-key"
      ? `Pro ${recipient.name || recipient.email}. Report je zasifrovan vasim verejnym klicem.`
      : attachment.encryption === "password"
        ? `Pro ${recipient.name || recipient.email}. Report je v sifrovanem ZIPu; heslo vam bude predano jinym kanalem.`
        : `Pro ${recipient.name || recipient.email}. V priloze posilam NeuroDiary report ve formatu PDF.`;

    await sendGmailMessage({
      accessToken,
      to: recipient.email,
      subject,
      body,
      attachment,
    });
    reportSharePassword.value = attachment.password;
    storageMessage.value = `Report byl odeslan pres Gmail na ${recipient.email}.`;
  } catch (error) {
    if (error?.name === "AbortError") return;
    storageMessage.value = `Odeslani pres Gmail se nepodarilo: ${error.message}`;
  }
}

function editContact(contact = null) {
  Object.assign(contactEditor, contact ?? { id: "", name: "", email: "", publicKeyPem: "" });
  generatedContactPrivateKey.value = "";
}

async function storeContact() {
  try {
    const saved = await saveContact(contactEditor);
    contacts.value = loadContacts();
    selectedContactId.value = saved.id;
    editContact(saved);
    storageMessage.value = saved.keyFingerprint
      ? `Kontakt ulozen. Otisk klice: ${saved.keyFingerprint}`
      : "Kontakt ulozen bez verejneho klice; sdileni pouzije heslovy ZIP.";
  } catch (error) {
    storageMessage.value = `Kontakt se nepodarilo ulozit: ${error.message}`;
  }
}

function removeContact() {
  if (!contactEditor.id || !globalThis.confirm(`Smazat kontakt ${contactEditor.name}?`)) return;
  contacts.value = deleteContact(contactEditor.id);
  selectedContactId.value = contacts.value[0]?.id ?? "";
  editContact(contacts.value[0]);
  storageMessage.value = "Kontakt a jeho verejny klic byly odebrany.";
}

async function createKeysForContact() {
  try {
    storageMessage.value = "Generuji 3072bitovy RSA klic…";
    const keys = await generateContactKeyPair();
    contactEditor.publicKeyPem = keys.publicKeyPem;
    generatedContactPrivateKey.value = keys.privateKeyPem;
    storageMessage.value = `Klice vygenerovany. Overte otisk ${keys.fingerprint} a soukromy klic bezpecne predejte prijemci.`;
  } catch (error) {
    storageMessage.value = `Klice se nepodarilo vytvorit: ${error.message}`;
  }
}

function downloadGeneratedPrivateKey() {
  if (!generatedContactPrivateKey.value) return;
  const blob = new Blob([generatedContactPrivateKey.value], { type: "application/x-pem-file" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `neurodiary-${contactEditor.email || "contact"}-private-key.pem`;
  link.click();
  URL.revokeObjectURL(url);
}

async function ensureCurrentDeviceRegistered() {
  let registration = await registerCurrentDevice(syncSettings);
  try {
    identityKeyMigration.value = await fetchIdentityKeyMigration(syncSettings);
    await ensureDeviceExchangeKeyPublished(syncSettings);
    identityKeyError.value = "";
  } catch (identityError) {
    if (registration.trustStatus !== "trusted") throw identityError;
    trustedDevices.value = (await fetchTrustedDevices(syncSettings)).map((device) => ({ ...device, hasVerifiedKey: false }));
    pendingDeviceKeyRequests.value = [];
    identityKeyError.value = identityError.message;
    storageMessage.value = `Zarizeni je nouzove duveryhodne, ale identitni klice jsou docasne nedostupne: ${identityError.message}`;
    return { degradedIdentity: true, registration, identityError };
  }
  if (registration.trustStatus === "pending") {
    registration = await registerCurrentDevice(syncSettings);
  }
  if (registration.trustStatus === "pending") {
    const transfer = await consumeDeviceKeyTransfer(syncSettings);
    if (transfer) {
      await acceptTransferredSyncKey(transfer);
      syncKeyMaterialRefreshToken.value += 1;
      storageMessage.value = `Sifrovaci klic verze ${transfer.keyVersion} byl bezpecne prevzat ze zarizeni ${transfer.sourceDeviceId.slice(0, 8)}.`;
    } else {
      await requestDeviceMasterKey(syncSettings);
      storageMessage.value = "Toto zarizeni pozadalo duveryhodne zarizeni o asymetricky sifrovany master key.";
      trustedDevices.value = [{ ...registration, hasVerifiedKey: true }];
      return { degradedIdentity: false, registration };
    }
  }
  const [devices, publicKeys] = await Promise.all([fetchTrustedDevices(syncSettings), fetchDevicePublicKeys(syncSettings)]);
  const keyedIds = new Set(publicKeys.map((item) => item.deviceId));
  trustedDevices.value = devices.map((device) => ({ ...device, hasVerifiedKey: keyedIds.has(device.deviceId) }));
  pendingDeviceKeyRequests.value = hasStoredSyncMasterKey() ? await fetchDeviceKeyRequests(syncSettings) : [];
  if (!rotationTargetDeviceIds.value.length) {
    rotationTargetDeviceIds.value = trustedDevices.value.filter((device) => !device.current && device.trustStatus === "trusted" && device.hasVerifiedKey).map((device) => device.deviceId);
  }
  return { degradedIdentity: false, registration };
}

async function closeIdentityKeyMigration() {
  if (!globalThis.confirm("Uzavrit migracni rezim? Dalsi zmeny identitnich klicu budou znovu vyzadovat standardni schvaleni zarizeni a rezim nelze z aplikace znovu zapnout.")) return;
  try {
    identityKeyMigration.value = await disableIdentityKeyMigration(syncSettings);
    storageMessage.value = "Migrace identitnich klicu byla uzavrena. Dalsi zarizeni musi projit standardnim schvalenim.";
  } catch (error) {
    storageMessage.value = `Migracni rezim se nepodarilo uzavrit: ${error.message}`;
  }
}

async function repeatDeviceRegistration() {
  isDeviceIdentityOperation = true;
  automaticSyncScheduler.cancel();
  isSyncBusy.value = true;
  try {
    try {
      const result = await ensureCurrentDeviceRegistered();
      storageMessage.value = result?.degradedIdentity
        ? `Registrace zarizeni byla nouzove obnovena. Identitni klice zustavaji v degradovanem rezimu: ${result.identityError.message}`
        : "Registrace zarizeni a vlastnictvi identitniho klice byly znovu overeny.";
    } catch (firstError) {
      await resetDeviceExchangeIdentity();
      try {
        const result = await ensureCurrentDeviceRegistered();
        storageMessage.value = result?.degradedIdentity
          ? `Registrace byla nouzove obnovena, ale key-exchange zustava nedostupny: ${result.identityError.message}`
          : "Registrace byla opravena novym identitnim klicem pod stavajicim ID zarizeni.";
      } catch (retryError) {
        throw new Error(`Prvni pokus: ${firstError.message}; opravny pokus: ${retryError.message}`);
      }
    }
  } catch (error) {
    storageMessage.value = `Opakovani registrace selhalo: ${error.message}. Zkuste akci Registrovat jako nove zarizeni.`;
  } finally {
    isSyncBusy.value = false;
    automaticSyncScheduler.cancel();
    isDeviceIdentityOperation = false;
  }
}

async function registerAsNewDevice() {
  if (!globalThis.confirm("Vytvorit pro tento klient novou identitu zarizeni? Stary zaznam zustane na serveru k odvolani a po uzavreni migrace bude nove zarizeni vyzadovat schvaleni.")) return;
  isDeviceIdentityOperation = true;
  automaticSyncScheduler.cancel();
  isSyncBusy.value = true;
  try {
    await resetDeviceExchangeIdentity();
    regenerateCurrentDeviceId();
    trustedDevices.value = [];
    pendingDeviceKeyRequests.value = [];
    rotationTargetDeviceIds.value = [];
    await ensureCurrentDeviceRegistered();
    storageMessage.value = identityKeyMigration.value?.enabled
      ? "Nova identita zarizeni byla zaregistrovana v migracnim rezimu."
      : "Nova identita zarizeni byla zaregistrovana a ceka na schvaleni duveryhodnym zarizenim.";
  } catch (error) {
    storageMessage.value = `Nova registrace zarizeni selhala: ${error.message}`;
  } finally {
    isSyncBusy.value = false;
    automaticSyncScheduler.cancel();
    isDeviceIdentityOperation = false;
  }
}

async function approveDeviceKeyRequest(keyRequest) {
  try {
    const material = loadSyncKeyMaterial();
    await fulfillDeviceKeyRequest(syncSettings, keyRequest, material.exportedMasterKey, Number(material.keyVersion ?? 1));
    pendingDeviceKeyRequests.value = await fetchDeviceKeyRequests(syncSettings);
    storageMessage.value = `Master key byl jednorazove zasifrovan pro zarizeni ${keyRequest.targetDeviceId.slice(0, 8)}. Recovery secret predan nebyl.`;
  } catch (error) {
    storageMessage.value = `Predani klice selhalo: ${error.message}`;
  }
}

async function refreshTrustedDevices() {
  try {
    if (!hasSyncIdentity.value) return;
    await ensureCurrentDeviceRegistered();
  } catch (error) {
    console.error("Trusted device refresh failed", error);
  }
}

async function removeTrustedDevice(device) {
  if (device.current || !globalThis.confirm(`Odpojit zarizeni ${device.name}?`)) return;
  try {
    await revokeTrustedDevice(syncSettings, device.deviceId);
    trustedDevices.value = await fetchTrustedDevices(syncSettings);
    storageMessage.value = "Zarizeni bylo odvolano.";
  } catch (error) {
    storageMessage.value = `Zarizeni se nepodarilo odvolat: ${error.message}`;
  }
}

async function editTrustedDeviceAlias(device) {
  const alias = globalThis.prompt("Alias zařízení", device.name);
  if (alias === null || !alias.trim() || alias.trim() === device.name) return;
  try {
    await renameTrustedDevice(syncSettings, device.deviceId, alias);
    await refreshTrustedDevices();
    storageMessage.value = "Alias zařízení byl uložen.";
  } catch (error) {
    storageMessage.value = `Alias zařízení se nepodařilo uložit: ${error.message}`;
  }
}

async function rotateEncryptionKey() {
  if (!globalThis.confirm("Rotace vytvori novy recovery secret a asymetricky preda novy klic ostatnim aktivnim zarizenim. Pokracovat?")) return;
  isSyncBusy.value = true;
  try {
    await ensureCurrentDeviceRegistered();
    const selectedIds = [...rotationTargetDeviceIds.value];
    const unselected = trustedDevices.value.filter((device) => !device.current && device.trustStatus === "trusted" && !selectedIds.includes(device.deviceId));
    const result = await rotateCloudEncryption({ state, settings: syncSettings, baseRevision: Number(syncSettings.revision ?? 0), targetDeviceIds: selectedIds });
    Object.assign(syncSettings, saveSyncSettings({ ...syncSettings, revision: result.revision, lastSyncAt: result.updatedAt }));
    recoverySecretInput.value = result.recoverySecret;
    generatedRecoverySecret.value = result.recoverySecret;
    reportSharePassword.value = "";
    refreshSyncKeyMaterialStatus();
    await refreshTrustedDevices();
    storageMessage.value = `Sifrovaci klic byl rotovan na verzi ${result.keyVersion} a pripraven pro ${result.transferredDeviceCount} dalsich zarizeni. Ulozte novy recovery secret.`;
    if (unselected.length && globalThis.confirm(`Novy klic nebyl predan ${unselected.length} zarizenim. Chcete je nyni odvolat?`)) {
      await Promise.all(unselected.map((device) => revokeTrustedDevice(syncSettings, device.deviceId)));
      await refreshTrustedDevices();
      storageMessage.value = `Klic byl rotovan a ${unselected.length} nevybranych zarizeni bylo odvolano.`;
    }
  } catch (error) {
    storageMessage.value = `Rotace sifrovaciho klice selhala: ${error.message}`;
  } finally {
    isSyncBusy.value = false;
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
    await ensureCurrentDeviceRegistered();
    await tryAutoRecoverLocalSyncKey();
    await refreshAdminConsole({ silent: true });
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
    await ensureCurrentDeviceRegistered();
    await tryAutoRecoverLocalSyncKey();
    await refreshAdminConsole({ silent: true });
    storageMessage.value = `Prihlaseni pres Apple uspesne: ${session.user.email || session.user.name}.`;
  } catch (error) {
    console.error("Apple sign-in failed", error);
    storageMessage.value = `Prihlaseni pres Apple selhalo: ${error.message}`;
  } finally {
    isAuthBusy.value = false;
  }
}

async function signOut() {
  if (webPushStatus.value === "active") {
    try {
      await unregisterWebPush({
        endpoint: effectiveSyncEndpoint.value,
        apiToken: syncSettings.apiToken,
      });
    } catch (error) {
      console.error("Unable to unregister Web Push during sign-out", error);
    }
  }
  clearAuthSession();
  authSession.value = null;
  adminStatus.value = null;
  adminError.value = "";
  Object.assign(accountRoles, { assignedRoles: [], activeRoles: [], definitions: {} });
  selfAssignableRoleDraft.value = ["patient"];
  currentDeviceRoleDraft.value = [];
  treatmentDraftItems.value = [];
  if (activePanelId.value === "sekce-admin") activePanelId.value = "sekce-home";
  webPushStatus.value = "needs-auth";
  applyAuthenticatedAccount(null);
  storageMessage.value = "Prihlaseni bylo odpojeno. Lokalni data zustala zachovana.";
}

async function refreshAdminConsole({ silent = false } = {}) {
  if (!authSession.value?.user) {
    adminStatus.value = null;
    adminError.value = "";
    return;
  }
  isAdminBusy.value = true;
  try {
    const [statusResult, usersResult] = await Promise.all([fetchAdminStatus(), fetchAdminUsers()]);
    adminStatus.value = statusResult;
    adminUsers.value = usersResult.users ?? [];
    adminRoleDefinitions.value = usersResult.roles ?? {};
    if (!adminUsers.value.some((user) => user.userId === selectedAdminUserId.value)) {
      selectAdminUser(adminUsers.value[0] ?? null);
    }
    adminError.value = "";
  } catch (error) {
    adminStatus.value = null;
    adminUsers.value = [];
    adminError.value = error.status === 403 ? "" : error.message;
    if (!silent && error.status !== 403) storageMessage.value = error.message;
  } finally {
    isAdminBusy.value = false;
  }
}

function selectAdminUser(user) {
  selectedAdminUserId.value = user?.userId ?? "";
  adminRoleDraft.value = [...(user?.roles ?? [])];
}

async function saveAdminUserRoles() {
  if (!selectedAdminUser.value || !adminRoleDraft.value.length) return;
  isAdminBusy.value = true;
  try {
    await updateAdminUserRoles(selectedAdminUser.value.userId, adminRoleDraft.value);
    await refreshAdminConsole({ silent: true });
    storageMessage.value = "Role uživatele byly uloženy.";
  } catch (error) {
    adminError.value = error.message;
  } finally {
    isAdminBusy.value = false;
  }
}

async function refreshAccountRoles() {
  if (!authSession.value?.user || !hasSyncIdentity.value) return;
  try {
    Object.assign(accountRoles, await fetchCurrentRoles());
    treatmentDraftItems.value = listEncryptedTreatmentDrafts();
    currentDeviceRoleDraft.value = [...accountRoles.activeRoles];
    selfAssignableRoleDraft.value = accountRoles.assignedRoles.filter(
      (role) => accountRoles.definitions?.[role]?.selfAssignable,
    );
  } catch (error) {
    console.error("Role refresh failed", error);
  }
}

async function saveSelfAssignableRoles() {
  if (!selfAssignableRoleDraft.value.length) return;
  try {
    Object.assign(accountRoles, await updateSelfAssignableRoles(selfAssignableRoleDraft.value));
    currentDeviceRoleDraft.value = [...accountRoles.activeRoles];
    selfAssignableRoleDraft.value = accountRoles.assignedRoles.filter(
      (role) => accountRoles.definitions?.[role]?.selfAssignable,
    );
    storageMessage.value = "Role pacienta a rodinného příslušníka byly uloženy.";
  } catch (error) {
    storageMessage.value = error.message;
  }
}

async function saveCurrentDeviceRoles() {
  if (!currentDeviceRoleDraft.value.length) return;
  try {
    Object.assign(accountRoles, await updateCurrentDeviceRoles(currentDeviceRoleDraft.value));
    currentDeviceRoleDraft.value = [...accountRoles.activeRoles];
    storageMessage.value = "Aktivní role tohoto zařízení byly uloženy.";
  } catch (error) {
    storageMessage.value = error.message;
  }
}

async function createAdminBackup() {
  isAdminBusy.value = true;
  try {
    await createCloudBackup();
    await refreshAdminConsole({ silent: true });
    storageMessage.value = "Cloudová záloha byla spuštěna.";
  } catch (error) {
    adminError.value = error.message;
  } finally {
    isAdminBusy.value = false;
  }
}

async function removeAdminBackup(backup) {
  if (!globalThis.confirm(`Opravdu odstranit cloudovou zálohu ${backup.id}? Tuto operaci nelze vrátit.`)) return;
  isAdminBusy.value = true;
  try {
    await deleteCloudBackup(backup.id);
    await refreshAdminConsole({ silent: true });
    storageMessage.value = `Cloudová záloha ${backup.id} byla odstraněna.`;
  } catch (error) {
    adminError.value = error.message;
  } finally {
    isAdminBusy.value = false;
  }
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
    await ensureCurrentDeviceRegistered();
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
    await ensureCurrentDeviceRegistered();
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
      lastSyncMessage: "Cloudová synchronizace byla inicializována.",
    }));
    generatedRecoverySecret.value = result.generatedRecoverySecret;
    if (result.generatedRecoverySecret) {
      recoverySecretInput.value = result.generatedRecoverySecret;
    }
    refreshSyncKeyMaterialStatus();
    markCloudAuthenticated(authSession.value?.user ?? null);
    storageMessage.value = result.generatedRecoverySecret
      ? "Cloudová synchronizace byla inicializována. Uložte si obnovovací kód."
      : "Cloudová synchronizace byla inicializována.";
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
    return false;
  }

  isSyncBusy.value = true;
  try {
    await ensureCurrentDeviceRegistered();
    storageMessage.value = "Nacitam sifrovany stav ze serveru.";
    const result = await pullCloudState(syncSettings);
    refreshSyncKeyMaterialStatus();
    if (!result.state) {
      storageMessage.value = "Na serveru zatim nejsou zadna data.";
      return true;
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
      lastSyncMessage: "Stažení dat z cloudu bylo dokončeno.",
    }));
    markCloudAuthenticated(authSession.value?.user ?? null);
    storageMessage.value = "Data byla doplnena ze serveru bez mazani lokalnich zaznamu.";
    return true;
  } catch (error) {
    console.error("Sync pull failed", error);
    Object.assign(syncSettings, saveSyncSettings({
      ...syncSettings,
      lastSyncStatus: "error",
      lastSyncMessage: error.message,
    }));
    storageMessage.value = `Synchronizace ze serveru selhala: ${error.message}`;
    return false;
  } finally {
    isSyncBusy.value = false;
  }
}

async function pushSync(force = false) {
  const shouldForce = force === true;
  let conflictAuditId = "";

  if (!ensureSyncIdentity()) {
    return false;
  }

  isSyncBusy.value = true;
  const pushedChangeVersion = localChangeVersion;
  try {
    await ensureCurrentDeviceRegistered();
    storageMessage.value = "Pripravuji lokalni stav pro odeslani do cloud syncu.";
    const result = await pushCloudState({
      state,
      settings: syncSettings,
      baseRevision: Number(syncSettings.revision ?? 0),
      force: shouldForce,
    });

    if (result.status === "conflict" && result.remoteState) {
      const conflictAudit = recordConflictDetected({
        baseRevision: Number(syncSettings.revision ?? 0),
        remoteRevision: result.revision,
      });
      conflictAuditId = conflictAudit.id;
      conflictAuditItems.value = loadConflictAudit();
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
        lastSyncMessage: "Konflikt byl sloučen a odeslán.",
      }));
      markCloudAuthenticated(authSession.value?.user ?? null);
      refreshSyncKeyMaterialStatus();
      clearPushedChanges(pushedChangeVersion);
      resolveConflictAudit(conflictAuditId, {
        status: "resolved",
        resolvedRevision: retryResult.revision,
      });
      conflictAuditItems.value = loadConflictAudit();
      storageMessage.value = "Konflikt byl sloucen append-only a synchronizace dokoncena.";
      return true;
    }

    Object.assign(syncSettings, saveSyncSettings({
      ...syncSettings,
      userId: authSession.value?.user?.userId ?? syncSettings.userId,
      revision: result.revision,
      lastSyncAt: result.updatedAt,
      lastSyncStatus: "ok",
      lastSyncMessage: "Odeslání dat do cloudu bylo dokončeno.",
    }));
    markCloudAuthenticated(authSession.value?.user ?? null);
    refreshSyncKeyMaterialStatus();
    clearPushedChanges(pushedChangeVersion);
    storageMessage.value = "Lokalni data byla odeslana do cloud syncu.";
    return true;
  } catch (error) {
    if (conflictAuditId) {
      resolveConflictAudit(conflictAuditId, { status: "failed" });
      conflictAuditItems.value = loadConflictAudit();
    }
    console.error("Sync push failed", error);
    Object.assign(syncSettings, saveSyncSettings({
      ...syncSettings,
      lastSyncStatus: "error",
      lastSyncMessage: error.message,
    }));
    storageMessage.value = `Synchronizace na server selhala: ${error.message}`;
    return false;
  } finally {
    isSyncBusy.value = false;
  }
}

function clearPushedChanges(pushedChangeVersion) {
  if (localChangeVersion === pushedChangeVersion) {
    hasPendingSyncChanges.value = false;
    savePendingSyncChanges(false);
  }
}

async function pushPendingChanges() {
  if (!hasPendingSyncChanges.value || isSyncBusy.value || !isQuickSyncAvailable.value) {
    return false;
  }

  storageMessage.value = "Byly zjisteny lokalni zmeny. Spoustim automaticky push.";
  return pushSync();
}

async function runAutomaticSynchronization() {
  if (isDeviceIdentityOperation) {
    return true;
  }
  if (!isQuickSyncAvailable.value) {
    return true;
  }

  if (hasPendingSyncChanges.value) {
    return pushPendingChanges();
  }

  return quickSync({ automatic: true });
}

async function quickSync(options = {}) {
  const automatic = options?.automatic === true;
  if (isSyncBusy.value || !isQuickSyncAvailable.value) {
    if (!automatic && !isOnline.value) {
      storageMessage.value = "Rychlou synchronizaci nelze spustit bez pripojeni k internetu.";
    }
    return false;
  }

  storageMessage.value = automatic
    ? "Spoustim automatickou synchronizaci: pull a pote push."
    : "Spoustim rychlou synchronizaci: pull a pote push.";

  const pullCompleted = await pullSync();
  if (!pullCompleted) {
    return false;
  }

  const pushCompleted = await pushSync();
  if (pushCompleted) {
    storageMessage.value = automatic
      ? "Automaticka synchronizace byla dokoncena."
      : "Rychla synchronizace byla dokoncena.";
  }
  return pushCompleted;
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
    storageMessage.value = "Obnovovací kód byl uložen místně do tohoto zařízení.";
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
    storageMessage.value = "Import SQLite byl zrušen.";
    return;
  }

  try {
    downloadJsonBackup("neurodiary-preimport", state.selectedDate || "backup");
    const buffer = await file.arrayBuffer();
    const importedState = diaryRepository.value.importDatabase(buffer);
    applyImportedState(importedState);
    storageMessage.value = `Soubor ${file.name} byl importován.`;
  } catch (error) {
    console.error("SQLite import failed", error);
    storageMessage.value = "Import se nezdařil. Vyberte platný soubor SQLite aplikace NeuroDiary.";
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
    storageMessage.value = "Import JSON byl zrušen.";
    return;
  }

  try {
    downloadJsonBackup("neurodiary-preimport", state.selectedDate || "backup");
    const raw = await file.text();
    const importedState = parseJsonBackup(raw);
    applyImportedState(importedState);
    storageMessage.value = `Soubor ${file.name} byl importován.`;
  } catch (error) {
    console.error("JSON import failed", error);
    storageMessage.value = "Import se nezdařil. Vyberte platnou JSON zálohu aplikace NeuroDiary.";
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
    state.deletedMedicationIds = nextState.deletedMedicationIds ?? {};
    state.account = nextState.account ?? state.account;
    state.entries = nextState.entries ?? {};
    ensureEntry(state, state.selectedDate);
    if (!selectedTreatmentPlanId.value || !activeTodayTreatmentPlan.value.some((item) => item.id === selectedTreatmentPlanId.value)) {
      selectedTreatmentPlanId.value = activeTodayTreatmentPlan.value[0]?.id ?? "";
    }
    diaryRepository.value?.saveState(state);
  } finally {
    isApplyingExternalState.value = false;
  }
  void refreshWebPushRegistration();
}

watch(
  activeQuickCaptureTreatmentPlan,
  (items) => {
    if (!items.some((item) => item.id === selectedTreatmentPlanId.value)) {
      selectedTreatmentPlanId.value = items[0]?.id ?? "";
    }
  },
  { immediate: true },
);

watch(
  () => authSession.value?.user?.userId ?? "",
  (nextUserId, previousUserId) => {
    previousAuthUserId.value = nextUserId;
    trustedDevices.value = [];
    if (nextUserId) {
      void refreshWebPushRegistration();
    }
    if (previousUserId === nextUserId) {
      return;
    }

    Object.assign(syncSettings, clearSyncState(syncSettings));
    clearSyncKeyMaterial();
    refreshSyncKeyMaterialStatus();
    recoverySecretInput.value = "";
    generatedRecoverySecret.value = "";
    // Each account has its own local database namespace. Reloading closes the
    // previous repository before the new account can read or mutate any state.
    globalThis.location?.reload?.();
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
      <p class="section-kicker">Spouštění aplikace</p>
      <h2>Připravuji místní úložiště deníku</h2>
      <p class="panel-tip">Inicializuji offline úložiště a načítám místní data.</p>
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
          <p class="eyebrow">Zdravotní deník</p>
          <h1>NeuroDiary</h1>
          <p class="lede">
            Přehledný offline deník pro každodenní sledování příznaků, užívání léků a rychlé
            vyhodnocení vývoje.
          </p>
          <div class="hero-actions">
            <button
              v-if="canInstallApp"
              class="primary-button"
              type="button"
              @click="promptInstall"
            >
              Nainstalovat aplikaci
            </button>
            <p class="hero-install-note">{{ installHelpText }}</p>
          </div>
          <div v-if="showIosInstallGuide" class="ios-install-card" aria-label="Návod k instalaci v iOS">
            <p class="ios-install-title">Instalace na iPhone nebo iPad</p>
            <ol class="ios-install-steps">
              <li>Otevřete v prohlížeči nabídku Sdílet.</li>
              <li>Zvolte <strong>Přidat na plochu</strong>.</li>
            </ol>
          </div>
        </div>
      </header>

      <section ref="floatingMenu" class="floating-menu" aria-label="Rychla navigace a akce">
        <div class="floating-menu-top">
          <div class="floating-menu-status">
            <p class="hero-label">Vybraný den · {{ repositoryMode }}</p>
            <p class="hero-date">{{ selectedDateLabel }}</p>
            <p class="panel-tip">Sestaveni {{ buildTimestampLabel }} · {{ buildVersionLabel }} · {{ environmentLabel }}</p>
            <div class="status-chips" aria-label="Stav aplikace">
              <span :class="['status-chip', isOnline ? 'status-chip-online' : 'status-chip-offline']">
                {{ isOnline ? "Připojeno" : "Offline" }}
              </span>
              <span v-if="pwaOfflineReady" class="status-chip status-chip-ready">Offline data připravena</span>
              <span v-if="pwaUpdateRegistration" class="status-chip status-chip-update">Aktualizace připravena</span>
              <span v-if="hasPendingSyncChanges" class="status-chip status-chip-update">Změny čekají na synchronizaci</span>
            </div>
          </div>

          <button
            class="primary-button quick-sync-button"
            type="button"
            :disabled="isSyncBusy || !isQuickSyncAvailable"
            :title="isQuickSyncAvailable ? 'Stahnout, sloucit a odeslat data' : 'Synchronizace neni dostupna nebo nastavena'"
            @click="quickSync"
          >
            {{ isSyncBusy ? "Synchronizuji…" : "Synchronizovat" }}
          </button>
        </div>

        <div class="panel-switcher" aria-label="Prepinani panelu a data">
          <div class="panel-switcher-toolbar">
            <div class="panel-switcher-pills" aria-label="Vyber panelu">
              <button
                v-for="item in primaryPanelItems"
                :key="item.id"
                class="panel-pill"
                :class="{ 'panel-pill-active': item.id === activePanelId }"
                type="button"
                @click="selectPanel(item.id)"
              >
                {{ item.label }}
              </button>
            </div>

            <div class="utility-menu">
              <button
                v-if="!isCaregiverOnlyMode"
                class="ghost-button"
                :class="{ 'panel-pill-active': activePanelId === 'sekce-report' }"
                type="button"
                @click="selectPanel('sekce-report')"
              >
                Report pro lékaře
              </button>

              <button
                class="ghost-button utility-menu-trigger"
                type="button"
                :aria-expanded="isUtilityMenuOpen ? 'true' : 'false'"
                aria-haspopup="menu"
                @click="toggleUtilityMenu"
              >
                <span class="utility-menu-trigger-icon" aria-hidden="true">☰</span>
                <span>Více</span>
              </button>

              <div v-if="isUtilityMenuOpen" class="utility-menu-panel" role="menu" aria-label="Další sekce, export a zálohy">
                <button
                  v-if="!isCaregiverOnlyMode"
                  class="utility-menu-item"
                  type="button"
                  role="menuitem"
                  :aria-current="activePanelId === 'sekce-matice' ? 'page' : undefined"
                  @click="handleUtilityAction(() => selectPanel('sekce-matice'))"
                >
                  Hodinová matice
                </button>
                <button v-if="!isCaregiverOnlyMode" class="utility-menu-item" type="button" role="menuitem" @click="handleUtilityAction(() => selectPanel('sekce-udaje'))">
                  Údaje
                </button>
                <button v-if="!isCaregiverOnlyMode && canUseClinicalAnalyses" class="utility-menu-item" type="button" role="menuitem" @click="handleUtilityAction(() => selectPanel('sekce-trendy'))">
                  Trendy
                </button>
                <button class="utility-menu-item" type="button" role="menuitem" @click="handleUtilityAction(() => selectPanel('sekce-kontakty'))">
                  Kontakty
                </button>
                <button class="utility-menu-item" type="button" role="menuitem" @click="handleUtilityAction(() => selectPanel('sekce-sdileni'))">
                  Sdílení dat{{ pendingShareInvitationCount ? ` (${pendingShareInvitationCount})` : "" }}
                </button>
                <button class="utility-menu-item" type="button" role="menuitem" @click="handleUtilityAction(() => selectPanel('sekce-kartoteka'))">
                  Sdílená kartotéka
                </button>
                <button v-if="adminStatus" class="utility-menu-item" type="button" role="menuitem" @click="handleUtilityAction(() => selectPanel('sekce-admin'))">
                  Administrace cloudu
                </button>
                <button class="utility-menu-item" type="button" role="menuitem" @click="openBootstrapLogPanel">
                  Diagnostika startu
                </button>
                <button class="utility-menu-item" type="button" role="menuitem" @click="openIntegrityReportPanel">
                  Kontrola integrity dat
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

          <div v-if="showDateSwitcher" class="date-switcher">
            <button class="ghost-button" type="button" @click="goToPreviousDate">Předchozí den</button>
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
              Další den
            </button>
            <button class="ghost-button" type="button" :disabled="state.selectedDate === getTodayKey()" @click="updateSelectedDate(getTodayKey())">
              Dnes
            </button>
            <button class="ghost-button utility-menu-item-danger" type="button" @click="resetSelectedDateEverywhere">
              Vynucene smazat tento den
            </button>
          </div>
        </div>

        <div v-if="!isOnline" class="status-banner status-banner-offline" role="status">
          <p>Pracujete offline. Záznamy se ukládají lokálně a synchronní akce závislé na síti nejsou potřeba.</p>
        </div>

        <div v-if="pwaOfflineReady" class="status-banner status-banner-ready" role="status">
          <p>Aplikace je pripravena k offline pouziti i po dalsim otevreni.</p>
          <button class="ghost-button" type="button" @click="dismissOfflineReady">Rozumim</button>
        </div>

        <div v-if="pwaUpdateRegistration" class="status-banner status-banner-update" role="status">
          <p>Je připravena nová verze aplikace. Pro načtení aktualizace stačí obnovit aplikaci.</p>
          <button class="primary-button" type="button" @click="applyAppUpdate">Aktualizovat ted</button>
        </div>

        <div v-if="storageMessage" class="storage-message floating-menu-message">
          <span>{{ storageMessage }}</span>
          <button
            v-if="lastCaptureUndo?.message === storageMessage"
            class="ghost-button storage-message-action"
            type="button"
            @click="undoLastCapture"
          >
            Vratit posledni zapis
          </button>
        </div>
      </section>

      <main
        ref="panelShell"
        class="single-panel-shell"
        @touchstart.passive="handlePanelTouchStart"
        @touchend.passive="handlePanelTouchEnd"
      >
        <section v-if="activePanelId === 'sekce-report'" class="panel panel-wide layout-report">
          <div class="panel-heading">
            <div>
              <p class="section-kicker">Report</p>
              <h2>Report pro lékaře</h2>
            </div>
          </div>

          <div class="report-frame-grid">
            <fieldset class="contact-keyring">
              <legend>Obsah reportu</legend>
              <label><input v-model="reportOptions.includeToday" type="checkbox" /> Zahrnout dnešní den</label>
              <div class="clinical-analysis-warning" role="alert">
                <strong>Analýzy jsou v reportech vypnuté</strong>
                <span>Necertifikované trendy, wearing-off výpočty a analytické grafy se do reportu nevytvářejí.</span>
              </div>
            </fieldset>

            <fieldset class="contact-keyring">
              <legend>Příjemce reportu</legend>
              <label>
                <span>Uložený kontakt</span>
                <select v-model="selectedContactId" @change="reportSharePassword = ''">
                  <option value="">Jednorázové zadání</option>
                  <option v-for="contact in contacts" :key="contact.id" :value="contact.id">
                    {{ contact.name }} · {{ contact.keyFingerprint ? "veřejný klíč" : "heslo" }}
                  </option>
                </select>
              </label>
              <template v-if="!selectedContactId">
                <label><span>Jméno jednorázového kontaktu</span><input v-model="doctorContact.name" type="text" maxlength="120" /></label>
                <label><span>E-mail jednorázového kontaktu</span><input v-model="doctorContact.email" type="email" maxlength="254" /></label>
                <label class="report-checkbox">
                  <input v-model="encryptOneTimeReport" type="checkbox" @change="reportSharePassword = ''" />
                  Zašifrovat report heslem
                </label>
                <p class="panel-tip">
                  Jednorázově zadaný kontakt se neukládá.
                  {{ encryptOneTimeReport
                    ? "Report se odešle v šifrovaném ZIPu a heslo je nutné předat jiným kanálem."
                    : "Report se odešle jako nešifrované PDF." }}
                </p>
              </template>
            </fieldset>
          </div>

          <div class="report-actions">
            <button class="primary-button" type="button" @click="printDoctorReport">Otevřít tisk</button>
            <button class="ghost-button" type="button" @click="saveDoctorReportPdf">Uložit PDF</button>
            <button class="ghost-button" type="button" @click="shareDoctorReportSecurely">
              {{ selectedContactId || encryptOneTimeReport ? "Sdílet šifrovaně" : "Sdílet PDF" }}
            </button>
            <button v-if="authConfig.googleEnabled" class="ghost-button" type="button" @click="sendDoctorReportWithGmail">Odeslat přes Gmail</button>
          </div>

          <div v-if="reportSharePassword" class="report-share-password">
            <strong>Heslo k záložní ZIP příloze</strong>
            <code>{{ reportSharePassword }}</code>
            <span>Předejte jiným kanálem, nikdy ve stejném e-mailu.</span>
          </div>
        </section>

        <section v-else-if="activePanelId === 'sekce-sdileni'" class="panel panel-wide layout-profile">
          <div class="panel-heading">
            <div>
              <p class="section-kicker">Sdílení dat</p>
              <h2>Přístup k deníkům</h2>
            </div>
            <button class="ghost-button" type="button" :disabled="isSharingBusy" @click="refreshDiaryShares(false)">
              {{ isSharingBusy ? "Načítám…" : "Obnovit" }}
            </button>
          </div>

          <div v-if="!authSession?.user" class="sync-warning-card">
            <strong>Je nutné přihlášení</strong>
            <p>Sdílení je vázané na ověřené účty a není dostupné v anonymním ani legacy-token režimu.</p>
          </div>
          <template v-else>
            <section v-if="treatmentProposals.some((item) => item.status === 'pending' && item.ownerUserId === authSession?.user?.userId)" class="sync-settings-card">
              <h3>Návrhy změn léčby ke schválení</h3>
              <article v-for="proposal in treatmentProposals.filter((item) => item.status === 'pending' && item.ownerUserId === authSession?.user?.userId)" :key="proposal.proposalId" class="share-status-card">
                <div>
                  <strong>Dávkový návrh léčebného plánu</strong>
                  <p class="panel-tip">Od {{ proposal.proposerName || 'lékaře' }} · revize {{ proposal.baseRevision }}</p>
                  <p v-if="proposal.error" class="form-error">{{ proposal.error }}</p>
                  <div v-else class="proposal-diff">
                    <p v-if="proposal.changes?.doctorNote"><strong>Důvod lékaře:</strong> {{ proposal.changes.doctorNote }}</p>
                    <p><strong>{{ treatmentProposalDiff(proposal).total }} změn:</strong> {{ treatmentProposalDiff(proposal).added.length }} přidáno, {{ treatmentProposalDiff(proposal).changed.length }} upraveno, {{ treatmentProposalDiff(proposal).removed.length }} odebráno.</p>
                    <p v-for="item in treatmentProposalDiff(proposal).added" :key="`add-${item.id}`" class="proposal-change-added">+ {{ item.time }} · {{ item.name }} · {{ item.dose }}</p>
                    <p v-for="item in treatmentProposalDiff(proposal).removed" :key="`remove-${item.id}`" class="proposal-change-removed">− {{ item.time }} · {{ item.name }} · {{ item.dose }}</p>
                    <div v-for="item in treatmentProposalDiff(proposal).changed" :key="`change-${item.id}`">
                      <strong>Upraveno: {{ item.before.name }}</strong>
                      <p v-for="change in item.changes" :key="change.field">{{ TREATMENT_FIELD_LABELS[change.field] }}: <s>{{ change.before || 'neuvedeno' }}</s> → <strong>{{ change.after || 'neuvedeno' }}</strong></p>
                    </div>
                  </div>
                </div>
                <div class="share-status-actions">
                  <label class="proposal-return-comment"><span>Připomínka pro lékaře</span><textarea v-model="treatmentReturnComments[proposal.proposalId]" rows="2" maxlength="1000" placeholder="Co má lékař v návrhu upravit?"></textarea></label>
                  <button class="primary-button" type="button" :disabled="!proposal.changes" @click="respondToTreatmentProposal(proposal, 'approved')">Schválit a použít</button>
                  <button class="ghost-button" type="button" @click="respondToTreatmentProposal(proposal, 'returned')">Vrátit k přepracování</button>
                  <button class="ghost-button" type="button" @click="respondToTreatmentProposal(proposal, 'declined')">Zamítnout</button>
                </div>
              </article>
            </section>

            <section v-if="isCaregiverOnlyMode && hasSyncIdentity" class="sync-settings-card caregiver-role-settings">
              <h3>Role tohoto zařízení</h3>
              <p class="panel-tip">Zde můžete režim zařízení změnit i tehdy, když pacientské nastavení není v nabídce.</p>
              <fieldset v-if="Object.keys(accountRoles.definitions).length" class="contact-keyring device-role-settings">
                <legend>Moje role</legend>
                <label v-for="(definition, role) in accountRoles.definitions" v-show="definition.selfAssignable" :key="`caregiver-self-role-${role}`">
                  <input v-model="selfAssignableRoleDraft" type="checkbox" :value="role" />
                  {{ definition.label }}
                </label>
                <button class="ghost-button" type="button" :disabled="!selfAssignableRoleDraft.length" @click="saveSelfAssignableRoles">Uložit moje role</button>
              </fieldset>
              <fieldset v-if="accountRoles.assignedRoles.length" class="contact-keyring device-role-settings">
                <legend>Aktivní role na tomto zařízení</legend>
                <label v-for="role in accountRoles.assignedRoles" :key="`caregiver-active-role-${role}`">
                  <input v-model="currentDeviceRoleDraft" type="checkbox" :value="role" />
                  {{ accountRoles.definitions?.[role]?.label || role }}
                </label>
                <button class="ghost-button" type="button" :disabled="!currentDeviceRoleDraft.length" @click="saveCurrentDeviceRoles">Uložit aktivní role</button>
              </fieldset>
            </section>

            <section class="sync-settings-card">
              <h3>Sdílet můj deník</h3>
              <p class="panel-tip">Příjemce získá pouze čtení až po výslovném přijetí pozvánky. Pokud už účet má, pozvánka se mu zobrazí přímo zde.</p>
              <form class="share-form" @submit.prevent="addDiaryShare">
                <label>
                  <span>E-mail příjemce</span>
                  <input v-model="shareRecipientEmail" type="email" maxlength="254" required placeholder="uzivatel@example.cz" />
                </label>
                <button class="primary-button" type="submit" :disabled="isSharingBusy">Odeslat pozvánku</button>
              </form>
              <h4 class="share-list-heading">Odeslané pozvánky</h4>
              <div v-if="diaryShares.outgoingInvitations.length" class="share-status-list">
                <article v-for="invitation in diaryShares.outgoingInvitations" :key="invitation.invitationId" class="share-status-card">
                  <div>
                    <strong>{{ invitation.recipientEmail }}</strong>
                    <p class="panel-tip">Vytvořeno {{ formatBackupTimestamp(invitation.createdAt) }} · platnost do {{ formatBackupTimestamp(invitation.expiresAt) }}</p>
                  </div>
                  <span :class="['status-chip', invitation.status === 'active' ? 'status-chip-ready' : invitation.status === 'accepted' ? 'status-chip-update' : invitation.status === 'pending' ? 'status-chip-online' : 'status-chip-offline']">
                    {{ shareStatusLabel(invitation.status) }}
                  </span>
                  <div class="share-status-actions">
                    <button v-if="invitation.status === 'accepted'" class="primary-button" type="button" :disabled="isSharingBusy" @click="activateShareInvitation(invitation.invitationId)">Aktivovat sdílení</button>
                    <button v-if="['pending', 'accepted'].includes(invitation.status)" class="ghost-button utility-menu-item-danger" type="button" :disabled="isSharingBusy" @click="cancelShareInvitation(invitation.invitationId)">Zrušit pozvánku</button>
                    <button v-if="invitation.status === 'active' && invitation.grantId" class="ghost-button utility-menu-item-danger" type="button" :disabled="isSharingBusy" @click="removeDiaryShare(invitation.grantId)">Odvolat přístup</button>
                  </div>
                </article>
              </div>
              <p v-else class="panel-tip">Nemáte žádné odeslané pozvánky.</p>
              <div v-if="legacyOutgoingShares.length" class="share-status-list">
                <article v-for="grant in legacyOutgoingShares" :key="grant.grantId" class="share-status-card">
                  <div>
                    <strong>{{ grant.recipientName || grant.recipientEmail }}</strong>
                    <p class="panel-tip">Původní aktivní propojení · {{ grant.recipientEmail }}</p>
                  </div>
                  <span :class="['status-chip', grant.revokedAt ? 'status-chip-offline' : 'status-chip-ready']">{{ grant.revokedAt ? "Odvoláno" : "Aktivní" }}</span>
                  <div v-if="!grant.revokedAt" class="share-status-actions">
                    <button class="ghost-button utility-menu-item-danger" type="button" :disabled="isSharingBusy" @click="removeDiaryShare(grant.grantId)">Odvolat přístup</button>
                  </div>
                </article>
              </div>
            </section>

            <section class="sync-settings-card">
              <h3>Pozvánky pro mě</h3>
              <div v-if="diaryShares.incomingInvitations.length" class="share-status-list">
                <article v-for="invitation in diaryShares.incomingInvitations" :key="invitation.invitationId" class="share-status-card">
                  <div>
                    <strong>{{ invitation.ownerName || invitation.ownerEmail }}</strong>
                    <p class="panel-tip">{{ invitation.ownerEmail }} · platnost do {{ formatBackupTimestamp(invitation.expiresAt) }}</p>
                  </div>
                  <span :class="['status-chip', invitation.status === 'accepted' ? 'status-chip-update' : 'status-chip-online']">{{ shareStatusLabel(invitation.status) }}</span>
                  <div v-if="invitation.status === 'pending'" class="share-status-actions">
                    <button class="primary-button" type="button" :disabled="isSharingBusy" @click="respondToShareInvitation(invitation.invitationId, true)">Přijmout</button>
                    <button class="ghost-button" type="button" :disabled="isSharingBusy" @click="respondToShareInvitation(invitation.invitationId, false)">Odmítnout</button>
                  </div>
                  <p v-else class="panel-tip">Čeká se na kryptografickou aktivaci vlastníkem.</p>
                </article>
              </div>
              <p v-else class="panel-tip">Nemáte žádné čekající pozvánky.</p>
            </section>

            <p class="panel-tip">Přijaté deníky najdete v samostatné Kartotéce.</p>
          </template>
          <p v-if="sharingMessage" class="storage-message">{{ sharingMessage }}</p>
        </section>

        <section v-else-if="activePanelId === 'sekce-kartoteka'" class="panel panel-wide shared-records-panel">
          <div class="panel-heading">
            <div>
              <p class="section-kicker">Sdílená kartotéka</p>
              <h2>Deníky sdílené se mnou</h2>
            </div>
            <div class="shared-records-toolbar">
              <label class="shared-records-search">
                <span>Vyhledat v kartotéce</span>
                <input v-model="sharedRecordsSearch" type="search" placeholder="Jméno, e-mail nebo rok narození" />
              </label>
              <button class="ghost-button" type="button" :disabled="isSharingBusy" @click="refreshDiaryShares(true)">Obnovit kartotéku</button>
            </div>
          </div>

          <div v-if="sharedDiaryViews.length" class="shared-records-layout">
            <aside class="shared-records-index" aria-label="Sdílení uživatelé">
              <button
                v-for="view in filteredSharedDiaryViews"
                :key="view.grantId"
                class="shared-record-person"
                :class="{ 'shared-record-person-active': view.grantId === selectedSharedView?.grantId }"
                type="button"
                @click="selectSharedDiary(view)"
              >
                <strong>{{ view.state?.patientName || view.ownerName || "Uživatel" }}</strong>
                <span>{{ view.ownerEmail }}</span>
                <small>{{ Object.keys(view.state?.entries || {}).length }} dnů · revize {{ view.revision }}</small>
              </button>
              <p v-if="!filteredSharedDiaryViews.length" class="panel-tip">Vyhledávání neodpovídá žádnému uživateli.</p>
            </aside>

            <div v-if="selectedSharedView" class="shared-record-content">
              <div class="shared-record-header">
                <div>
                  <h3>{{ selectedSharedView.state?.patientName || selectedSharedView.ownerName || "Uživatel" }}</h3>
                  <p class="panel-tip">{{ selectedSharedView.ownerEmail }}<span v-if="selectedSharedView.state?.birthYear"> · rok narození {{ selectedSharedView.state.birthYear }}</span></p>
                </div>
                <label class="shared-record-date">
                  <span>Datum</span>
                  <input v-model="selectedSharedDate" type="date" :max="getTodayKey()" />
                </label>
              </div>

              <nav class="shared-record-tabs" aria-label="Funkce sdíleného deníku">
                <button type="button" :class="{ active: selectedSharedSection === 'timeline' }" @click="selectedSharedSection = 'timeline'">Časová osa</button>
                <button v-if="canUseClinicalAnalyses" type="button" :class="{ active: selectedSharedSection === 'summary' }" @click="selectedSharedSection = 'summary'">Souhrn</button>
                <button type="button" :class="{ active: selectedSharedSection === 'treatment' }" @click="selectedSharedSection = 'treatment'">Naplánovaná léčba</button>
                <button type="button" :class="{ active: selectedSharedSection === 'report' }" @click="selectedSharedSection = 'report'">Report pro tisk</button>
              </nav>

              <p v-if="selectedSharedView.error" class="form-error">Data se nepodařilo dešifrovat: {{ selectedSharedView.error }}</p>
              <DailyTimeline
                v-else-if="selectedSharedSection === 'timeline'"
                :entries="selectedSharedView.state.entries"
                :selected-date="selectedSharedDate"
                :treatment-plan="selectedSharedView.state.treatmentPlan || []"
                @select-date="selectedSharedDate = $event"
              />
              <DaySummary
                v-else-if="canUseClinicalAnalyses && selectedSharedSection === 'summary' && selectedSharedEntry"
                :entry="selectedSharedEntry"
                :entries="selectedSharedView.state.entries"
                :selected-date="selectedSharedDate"
              />
              <p v-else-if="selectedSharedSection === 'summary'" class="panel-tip">Pro vybraný den není dostupný záznam.</p>
              <section v-else-if="selectedSharedSection === 'treatment'" class="sync-settings-card">
                <div class="panel-heading">
                  <div><h3>Naplánovaná léčba</h3><p class="panel-tip">Rodinný příslušník má plán pouze ke čtení. Lékař může odeslat více změn najednou ke schválení pacientovi.</p></div>
                  <button v-if="isDoctorRoleActive" class="ghost-button" type="button" @click="addTreatmentProposalRow">Přidat položku</button>
                </div>
                <div v-if="isDoctorRoleActive" class="stack-form">
                  <label><span>Důvod a vysvětlení změn</span><textarea v-model="treatmentProposalDoctorNote" rows="3" maxlength="2000" placeholder="Vysvětlete pacientovi navržené změny" @input="markTreatmentDraftDirty"></textarea></label>
                  <p v-if="treatmentProposalPreviousId" class="panel-tip">Připravujete přepracovanou verzi vráceného návrhu.</p>
                  <div v-for="(item, index) in treatmentProposalDraft" :key="item.id" class="treatment-proposal-row">
                    <input v-model="item.name" type="text" maxlength="100" aria-label="Název léku" placeholder="Název léku" @input="markTreatmentDraftDirty" />
                    <input v-model="item.dose" type="text" maxlength="50" aria-label="Dávka" placeholder="Dávka" @input="markTreatmentDraftDirty" />
                    <input v-model="item.time" type="time" aria-label="Čas" @input="markTreatmentDraftDirty" />
                    <button class="ghost-button utility-menu-item-danger" type="button" @click="treatmentProposalDraft.splice(index, 1); markTreatmentDraftDirty()">Odebrat</button>
                  </div>
                  <p v-if="treatmentDraftSavedAt" class="panel-tip">Koncept automaticky uložen {{ formatAdminTimestamp(treatmentDraftSavedAt) }}.</p>
                  <button class="primary-button" type="button" :disabled="isSharingBusy || !treatmentProposalDraft.length" @click="submitTreatmentProposal">Odeslat celý návrh pacientovi</button>
                </div>
                <ul v-else-if="selectedSharedView.state.treatmentPlan?.length" class="backup-history-list">
                  <li v-for="item in selectedSharedView.state.treatmentPlan" :key="item.id"><strong>{{ item.time }} · {{ item.name }}</strong><span>{{ item.dose }} · od {{ item.validFrom || 'neuvedeno' }}{{ item.validTo ? ` do ${item.validTo}` : '' }}</span></li>
                </ul>
                <p v-else class="panel-tip">Pacient nemá naplánovanou žádnou léčbu.</p>
              </section>
              <section v-else class="shared-report-panel">
                <div>
                  <h3>Report pro lékaře</h3>
                  <p class="panel-tip">Report vznikne pouze z dat, která s vámi tento uživatel sdílí, a otevře se v systémovém dialogu tisku.</p>
                </div>
                <fieldset class="contact-keyring shared-report-options">
                  <legend>Obsah reportu</legend>
                  <label><input v-model="reportOptions.includeToday" type="checkbox" /> Zahrnout dnešní den</label>
                  <div class="clinical-analysis-warning" role="alert">
                    <strong>Analýzy jsou v reportech vypnuté</strong>
                    <span>Necertifikované trendy, wearing-off výpočty a analytické grafy nejsou dostupné.</span>
                  </div>
                </fieldset>
                <button class="primary-button" type="button" @click="printSharedDiaryReport">Vytvořit report pro tisk</button>
              </section>
            </div>
          </div>
          <div v-else class="sync-warning-card">
            <strong>Kartotéka je prázdná</strong>
            <p>Žádný uživatel s vámi na tomto zařízení zatím nesdílí svůj deník.</p>
          </div>
          <p v-if="sharingMessage" class="storage-message">{{ sharingMessage }}</p>
        </section>

        <section v-else-if="activePanelId === 'sekce-navrhy'" class="panel panel-wide layout-profile">
          <div class="panel-heading">
            <div><p class="section-kicker">Datová správa</p><h2>Návrhy léčebných plánů</h2></div>
            <button class="ghost-button" type="button" :disabled="isSharingBusy" @click="refreshTreatmentProposals">Obnovit</button>
          </div>
          <div class="shared-record-tabs">
            <button :class="{ active: treatmentProposalFilter === 'all' }" @click="treatmentProposalFilter = 'all'">Všechny</button>
            <button :class="{ active: treatmentProposalFilter === 'draft' }" @click="treatmentProposalFilter = 'draft'">Rozepsané</button>
            <button :class="{ active: treatmentProposalFilter === 'pending' }" @click="treatmentProposalFilter = 'pending'">Čekající</button>
            <button :class="{ active: treatmentProposalFilter === 'approved' }" @click="treatmentProposalFilter = 'approved'">Schválené</button>
            <button :class="{ active: treatmentProposalFilter === 'declined' }" @click="treatmentProposalFilter = 'declined'">Zamítnuté</button>
            <button :class="{ active: treatmentProposalFilter === 'returned' }" @click="treatmentProposalFilter = 'returned'">Vrácené</button>
          </div>
          <div v-if="treatmentDraftItems.length && ['all', 'draft'].includes(treatmentProposalFilter)" class="share-status-list">
            <article v-for="draft in treatmentDraftItems" :key="draft.grantId" class="share-status-card">
              <div><strong>{{ draft.ownerName || 'Pacient' }}</strong><p class="panel-tip">Rozepsaný návrh · {{ draft.itemCount }} položek · uloženo {{ formatAdminTimestamp(draft.updatedAt) }}</p></div>
              <span class="status-chip status-chip-update">Rozepsáno</span>
              <div class="share-status-actions">
                <button class="primary-button" type="button" @click="continueTreatmentDraft(draft)">Pokračovat v úpravách</button>
                <button class="ghost-button utility-menu-item-danger" type="button" @click="discardTreatmentDraft(draft)">Smazat koncept</button>
              </div>
            </article>
          </div>
          <div v-if="filteredTreatmentProposals.length" class="share-status-list">
            <article v-for="proposal in filteredTreatmentProposals" :key="proposal.proposalId" class="share-status-card">
              <div>
                <strong>{{ proposal.ownerName || 'Pacient' }}</strong>
                <p class="panel-tip">Verze {{ proposal.version }}<template v-if="proposalParentVersion(proposal)"> · navazuje na verzi {{ proposalParentVersion(proposal) }}</template> · {{ formatAdminTimestamp(proposal.createdAt) }} · revize {{ proposal.baseRevision }} · {{ proposal.changes?.treatmentPlan?.length ?? '?' }} položek</p>
                <p v-if="proposal.changes?.doctorNote" class="panel-tip"><strong>Důvod:</strong> {{ proposal.changes.doctorNote }}</p>
                <p v-if="proposal.response?.comment" class="proposal-change-removed"><strong>Připomínka pacienta:</strong> {{ proposal.response.comment }}</p>
              </div>
              <span class="status-chip">{{ proposalStatusLabel(proposal.status) }}</span>
              <div v-if="proposal.status === 'pending'" class="share-status-actions">
                <button class="ghost-button utility-menu-item-danger" type="button" @click="withdrawTreatmentProposal(proposal)">Stáhnout návrh</button>
              </div>
              <div v-else-if="proposal.status === 'returned'" class="share-status-actions">
                <button class="primary-button" type="button" @click="reviseTreatmentProposal(proposal)">Přepracovat jako novou verzi</button>
              </div>
            </article>
          </div>
          <p v-else-if="!(treatmentDraftItems.length && ['all', 'draft'].includes(treatmentProposalFilter))" class="panel-tip">Pro vybraný filtr nejsou dostupné žádné návrhy.</p>
          <p v-if="sharingMessage" class="storage-message">{{ sharingMessage }}</p>
        </section>

        <section v-else-if="activePanelId === 'sekce-udaje'" class="panel panel-wide layout-profile">
          <div class="panel-heading">
            <div>
              <p class="section-kicker">Údaje</p>
              <h2>Denik a pacient</h2>
            </div>
          </div>
          <form class="day-form">
            <label>
              <span>Datum</span>
              <input
                :value="state.selectedDate"
                type="date"
                :max="getTodayKey()"
                @input="updateSelectedDate($event.target.value)"
              />
            </label>
            <label>
              <span>Jmeno pacienta</span>
              <input
                :value="state.patientName"
                type="text"
                maxlength="120"
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
                maxlength="4"
                pattern="[0-9]{4}"
                :aria-invalid="Boolean(birthYearValidationMessage)"
                placeholder="1958"
                @input="updateBirthYear($event.target.value)"
              />
              <small v-if="birthYearValidationMessage" class="form-error">{{ birthYearValidationMessage }}</small>
            </label>
          </form>

          <div class="backup-settings-card">
            <div class="panel-heading sync-settings-heading">
              <div>
                <p class="section-kicker">Zalohy</p>
                <h3>Automaticke lokalni zalohy</h3>
              </div>
              <button class="ghost-button" type="button" @click="createManualLocalBackup">Vytvorit ted</button>
            </div>
            <p class="panel-tip">Jedna automatická záloha denně, uchovává se posledních 7 verzí pouze v tomto zařízení.</p>
            <ul v-if="localBackupItems.length" class="backup-history-list">
              <li v-for="backup in localBackupItems" :key="backup.id">
                <span>{{ formatBackupTimestamp(backup.createdAt) }} · {{ backup.reason === "automatic" ? "automatická" : backup.reason === "before-restore" ? "před obnovou" : "ruční" }}</span>
                <button class="ghost-button" type="button" @click="restoreSelectedLocalBackup(backup)">Obnovit</button>
              </li>
            </ul>
            <p v-else class="panel-tip">Zatím není uložena žádná lokální záloha.</p>
          </div>

          <div class="backup-settings-card">
            <div class="panel-heading sync-settings-heading">
              <div>
                <p class="section-kicker">Upozorneni</p>
                <h3>Pripomenuti vyplneni deniku</h3>
              </div>
            </div>
            <div class="reminder-settings-row">
              <label class="reminder-toggle">
                <input
                  :checked="diaryReminderSettings.enabled"
                  :disabled="!medicationNotificationsSupported"
                  type="checkbox"
                  @change="updateDiaryReminderEnabled($event.target.checked)"
                />
                <span>Zapnout</span>
              </label>
              <label>
                <span>Cas pripomenuti</span>
                <input
                  :value="diaryReminderSettings.time"
                  :disabled="!diaryReminderSettings.enabled"
                  type="time"
                  @input="updateDiaryReminderTime($event.target.value)"
                />
              </label>
            </div>
            <p class="panel-tip">Upozornění se zobrazí jen tehdy, když chybí očekávané hodiny, kvalita spánku nebo hodnocení dne. Lokální režim vyžaduje běžící aplikaci.</p>
          </div>

          <div class="sync-warning-card">
            <strong>Uplny reset lokalnich dat</strong>
            <p>Smaže všechny denní záznamy, léčbu i údaje o pacientovi v tomto zařízení. Přihlášení a nastavení synchronizace zůstanou zachována.</p>
            <div class="sync-actions">
              <button class="ghost-button utility-menu-item-danger" type="button" @click="resetAllData">
                Smazat všechna lokální data
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
                <h2>Cloudová synchronizace</h2>
              </div>
              <p class="panel-tip">{{ syncStatusSummary }}</p>
            </div>

            <form class="stack-form">
              <label>
                <span>Adresa synchronizační služby</span>
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
                  placeholder="Přístupový token pro synchronizační službu"
                  @input="updateSyncSetting('apiToken', $event.target.value)"
                />
              </label>

              <div v-if="isFederatedAuthEnabled" class="auth-panel">
                <div class="auth-panel-copy">
                  <span>Přihlášení</span>
                  <p class="panel-tip">
                    {{ authSession?.user ? `Přihlášeno jako ${authSummary}.` : "Přihlaste se přes Google nebo Apple a bearer token už nebude potřeba." }}
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
                    Přihlásit přes Apple
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
                <span>Obnovovací kód</span>
                <input
                  v-model="recoverySecretInput"
                  type="text"
                  placeholder="Vložte existující obnovovací kód nebo vytvořte nový"
                />
              </label>
            </form>

            <div class="sync-actions">
              <button class="primary-button" type="button" :disabled="isSyncBusy" @click="initializeSync">
                Inicializovat cloudovou synchronizaci
              </button>
              <button class="ghost-button" type="button" :disabled="isSyncBusy" @click="pullSync">
                Stáhnout ze serveru
              </button>
              <button class="ghost-button" type="button" :disabled="isSyncBusy" @click="pushSync">
                Odeslat na server
              </button>
              <button class="ghost-button" type="button" :disabled="isSyncBusy" @click="persistRecoverySecret">
                Uložit obnovovací kód
              </button>
              <button class="ghost-button" type="button" :disabled="isSyncBusy" @click="generateNewRecoverySecret">
                Vytvořit obnovovací kód
              </button>
              <button class="ghost-button" type="button" :disabled="!canDisplayRecoveryQr" @click="openRecoveryTransfer">
                Zobrazit QR
              </button>
              <button
                v-if="canScanRecoveryQrLive"
                class="ghost-button"
                type="button"
                @click="openRecoveryCameraScanner"
              >
                Nacist QR kamerou
              </button>
              <button
                class="ghost-button"
                type="button"
                :disabled="!canImportRecoveryQr"
                @click="openRecoveryQrImageImport"
              >
                Nacist QR ze souboru
              </button>
            </div>

            <div class="sync-meta">
              <p class="panel-tip">Odvozeno z URL aplikace: {{ effectiveSyncEndpoint }}</p>
              <p v-if="isFederatedAuthEnabled" class="panel-tip">
                Přihlášení přes poskytovatele:
                {{ authConfig.googleEnabled ? "Google " : "" }}{{ authConfig.appleEnabled ? "Apple" : "" }}
              </p>
              <p class="panel-tip">Lokální klíč: {{ hasSyncMasterKeyStored ? "uložen" : "chybí" }}</p>
              <p class="panel-tip">Obnovovací kód: {{ hasRecoverySecretStored ? "uložen" : "chybí" }}</p>
              <p v-if="syncSettings.lastSyncMessage" class="panel-tip">{{ syncSettings.lastSyncMessage }}</p>
            </div>

            <section v-if="hasSyncIdentity" class="trusted-devices-card">
              <div class="conflict-audit-heading">
                <div>
                  <strong>Důvěryhodná zařízení</strong>
                  <p class="panel-tip">Aktuální zařízení {{ getCurrentDeviceId().slice(0, 8) }}.</p>
                </div>
                <button class="ghost-button" type="button" :disabled="isSyncBusy" @click="refreshTrustedDevices">Obnovit</button>
              </div>
              <div class="contact-actions">
                <button class="ghost-button" type="button" :disabled="isSyncBusy" @click="repeatDeviceRegistration">
                  Znovu overit registraci
                </button>
                <button class="ghost-button" type="button" :disabled="isSyncBusy" @click="registerAsNewDevice">
                  Registrovat jako nové zařízení
                </button>
              </div>
              <fieldset v-if="Object.keys(accountRoles.definitions).length" class="contact-keyring device-role-settings">
                <legend>Moje role</legend>
                <label v-for="(definition, role) in accountRoles.definitions" v-show="definition.selfAssignable" :key="`self-role-${role}`">
                  <input v-model="selfAssignableRoleDraft" type="checkbox" :value="role" />
                  {{ definition.label }}
                </label>
                <p class="panel-tip">Role pacienta a rodinného příslušníka si můžete nastavit sami. Lékaře a administrátora přiděluje pouze správce.</p>
                <button class="ghost-button" type="button" :disabled="!selfAssignableRoleDraft.length" @click="saveSelfAssignableRoles">Uložit moje role</button>
              </fieldset>
              <fieldset v-if="accountRoles.assignedRoles.length" class="contact-keyring device-role-settings">
                <legend>Aktivní role na tomto zařízení</legend>
                <label v-for="role in accountRoles.assignedRoles" :key="`active-role-${role}`">
                  <input v-model="currentDeviceRoleDraft" type="checkbox" :value="role" />
                  {{ accountRoles.definitions?.[role]?.label || role }}
                </label>
                <p class="panel-tip">Volba ovlivňuje režim UI pouze tohoto zařízení. Nemůže přidat roli, kterou účet nemá.</p>
                <button class="ghost-button" type="button" :disabled="!currentDeviceRoleDraft.length" @click="saveCurrentDeviceRoles">Uložit aktivní role</button>
              </fieldset>
              <div v-if="identityKeyMigration?.enabled" class="private-key-warning">
                <strong>Docasna migrace identitnich klicu je aktivni</strong>
                <span>Registrovaná zarizeni mohou po prokazani vlastnictvi sveho soukromeho klice aktualizovat identitni klic a stat se duveryhodnymi. Cizi deviceId ani klic bez dukazu server neprijme.</span>
                <button class="ghost-button utility-menu-item-danger" type="button" @click="closeIdentityKeyMigration">
                  Uzavrit migracni rezim
                </button>
              </div>
              <div v-if="identityKeyError" class="private-key-warning">
                <strong>Identitní klíč zařízení není dostupný</strong>
                <span>{{ identityKeyError }}</span>
                <span>Nouzova registrace je aktivni, ale rotace a predavani klicu tomuto zarizeni zatim nejsou bezpecne dostupne.</span>
              </div>
              <p v-else-if="identityKeyMigration" class="panel-tip">
                Migrace identitnich klicu byla uzavrena{{ identityKeyMigration.disabledByDeviceId ? ` zarizenim ${identityKeyMigration.disabledByDeviceId.slice(0, 8)}` : "" }}.
              </p>
              <ul v-if="trustedDevices.length" class="backup-history-list">
                <li v-for="device in trustedDevices" :key="device.deviceId">
                  <span>
                    {{ device.name }}
                    · {{ device.current ? "toto zarizeni" : device.trustStatus === "pending" ? "ceka na schvaleni" : device.revokedAt ? "odvolano" : "aktivni" }}
                    · {{ device.hasVerifiedKey ? "klic overen" : "bez klice" }}
                  </span>
                  <button class="ghost-button" type="button" @click="editTrustedDeviceAlias(device)">Přejmenovat</button>
                  <button
                    v-if="!device.current && !device.revokedAt"
                    class="ghost-button utility-menu-item-danger"
                    type="button"
                    @click="removeTrustedDevice(device)"
                  >Odpojit</button>
                </li>
              </ul>
              <div v-if="pendingDeviceKeyRequests.length" class="private-key-warning">
                <strong>Žádosti nových zařízení o hlavní klíč</strong>
                <div v-for="request in pendingDeviceKeyRequests" :key="request.requestId" class="contact-actions">
                  <span>Zařízení {{ request.targetDeviceId.slice(0, 8) }}</span>
                  <button class="ghost-button" type="button" @click="approveDeviceKeyRequest(request)">Schvalit jednorazove predani</button>
                </div>
                <span>Predava se pouze master key zasifrovany verejnym klicem ciloveho zarizeni, nikoli recovery secret.</span>
              </div>
              <fieldset class="contact-keyring">
                <legend>Cile pristi rotace</legend>
                <label v-for="device in trustedDevices.filter((item) => !item.current && !item.revokedAt)" :key="`rotation-${device.deviceId}`">
                  <input v-model="rotationTargetDeviceIds" type="checkbox" :value="device.deviceId" :disabled="!device.hasVerifiedKey || device.trustStatus !== 'trusted'" />
                  {{ device.name }} · {{ device.deviceId.slice(0, 8) }}
                  <span v-if="!device.hasVerifiedKey">(nejprve musi overit verejny klic)</span>
                  <span v-else-if="device.trustStatus === 'pending'">(ceka na potvrzeni prevzeti)</span>
                </label>
                <p class="panel-tip">Nevybrana zarizeni novy klic neobdrzi a po rotaci budou nabidnuta k odvolani.</p>
              </fieldset>
              <button class="ghost-button utility-menu-item-danger" type="button" :disabled="isSyncBusy" @click="rotateEncryptionKey">
                Rotovat klíč a předat ostatním zařízením
              </button>
            </section>

            <section v-if="conflictAuditItems.length" class="conflict-audit">
              <div class="conflict-audit-heading">
                <div>
                  <strong>Historie konfliktu</strong>
                  <p class="panel-tip">{{ conflictAuditCountLabel }} na tomto zarizeni, bez zdravotnich dat.</p>
                </div>
                <button class="ghost-button" type="button" @click="clearConflictHistory">
                  Smazat historii
                </button>
              </div>
              <ul class="conflict-audit-list">
                <li v-for="item in conflictAuditItems" :key="item.id">
                  <span :class="['status-chip', item.status === 'resolved' ? 'status-chip-ready' : 'status-chip-update']">
                    {{ item.status === "resolved" ? "Vyreseno" : item.status === "failed" ? "Selhalo" : "Zjisteno" }}
                  </span>
                  <span>{{ formatConflictTimestamp(item.detectedAt) }}</span>
                  <span>revize {{ item.baseRevision }} → {{ item.remoteRevision }}<template v-if="item.resolvedRevision !== null"> → {{ item.resolvedRevision }}</template></span>
                  <span>zarizeni {{ item.deviceId.slice(0, 8) }}</span>
                </li>
              </ul>
            </section>

            <div v-if="generatedRecoverySecret" class="sync-warning-card">
              <strong>Ulozte si recovery secret</strong>
              <p>{{ generatedRecoverySecret }}</p>
              <span>Bez tohoto tajemství nepůjde na novém zařízení data dešifrovat.</span>
            </div>
          </div>
        </section>

        <section v-else-if="activePanelId === 'sekce-admin'" class="panel panel-wide layout-profile">
          <div class="panel-heading">
            <div>
              <p class="section-kicker">Administrace</p>
              <h2>Stav cloudové instalace</h2>
            </div>
            <button class="ghost-button" type="button" :disabled="isAdminBusy" @click="refreshAdminConsole()">
              {{ isAdminBusy ? "Načítám…" : "Obnovit stav" }}
            </button>
          </div>

          <p v-if="adminError" class="sync-warning-card">{{ adminError }}</p>
          <template v-if="adminStatus">
            <div class="admin-status-grid">
              <article class="admin-status-card">
                <span>Cloud Run</span>
                <strong>{{ adminStatus.cloudRun?.ready ? "V pořádku" : "Vyžaduje kontrolu" }}</strong>
                <small>{{ adminStatus.service }} · {{ adminStatus.region }}</small>
                <small>Revize: {{ adminStatus.cloudRun?.latestReadyRevision || adminStatus.revision || "neuvedena" }}</small>
              </article>
              <article class="admin-status-card">
                <span>Poslední aktualizace</span>
                <strong>{{ adminStatus.latestBuild?.status || "Bez záznamu" }}</strong>
                <small>{{ formatAdminTimestamp(adminStatus.latestBuild?.finishTime || adminStatus.latestBuild?.createTime) }}</small>
                <a v-if="adminStatus.latestBuild?.logUrl" :href="adminStatus.latestBuild.logUrl" target="_blank" rel="noopener noreferrer">Otevřít protokol sestavení</a>
              </article>
              <article class="admin-status-card">
                <span>Databáze a migrace</span>
                <strong>{{ adminStatus.sqlInstance || "Lokální SQLite" }}</strong>
                <small>Schéma: {{ adminStatus.schemaVersion || "automaticky spravované" }}</small>
                <small>Strategie: bezpečné dopředné migrace před převodem provozu</small>
              </article>
              <article class="admin-status-card">
                <span>Gmail</span>
                <strong>{{ adminStatus.gmail?.enabled ? "Odesílání zapnuto" : "Vypnuto" }}</strong>
                <small>{{ adminStatus.gmail?.oauthVerified ? "OAuth aplikace je označena jako ověřená" : "Ověření OAuth je třeba zkontrolovat v Google Cloud" }}</small>
              </article>
              <article class="admin-status-card">
                <span>Administrátorská upozornění</span>
                <strong>{{ adminStatus.alerts?.configured ? "Příjemce nastaven" : "Nenastavena" }}</strong>
                <small>{{ adminStatus.alerts?.recipient || "Chybí e-mail příjemce" }}</small>
              </article>
            </div>

            <div v-if="adminStatus.warnings?.length" class="sync-warning-card">
              <strong>Upozornění</strong>
              <ul><li v-for="warning in adminStatus.warnings" :key="warning">{{ warning }}</li></ul>
            </div>

            <section class="sync-settings-card">
              <div class="panel-heading sync-settings-heading">
                <div>
                  <h3>Uživatelé a role</h3>
                  <p class="panel-tip">Účet může mít více rolí. Aktivní role si následně volí samostatně na každém důvěryhodném zařízení.</p>
                </div>
                <label class="admin-user-search">
                  <span>Vyhledat uživatele</span>
                  <input v-model="adminUserSearch" type="search" placeholder="Jméno, e-mail nebo ID" />
                </label>
              </div>

              <div v-if="adminUsers.length" class="admin-role-layout">
                <aside class="admin-user-index" aria-label="Uživatelé">
                  <button
                    v-for="user in filteredAdminUsers"
                    :key="user.userId"
                    class="shared-record-person"
                    :class="{ 'shared-record-person-active': user.userId === selectedAdminUserId }"
                    type="button"
                    @click="selectAdminUser(user)"
                  >
                    <strong>{{ user.name || user.email }}</strong>
                    <span>{{ user.email }}</span>
                    <small>{{ user.roles.map((role) => adminRoleDefinitions[role]?.label || role).join(' · ') }}</small>
                  </button>
                  <p v-if="!filteredAdminUsers.length" class="panel-tip">Vyhledávání neodpovídá žádnému účtu.</p>
                </aside>

                <div v-if="selectedAdminUser" class="admin-role-editor">
                  <div>
                    <h4>{{ selectedAdminUser.name || selectedAdminUser.email }}</h4>
                    <p class="panel-tip">{{ selectedAdminUser.email }} · {{ selectedAdminUser.userId }}</p>
                  </div>
                  <fieldset class="contact-keyring">
                    <legend>Přidělené role</legend>
                    <label v-for="(definition, role) in adminRoleDefinitions" :key="role">
                      <input v-model="adminRoleDraft" type="checkbox" :value="role" />
                      <span><strong>{{ definition.label }}</strong> · výchozí režim {{ definition.primaryView === 'diary' ? 'deník' : definition.primaryView === 'records' ? 'kartotéka' : 'administrace' }}<template v-if="definition.contactLimit"> · limit {{ definition.contactLimit }} kontaktů</template>{{ definition.selfAssignable ? " · uživatel může změnit sám" : " · přiděluje správce" }}</span>
                    </label>
                  </fieldset>
                  <button class="primary-button" type="button" :disabled="isAdminBusy || !adminRoleDraft.length" @click="saveAdminUserRoles">Uložit role</button>
                </div>
              </div>
              <p v-else class="panel-tip">Zatím nejsou evidované žádné uživatelské účty.</p>
            </section>

            <section class="sync-settings-card">
              <div class="panel-heading sync-settings-heading">
                <div>
                  <h3>Cloud SQL zálohy</h3>
                  <p class="panel-tip">Automatické zálohy se drží v nastaveném limitu. Ručních záloh může být nejvýše {{ adminStatus.backupPolicy?.manualLimit ?? 3 }}.</p>
                </div>
                <button class="primary-button" type="button" :disabled="isAdminBusy || !adminStatus.sqlInstance" @click="createAdminBackup">
                  Vytvořit zálohu
                </button>
              </div>
              <ul v-if="adminStatus.backups?.length" class="backup-history-list">
                <li v-for="backup in adminStatus.backups" :key="backup.id">
                  <div>
                    <strong>Záloha {{ backup.id }}</strong>
                    <span>{{ backup.type === "ON_DEMAND" ? "ruční" : "automatická" }} · {{ backup.status }}</span>
                    <small>{{ formatAdminTimestamp(backup.endTime || backup.startTime) }}</small>
                  </div>
                  <button v-if="backup.type === 'ON_DEMAND'" class="ghost-button utility-menu-item-danger" type="button" :disabled="isAdminBusy" @click="removeAdminBackup(backup)">Smazat</button>
                </li>
              </ul>
              <p v-else class="panel-tip">Cloud SQL zatím nevrátil žádnou zálohu.</p>
            </section>
          </template>
        </section>

        <section v-else-if="activePanelId === 'sekce-kontakty'" class="panel panel-wide layout-profile">
          <div class="panel-heading">
            <div>
              <p class="section-kicker">Kontakty</p>
              <h2>Prijemci reportu</h2>
            </div>
            <button class="ghost-button" type="button" @click="editContact()">Nový kontakt</button>
          </div>
          <p class="panel-tip">Uložené kontakty můžete při sdílení reportu vybrat bez opakovaného zadávání údajů.</p>

          <div v-if="contacts.length" class="backup-history-list contact-list">
            <button
              v-for="contact in contacts"
              :key="contact.id"
              class="ghost-button contact-list-item"
              type="button"
              :aria-current="contactEditor.id === contact.id ? 'true' : undefined"
              @click="editContact(contact)"
            >
              <strong>{{ contact.name }}</strong>
              <span>{{ contact.email }} · {{ contact.keyFingerprint ? "veřejný klíč" : "heslové šifrování" }}</span>
            </button>
          </div>
          <p v-else class="panel-tip">Zatím nemáte uložený žádný kontakt.</p>

          <fieldset class="contact-keyring contact-editor">
            <legend>{{ contactEditor.id ? "Upravit kontakt" : "Nový kontakt" }}</legend>
            <label>
              <span>Jmeno</span>
              <input v-model="contactEditor.name" type="text" maxlength="120" placeholder="MUDr. Novak" />
            </label>
            <label>
              <span>E-mail</span>
              <input v-model="contactEditor.email" type="email" maxlength="254" placeholder="lekar@example.cz" />
            </label>
            <label>
              <span>Verejny klic prijemce (PEM)</span>
              <textarea v-model="contactEditor.publicKeyPem" rows="6" placeholder="-----BEGIN PUBLIC KEY-----"></textarea>
            </label>
            <div class="contact-actions">
              <button class="primary-button" type="button" @click="storeContact">Uložit kontakt</button>
              <button class="ghost-button" type="button" @click="createKeysForContact">Vygenerovat klice</button>
              <button v-if="contactEditor.id" class="ghost-button utility-menu-item-danger" type="button" @click="removeContact">Smazat</button>
            </div>
            <div v-if="generatedContactPrivateKey" class="private-key-warning">
              <strong>Soukromy klic se neuklada.</strong>
              <span>Stáhněte jej nyní a předejte příjemci bezpečným kanálem. Po opuštění editoru jej aplikace neobnoví.</span>
              <button class="ghost-button" type="button" @click="downloadGeneratedPrivateKey">Stahnout soukromy klic</button>
            </div>
          </fieldset>
        </section>

        <HourMatrix
          v-else-if="activePanelId === 'sekce-matice'"
          class="layout-matrix"
          :hours="selectedEntry.hours"
          :hour-records="selectedEntry.hourRecords"
          :selected-date="state.selectedDate"
          :current-time="quickCaptureNow"
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
          :selected-date="state.selectedDate"
          :current-time="quickCaptureNow"
          :reminder-enabled="medicationReminderSettings.enabled"
          :reminder-lead-minutes="medicationReminderSettings.leadMinutes"
          :notification-permission="medicationNotificationPermission"
          :notifications-supported="medicationNotificationsSupported"
          :web-push-available="webPushConfig.enabled && canUseWebPush()"
          :web-push-status="webPushStatus"
          :web-push-message="webPushMessage"
          @add-plan-item="addTreatmentPlanItem"
          @end-plan-item="endTreatmentPlanItem"
          @remove-recorded-medication="removeMedication"
          @update-reminder-enabled="setMedicationRemindersEnabled"
          @update-reminder-lead-minutes="updateMedicationReminderLeadMinutes"
        />

        <DailyTimeline
          v-else-if="activePanelId === 'sekce-osa'"
          class="layout-timeline"
          :entries="state.entries"
          :selected-date="state.selectedDate"
          @select-date="updateSelectedDate"
        />
        <DaySummary
          v-else-if="canUseClinicalAnalyses && activePanelId === 'sekce-souhrn'"
          class="layout-summary"
          :entry="selectedEntry"
          :entries="state.entries"
          :selected-date="state.selectedDate"
          @open-hour-matrix="activePanelId = 'sekce-matice'"
          @open-daily-overview="activePanelId = 'sekce-prehled'"
        />
        <LongTermTrends
          v-else-if="canUseClinicalAnalyses && activePanelId === 'sekce-trendy'"
          class="layout-trends"
          :entries="state.entries"
          :treatment-plan="sortedTreatmentPlan"
          :selected-date="state.selectedDate"
        />
        <ManualSection v-else-if="activePanelId === 'sekce-manualy'" class="layout-manuals" />
        <section v-else class="panel panel-wide home-panel">
          <div class="panel-heading">
            <div>
              <p class="section-kicker">Rychlý zápis</p>
              <h2>Zapsat aktualni stav</h2>
            </div>
          </div>
          <div class="floating-quick-capture quick-capture-panel">
            <div class="floating-quick-capture-copy">
              <p class="panel-tip">
                Rychlý zápis vždy zaznamená aktuální okamžik.
              </p>
              <p v-if="currentHourRecordCount > 1" class="panel-tip">
                Pro tuto hodinu už existuje {{ currentHourRecordCount }} záznamů. Zobrazuje se poslední.
              </p>
            </div>
            <div class="floating-quick-capture-form">
              <div class="quick-capture-row">
                <p class="panel-tip">
                  Cas zapisu: <strong>{{ currentTimeLabel }}</strong> · zapis do hodiny
                  <strong>{{ currentHourLabel }}</strong>
                </p>
              </div>

              <div class="quick-capture-row">
                <label>
                  <span>Aktualni stav</span>
                  <select
                    :value="selectedStateKey"
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
                  @click="writeCurrentState"
                >
                  Zapsat {{ quickCaptureStateLabel }}
                </button>
              </div>

              <div v-for="dose in availablePlannedDoses" :key="dose.item.id" class="quick-capture-row">
                <p class="quick-dose-copy">
                  <span>Dávka z plánu</span>
                  <strong>{{ dose.item.time }} · {{ dose.item.name }} · {{ dose.item.dose }}</strong>
                  <small>{{ dose.status.label }}</small>
                </p>
                <button
                  class="ghost-button"
                  type="button"
                  @click="recordMedicationFromPlan(dose.item)"
                >
                  Zapsat {{ dose.item.name }} {{ dose.item.dose }} ted
                </button>
              </div>
              <p v-if="availablePlannedDoses.length === 0" class="panel-tip">
                Nyní není k zápisu žádná plánovaná dávka.
              </p>
            </div>
          </div>
          <div class="timeline-capture-panel">
            <QuickCaptureTimeline
              v-model="timelineSelectedTime"
              :current-time="quickCaptureNow"
            />
            <div class="floating-quick-capture-form">
              <p class="panel-tip">
                Zpetny zapis pro hodinu
                <strong>{{ getTrackableHourLabel(timelineSelectedTime) }}:00–{{ getTrackableHourLabel(timelineSelectedTime) }}:59</strong>
              </p>
              <div class="quick-capture-row">
                <label>
                  <span>Stav pro celou hodinu</span>
                  <select :value="selectedStateKey" @input="updateSelectedStateKey($event.target.value)">
                    <option v-for="item in HOUR_STATES" :key="item.key" :value="item.key">
                      {{ item.label }}
                    </option>
                  </select>
                </label>
                <button class="primary-button" type="button" @click="writeTimelineState">
                  Zapsat stav pro hodinu
                </button>
              </div>
              <div v-for="dose in timelineMedicationDoses" :key="`timeline-${dose.item.id}`" class="quick-capture-row">
                <p class="quick-dose-copy">
                  <span>Chybějící dávka z plánu</span>
                  <strong>{{ dose.item.time }} · {{ dose.item.name }} · {{ dose.item.dose }}</strong>
                </p>
                <button
                  class="ghost-button"
                  type="button"
                  @click="recordMedicationFromPlan(dose.item, timelineSelectedTime, 'timeline')"
                >
                  Zapsat uziti v {{ timelineSelectedTime.toTimeString().slice(0, 5) }}
                </button>
              </div>
            </div>
          </div>
          <DailyTimeline
            class="layout-timeline"
            :entries="state.entries"
            :selected-date="getTodayKey()"
            :days="1"
            :treatment-plan="state.treatmentPlan"
            :current-time="quickCaptureNow"
            compact
            @select-date="updateSelectedDate"
          />
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
        v-if="isIntegrityReportOpen"
        class="diagnostic-dialog-backdrop"
        role="presentation"
        @click.self="closeIntegrityReportPanel"
      >
        <section
          class="diagnostic-dialog"
          role="dialog"
          aria-modal="true"
          aria-labelledby="integrity-report-dialog-title"
        >
          <div class="diagnostic-dialog-header">
            <div>
              <p class="section-kicker">Diagnostika</p>
              <h2 id="integrity-report-dialog-title">Kontrola integrity dat</h2>
              <p class="panel-tip">{{ integrityHeadline }}</p>
            </div>
            <button class="ghost-button" type="button" @click="closeIntegrityReportPanel">
              Zavrit
            </button>
          </div>

          <div class="sync-warning-card">
            <strong>Souhrn</strong>
            <p>
              Vybrany den: {{ integritySummary.selectedDate }} ·
              dni celkem: {{ integritySummary.entryCount }} ·
              neprazdnych dni: {{ integritySummary.nonEmptyEntryCount }}
            </p>
            <p>
              davky: {{ integritySummary.medicationCount }} ·
              hodinove zaznamy: {{ integritySummary.hourRecordCount }} ·
              smazane dny: {{ integritySummary.deletedDateCount }} ·
              smazane davky: {{ integritySummary.deletedMedicationCount }}
            </p>
            <p>
              chyby: {{ integritySummary.issueCount }} ·
              varovani: {{ integritySummary.warningCount }}
            </p>
          </div>

          <div v-if="integrityReport.issues.length" class="bootstrap-history">
            <p class="boot-history-title">Chyby</p>
            <ol class="bootstrap-history-list">
              <li
                v-for="(issue, index) in integrityReport.issues"
                :key="`integrity-error-${index}`"
                class="bootstrap-history-item"
                data-level="error"
              >
                <span class="bootstrap-history-time">{{ issue.dateKey ?? issue.scope ?? "state" }}</span>
                <p class="bootstrap-history-message">
                  {{ issue.message }}
                  <template v-if="issue.hourLabel"> · hodina {{ issue.hourLabel }}</template>
                  <template v-if="issue.value"> · {{ issue.value }}</template>
                </p>
              </li>
            </ol>
          </div>

          <div v-if="integrityReport.warnings.length" class="bootstrap-history">
            <p class="boot-history-title">Varovani</p>
            <ol class="bootstrap-history-list">
              <li
                v-for="(warning, index) in integrityReport.warnings"
                :key="`integrity-warning-${index}`"
                class="bootstrap-history-item"
                data-level="warning"
              >
                <span class="bootstrap-history-time">{{ warning.dateKey ?? warning.scope ?? "state" }}</span>
                <p class="bootstrap-history-message">
                  {{ warning.message }}
                  <template v-if="warning.hourLabel"> · hodina {{ warning.hourLabel }}</template>
                  <template v-if="warning.value"> · {{ warning.value }}</template>
                </p>
              </li>
            </ol>
          </div>

          <div v-if="!integrityReport.issues.length && !integrityReport.warnings.length" class="sync-warning-card">
            <strong>Vysledek</strong>
            <p>Aktualni lokalni data prosla auditem bez nalezenych problemu.</p>
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
