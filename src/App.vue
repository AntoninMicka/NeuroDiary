<script setup>
import { computed, reactive, watch } from "vue";
import DailyOverview from "./components/DailyOverview.vue";
import MedicationPlan from "./components/MedicationPlan.vue";
import HourMatrix from "./components/HourMatrix.vue";
import DaySummary from "./components/DaySummary.vue";
import {
  HOUR_STATES,
  createMedication,
  ensureEntry,
  formatLongDate,
  loadState,
  resetState,
  saveState,
} from "./services/diaryStore.js";

const state = reactive(loadState());

const selectedEntry = computed(() => ensureEntry(state, state.selectedDate));
const selectedDateLabel = computed(() => formatLongDate(state.selectedDate));
const sortedMedications = computed(() =>
  [...selectedEntry.value.medications].sort((left, right) => left.time.localeCompare(right.time)),
);

watch(
  state,
  () => {
    saveState(state);
  },
  { deep: true },
);

function updateSelectedDate(dateKey) {
  state.selectedDate = dateKey;
  ensureEntry(state, dateKey);
}

function updateEntry(nextEntry) {
  state.entries[state.selectedDate] = {
    ...state.entries[state.selectedDate],
    ...nextEntry,
  };
}

function addMedication(payload) {
  selectedEntry.value.medications.push(createMedication(payload));
}

function removeMedication(medicationId) {
  selectedEntry.value.medications = selectedEntry.value.medications.filter(
    (item) => item.id !== medicationId,
  );
}

function cycleHour(label) {
  const currentIndex = HOUR_STATES.findIndex((item) => item.key === selectedEntry.value.hours[label]);
  const nextState = HOUR_STATES[(currentIndex + 1) % HOUR_STATES.length];
  selectedEntry.value.hours[label] = nextState.key;
}

function resetDemo() {
  const fresh = resetState();
  Object.assign(state, fresh);
}
</script>

<template>
  <div class="shell">
    <header class="hero">
      <div>
        <p class="eyebrow">Vue prototype</p>
        <h1>NeuroDiary</h1>
        <p class="lede">
          A structured offline diary for daily symptom tracking, medication timing, and rapid
          trend review.
        </p>
      </div>

      <div class="hero-card">
        <p class="hero-label">Selected day</p>
        <p class="hero-date">{{ selectedDateLabel }}</p>
        <button class="ghost-button" type="button" @click="resetDemo">Reset demo data</button>
      </div>
    </header>

    <main class="grid">
      <section class="panel panel-wide">
        <div class="panel-heading">
          <div>
            <p class="section-kicker">Navigation</p>
            <h2>Choose a diary day</h2>
          </div>
          <label class="date-picker">
            <span>Date</span>
            <input
              :value="state.selectedDate"
              type="date"
              @input="updateSelectedDate($event.target.value)"
            />
          </label>
        </div>
      </section>

      <MedicationPlan
        :medications="sortedMedications"
        @add-medication="addMedication"
        @remove-medication="removeMedication"
      />

      <DailyOverview :model-value="selectedEntry" @patch-entry="updateEntry" />
      <DaySummary :entry="selectedEntry" />
      <HourMatrix :hours="selectedEntry.hours" @cycle-hour="cycleHour" />
    </main>
  </div>
</template>
