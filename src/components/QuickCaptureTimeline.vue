<script setup>
import { computed, nextTick, onMounted, ref, watch } from "vue";
import {
  QUICK_CAPTURE_WINDOW_MS,
  TIMELINE_STEP_MINUTES,
  roundDownToTimelineStep,
} from "../services/quickCapture.js";

const props = defineProps({
  modelValue: { type: Date, required: true },
  currentTime: { type: Date, required: true },
});
const emit = defineEmits(["update:model-value"]);
const track = ref(null);

const points = computed(() => {
  const newest = roundDownToTimelineStep(props.currentTime);
  const oldest = new Date(newest.getTime() - QUICK_CAPTURE_WINDOW_MS);
  const result = [];
  for (let time = oldest.getTime(); time <= newest.getTime(); time += TIMELINE_STEP_MINUTES * 60_000) {
    const date = new Date(time);
    result.push({
      timestamp: time,
      date,
      label: date.toTimeString().slice(0, 5),
      major: date.getMinutes() % 15 === 0,
    });
  }
  return result;
});

const selectedTimestamp = computed(() => roundDownToTimelineStep(props.modelValue).getTime());

function select(date) {
  emit("update:model-value", new Date(date));
}

function scrollSelectedIntoView(behavior = "smooth") {
  nextTick(() => {
    track.value
      ?.querySelector(`[data-time="${selectedTimestamp.value}"]`)
      ?.scrollIntoView({ behavior, inline: "center", block: "nearest" });
  });
}

function goToNow() {
  select(roundDownToTimelineStep(props.currentTime));
  scrollSelectedIntoView();
}

watch(selectedTimestamp, () => scrollSelectedIntoView());
onMounted(() => scrollSelectedIntoView("auto"));
</script>

<template>
  <section class="capture-timeline" aria-label="Volba času zpětného zápisu">
    <div class="capture-timeline-heading">
      <div>
        <span>Vybraný čas</span>
        <strong>{{ modelValue.toTimeString().slice(0, 5) }}</strong>
      </div>
      <button class="ghost-button" type="button" @click="goToNow">Teď</button>
    </div>
    <div ref="track" class="capture-timeline-track">
      <button
        v-for="point in points"
        :key="point.timestamp"
        :data-time="point.timestamp"
        :class="['capture-time-point', { 'is-major': point.major, 'is-selected': point.timestamp === selectedTimestamp }]"
        type="button"
        :aria-label="`Vybrat ${point.label}`"
        :aria-pressed="point.timestamp === selectedTimestamp"
        @click="select(point.date)"
      >
        <span>{{ point.major ? point.label : "" }}</span>
        <i></i>
      </button>
    </div>
  </section>
</template>
