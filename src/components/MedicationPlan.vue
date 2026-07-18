<script setup>
import { reactive } from "vue";

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

function submitForm() {
  if (!form.name.trim() || !form.dose.trim() || !form.time) {
    return;
  }

  emit("add-plan-item", { ...form });
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
        <input v-model="form.name" type="text" placeholder="Levodopa" />
      </label>

      <label>
        <span>Davka</span>
        <input v-model="form.dose" type="text" placeholder="100 mg" />
      </label>

      <label>
        <span>Cas</span>
        <input v-model="form.time" type="time" />
      </label>

      <button class="primary-button" type="submit">Pridat do planu</button>
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
