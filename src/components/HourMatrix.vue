<script setup>
import { HOUR_STATES, getStateDefinition } from "../domain/diary.js";

const props = defineProps({
  hours: {
    type: Object,
    required: true,
  },
  currentHourLabel: {
    type: String,
    required: true,
  },
  selectedStateKey: {
    type: String,
    required: true,
  },
});

const emit = defineEmits([
  "update-hour",
  "update-current-hour-label",
  "update-selected-state-key",
  "write-current-state",
]);
</script>

<template>
  <section class="panel panel-wide">
    <div class="panel-heading">
      <div>
        <p class="section-kicker">Hodinova matice</p>
        <h2>Hodnoceni vlastniho stavu hybnosti</h2>
      </div>
      <p class="panel-tip">Vyber stav z menu nebo ho zapis tlacitkem do aktualni hodiny.</p>
    </div>

    <div class="capture-bar">
      <label>
        <span>Aktualni hodina</span>
        <select
          :value="props.currentHourLabel"
          @input="emit('update-current-hour-label', $event.target.value)"
        >
          <option v-for="hourLabel in Object.keys(props.hours)" :key="hourLabel" :value="hourLabel">
            {{ hourLabel }}
          </option>
        </select>
      </label>

      <label>
        <span>Aktualni stav</span>
        <select
          :value="props.selectedStateKey"
          @input="emit('update-selected-state-key', $event.target.value)"
        >
          <option v-for="state in HOUR_STATES" :key="state.key" :value="state.key">
            {{ state.label }}
          </option>
        </select>
      </label>

      <button class="primary-button" type="button" @click="emit('write-current-state')">
        Zapsat aktualni stav
      </button>
    </div>

    <div class="legend-card">
      <p class="legend-title">Legenda</p>
      <ul class="legend-list">
        <li v-for="state in HOUR_STATES" :key="state.key">
          <strong>{{ state.shortLabel }}</strong> {{ state.label }}
        </li>
      </ul>
    </div>

    <div class="hour-grid">
      <label
        v-for="(stateKey, label) in hours"
        :key="label"
        class="hour-card"
        :class="`state-${stateKey}`"
      >
        <span class="hour-label">{{ label }}</span>
        <select
          class="hour-select"
          :value="stateKey"
          @input="emit('update-hour', { label, stateKey: $event.target.value })"
        >
          <option v-for="state in HOUR_STATES" :key="state.key" :value="state.key">
            {{ state.shortLabel }} · {{ state.label }}
          </option>
        </select>
        <span class="hour-state">{{ getStateDefinition(stateKey).shortLabel }}</span>
      </label>
    </div>
  </section>
</template>
