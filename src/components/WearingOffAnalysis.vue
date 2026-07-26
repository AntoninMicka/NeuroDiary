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
        <h2>Opakovane zhorseni kolem davek</h2>
        <p class="panel-tip">
          Orientacni pozorovani z dostatecnych a kompletnich dni. Nejde o diagnozu ani doporuceni ke zmene lecby.
        </p>
      </div>
    </div>

    <div class="trend-summary-grid">
      <article>
        <strong>{{ analysis.reliableDays }}/{{ analysis.days }}</strong>
        <span>spolehlivych dni</span>
      </article>
      <article>
        <strong>{{ analysis.evaluatedDoses }}</strong>
        <span>davek s daty pred uzitim</span>
      </article>
      <article>
        <strong>{{ formatPercent(analysis.candidatePercent) }}</strong>
        <span>kandidatu na wearing-off</span>
      </article>
      <article>
        <strong>{{ formatResponse(analysis.medianResponseMinutes) }}</strong>
        <span>median do prvniho ON/dyskineze po davce</span>
      </article>
    </div>

    <p v-if="!analysis.hasEnoughData" class="trend-quality-note is-warning">
      Pro stabilnejsi interpretaci je potreba alespon 7 spolehlivych dni a 5 davek s hodinovymi daty pred uzitim.
    </p>

    <div v-if="analysis.groups.length" class="wearing-off-table">
      <div class="wearing-off-table-head">Planovana davka</div>
      <div class="wearing-off-table-head">Zhorseni pred davkou</div>
      <div class="wearing-off-table-head">Kandidat po ON/dyskinezi</div>
      <div class="wearing-off-table-head">Navrat do ON/dyskineze</div>

      <template v-for="group in analysis.groups" :key="group.key">
        <div>
          <strong>{{ group.time }} · {{ group.name }}</strong>
          <span>{{ group.dose }}</span>
        </div>
        <div>
          <strong>{{ formatPercent(group.worseningPercent) }}</strong>
          <span>{{ group.worseningCount }}/{{ group.evaluatedCount }} pozorovani</span>
        </div>
        <div>
          <strong>{{ formatPercent(group.candidatePercent) }}</strong>
          <span>{{ group.candidateCount }}/{{ group.evaluatedCount }} pozorovani</span>
        </div>
        <div>
          <strong>{{ formatResponse(group.medianResponseMinutes) }}</strong>
          <span>{{ group.responseSampleCount }} mereni</span>
        </div>
      </template>
    </div>
    <p v-else class="panel-tip">Ve zvolenem obdobi nejsou vyhodnotitelne planovane davky.</p>

    <div v-if="analysis.recurringHours.length" class="wearing-off-patterns">
      <h3>Opakujici se denni doby se zhorsenim</h3>
      <ul class="list">
        <li v-for="pattern in analysis.recurringHours" :key="pattern.hourLabel">
          <strong>{{ pattern.hourLabel }}:00</strong>
          <span>
            MID/OFF v {{ pattern.worseningPercent }} % zaznamenanych dni
            · ciste OFF {{ pattern.offPercent }} %
            · {{ pattern.observedDays }} pozorovani
          </span>
        </li>
      </ul>
    </div>

    <p class="panel-tip wearing-off-method">
      Kandidat znamena, ze se v poslednich 2 hodinach pred planovanou davkou objevil MID/OFF a v predchozich
      4 hodinach byl zaznamenan ON nebo dyskineze. Navrat po davce se odhaduje z hodinovych zaznamu,
      proto ma presnost priblizne jednu hodinu.
    </p>
  </section>
</template>
