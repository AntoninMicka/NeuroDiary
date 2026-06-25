<script setup>
import { HOUR_STATES } from "../domain/diary.js";

defineProps({
  hours: {
    type: Object,
    required: true,
  },
});

const emit = defineEmits(["cycle-hour"]);

function labelFor(stateKey) {
  return HOUR_STATES.find((item) => item.key === stateKey)?.label ?? stateKey;
}
</script>

<template>
  <section class="panel panel-wide">
    <div class="panel-heading">
      <div>
        <p class="section-kicker">Hourly matrix</p>
        <h2>Symptoms through the day</h2>
      </div>
      <p class="panel-tip">Tap each hour to cycle through states.</p>
    </div>

    <div class="hour-grid">
      <button
        v-for="(stateKey, label) in hours"
        :key="label"
        class="hour-card"
        :class="`state-${stateKey}`"
        type="button"
        @click="emit('cycle-hour', label)"
      >
        <span class="hour-label">{{ label }}</span>
        <span class="hour-state">{{ labelFor(stateKey) }}</span>
      </button>
    </div>
  </section>
</template>
