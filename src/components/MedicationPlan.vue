<script setup>
import { reactive } from "vue";

const props = defineProps({
  medications: {
    type: Array,
    required: true,
  },
});

const emit = defineEmits(["add-medication", "remove-medication"]);

const form = reactive({
  name: "",
  dose: "",
  time: "08:00",
});

function submitForm() {
  if (!form.name.trim() || !form.dose.trim() || !form.time) {
    return;
  }

  emit("add-medication", { ...form });
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

      <button class="primary-button" type="submit">Pridat lecivo</button>
    </form>

    <ul class="list">
      <li v-for="medication in medications" :key="medication.id">
        <div class="medication-copy">
          <strong>{{ medication.time }} - {{ medication.name }}</strong>
          <span>{{ medication.dose }}</span>
        </div>

        <button type="button" @click="emit('remove-medication', medication.id)">Odebrat</button>
      </li>
    </ul>
  </section>
</template>
