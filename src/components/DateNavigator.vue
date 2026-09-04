<script setup>
import { computed } from "vue";
import { getTodayKey, shiftDateKey } from "../domain/diary.js";

const props = defineProps({
  selectedDate: {
    type: String,
    required: true,
  },
  allowDelete: {
    type: Boolean,
    default: false,
  },
});

const emit = defineEmits(["select-date", "delete-date"]);
const todayKey = getTodayKey();
const canGoForward = computed(() => props.selectedDate < todayKey);
</script>

<template>
  <div class="matrix-date-toolbar panel-date-navigator">
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
    <button v-if="allowDelete" class="ghost-button utility-menu-item-danger" type="button" @click="emit('delete-date')">
      Vynuceně smazat tento den
    </button>
  </div>
</template>
