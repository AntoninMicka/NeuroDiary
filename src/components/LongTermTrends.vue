<script setup>
import { computed, ref } from "vue";
import { analyzeLongTermTrends } from "../services/statistics.js";
import WearingOffAnalysis from "./WearingOffAnalysis.vue";
import DateNavigator from "./DateNavigator.vue";

const props = defineProps({
  entries: {
    type: Object,
    required: true,
  },
  treatmentPlan: {
    type: Array,
    required: true,
  },
  selectedDate: {
    type: String,
    required: true,
  },
});

const emit = defineEmits(["select-date"]);

const periodDays = ref(90);
const analysis = computed(() =>
  analyzeLongTermTrends(props.entries, props.treatmentPlan, props.selectedDate, periodDays.value),
);
const qualityLabel = computed(() => {
  if (analysis.value.reliableCoveragePercent < 40) {
    return "Mene nez 40 % dni ma dostatecna data — trend muze byt zavadejici.";
  }
  if (analysis.value.averageTrackedHours < 6) {
    return "Dny obsahují málo hodinových záznamů — výsledky berte orientačně.";
  }
  return "Pokryti je dostatecne pro orientacni sledovani trendu.";
});

function formatChange(value) {
  if (value === null) {
    return "nedostatek dat";
  }
  const prefix = value > 0 ? "+" : "";
  return `${prefix}${value.toFixed(1)} procentniho bodu`;
}

function formatShortDate(dateKey) {
  return new Intl.DateTimeFormat("cs-CZ", { day: "numeric", month: "numeric" }).format(
    new Date(`${dateKey}T12:00:00`),
  );
}
</script>

<template>
  <section class="panel panel-wide">
    <div class="clinical-analysis-warning" role="alert">
      <strong>Necertifikovaná analytická funkce</strong>
      <span>Trendy a wearing-off výpočty jsou pouze orientační, nejsou zdravotnickým prostředkem ani podkladem pro diagnózu či změnu léčby.</span>
    </div>
    <div class="panel-heading">
      <div>
        <p class="section-kicker">Dlouhodobé trendy</p>
        <h2>Vývoj motorických stavů</h2>
        <p class="panel-tip">{{ analysis.fromDate }} – {{ analysis.toDate }}</p>
      </div>
      <label class="trend-period-picker">
        <span>Období</span>
        <select v-model.number="periodDays">
          <option :value="30">30 dní</option>
          <option :value="90">90 dní</option>
          <option :value="180">180 dní</option>
          <option :value="365">1 rok</option>
        </select>
      </label>
    </div>

    <DateNavigator :selected-date="selectedDate" @select-date="emit('select-date', $event)" />

    <div class="trend-summary-grid">
      <article>
        <strong>{{ analysis.reliableDays }}/{{ analysis.days }}</strong>
        <span>spolehlivých dní · {{ analysis.reliableCoveragePercent }} %</span>
      </article>
      <article>
        <strong>{{ analysis.averageTrackedHours.toFixed(1) }} h</strong>
        <span>průměrně zaznamenáno za aktivní den</span>
      </article>
      <article>
        <strong>{{ formatChange(analysis.onChange) }}</strong>
        <span>změna podílu ON ve druhé polovině</span>
      </article>
      <article>
        <strong>{{ formatChange(analysis.offChange) }}</strong>
        <span>změna podílu OFF ve druhé polovině</span>
      </article>
    </div>

    <p :class="['trend-quality-note', { 'is-warning': analysis.reliableCoveragePercent < 40 || analysis.averageTrackedHours < 6 }]">
      {{ qualityLabel }}
    </p>

    <div class="trend-chart">
      <div class="trend-chart-legend">
        <span class="state-on">ON</span>
        <span class="state-partial">MID</span>
        <span class="state-off">OFF</span>
        <span class="state-dyskinesia">D</span>
        <span class="state-sleep">Spánek</span>
      </div>

      <div class="trend-week-list">
        <article v-for="bucket in analysis.buckets" :key="bucket.fromDate" class="trend-week-row">
          <div class="trend-week-label">
            <strong>{{ formatShortDate(bucket.fromDate) }}–{{ formatShortDate(bucket.toDate) }}</strong>
            <span>{{ bucket.reliableDays }}/{{ bucket.dayCount }} spolehlivých dní · {{ bucket.trackedHours }} h</span>
          </div>
          <div class="trend-stacked-bar" :title="`${bucket.trackedHours} zaznamenaných hodin`">
            <span
              v-for="item in bucket.distribution"
              :key="`${bucket.fromDate}-${item.key}`"
              :class="`state-${item.key}`"
              :style="{ width: `${item.percent}%` }"
            />
            <span v-if="bucket.trackedHours === 0" class="trend-empty-bar">Bez dat</span>
          </div>
          <div class="trend-week-meta">
            <span>{{ bucket.medicationCount }} dávek</span>
            <strong>{{ bucket.adherencePercent === null ? "—" : `${bucket.adherencePercent} %` }}</strong>
          </div>
        </article>
      </div>
      <p class="panel-tip">
        Procento vpravo je orientační adherence podle léčebného plánu platného v daném týdnu.
      </p>
    </div>

    <WearingOffAnalysis
      :entries="entries"
      :treatment-plan="treatmentPlan"
      :selected-date="selectedDate"
      :days="periodDays"
    />
  </section>
</template>
