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
    formMessage.value = "Konec platnosti nesmí být před jejím začátkem.";
    return;
  }

  const duplicateKey = buildMedicationDuplicateKey(validation.value);
  const candidate = { ...validation.value, validFrom: form.validFrom, validTo: form.validTo };
  if (props.treatmentPlan.some(
    (item) => buildMedicationDuplicateKey(item) === duplicateKey && periodsOverlap(item, candidate),
  )) {
    formMessage.value = "Stejná dávka se stejným časem už v tomto období existuje.";
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
    plannedTime: plannedDose?.planItem.time ?? "neplánovaná",
    actualTime: medication.takenAt
      ? new Intl.DateTimeFormat("cs-CZ", { hour: "2-digit", minute: "2-digit" }).format(new Date(medication.takenAt))
      : medication.time,
    recordedAt: medication.recordedAt
      ? new Intl.DateTimeFormat("cs-CZ", { dateStyle: "short", timeStyle: "short" }).format(new Date(medication.recordedAt))
      : "neznámý",
    statusKey: plannedDose?.statusKey ?? "unplanned",
    statusLabel: plannedDose?.statusLabel ?? "Neplánovaná dávka",
  };
}
</script>

<template>
  <section class="panel">
    <div class="panel-heading">
      <div>
        <p class="section-kicker">Léčba</p>
        <h2>Plán medikace</h2>
      </div>
    </div>

    <form class="stack-form" @submit.prevent="submitForm">
      <label>
        <span>Název</span>
        <input v-model="form.name" type="text" maxlength="100" required placeholder="Levodopa" :aria-invalid="Boolean(errors.name)" />
        <small v-if="errors.name" class="form-error">{{ errors.name }}</small>
      </label>

      <label>
        <span>Dávka</span>
        <input v-model="form.dose" type="text" maxlength="50" required placeholder="100 mg" :aria-invalid="Boolean(errors.dose)" />
        <small v-if="errors.dose" class="form-error">{{ errors.dose }}</small>
      </label>

      <label>
        <span>Čas</span>
        <input v-model="form.time" type="time" required :aria-invalid="Boolean(errors.time)" />
        <small v-if="errors.time" class="form-error">{{ errors.time }}</small>
      </label>

      <label>
        <span>Platnost od</span>
        <input v-model="form.validFrom" type="date" required />
      </label>

      <label>
        <span>Platnost do (volitelně)</span>
        <input v-model="form.validTo" type="date" :min="form.validFrom" />
      </label>

      <button class="primary-button" type="submit">Přidat verzi plánu</button>
      <p v-if="formMessage" class="form-error" role="alert">{{ formMessage }}</p>
    </form>

    <p class="panel-tip">Pro vybraný den se použijí pouze dávky, jejichž období platnosti tento den zahrnuje.</p>

    <div class="medication-reminder-card">
      <div>
        <strong>Připomenutí léku</strong>
        <p v-if="notificationsSupported" class="panel-tip">
          Systémová upozornění ve Firefoxu a Chromu. Oprávnění:
          {{ notificationPermission === "granted" ? "povoleno" : notificationPermission === "denied" ? "zakázáno" : "nezadáno" }}.
        </p>
        <p v-else class="form-error">
          Tento prohlížeč nebo nezabezpečené HTTP připojení systémová upozornění nepodporuje.
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
          <option :value="0">V čas dávky</option>
          <option :value="5">5 minut předem</option>
          <option :value="10">10 minut předem</option>
          <option :value="15">15 minut předem</option>
          <option :value="30">30 minut předem</option>
        </select>
      </label>
      <p class="panel-tip medication-reminder-note">
        <template v-if="webPushStatus === 'active'">
          Web Push je aktivní. Obecná připomínka může dorazit i po úplném zavření aplikace.
        </template>
        <template v-else-if="webPushAvailable">
          Lokální režim vyžaduje otevřenou aplikaci. Web Push čeká na přihlášení nebo dokončení registrace.
        </template>
        <template v-else>
          Lokální režim vyžaduje otevřenou aplikaci. Serverový Web Push zatím není dostupný.
        </template>
        <span v-if="webPushMessage"> {{ webPushMessage }}</span>
      </p>
    </div>

    <div class="adherence-summary" aria-label="Souhrn dodržení léčby">
      <div>
        <strong>{{ adherence.summary.takenCount }}/{{ adherence.summary.plannedCount }}</strong>
        <span>užitých plánovaných dávek</span>
      </div>
      <div>
        <strong>{{ adherence.summary.missedCount }}</strong>
        <span>vynechaných</span>
      </div>
      <div>
        <strong>{{ adherence.summary.upcomingCount }}</strong>
        <span>čekajících</span>
      </div>
      <div>
        <strong>{{ adherence.summary.adherencePercent === null ? "—" : `${adherence.summary.adherencePercent} %` }}</strong>
        <span>adherence uzavřených dávek</span>
      </div>
    </div>

    <ul class="list adherence-list">
      <li v-for="dose in adherence.plannedDoses" :key="dose.planItem.id">
        <div class="medication-copy">
          <strong>{{ dose.planItem.time }} - {{ dose.planItem.name }}</strong>
          <span>
            {{ dose.planItem.dose }}
            · platnost {{ dose.planItem.validFrom || "bez začátku" }} – {{ dose.planItem.validTo || "bez konce" }}
            <template v-if="dose.recordedMedication">
              · skutečně {{ dose.recordedMedication.time }}
            </template>
          </span>
        </div>

        <span :class="['adherence-status', `adherence-status-${dose.statusKey}`]">
          {{ dose.statusLabel }}
        </span>
        <button type="button" @click="emit('end-plan-item', dose.planItem.id, selectedDate)">
          Ukončit po tomto dni
        </button>
      </li>
    </ul>

    <details v-if="historicalPlanItems.length" class="plan-history">
      <summary>Ostatní verze plánu ({{ historicalPlanItems.length }})</summary>
      <ul class="list">
        <li v-for="item in historicalPlanItems" :key="item.id">
          <div class="medication-copy">
            <strong>{{ item.time }} - {{ item.name }}</strong>
            <span>{{ item.dose }} · {{ item.validFrom || "bez začátku" }} – {{ item.validTo || "bez konce" }}</span>
          </div>
        </li>
      </ul>
    </details>

    <div class="panel-heading medication-record-heading">
      <div>
        <p class="section-kicker">Aktuální den</p>
        <h3>Všechny zapsané dávky</h3>
      </div>
    </div>

    <ul class="list">
      <li v-for="medication in recordedMedications" :key="medication.id">
        <div class="medication-copy">
          <strong>{{ medication.time }} - {{ medication.name }}</strong>
          <span>{{ medication.dose }}</span>
          <span>
            Plan {{ getRecordedMedicationDetail(medication).plannedTime }}
            · skutečně {{ getRecordedMedicationDetail(medication).actualTime }}
            · zapsáno {{ getRecordedMedicationDetail(medication).recordedAt }}
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
