<script setup>
import { reactive, ref } from "vue";
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
});

const emit = defineEmits(["add-plan-item", "remove-plan-item", "remove-recorded-medication"]);

const form = reactive({
  name: "",
  dose: "",
  time: "08:00",
});
const errors = reactive({});
const formMessage = ref("");

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

    <ul class="list">
      <li v-for="medication in treatmentPlan" :key="medication.id">
        <div class="medication-copy">
          <strong>{{ medication.time }} - {{ medication.name }}</strong>
          <span>{{ medication.dose }}</span>
        </div>

        <button type="button" @click="emit('remove-plan-item', medication.id)">Odebrat</button>
      </li>
    </ul>

    <div class="panel-heading medication-record-heading">
      <div>
        <p class="section-kicker">Aktualni den</p>
        <h3>Zapsane davky</h3>
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
