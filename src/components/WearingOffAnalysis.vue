<script setup>
import { computed } from "vue";
import { analyzeWearingOff } from "../services/wearingOff.js";

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
  days: {
    type: Number,
    required: true,
  },
});

const analysis = computed(() =>
  analyzeWearingOff({
    entries: props.entries,
    treatmentPlan: props.treatmentPlan,
    endDateKey: props.selectedDate,
    days: props.days,
  }),
);

function formatPercent(value) {
  return value === null ? "—" : `${value} %`;
}

function formatResponse(value) {
  return value === null ? "—" : `${value} min`;
}
</script>

<template>
  <section class="wearing-off-panel">
    <div class="panel-heading">
      <div>
        <p class="section-kicker">Wearing-off</p>
        <h2>Opakované zhoršení kolem dávek</h2>
        <p class="panel-tip">
          Orientační pozorování z dostatečných a kompletních dní. Nejde o diagnózu ani doporučení ke změně léčby.
        </p>
      </div>
    </div>

    <div class="trend-summary-grid">
      <article>
        <strong>{{ analysis.reliableDays }}/{{ analysis.days }}</strong>
        <span>spolehlivých dní</span>
      </article>
      <article>
        <strong>{{ analysis.evaluatedDoses }}</strong>
        <span>dávek s daty před užitím</span>
      </article>
      <article>
        <strong>{{ formatPercent(analysis.candidatePercent) }}</strong>
        <span>kandidátů na wearing-off</span>
      </article>
      <article>
        <strong>{{ formatResponse(analysis.medianResponseMinutes) }}</strong>
        <span>medián do prvního ON/dyskineze po dávce</span>
      </article>
    </div>

    <p v-if="!analysis.hasEnoughData" class="trend-quality-note is-warning">
      Pro stabilnější interpretaci je potřeba alespoň 7 spolehlivých dní a 5 dávek s hodinovými daty před užitím.
    </p>

    <div v-if="analysis.groups.length" class="wearing-off-table">
      <div class="wearing-off-table-head">Plánovaná dávka</div>
      <div class="wearing-off-table-head">Zhoršení před dávkou</div>
      <div class="wearing-off-table-head">Kandidát po ON/dyskinezi</div>
      <div class="wearing-off-table-head">Návrat do ON/dyskineze</div>

      <template v-for="group in analysis.groups" :key="group.key">
        <div>
          <strong>{{ group.time }} · {{ group.name }}</strong>
          <span>{{ group.dose }}</span>
        </div>
        <div>
          <strong>{{ formatPercent(group.worseningPercent) }}</strong>
          <span>{{ group.worseningCount }}/{{ group.evaluatedCount }} pozorování</span>
        </div>
        <div>
          <strong>{{ formatPercent(group.candidatePercent) }}</strong>
          <span>{{ group.candidateCount }}/{{ group.evaluatedCount }} pozorování</span>
        </div>
        <div>
          <strong>{{ formatResponse(group.medianResponseMinutes) }}</strong>
          <span>{{ group.responseSampleCount }} měření</span>
        </div>
      </template>
    </div>
    <p v-else class="panel-tip">Ve zvoleném období nejsou vyhodnotitelné plánované dávky.</p>

    <div v-if="analysis.recurringHours.length" class="wearing-off-patterns">
      <h3>Opakující se denní doby se zhoršením</h3>
      <ul class="list">
        <li v-for="pattern in analysis.recurringHours" :key="pattern.hourLabel">
          <strong>{{ pattern.hourLabel }}:00</strong>
          <span>
            MID/OFF v {{ pattern.worseningPercent }} % zaznamenaných dní
            · čistě OFF {{ pattern.offPercent }} %
            · {{ pattern.observedDays }} pozorování
          </span>
        </li>
      </ul>
    </div>

    <p class="panel-tip wearing-off-method">
      Kandidát znamená, že se v posledních 2 hodinách před plánovanou dávkou objevil MID/OFF a v předchozích
      4 hodinách byl zaznamenán ON nebo dyskineze. Návrat po dávce se odhaduje z hodinových záznamů,
      proto má přesnost přibližně jednu hodinu.
    </p>
  </section>
</template>
