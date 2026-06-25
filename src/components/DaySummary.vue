<script setup>
import { computed } from "vue";
import { formatOverallStatus, formatSleepQuality, getStateDefinition } from "../domain/diary.js";
import { analyzeEntry, analyzePeriod } from "../services/statistics.js";

const props = defineProps({
  entry: {
    type: Object,
    required: true,
  },
  entries: {
    type: Object,
    required: true,
  },
  selectedDate: {
    type: String,
    required: true,
  },
});

const entryAnalysis = computed(() => analyzeEntry(props.entry));
const periodAnalysis = computed(() => analyzePeriod(props.entries, props.selectedDate, 7));
const stateBreakdown = computed(() => {
  const counts = entryAnalysis.value.hourCounts;
  return [
    `ON ${counts.on ?? 0} h`,
    `MID ${counts.partial ?? 0} h`,
    `OFF ${counts.off ?? 0} h`,
    `sleep ${counts.sleep ?? 0} h`,
  ].join(" · ");
});

const weeklyStateBreakdown = computed(() => {
  const totals = periodAnalysis.value.totals;
  return [`ON ${totals.on} h`, `MID ${totals.partial} h`, `OFF ${totals.off} h`].join(" · ");
});

const cards = computed(() => {
  const dominantState = periodAnalysis.value.dominantState;

  return [
    {
      title: "Hodinovy rozklad",
      value: stateBreakdown.value,
    },
    {
      title: "Leky",
      value: `${entryAnalysis.value.medicationCount} davek dnes · ${periodAnalysis.value.averageMedicationCount.toFixed(1)} za den / 7 dni`,
    },
    {
      title: "Prevladajici stav",
      value: entryAnalysis.value.dominantStateLabel,
    },
    {
      title: "Poslednich 7 dni",
      value:
        periodAnalysis.value.recordedDays > 0
          ? `${periodAnalysis.value.recordedDays}/${periodAnalysis.value.trackedDays} dni · ${weeklyStateBreakdown.value} · nejcasteji ${dominantState ? getStateDefinition(dominantState).label : "Bez dat"}`
          : "Zatim bez zaznamenaneho tydne",
    },
    {
      title: "Spanek a poznamky",
      value: `${formatSleepQuality(props.entry.sleepQuality)}, ${formatOverallStatus(props.entry.overallStatus)}, ${
        entryAnalysis.value.noteStatus
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
