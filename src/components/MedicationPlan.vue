<script setup>
import { computed, reactive, ref, watch } from "vue";
import { getTodayKey, isTreatmentPlanItemActiveOnDate } from "../domain/diary.js";
import { analyzeMedicationAdherence } from "../services/adherence.js";
import { buildMedicationDuplicateKey, validateMedicationInput } from "../services/validation.js";

const props = defineProps({
  treatmentPlan: {
    type: Array,
    required: true,
  },
  recordedMedications: {
    type: Array,
    required: true,
  },
  selectedDate: {
    type: String,
    required: true,
  },
  currentTime: {
    type: Date,
    required: true,
  },
  reminderEnabled: {
    type: Boolean,
    required: true,
  },
  reminderLeadMinutes: {
    type: Number,
    required: true,
  },
  notificationPermission: {
    type: String,
    required: true,
  },
  notificationsSupported: {
    type: Boolean,
    required: true,
  },
  webPushAvailable: {
    type: Boolean,
    required: true,
  },
  webPushStatus: {
    type: String,
    required: true,
  },
  webPushMessage: {
    type: String,
    required: true,
  },
});

const emit = defineEmits([
  "add-plan-item",
  "end-plan-item",
  "remove-recorded-medication",
  "update-reminder-enabled",
  "update-reminder-lead-minutes",
]);

const form = reactive({
  name: "",
  dose: "",
  time: "08:00",
  validFrom: props.selectedDate,
  validTo: "",
});
const errors = reactive({});
const formMessage = ref("");
const adherence = computed(() =>
  analyzeMedicationAdherence({
    treatmentPlan: props.treatmentPlan,
    recordedMedications: props.recordedMedications,
    selectedDate: props.selectedDate,
    todayDate: getTodayKey(),
    now: props.currentTime,
  }),
);
const historicalPlanItems = computed(() =>
  props.treatmentPlan
    .filter((item) => !isTreatmentPlanItemActiveOnDate(item, props.selectedDate))
    .sort((left, right) =>
      (right.validTo || "9999-12-31").localeCompare(left.validTo || "9999-12-31"),
    ),
);

watch(
  () => props.selectedDate,
  (dateKey) => {
    form.validFrom = dateKey;
    form.validTo = "";
  },
);

function periodsOverlap(left, right) {
  const leftStart = left.validFrom || "0000-01-01";
  const leftEnd = left.validTo || "9999-12-31";
  const rightStart = right.validFrom || "0000-01-01";
  const rightEnd = right.validTo || "9999-12-31";
  return leftStart <= rightEnd && rightStart <= leftEnd;
}

function submitForm() {
  const validation = validateMedicationInput(form);
  Object.keys(errors).forEach((field) => delete errors[field]);
  Object.assign(errors, validation.errors);
  formMessage.value = "";
  if (!validation.isValid) {
    return;
  }
  if (form.validTo && form.validTo < form.validFrom) {
    formMessage.value = "Konec platnosti nesmi byt pred jejim zacatkem.";
    return;
  }

  const duplicateKey = buildMedicationDuplicateKey(validation.value);
  const candidate = { ...validation.value, validFrom: form.validFrom, validTo: form.validTo };
  if (props.treatmentPlan.some(
    (item) => buildMedicationDuplicateKey(item) === duplicateKey && periodsOverlap(item, candidate),
  )) {
    formMessage.value = "Stejna davka se stejnym casem uz v tomto obdobi existuje.";
    return;
  }

  emit("add-plan-item", candidate);
  form.name = "";
  form.dose = "";
  form.time = "08:00";
  form.validTo = "";
}

function getRecordedMedicationDetail(medication) {
  const plannedDose = adherence.value.plannedDoses.find(
    (dose) => dose.recordedMedication?.id === medication.id,
  );
  return {
    plannedTime: plannedDose?.planItem.time ?? "neplanovana",
    actualTime: medication.takenAt
      ? new Intl.DateTimeFormat("cs-CZ", { hour: "2-digit", minute: "2-digit" }).format(new Date(medication.takenAt))
      : medication.time,
    recordedAt: medication.recordedAt
      ? new Intl.DateTimeFormat("cs-CZ", { dateStyle: "short", timeStyle: "short" }).format(new Date(medication.recordedAt))
      : "neznamy",
    statusKey: plannedDose?.statusKey ?? "unplanned",
    statusLabel: plannedDose?.statusLabel ?? "Neplanovana davka",
  };
}
</script>

<template>
  <section class="panel">
    <div class="panel-heading">
      <div>
        <p class="section-kicker">Lecba</p>
        <h2>Plan medikace</h2>
      </div>
    </div>

    <form class="stack-form" @submit.prevent="submitForm">
      <label>
        <span>Nazev</span>
        <input v-model="form.name" type="text" maxlength="100" required placeholder="Levodopa" :aria-invalid="Boolean(errors.name)" />
        <small v-if="errors.name" class="form-error">{{ errors.name }}</small>
      </label>

      <label>
        <span>Davka</span>
        <input v-model="form.dose" type="text" maxlength="50" required placeholder="100 mg" :aria-invalid="Boolean(errors.dose)" />
        <small v-if="errors.dose" class="form-error">{{ errors.dose }}</small>
      </label>

      <label>
        <span>Cas</span>
        <input v-model="form.time" type="time" required :aria-invalid="Boolean(errors.time)" />
        <small v-if="errors.time" class="form-error">{{ errors.time }}</small>
      </label>

      <label>
        <span>Platnost od</span>
        <input v-model="form.validFrom" type="date" required />
      </label>

      <label>
        <span>Platnost do (volitelne)</span>
        <input v-model="form.validTo" type="date" :min="form.validFrom" />
      </label>

      <button class="primary-button" type="submit">Pridat verzi planu</button>
      <p v-if="formMessage" class="form-error" role="alert">{{ formMessage }}</p>
    </form>

    <p class="panel-tip">Pro vybrany den se pouziji pouze davky, jejichz obdobi platnosti tento den zahrnuje.</p>

    <div class="medication-reminder-card">
      <div>
        <strong>Pripomenuti leku</strong>
        <p v-if="notificationsSupported" class="panel-tip">
          Systemova upozorneni ve Firefoxu a Chromu. Opravneni:
          {{ notificationPermission === "granted" ? "povoleno" : notificationPermission === "denied" ? "zakazano" : "nezadano" }}.
        </p>
        <p v-else class="form-error">
          Tento prohlizec nebo nezabezpecene HTTP pripojeni systemova upozorneni nepodporuje.
        </p>
      </div>
      <label class="reminder-toggle">
        <input
          :checked="reminderEnabled"
          :disabled="!notificationsSupported"
          type="checkbox"
          @change="emit('update-reminder-enabled', $event.target.checked)"
        />
        <span>Zapnout</span>
      </label>
      <label>
        <span>Upozornit</span>
        <select
          :value="reminderLeadMinutes"
          :disabled="!reminderEnabled"
          @change="emit('update-reminder-lead-minutes', Number($event.target.value))"
        >
          <option :value="0">V cas davky</option>
          <option :value="5">5 minut predem</option>
          <option :value="10">10 minut predem</option>
          <option :value="15">15 minut predem</option>
          <option :value="30">30 minut predem</option>
        </select>
      </label>
      <p class="panel-tip medication-reminder-note">
        <template v-if="webPushStatus === 'active'">
          Web Push je aktivni. Obecna pripominka muze dorazit i po uplnem zavreni aplikace.
        </template>
        <template v-else-if="webPushAvailable">
          Lokalni rezim vyzaduje otevrenou aplikaci. Web Push ceka na prihlaseni nebo dokonceni registrace.
        </template>
        <template v-else>
          Lokalni rezim vyzaduje otevrenou aplikaci. Serverovy Web Push zatim neni dostupny.
        </template>
        <span v-if="webPushMessage"> {{ webPushMessage }}</span>
      </p>
    </div>

    <div class="adherence-summary" aria-label="Souhrn dodrzeni lecby">
      <div>
        <strong>{{ adherence.summary.takenCount }}/{{ adherence.summary.plannedCount }}</strong>
        <span>uzitych planovanych davek</span>
      </div>
      <div>
        <strong>{{ adherence.summary.missedCount }}</strong>
        <span>vynechanych</span>
      </div>
      <div>
        <strong>{{ adherence.summary.upcomingCount }}</strong>
        <span>cekajicich</span>
      </div>
      <div>
        <strong>{{ adherence.summary.adherencePercent === null ? "—" : `${adherence.summary.adherencePercent} %` }}</strong>
        <span>adherence uzavrenych davek</span>
      </div>
    </div>

    <ul class="list adherence-list">
      <li v-for="dose in adherence.plannedDoses" :key="dose.planItem.id">
        <div class="medication-copy">
          <strong>{{ dose.planItem.time }} - {{ dose.planItem.name }}</strong>
          <span>
            {{ dose.planItem.dose }}
            · platnost {{ dose.planItem.validFrom || "bez zacatku" }} – {{ dose.planItem.validTo || "bez konce" }}
            <template v-if="dose.recordedMedication">
              · skutecne {{ dose.recordedMedication.time }}
            </template>
          </span>
        </div>

        <span :class="['adherence-status', `adherence-status-${dose.statusKey}`]">
          {{ dose.statusLabel }}
        </span>
        <button type="button" @click="emit('end-plan-item', dose.planItem.id, selectedDate)">
          Ukoncit po tomto dni
        </button>
      </li>
    </ul>

    <details v-if="historicalPlanItems.length" class="plan-history">
      <summary>Ostatni verze planu ({{ historicalPlanItems.length }})</summary>
      <ul class="list">
        <li v-for="item in historicalPlanItems" :key="item.id">
          <div class="medication-copy">
            <strong>{{ item.time }} - {{ item.name }}</strong>
            <span>{{ item.dose }} · {{ item.validFrom || "bez zacatku" }} – {{ item.validTo || "bez konce" }}</span>
          </div>
        </li>
      </ul>
    </details>

    <div class="panel-heading medication-record-heading">
      <div>
        <p class="section-kicker">Aktualni den</p>
        <h3>Vsechny zapsane davky</h3>
      </div>
    </div>

    <ul class="list">
      <li v-for="medication in recordedMedications" :key="medication.id">
        <div class="medication-copy">
          <strong>{{ medication.time }} - {{ medication.name }}</strong>
          <span>{{ medication.dose }}</span>
          <span>
            Plan {{ getRecordedMedicationDetail(medication).plannedTime }}
            · skutecne {{ getRecordedMedicationDetail(medication).actualTime }}
            · zapsano {{ getRecordedMedicationDetail(medication).recordedAt }}
          </span>
        </div>

        <span :class="['adherence-status', `adherence-status-${getRecordedMedicationDetail(medication).statusKey}`]">
          {{ getRecordedMedicationDetail(medication).statusLabel }}
        </span>
        <button type="button" @click="emit('remove-recorded-medication', medication.id)">Odebrat</button>
      </li>
    </ul>
  </section>
</template>
