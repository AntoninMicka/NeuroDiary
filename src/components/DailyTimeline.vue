<script setup>
import { computed } from "vue";
import { formatLongDate, getStateDefinition, TRACKING_HOURS } from "../domain/diary.js";
import { analyzeEntry, getPeriodDateKeys } from "../services/statistics.js";

const props = defineProps({
  entries: {
    type: Object,
    required: true,
  },
  selectedDate: {
    type: String,
    required: true,
  },
});

const emit = defineEmits(["select-date"]);

const axisLabels = computed(() =>
  TRACKING_HOURS.map((label, index) => ({
    label,
    emphasize: index % 3 === 0,
  })),
);

const rows = computed(() =>
  getPeriodDateKeys(props.selectedDate, 7)
    .reverse()
    .map((dateKey) => {
      const entry = props.entries[dateKey];
      const analysis = entry ? analyzeEntry(entry) : null;

      return {
        dateKey,
        entry,
        isSelected: dateKey === props.selectedDate,
        longDate: formatLongDate(dateKey),
        dominantStateLabel: analysis?.dominantStateLabel ?? "Bez dat",
        medicationSummary: entry?.medications?.map((item) => item.time).join(" · ") ?? "",
        medications: entry?.medications ?? [],
        hours: TRACKING_HOURS.map((hourLabel) => {
          const stateKey = entry?.hours?.[hourLabel] ?? null;
          return {
            hourLabel,
            stateKey,
            shortLabel: stateKey ? getStateDefinition(stateKey).shortLabel : "",
            title: stateKey
              ? `${hourLabel}:00 · ${getStateDefinition(stateKey).label}`
              : `${hourLabel}:00 · bez dat`,
          };
        }),
      };
    }),
);
</script>

<template>
  <section class="panel panel-wide">
    <div class="panel-heading">
      <div>
        <p class="section-kicker">Casova osa</p>
        <h2>Denni casova osa</h2>
      </div>
      <p class="panel-tip">Poslednich 7 dni vcetne vybraneho dne. Klik na radek prepne denik.</p>
    </div>

    <div class="timeline-axis">
      <div class="timeline-axis-spacer"></div>
      <div class="timeline-axis-spacer"></div>
      <div class="timeline-axis-hours">
        <span
          v-for="item in axisLabels"
          :key="item.label"
          :class="['timeline-axis-hour', { 'is-emphasized': item.emphasize }]"
        >
          {{ item.label }}
        </span>
      </div>
    </div>

    <div class="timeline-list">
      <button
        v-for="row in rows"
        :key="row.dateKey"
        :class="['timeline-row', { 'is-selected': row.isSelected }]"
        type="button"
        @click="emit('select-date', row.dateKey)"
      >
        <div class="timeline-date-block">
          <strong>{{ row.longDate }}</strong>
          <span>{{ row.dateKey }}</span>
        </div>

        <div class="timeline-meta">
          <strong>{{ row.dominantStateLabel }}</strong>
          <span v-if="row.entry">{{ row.medications.length }} davek · {{ row.medicationSummary }}</span>
          <span v-else>Bez zaznamu</span>
        </div>

        <div class="timeline-hours">
          <span
            v-for="hour in row.hours"
            :key="`${row.dateKey}-${hour.hourLabel}`"
            :class="['timeline-hour-cell', hour.stateKey ? `state-${hour.stateKey}` : 'is-empty']"
            :title="hour.title"
          >
            {{ hour.shortLabel }}
          </span>
        </div>
      </button>
    </div>
  </section>
</template>
