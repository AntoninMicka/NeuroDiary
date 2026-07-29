<script setup>
import { computed } from "vue";
import { formatLongDate, getStateDefinition, getTodayKey, TRACKING_HOURS } from "../domain/diary.js";
import { ADHERENCE_TOLERANCE_MINUTES, analyzeMedicationAdherence } from "../services/adherence.js";
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
  days: {
    type: Number,
    default: 7,
  },
  compact: {
    type: Boolean,
    default: false,
  },
  treatmentPlan: {
    type: Array,
    default: () => [],
  },
  currentTime: {
    type: Date,
    default: () => new Date(),
  },
});

const emit = defineEmits(["select-date"]);
const todayKey = getTodayKey();
const isTodaySelected = computed(() => props.selectedDate === todayKey);
const timeToMinutes = (value) => {
  const [hours, minutes] = String(value ?? "").split(":").map(Number);
  return hours * 60 + minutes;
};

const axisLabels = computed(() =>
  TRACKING_HOURS.map((label, index) => ({
    label,
    emphasize: index % 3 === 0,
  })),
);

const rows = computed(() =>
  getPeriodDateKeys(props.selectedDate, props.days)
    .reverse()
    .map((dateKey) => {
      const entry = props.entries[dateKey];
      const analysis = entry ? analyzeEntry(entry) : null;
      const adherence = analyzeMedicationAdherence({
        treatmentPlan: props.treatmentPlan,
        recordedMedications: entry?.medications ?? [],
        selectedDate: dateKey,
        todayDate: todayKey,
        now: props.currentTime,
      });
      const medicationMarkers = [
        ...adherence.plannedDoses.map((dose) => {
          const medication = dose.recordedMedication ?? dose.planItem;
          let displayStatus = "taken";
          if (!dose.recordedMedication && dose.statusKey === "missed") {
            displayStatus = "missed";
          } else if (!dose.recordedMedication) {
            const difference = timeToMinutes(dose.planItem.time)
              - (props.currentTime.getHours() * 60 + props.currentTime.getMinutes());
            displayStatus = Math.abs(difference) <= ADHERENCE_TOLERANCE_MINUTES ? "due" : "planned";
          }
          return {
            id: dose.planItem.id,
            hourLabel: String(Number(medication.time.split(":")[0])),
            status: displayStatus,
            title: `${medication.time} · ${medication.name} · ${medication.dose}`,
          };
        }),
        ...adherence.unplannedDoses.map((medication) => ({
          id: medication.id,
          hourLabel: String(Number(medication.time.split(":")[0])),
          status: "taken",
          title: `${medication.time} · ${medication.name} · ${medication.dose}`,
        })),
      ];

      return {
        dateKey,
        entry,
        isSelected: dateKey === props.selectedDate,
        longDate: formatLongDate(dateKey),
        dominantStateLabel: analysis?.dominantStateLabel ?? "Bez dat",
        medicationSummary: entry?.medications?.map((item) => item.time).join(" · ") ?? "",
        medications: entry?.medications ?? [],
        medicationHours: TRACKING_HOURS.map((hourLabel) => ({
          hourLabel,
          markers: medicationMarkers.filter((marker) => marker.hourLabel === hourLabel),
        })),
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
  <section :class="['panel', 'panel-wide', { 'timeline-compact': compact }]">
    <div class="panel-heading">
      <div>
        <p class="section-kicker">Casova osa</p>
        <h2>Denni casova osa</h2>
      </div>
      <div class="timeline-toolbar">
        <p class="panel-tip">
          {{ days === 1 ? "Aktualni den." : `Poslednich ${days} dni vcetne vybraneho dne. Klik na radek prepne denik.` }}
        </p>
        <button
          :class="['ghost-button', 'timeline-today-button', { 'is-active': isTodaySelected }]"
          v-if="!compact"
          type="button"
          @click="emit('select-date', todayKey)"
        >
          Dnes
        </button>
      </div>
    </div>
    <div v-if="compact" class="timeline-medication-legend" aria-label="Stav planovanych davek">
      <span><i class="is-taken"></i> Uzito</span>
      <span><i class="is-due"></i> Vzit nyni</span>
      <span><i class="is-missed"></i> Zapomenuto</span>
      <span><i class="is-planned"></i> Planovano</span>
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
        :tabindex="compact ? -1 : 0"
        @click="!compact && emit('select-date', row.dateKey)"
      >
        <div v-if="!compact" class="timeline-date-block">
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
          <span
            v-if="compact"
            v-for="medicationHour in row.medicationHours"
            :key="`${row.dateKey}-medication-${medicationHour.hourLabel}`"
            class="timeline-medication-cell"
          >
            <span
              v-for="marker in medicationHour.markers"
              :key="marker.id"
              :class="['timeline-medication-marker', `is-${marker.status}`]"
              :title="marker.title"
            ></span>
          </span>
        </div>
      </button>
    </div>
  </section>
</template>
