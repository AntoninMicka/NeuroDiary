<script setup>
import { computed } from "vue";
import { formatOverallStatus, formatSleepQuality, getStateDefinition } from "../domain/diary.js";

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
      title: "Leky",
      value: `${props.entry.medications.length} zapsanych davek`,
    },
    {
      title: "Prevladajici stav",
      value: dominantState ? getStateDefinition(dominantState).label : "Bez dat",
    },
    {
      title: "Spanek a poznamky",
      value: `${formatSleepQuality(props.entry.sleepQuality)}, ${formatOverallStatus(props.entry.overallStatus)}, ${
        props.entry.notes.trim() ? "poznamky vyplneny" : "bez poznamek"
      }`,
    },
  ];
});
</script>

<template>
  <section class="panel">
    <div class="panel-heading">
      <div>
        <p class="section-kicker">Souhrn</p>
        <h2>Rychly prehled</h2>
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
