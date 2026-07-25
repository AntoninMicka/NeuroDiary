<script setup>
import { computed, reactive, ref } from "vue";
import { getTodayKey } from "../domain/diary.js";
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
});

const emit = defineEmits(["add-plan-item", "remove-plan-item", "remove-recorded-medication"]);

const form = reactive({
  name: "",
  dose: "",
  time: "08:00",
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

function submitForm() {
  const validation = validateMedicationInput(form);
  Object.keys(errors).forEach((field) => delete errors[field]);
  Object.assign(errors, validation.errors);
  formMessage.value = "";
  if (!validation.isValid) {
    return;
  }

  const duplicateKey = buildMedicationDuplicateKey(validation.value);
  if (props.treatmentPlan.some((item) => buildMedicationDuplicateKey(item) === duplicateKey)) {
    formMessage.value = "Stejna davka se stejnym casem uz v planu existuje.";
    return;
  }

  emit("add-plan-item", validation.value);
  form.name = "";
  form.dose = "";
  form.time = "08:00";
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

      <button class="primary-button" type="submit">Pridat do planu</button>
      <p v-if="formMessage" class="form-error" role="alert">{{ formMessage }}</p>
    </form>

    <p class="panel-tip">Plan slouzi jako sablona. Skutecne uzitou davku zapisete rychlym zapisem s aktualnim casem.</p>

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
            <template v-if="dose.recordedMedication">
              · skutecne {{ dose.recordedMedication.time }}
            </template>
          </span>
        </div>

        <span :class="['adherence-status', `adherence-status-${dose.statusKey}`]">
          {{ dose.statusLabel }}
        </span>
        <button type="button" @click="emit('remove-plan-item', dose.planItem.id)">Odebrat z planu</button>
      </li>
    </ul>

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
        </div>

        <button type="button" @click="emit('remove-recorded-medication', medication.id)">Odebrat</button>
      </li>
    </ul>
  </section>
</template>
