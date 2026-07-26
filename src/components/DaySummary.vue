<script setup>
import { computed } from "vue";
import { HOUR_STATES, formatOverallStatus, formatSleepQuality, getStateDefinition } from "../domain/diary.js";
import { analyzeEntry, analyzePeriod, buildMetricSeries, buildStateDistribution } from "../services/statistics.js";
import { evaluateDayQuality } from "../services/dataQuality.js";

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
const emit = defineEmits(["open-hour-matrix", "open-daily-overview"]);

const entryAnalysis = computed(() => analyzeEntry(props.entry));
const dayQuality = computed(() => evaluateDayQuality(props.entry, props.selectedDate));
const weeklyAnalysis = computed(() => analyzePeriod(props.entries, props.selectedDate, 7));
const monthlyAnalysis = computed(() => analyzePeriod(props.entries, props.selectedDate, 30));
const weeklySeries = computed(() => buildMetricSeries(props.entries, props.selectedDate, 7));
const monthlySeries = computed(() => buildMetricSeries(props.entries, props.selectedDate, 30));
const stateBreakdown = computed(() => {
  const counts = entryAnalysis.value.hourCounts;
  return [
    `D ${counts.dyskinesia ?? 0} h`,
    `ON ${counts.on ?? 0} h`,
    `MID ${counts.partial ?? 0} h`,
    `OFF ${counts.off ?? 0} h`,
    `sleep ${counts.sleep ?? 0} h`,
  ].join(" · ");
});

const weeklyStateBreakdown = computed(() => {
  const totals = weeklyAnalysis.value.totals;
  return [`D ${totals.dyskinesia} h`, `ON ${totals.on} h`, `MID ${totals.partial} h`, `OFF ${totals.off} h`].join(
    " · ",
  );
});

const distributionPanels = computed(() => [
  {
    key: "today",
    title: "Dnes",
    meta: `${HOUR_STATES.reduce((sum, state) => sum + (entryAnalysis.value.hourCounts[state.key] ?? 0), 0)} h`,
    items: buildStateDistribution(entryAnalysis.value.hourCounts),
  },
  {
    key: "week",
    title: "7 dni",
    meta: `${weeklyAnalysis.value.reliableDays}/${weeklyAnalysis.value.trackedDays} spolehlivych dni`,
    items: buildStateDistribution(weeklyAnalysis.value.totals),
  },
  {
    key: "month",
    title: "30 dni",
    meta: `${monthlyAnalysis.value.reliableDays}/${monthlyAnalysis.value.trackedDays} spolehlivych dni`,
    items: buildStateDistribution(monthlyAnalysis.value.totals),
  },
]);

const cards = computed(() => {
  const dominantState = weeklyAnalysis.value.dominantState;

  return [
    {
      title: "Hodinovy rozklad",
      value: stateBreakdown.value,
    },
    {
      title: "Leky",
      value: `${entryAnalysis.value.medicationCount} davek dnes · ${weeklyAnalysis.value.averageMedicationCount.toFixed(1)} za den / 7 dni`,
    },
    {
      title: "Prevladajici stav",
      value: entryAnalysis.value.dominantStateLabel,
    },
    {
      title: "Poslednich 7 dni",
      value:
        weeklyAnalysis.value.recordedDays > 0
          ? `${weeklyAnalysis.value.recordedDays}/${weeklyAnalysis.value.trackedDays} dni · ${weeklyStateBreakdown.value} · nejcasteji ${dominantState ? getStateDefinition(dominantState).label : "Bez dat"}`
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

function formatAverage(value) {
  return value.toFixed(1);
}

function buildBars(series, key) {
  const maxValue = Math.max(...series.map((item) => item[key]), 0);

  return series.map((item) => ({
    dateKey: item.dateKey,
    hasEntry: item.hasEntry,
    value: item[key],
    height:
      maxValue > 0 && item.hasEntry ? `${Math.max((item[key] / maxValue) * 100, 10)}%` : "4%",
  }));
}

const histogramRows = computed(() => [
  {
    key: "on",
    label: "ON hodiny",
    today: `${entryAnalysis.value.hourCounts.on ?? 0} h`,
    weekly: `${weeklyAnalysis.value.totals.on} h`,
    monthly: `${monthlyAnalysis.value.totals.on} h`,
    weeklyBars: buildBars(weeklySeries.value, "on"),
    monthlyBars: buildBars(monthlySeries.value, "on"),
  },
  {
    key: "partial",
    label: "MID hodiny",
    today: `${entryAnalysis.value.hourCounts.partial ?? 0} h`,
    weekly: `${weeklyAnalysis.value.totals.partial} h`,
    monthly: `${monthlyAnalysis.value.totals.partial} h`,
    weeklyBars: buildBars(weeklySeries.value, "partial"),
    monthlyBars: buildBars(monthlySeries.value, "partial"),
  },
  {
    key: "off",
    label: "OFF hodiny",
    today: `${entryAnalysis.value.hourCounts.off ?? 0} h`,
    weekly: `${weeklyAnalysis.value.totals.off} h`,
    monthly: `${monthlyAnalysis.value.totals.off} h`,
    weeklyBars: buildBars(weeklySeries.value, "off"),
    monthlyBars: buildBars(monthlySeries.value, "off"),
  },
  {
    key: "sleep",
    label: "Spanek",
    today: `${entryAnalysis.value.hourCounts.sleep ?? 0} h`,
    weekly: `${weeklyAnalysis.value.totals.sleep} h`,
    monthly: `${monthlyAnalysis.value.totals.sleep} h`,
    weeklyBars: buildBars(weeklySeries.value, "sleep"),
    monthlyBars: buildBars(monthlySeries.value, "sleep"),
  },
  {
    key: "medications",
    label: "Davky leku",
    today: `${entryAnalysis.value.medicationCount}`,
    weekly: `${weeklyAnalysis.value.medicationTotal} celkem · ${formatAverage(weeklyAnalysis.value.averageMedicationCount)} / den`,
    monthly: `${monthlyAnalysis.value.medicationTotal} celkem · ${formatAverage(monthlyAnalysis.value.averageMedicationCount)} / den`,
    weeklyBars: buildBars(weeklySeries.value, "medications"),
    monthlyBars: buildBars(monthlySeries.value, "medications"),
  },
]);
</script>

<template>
  <section class="panel">
    <div class="panel-heading">
      <div>
        <p class="section-kicker">Souhrn</p>
        <h2>Rychly prehled</h2>
      </div>
    </div>

    <section :class="['data-quality-card', `quality-${dayQuality.key}`]" aria-live="polite">
      <div>
        <p class="section-kicker">Kvalita dat</p>
        <h3>{{ dayQuality.label }}</h3>
        <p>{{ dayQuality.description }}</p>
        <strong>
          {{ dayQuality.recordedHourCount }}/{{ dayQuality.expectedHourCount }} ocekavanych hodin
          · {{ dayQuality.hourCoveragePercent }} %
        </strong>
      </div>
      <ul v-if="dayQuality.missingItems.length">
        <li v-for="item in dayQuality.missingItems" :key="item">{{ item }}</li>
      </ul>
      <div v-if="dayQuality.missingItems.length" class="data-quality-actions">
        <button v-if="dayQuality.missingHourLabels.length" class="ghost-button" type="button" @click="emit('open-hour-matrix')">
          Doplnit hodiny
        </button>
        <button
          v-if="!dayQuality.hasSleepQuality || !dayQuality.hasOverallStatus"
          class="ghost-button"
          type="button"
          @click="emit('open-daily-overview')"
        >
          Doplnit souhrn dne
        </button>
      </div>
    </section>

    <div class="summary">
      <div v-for="card in cards" :key="card.title" class="summary-card">
        <strong>{{ card.title }}</strong>
        <span>{{ card.value }}</span>
      </div>
    </div>

    <div class="distribution-panel">
      <div class="histogram-header">
        <strong>Rozlozeni stavu</strong>
        <span>Orientacni procentualni podil zaznamenanych hodin</span>
      </div>

      <div class="distribution-grid">
        <article v-for="panel in distributionPanels" :key="panel.key" class="distribution-card">
          <div class="distribution-card-head">
            <strong>{{ panel.title }}</strong>
            <span>{{ panel.meta }}</span>
          </div>

          <div class="distribution-list">
            <div v-for="item in panel.items" :key="`${panel.key}-${item.key}`" class="distribution-row">
              <div class="distribution-row-label">
                <span>{{ item.shortLabel }}</span>
                <small>{{ item.hours }} h</small>
              </div>
              <div class="distribution-track">
                <div
                  :class="['distribution-fill', `state-${item.key}`]"
                  :style="{ width: `${item.percent}%` }"
                />
              </div>
              <strong class="distribution-value">{{ Math.round(item.percent) }} %</strong>
            </div>
          </div>
        </article>
      </div>
    </div>

    <div class="histogram-panel">
      <div class="histogram-header">
        <strong>Histogramy trendu</strong>
        <span>Posledni tyden i posledni mesic po jednotlivych dnech</span>
      </div>

      <div class="histogram-table">
        <div class="histogram-table-head">Polozka</div>
        <div class="histogram-table-head">Dnes</div>
        <div class="histogram-table-head">7 dni</div>
        <div class="histogram-table-head">Histogram 7 dni</div>
        <div class="histogram-table-head">30 dni</div>
        <div class="histogram-table-head">Histogram 30 dni</div>

        <template v-for="row in histogramRows" :key="row.key">
          <div class="histogram-cell histogram-label">{{ row.label }}</div>
          <div class="histogram-cell">{{ row.today }}</div>
          <div class="histogram-cell">{{ row.weekly }}</div>
          <div class="histogram-cell">
            <div class="mini-histogram">
              <div
                v-for="bar in row.weeklyBars"
                :key="`${row.key}-week-${bar.dateKey}`"
                :class="['mini-bar', `state-${row.key}`, { 'is-missing': !bar.hasEntry }]"
                :title="`${bar.dateKey}: ${bar.value}`"
                :style="{ height: bar.height }"
              />
            </div>
          </div>
          <div class="histogram-cell">{{ row.monthly }}</div>
          <div class="histogram-cell">
            <div class="mini-histogram mini-histogram-month">
              <div
                v-for="bar in row.monthlyBars"
                :key="`${row.key}-month-${bar.dateKey}`"
                :class="['mini-bar', `state-${row.key}`, { 'is-missing': !bar.hasEntry }]"
                :title="`${bar.dateKey}: ${bar.value}`"
                :style="{ height: bar.height }"
              />
            </div>
          </div>
        </template>
      </div>
    </div>
  </section>
</template>
