<script setup>
import { computed } from "vue";
import {
  formatLongDate,
  getStateDefinition,
  getTodayKey,
  HOUR_STATES,
  shiftDateKey,
} from "../domain/diary.js";

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
  selectedDate: {
    type: String,
    required: true,
  },
});

const emit = defineEmits([
  "update-hour",
  "update-current-hour-label",
  "update-selected-state-key",
  "write-current-state",
  "select-date",
]);

const todayKey = getTodayKey();
const isEditable = computed(() => props.selectedDate === todayKey);
const selectedDateLabel = computed(() => formatLongDate(props.selectedDate));
const canGoForward = computed(() => props.selectedDate < todayKey);
</script>

<template>
  <section class="panel panel-wide">
    <div class="panel-heading">
      <div>
        <p class="section-kicker">Hodinova matice</p>
        <h2>Hodnoceni vlastniho stavu hybnosti</h2>
        <p class="panel-tip">{{ selectedDateLabel }}</p>
      </div>
      <p class="panel-tip">
        {{
          isEditable
            ? "Vyber stav z menu nebo ho zapis tlacitkem do aktualni hodiny."
            : "Pro jiny den je matice jen pro cteni. Pro upravu se vrat na dnesni datum."
        }}
      </p>
    </div>

    <div class="matrix-date-toolbar">
      <button class="ghost-button" type="button" @click="emit('select-date', shiftDateKey(props.selectedDate, -1))">
        Predchozi den
      </button>
      <label class="matrix-date-picker">
        <span>Zobrazeny den</span>
        <input
          :value="props.selectedDate"
          type="date"
          :max="todayKey"
          @input="emit('select-date', $event.target.value)"
        />
      </label>
      <button class="ghost-button" type="button" :disabled="!canGoForward" @click="emit('select-date', shiftDateKey(props.selectedDate, 1))">
        Dalsi den
      </button>
      <button class="ghost-button" type="button" :disabled="props.selectedDate === todayKey" @click="emit('select-date', todayKey)">
        Dnes
      </button>
    </div>

    <div class="capture-bar">
      <label>
        <span>Aktualni hodina</span>
        <select
          :value="props.currentHourLabel"
          :disabled="!isEditable"
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
          :disabled="!isEditable"
          @input="emit('update-selected-state-key', $event.target.value)"
        >
          <option v-for="state in HOUR_STATES" :key="state.key" :value="state.key">
            {{ state.label }}
          </option>
        </select>
      </label>

      <button class="primary-button" type="button" :disabled="!isEditable" @click="emit('write-current-state')">
        Zapsat aktualni stav
      </button>
    </div>

    <p v-if="!isEditable" class="matrix-readonly-note">
      Zobrazen je historicky den. V tomto rezimu nejsou povolene zmeny.
    </p>

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
          :disabled="!isEditable"
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
