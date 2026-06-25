<script setup>
import { computed } from "vue";

const props = defineProps({
  entry: {
    type: Object,
    required: true,
  },
});

const cards = computed(() => {
  const counts = Object.values(props.entry.hours).reduce((accumulator, item) => {
    accumulator[item] = (accumulator[item] ?? 0) + 1;
    return accumulator;
  }, {});

  const dominantState = Object.entries(counts).sort((left, right) => right[1] - left[1])[0]?.[0];

  return [
    {
      title: "Medication moments",
      value: `${props.entry.medications.length} planned doses`,
    },
    {
      title: "Dominant state",
      value: `${dominantState ? dominantState.toUpperCase() : "N/A"} for most hours`,
    },
    {
      title: "Sleep and notes",
      value: `${props.entry.sleepQuality} sleep, ${props.entry.overallStatus} day, ${
        props.entry.notes.trim() ? "notes filled in" : "no notes yet"
      }`,
    },
  ];
});
</script>

<template>
  <section class="panel">
    <div class="panel-heading">
      <div>
        <p class="section-kicker">Snapshot</p>
        <h2>Quick summary</h2>
      </div>
    </div>

    <div class="summary">
      <div v-for="card in cards" :key="card.title" class="summary-card">
        <strong>{{ card.title }}</strong>
        <span>{{ card.value }}</span>
      </div>
    </div>
  </section>
</template>
