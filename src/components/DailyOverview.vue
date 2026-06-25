<script setup>
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
        <p class="section-kicker">Daily diary</p>
        <h2>Day overview</h2>
      </div>
    </div>

    <form class="day-form">
      <label>
        <span>Sleep quality</span>
        <select
          :value="props.modelValue.sleepQuality"
          @input="patchEntry('sleepQuality', $event.target.value)"
        >
          <option value="poor">Poor</option>
          <option value="mixed">Mixed</option>
          <option value="good">Good</option>
        </select>
      </label>

      <label>
        <span>Overall day</span>
        <select
          :value="props.modelValue.overallStatus"
          @input="patchEntry('overallStatus', $event.target.value)"
        >
          <option value="hard">Hard day</option>
          <option value="stable">Stable day</option>
          <option value="good">Good day</option>
        </select>
      </label>

      <label class="notes-field">
        <span>Notes</span>
        <textarea
          :value="props.modelValue.notes"
          rows="4"
          placeholder="Examples: stiffness after lunch, tremor improved after walk..."
          @input="patchEntry('notes', $event.target.value)"
        />
      </label>
    </form>
  </section>
</template>
