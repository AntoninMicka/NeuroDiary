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
  hourRecords: {
    type: Object,
    required: true,
  },
  selectedDate: {
    type: String,
    required: true,
  },
  currentTime: {
    type: Date,
    required: true,
  },
});

const emit = defineEmits(["update-hour", "select-date"]);

const todayKey = getTodayKey();
const editableHourLabels = computed(() => {
  const oldestAllowed = props.currentTime.getTime() - 10 * 60 * 60 * 1000;
  return new Set(Object.keys(props.hours).filter((label) => {
    const hourStart = new Date(`${props.selectedDate}T${String(label).padStart(2, "0")}:00:00`);
    const timestamp = hourStart.getTime();
    return Number.isFinite(timestamp)
      && timestamp + 60 * 60 * 1000 > oldestAllowed
      && timestamp <= props.currentTime.getTime();
  }));
});
const isEditable = computed(() => editableHourLabels.value.size > 0);
const isHourEditable = (label) => editableHourLabels.value.has(label);
const selectedDateLabel = computed(() => formatLongDate(props.selectedDate));
const canGoForward = computed(() => props.selectedDate < todayKey);
</script>

<template>
  <section class="panel panel-wide">
    <div class="panel-heading">
      <div>
        <p class="section-kicker">Hodinová matice</p>
        <h2>Hodnocení vlastního stavu hybnosti</h2>
        <p class="panel-tip">{{ selectedDateLabel }}</p>
      </div>
      <p class="panel-tip">
        {{
          isEditable
            ? "Upravit lze hodiny spadající do posledních 10 hodin."
            : "Tento den už nespadá do desetihodinového okna a je jen pro čtení."
        }}
      </p>
    </div>

    <div class="matrix-date-toolbar">
      <button class="ghost-button" type="button" @click="emit('select-date', shiftDateKey(props.selectedDate, -1))">
        Předchozí den
      </button>
      <label class="matrix-date-picker">
        <span>Zobrazený den</span>
        <input
          :value="props.selectedDate"
          type="date"
          :max="todayKey"
          @input="emit('select-date', $event.target.value)"
        />
      </label>
      <button class="ghost-button" type="button" :disabled="!canGoForward" @click="emit('select-date', shiftDateKey(props.selectedDate, 1))">
        Další den
      </button>
      <button class="ghost-button" type="button" :disabled="props.selectedDate === todayKey" @click="emit('select-date', todayKey)">
        Dnes
      </button>
    </div>

    <p v-if="!isEditable" class="matrix-readonly-note">
      Zobrazený den nemá žádnou hodinu v povoleném desetihodinovém okně.
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
        :class="[stateKey ? `state-${stateKey}` : 'is-empty', { 'is-readonly': !isHourEditable(label) }]"
      >
        <span class="hour-label">{{ label }}</span>
        <select
          class="hour-select"
          :value="stateKey ?? ''"
          :disabled="!isHourEditable(label)"
          @input="emit('update-hour', { label, stateKey: $event.target.value })"
        >
          <option value="">Bez dat</option>
          <option v-for="state in HOUR_STATES" :key="state.key" :value="state.key">
            {{ state.shortLabel }} · {{ state.label }}
          </option>
        </select>
        <span class="hour-state">
          {{ stateKey ? getStateDefinition(stateKey).shortLabel : "—" }}
          <template v-if="(props.hourRecords?.[label]?.length ?? 0) > 1">
            · {{ props.hourRecords[label].length }}x
          </template>
        </span>
      </label>
    </div>
  </section>
</template>
