<script setup>
import { UNDEFINED_ENTRY_VALUE } from "../domain/diary.js";

const props = defineProps({
  modelValue: {
    type: Object,
    required: true,
  },
});

const emit = defineEmits(["patch-entry"]);

function patchEntry(field, value) {
  emit("patch-entry", {
    [field]: value,
  });
}
</script>

<template>
  <section class="panel panel-wide">
    <div class="panel-heading">
      <div>
        <p class="section-kicker">Denní záznam</p>
        <h2>Přehled dne</h2>
      </div>
    </div>

    <form class="day-form">
      <label>
        <span>Kvalita spánku</span>
        <select
          :value="props.modelValue.sleepQuality"
          @input="patchEntry('sleepQuality', $event.target.value)"
        >
          <option :value="UNDEFINED_ENTRY_VALUE">Nedefinováno</option>
          <option value="poor">Špatná</option>
          <option value="mixed">Proměnlivá</option>
          <option value="good">Dobrá</option>
        </select>
      </label>

      <label>
        <span>Celkový den</span>
        <select
          :value="props.modelValue.overallStatus"
          @input="patchEntry('overallStatus', $event.target.value)"
        >
          <option :value="UNDEFINED_ENTRY_VALUE">Nedefinováno</option>
          <option value="hard">Náročný den</option>
          <option value="stable">Stabilní den</option>
          <option value="good">Dobrý den</option>
        </select>
      </label>

      <label class="notes-field">
        <span>Poznámky</span>
        <textarea
          :value="props.modelValue.notes"
          rows="4"
          maxlength="5000"
          placeholder="Například: ztuhlost po obědě, třes lepší po procházce…"
          @input="patchEntry('notes', $event.target.value)"
        />
      </label>
    </form>
  </section>
</template>
